import type { Express } from "express";
import { addGroup, editGroup, listGroups, removeGroup } from "./controller.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export function registerGroupRoutes(app: Express): void {
  app.get("/api/groups", requireAuth, listGroups);
  app.post("/api/groups", requireRole("admin"), addGroup);
  app.put("/api/groups/:id", requireRole("admin"), editGroup);
  app.delete("/api/groups/:id", requireRole("admin"), removeGroup);
}
