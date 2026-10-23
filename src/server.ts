import express from "express";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadModules } from "./core/moduleLoader.js";

const app = express();
const events = new EventEmitter();
const context = { events };
const port = Number(process.env.PORT ?? 3000);
const modulesDirectory = join(dirname(fileURLToPath(import.meta.url)), "modules");

app.use(express.json());
app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

const modules = await loadModules(app, modulesDirectory, context);

app.listen(port, () => {
  console.log(`IoT club API listening on port ${port}; loaded modules: ${modules.map((module) => module.name).join(", ")}`);
});
