import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModules } from "./core/moduleLoader.js";
import type { IModule, ModuleContext } from "./core/module.js";

const defaultModulesDirectory = join(dirname(fileURLToPath(import.meta.url)), "modules");

export interface CreateAppOptions {
  readonly modulesDirectory?: string;
  readonly context?: ModuleContext;
}

export interface CreatedApp {
  readonly app: Express;
  readonly modules: IModule[];
}

function cors(request: Request, response: Response, next: NextFunction): void {
  const allowedOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:8080";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.setHeader("Access-Control-Max-Age", "600");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
}

const notFoundHandler = (_request: Request, response: Response): void => {
  response.status(404).json({ error: "Not found" });
};

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  console.error(error);
  if (response.headersSent) return;
  response.status(500).json({ error: "Internal server error" });
};

export async function createApp(options: CreateAppOptions = {}): Promise<CreatedApp> {
  const app = express();
  const context: ModuleContext = options.context ?? { events: new EventEmitter() };

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(cors);

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  const modules = await loadModules(
    app,
    options.modulesDirectory ?? defaultModulesDirectory,
    context,
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, modules };
}
