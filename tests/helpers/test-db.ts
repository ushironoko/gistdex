import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseService } from "../../src/core/database/database-service.js";
import { createDatabaseService } from "../../src/core/database/database-service.js";
import type { VectorDBConfig } from "../../src/core/vector-db/adapters/types.js";

export interface TestDatabaseOptions {
  provider?: "memory" | "sqlite";
  dimension?: number;
  persistData?: boolean;
}

export async function createTestDatabase(
  options: TestDatabaseOptions = {},
): Promise<DatabaseService> {
  const { provider = "memory", dimension = 768, persistData = false } = options;

  const service = createDatabaseService();

  if (provider === "memory") {
    const config: VectorDBConfig = {
      provider: "memory",
      options: {
        dimension,
      },
    };
    await service.initialize(config);
    return service;
  }

  if (provider === "sqlite") {
    const tempDir = await mkdtemp(join(tmpdir(), "gistdex-test-"));
    const dbPath = join(tempDir, "test.db");

    const config: VectorDBConfig = {
      provider: "sqlite",
      options: {
        path: dbPath,
        dimension,
      },
    };

    await service.initialize(config);

    if (!persistData) {
      const originalClose = service.close.bind(service);
      service.close = async () => {
        await originalClose();
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      };
    }

    return service;
  }

  throw new Error(`Unsupported test database provider: ${provider}`);
}

export async function createTestDatabaseWithData(
  data: Array<{
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>,
  options: TestDatabaseOptions = {},
): Promise<DatabaseService> {
  const db = await createTestDatabase(options);

  for (const item of data) {
    await db.saveItem({
      content: item.content,
      embedding: item.embedding,
      metadata: item.metadata || {},
    });
  }

  return db;
}

export async function cleanupTestDatabase(db: DatabaseService): Promise<void> {
  try {
    await db.close();
  } catch (error) {
    console.error("Failed to cleanup test database:", error);
  }
}

export function createMockEmbedding(dimension: number = 768): number[] {
  const embedding = new Array(dimension);
  for (let i = 0; i < dimension; i++) {
    embedding[i] = Math.random() * 2 - 1;
  }
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map((val) => val / norm);
}

export function createSimilarEmbedding(
  baseEmbedding: number[],
  similarity: number = 0.9,
): number[] {
  const dimension = baseEmbedding.length;
  const noise = createMockEmbedding(dimension);

  const result = baseEmbedding.map(
    (val, i) => val * similarity + (noise[i] ?? 0) * (1 - similarity),
  );

  const norm = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
  return result.map((val) => val / norm);
}
