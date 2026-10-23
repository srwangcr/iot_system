import type { Express } from "express";
import { listComponents } from "./controller.js";
import { addComponent, editComponent, removeComponent } from "./controller.js";
import { requireRole } from "../auth/middleware.js";

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory/components", listComponents);
  app.post("/api/inventory/components", requireRole("admin"), addComponent);
  app.put("/api/inventory/components/:id", requireRole("admin"), editComponent);
  app.delete("/api/inventory/components/:id", requireRole("admin"), removeComponent);
}
