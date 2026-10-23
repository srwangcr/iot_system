import type { Express } from "express";
import { listComponents } from "./controller.js";

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory/components", listComponents);
}
