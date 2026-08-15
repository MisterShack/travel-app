/**
 * `@travel/shared` — the schemas the client and the server both validate
 * against. Resolves to TypeScript *source*, not a build artifact, so the two
 * can never drift onto different versions of the same schema (PLAN.md §2).
 */

export const SCHEMA_VERSION = 1;

export * from './common';
export * from './auth';
export * from './trip';
export * from './time';
export * from './timeline';

// `./airports` is deliberately NOT re-exported here: it is a 280 KB table that
// only the flight form needs, and pulling it through the barrel would put it in
// every bundle that imports a schema. Import it as `@travel/shared/airports`,
// dynamically, at the point of use (PLAN.md §8).
