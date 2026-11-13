export type Role = "admin" | "member";

export interface Account {
  readonly role: Role;
  readonly username: string;
  readonly password: string;
  readonly token: string;
}

interface AccountDefinition {
  readonly role: Role;
  readonly usernameEnv: string;
  readonly passwordEnv: string;
  readonly tokenEnv: string;
}

const accountDefinitions: readonly AccountDefinition[] = [
  {
    role: "admin",
    usernameEnv: "AUTH_ADMIN_USERNAME",
    passwordEnv: "AUTH_ADMIN_PASSWORD",
    tokenEnv: "AUTH_ADMIN_TOKEN",
  },
  {
    role: "member",
    usernameEnv: "AUTH_MEMBER_USERNAME",
    passwordEnv: "AUTH_MEMBER_PASSWORD",
    tokenEnv: "AUTH_MEMBER_TOKEN",
  },
];

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Returns only the accounts that are fully configured. This prevents a
 * half-configured environment from matching empty credentials.
 */
export function getAccounts(): Account[] {
  return accountDefinitions.flatMap((definition) => {
    const username = readEnv(definition.usernameEnv);
    const password = readEnv(definition.passwordEnv);
    const token = readEnv(definition.tokenEnv);
    if (!username || !password || !token) return [];
    return [{ role: definition.role, username, password, token }];
  });
}

/**
 * Fails fast during startup when credentials/tokens are missing or when two
 * roles share the same token (which would make role checks ambiguous).
 */
export function assertAuthConfiguration(): void {
  const missing = accountDefinitions.flatMap((definition) =>
    [definition.usernameEnv, definition.passwordEnv, definition.tokenEnv].filter(
      (name) => !readEnv(name),
    ),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing authentication environment variables: ${[...new Set(missing)].join(", ")}. ` +
        "Copy .env.example to .env and set every AUTH_* value.",
    );
  }

  const accounts = getAccounts();
  const tokens = accounts.map((account) => account.token);
  if (new Set(tokens).size !== tokens.length) {
    throw new Error("AUTH_ADMIN_TOKEN and AUTH_MEMBER_TOKEN must be different");
  }
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer") return undefined;
  const token = rest.join(" ");
  return token.length > 0 ? token : undefined;
}

export function findAccountByAuthorization(authorization: string | undefined): Account | undefined {
  const token = extractBearerToken(authorization);
  if (!token) return undefined;
  return getAccounts().find((account) => account.token === token);
}
