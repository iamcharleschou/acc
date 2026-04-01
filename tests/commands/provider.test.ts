import { afterEach, describe, expect, it, vi } from "vitest";
import * as claudePrompts from "../../src/adapters/claude/prompts.js";
import { AccValidationError } from "../../src/core/errors.js";
import { createProviderCommandHooks } from "../../src/commands/provider.js";

const { promptGeminiProviderAddMock, promptGeminiProviderEditFromStoredMock } = vi.hoisted(() => ({
  promptGeminiProviderAddMock: vi.fn(),
  promptGeminiProviderEditFromStoredMock: vi.fn()
}));

vi.mock("../../src/adapters/gemini/prompts.js", () => ({
  promptGeminiProviderAdd: promptGeminiProviderAddMock,
  promptGeminiProviderEditFromStored: promptGeminiProviderEditFromStoredMock
}));

describe("createProviderCommandHooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    promptGeminiProviderAddMock.mockReset();
    promptGeminiProviderEditFromStoredMock.mockReset();
  });

  it("uses cc add prompt for cc agent and calls service.add", async () => {
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "yh",
        providerName: "anthropic",
        config: {
          env: {
            ANTHROPIC_BASE_URL: "https://api.example.com",
            ANTHROPIC_API_KEY: "secret"
          }
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const ccPromptResult = {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret"
      }
    };
    const ccPrompt = vi.fn(async () => ccPromptResult);
    const codexPrompt = vi.fn(async () => ({
      alias: "dev",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      wireApi: "responses" as const,
      requiresOpenAiAuth: true as const
    }));
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: ccPrompt,
        codex: codexPrompt
      },
      writeLine: vi.fn()
    });

    await hooks.onProviderAdd?.("cc", "anthropic");

    expect(ccPrompt).toHaveBeenCalledTimes(1);
    expect(codexPrompt).not.toHaveBeenCalled();
    expect(service.add).toHaveBeenCalledWith("cc", "anthropic", ccPromptResult);
  });

  it("uses Gemini add prompt for gemini agent and calls service.add", async () => {
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "g",
        providerName: "google",
        config: {
          env: {
            GEMINI_API_KEY: "secret"
          }
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const geminiPromptResult = {
      alias: "g",
      env: {
        GEMINI_API_KEY: "secret",
        GEMINI_MODEL: "gemini-2.5-pro"
      }
    };
    promptGeminiProviderAddMock.mockResolvedValue(geminiPromptResult);
    const hooks = createProviderCommandHooks({
      service,
      writeLine: vi.fn()
    });

    await hooks.onProviderAdd?.("gemini", "google");

    expect(promptGeminiProviderAddMock).toHaveBeenCalledTimes(1);
    expect(service.add).toHaveBeenCalledWith("gemini", "google", geminiPromptResult);
  });

  it("renders Claude provider list with endpoint and auth mode columns", async () => {
    const lines: string[] = [];
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          alias: "yh",
          providerName: "anthropic",
          config: {
            env: {
              ANTHROPIC_BASE_URL: "https://api.example.com",
              ANTHROPIC_AUTH_TOKEN: "token"
            }
          }
        }
      ]),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "yh",
        providerName: "anthropic",
        config: {
          env: {
            ANTHROPIC_BASE_URL: "https://api.example.com",
            ANTHROPIC_AUTH_TOKEN: "token"
          }
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderList?.("cc");

    expect(service.list).toHaveBeenCalledWith("cc");
    expect(lines).toHaveLength(1);
    const [headerLine, separatorLine, rowLine] = lines[0].split("\n");
    expect(parseHeader(headerLine)).toEqual(["ALIAS", "PROVIDER", "ENDPOINT", "AUTH"]);
    expect(separatorLine).toMatch(/-+\+-+\+-+\+-+/);
    expect(rowLine).toContain("yh");
    expect(rowLine).toContain("anthropic");
    expect(rowLine).toContain("https://api.example.com");
    expect(rowLine).toContain("AUTH_TOKEN");
  });

  it("renders Codex provider list with endpoint and auth summary columns", async () => {
    const lines: string[] = [];
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          alias: "dev",
          providerName: "openai",
          config: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "secret",
            requiresOpenAiAuth: true
          }
        }
      ]),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "dev",
        providerName: "openai",
        config: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "secret",
          requiresOpenAiAuth: true
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderList?.("codex");

    const [headerLine, , rowLine] = lines[0].split("\n");
    expect(parseHeader(headerLine)).toEqual(["ALIAS", "PROVIDER", "ENDPOINT", "AUTH"]);
    expect(rowLine).toContain("dev");
    expect(rowLine).toContain("openai");
    expect(rowLine).toContain("https://api.openai.com/v1");
    expect(rowLine).toContain("API_KEY + OPENAI_AUTH");
  });

  it("renders Gemini provider list with endpoint fallback and auth summary columns", async () => {
    const lines: string[] = [];
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          alias: "g",
          providerName: "google",
          config: {
            env: {
              GEMINI_API_KEY: "secret"
            }
          }
        }
      ]),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "g",
        providerName: "google",
        config: {
          env: {
            GEMINI_API_KEY: "secret"
          }
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderList?.("gemini");

    const [headerLine, , rowLine] = lines[0].split("\n");
    expect(parseHeader(headerLine)).toEqual(["ALIAS", "PROVIDER", "ENDPOINT", "AUTH"]);
    expect(rowLine).toContain("g");
    expect(rowLine).toContain("google");
    expect(rowLine).toContain("(official)");
    expect(rowLine).toContain("API_KEY");
  });

  it("prints empty-state guidance when no providers configured", async () => {
    const lines: string[] = [];
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "dev",
        providerName: "openai",
        config: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "secret",
          requiresOpenAiAuth: true
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderList?.("codex");

    expect(lines).toEqual([
      'No providers configured for agent "codex".\nAdd one with: acc provider add codex <providerName>'
    ]);
  });

  it("delegates remove to service.remove", async () => {
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "dev",
        providerName: "openai",
        config: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "secret",
          requiresOpenAiAuth: true
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      writeLine: vi.fn()
    });

    await hooks.onProviderRemove?.("codex", "dev");

    expect(service.remove).toHaveBeenCalledWith("codex", "dev");
  });

  it("delegates edit to service with cc edit prompt result", async () => {
    const currentProvider = {
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "old-key"
        }
      }
    };
    const editResult = {
      mode: "edit" as const,
      key: "ANTHROPIC_API_KEY",
      value: "new-key"
    };
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => currentProvider),
      edit: vi.fn(async () => undefined)
    };
    const ccEditPrompt = vi.fn(async () => editResult);
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      editPrompts: {
        cc: ccEditPrompt,
        codex: vi.fn(async () => ({ field: "baseUrl" as const, value: "https://api.openai.com/v1" }))
      },
      isInteractive: () => true,
      writeLine: vi.fn()
    });

    await hooks.onProviderEdit?.("cc", "yh");

    expect(service.get).toHaveBeenCalledWith("cc", "yh");
    expect(ccEditPrompt).toHaveBeenCalledWith(currentProvider);
    expect(service.edit).toHaveBeenCalledWith("cc", "yh", editResult);
  });

  it("uses default cc edit prompt wiring with stored provider shape", async () => {
    const currentProvider = {
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "old-key"
        }
      }
    };
    const editResult = {
      mode: "edit" as const,
      key: "ANTHROPIC_API_KEY",
      value: "new-key"
    };
    const promptSpy = vi
      .spyOn(claudePrompts, "promptClaudeProviderEditFromStored")
      .mockResolvedValue(editResult);
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => currentProvider),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      isInteractive: () => true,
      writeLine: vi.fn()
    });

    await hooks.onProviderEdit?.("cc", "yh");

    expect(promptSpy).toHaveBeenCalledWith(currentProvider);
    expect(service.edit).toHaveBeenCalledWith("cc", "yh", editResult);
  });

  it("uses default gemini edit prompt wiring with stored provider shape", async () => {
    const currentProvider = {
      alias: "g",
      providerName: "google",
      config: {
        env: {
          GEMINI_API_KEY: "old-key"
        }
      }
    };
    const editResult = {
      mode: "edit" as const,
      key: "GEMINI_API_KEY",
      value: "new-key"
    };
    promptGeminiProviderEditFromStoredMock.mockResolvedValue(editResult);
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => currentProvider),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      isInteractive: () => true,
      writeLine: vi.fn()
    });

    await hooks.onProviderEdit?.("gemini", "g");

    expect(promptGeminiProviderEditFromStoredMock).toHaveBeenCalledWith(currentProvider);
    expect(service.edit).toHaveBeenCalledWith("gemini", "g", editResult);
  });

  it("rejects provider edit in non-tty mode before entering prompts", async () => {
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "yh",
        providerName: "anthropic",
        config: {
          env: {
            ANTHROPIC_BASE_URL: "https://api.example.com",
            ANTHROPIC_API_KEY: "secret"
          }
        }
      })),
      edit: vi.fn(async () => undefined)
    };
    const ccEditPrompt = vi.fn(async () => ({ mode: "edit" as const, key: "ANTHROPIC_API_KEY", value: "new-key" }));
    const hooks = createProviderCommandHooks({
      service,
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      editPrompts: {
        cc: ccEditPrompt,
        codex: vi.fn(async () => ({ field: "apiKey" as const, value: "secret" }))
      },
      isInteractive: () => false,
      writeLine: vi.fn()
    });

    await expect(hooks.onProviderEdit?.("cc", "yh")).rejects.toThrow(/TTY/i);
    expect(service.get).not.toHaveBeenCalled();
    expect(ccEditPrompt).not.toHaveBeenCalled();
    expect(service.edit).not.toHaveBeenCalled();
  });

  it("throws for unsupported agent id", async () => {
    const hooks = createProviderCommandHooks({
      service: {
        add: vi.fn(async () => undefined),
        list: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
        get: vi.fn(async () => ({
          alias: "yh",
          providerName: "anthropic",
          config: {
            env: {
              ANTHROPIC_BASE_URL: "https://api.example.com",
              ANTHROPIC_API_KEY: "secret"
            }
          }
        })),
        edit: vi.fn(async () => undefined)
      },
      addPrompts: {
        cc: vi.fn(async () => ({})),
        codex: vi.fn(async () => ({}))
      },
      writeLine: vi.fn()
    });

    await expect(hooks.onProviderList?.("unknown")).rejects.toThrow(AccValidationError);
  });

  it("provider active writes codex config and records active alias", async () => {
    const lines: string[] = [];
    const codexProvider = {
      alias: "dev",
      providerName: "openai",
      config: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-secret",
        wireApi: "responses",
        requiresOpenAiAuth: true
      }
    };
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => codexProvider),
      edit: vi.fn(async () => undefined)
    };
    const applyCodexConfig = vi.fn(async () => undefined);
    const activeStore = {
      getActive: vi.fn(async () => null as string | null),
      setActive: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      activeStore,
      applyCodexConfig,
      resolvePaths: () => ({
        codexConfigPath: "/tmp/.codex/config.toml",
        codexAuthPath: "/tmp/.codex/auth.json",
        accDir: "/tmp/.acc",
        accConfigPath: "/tmp/.acc/config.json",
        accClaudeRuntimePath: "/tmp/.acc/runtime/claude/settings.json",
        accCodexBackupDir: "/tmp/.acc/backups/codex",
        claudeSettingsPath: "/tmp/.claude/settings.json",
        geminiEnvPath: "/tmp/.gemini/.env"
      }),
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderActive?.("codex", "dev");

    expect(service.get).toHaveBeenCalledWith("codex", "dev");
    expect(applyCodexConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        codexConfigPath: "/tmp/.codex/config.toml",
        codexAuthPath: "/tmp/.codex/auth.json"
      }),
      codexProvider
    );
    expect(activeStore.setActive).toHaveBeenCalledWith("codex", "dev");
    expect(lines).toEqual(["Activated codex provider: dev"]);
  });

  it("provider active rejects non-codex agents", async () => {
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        alias: "yh",
        providerName: "anthropic",
        config: { env: { ANTHROPIC_BASE_URL: "https://api.example.com", ANTHROPIC_API_KEY: "secret" } }
      })),
      edit: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      writeLine: vi.fn()
    });

    await expect(hooks.onProviderActive?.("cc", "yh")).rejects.toThrow(AccValidationError);
    await expect(hooks.onProviderActive?.("gemini", "official")).rejects.toThrow(AccValidationError);
  });

  it("provider list marks the active alias with * suffix for codex", async () => {
    const lines: string[] = [];
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          alias: "dev",
          providerName: "openai",
          config: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-x",
            requiresOpenAiAuth: false
          }
        },
        {
          alias: "prod",
          providerName: "openai",
          config: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-y",
            requiresOpenAiAuth: false
          }
        }
      ]),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({ alias: "dev", providerName: "openai", config: {} })),
      edit: vi.fn(async () => undefined)
    };
    const activeStore = {
      getActive: vi.fn(async () => "dev" as string | null),
      setActive: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      activeStore,
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderList?.("codex");

    expect(lines).toHaveLength(1);
    const tableText = lines[0];
    const tableRows = tableText.split("\n").filter((l) => l.includes("|"));
    const devRow = tableRows.find((r) => r.includes("dev"));
    const prodRow = tableRows.find((r) => r.includes("prod"));
    expect(devRow).toContain("dev *");
    expect(prodRow).not.toContain("*");
  });

  it("provider list shows no active marker when no alias is active", async () => {
    const lines: string[] = [];
    const service = {
      add: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          alias: "dev",
          providerName: "openai",
          config: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-x",
            requiresOpenAiAuth: false
          }
        }
      ]),
      remove: vi.fn(async () => undefined),
      get: vi.fn(async () => ({ alias: "dev", providerName: "openai", config: {} })),
      edit: vi.fn(async () => undefined)
    };
    const activeStore = {
      getActive: vi.fn(async () => null as string | null),
      setActive: vi.fn(async () => undefined)
    };
    const hooks = createProviderCommandHooks({
      service,
      activeStore,
      writeLine: (line) => lines.push(line)
    });

    await hooks.onProviderList?.("codex");

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("*");
  });

});

function parseHeader(line: string): string[] {
  return line.split("|").map((cell) => cell.trim());
}
