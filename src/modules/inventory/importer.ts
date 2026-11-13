import ExcelJS from "exceljs";
import { z } from "zod";
import { upsertComponents } from "./database.js";
import type { HardwareComponent } from "./types.js";

export class InventoryImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryImportError";
  }
}

const MAX_ROWS = 5000;

const rowSchema = z
  .object({
    id: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(0),
    available: z.number().int().min(0),
  })
  .refine((row) => row.available <= row.quantity, {
    message: "available cannot exceed quantity",
    path: ["available"],
  });

const headerAliases: Record<string, keyof HardwareComponent> = {
  id: "id",
  codigo: "id",
  code: "id",
  name: "name",
  nombre: "name",
  componente: "name",
  category: "category",
  categoria: "category",
  quantity: "quantity",
  cantidad: "quantity",
  total: "quantity",
  available: "available",
  disponible: "available",
  disponibles: "available",
};

const requiredFields = ["id", "name", "category", "quantity", "available"] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function unwrapCellValue(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const cell = value as Record<string, unknown> & {
    richText?: Array<{ text?: string }>;
    result?: unknown;
    text?: unknown;
    error?: unknown;
  };
  if ("result" in cell) return unwrapCellValue(cell.result);
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part) => part.text ?? "").join("");
  }
  if (typeof cell.text === "string") return cell.text;
  if ("error" in cell) return "";
  return value;
}

function normalizeValue(value: unknown, field: keyof HardwareComponent): string | number {
  const unwrapped = unwrapCellValue(value);
  if (field === "quantity" || field === "available") {
    if (typeof unwrapped === "number" && Number.isInteger(unwrapped)) return unwrapped;
    const parsed = Number(String(unwrapped ?? "").trim().replace(",", "."));
    return Number.isInteger(parsed) ? parsed : Number.NaN;
  }
  return String(unwrapped ?? "").trim();
}

function isEmptyRow(values: unknown[]): boolean {
  return values.slice(1).every((value) => String(unwrapCellValue(value) ?? "").trim() === "");
}

export async function importInventoryWorkbook(
  buffer: Buffer,
): Promise<{ imported: number; components: HardwareComponent[] }> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    throw new InventoryImportError("The uploaded file is not a valid .xlsx workbook");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 1) {
    throw new InventoryImportError("The workbook does not contain a sheet");
  }

  const headerRow = worksheet.getRow(1).values as unknown[];
  const columnMap = new Map<number, keyof HardwareComponent>();
  headerRow.forEach((value, index) => {
    if (index === 0) return;
    const field = headerAliases[normalizeHeader(value)];
    if (field) columnMap.set(index, field);
  });

  const mappedFields = new Set(columnMap.values());
  const missing = requiredFields.filter((field) => !mappedFields.has(field));
  if (missing.length > 0) {
    throw new InventoryImportError(`Missing required columns: ${missing.join(", ")}`);
  }

  const rows: Array<{ rowNumber: number; values: unknown[] }> = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    if (isEmptyRow(values)) return;
    rows.push({ rowNumber, values });
  });

  if (rows.length > MAX_ROWS) {
    throw new InventoryImportError(`The workbook exceeds the ${MAX_ROWS} row limit`);
  }

  const components: HardwareComponent[] = [];
  const ids = new Set<string>();

  for (const { rowNumber, values } of rows) {
    const raw = {} as Record<keyof HardwareComponent, string | number>;
    for (const [columnIndex, field] of columnMap) {
      raw[field] = normalizeValue(values[columnIndex], field);
    }

    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
        .join("; ");
      throw new InventoryImportError(`Invalid row ${rowNumber}: ${details}`);
    }
    if (ids.has(parsed.data.id)) {
      throw new InventoryImportError(`Duplicate id "${parsed.data.id}" in row ${rowNumber}`);
    }

    ids.add(parsed.data.id);
    components.push(parsed.data);
  }

  if (components.length === 0) {
    throw new InventoryImportError("The workbook does not contain inventory rows");
  }

  await upsertComponents(components);
  return { imported: components.length, components };
}
