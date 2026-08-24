/**
 * The drift rules, against fixtures.
 *
 * Run by `node --test infra/`, with no dependency and no network — the rules
 * are pure functions precisely so the machine that cannot reach Railway can
 * still prove they are right. What these cannot prove is that the GraphQL
 * queries name real fields; only a run with a token does that, and the runner
 * exits 2 rather than 0 if they do not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkDrift,
  hasFailure,
  selectTarget,
  backupsEnabled,
  manifestNumReplicas,
  manifestSetting,
  manifestBuilder,
  manifestHealthcheckPath,
  manifestRestartPolicy,
  nodes,
  FAIL,
  WARN,
} from './drift.mjs';

/** The deployment as it is meant to look, with backups still off. */
const healthy = {
  mountPaths: ['/data'],
  startCommand: null,
  watchPatterns: [],
  numReplicas: 1,
  backups: false,
  healthcheckPath: '/health',
  manifestHealthcheck: '/health',
  builder: 'DOCKERFILE',
  restartPolicy: 'ON_FAILURE',
};

const ids = (findings) => findings.map((f) => f.id);

test('a correct deployment produces no findings at all', () => {
  assert.deepEqual(checkDrift(healthy), []);
  assert.equal(hasFailure(checkDrift(healthy)), false);
});

test('an empty string Start Command counts as no Start Command', () => {
  // Railway returns "" rather than null when a command has been cleared, and
  // reporting drift on a setting the operator has already fixed is how a check
  // loses its credibility.
  assert.deepEqual(checkDrift({ ...healthy, startCommand: '   ' }), []);
});

test('a volume mounted anywhere but /data fails', () => {
  const findings = checkDrift({ ...healthy, mountPaths: ['/app/data'] });
  assert.deepEqual(ids(findings), ['volume-mount-path']);
  assert.equal(findings[0].level, FAIL);
  assert.match(findings[0].title, /\/app\/data/);
});

test('no volume at all fails, and says the database is on ephemeral storage', () => {
  const findings = checkDrift({ ...healthy, mountPaths: [] });
  assert.deepEqual(ids(findings), ['volume-missing']);
  assert.equal(findings[0].level, FAIL);
});

test('Watch Paths being set fails and names them', () => {
  const findings = checkDrift({ ...healthy, watchPatterns: ['server/**'] });
  assert.deepEqual(ids(findings), ['watch-paths-set']);
  assert.match(findings[0].title, /server\/\*\*/);
});

test('an empty-string watch pattern is not a watch path', () => {
  assert.deepEqual(checkDrift({ ...healthy, watchPatterns: [''] }), []);
});

test('more than one replica fails', () => {
  const findings = checkDrift({ ...healthy, numReplicas: 2 });
  assert.deepEqual(ids(findings), ['num-replicas']);
  assert.match(findings[0].detail, /two reminder sweeps/);
});

test('a missing numReplicas fails rather than being assumed to be 1', () => {
  const findings = checkDrift({ ...healthy, numReplicas: null });
  assert.deepEqual(ids(findings), ['num-replicas']);
  assert.match(findings[0].title, /unset/);
});

/**
 * The Start Command grading — the reason this file is not a flat list of
 * assertions. The deployment violates the rule deliberately today, so a flat
 * assertion would fail from its first run and be ignored by its third.
 */
test('a custom Start Command with backups off warns but does not fail', () => {
  const findings = checkDrift({ ...healthy, startCommand: 'npm run start' });
  assert.deepEqual(ids(findings), ['start-command-waived']);
  assert.equal(findings[0].level, WARN);
  assert.equal(hasFailure(findings), false, 'a known, harmless deviation must not fail the run');
});

test('the same Start Command becomes a failure once a bucket is set', () => {
  const findings = checkDrift({ ...healthy, startCommand: 'npm run start', backups: true });
  assert.deepEqual(ids(findings), ['start-command-overrides-entrypoint']);
  assert.equal(findings[0].level, FAIL);
  assert.equal(hasFailure(findings), true);
  assert.match(findings[0].detail, /replicating nothing/);
});

