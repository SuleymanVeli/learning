export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return null;
    throw error;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
