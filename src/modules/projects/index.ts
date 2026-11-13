import type { Express } from "express";
import type { IModule, ModuleContext } from "../../core/module.js";
import { initializeProjectsDatabase } from "./database.js";
import { registerProjectRoutes } from "./routes.js";

const projectsModule: IModule = {
  name: "projects",
  version: "1.0.0",
  registerRoutes(app: Express): void {
    registerProjectRoutes(app);
  },
  async registerHooks(_context: ModuleContext): Promise<void> {
    await initializeProjectsDatabase();
  },
};

export default projectsModule;
