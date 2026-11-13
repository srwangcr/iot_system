import { Pool } from "pg";

let pool: Pool | undefined;

/**
 * Creates the PostgreSQL pool lazily so the environment (including a local
 * .env file) is fully loaded before the connection is configured. Tests can
 * replace the pool through setPool().
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on("error", (error) => {
      console.error("Unexpected PostgreSQL pool error", error);
    });
  }
  return pool;
}

export function setPool(next: Pool | undefined): void {
  pool = next;
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  if (current) await current.end();
}
