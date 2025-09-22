/**
 * モジュールモック定義
 *
 * vi.mockで定義されていたモジュールモックをBunのmock.moduleで事前定義します。
 * これらのモックはテスト実行前にロードされ、全テストで共有されます。
 */

import { jest, mock } from "bun:test";

// Vitest compatibility - create global vi object
// @ts-expect-error - Adding vi to globalThis
globalThis.vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  mock: mock.module,
  clearAllMocks: jest.clearAllMocks,
  restoreAllMocks: jest.restoreAllMocks,
  mocked: <T>(fn: T): T => fn,
  importActual: async (id: string) => import(id),
};

// =====================================
// External Dependencies Mocks
// =====================================

// SQLite関連のモック
mock.module("node:sqlite", () => ({
  DatabaseSync: jest.fn().mockImplementation(() => ({
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
    }),
    close: jest.fn(),
    exec: jest.fn(),
    loadExtension: jest.fn(),
  })),
}));

// sqlite-vecモック
mock.module("sqlite-vec", () => ({
  loadVector0: jest.fn(),
  loadVss0: jest.fn(),
}));

// better-sqlite3モック（SQLiteの代替実装）
mock.module("better-sqlite3", () => ({
  default: jest.fn(() => ({
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
    }),
    close: jest.fn(),
    loadExtension: jest.fn(),
    exec: jest.fn(),
  })),
}));

// @ai-sdk/googleモック
mock.module("@ai-sdk/google", () => ({
  google: jest.fn(() => ({
    embedding: jest.fn().mockReturnValue({
      embed: jest.fn().mockResolvedValue({
        embedding: Array(768).fill(0.1),
      }),
    }),
  })),
}));

// aiモック
mock.module("ai", () => ({
  embed: jest.fn().mockResolvedValue({
    embedding: [0.1, 0.2, 0.3],
  }),
  embedMany: jest.fn().mockResolvedValue({
    embeddings: [[0.1, 0.2, 0.3]],
  }),
}));

// @inquirer/promptsモック
mock.module("@inquirer/prompts", () => ({
  confirm: jest.fn().mockResolvedValue(true),
  input: jest.fn().mockResolvedValue("test"),
  select: jest.fn().mockResolvedValue("option1"),
}));

// consolaモック
mock.module("consola", () => ({
  default: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    box: jest.fn(),
  },
}));

// =====================================
// Node.js Built-in Modules Mocks
// =====================================

// fs/promisesモック
mock.module("node:fs/promises", () => ({
  readFile: jest.fn().mockResolvedValue("content"),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({
    isDirectory: jest.fn().mockReturnValue(true),
    isFile: jest.fn().mockReturnValue(false),
  }),
  rm: jest.fn().mockResolvedValue(undefined),
  readlink: jest.fn().mockResolvedValue("/path/to/link"),
  realpath: jest.fn().mockResolvedValue("/real/path"),
  glob: jest.fn().mockResolvedValue([]),
}));

// fsモック
mock.module("node:fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue("content"),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  statSync: jest.fn().mockReturnValue({
    isDirectory: jest.fn().mockReturnValue(true),
    isFile: jest.fn().mockReturnValue(false),
  }),
}));

// =====================================
// Internal Module Mocks (Commented Out)
// =====================================

// 内部モジュールのモックは、各テストファイルで個別に定義する方が良い
// なぜなら、テストごとに異なる動作が必要な場合があるため

/*
// Example: これらは各テストファイルで定義すべき
mock.module("../../core/database/database-service.js", () => ({
  createDatabaseService: jest.fn().mockResolvedValue({
    initialize: jest.fn(),
    close: jest.fn(),
    saveItems: jest.fn().mockResolvedValue(["id1", "id2"]),
    searchItems: jest.fn().mockResolvedValue([]),
    getStats: jest.fn().mockResolvedValue({
      totalItems: 0,
      totalChunks: 0
    })
  })
}));
*/

// =====================================
// Mock Helpers
// =====================================

// グローバルなモックリセット関数
export const resetAllMocks = () => {
  mock.clearAllMocks();
};

// グローバルなモックリストア関数
export const restoreAllMocks = () => {
  mock.restore();
};

// テストのセットアップメッセージ
console.log("✅ Module mocks loaded");
