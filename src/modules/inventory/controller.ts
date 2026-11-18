import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { isCheckViolation, isUniqueViolation } from "../../core/databaseErrors.js";
import { createComponent, deleteComponent, findComponents, findLocations, updateComponent } from "./database.js";
import { importInventoryWorkbook, InventoryImportError } from "./importer.js";

const componentFields = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  location: z.string().trim().max(80).default(""),
  quantity: z.number().int().min(0),
  available: z.number().int().min(0),
});

const componentSchema = componentFields.refine((value) => value.available <= value.quantity, {
  message: "available cannot exceed quantity",
  path: ["available"],
});

const updateSchema = componentFields.omit({ id: true }).refine((value) => value.available <= value.quantity, {
  message: "available cannot exceed quantity",
  path: ["available"],
});

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid component", details: error.flatten() });
    return;
  }
  if (isUniqueViolation(error)) {
    response.status(409).json({ error: "A component with that id already exists" });
    return;
  }
  if (isCheckViolation(error)) {
    response.status(400).json({ error: "Invalid component quantities" });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
}

export async function listComponents(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ data: await findComponents() });
  } catch (error) {
    next(error);
  }
}

export async function listLocations(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ data: await findLocations() });
  } catch (error) {
    next(error);
  }
}

export async function addComponent(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json({ data: await createComponent(componentSchema.parse(request.body)) });
  } catch (error) {
    handleError(error, response);
  }
}

export async function editComponent(request: Request, response: Response): Promise<void> {
  try {
    const id = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!id) {
      response.status(400).json({ error: "Component id is required" });
      return;
    }
    const component = await updateComponent(id, updateSchema.parse(request.body));
    if (!component) {
      response.status(404).json({ error: "Component not found" });
      return;
    }
    response.json({ data: component });
  } catch (error) {
    handleError(error, response);
  }
}

export async function removeComponent(request: Request, response: Response): Promise<void> {
  try {
    const id = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!id || !(await deleteComponent(id))) {
      response.status(404).json({ error: "Component not found" });
      return;
    }
    response.status(204).send();
  } catch (error) {
    handleError(error, response);
  }
}

export async function importComponents(request: Request, response: Response): Promise<void> {
  if (!request.file) {
    response.status(400).json({ error: "Attach an .xlsx file using the 'file' field" });
    return;
  }

  try {
    const result = await importInventoryWorkbook(request.file.buffer);
    response.json({ data: result });
  } catch (error) {
    if (error instanceof InventoryImportError) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ error: "Could not import inventory" });
  }
}
