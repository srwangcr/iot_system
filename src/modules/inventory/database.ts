import type { HardwareComponent } from "./types.js";
import { getPool } from "../../core/database.js";

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

export async function upsertComponents(components: HardwareComponent[]): Promise<number> {
  if (components.length === 0) return 0;

  const client = await getPool().connect();
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
