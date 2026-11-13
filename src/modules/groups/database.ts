import { getPool } from "../../core/database.js";
import type { Group } from "./types.js";

const groupColumns = `id, name, description, lead, member_count AS "memberCount", status`;

export async function initializeGroupsDatabase(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      lead TEXT NOT NULL DEFAULT '',
      member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await getPool().query("SELECT COUNT(*)::int AS count FROM groups");
  if (Number(result.rows[0]?.count ?? 0) === 0) {
    await getPool().query(
      `INSERT INTO groups (id, name, description, lead, member_count, status)
       VALUES
       ('iot-core', 'Núcleo IoT', 'Equipo base de firmware y conectividad', 'admin', 6, 'active'),
       ('robotics-lab', 'Laboratorio de robótica', 'Equipo de prototipos y actuadores', 'member', 4, 'active')`,
    );
  }
}

export async function findGroups(): Promise<Group[]> {
  const result = await getPool().query(`SELECT ${groupColumns} FROM groups ORDER BY name`);
  return result.rows as Group[];
}

export async function createGroup(group: Group): Promise<Group> {
  const result = await getPool().query(
    `INSERT INTO groups (id, name, description, lead, member_count, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${groupColumns}`,
    [group.id, group.name, group.description, group.lead, group.memberCount, group.status],
  );
  return result.rows[0] as Group;
}

export async function updateGroup(
  id: string,
  group: Omit<Group, "id">,
): Promise<Group | null> {
  const result = await getPool().query(
    `UPDATE groups
     SET name = $1, description = $2, lead = $3, member_count = $4, status = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING ${groupColumns}`,
    [group.name, group.description, group.lead, group.memberCount, group.status, id],
  );
  return (result.rows[0] as Group | undefined) ?? null;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const result = await getPool().query("DELETE FROM groups WHERE id = $1", [id]);
  return result.rowCount === 1;
}
