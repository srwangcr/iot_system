import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { createApp } from "../src/app.js";
import { closePool, setPool } from "../src/modules/inventory/database.js";

const ADMIN_TOKEN = "integration-admin-token";
const MEMBER_TOKEN = "integration-member-token";

process.env.FRONTEND_ORIGIN = "http://localhost:8080";
process.env.AUTH_ADMIN_USERNAME = "admin";
process.env.AUTH_ADMIN_PASSWORD = "admin-password";
process.env.AUTH_ADMIN_TOKEN = ADMIN_TOKEN;
process.env.AUTH_MEMBER_USERNAME = "member";
process.env.AUTH_MEMBER_PASSWORD = "member-password";
process.env.AUTH_MEMBER_TOKEN = MEMBER_TOKEN;

const modulesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src/modules");

interface ApiResponse {
  response: Response;
  body: {
    data?: unknown;
    error?: string;
    details?: unknown;
    status?: string;
  };
}

test("API end-to-end", async (t) => {
  const database = newDb();
  const { Pool: MemoryPool } = database.adapters.createPg();
  setPool(new MemoryPool() as unknown as Pool);

  const { app, modules } = await createApp({ modulesDirectory });
  assert.deepEqual(modules.map((module) => module.name), ["auth", "inventory"]);

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const adminHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };
  const memberHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MEMBER_TOKEN}`,
  };

  async function api(path: string, options: RequestInit = {}): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}${path}`, options);
    const text = await response.text();
    let body: ApiResponse["body"] = {};
    if (text) {
      try {
        body = JSON.parse(text) as ApiResponse["body"];
      } catch {
        body = { error: text };
      }
    }
    return { response, body };
  }

  try {
    await t.test("health check responds", async () => {
      const { response, body } = await api("/health");
      assert.equal(response.status, 200);
      assert.deepEqual(body, { status: "ok" });
    });

    await t.test("CORS preflight is answered", async () => {
      const { response } = await api("/api/inventory/components", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8080",
          "Access-Control-Request-Method": "GET",
        },
      });
      assert.equal(response.status, 204);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        "http://localhost:8080",
      );
      assert.match(
        response.headers.get("access-control-allow-methods") ?? "",
        /PUT/,
      );
    });

    await t.test("login rejects invalid and incomplete credentials", async () => {
      const invalid = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      });
      assert.equal(invalid.response.status, 401);

      const incomplete = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin" }),
      });
      assert.equal(incomplete.response.status, 400);
    });

    await t.test("login returns the role and token for both accounts", async () => {
      const adminLogin = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin-password" }),
      });
      assert.equal(adminLogin.response.status, 200);
      assert.deepEqual(adminLogin.body.data, {
        token: ADMIN_TOKEN,
        role: "admin",
        username: "admin",
      });

      const memberLogin = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "member", password: "member-password" }),
      });
      assert.equal(memberLogin.response.status, 200);
      assert.equal((memberLogin.body.data as { role: string }).role, "member");
    });

    await t.test("inventory listing requires a valid bearer token", async () => {
      const anonymous = await api("/api/inventory/components");
      assert.equal(anonymous.response.status, 401);

      const invalidToken = await api("/api/inventory/components", {
        headers: { Authorization: "Bearer wrong-token" },
      });
      assert.equal(invalidToken.response.status, 401);
    });

    await t.test("seeded inventory is readable by a member", async () => {
      const { response, body } = await api("/api/inventory/components", {
        headers: memberHeaders,
      });
      assert.equal(response.status, 200);
      const items = body.data as Array<{ id: string; quantity: number; available: number }>;
      assert.deepEqual(
        items.map((item) => item.id),
        ["dht22", "esp32-devkit", "raspberry-pi-4"],
      );
      assert.ok(items.every((item) => item.available <= item.quantity));
    });

    await t.test("members cannot create, update or delete components", async () => {
      const payload = {
        id: "arduino-uno",
        name: "Arduino Uno",
        category: "microcontroller",
        quantity: 5,
        available: 5,
      };

      const create = await api("/api/inventory/components", {
        method: "POST",
        headers: memberHeaders,
        body: JSON.stringify(payload),
      });
      assert.equal(create.response.status, 403);
      assert.equal(create.body.error, "Insufficient permissions");

      const update = await api("/api/inventory/components/dht22", {
        method: "PUT",
        headers: memberHeaders,
        body: JSON.stringify({ name: "Hacked", category: "sensor", quantity: 1, available: 1 }),
      });
      assert.equal(update.response.status, 403);

      const remove = await api("/api/inventory/components/dht22", {
        method: "DELETE",
        headers: memberHeaders,
      });
      assert.equal(remove.response.status, 403);
    });

    await t.test("admin input is validated", async () => {
      const invalidQuantity = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "bad-stock",
          name: "Bad stock",
          category: "sensor",
          quantity: 1,
          available: 2,
        }),
      });
      assert.equal(invalidQuantity.response.status, 400);
      assert.equal(invalidQuantity.body.error, "Invalid component");

      const invalidId = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "Not Valid",
          name: "Invalid id",
          category: "sensor",
          quantity: 1,
          available: 1,
        }),
      });
      assert.equal(invalidId.response.status, 400);
    });

    await t.test("admin can create, update and delete a component", async () => {
      const created = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "arduino-uno",
          name: "Arduino Uno",
          category: "microcontroller",
          quantity: 5,
          available: 5,
        }),
      });
      assert.equal(created.response.status, 201);
      assert.deepEqual(created.body.data, {
        id: "arduino-uno",
        name: "Arduino Uno",
        category: "microcontroller",
        quantity: 5,
        available: 5,
      });

      const duplicate = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "arduino-uno",
          name: "Arduino Uno",
          category: "microcontroller",
          quantity: 5,
          available: 5,
        }),
      });
      assert.equal(duplicate.response.status, 409);

      const updated = await api("/api/inventory/components/arduino-uno", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          name: "Arduino Uno R3",
          category: "microcontroller",
          quantity: 7,
          available: 6,
        }),
      });
      assert.equal(updated.response.status, 200);
      assert.deepEqual(updated.body.data, {
        id: "arduino-uno",
        name: "Arduino Uno R3",
        category: "microcontroller",
        quantity: 7,
        available: 6,
      });

      const missing = await api("/api/inventory/components/does-not-exist", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          name: "Missing",
          category: "sensor",
          quantity: 1,
          available: 1,
        }),
      });
      assert.equal(missing.response.status, 404);

      const removed = await api("/api/inventory/components/arduino-uno", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(removed.response.status, 204);
      assert.deepEqual(removed.body, {});

      const removedAgain = await api("/api/inventory/components/arduino-uno", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(removedAgain.response.status, 404);
    });

    await t.test("unknown routes and malformed JSON return JSON errors", async () => {
      const unknown = await api("/api/does-not-exist", { headers: adminHeaders });
      assert.equal(unknown.response.status, 404);
      assert.deepEqual(unknown.body, { error: "Not found" });

      const malformed = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: "{ not json",
      });
      assert.equal(malformed.response.status, 400);
      assert.deepEqual(malformed.body, { error: "Invalid JSON body" });
    });
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await closePool();
  }
});
