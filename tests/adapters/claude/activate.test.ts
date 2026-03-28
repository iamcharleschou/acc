import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateClaudeProvider } from "../../../src/adapters/claude/activate.js";
import type { ProcessRunner } from "../../../src/core/process.js";
import type { StoredProvider } from "../../../src/core/store/schema.js";

const tempDirs: string[] = [];

function createClaudeProvider(env: Record<string, string>): StoredProvider {
  return {
    alias: "yh",
    providerName: "anthropic",
    config: {
      env
    }
  };
}

describe("activateClaudeProvider", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("rejects when ~/.claude/settings.json has invalid JSON", async () => {
    const root = await mkdirTempRoot();
    await mkdir(join(root, ".claude"), { recursive: true });
    const claudeSettingsPath = join(root, ".claude", "settings.json");
    await writeFile(claudeSettingsPath, "{ invalid-json", "utf8");
    const accClaudeRuntimePath = join(root, ".acc", "runtime", "claude", "settings.json");
    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await expect(
      activateClaudeProvider(
        { claudeSettingsPath, accClaudeRuntimePath },
        createClaudeProvider({
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_AUTH_TOKEN: "token"
        }),
        [],
        runner
      )
    ).rejects.toThrow(/Invalid JSON/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects when ~/.claude/settings.json top-level is non-object", async () => {
    const root = await mkdirTempRoot();
    await mkdir(join(root, ".claude"), { recursive: true });
    const claudeSettingsPath = join(root, ".claude", "settings.json");
    await writeFile(claudeSettingsPath, JSON.stringify(["not-object"]), "utf8");
    const accClaudeRuntimePath = join(root, ".acc", "runtime", "claude", "settings.json");
    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await expect(
      activateClaudeProvider(
        { claudeSettingsPath, accClaudeRuntimePath },
        createClaudeProvider({
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_AUTH_TOKEN: "token"
        }),
        [],
        runner
      )
    ).rejects.toThrow(/JSON object/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("writes runtime settings file and invokes claude runner with computed args", async () => {
    const root = await mkdirTempRoot();
    await mkdir(join(root, ".claude"), { recursive: true });
    const claudeSettingsPath = join(root, ".claude", "settings.json");
    await writeFile(
      claudeSettingsPath,
      JSON.stringify({
        outputStyle: "verbose",
        env: {
          KEEP_ME: "yes",
          ANTHROPIC_BASE_URL: "https://user.example.com"
        }
      }),
      "utf8"
    );
    const accClaudeRuntimePath = join(root, ".acc", "runtime", "claude", "settings.json");
    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await activateClaudeProvider(
      { claudeSettingsPath, accClaudeRuntimePath },
      createClaudeProvider({
        ANTHROPIC_BASE_URL: "https://provider.example.com",
        ANTHROPIC_AUTH_TOKEN: "provider-token"
      }),
      ["--verbose"],
      runner
    );

    const persisted = JSON.parse(await readFile(accClaudeRuntimePath, "utf8")) as Record<string, unknown>;
    expect(persisted.outputStyle).toBe("verbose");
    expect(persisted.env).toEqual({
      KEEP_ME: "yes",
      ANTHROPIC_BASE_URL: "https://provider.example.com",
      ANTHROPIC_AUTH_TOKEN: "provider-token"
    });
    expect(run).toHaveBeenCalledWith(
      "claude",
      ["--setting-sources", "project,local", "--settings", accClaudeRuntimePath, "--verbose"]
    );
  });
});

async function mkdirTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-claude-activate-test-"));
  tempDirs.push(root);
  return root;
}
