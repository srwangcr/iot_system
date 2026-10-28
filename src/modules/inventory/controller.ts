import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createComponent, deleteComponent, findComponents, updateComponent } from "./database.js";

const componentFields = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
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
  if ((error as { code?: string }).code === "23505") {
    response.status(409).json({ error: "A component with that id already exists" });
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
