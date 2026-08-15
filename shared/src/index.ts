/**
 * `@travel/shared` — the schemas the client and the server both validate
 * against. Resolves to TypeScript *source*, not a build artifact, so the two
 * can never drift onto different versions of the same schema (PLAN.md §2).
 *
 * Phase 0 establishes the package and its platform-neutrality constraint;
 * PLAN.md §11 Phase 2 fills it with the real trip and auth schemas, Phase 3
 * with the timeline entities and the IATA→IANA table.
 */

export const SCHEMA_VERSION = 1;
