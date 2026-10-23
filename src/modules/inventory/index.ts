import type { Express } from "express";
import type { ModuleContext, IModule } from "../../core/module.js";
import { registerInventoryRoutes } from "./routes.js";

const inventoryModule: IModule = {
  name: "inventory",
  version: "1.0.0",
  registerRoutes(app: Express): void {
    registerInventoryRoutes(app);
  },
  registerHooks(_context: ModuleContext): void {
    // Reserved for inventory domain events.
  },
};

export default inventoryModule;
