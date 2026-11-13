import type { Express } from "express";
import { addComponent, editComponent, listComponents, removeComponent } from "./controller.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory/components", requireAuth, listComponents);
  app.post("/api/inventory/components", requireRole("admin"), addComponent);
  app.put("/api/inventory/components/:id", requireRole("admin"), editComponent);
  app.delete("/api/inventory/components/:id", requireRole("admin"), removeComponent);
}
