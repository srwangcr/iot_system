import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
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

/**
 * Resolves a manifest entry inside its module directory. During development the
 * manifests point to the compiled `.js` name while the source file is `.ts`, so
 * a `.ts` fallback is tried when the `.js` file does not exist. The resolved
 * path is always verified to stay inside the module directory.
 */
function resolveModuleEntry(moduleDirectory: string, entry: string): string | undefined {
  const candidate = resolve(moduleDirectory, entry);
  const relativePath = relative(moduleDirectory, candidate);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return undefined;
  }

  const candidates = [candidate];
  if (candidate.endsWith(".js")) candidates.push(`${candidate.slice(0, -3)}.ts`);

  for (const path of candidates) {
    const stats = statSync(path, { throwIfNoEntry: false });
    if (stats?.isFile()) return path;
  }
  return undefined;
}

export async function loadModules(
  app: Express,
  modulesDirectory: string,
  context: ModuleContext,
): Promise<IModule[]> {
  const directory = resolve(modulesDirectory);
  const loadedModules: IModule[] = [];
  const loadedNames = new Set<string>();

  const moduleDirectories = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of moduleDirectories) {
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
    if (loadedNames.has(manifest.name)) {
      throw new Error(`Duplicate module name "${manifest.name}"`);
    }

    const entryPath = resolveModuleEntry(moduleDirectory, manifest.entry);
    if (!entryPath) {
      throw new Error(`Entry "${manifest.entry}" for module "${manifest.name}" is invalid`);
    }

    let implementation: unknown;
    try {
      implementation = await loadModuleExport(entryPath);
    } catch (error) {
      throw new Error(`Failed to load entry "${manifest.entry}" for module "${manifest.name}"`, {
        cause: error,
      });
    }
    if (!isModule(implementation)) {
      throw new Error(`Module "${manifest.name}" does not implement IModule`);
    }
    if (implementation.name !== manifest.name || implementation.version !== manifest.version) {
      throw new Error(`Manifest and implementation metadata differ for module "${manifest.name}"`);
    }

    await implementation.registerRoutes(app, context);
    await implementation.registerHooks(context);
    loadedNames.add(manifest.name);
    loadedModules.push(implementation);
  }

  return loadedModules;
}

export { isModuleManifest, resolveModuleEntry };
