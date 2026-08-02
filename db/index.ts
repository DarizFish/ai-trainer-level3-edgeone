import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

const DEFAULT_DATABASE_POOL_MAX = 1;
const MAX_DATABASE_POOL_MAX = 20;

const databaseGlobal = globalThis as typeof globalThis & {
  aiTrainerDatabase?: Database;
  aiTrainerPostgres?: PostgresClient;
};

function getPostgresClient(): PostgresClient {
  if (databaseGlobal.aiTrainerPostgres) return databaseGlobal.aiTrainerPostgres;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  databaseGlobal.aiTrainerPostgres = postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: databasePoolMax(),
    prepare: false,
  });
  return databaseGlobal.aiTrainerPostgres;
}

function databasePoolMax(): number {
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_DATABASE_POOL_MAX;
  return Math.min(configured, MAX_DATABASE_POOL_MAX);
}

export function getDb(): Database {
  if (!databaseGlobal.aiTrainerDatabase) {
    databaseGlobal.aiTrainerDatabase = drizzle(getPostgresClient(), { schema });
  }
  return databaseGlobal.aiTrainerDatabase;
}
