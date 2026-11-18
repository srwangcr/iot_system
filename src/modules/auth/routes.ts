import { Router } from "express";
import { z } from "zod";
import { isUniqueViolation } from "../../core/databaseErrors.js";
import { getAccounts } from "./accounts.js";
import { createUser, findUserByUsername, verifyPassword } from "./database.js";

const usernameSchema = z.string().trim().min(1).max(120);

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(200),
});

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use only letters, numbers, dots, dashes and underscores"),
  password: z.string().min(8).max(200),
});

export function createAuthRoutes(): Router {
  const router = Router();

  router.post("/login", async (request, response, next) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Username and password are required" });
      return;
    }

    const { username, password } = parsed.data;

    try {
      const envAccount = getAccounts().find(
        (candidate) => candidate.username === username && candidate.password === password,
      );
      if (envAccount) {
        response.json({
          data: { token: envAccount.token, role: envAccount.role, username: envAccount.username },
        });
        return;
      }

      const user = await findUserByUsername(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        response.status(401).json({ error: "Invalid credentials" });
        return;
      }

      response.json({ data: { token: user.token, role: user.role, username: user.username } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/register", async (request, response, next) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid registration data",
        details: parsed.error.flatten(),
      });
      return;
    }

    const { username, password } = parsed.data;

    try {
      const reserved = getAccounts().some((account) => account.username === username);
      if (reserved || (await findUserByUsername(username))) {
        response.status(409).json({ error: "Username already registered" });
        return;
      }

      const user = await createUser(username, password);
      response.status(201).json({
        data: { token: user.token, role: user.role, username: user.username },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        response.status(409).json({ error: "Username already registered" });
        return;
      }
      next(error);
    }
  });

  return router;
}
