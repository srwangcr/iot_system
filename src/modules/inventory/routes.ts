import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import {
  addComponent,
  editComponent,
  importComponents,
  listComponents,
  listLocations,
  removeComponent,
} from "./controller.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      callback(new Error("Only .xlsx files are supported"));
      return;
    }
    callback(null, true);
  },
});

function uploadSingleWorkbook(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  upload.single("file")(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "The file exceeds the 10 MB limit"
          : error.message;
      response.status(400).json({ error: message });
      return;
    }
    response.status(400).json({
      error: error instanceof Error ? error.message : "Invalid upload",
    });
  });
}

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory/components", requireAuth, listComponents);
  app.get("/api/inventory/locations", requireAuth, listLocations);
  app.post("/api/inventory/components", requireRole("admin"), addComponent);
  app.put("/api/inventory/components/:id", requireRole("admin"), editComponent);
  app.delete("/api/inventory/components/:id", requireRole("admin"), removeComponent);
  app.post("/api/inventory/import", requireRole("admin"), uploadSingleWorkbook, importComponents);
}
