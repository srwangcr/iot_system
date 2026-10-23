const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve("src/modules");
const destinationRoot = path.resolve("dist/modules");

for (const moduleName of fs.readdirSync(sourceRoot)) {
  const sourceManifest = path.join(sourceRoot, moduleName, "manifest.json");
  if (!fs.existsSync(sourceManifest)) continue;

  const destinationDirectory = path.join(destinationRoot, moduleName);
  fs.mkdirSync(destinationDirectory, { recursive: true });
  fs.copyFileSync(sourceManifest, path.join(destinationDirectory, "manifest.json"));
}
