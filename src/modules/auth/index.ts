import type { Express } from "express";
import type { IModule, ModuleContext } from "../../core/module.js";
import { createAuthRoutes } from "./routes.js";

const authModule: IModule = {
  name: "auth",
  version: "1.0.0",
  registerRoutes(app: Express): void {
    app.use("/api/auth", createAuthRoutes());
  },
  registerHooks(_context: ModuleContext): void {},
};

export default authModule;
