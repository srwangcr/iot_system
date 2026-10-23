import ExcelJS from "exceljs";
import { z } from "zod";
import { upsertComponents } from "./database.js";
import type { HardwareComponent } from "./types.js";

const rowSchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(0),
  available: z.number().int().min(0),
}).refine((row) => row.available <= row.quantity, {
  message: "available cannot exceed quantity",
  path: ["available"],
});

const headers: Record<string, keyof HardwareComponent> = {
  id: "id",
  codigo: "id",
  code: "id",
  name: "name",
  nombre: "name",
  componente: "name",
  category: "category",
  categoria: "category",
  categoría: "category",
  quantity: "quantity",
  cantidad: "quantity",
  total: "quantity",
  available: "available",
  disponible: "available",
  disponibles: "available",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeValue(value: unknown, field: keyof HardwareComponent): string | number {
  if (field === "quantity" || field === "available") {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    const parsed = Number(String(value ?? "").replace(",", ".").trim());
    return Number.isInteger(parsed) ? parsed : Number.NaN;
  }
  return String(value ?? "").trim();
}

export async function importInventoryWorkbook(
  buffer: Buffer,
): Promise<{ imported: number; components: HardwareComponent[] }> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 1) throw new Error("The workbook does not contain a sheet");

  const headerRow = worksheet.getRow(1).values as unknown[];
  const dataRows = Array.from({ length: worksheet.rowCount - 1 }, (_, index) =>
    worksheet.getRow(index + 2).values as unknown[],
  );

  const columnMap = new Map<number, keyof HardwareComponent>();
  headerRow.forEach((value, index) => {
    if (index === 0) return;
    const field = headers[normalizeHeader(value)];
    if (field) columnMap.set(index, field);
  });
  const required = ["id", "name", "category", "quantity", "available"] as const;
  const missing = required.filter((field) => ![...columnMap.values()].includes(field));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const components: HardwareComponent[] = [];
  const ids = new Set<string>();
  for (const [index, row] of dataRows.entries()) {
    if (!Array.isArray(row) || row.slice(1).every((value) => String(value ?? "").trim() === "")) continue;
    const raw = {} as Record<keyof HardwareComponent, string | number>;
    for (const [columnIndex, field] of columnMap) raw[field] = normalizeValue(row[columnIndex], field);
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid row ${index + 2}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
    }
    if (ids.has(parsed.data.id)) throw new Error(`Duplicate id "${parsed.data.id}" in row ${index + 2}`);
    ids.add(parsed.data.id);
    components.push(parsed.data);
  }
  if (components.length === 0) throw new Error("The workbook does not contain inventory rows");

  await upsertComponents(components);
  return { imported: components.length, components };
}
