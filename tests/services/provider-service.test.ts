import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderParsers } from "../../src/adapters/base.js";
import { parseClaudeProvider } from "../../src/adapters/claude/schema.js";
import { parseCodexProvider } from "../../src/adapters/codex/schema.js";
import { parseGeminiProvider } from "../../src/adapters/gemini/schema.js";
import { AccValidationError } from "../../src/core/errors.js";
import { ProviderStore } from "../../src/core/store/provider-store.js";
import { ProviderService } from "../../src/services/provider-service.js";

describe("ProviderService", () => {
  const tempHomes: string[] = [];
  const parsers: ProviderParsers = {
    cc: parseClaudeProvider,
    codex: parseCodexProvider,
    gemini: parseGeminiProvider
  };

  async function createTempHome(): Promise<string> {
    const homeDir = await mkdtemp(join(tmpdir(), "acc-provider-service-test-"));
    tempHomes.push(homeDir);
    return homeDir;
  }

  afterEach(async () => {
    await Promise.all(tempHomes.splice(0).map((homeDir) => rm(homeDir, { recursive: true, force: true })));
  });

  it("stores a validated Claude provider under the cc namespace", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("cc", "anthropic", {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "test-key"
      }
    });

    const loaded = await store.load();
    expect(loaded.providers.cc.yh).toEqual({
      alias: "yh",
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "test-key"
        }
      }
    });
    expect(loaded.providers.codex).toEqual({});
  });

  it("supports codex add/list/remove round-trip", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("codex", "openai", {
      alias: "dev",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    const listed = await service.list("codex");
    expect(listed).toEqual([
      {
        alias: "dev",
        providerName: "openai",
        config: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "secret",
          wireApi: "responses",
          requiresOpenAiAuth: true
        }
      }
    ]);

    await service.remove("codex", "dev");
    expect(await service.list("codex")).toEqual([]);
  });

  it("rejects adding codex provider with TOML-unsafe alias and leaves store unchanged", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await expect(
      service.add("codex", "openai", {
        alias: "bad.alias",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret",
        wireApi: "responses",
        requiresOpenAiAuth: true
      })
    ).rejects.toThrow(AccValidationError);

    const loaded = await store.load();
    expect(loaded.providers.codex).toEqual({});
  });

  it("rejects deleting ANTHROPIC_BASE_URL from a Claude provider", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("cc", "anthropic", {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret"
      }
    });

    await expect(
      service.edit("cc", "yh", {
        mode: "delete",
        keys: ["ANTHROPIC_BASE_URL"]
      })
    ).rejects.toThrow(/ANTHROPIC_BASE_URL/);
  });

  it("updates Claude env field via edit mutation", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("cc", "anthropic", {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_AUTH_TOKEN: "old-token"
      }
    });

    await service.edit("cc", "yh", {
      mode: "edit",
      key: "ANTHROPIC_AUTH_TOKEN",
      value: "new-token"
    });

    const loaded = await store.load();
    expect(loaded.providers.cc.yh.config).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_AUTH_TOKEN: "new-token"
      }
    });
  });

  it("adds a new Claude env field via add mutation", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("cc", "anthropic", {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret"
      }
    });

    await service.edit("cc", "yh", {
      mode: "add",
      key: "HTTPS_PROXY",
      value: "http://127.0.0.1:7890"
    });

    const loaded = await store.load();
    expect(loaded.providers.cc.yh.config).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret",
        HTTPS_PROXY: "http://127.0.0.1:7890"
      }
    });
  });

  it("rejects Claude add mutation when key already exists", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("cc", "anthropic", {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret"
      }
    });

    await expect(
      service.edit("cc", "yh", {
        mode: "add",
        key: "ANTHROPIC_API_KEY",
        value: "new-secret"
      })
    ).rejects.toThrow(/Cannot add existing Claude env field/);
  });

  it("deletes Claude env fields via delete mutation", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("cc", "anthropic", {
      alias: "yh",
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret",
        HTTPS_PROXY: "http://127.0.0.1:7890"
      }
    });

    await service.edit("cc", "yh", {
      mode: "delete",
      keys: ["HTTPS_PROXY"]
    });

    const loaded = await store.load();
    expect(loaded.providers.cc.yh.config).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "secret"
      }
    });
  });

  it("updates codex fixed field via edit mutation", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("codex", "openai", {
      alias: "dev",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    await service.edit("codex", "dev", {
      field: "baseUrl",
      value: "https://proxy.example.com/v1"
    });

    const loaded = await store.load();
    expect(loaded.providers.codex.dev.config).toEqual({
      baseUrl: "https://proxy.example.com/v1",
      apiKey: "secret",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });
  });

  it("updates codex apiKey via edit mutation", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("codex", "openai", {
      alias: "dev",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "old-secret",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });

    await service.edit("codex", "dev", {
      field: "apiKey",
      value: "new-secret"
    });

    const loaded = await store.load();
    expect(loaded.providers.codex.dev.config).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "new-secret",
      wireApi: "responses",
      requiresOpenAiAuth: true
    });
  });

  it("supports gemini add/list/remove round-trip", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("gemini", "google", {
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret"
      }
    });

    const listed = await service.list("gemini");
    expect(listed).toEqual([
      {
        alias: "official",
        providerName: "google",
        config: {
          env: {
            GEMINI_API_KEY: "secret"
          }
        }
      }
    ]);

    await service.remove("gemini", "official");
    expect(await service.list("gemini")).toEqual([]);
  });

  it("supports gemini env add/edit/delete mutations", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("gemini", "google", {
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret"
      }
    });

    await service.edit("gemini", "official", {
      mode: "add",
      key: "GOOGLE_GEMINI_BASE_URL",
      value: "https://generativelanguage.googleapis.com"
    });

    await service.edit("gemini", "official", {
      mode: "edit",
      key: "GEMINI_API_KEY",
      value: "new-secret"
    });

    await service.edit("gemini", "official", {
      mode: "delete",
      keys: ["GOOGLE_GEMINI_BASE_URL"]
    });

    const loaded = await store.load();
    expect(loaded.providers.gemini.official.config).toEqual({
      env: {
        GEMINI_API_KEY: "new-secret"
      }
    });
  });

  it("rejects deleting GEMINI_API_KEY from a Gemini provider with protected-field error", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });
    const service = new ProviderService(store, parsers);

    await service.add("gemini", "google", {
      alias: "official",
      env: {
        GEMINI_API_KEY: "secret",
        GOOGLE_GEMINI_BASE_URL: "https://generativelanguage.googleapis.com"
      }
    });

    await expect(
      service.edit("gemini", "official", {
        mode: "delete",
        keys: ["GEMINI_API_KEY"]
      })
    ).rejects.toThrow(/Cannot delete GEMINI_API_KEY from a Gemini provider/);
  });
});
