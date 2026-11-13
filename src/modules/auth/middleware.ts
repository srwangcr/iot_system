import type { NextFunction, Request, Response } from "express";
import { findAccountByAuthorization, type Role } from "./accounts.js";

export type { Role } from "./accounts.js";

export interface AuthenticatedRequest extends Request {
  user?: { username: string; role: Role };
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  const account = findAccountByAuthorization(request.header("authorization"));
  if (!account) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  request.user = { username: account.username, role: account.role };
  next();
}

export function requireRole(role: Role) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    const account = findAccountByAuthorization(request.header("authorization"));
    if (!account) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (account.role !== role) {
      response.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    request.user = { username: account.username, role: account.role };
    next();
  };
}
