import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getPool } from "../../core/database.js";
import type { Role } from "./accounts.js";

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SCHEME = "scrypt";

export interface StoredUser {
  readonly id: string;
  readonly username: string;
  readonly role: Role;
  readonly token: string;
}

export interface UserRecord extends StoredUser {
  readonly passwordHash: string;
}

const userColumns = `id, username, role, token`;
const userRecordColumns = `id, username, role, token, password_hash AS "passwordHash"`;

/**
 * Hashes a password with a per-user random salt. The stored format is
 * `scrypt:<salt>:<derived-key>`, which keeps the table self-contained and
 * allows future migrations to a different scheme.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");
  return `${PASSWORD_SCHEME}:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== PASSWORD_SCHEME || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function initializeAuthDatabase(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const result = await getPool().query(
    `SELECT ${userRecordColumns} FROM users WHERE username = $1`,
    [username],
  );
  return (result.rows[0] as UserRecord | undefined) ?? null;
}

export async function findUserByToken(token: string): Promise<StoredUser | null> {
  const result = await getPool().query(
    `SELECT ${userColumns} FROM users WHERE token = $1`,
    [token],
  );
  return (result.rows[0] as StoredUser | undefined) ?? null;
}

export async function createUser(username: string, password: string): Promise<StoredUser> {
  const result = await getPool().query(
    `INSERT INTO users (id, username, password_hash, role, token)
     VALUES ($1, $2, $3, 'member', $4)
     RETURNING ${userColumns}`,
    [randomBytes(16).toString("hex"), username, hashPassword(password), generateToken()],
  );
  return result.rows[0] as StoredUser;
}
