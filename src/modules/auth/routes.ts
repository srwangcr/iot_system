import { Router } from "express";
import { randomBytes } from "node:crypto";

export function createAuthRoutes(): Router {
  const router = Router();
  router.post("/login", (request, response) => {
    const { username, password } = request.body as { username?: string; password?: string };
    const accounts = [
      { username: process.env.AUTH_ADMIN_USERNAME, password: process.env.AUTH_ADMIN_PASSWORD, role: "admin", token: process.env.AUTH_ADMIN_TOKEN },
      { username: process.env.AUTH_MEMBER_USERNAME, password: process.env.AUTH_MEMBER_PASSWORD, role: "member", token: process.env.AUTH_MEMBER_TOKEN },
    ];
    const account = accounts.find((candidate) => candidate.username === username && candidate.password === password);
    if (!account) {
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = account.token ?? randomBytes(32).toString("hex");
    response.json({ data: { token, role: account.role } });
  });
  return router;
}
