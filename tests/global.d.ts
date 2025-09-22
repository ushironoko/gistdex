/**
 * Global type definitions for test environment
 */

import type { jest, mock } from "bun:test";

declare global {
  const vi: {
    fn: typeof jest.fn;
    spyOn: typeof jest.spyOn;
    mock: typeof mock.module;
    clearAllMocks: typeof jest.clearAllMocks;
    restoreAllMocks: typeof jest.restoreAllMocks;
    mocked: <T>(fn: T) => T;
    importActual: (id: string) => Promise<any>;
  };
}
