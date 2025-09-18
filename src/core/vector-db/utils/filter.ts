/**
 * Get nested value from an object using dot notation path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object"
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Apply metadata filter to check if metadata matches filter criteria
 */
export function applyMetadataFilter(
  metadata: Record<string, unknown> | undefined,
  filter: Record<string, unknown>,
): boolean {
  if (!metadata) {
    return false;
  }

  for (const [key, value] of Object.entries(filter)) {
    // Support nested properties using dot notation (e.g., "boundary.type")
    const actualValue = key.includes(".")
      ? getNestedValue(metadata, key)
      : metadata[key];

    if (actualValue !== value) {
      return false;
    }
  }

  return true;
}

import type { SQLInputValue } from "node:sqlite";

/**
 * Build SQL conditions for filtering
 */
export function buildSQLFilterConditions(filter: Record<string, unknown>): {
  conditions: string[];
  params: SQLInputValue[];
} {
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];

  for (const [key, value] of Object.entries(filter)) {
    conditions.push(`json_extract(metadata, '$.${key}') = ?`);
    // Convert value to SQLInputValue-compatible type
    let sqlValue: SQLInputValue;
    if (value === null || value === undefined) {
      sqlValue = null;
    } else if (typeof value === "boolean") {
      // Convert boolean to number for SQLite (0/1)
      sqlValue = value ? 1 : 0;
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      sqlValue = value;
    } else {
      // For other types, convert to string
      sqlValue = String(value);
    }
    params.push(sqlValue);
  }

  return { conditions, params };
}

/**
 * Build SQL WHERE clause from filter
 */
export function buildSQLWhereClause(filter?: Record<string, unknown>): {
  whereClause: string;
  params: SQLInputValue[];
} {
  if (!filter || Object.keys(filter).length === 0) {
    return { whereClause: "", params: [] };
  }

  const { conditions, params } = buildSQLFilterConditions(filter);
  return {
    whereClause: conditions.join(" AND "),
    params,
  };
}
