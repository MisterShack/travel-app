/**
 * The drift check's logic, with no I/O in it (PLAN-V2 §4 step 3).
 *
 * Terraform cannot own the three settings that have actually gone wrong on this
 * deployment — the volume mount path, the Start Command and the Watch Paths are
 * all absent from the community Railway provider (PLAN-V2 §2a). This file is
 * the answer to that: not "describe the infrastructure", but "assert the four
 * things whose silent misconfiguration destroys data or stops deploys".
 *
 * Everything here is a pure function over a plain object. The network lives in
 * `check-drift.mjs`, so the rules can be tested against fixtures without a
 * Railway token — the same reason the Svix webhook was implemented directly
 * rather than through an SDK.
 */

/** Findings are ordered by how much damage the setting does when it is wrong. */
export const FAIL = 'fail';
export const WARN = 'warn';

/**
 * The project, its environments, its services and its volume mounts, in one
 * round trip. Volumes hang off the *project* rather than the service, and a
 * volume's mount path lives on the `volumeInstance` — the per-environment
 * attachment — not on the volume itself.
 */
export const PROJECT_QUERY = `query Project($id: String!) {
  project(id: $id) {
    id
    name
    environments { edges { node { id name } } }
    services { edges { node { id name } } }
    volumes {
      edges {
        node {
          id
          name
          volumeInstances {
            edges { node { id mountPath serviceId environmentId } }
          }
        }
      }
    }
  }
}`;

/**
 * The deploy settings for one service in one environment. `startCommand`,
 * `watchPatterns` and `numReplicas` are all properties of the *serviceInstance*
 * rather than the service, because Railway lets them differ per environment.
 */
export const SERVICE_INSTANCE_QUERY = `query ServiceInstance($serviceId: String!, $environmentId: String!) {
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    id
    startCommand
    watchPatterns
    numReplicas
    healthcheckPath
    latestDeployment {
      id
      meta
    }
  }
}`;

/**
 * The replica count the running deployment actually used.
 *
 * `serviceInstance.numReplicas` is only the *dashboard override* and is `null`
 * whenever nobody has typed a number into the dashboard — which is the case
 * here, while `railway.json` supplies `numReplicas: 1` at deploy time. Reading
 * the override alone therefore reports drift on a service that is behaving
 * correctly, which is exactly the "fails on its first run" trap `infra/README.md`
 * warns about.
 *
 * The deployment's own manifest is the authoritative record of what was applied.
 * `fileServiceManifest` is the manifest as read from `railway.json`;
 * `serviceManifest` is the merged result. Preferring the merged one means an
 * override typed into the dashboard still wins, as it does at deploy time.
 *
 * Returns `null` when nothing observable says anything — which the rule must
 * still treat as a failure rather than assuming 1.
 */
export function manifestNumReplicas(latestDeployment) {
  const meta = latestDeployment?.meta;
  if (!meta || typeof meta !== 'object') return null;
  for (const key of ['serviceManifest', 'fileServiceManifest']) {
    const value = meta[key]?.deploy?.numReplicas;
    if (typeof value === 'number') return value;
  }
  return null;
}

/**
 * Variable *names* only.
 *
 * The response is a map of name to value and the values are secrets — the
 * Resend key, the Gemini key, the VAPID private key. Nothing in this tool ever
 * prints a value or returns one to a caller; `backupsEnabled` below reduces the
 * whole map to a single boolean at the first opportunity, so a value cannot
 * reach a log line by accident later.
 */
export const VARIABLES_QUERY = `query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}`;

/** Unwraps Railway's `{ edges: [{ node }] }` connections into plain arrays. */
export function nodes(connection) {
  if (!connection || !Array.isArray(connection.edges)) return [];
  return connection.edges.map((edge) => edge?.node).filter((node) => node != null);
}

/**
 * Picks the environment and service to check, by name.
 *
 * Asking the operator for three UUIDs would make this tedious enough not to be
 * run, and a check nobody runs is worth nothing. They give a project id; the
 * names resolve here, where they are testable.
 *
 * A name that matches nothing is an error rather than a skipped check — the
 * failure mode this whole file exists to prevent is a green result that
 * inspected nothing.
 */