test('unreadable variables downgrade the Start Command finding rather than guessing', () => {
  const findings = checkDrift({ ...healthy, startCommand: 'npm run start', backups: null });
  assert.deepEqual(ids(findings), ['start-command-unknown-backups']);
  assert.equal(findings[0].level, WARN);
});

test('no Start Command means backups being on is not a finding', () => {
  assert.deepEqual(checkDrift({ ...healthy, backups: true }), []);
});

test('several wrong settings are all reported, not just the first', () => {
  // Built from scratch rather than spread from `healthy`, because the point is
  // a deployment where everything is wrong at once — including, now, a
  // healthcheck nobody configured.
  const findings = checkDrift({
    mountPaths: [],
    startCommand: 'npm run start',
    watchPatterns: ['app/**'],
    numReplicas: 3,
    backups: true,
  });
  assert.deepEqual(ids(findings), [
    'volume-missing',
    'start-command-overrides-entrypoint',
    'watch-paths-set',
    'num-replicas',
    'healthcheck-missing',
  ]);
});

test('every finding carries a pointer to the document that explains it', () => {
  const findings = checkDrift({
    mountPaths: ['/mnt'],
    startCommand: 'x',
    watchPatterns: ['y'],
    numReplicas: 0,
    backups: true,
  });
  for (const finding of findings) {
    assert.ok(finding.doc, `${finding.id} has no doc pointer`);
    assert.ok(finding.detail.length > 40, `${finding.id} explains nothing`);
  }
});

test('backupsEnabled reads only presence, and reports null when it cannot read', () => {
  assert.equal(backupsEnabled({ LITESTREAM_BUCKET: 'waypoint-backups' }), true);
  assert.equal(backupsEnabled({ LITESTREAM_BUCKET: '' }), false);
  assert.equal(backupsEnabled({ RESEND_API_KEY: 'secret' }), false);
  assert.equal(backupsEnabled(null), null);
  assert.equal(backupsEnabled(undefined), null);
});

test('nodes unwraps a connection and tolerates an absent one', () => {
  assert.deepEqual(nodes({ edges: [{ node: { id: 'a' } }, { node: null }] }), [{ id: 'a' }]);
  assert.deepEqual(nodes(null), []);
  assert.deepEqual(nodes({}), []);
});

/** A project shaped the way the API returns one. */
const project = {
  id: 'p1',
  name: 'waypoint',
  environments: { edges: [{ node: { id: 'e1', name: 'production' } }] },
  services: { edges: [{ node: { id: 's1', name: 'travel-app' } }] },
  volumes: {
    edges: [
      {
        node: {
          id: 'v1',
          name: 'data',
          volumeInstances: {
            edges: [{ node: { id: 'vi1', mountPath: '/data', serviceId: 's1', environmentId: 'e1' } }],
          },
        },
      },
    ],
  },
};

test('selectTarget resolves the environment, service and its mount paths', () => {
  const { environment, service, mountPaths } = selectTarget(project, 'production', 'travel-app');
  assert.equal(environment.id, 'e1');
  assert.equal(service.id, 's1');
  assert.deepEqual(mountPaths, ['/data']);
});

test('a volume on another service or environment is not counted as this one', () => {
  const shared = structuredClone(project);
  shared.volumes.edges[0].node.volumeInstances.edges = [
    { node: { id: 'vi1', mountPath: '/data', serviceId: 'other', environmentId: 'e1' } },
    { node: { id: 'vi2', mountPath: '/data', serviceId: 's1', environmentId: 'staging' } },
  ];
  // Both look like a correctly mounted volume and neither belongs to this
  // deployment. Counting either would report a volume that is not there.
  assert.deepEqual(selectTarget(shared, 'production', 'travel-app').mountPaths, []);
});

