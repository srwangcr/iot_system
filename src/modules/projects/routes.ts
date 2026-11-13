import type { Express } from "express";
import { addProject, editProject, listProjects, removeProject } from "./controller.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export function registerProjectRoutes(app: Express): void {
  app.get("/api/projects", requireAuth, listProjects);
  app.post("/api/projects", requireRole("admin"), addProject);
  app.put("/api/projects/:id", requireRole("admin"), editProject);
  app.delete("/api/projects/:id", requireRole("admin"), removeProject);
}
