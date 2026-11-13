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

type InventoryField = keyof HardwareComponent;

const requiredFields = ["id", "name", "category", "quantity", "available"] as const;

/**
 * The club workbook uses "Valor-Serial" for the specific model/value and
 * "Nombre" for the component type. When that column is present we treat
 * "Nombre" as the category and "Valor-Serial" as the display name.
 */
const clubValueAliases = ["valor-serial", "valor-serial-", "valor", "serial", "modelo", "model"];

const fieldAliases: Record<InventoryField, string[]> = {
  id: ["id", "codigo", "code"],
  name: ["name", "nombre", "componente"],
  category: ["category", "categoria", "tipo"],
  quantity: ["quantity", "cantidad", "total", "stock"],
  available: ["available", "disponible", "disponibles"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function isPlaceholder(value: string): boolean {
  const text = value.trim();
  return text === "" || /^[-–—]+$/.test(text) || /^(n\/?a|sin dato|s\/d)$/i.test(text);
}

function normalizeCount(value: unknown, lenient: boolean): number {
  const unwrapped = unwrapCellValue(value);
  if (typeof unwrapped === "number") {
    return Number.isInteger(unwrapped) ? unwrapped : Number.NaN;
  }

  const text = String(unwrapped ?? "").trim();
  if (text === "") return lenient ? 0 : Number.NaN;
  if (isPlaceholder(text)) return lenient ? 0 : Number.NaN;

  const parsed = Number(text.replace(",", "."));
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function normalizeText(value: unknown): string {
  return String(unwrapCellValue(value) ?? "").trim();
}

function normalizeClubId(value: unknown): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface ColumnMapping {
  columnMap: Map<number, InventoryField>;
  clubLayout: boolean;
}

function buildColumnMapping(headerRow: unknown[]): {
  mapping: ColumnMapping;
  missing: InventoryField[];
} {
  const columns: Array<{ index: number; key: string }> = [];
  headerRow.forEach((value, index) => {
    if (index === 0) return;
    const key = normalizeHeader(value);
    if (key) columns.push({ index, key });
  });

  const headerKeys = new Set(columns.map((column) => column.key));
  const clubLayout = clubValueAliases.some((alias) => headerKeys.has(alias));

  const columnMap = new Map<number, InventoryField>();
  const usedColumns = new Set<number>();

  function assign(field: InventoryField, aliases: string[]): void {
    for (const alias of aliases) {
      const column = columns.find((candidate) => candidate.key === alias && !usedColumns.has(candidate.index));
      if (column) {
        usedColumns.add(column.index);
        columnMap.set(column.index, field);
        return;
      }
    }
  }

  assign("id", fieldAliases.id);
  assign(
    "name",
    clubLayout
      ? [...clubValueAliases, "name", "componente"]
      : fieldAliases.name,
  );
  assign(
    "category",
    clubLayout
      ? [...fieldAliases.category, "nombre"]
      : fieldAliases.category,
  );
  assign("quantity", fieldAliases.quantity);
  assign("available", fieldAliases.available);

  const mappedFields = new Set(columnMap.values());
  const missing = requiredFields.filter((field) => !mappedFields.has(field));
  return { mapping: { columnMap, clubLayout }, missing };
}

interface SheetLayout extends ColumnMapping {
  worksheet: ExcelJS.Worksheet;
}

function resolveSheetLayout(workbook: ExcelJS.Workbook): SheetLayout {
  let firstMissing: InventoryField[] | undefined;

  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount < 1) continue;
    const headerRow = worksheet.getRow(1).values as unknown[];
    const { mapping, missing } = buildColumnMapping(headerRow);
    if (missing.length === 0) return { worksheet, ...mapping };
    firstMissing ??= missing;
  }

  if (firstMissing) {
    throw new InventoryImportError(`Missing required columns: ${firstMissing.join(", ")}`);
  }
  throw new InventoryImportError("The workbook does not contain a sheet");
}

function isEmptyRow(values: unknown[], columnMap: Map<number, InventoryField>): boolean {
  const textFields = new Set<InventoryField>(["id", "name", "category"]);
  for (const [index, field] of columnMap) {
    if (!textFields.has(field)) continue;
    if (normalizeText(values[index]) !== "") return false;
  }
  return true;
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

  const { worksheet, columnMap, clubLayout } = resolveSheetLayout(workbook);

  const rows: Array<{ rowNumber: number; values: unknown[] }> = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    if (isEmptyRow(values, columnMap)) return;
    rows.push({ rowNumber, values });
  });

  if (rows.length > MAX_ROWS) {
    throw new InventoryImportError(`The workbook exceeds the ${MAX_ROWS} row limit`);
  }

  const components: HardwareComponent[] = [];
  const ids = new Set<string>();

  for (const { rowNumber, values } of rows) {
    const raw = {} as Record<InventoryField, string | number>;

    for (const [columnIndex, field] of columnMap) {
      if (field === "quantity" || field === "available") {
        raw[field] = normalizeCount(values[columnIndex], clubLayout);
      } else {
        raw[field] = normalizeText(values[columnIndex]);
      }
    }

    if (clubLayout) {
      raw.id = normalizeClubId(raw.id);
      const category = normalizeText(raw.category);
      const value = normalizeText(raw.name);
      if (category && isPlaceholder(value)) raw.name = category;
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
