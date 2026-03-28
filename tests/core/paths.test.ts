import { describe, expect, it } from "vitest";
import { resolveAccPaths } from "../../src/core/paths.js";

describe("resolveAccPaths", () => {
  it("builds runtime and codex backup paths under required acc subdirectories", () => {
    const paths = resolveAccPaths("/tmp/demo-home");

    expect(paths.accClaudeRuntimePath).toBe("/tmp/demo-home/.acc/runtime/claude/settings.json");
    expect(paths.accCodexBackupDir).toBe("/tmp/demo-home/.acc/backups/codex");
  });
});
