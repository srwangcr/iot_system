import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  isCheckViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../../core/databaseErrors.js";
import { createGroup, deleteGroup, findGroups, updateGroup } from "./database.js";
import { GROUP_STATUSES } from "./types.js";

const groupFields = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  lead: z.string().trim().max(120).default(""),
  memberCount: z.number().int().min(0).max(10000).default(0),
  status: z.enum(GROUP_STATUSES).default("active"),
});

const updateSchema = groupFields.omit({ id: true });

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid group", details: error.flatten() });
    return;
  }
  if (isUniqueViolation(error)) {
    response.status(409).json({ error: "A group with that id already exists" });
    return;
  }
  if (isForeignKeyViolation(error)) {
    response.status(409).json({ error: "The group still has projects assigned" });
    return;
  }
  if (isCheckViolation(error)) {
    response.status(400).json({ error: "Invalid group values" });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
}

export async function listGroups(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ data: await findGroups() });
  } catch (error) {
    next(error);
  }
}

export async function addGroup(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json({ data: await createGroup(groupFields.parse(request.body)) });
  } catch (error) {
    handleError(error, response);
  }
}

export async function editGroup(request: Request, response: Response): Promise<void> {
  try {
    const id = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!id) {
      response.status(400).json({ error: "Group id is required" });
      return;
    }
    const group = await updateGroup(id, updateSchema.parse(request.body));
    if (!group) {
      response.status(404).json({ error: "Group not found" });
      return;
    }
    response.json({ data: group });
  } catch (error) {
    handleError(error, response);
  }
}

export async function removeGroup(request: Request, response: Response): Promise<void> {
  try {
    const id = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!id || !(await deleteGroup(id))) {
      response.status(404).json({ error: "Group not found" });
      return;
    }
    response.status(204).send();
  } catch (error) {
    handleError(error, response);
  }
}
