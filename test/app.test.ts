import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import ExcelJS from "exceljs";
import type { Pool } from "pg";
import { newDb } from "pg-mem";
import { createApp } from "../src/app.js";
import { closePool, setPool } from "../src/core/database.js";

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

async function workbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("inventory");
  for (const row of rows) worksheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function workbookForm(buffer: Buffer, filename = "inventory.xlsx"): FormData {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
  return form;
}

test("API end-to-end", async (t) => {
  const database = newDb();
  const { Pool: MemoryPool } = database.adapters.createPg();
  setPool(new MemoryPool() as unknown as Pool);

  const { app, modules } = await createApp({ modulesDirectory });
  assert.deepEqual(
    modules.map((module) => module.name),
    ["auth", "groups", "inventory", "projects"],
  );

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const adminAuth = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  const memberAuth = { Authorization: `Bearer ${MEMBER_TOKEN}` };
  const adminHeaders = { "Content-Type": "application/json", ...adminAuth };
  const memberHeaders = { "Content-Type": "application/json", ...memberAuth };

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
      assert.match(response.headers.get("access-control-allow-methods") ?? "", /PUT/);
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

    await t.test("registration creates member accounts and logs them in", async () => {
      const invalid = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ab", password: "short" }),
      });
      assert.equal(invalid.response.status, 400);

      const registered = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "nuevo.miembro",
          password: "super-secret-123",
          role: "admin",
        }),
      });
      assert.equal(registered.response.status, 201);
      const session = registered.body.data as { token: string; role: string; username: string };
      assert.equal(session.role, "member");
      assert.equal(session.username, "nuevo.miembro");
      assert.match(session.token, /^[a-f0-9]{64}$/);

      const duplicate = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nuevo.miembro", password: "another-secret-123" }),
      });
      assert.equal(duplicate.response.status, 409);

      const reserved = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "another-secret-123" }),
      });
      assert.equal(reserved.response.status, 409);

      const loggedIn = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nuevo.miembro", password: "super-secret-123" }),
      });
      assert.equal(loggedIn.response.status, 200);
      assert.equal((loggedIn.body.data as { token: string }).token, session.token);

      const wrongPassword = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nuevo.miembro", password: "wrong-password" }),
      });
      assert.equal(wrongPassword.response.status, 401);

      const protectedList = await api("/api/inventory/components", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      assert.equal(protectedList.response.status, 200);
    });

    await t.test("protected routes require a valid bearer token", async () => {
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

    await t.test("locations are grouped from the inventory", async () => {
      const { response, body } = await api("/api/inventory/locations", {
        headers: memberHeaders,
      });
      assert.equal(response.status, 200);
      const groups = body.data as Array<{
        location: string;
        componentCount: number;
        totalUnits: number;
        availableUnits: number;
        components: Array<{ id: string }>;
      }>;
      assert.deepEqual(groups.map((group) => group.location), ["A1", "A2", "B1"]);
      const a1 = groups.find((group) => group.location === "A1");
      assert.equal(a1?.componentCount, 1);
      assert.equal(a1?.components[0]?.id, "esp32-devkit");
      assert.equal(a1?.totalUnits, 12);
      assert.equal(a1?.availableUnits, 8);

      const anonymous = await api("/api/inventory/locations");
      assert.equal(anonymous.response.status, 401);
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

    await t.test("admin inventory input is validated", async () => {
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
      const component = {
        id: "arduino-uno",
        name: "Arduino Uno",
        category: "microcontroller",
        location: "C1",
        quantity: 5,
        available: 5,
      };

      const created = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(component),
      });
      assert.equal(created.response.status, 201);
      assert.deepEqual(created.body.data, component);

      const duplicate = await api("/api/inventory/components", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(component),
      });
      assert.equal(duplicate.response.status, 409);

      const updated = await api("/api/inventory/components/arduino-uno", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          name: "Arduino Uno R3",
          category: "microcontroller",
          location: "C2",
          quantity: 7,
          available: 6,
        }),
      });
      assert.equal(updated.response.status, 200);
      assert.equal((updated.body.data as { name: string }).name, "Arduino Uno R3");
      assert.equal((updated.body.data as { location: string }).location, "C2");

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

    await t.test("groups are readable and only admins can write", async () => {
      const list = await api("/api/groups", { headers: memberHeaders });
      assert.equal(list.response.status, 200);
      const seeded = list.body.data as Array<{ id: string }>;
      assert.equal(seeded.length, 2);
      assert.deepEqual(new Set(seeded.map((group) => group.id)), new Set(["iot-core", "robotics-lab"]));

      const forbidden = await api("/api/groups", {
        method: "POST",
        headers: memberHeaders,
        body: JSON.stringify({ id: "nope", name: "Nope" }),
      });
      assert.equal(forbidden.response.status, 403);

      const created = await api("/api/groups", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "test-group",
          name: "Grupo E2E",
          description: "Equipo de pruebas",
          lead: "admin",
          memberCount: 3,
          status: "active",
        }),
      });
      assert.equal(created.response.status, 201);
      assert.deepEqual(created.body.data, {
        id: "test-group",
        name: "Grupo E2E",
        description: "Equipo de pruebas",
        lead: "admin",
        memberCount: 3,
        status: "active",
      });

      const duplicate = await api("/api/groups", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ id: "test-group", name: "Duplicado" }),
      });
      assert.equal(duplicate.response.status, 409);

      const invalid = await api("/api/groups", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ id: "Bad Id", name: "Inválido" }),
      });
      assert.equal(invalid.response.status, 400);

      const updated = await api("/api/groups/test-group", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          name: "Grupo E2E actualizado",
          description: "Equipo de pruebas",
          lead: "member",
          memberCount: 4,
          status: "inactive",
        }),
      });
      assert.equal(updated.response.status, 200);
      assert.equal((updated.body.data as { status: string }).status, "inactive");

      const blockedDelete = await api("/api/groups/iot-core", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(blockedDelete.response.status, 409);
    });

    await t.test("projects are readable, validated and managed by admins", async () => {
      const list = await api("/api/projects", { headers: memberHeaders });
      assert.equal(list.response.status, 200);
      const seeded = list.body.data as Array<{ id: string }>;
      assert.equal(seeded.length, 2);
      assert.deepEqual(
        new Set(seeded.map((project) => project.id)),
        new Set(["smart-greenhouse", "line-follower"]),
      );

      const forbidden = await api("/api/projects", {
        method: "POST",
        headers: memberHeaders,
        body: JSON.stringify({ id: "nope", name: "Nope", groupId: "test-group" }),
      });
      assert.equal(forbidden.response.status, 403);

      const invalidGroup = await api("/api/projects", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "orphan-project",
          name: "Proyecto huérfano",
          groupId: "missing-group",
        }),
      });
      assert.equal(invalidGroup.response.status, 400);

      const invalidDates = await api("/api/projects", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "bad-dates",
          name: "Fechas inválidas",
          groupId: "test-group",
          startDate: "2026-06-01",
          endDate: "2026-01-01",
        }),
      });
      assert.equal(invalidDates.response.status, 400);

      const created = await api("/api/projects", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          id: "e2e-project",
          name: "Proyecto E2E",
          description: "Proyecto de pruebas",
          groupId: "test-group",
          status: "planned",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      });
      assert.equal(created.response.status, 201);
      assert.deepEqual(created.body.data, {
        id: "e2e-project",
        name: "Proyecto E2E",
        description: "Proyecto de pruebas",
        groupId: "test-group",
        status: "planned",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      const updated = await api("/api/projects/e2e-project", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          name: "Proyecto E2E completado",
          description: "Proyecto de pruebas",
          groupId: "test-group",
          status: "completed",
          startDate: "2026-01-01",
          endDate: null,
        }),
      });
      assert.equal(updated.response.status, 200);
      assert.equal((updated.body.data as { status: string }).status, "completed");

      const removed = await api("/api/projects/e2e-project", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(removed.response.status, 204);

      const removedAgain = await api("/api/projects/e2e-project", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(removedAgain.response.status, 404);
    });

    await t.test("a group without projects can be deleted", async () => {
      const removed = await api("/api/groups/test-group", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(removed.response.status, 204);

      const removedAgain = await api("/api/groups/test-group", {
        method: "DELETE",
        headers: adminHeaders,
      });
      assert.equal(removedAgain.response.status, 404);
    });

    await t.test("members cannot import Excel workbooks", async () => {
      const buffer = await workbookBuffer([
        ["id", "name", "category", "quantity", "available"],
        ["blocked", "Blocked", "sensor", 1, 1],
      ]);
      const { response } = await api("/api/inventory/import", {
        method: "POST",
        headers: memberAuth,
        body: workbookForm(buffer),
      });
      assert.equal(response.status, 403);
    });

    await t.test("admins can import and upsert inventory from Excel", async () => {
      const buffer = await workbookBuffer([
        ["id", "name", "category", "location", "quantity", "available"],
        ["dht22", "DHT22 actualizado", "sensor", "D1", 30, 20],
        ["e2e-sensor", "Sensor E2E", "sensor", "D2", 5, 3],
      ]);

      const imported = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(buffer),
      });
      assert.equal(imported.response.status, 200);
      assert.equal((imported.body.data as { imported: number }).imported, 2);

      const list = await api("/api/inventory/components", { headers: memberHeaders });
      const items = list.body.data as Array<{
        id: string;
        name: string;
        location: string;
        quantity: number;
        available: number;
      }>;
      const dht22 = items.find((item) => item.id === "dht22");
      assert.equal(dht22?.name, "DHT22 actualizado");
      assert.equal(dht22?.location, "D1");
      assert.equal(dht22?.quantity, 30);
      assert.equal(items.filter((item) => item.id === "e2e-sensor").length, 1);

      const reimported = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(buffer),
      });
      assert.equal(reimported.response.status, 200);
      assert.equal((reimported.body.data as { imported: number }).imported, 2);

      const afterReimport = await api("/api/inventory/components", { headers: memberHeaders });
      const afterItems = afterReimport.body.data as Array<{ id: string }>;
      assert.equal(afterItems.filter((item) => item.id === "e2e-sensor").length, 1);

      await api("/api/inventory/components/e2e-sensor", {
        method: "DELETE",
        headers: adminHeaders,
      });
    });

    await t.test("admins can import the club inventory layout", async () => {
      const buffer = await workbookBuffer([
        [
          "ID",
          "Nombre",
          "Valor-Serial",
          "Ubicación",
          "Ubicación H",
          "Ubicación V",
          "Cantidad",
          "Disponible",
        ],
        [9001, "Resistencia", "1k", "A5", "A", 5, 20, 18],
        [9002, "Pinzas Caiman", "---", "A1", "A", 1, "--", "--"],
        [" "],
      ]);

      const imported = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(buffer),
      });
      assert.equal(imported.response.status, 200);
      assert.equal((imported.body.data as { imported: number }).imported, 2);

      const importedComponents = (imported.body.data as {
        components: Array<{
          id: string;
          name: string;
          category: string;
          location: string;
          quantity: number;
          available: number;
        }>;
      }).components;
      const resistor = importedComponents.find((component) => component.id === "9001");
      assert.deepEqual(resistor, {
        id: "9001",
        name: "1k",
        category: "Resistencia",
        location: "A5",
        quantity: 20,
        available: 18,
      });
      const pliers = importedComponents.find((component) => component.id === "9002");
      assert.deepEqual(pliers, {
        id: "9002",
        name: "Pinzas Caiman",
        category: "Pinzas Caiman",
        location: "A1",
        quantity: 0,
        available: 0,
      });

      const reimported = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(buffer),
      });
      assert.equal(reimported.response.status, 200);
      assert.equal((reimported.body.data as { imported: number }).imported, 2);

      const list = await api("/api/inventory/components", { headers: memberHeaders });
      const items = list.body.data as Array<{ id: string }>;
      assert.equal(items.filter((item) => item.id === "9001").length, 1);
      assert.equal(items.filter((item) => item.id === "9002").length, 1);

      const locations = await api("/api/inventory/locations", { headers: memberHeaders });
      assert.equal(locations.response.status, 200);
      const locationGroups = locations.body.data as Array<{
        location: string;
        components: Array<{ id: string; location: string }>;
      }>;
      const a5 = locationGroups.find((group) => group.location === "A5");
      assert.ok(a5?.components.some((component) => component.id === "9001"));
      const a1 = locationGroups.find((group) => group.location === "A1");
      assert.ok(a1?.components.some((component) => component.id === "9002"));

      for (const id of ["9001", "9002"]) {
        await api(`/api/inventory/components/${id}`, {
          method: "DELETE",
          headers: adminHeaders,
        });
      }
    });

    await t.test("Excel import rejects invalid files and rows", async () => {
      const missingColumns = await workbookBuffer([
        ["foo", "bar"],
        ["a", "b"],
      ]);
      const missing = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(missingColumns),
      });
      assert.equal(missing.response.status, 400);
      assert.match(missing.body.error ?? "", /Missing required columns/);

      const invalidRow = await workbookBuffer([
        ["id", "name", "category", "quantity", "available"],
        ["bad-row", "Bad row", "sensor", 1, 2],
      ]);
      const invalid = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(invalidRow),
      });
      assert.equal(invalid.response.status, 400);
      assert.match(invalid.body.error ?? "", /Invalid row 2/);

      const validWorkbook = await workbookBuffer([
        ["id", "name", "category", "quantity", "available"],
        ["csv-attempt", "CSV attempt", "sensor", 1, 1],
      ]);
      const wrongExtension = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: workbookForm(validWorkbook, "inventory.csv"),
      });
      assert.equal(wrongExtension.response.status, 400);
      assert.match(wrongExtension.body.error ?? "", /Only \.xlsx files/);

      const noFileForm = new FormData();
      const noFile = await api("/api/inventory/import", {
        method: "POST",
        headers: adminAuth,
        body: noFileForm,
      });
      assert.equal(noFile.response.status, 400);
      assert.match(noFile.body.error ?? "", /Attach an \.xlsx file/);
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
