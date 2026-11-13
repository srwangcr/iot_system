import { createApp } from "./app.js";
import { closePool } from "./core/database.js";

function loadEnvironment(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

loadEnvironment();

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

try {
  const { app, modules } = await createApp();

  const server = app.listen(port, () => {
    console.log(
      `IoT club API listening on port ${port}; loaded modules: ${modules.map((module) => module.name).join(", ")}`,
    );
  });

  server.on("error", (error) => {
    console.error("HTTP server error:", error);
    process.exitCode = 1;
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down...`);

    const forceExit = setTimeout(() => {
      console.error("Graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close((error) => {
      void (async () => {
        try {
          await closePool();
        } catch (poolError) {
          console.error("Error closing database pool:", poolError);
        }
        if (error) {
          console.error("Error closing HTTP server:", error);
          process.exit(1);
        }
        process.exit(0);
      })();
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error("Failed to start IoT club API:", error);
  process.exit(1);
}
