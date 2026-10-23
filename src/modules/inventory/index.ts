import type { Express } from "express";
import type { ModuleContext, IModule } from "../../core/module.js";
import { registerInventoryRoutes } from "./routes.js";
import { initializeInventoryDatabase } from "./database.js";

const inventoryModule: IModule = {
  name: "inventory",
  version: "1.0.0",
  registerRoutes(app: Express): void {
    registerInventoryRoutes(app);
  },
  async registerHooks(_context: ModuleContext): Promise<void> {
    await initializeInventoryDatabase();
  },
};

export default inventoryModule;
