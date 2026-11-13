import { Router } from "express";
import { z } from "zod";
import { getAccounts } from "./accounts.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
});

export function createAuthRoutes(): Router {
  const router = Router();

  router.post("/login", (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Username and password are required" });
      return;
    }

    const { username, password } = parsed.data;
    const account = getAccounts().find(
      (candidate) => candidate.username === username && candidate.password === password,
    );
    if (!account) {
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }

    response.json({ data: { token: account.token, role: account.role, username: account.username } });
  });

  return router;
}