test('an unknown environment or service throws rather than checking nothing', () => {
  assert.throws(() => selectTarget(project, 'staging', 'travel-app'), /No environment named/);
  assert.throws(() => selectTarget(project, 'production', 'api'), /No service named/);
  assert.throws(() => selectTarget(null, 'production', 'travel-app'), /no project/);
});

test('the error for a wrong name lists the names that do exist', () => {
  assert.throws(() => selectTarget(project, 'prod', 'travel-app'), /Found: production/);
});

test('a replica count that only railway.json supplies passes, but warns about the sunset', () => {
  // The real production shape as of 2026-08-23: nobody typed a number into the
  // dashboard, so the override is null, and railway.json supplies 1 at deploy
  // time. Behaviour is correct, so this must not fail — but the guarantee rests
  // on a file Railway stops honouring after 2026-12-01.
  const findings = checkDrift({ ...healthy, numReplicas: null, manifestReplicas: 1 });
  assert.deepEqual(ids(findings), ['num-replicas-from-file-only']);
  assert.equal(hasFailure(findings), false);
  assert.equal(findings[0].level, WARN);
});

test('an explicit replica count on the service warns about nothing', () => {
  const findings = checkDrift({ ...healthy, numReplicas: 1, manifestReplicas: 1 });
  assert.deepEqual(findings, []);
});

test('a deployed manifest with the wrong count fails even though the override is unset', () => {
  const findings = checkDrift({ ...healthy, numReplicas: null, manifestReplicas: 2 });
  assert.deepEqual(ids(findings), ['num-replicas']);
  assert.equal(hasFailure(findings), true);
  assert.match(findings[0].title, /is 2, not 1/);
});

test('nothing observable still fails rather than being assumed to be 1', () => {
  // The point of the original rule, preserved: reading the effective value is an
  // observation, not an assumption, and when there is nothing to observe the
  // check must not invent a pass.
  const findings = checkDrift({ ...healthy, numReplicas: null, manifestReplicas: null });
  assert.deepEqual(ids(findings), ['num-replicas']);
  assert.match(findings[0].title, /unset/);
});

test('manifestNumReplicas prefers the merged manifest over the file it came from', () => {
  const deployment = {
    meta: {
      serviceManifest: { deploy: { numReplicas: 3 } },
      fileServiceManifest: { deploy: { numReplicas: 1 } },
    },
  };
  assert.equal(manifestNumReplicas(deployment), 3);
});

test('manifestNumReplicas falls back to the file manifest, and to null', () => {
  assert.equal(
    manifestNumReplicas({ meta: { fileServiceManifest: { deploy: { numReplicas: 1 } } } }),
    1,
  );
  assert.equal(manifestNumReplicas({ meta: {} }), null);
  assert.equal(manifestNumReplicas({}), null);
  assert.equal(manifestNumReplicas(null), null);
  // A string is not a replica count; Railway's meta is a free-form JSON scalar.
  assert.equal(manifestNumReplicas({ meta: { serviceManifest: { deploy: { numReplicas: '1' } } } }), null);
});

/* ------------------------------------------------- healthcheck, builder, restart -- */

test('no healthcheck at all fails, because a deploy then goes green regardless', () => {
  const findings = checkDrift({ ...healthy, healthcheckPath: null, manifestHealthcheck: null });
  assert.deepEqual(ids(findings), ['healthcheck-missing']);
  assert.equal(findings[0].level, FAIL);
});

test('a healthcheck pointed anywhere but /health fails, and says why it is worse than none', () => {
  // The SPA fallback in server/src/app.ts answers every unmatched GET with
  // index.html, so a wrong path returns 200 and HTML and can never fail. This
  // is the one case where a misconfiguration is more dangerous than an absence.
  const findings = checkDrift({ ...healthy, healthcheckPath: '/healthz' });
  assert.deepEqual(ids(findings), ['healthcheck-path']);
  assert.equal(findings[0].level, FAIL);
  assert.match(findings[0].title, /\/healthz/);
  assert.match(findings[0].detail, /worse than having no healthcheck/);
});

