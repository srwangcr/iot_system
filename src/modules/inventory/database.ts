import { Pool } from "pg";
import type { HardwareComponent } from "./types.js";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeInventoryDatabase(): Promise<void> {
  await pool.query(`
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

  const result = await pool.query("SELECT COUNT(*)::int AS count FROM inventory_components");
  if (result.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO inventory_components (id, name, category, quantity, available)
       VALUES
       ('esp32-devkit', 'ESP32 DevKit', 'microcontroller', 12, 8),
       ('raspberry-pi-4', 'Raspberry Pi 4', 'single-board-computer', 4, 2),
       ('dht22', 'DHT22', 'sensor', 20, 15)`,
    );
  }
}

export async function findComponents(): Promise<HardwareComponent[]> {
  const result = await pool.query(
    "SELECT id, name, category, quantity, available FROM inventory_components ORDER BY name",
  );
  return result.rows;
}

export async function createComponent(component: HardwareComponent): Promise<HardwareComponent> {
  const result = await pool.query(
    `INSERT INTO inventory_components (id, name, category, quantity, available)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, category, quantity, available`,
    [component.id, component.name, component.category, component.quantity, component.available],
  );
  return result.rows[0];
}

export async function updateComponent(id: string, component: Omit<HardwareComponent, "id">): Promise<HardwareComponent | null> {
  const result = await pool.query(
    `UPDATE inventory_components
     SET name = $1, category = $2, quantity = $3, available = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING id, name, category, quantity, available`,
    [component.name, component.category, component.quantity, component.available, id],
  );
  return result.rows[0] ?? null;
}

export async function deleteComponent(id: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM inventory_components WHERE id = $1", [id]);
  return result.rowCount === 1;
}

export async function upsertComponents(components: HardwareComponent[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const component of components) {
      await client.query(
        `INSERT INTO inventory_components (id, name, category, quantity, available)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           quantity = EXCLUDED.quantity,
           available = EXCLUDED.available,
           updated_at = NOW()`,
        [component.id, component.name, component.category, component.quantity, component.available],
      );
    }
    await client.query("COMMIT");
    return components.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
