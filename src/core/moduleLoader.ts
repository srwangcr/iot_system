import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Express } from "express";
import type { IModule, ModuleContext } from "./module.js";

interface ModuleManifest {
  name: string;
  version: string;
  entry: string;
}

function isModuleManifest(value: unknown): value is ModuleManifest {
  if (typeof value !== "object" || value === null) return false;
  const manifest = value as Record<string, unknown>;
  return (
    typeof manifest.name === "string" &&
    manifest.name.trim().length > 0 &&
    typeof manifest.version === "string" &&
    manifest.version.trim().length > 0 &&
    typeof manifest.entry === "string" &&
    manifest.entry.trim().length > 0
  );
}

async function loadModuleExport(modulePath: string): Promise<unknown> {
  const loaded = (await import(pathToFileURL(modulePath).href)) as { default?: unknown };
  return loaded.default ?? loaded;
}

function isModule(value: unknown): value is IModule {
  if (typeof value !== "object" || value === null) return false;
  const module = value as Partial<IModule>;
  return (
    typeof module.name === "string" &&
    typeof module.version === "string" &&
    typeof module.registerRoutes === "function" &&
    typeof module.registerHooks === "function"
  );
}

export async function loadModules(
  app: Express,
  modulesDirectory: string,
  context: ModuleContext,
): Promise<IModule[]> {
  const directory = resolve(modulesDirectory);
  const loadedModules: IModule[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const moduleDirectory = join(directory, entry.name);
    const manifestPath = join(moduleDirectory, "manifest.json");
    let manifest: ModuleManifest;

    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ModuleManifest;
    } catch (error) {
      throw new Error(`Invalid or unreadable manifest for module "${entry.name}"`, {
        cause: error,
      });
    }

    if (!isModuleManifest(manifest)) {
      throw new Error(`Manifest for module "${entry.name}" must define name, version and entry`);
    }

    const entryPath = resolve(moduleDirectory, manifest.entry);
    const entryStats = statSync(entryPath, { throwIfNoEntry: false });
    if (!entryPath.startsWith(`${moduleDirectory}/`) || !entryStats?.isFile()) {
      throw new Error(`Entry "${manifest.entry}" for module "${manifest.name}" is invalid`);
    }

    const implementation = await loadModuleExport(entryPath);
    if (!isModule(implementation)) {
      throw new Error(`Module "${manifest.name}" does not implement IModule`);
    }
    if (implementation.name !== manifest.name || implementation.version !== manifest.version) {
      throw new Error(`Manifest and implementation metadata differ for module "${manifest.name}"`);
    }

    await implementation.registerRoutes(app, context);
    await implementation.registerHooks(context);
    loadedModules.push(implementation);
  }

  return loadedModules;
}

export { isModuleManifest };