test('the dashboard override beats the manifest for the healthcheck', () => {
  // Same precedence the replica rule uses, and the same reason: the override is
  // what actually wins at deploy time.
  const findings = checkDrift({
    ...healthy,
    healthcheckPath: '/healthz',
    manifestHealthcheck: '/health',
  });
  assert.deepEqual(ids(findings), ['healthcheck-path']);
});

test('a healthcheck that only railway.json supplies passes, but warns about the sunset', () => {
  // The real production shape: nobody typed a path into the dashboard, and
  // railway.json supplies /health at deploy time.
  const findings = checkDrift({ ...healthy, healthcheckPath: null });
  assert.deepEqual(ids(findings), ['healthcheck-from-file-only']);
  assert.equal(hasFailure(findings), false);
  assert.match(findings[0].detail, /2026-12-01/);
});

test('a builder that is not the Dockerfile fails', () => {
  const findings = checkDrift({ ...healthy, builder: 'NIXPACKS' });
  assert.deepEqual(ids(findings), ['builder-not-dockerfile']);
  assert.equal(findings[0].level, FAIL);
  assert.match(findings[0].title, /NIXPACKS/);
});

test('an unreported builder is silent rather than guessed at', () => {
  // Railway auto-detects a Dockerfile at the repo root, so nothing observable
  // is not evidence of anything wrong. Warning here would be crying wolf.
  assert.deepEqual(checkDrift({ ...healthy, builder: null }), []);
});

test('a restart policy of NEVER fails, because the sweep has nowhere else to live', () => {
  const findings = checkDrift({ ...healthy, restartPolicy: 'NEVER' });
  assert.deepEqual(ids(findings), ['restart-policy-never']);
  assert.equal(findings[0].level, FAIL);
});

test('any other restart policy, including none, is silent', () => {
  // Railway's own default is ON_FAILURE.
  assert.deepEqual(checkDrift({ ...healthy, restartPolicy: null }), []);
  assert.deepEqual(checkDrift({ ...healthy, restartPolicy: 'ALWAYS' }), []);
});

test('several new findings are all reported together', () => {
  const findings = checkDrift({
    ...healthy,
    healthcheckPath: '/healthz',
    builder: 'NIXPACKS',
    restartPolicy: 'NEVER',
  });
  assert.deepEqual(ids(findings), [
    'healthcheck-path',
    'builder-not-dockerfile',
    'restart-policy-never',
  ]);
});

test('the manifest readers pull the rest of railway.json out of the same object', () => {
  // The whole reason these rules cost no new API surface: this is the object
  // manifestNumReplicas was already reading.
  const deployment = {
    meta: {
      fileServiceManifest: {
        build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
        deploy: { healthcheckPath: '/health', restartPolicyType: 'ON_FAILURE', numReplicas: 1 },
      },
    },
  };
  assert.equal(manifestBuilder(deployment), 'DOCKERFILE');
  assert.equal(manifestHealthcheckPath(deployment), '/health');
  assert.equal(manifestRestartPolicy(deployment), 'ON_FAILURE');
  assert.equal(manifestNumReplicas(deployment), 1);
});

test('the manifest readers return null rather than a guess when nothing says anything', () => {
  for (const empty of [null, {}, { meta: {} }, { meta: { serviceManifest: {} } }]) {
    assert.equal(manifestBuilder(empty), null);
    assert.equal(manifestHealthcheckPath(empty), null);
    assert.equal(manifestRestartPolicy(empty), null);
  }
  // An empty string is not a path, and would otherwise read as "configured".
  assert.equal(
    manifestHealthcheckPath({ meta: { serviceManifest: { deploy: { healthcheckPath: '' } } } }),
    null,
  );
});

test('manifestSetting prefers the merged manifest, as the deploy does', () => {
  const deployment = {
    meta: {
      serviceManifest: { deploy: { healthcheckPath: '/health' } },
      fileServiceManifest: { deploy: { healthcheckPath: '/old' } },
    },
  };
  assert.equal(manifestSetting(deployment, 'deploy', 'healthcheckPath'), '/health');
});
