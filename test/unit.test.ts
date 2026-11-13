import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import {
  isModuleManifest,
  loadModules,
  resolveModuleEntry,
} from "../src/core/moduleLoader.js";
import {
  assertAuthConfiguration,
  findAccountByAuthorization,
  getAccounts,
} from "../src/modules/auth/accounts.js";

const AUTH_ENV_KEYS = [
  "AUTH_ADMIN_USERNAME",
  "AUTH_ADMIN_PASSWORD",
  "AUTH_ADMIN_TOKEN",
  "AUTH_MEMBER_USERNAME",
  "AUTH_MEMBER_PASSWORD",
  "AUTH_MEMBER_TOKEN",
] as const;

async function withTemporaryDirectory(
  run: (directory: string) => void | Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "iot-modules-"));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeModule(
  root: string,
  directory: string,
  manifest: object,
  implementation: string,
): void {
  const moduleDirectory = join(root, directory);
  mkdirSync(moduleDirectory, { recursive: true });
  writeFileSync(join(moduleDirectory, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(moduleDirectory, "index.mjs"), implementation);
}

function restoreAuthEnvironment(snapshot: Record<string, string | undefined>): void {
  for (const key of AUTH_ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("isModuleManifest validates the required fields", () => {
  assert.equal(
    isModuleManifest({ name: "demo", version: "1.0.0", entry: "index.js" }),
    true,
  );
  assert.equal(isModuleManifest({ name: "demo", version: "1.0.0" }), false);
  assert.equal(isModuleManifest({ name: " ", version: "1.0.0", entry: "index.js" }), false);
  assert.equal(isModuleManifest(null), false);
});

test("resolveModuleEntry resolves the TypeScript source during development", async () => {
  await withTemporaryDirectory((directory) => {
    const moduleDirectory = join(directory, "demo");
    mkdirSync(moduleDirectory);
    writeFileSync(join(moduleDirectory, "index.ts"), "export default {};");

    assert.equal(resolveModuleEntry(moduleDirectory, "index.js"), join(moduleDirectory, "index.ts"));
    assert.equal(resolveModuleEntry(moduleDirectory, "missing.js"), undefined);
    assert.equal(resolveModuleEntry(moduleDirectory, "../outside.js"), undefined);
    assert.equal(resolveModuleEntry(moduleDirectory, ".."), undefined);
  });
});

test("loadModules loads modules in deterministic order and runs their hooks", async () => {
  await withTemporaryDirectory(async (directory) => {
    writeModule(
      directory,
      "beta",
      { name: "beta", version: "1.0.0", entry: "index.mjs" },
      `export default {
        name: "beta",
        version: "1.0.0",
        registerRoutes(app) { app.get("/beta", (_request, response) => response.json({ ok: true })); },
        registerHooks(context) { context.events.emit("loaded", "beta"); },
      };`,
    );
    writeModule(
      directory,
      "alpha",
      { name: "alpha", version: "1.0.0", entry: "index.mjs" },
      `export default {
        name: "alpha",
        version: "1.0.0",
        registerRoutes(app) { app.get("/alpha", (_request, response) => response.json({ ok: true })); },
        registerHooks(context) { context.events.emit("loaded", "alpha"); },
      };`,
    );

    const events = new EventEmitter();
    const loaded: string[] = [];
    events.on("loaded", (name: string) => loaded.push(name));

    const modules = await loadModules(express(), directory, { events });

    assert.deepEqual(modules.map((module) => module.name), ["alpha", "beta"]);
    assert.deepEqual(loaded, ["alpha", "beta"]);
  });
});

test("loadModules rejects metadata mismatches and duplicate module names", async () => {
  await withTemporaryDirectory(async (directory) => {
    writeModule(
      directory,
      "broken",
      { name: "broken", version: "1.0.0", entry: "index.mjs" },
      `export default {
        name: "broken",
        version: "2.0.0",
        registerRoutes() {},
        registerHooks() {},
      };`,
    );

    await assert.rejects(
      loadModules(express(), directory, { events: new EventEmitter() }),
      /metadata differ/,
    );
  });

  await withTemporaryDirectory(async (directory) => {
    const manifest = { name: "same", version: "1.0.0", entry: "index.mjs" };
    const implementation = `export default {
      name: "same",
      version: "1.0.0",
      registerRoutes() {},
      registerHooks() {},
    };`;
    writeModule(directory, "first", manifest, implementation);
    writeModule(directory, "second", manifest, implementation);

    await assert.rejects(
      loadModules(express(), directory, { events: new EventEmitter() }),
      /Duplicate module name/,
    );
  });
});

test("loadModules rejects entry points outside the module directory", async () => {
  await withTemporaryDirectory(async (directory) => {
    writeModule(
      directory,
      "escape",
      { name: "escape", version: "1.0.0", entry: "../outside.mjs" },
      "export default {};",
    );

    await assert.rejects(
      loadModules(express(), directory, { events: new EventEmitter() }),
      /is invalid/,
    );
  });
});

test("authentication configuration fails fast and matches bearer tokens", () => {
  const snapshot = Object.fromEntries(
    AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<string, string | undefined>;

  try {
    for (const key of AUTH_ENV_KEYS) delete process.env[key];
    assert.throws(() => assertAuthConfiguration(), /Missing authentication environment variables/);
    assert.deepEqual(getAccounts(), []);

    process.env.AUTH_ADMIN_USERNAME = "admin";
    process.env.AUTH_ADMIN_PASSWORD = "admin-secret";
    process.env.AUTH_ADMIN_TOKEN = "admin-token";
    process.env.AUTH_MEMBER_USERNAME = "member";
    process.env.AUTH_MEMBER_PASSWORD = "member-secret";
    process.env.AUTH_MEMBER_TOKEN = "member-token";

    assert.doesNotThrow(() => assertAuthConfiguration());
    assert.equal(findAccountByAuthorization("Bearer admin-token")?.role, "admin");
    assert.equal(findAccountByAuthorization("bearer member-token")?.role, "member");
    assert.equal(findAccountByAuthorization("Basic admin-token"), undefined);
    assert.equal(findAccountByAuthorization("Bearer wrong-token"), undefined);
    assert.equal(findAccountByAuthorization(undefined), undefined);

    process.env.AUTH_MEMBER_TOKEN = "admin-token";
    assert.throws(() => assertAuthConfiguration(), /must be different/);
  } finally {
    restoreAuthEnvironment(snapshot);
  }
});
