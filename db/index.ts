import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

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
    max: 1,
    prepare: false,
  });
  return databaseGlobal.aiTrainerPostgres;
}

export function getDb(): Database {
  if (!databaseGlobal.aiTrainerDatabase) {
    databaseGlobal.aiTrainerDatabase = drizzle(getPostgresClient(), { schema });
  }
  return databaseGlobal.aiTrainerDatabase;
}
