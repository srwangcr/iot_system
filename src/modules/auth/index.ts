import type { Express } from "express";
import type { IModule, ModuleContext } from "../../core/module.js";
import { assertAuthConfiguration } from "./accounts.js";
import { initializeAuthDatabase } from "./database.js";
import { createAuthRoutes } from "./routes.js";

const authModule: IModule = {
  name: "auth",
  version: "1.0.0",
  registerRoutes(app: Express): void {
    app.use("/api/auth", createAuthRoutes());
  },
  async registerHooks(_context: ModuleContext): Promise<void> {
    assertAuthConfiguration();
    await initializeAuthDatabase();
  },
};

export default authModule;
