import { afterEach, describe, expect, it, vi } from "vitest";
import { AccValidationError } from "../../src/core/errors.js";
import type { ProcessRunner } from "../../src/core/process.js";
import type { ProviderStoreConfig } from "../../src/core/store/schema.js";
import { createUseCommandHooks } from "../../src/commands/use.js";

function createStoreConfigWithClaudeAlias(alias: string): ProviderStoreConfig {
  return {
    version: 1,
    providers: {
      cc: {
        [alias]: {
          alias,
          providerName: "anthropic",
          config: {
            env: {
              ANTHROPIC_BASE_URL: "https://provider.example.com",
              ANTHROPIC_AUTH_TOKEN: "provider-token"
            }
          }
        }
      },
      codex: {},
      gemini: {}
    }
  };
}

function createStoreConfigWithCodexAlias(alias: string): ProviderStoreConfig {
  return {
    version: 1,
    providers: {
      cc: {},
      codex: {
        [alias]: {
          alias,
          providerName: "openai",
          config: {
            baseUrl: "https://api.openai.example/v1",
            apiKey: "provider-key",
            wireApi: "responses",
            requiresOpenAiAuth: true
          }
        }
      },
      gemini: {}
    }
  };
}

function createStoreConfigWithGeminiAlias(alias: string): ProviderStoreConfig {
  return {
    version: 1,
    providers: {
      cc: {},
      codex: {},
      gemini: {
        [alias]: {
          alias,
          providerName: "google",
          config: {
            env: {
              GEMINI_API_KEY: "gemini-key",
              GEMINI_MODEL: "gemini-2.5-pro"
            }
          }
        }
      }
    }
  };
}