export function selectTarget(project, environmentName, serviceName) {
  if (!project) throw new Error('The API returned no project. Check RAILWAY_PROJECT_ID.');

  const environments = nodes(project.environments);
  const services = nodes(project.services);

  const environment = environments.find((e) => e.name === environmentName);
  if (!environment) {
    throw new Error(
      `No environment named "${environmentName}" in project "${project.name}".` +
        ` Found: ${environments.map((e) => e.name).join(', ') || '(none)'}`,
    );
  }

  const service = services.find((s) => s.name === serviceName);
  if (!service) {
    throw new Error(
      `No service named "${serviceName}" in project "${project.name}".` +
        ` Found: ${services.map((s) => s.name).join(', ') || '(none)'}` +
        `. Set RAILWAY_SERVICE_NAME if it is not the default.`,
    );
  }

  /**
   * Mount paths for *this* service in *this* environment. A volume attached to
   * another service, or to a staging environment, says nothing about whether
   * this one keeps its database across a deploy.
   */
  const mountPaths = nodes(project.volumes)
    .flatMap((volume) => nodes(volume.volumeInstances))
    .filter((vi) => vi.serviceId === service.id && vi.environmentId === environment.id)
    .map((vi) => vi.mountPath);

  return { environment, service, mountPaths };
}

/**
 * Whether Litestream is configured to replicate anywhere.
 *
 * Takes the variable map and returns a boolean immediately, so no secret value
 * survives past this line. `LITESTREAM_BUCKET` is the one that turns
 * replication on: `entrypoint.sh` warns and starts anyway without it
 * (DEPLOY.md §5).
 */
export function backupsEnabled(variables) {
  if (variables == null || typeof variables !== 'object') return null;
  const bucket = variables['LITESTREAM_BUCKET'];
  return typeof bucket === 'string' && bucket.trim() !== '';
}

/**
 * The four assertions, plus the coupling between two of them.
 *
 * `observed` is `{ mountPaths, startCommand, watchPatterns, numReplicas,
 * manifestReplicas, backups }`, where `backups` is true, false, or null for
 * "could not read the variables" and `manifestReplicas` is the replica count the
 * running deployment actually applied. Returns a list of findings; an empty list
 * is a pass.
 */
