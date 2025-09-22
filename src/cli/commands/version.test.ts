import { beforeEach, describe, expect, it, jest, mock } from "bun:test";

import { showVersion } from "./version.js";

// Mock package.json
mock.module("../../../package.json", () => ({
  default: {
    version: "1.0.0-test",
  },
}));

describe("showVersion", () => {
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should display the version number", () => {
    showVersion();
    expect(consoleLogSpy).toHaveBeenCalledWith("1.0.0-test");
  });
});
