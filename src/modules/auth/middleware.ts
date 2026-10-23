import type { NextFunction, Request, Response } from "express";

export type Role = "admin" | "member";

export interface AuthenticatedRequest extends Request {
  user?: { username: string; role: Role };
}

export function requireRole(role: Role) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    const authorization = request.header("authorization");
    const expected = role === "admin" ? process.env.AUTH_ADMIN_TOKEN : process.env.AUTH_MEMBER_TOKEN;
    if (!expected || authorization !== `Bearer ${expected}`) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    request.user = { username: role, role };
    next();
  };
}
