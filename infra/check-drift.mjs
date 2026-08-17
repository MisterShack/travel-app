#!/usr/bin/env node
/**
 * Asserts the Railway settings Terraform cannot own (PLAN-V2 §4 step 3).
 *
 *   node infra/check-drift.mjs
 *
 * Needs a Railway API token and the project id:
 *
 *   RAILWAY_API_TOKEN   an account or team token (railway.com → Account → Tokens)
 *   RAILWAY_TOKEN       alternatively, a project token
 *   RAILWAY_PROJECT_ID  the project's UUID, from its URL
 *   RAILWAY_ENVIRONMENT_NAME  optional, defaults to "production"
 *   RAILWAY_SERVICE_NAME      optional, defaults to "travel-app"
 *
 * Exit codes, and the distinction is the whole point:
 *
 *   0  every assertion held (warnings may still have been printed)
 *   1  drift — a setting is wrong, and the output says which and why
 *   2  the check could not run: no token, no network, or the API's schema has
 *      moved under us
 *
 * **2 is never reported as 0.** A checker that says "OK" when it inspected
 * nothing is worse than no checker, because it converts an unknown into a
 * false assurance — which is the exact failure this file was written against.
 *
 * What has been verified, and what has not (2026-08-17):
 *
 * All three queries were sent to the live API and **validate against its
 * schema** — GraphQL checks the whole document before executing, so the errors
 * that came back were "Project not found" and "Not Authorized" rather than
 * "Cannot query field". Every field and argument named here exists.
 *
 * Not verified, because this was written on a machine with no Railway token:
 * the runtime *shape* of the responses, and that an account token carries the
 * permissions these need. If either is wrong the first real run exits 2 saying
 * so. It cannot quietly succeed.
 */
import {
  PROJECT_QUERY,
  SERVICE_INSTANCE_QUERY,
  VARIABLES_QUERY,
  selectTarget,
  backupsEnabled,
  checkDrift,
  hasFailure,
  FAIL,
} from './drift.mjs';

const ENDPOINT = 'https://backboard.railway.com/graphql/v2';

const CANNOT_CHECK = 2;
const DRIFT = 1;

/** Thrown for anything that means "we did not manage to look", never "it is wrong". */
class CannotCheck extends Error {}

async function graphql(query, variables, headers) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new CannotCheck(`Could not reach ${ENDPOINT}: ${error.message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CannotCheck(
      `Railway rejected the token (${response.status}). Check RAILWAY_API_TOKEN is current and` +
        ' has access to this project.',
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new CannotCheck(`Railway returned ${response.status}: ${text.slice(0, 400)}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new CannotCheck(`Railway returned a non-JSON body: ${text.slice(0, 200)}`);
  }

  /**
   * GraphQL reports a bad field name in `errors` with HTTP 200, so this is the
   * branch that catches the API moving under us. Surfaced verbatim: "Cannot
   * query field X on type Y" is the actionable form, and a summarised version
   * of it is not.
   */
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const messages = body.errors.map((e) => e?.message ?? JSON.stringify(e)).join('; ');
    throw new CannotCheck(
      `Railway's API returned an error: ${messages}\n\n` +
        "  If this names a field, the API's schema has changed since infra/drift.mjs was" +
        ' written. Fix the query there — do not assume the setting is fine.',
    );
  }

  return body.data;
}

function required(name, ...alternatives) {
  for (const key of [name, ...alternatives]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  throw new CannotCheck(`${name} is not set. See the header of infra/check-drift.mjs.`);
}

async function main() {
  const projectId = required('RAILWAY_PROJECT_ID');
  const environmentName = process.env['RAILWAY_ENVIRONMENT_NAME']?.trim() || 'production';
  const serviceName = process.env['RAILWAY_SERVICE_NAME']?.trim() || 'travel-app';

  /**
   * Account tokens authenticate as `Bearer`; project tokens use their own
   * header. Supporting both means the check runs from a laptop and from CI
   * without either needing the other's credential.
   */
  const accountToken = process.env['RAILWAY_API_TOKEN']?.trim();
  const projectToken = process.env['RAILWAY_TOKEN']?.trim();
  if (!accountToken && !projectToken) {
    throw new CannotCheck(
      'Neither RAILWAY_API_TOKEN nor RAILWAY_TOKEN is set. See the header of' +
        ' infra/check-drift.mjs.',
    );
  }
  const headers = accountToken
    ? { authorization: `Bearer ${accountToken}` }
    : { 'project-access-token': projectToken };

  const projectData = await graphql(PROJECT_QUERY, { id: projectId }, headers);

  /**
   * A project, environment or service that cannot be found is "we did not
   * manage to look", not "the settings are wrong" — so it exits 2 with the
   * names the API did return, rather than a stack trace.
   */
  let target;
  try {
    target = selectTarget(projectData?.project, environmentName, serviceName);
  } catch (error) {
    throw new CannotCheck(error.message);
  }
  const { environment, service, mountPaths } = target;

  const instanceData = await graphql(
    SERVICE_INSTANCE_QUERY,
    { serviceId: service.id, environmentId: environment.id },
    headers,
  );
  const instance = instanceData?.serviceInstance;
  if (!instance) {
    throw new CannotCheck(
      `Railway returned no serviceInstance for service "${serviceName}" in "${environmentName}".`,
    );
  }

  /**
   * The variables are read only to learn whether a bucket is set, and failing
   * to read them is not failing the check — it downgrades one finding to
   * "could not determine" rather than pretending either answer. A token scoped
   * without variable access should still get the other three assertions.
   */
  let backups = null;
  try {
    const variableData = await graphql(
      VARIABLES_QUERY,
      { projectId, environmentId: environment.id, serviceId: service.id },
      headers,
    );
    backups = backupsEnabled(variableData?.variables);
  } catch (error) {
    console.warn(`  note: could not read variables (${error.message.split('\n')[0]})\n`);
  }

  const findings = checkDrift({
    mountPaths,
    startCommand: instance.startCommand,
    watchPatterns: instance.watchPatterns,
    numReplicas: instance.numReplicas,
    backups,
  });

  report({ projectName: projectData.project.name, environmentName, serviceName, findings });
  return hasFailure(findings) ? DRIFT : 0;
}

function report({ projectName, environmentName, serviceName, findings }) {
  console.log(`Railway drift check — ${projectName} / ${environmentName} / ${serviceName}\n`);

  if (findings.length === 0) {
    console.log('  OK  volume mounted at /data');
    console.log('  OK  no custom Start Command, so the image ENTRYPOINT runs');
    console.log('  OK  no Watch Paths, so every push deploys');
    console.log('  OK  numReplicas is 1');
    console.log('\nNo drift.');
    return;
  }

  for (const finding of findings) {
    console.log(`  ${finding.level === FAIL ? 'FAIL' : 'WARN'}  ${finding.title}`);
    console.log(`        ${finding.detail}`);
    console.log(`        → ${finding.doc}\n`);
  }

  console.log(
    hasFailure(findings)
      ? 'Drift found. Each line above names the setting and what it costs.'
      : 'No failures. The warnings above are known deviations — read them before assuming they' +
          ' are still acceptable.',
  );
}

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof CannotCheck) {
    console.error(`Could not check: ${error.message}`);
    console.error('\nThis is not a pass. Nothing was verified.');
    process.exitCode = CANNOT_CHECK;
  } else {
    console.error(error);
    process.exitCode = CANNOT_CHECK;
  }
}