describe("createUseCommandHooks", () => {
  const previousHome = process.env.HOME;

  afterEach(() => {
    process.env.HOME = previousHome;
    vi.restoreAllMocks();
  });

  it("throws when use alias is missing from provider store", async () => {
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithClaudeAlias("other")
      },
      activateClaude: vi.fn(async () => undefined),
      resolvePaths: vi.fn((homeDir: string) => ({
        accDir: `${homeDir}/.acc`,
        accConfigPath: `${homeDir}/.acc/config.json`,
        accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
        accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
        claudeSettingsPath: `${homeDir}/.claude/settings.json`,
        codexConfigPath: `${homeDir}/.codex/config.toml`,
        codexAuthPath: `${homeDir}/.codex/auth.json`,
        geminiEnvPath: `${homeDir}/.gemini/.env`
      })),
      runner: { run: vi.fn(async () => undefined) }
    });

    await expect(hooks.onUse?.("cc", "missing", [])).rejects.toThrow(AccValidationError);
    await expect(hooks.onUse?.("cc", "missing", [])).rejects.toThrow(/not found/i);
  });

  it("throws for unsupported agent use activation", async () => {
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithClaudeAlias("yh")
      },
      activateClaude: vi.fn(async () => undefined),
      resolvePaths: vi.fn((homeDir: string) => ({
        accDir: `${homeDir}/.acc`,
        accConfigPath: `${homeDir}/.acc/config.json`,
        accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
        accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
        claudeSettingsPath: `${homeDir}/.claude/settings.json`,
        codexConfigPath: `${homeDir}/.codex/config.toml`,
        codexAuthPath: `${homeDir}/.codex/auth.json`,
        geminiEnvPath: `${homeDir}/.gemini/.env`
      })),
      runner: { run: vi.fn(async () => undefined) }
    });

    await expect(hooks.onUse?.("unknown", "yh", [])).rejects.toThrow(/Unsupported agent id/i);
  });

  it("loads provider and passes paths/runner into Claude activation", async () => {
    process.env.HOME = "/tmp/acc-use-test-home";
    const activateClaude = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };
    const resolvePaths = vi.fn((homeDir: string) => ({
      accDir: `${homeDir}/.acc`,
      accConfigPath: `${homeDir}/.acc/config.json`,
      accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
      accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
      claudeSettingsPath: `${homeDir}/.claude/settings.json`,
      codexConfigPath: `${homeDir}/.codex/config.toml`,
      codexAuthPath: `${homeDir}/.codex/auth.json`,
      geminiEnvPath: `${homeDir}/.gemini/.env`
    }));
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithClaudeAlias("yh")
      },
      activateClaude,
      resolvePaths,
      runner
    });

    await hooks.onUse?.("cc", "yh", ["--verbose"]);

    expect(resolvePaths).toHaveBeenCalledWith("/tmp/acc-use-test-home");
    expect(activateClaude).toHaveBeenCalledTimes(1);
    expect(activateClaude).toHaveBeenCalledWith(
      {
        accDir: "/tmp/acc-use-test-home/.acc",
        accConfigPath: "/tmp/acc-use-test-home/.acc/config.json",
        accClaudeRuntimePath: "/tmp/acc-use-test-home/.acc/runtime/claude/settings.json",
        accCodexBackupDir: "/tmp/acc-use-test-home/.acc/backups/codex",
        claudeSettingsPath: "/tmp/acc-use-test-home/.claude/settings.json",
        codexConfigPath: "/tmp/acc-use-test-home/.codex/config.toml",
        codexAuthPath: "/tmp/acc-use-test-home/.codex/auth.json",
        geminiEnvPath: "/tmp/acc-use-test-home/.gemini/.env"
      },
      {
        alias: "yh",
        providerName: "anthropic",
        config: {
          env: {
            ANTHROPIC_BASE_URL: "https://provider.example.com",
            ANTHROPIC_AUTH_TOKEN: "provider-token"
          }
        }
      },
      ["--verbose"],
      runner
    );
  });

  it("loads provider and passes paths/runner into Codex activation", async () => {
    process.env.HOME = "/tmp/acc-use-test-home";
    const activateClaude = vi.fn(async () => undefined);
    const activateCodex = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };
    const resolvePaths = vi.fn((homeDir: string) => ({
      accDir: `${homeDir}/.acc`,
      accConfigPath: `${homeDir}/.acc/config.json`,
      accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
      accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
      claudeSettingsPath: `${homeDir}/.claude/settings.json`,
      codexConfigPath: `${homeDir}/.codex/config.toml`,
      codexAuthPath: `${homeDir}/.codex/auth.json`,
      geminiEnvPath: `${homeDir}/.gemini/.env`
    }));
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithCodexAlias("dev")
      },
      activateClaude,
      activateCodex,
      resolvePaths,
      runner
    });

    await hooks.onUse?.("codex", "dev", ["--model", "gpt-5"]);

    expect(resolvePaths).toHaveBeenCalledWith("/tmp/acc-use-test-home");
    expect(activateCodex).toHaveBeenCalledTimes(1);
    expect(activateCodex).toHaveBeenCalledWith(
      {
        accDir: "/tmp/acc-use-test-home/.acc",
        accConfigPath: "/tmp/acc-use-test-home/.acc/config.json",
        accClaudeRuntimePath: "/tmp/acc-use-test-home/.acc/runtime/claude/settings.json",
        accCodexBackupDir: "/tmp/acc-use-test-home/.acc/backups/codex",
        claudeSettingsPath: "/tmp/acc-use-test-home/.claude/settings.json",
        codexConfigPath: "/tmp/acc-use-test-home/.codex/config.toml",
        codexAuthPath: "/tmp/acc-use-test-home/.codex/auth.json",
        geminiEnvPath: "/tmp/acc-use-test-home/.gemini/.env"
      },
      {
        alias: "dev",
        providerName: "openai",
        config: {
          baseUrl: "https://api.openai.example/v1",
          apiKey: "provider-key",
          wireApi: "responses",
          requiresOpenAiAuth: true
        }
      },
      ["--model", "gpt-5"],
      runner
    );
    expect(activateClaude).not.toHaveBeenCalled();
  });

  it("passes literal leading double-dash through to Codex activation when hook receives it", async () => {
    process.env.HOME = "/tmp/acc-use-test-home";
    const activateCodex = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };
    const resolvePaths = vi.fn((homeDir: string) => ({
      accDir: `${homeDir}/.acc`,
      accConfigPath: `${homeDir}/.acc/config.json`,
      accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
      accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
      claudeSettingsPath: `${homeDir}/.claude/settings.json`,
      codexConfigPath: `${homeDir}/.codex/config.toml`,
      codexAuthPath: `${homeDir}/.codex/auth.json`,
      geminiEnvPath: `${homeDir}/.gemini/.env`
    }));
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithCodexAlias("dev")
      },
      activateClaude: vi.fn(async () => undefined),
      activateCodex,
      resolvePaths,
      runner
    });

    await hooks.onUse?.("codex", "dev", ["--", "--model", "gpt-5"]);

    expect(activateCodex).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      ["--", "--model", "gpt-5"],
      runner
    );
  });

  it("loads provider and passes paths/runner into Gemini activation", async () => {
    process.env.HOME = "/tmp/acc-use-test-home";
    const activateGemini = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };
    const resolvePaths = vi.fn((homeDir: string) => ({
      accDir: `${homeDir}/.acc`,
      accConfigPath: `${homeDir}/.acc/config.json`,
      accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
      accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
      claudeSettingsPath: `${homeDir}/.claude/settings.json`,
      codexConfigPath: `${homeDir}/.codex/config.toml`,
      codexAuthPath: `${homeDir}/.codex/auth.json`,
      geminiEnvPath: `${homeDir}/.gemini/.env`
    }));
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithGeminiAlias("official")
      },
      activateClaude: vi.fn(async () => undefined),
      activateCodex: vi.fn(async () => undefined),
      activateGemini,
      resolvePaths,
      runner
    });

    await hooks.onUse?.("gemini", "official", ["--model", "gemini-2.5-flash"]);

    expect(resolvePaths).toHaveBeenCalledWith("/tmp/acc-use-test-home");
    expect(activateGemini).toHaveBeenCalledTimes(1);
    expect(activateGemini).toHaveBeenCalledWith(
      {
        accDir: "/tmp/acc-use-test-home/.acc",
        accConfigPath: "/tmp/acc-use-test-home/.acc/config.json",
        accClaudeRuntimePath: "/tmp/acc-use-test-home/.acc/runtime/claude/settings.json",
        accCodexBackupDir: "/tmp/acc-use-test-home/.acc/backups/codex",
        claudeSettingsPath: "/tmp/acc-use-test-home/.claude/settings.json",
        codexConfigPath: "/tmp/acc-use-test-home/.codex/config.toml",
        codexAuthPath: "/tmp/acc-use-test-home/.codex/auth.json",
        geminiEnvPath: "/tmp/acc-use-test-home/.gemini/.env"
      },
      {
        alias: "official",
        providerName: "google",
        config: {
          env: {
            GEMINI_API_KEY: "gemini-key",
            GEMINI_MODEL: "gemini-2.5-pro"
          }
        }
      },
      ["--model", "gemini-2.5-flash"],
      runner
    );
  });

  it("passes literal leading double-dash through to Gemini activation when hook receives it", async () => {
    process.env.HOME = "/tmp/acc-use-test-home";
    const activateGemini = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };
    const resolvePaths = vi.fn((homeDir: string) => ({
      accDir: `${homeDir}/.acc`,
      accConfigPath: `${homeDir}/.acc/config.json`,
      accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
      accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
      claudeSettingsPath: `${homeDir}/.claude/settings.json`,
      codexConfigPath: `${homeDir}/.codex/config.toml`,
      codexAuthPath: `${homeDir}/.codex/auth.json`,
      geminiEnvPath: `${homeDir}/.gemini/.env`
    }));
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithGeminiAlias("official")
      },
      activateClaude: vi.fn(async () => undefined),
      activateCodex: vi.fn(async () => undefined),
      activateGemini,
      resolvePaths,
      runner
    });

    await hooks.onUse?.("gemini", "official", ["--", "--model", "gemini-2.5-flash"]);

    expect(activateGemini).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      ["--", "--model", "gemini-2.5-flash"],
      runner
    );
  });

  it("propagates Codex activation errors", async () => {
    process.env.HOME = "/tmp/acc-use-test-home";
    const activateError = new Error("codex activation failed");
    const hooks = createUseCommandHooks({
      store: {
        load: async () => createStoreConfigWithCodexAlias("dev")
      },
      activateClaude: vi.fn(async () => undefined),
      activateCodex: vi.fn(async () => {
        throw activateError;
      }),
      resolvePaths: vi.fn((homeDir: string) => ({
        accDir: `${homeDir}/.acc`,
        accConfigPath: `${homeDir}/.acc/config.json`,
        accClaudeRuntimePath: `${homeDir}/.acc/runtime/claude/settings.json`,
        accCodexBackupDir: `${homeDir}/.acc/backups/codex`,
        claudeSettingsPath: `${homeDir}/.claude/settings.json`,
        codexConfigPath: `${homeDir}/.codex/config.toml`,
        codexAuthPath: `${homeDir}/.codex/auth.json`,
        geminiEnvPath: `${homeDir}/.gemini/.env`
      })),
      runner: { run: vi.fn(async () => undefined) }
    });

    await expect(hooks.onUse?.("codex", "dev", [])).rejects.toThrow("codex activation failed");
  });
});
