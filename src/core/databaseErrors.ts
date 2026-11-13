function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === "23505" || /duplicate key|unique constraint/i.test(errorMessage(error));
}

export function isForeignKeyViolation(error: unknown): boolean {
  return errorCode(error) === "23503" || /foreign key/i.test(errorMessage(error));
}

export function isCheckViolation(error: unknown): boolean {
  return errorCode(error) === "23514" || /check constraint/i.test(errorMessage(error));
}
