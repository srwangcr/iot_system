import type { HardwareComponent, InventoryLocation } from "./types.js";
import { getPool } from "../../core/database.js";

const componentColumns = `id, name, category, location, quantity, available`;

export async function initializeInventoryDatabase(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS inventory_components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      available INTEGER NOT NULL CHECK (available >= 0 AND available <= quantity),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Upgrade databases created before the merged location field existed.
  try {
    await getPool().query(
      "ALTER TABLE inventory_components ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT ''",
    );
  } catch (error) {
    // Some engines (for example the pg-mem test adapter) do not implement
    // ADD COLUMN IF NOT EXISTS. The CREATE TABLE above already includes it.
    if (!/already exists|syntax/i.test(error instanceof Error ? error.message : "")) throw error;
  }

  const result = await getPool().query("SELECT COUNT(*)::int AS count FROM inventory_components");
  if (Number(result.rows[0]?.count ?? 0) === 0) {
    await getPool().query(
      `INSERT INTO inventory_components (id, name, category, location, quantity, available)
       VALUES
       ('esp32-devkit', 'ESP32 DevKit', 'microcontroller', 'A1', 12, 8),
       ('raspberry-pi-4', 'Raspberry Pi 4', 'single-board-computer', 'A2', 4, 2),
       ('dht22', 'DHT22', 'sensor', 'B1', 20, 15)`,
    );
  }
}

export async function findComponents(): Promise<HardwareComponent[]> {
  const result = await getPool().query(
    `SELECT ${componentColumns} FROM inventory_components ORDER BY name`,
  );
  return result.rows as HardwareComponent[];
}

export async function findLocations(): Promise<InventoryLocation[]> {
  const result = await getPool().query(
    `SELECT ${componentColumns} FROM inventory_components ORDER BY location, name`,
  );

  const grouped = new Map<string, InventoryLocation>();
  for (const component of result.rows as HardwareComponent[]) {
    const key = component.location.trim();
    const entry = grouped.get(key) ?? {
      location: key,
      componentCount: 0,
      totalUnits: 0,
      availableUnits: 0,
      components: [],
    };
    entry.components.push(component);
    entry.componentCount += 1;
    entry.totalUnits += component.quantity;
    entry.availableUnits += component.available;
    grouped.set(key, entry);
  }

  return [...grouped.values()].sort((a, b) => {
    if (!a.location) return 1;
    if (!b.location) return -1;
    return a.location.localeCompare(b.location);
  });
}

export async function createComponent(component: HardwareComponent): Promise<HardwareComponent> {
  const result = await getPool().query(
    `INSERT INTO inventory_components (id, name, category, location, quantity, available)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${componentColumns}`,
    [
      component.id,
      component.name,
      component.category,
      component.location,
      component.quantity,
      component.available,
    ],
  );
  return result.rows[0] as HardwareComponent;
}

export async function updateComponent(
  id: string,
  component: Omit<HardwareComponent, "id">,
): Promise<HardwareComponent | null> {
  const result = await getPool().query(
    `UPDATE inventory_components
     SET name = $1, category = $2, location = $3, quantity = $4, available = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING ${componentColumns}`,
    [
      component.name,
      component.category,
      component.location,
      component.quantity,
      component.available,
      id,
    ],
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
        `INSERT INTO inventory_components (id, name, category, location, quantity, available)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           location = EXCLUDED.location,
           quantity = EXCLUDED.quantity,
           available = EXCLUDED.available,
           updated_at = NOW()`,
        [
          component.id,
          component.name,
          component.category,
          component.location,
          component.quantity,
          component.available,
        ],
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
