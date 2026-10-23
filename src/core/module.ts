import type { Express } from "express";
import type { EventEmitter } from "node:events";

export interface ModuleContext {
  readonly events: EventEmitter;
}

export interface IModule {
  readonly name: string;
  readonly version: string;
  registerRoutes(app: Express, context: ModuleContext): void | Promise<void>;
  registerHooks(context: ModuleContext): void | Promise<void>;
}
