import type { Express } from "express";
import multer from "multer";
import { addComponent, editComponent, importComponents, listComponents, removeComponent } from "./controller.js";
import { requireAuth, requireRole } from "../auth/middleware.js";

export function registerInventoryRoutes(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      const allowed = /\.(xlsx|xls)$/i.test(file.originalname);
      if (!allowed) {
        callback(new Error("Only .xlsx and .xls files are supported"));
        return;
      }
      callback(null, true);
    },
  });
  app.get("/api/inventory/components", requireAuth, listComponents);
  app.post("/api/inventory/components", requireRole("admin"), addComponent);
  app.put("/api/inventory/components/:id", requireRole("admin"), editComponent);
  app.delete("/api/inventory/components/:id", requireRole("admin"), removeComponent);
  app.post("/api/inventory/import", requireRole("admin"), upload.single("file"), importComponents);
}
