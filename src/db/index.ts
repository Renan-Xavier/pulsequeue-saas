import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type AppDatabase = NodePgDatabase<typeof schema>;

let poolInstance: Pool | null = null;
let dbInstance: AppDatabase | null = null;

/**
 * Lazily initializes and returns the singleton PostgreSQL pool and Drizzle ORM
 * instance, attaching Fluid Compute lifecycle hooks on Vercel without failing build time.
 */
export function getPool(): Pool {
  if (poolInstance) return poolInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not configured.");
  }

  poolInstance = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  attachDatabasePool(poolInstance);
  return poolInstance;
}

/**
 * Returns the typed Drizzle ORM client backed by the lazy PostgreSQL pool.
 */
export function getDb(): AppDatabase {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}
