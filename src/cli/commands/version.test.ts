import type { SpyInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showVersion } from "./version.js";

// Mock package.json
vi.mock("../../../package.json", () => ({
  default: {
    version: "1.0.0-test",
  },
}));

describe("showVersion", () => {
  let consoleLogSpy: SpyInstance;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should display the version number", () => {
    showVersion();
    expect(consoleLogSpy).toHaveBeenCalledWith("1.0.0-test");
  });
});
