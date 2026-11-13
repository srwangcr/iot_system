import { getPool } from "../../core/database.js";
import type { Project } from "./types.js";

const projectColumns = `id, name, description, group_id AS "groupId", status,
  start_date AS "startDate", end_date AS "endDate"`;

function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    groupId: String(row.groupId),
    status: row.status as Project["status"],
    startDate: normalizeDate(row.startDate),
    endDate: normalizeDate(row.endDate),
  };
}

export async function initializeProjectsDatabase(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'active', 'paused', 'completed', 'cancelled')),
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
    )
  `);

  const result = await getPool().query("SELECT COUNT(*)::int AS count FROM projects");
  if (Number(result.rows[0]?.count ?? 0) === 0) {
    await getPool().query(
      `INSERT INTO projects (id, name, description, group_id, status, start_date, end_date)
       VALUES
       ('smart-greenhouse', 'Invernadero inteligente',
        'Monitoreo de humedad y temperatura con ESP32', 'iot-core', 'active', '2026-01-15', '2026-06-30'),
       ('line-follower', 'Robot seguidor de línea',
        'Prototipo de robótica con sensores infrarrojos', 'robotics-lab', 'planned', '2026-02-01', NULL)`,
    );
  }
}

export async function findProjects(): Promise<Project[]> {
  const result = await getPool().query(`SELECT ${projectColumns} FROM projects ORDER BY name`);
  return result.rows.map((row) => mapProject(row as Record<string, unknown>));
}

export async function createProject(project: Project): Promise<Project> {
  const result = await getPool().query(
    `INSERT INTO projects (id, name, description, group_id, status, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${projectColumns}`,
    [
      project.id,
      project.name,
      project.description,
      project.groupId,
      project.status,
      project.startDate,
      project.endDate,
    ],
  );
  return mapProject(result.rows[0] as Record<string, unknown>);
}

export async function updateProject(
  id: string,
  project: Omit<Project, "id">,
): Promise<Project | null> {
  const result = await getPool().query(
    `UPDATE projects
     SET name = $1, description = $2, group_id = $3, status = $4,
         start_date = $5, end_date = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING ${projectColumns}`,
    [
      project.name,
      project.description,
      project.groupId,
      project.status,
      project.startDate,
      project.endDate,
      id,
    ],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapProject(row) : null;
}

export async function deleteProject(id: string): Promise<boolean> {
  const result = await getPool().query("DELETE FROM projects WHERE id = $1", [id]);
  return result.rowCount === 1;
}
