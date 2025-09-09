/**
 * Common configuration parsing utilities to reduce code duplication
 */

/**
 * Parse a string value to integer with optional default
 */
export function parseInteger(
  value: string | number | undefined,
  defaultValue?: number,
): number | undefined {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "number") {
    return Math.floor(value);
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  // Check if the string represents a valid integer (no decimals)
  if (value.includes(".")) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse a string or boolean value to boolean with optional default
 */
export function parseBoolean(
  value: string | boolean | undefined,
  defaultValue?: boolean,
): boolean | undefined {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const lowerValue = value.toLowerCase();
  if (lowerValue === "true" || lowerValue === "1") {
    return true;
  }
  if (lowerValue === "false" || lowerValue === "0") {
    return false;
  }

  return defaultValue;
}

/**
 * Parse a comma-separated string or array to string array
 */
export function parseStringArray(
  value: string | string[] | undefined,
): string[] {
  if (!value || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse options object with type hints and defaults
 */
export function parseOptions<T extends Record<string, unknown>>(
  input: Record<string, unknown>,
  schema: Record<keyof T, "string" | "number" | "boolean" | "array">,
  defaults?: Partial<T>,
): T {
  const result: Record<string, unknown> = {};

  for (const [key, type] of Object.entries(schema)) {
    const value = input[key];
    const defaultValue = defaults?.[key as keyof T];

    switch (type) {
      case "number":
        result[key] = parseInteger(
          value as string | number | undefined,
          defaultValue as number | undefined,
        );
        break;
      case "boolean":
        result[key] = parseBoolean(
          value as string | boolean | undefined,
          defaultValue as boolean | undefined,
        );
        break;
      case "array":
        result[key] = value
          ? parseStringArray(value as string | string[])
          : (defaultValue as string[] | undefined) || [];
        break;
      default:
        result[key] = value || defaultValue || undefined;
        break;
    }
  }

  return result as T;
}
