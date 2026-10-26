import type { NextFunction, Request, Response } from "express";

export type Role = "admin" | "member";

export interface AuthenticatedRequest extends Request {
  user?: { username: string; role: Role };
}

function findAuthenticatedRole(authorization: string | undefined): Role | undefined {
  const accounts: Array<[Role, string | undefined]> = [
    ["admin", process.env.AUTH_ADMIN_TOKEN],
    ["member", process.env.AUTH_MEMBER_TOKEN],
  ];
  return accounts.find(([, token]) => token && authorization === `Bearer ${token}`)?.[0];
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  const role = findAuthenticatedRole(request.header("authorization"));
  if (!role) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  request.user = { username: role, role };
  next();
}

export function requireRole(role: Role) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    const authenticatedRole = findAuthenticatedRole(request.header("authorization"));
    if (authenticatedRole !== role) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    request.user = { username: role, role };
    next();
  };
}
