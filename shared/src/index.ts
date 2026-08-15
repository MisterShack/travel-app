/**
 * `@travel/shared` — the schemas the client and the server both validate
 * against. Resolves to TypeScript *source*, not a build artifact, so the two
 * can never drift onto different versions of the same schema (PLAN.md §2).
 */

export const SCHEMA_VERSION = 1;

export * from './common';
export * from './auth';
export * from './trip';
