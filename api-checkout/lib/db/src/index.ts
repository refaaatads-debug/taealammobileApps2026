import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function normalizeDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);

  // The self-hosted Supavisor instance on the production VPS identifies the
  // default tenant through the qualified database user. Keep other database
  // URLs untouched, including hosted and development environments.
  if (
    url.hostname === "127.0.0.1"
    && url.port === "6543"
    && url.username === "postgres"
  ) {
    url.username = "supabase_admin.default";
  }

  return url.toString();
}

export const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
