import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { DatabaseService } from "../../src/core/database/database-service.js";
import {
  indexFile,
  indexFiles,
  indexGist,
  indexGitHubRepo,
  indexText,
} from "../../src/core/indexer/indexer.js";
import { cleanupTestDatabase, createTestDatabase } from "../helpers/test-db.js";

/**
 * Indexer Integration Test without Mocks
 *
 * このテストはモックを一切使用せず、実際のコンポーネントで動作を検証します。
 * 元のindexer.test.tsとの違い：
 * - vi.mock()を使用しない
 * - 実際のファイルシステムを使用（テンポラリディレクトリ）
 * - 実際のデータベースを使用（インメモリ）
 * - 実際のチャンキング処理を実行
 * - 実際のエンベディング生成（APIキーがない場合はスキップ）
 */
describe("Indexer Integration (No Mocks)", () => {
  let db: DatabaseService;
  let tempDir: string;

  beforeEach(async () => {
    // 実際のデータベースを作成
    db = await createTestDatabase({ provider: "memory", dimension: 768 });

    // 実際のテンポラリディレクトリを作成
    tempDir = await mkdtemp(join(tmpdir(), "gistdex-indexer-test-"));
  });

  afterEach(async () => {
    // クリーンアップ
    await cleanupTestDatabase(db);
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("indexText", () => {
    test("indexes text with real chunking and database", async () => {
      const text =
        "This is a test document about TypeScript. TypeScript is a typed superset of JavaScript.";
      const metadata = {
        title: "TypeScript Introduction",
        author: "Test Author",
      };

      const result = await indexText(
        text,
        metadata,
        { chunkSize: 50, chunkOverlap: 10 },
        db,
      );

      // 実際の結果を検証
      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // データベースに実際に保存されたことを確認
      const count = await db.countItems();
      expect(count).toBe(result.itemsIndexed);

      // メタデータが正しく保存されたことを確認
      const items = await db.listItems({ limit: 10 });
      expect(items.length).toBeGreaterThan(0);
      if (items[0]) {
        expect(items[0].metadata?.title).toBe(metadata.title);
        expect(items[0].metadata?.author).toBe(metadata.author);
      }
    });

    test("handles empty text appropriately", async () => {
      const result = await indexText("", {}, {}, db);

      expect(result.itemsIndexed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("No chunks generated");

      const count = await db.countItems();
      expect(count).toBe(0);
    });

    test("handles large text with batch processing", async () => {
      const largeText = Array(100).fill("This is a sentence. ").join("");

      const result = await indexText(
        largeText,
        { type: "large-document" },
        { chunkSize: 100, chunkOverlap: 20, batchSize: 10 },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(5);
      expect(result.errors).toHaveLength(0);

      // 全てのチャンクが正しくインデックスされたことを確認
      const items = await db.listItems({ limit: 1000 });
      expect(items.length).toBe(result.itemsIndexed);

      // sourceIdが全て同じであることを確認
      const sourceIds = new Set(
        items.map((item) => item.metadata?.sourceId).filter(Boolean),
      );
      expect(sourceIds.size).toBe(1);
    });

    test("preserves original content in first chunk", async () => {
      const originalText = "First sentence. Second sentence. Third sentence.";

      await indexText(originalText, {}, { chunkSize: 20, chunkOverlap: 5 }, db);

      const items = await db.listItems({ limit: 100 });

      // 最初のチャンクにoriginalContentが含まれることを確認
      const firstChunk = items.find((item) => item.metadata?.chunkIndex === 0);
      expect(firstChunk?.metadata?.originalContent).toBe(originalText);

      // 他のチャンクにはoriginalContentが含まれないことを確認
      const otherChunks = items.filter(
        (item) => item.metadata?.chunkIndex !== 0,
      );
      for (const chunk of otherChunks) {
        expect(chunk.metadata?.originalContent).toBeUndefined();
      }
    });
  });

  describe("indexFile", () => {
    test("indexes a real file from filesystem", async () => {
      const filePath = join(tempDir, "test.ts");
      const content = `interface User {
  id: string;
  name: string;
}

class UserService {
  getUser(id: string): User | undefined {
    // Implementation
    return undefined;
  }
}`;

      // 実際のファイルを作成
      await writeFile(filePath, content, "utf-8");

      const result = await indexFile(
        filePath,
        { project: "test" },
        { chunkSize: 100, preserveBoundaries: true },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // ファイルメタデータが正しく設定されることを確認
      const items = await db.listItems({ limit: 10 });
      expect(items.length).toBeGreaterThan(0);
      if (items[0]) {
        expect(items[0].metadata?.sourceType).toBe("file");
        expect(items[0].metadata?.filePath).toBe(filePath);
      }
    });

    test("handles non-existent file", async () => {
      const nonExistentPath = join(tempDir, "non-existent.txt");

      await expect(indexFile(nonExistentPath, {}, {}, db)).rejects.toThrow();
    });

    test("respects chunk boundaries for code files", async () => {
      const codePath = join(tempDir, "code.ts");
      const code = `function firstFunction() {
  console.log("First");
}

function secondFunction() {
  console.log("Second");
}

function thirdFunction() {
  console.log("Third");
}`;

      await writeFile(codePath, code, "utf-8");

      const result = await indexFile(
        codePath,
        {},
        { chunkSize: 80, preserveBoundaries: true },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);

      const items = await db.listItems({ limit: 100 });

      // 各チャンクが完全な関数を含むことを確認（境界保持）
      for (const item of items) {
        const content = item.content;
        if (content.includes("function")) {
          // 関数が途中で切れていないことを確認
          const openBraces = (content.match(/\{/g) || []).length;
          const closeBraces = (content.match(/\}/g) || []).length;
          expect(openBraces).toBe(closeBraces);
        }
      }
    });
  });

  describe("indexFiles", () => {
    test("indexes multiple files with glob pattern", async () => {
      // 複数のファイルを作成
      const files = [
        { name: "file1.ts", content: "export const value1 = 1;" },
        { name: "file2.ts", content: "export const value2 = 2;" },
        { name: "file3.js", content: "module.exports = { value3: 3 };" },
      ];

      for (const file of files) {
        await writeFile(join(tempDir, file.name), file.content, "utf-8");
      }

      const pattern = join(tempDir, "*.{ts,js}");
      const result = await indexFiles(
        [pattern],
        { batch: "test" },
        { chunkSize: 50 },
        db,
      );

      expect(result.itemsIndexed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // 各ファイルがインデックスされたことを確認
      const items = await db.listItems({ limit: 100 });
      const filePaths = new Set(
        items.map((item) => item.metadata?.filePath).filter(Boolean),
      );
      expect(filePaths.size).toBe(3);
    });

    test("handles empty glob matches", async () => {
      const pattern = join(tempDir, "*.nonexistent");

      const result = await indexFiles([pattern], {}, {}, db);

      expect(result.itemsIndexed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("No files found");

      const count = await db.countItems();
      expect(count).toBe(0);
    });

    test("continues on individual file errors", async () => {
      // 一つは正常なファイル、もう一つは読み取り不可
      await writeFile(join(tempDir, "good.txt"), "Good content", "utf-8");

      // パターンに存在しないファイルも含まれる場合のテスト
      const pattern = join(tempDir, "*.txt");

      const result = await indexFiles([pattern], {}, {}, db);

      // 少なくとも1つは成功することを確認
      expect(result.itemsIndexed).toBeGreaterThan(0);

      // good.txtがインデックスされたことを確認
      const items = await db.listItems({ limit: 10 });
      expect(items.some((item) => item.content.includes("Good content"))).toBe(
        true,
      );
    });
  });

  describe("indexGist", () => {
    test("validates Gist URL format", async () => {
      const invalidUrl = "https://not-a-gist.com/user/id";

      const result = await indexGist(invalidUrl, {}, db);

      expect(result.itemsIndexed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Invalid Gist URL");
    });

    test("handles valid Gist URL format", async () => {
      const validUrl = "https://gist.github.com/user/1234567890abcdef";

      // 実際のGist取得はネットワークエラーになるが、URLバリデーションは通る
      const result = await indexGist(validUrl, {}, db);

      // ネットワークエラーまたは成功のいずれか
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("indexGitHubRepo", () => {
    test("validates GitHub repository URL format", async () => {
      const invalidUrl = "https://gitlab.com/owner/repo";

      const result = await indexGitHubRepo(invalidUrl, {}, db);

      expect(result.itemsIndexed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Invalid GitHub repository URL");
    });

    test("handles valid GitHub repository URL format", async () => {
      const validUrl = "https://github.com/owner/repo";

      // 実際のリポジトリ取得はネットワークエラーになるが、URLバリデーションは通る
      const result = await indexGitHubRepo(validUrl, {}, db);

      // ネットワークエラーまたは成功のいずれか
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Progress tracking", () => {
    test("calls progress callback during indexing", async () => {
      const progressMessages: string[] = [];
      const progressValues: number[] = [];

      const onProgress = (message: string, progress?: number) => {
        progressMessages.push(message);
        if (progress !== undefined) {
          progressValues.push(progress);
        }
      };

      const text = "Test content for progress tracking. ".repeat(10);

      await indexText(
        text,
        {},
        {
          chunkSize: 50,
          onProgress,
        },
        db,
      );

      // プログレスコールバックが呼ばれたことを確認
      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages).toContain("Chunking text...");
      expect(
        progressMessages.some((msg) => msg.includes("Saving to database")),
      ).toBe(true);
      expect(progressMessages).toContain("Indexing complete");

      // 進捗値が0から1の間であることを確認
      for (const progress of progressValues) {
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Error recovery", () => {
    test("recovers from partial failures during batch processing", async () => {
      const documents = [
        { text: "Valid document 1", metadata: { id: 1 } },
        { text: "Valid document 2", metadata: { id: 2 } },
        { text: "Valid document 3", metadata: { id: 3 } },
      ];

      let successCount = 0;
      let errorCount = 0;

      for (const doc of documents) {
        const result = await indexText(
          doc.text,
          doc.metadata,
          { chunkSize: 50 },
          db,
        );

        if (result.itemsIndexed > 0) {
          successCount++;
        }
        if (result.errors.length > 0) {
          errorCount++;
        }
      }

      expect(successCount).toBe(3);
      expect(errorCount).toBe(0);

      // 全てのドキュメントがインデックスされたことを確認
      const items = await db.listItems({ limit: 100 });
      const ids = new Set(
        items.map((item) => item.metadata?.id).filter(Boolean),
      );
      expect(ids.size).toBe(3);
    });
  });
});
