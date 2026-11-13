import type { Express } from "express";
import type { IModule, ModuleContext } from "../../core/module.js";
import { initializeGroupsDatabase } from "./database.js";
import { registerGroupRoutes } from "./routes.js";

const groupsModule: IModule = {
  name: "groups",
  version: "1.0.0",
  registerRoutes(app: Express): void {
    registerGroupRoutes(app);
  },
  async registerHooks(_context: ModuleContext): Promise<void> {
    await initializeGroupsDatabase();
  },
};

export default groupsModule;
