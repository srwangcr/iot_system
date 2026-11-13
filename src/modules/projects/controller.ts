import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  isCheckViolation,
  isForeignKeyViolation,
  isUniqueViolation,
} from "../../core/databaseErrors.js";
import { createProject, deleteProject, findProjects, updateProject } from "./database.js";
import { PROJECT_STATUSES } from "./types.js";

const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/);

function isValidIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD")
  .refine(isValidIsoDate, "must be a valid calendar date");

const projectFields = z.object({
  id: slug,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  groupId: slug,
  status: z.enum(PROJECT_STATUSES).default("planned"),
  startDate: isoDate.nullable().default(null),
  endDate: isoDate.nullable().default(null),
});

function hasValidDateRange(value: {
  startDate?: string | null;
  endDate?: string | null;
}): boolean {
  return !value.startDate || !value.endDate || value.endDate >= value.startDate;
}

const dateRangeError = {
  message: "endDate cannot be before startDate",
  path: ["endDate"],
};

const projectSchema = projectFields.refine(hasValidDateRange, dateRangeError);
const updateSchema = projectFields.omit({ id: true }).refine(hasValidDateRange, dateRangeError);

function handleError(error: unknown, response: Response): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid project", details: error.flatten() });
    return;
  }
  if (isUniqueViolation(error)) {
    response.status(409).json({ error: "A project with that id already exists" });
    return;
  }
  if (isForeignKeyViolation(error)) {
    response.status(400).json({ error: "The selected group does not exist" });
    return;
  }
  if (isCheckViolation(error)) {
    response.status(400).json({ error: "Invalid project values" });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
}

export async function listProjects(_request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    response.json({ data: await findProjects() });
  } catch (error) {
    next(error);
  }
}

export async function addProject(request: Request, response: Response): Promise<void> {
  try {
    response.status(201).json({ data: await createProject(projectSchema.parse(request.body)) });
  } catch (error) {
    handleError(error, response);
  }
}

export async function editProject(request: Request, response: Response): Promise<void> {
  try {
    const id = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!id) {
      response.status(400).json({ error: "Project id is required" });
      return;
    }
    const project = await updateProject(id, updateSchema.parse(request.body));
    if (!project) {
      response.status(404).json({ error: "Project not found" });
      return;
    }
    response.json({ data: project });
  } catch (error) {
    handleError(error, response);
  }
}

export async function removeProject(request: Request, response: Response): Promise<void> {
  try {
    const id = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!id || !(await deleteProject(id))) {
      response.status(404).json({ error: "Project not found" });
      return;
    }
    response.status(204).send();
  } catch (error) {
    handleError(error, response);
  }
}
