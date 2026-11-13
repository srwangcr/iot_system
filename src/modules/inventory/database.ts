import { Pool } from "pg";
import type { HardwareComponent } from "./types.js";

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

export async function initializeInventoryDatabase(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS inventory_components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      available INTEGER NOT NULL CHECK (available >= 0 AND available <= quantity),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await getPool().query("SELECT COUNT(*)::int AS count FROM inventory_components");
  if (Number(result.rows[0]?.count ?? 0) === 0) {
    await getPool().query(
      `INSERT INTO inventory_components (id, name, category, quantity, available)
       VALUES
       ('esp32-devkit', 'ESP32 DevKit', 'microcontroller', 12, 8),
       ('raspberry-pi-4', 'Raspberry Pi 4', 'single-board-computer', 4, 2),
       ('dht22', 'DHT22', 'sensor', 20, 15)`,
    );
  }
}

export async function findComponents(): Promise<HardwareComponent[]> {
  const result = await getPool().query(
    "SELECT id, name, category, quantity, available FROM inventory_components ORDER BY name",
  );
  return result.rows as HardwareComponent[];
}

export async function createComponent(component: HardwareComponent): Promise<HardwareComponent> {
  const result = await getPool().query(
    `INSERT INTO inventory_components (id, name, category, quantity, available)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, category, quantity, available`,
    [component.id, component.name, component.category, component.quantity, component.available],
  );
  return result.rows[0] as HardwareComponent;
}

export async function updateComponent(
  id: string,
  component: Omit<HardwareComponent, "id">,
): Promise<HardwareComponent | null> {
  const result = await getPool().query(
    `UPDATE inventory_components
     SET name = $1, category = $2, quantity = $3, available = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, category, quantity, available`,
    [component.name, component.category, component.quantity, component.available, id],
  );
  return (result.rows[0] as HardwareComponent | undefined) ?? null;
}

export async function deleteComponent(id: string): Promise<boolean> {
  const result = await getPool().query("DELETE FROM inventory_components WHERE id = $1", [id]);
  return result.rowCount === 1;
}
