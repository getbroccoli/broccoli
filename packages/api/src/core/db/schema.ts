// Core Drizzle tables, a source of the generated migrations. Module tables live in
// `modules/<name>/db/*-table.ts`, which drizzle.config.ts also reads.
export { account, session, user, verification } from "../auth";
export { instance } from "../instance";