export function checkDrift(observed) {
  const findings = [];
  const { mountPaths, startCommand, watchPatterns, numReplicas, manifestReplicas, backups } =
    observed;

  /**
   * 1. The volume, mounted at `/data`.
   *
   * DEPLOY.md §2: mounting it anywhere else works perfectly and silently
   * discards every account and trip on each deploy. With `LITESTREAM_BUCKET`
   * unset there is no replica either, so this is the single setting standing
   * between the app and total data loss.
   */
  if (mountPaths.length === 0) {
    findings.push({
      level: FAIL,
      id: 'volume-missing',
      title: 'No volume is mounted on this service',
      detail:
        'The database lives on the container filesystem, which Railway replaces on every' +
        ' deploy. Every account and trip is lost at the next deploy, and with LITESTREAM_BUCKET' +
        ' unset there is no replica to restore from.',
      doc: 'DEPLOY.md §2',
    });
  } else if (!mountPaths.includes('/data')) {
    findings.push({
      level: FAIL,
      id: 'volume-mount-path',
      title: `Volume is mounted at ${mountPaths.join(', ')}, not /data`,
      detail:
        'The app writes to /data/travel.db. A volume mounted elsewhere works perfectly and' +
        ' silently discards every account and trip on each deploy — the app is healthy' +
        ' throughout, which is what makes this the most dangerous setting on the service.',
      doc: 'DEPLOY.md §2',
    });
  }

  /**
   * 2. The Start Command, which must be empty so the image's ENTRYPOINT runs.
   *
   * This is the one assertion PLAN-V2 §4 states flatly that cannot be made
   * flatly, because the deployment violates it *on purpose* — though the reason
   * turned out not to survive investigation. The 2026-08-15 crash that justified
   * the Start Command was the missing RESEND_API_KEY, misattributed: the deploy
   * history holds exactly two failures, both of commit f47f418 and both before
   * the key was set, and the deploy of the very commit that documented the
   * "Start Command trap" succeeded (DEPLOY.md §5). The waiver below stays only
   * because the command is still set, not because clearing it is still feared.
   *
   * A check that fails from its first run is a check people learn to ignore,
   * and this project has already written down what that costs — "an app that
   * cries wolf gets ignored, and is then worse than silent" (PLAN-V3 §4, on
   * conflict detection). So the finding is graded by the thing that actually
   * makes it dangerous: whether a bucket is set. Harmless today; catastrophic
   * the moment backups are turned on, because every variable would be present,
   * the dashboard would look configured, the app would be healthy, and nothing
   * would replicate.
   */
  const hasStartCommand = typeof startCommand === 'string' && startCommand.trim() !== '';
  if (hasStartCommand && backups === true) {
    findings.push({
      level: FAIL,
      id: 'start-command-overrides-entrypoint',
      title: 'Backups are configured but a custom Start Command is stopping them',
      detail:
        `The Start Command (${startCommand.trim()}) overrides the image's ENTRYPOINT, so` +
        ' entrypoint.sh never runs and Litestream never starts. LITESTREAM_BUCKET is set, so' +
        ' this looks configured and is replicating nothing. Clear the Start Command, then prove' +
        ' replication with `litestream snapshots` — an empty result means it is still not' +
        ' running, whatever the variables say.',
      doc: 'DEPLOY.md §5, §6',
    });
  } else if (hasStartCommand && backups === false) {
    findings.push({
      level: WARN,
      id: 'start-command-waived',
      title: 'A custom Start Command overrides the ENTRYPOINT (known, and harmless for now)',
      detail:
        `The Start Command (${startCommand.trim()}) means entrypoint.sh never runs, so` +
        ' Litestream cannot start. That costs nothing while LITESTREAM_BUCKET is unset, which it' +
        ' is. This becomes a hard failure the moment a bucket is set. The 2026-08-15 crash that' +
        ' justified keeping it was the missing RESEND_API_KEY, misattributed, and the key has' +
        ' been set ever since — so there is no known reason clearing it should fail. Capture the' +
        ' logs while it redeploys anyway; not doing that is what cost eight days.',
      doc: 'DEPLOY.md §5',
    });
  } else if (hasStartCommand && backups === null) {
    findings.push({
      level: WARN,
      id: 'start-command-unknown-backups',
      title: 'A custom Start Command is set and the backup setting could not be read',
      detail:
        'Whether this is harmless or critical depends on LITESTREAM_BUCKET, which this run could' +
        ' not read. Check it by hand before trusting this result.',
      doc: 'DEPLOY.md §5',
    });
  }

  /**
   * 3. Watch Paths, which must be empty.
   *
   * Set wrong, Railway silently skips deploys: the push succeeds, the dashboard
   * is green, and the running code is whatever it was before. This cost
   * budget-app a day, and the symptom is indistinguishable from a change that
   * did not work.
   */
  const patterns = Array.isArray(watchPatterns) ? watchPatterns.filter((p) => p !== '') : [];
  if (patterns.length > 0) {
    findings.push({
      level: FAIL,
      id: 'watch-paths-set',
      title: `Watch Paths are set (${patterns.join(', ')})`,
      detail:
        'Railway will skip deploys for pushes that touch nothing matching these patterns. The' +
        ' push succeeds and the dashboard is green while the running code stays as it was, which' +
        ' is indistinguishable from a change that did not work. This repo expects every push to' +
        ' deploy.',
      doc: 'DEPLOY.md §8',
    });
  }

  /**
   * 4. Exactly one replica.
   *
   * PLAN.md §4 and §7 both depend on it. Two processes would mean two writers on
   * one SQLite file, two independent in-memory rate limiters, and two reminder
   * sweeps racing to send the same notification — the sweep claims rows before
   * sending, which makes a second process a duplicate-send risk rather than an
   * impossibility.
   */
  const effectiveReplicas = numReplicas ?? manifestReplicas ?? null;

  if (effectiveReplicas !== 1) {
    findings.push({
      level: FAIL,
      id: 'num-replicas',
      title: `numReplicas is ${effectiveReplicas === null ? 'unset' : effectiveReplicas}, not 1`,
      detail:
        'Two processes mean two writers on one SQLite file, two in-memory rate limiters, and two' +
        ' reminder sweeps racing to send the same notification. The whole app is designed around' +
        ' there being exactly one.',
      doc: 'PLAN.md §4, §7',
    });
  } else if (numReplicas == null) {
    /**
     * Correct today, and resting on a mechanism with a sunset date.
     *
     * The single replica comes from `railway.json`, which Railway deprecated in
     * favour of `.railway/railway.ts` — existing files keep working only until
     * 2026-12-01. When it stops being honoured the effective value falls back to
     * the dashboard override, which is unset, and the guarantee this whole app is
     * designed around disappears without anything failing loudly.
     */
    findings.push({
      level: WARN,
      id: 'num-replicas-from-file-only',
      title: 'The single replica comes from railway.json, which is deprecated',
      detail:
        'numReplicas is 1 in the deployed manifest but unset on the service itself, so the' +
        ' guarantee rests entirely on railway.json. Railway has deprecated Config as Code and' +
        ' existing files stop being honoured after 2026-12-01, at which point this falls back to' +
        ' the unset dashboard value. Set it explicitly on the service, or migrate to' +
        ' .railway/railway.ts.',
      doc: 'PLAN-V2 §2a, infra/README.md',
    });
  }

  return findings;
}

/** True when anything found is bad enough to fail the run. */
export function hasFailure(findings) {
  return findings.some((f) => f.level === FAIL);
}
