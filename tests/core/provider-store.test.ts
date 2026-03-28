import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isExplicitAgentId, parseAgentId } from "../../src/core/agents.js";
import { AccValidationError } from "../../src/core/errors.js";
import { resolveAccPaths } from "../../src/core/paths.js";
import { createEmptyProviderStoreConfig } from "../../src/core/store/schema.js";
import { ProviderStore } from "../../src/core/store/provider-store.js";

describe("Gemini core plumbing contracts", () => {
  it("parses gemini as an explicit managed agent", () => {
    expect(parseAgentId("gemini")).toBe("gemini");
    expect(isExplicitAgentId("gemini")).toBe(true);
  });

  it("includes gemini namespace in empty provider store config", () => {
    expect(createEmptyProviderStoreConfig()).toEqual({
      version: 1,
      providers: {
        cc: {},
        codex: {},
        gemini: {}
      }
    });
  });

  it("resolves gemini env path under home directory", () => {
    const paths = resolveAccPaths("/tmp/home");
    expect(paths.geminiEnvPath).toBe("/tmp/home/.gemini/.env");
  });
});

describe("ProviderStore", () => {
  const tempHomes: string[] = [];

  async function createTempHome(): Promise<string> {
    const homeDir = await mkdtemp(join(tmpdir(), "acc-store-test-"));
    tempHomes.push(homeDir);
    return homeDir;
  }

  afterEach(async () => {
    await Promise.all(tempHomes.splice(0).map((homeDir) => rm(homeDir, { recursive: true, force: true })));
  });

  it("load returns empty config when ~/.acc/config.json does not exist", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });

    await expect(store.load()).resolves.toEqual({
      version: 1,
      providers: {
        cc: {},
        codex: {},
        gemini: {}
      }
    });
  });

  it("upsert persists nested provider config under one agent namespace without polluting the other", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });

    await store.upsert("cc", "yh", {
      providerName: "galaxy",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "test-key"
        }
      }
    });

    const actual = await store.load();
    expect(actual.providers.cc.yh).toEqual({
      alias: "yh",
      providerName: "galaxy",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "test-key"
        }
      }
    });
    expect(actual.providers.codex).toEqual({});
  });

  it("load accepts nested provider config shape from persisted store file", async () => {
    const homeDir = await createTempHome();
    const paths = resolveAccPaths(homeDir);
    await mkdir(paths.accDir, { recursive: true });
    await writeFile(
      paths.accConfigPath,
      JSON.stringify({
        version: 1,
        providers: {
          cc: {
            yh: {
              alias: "yh",
              providerName: "galaxy",
              config: {
                env: {
                  ANTHROPIC_BASE_URL: "https://api.example.com",
                  ANTHROPIC_API_KEY: "test-key"
                }
              }
            }
          },
          codex: {},
          gemini: {}
        }
      }),
      "utf8"
    );

    const store = new ProviderStore({ homeDir });
    const loaded = await store.load();

    expect(loaded.providers.cc.yh.config).toEqual({
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_API_KEY: "test-key"
      }
    });
  });

  it("load normalizes legacy v1 store that does not include gemini namespace", async () => {
    const homeDir = await createTempHome();
    const paths = resolveAccPaths(homeDir);
    await mkdir(paths.accDir, { recursive: true });
    await writeFile(
      paths.accConfigPath,
      JSON.stringify({
        version: 1,
        providers: {
          cc: {
            yh: {
              alias: "yh",
              providerName: "galaxy",
              config: {
                env: {
                  ANTHROPIC_BASE_URL: "https://api.example.com",
                  ANTHROPIC_API_KEY: "test-key"
                }
              }
            }
          },
          codex: {}
        }
      }),
      "utf8"
    );

    const store = new ProviderStore({ homeDir });
    const loaded = await store.load();
    expect(loaded.providers.cc.yh.alias).toBe("yh");
    expect(loaded.providers.gemini).toEqual({});
  });

  it("upsert rewrites legacy store with normalized gemini namespace", async () => {
    const homeDir = await createTempHome();
    const paths = resolveAccPaths(homeDir);
    await mkdir(paths.accDir, { recursive: true });
    await writeFile(
      paths.accConfigPath,
      JSON.stringify({
        version: 1,
        providers: {
          cc: {},
          codex: {}
        }
      }),
      "utf8"
    );

    const store = new ProviderStore({ homeDir });
    await store.upsert("cc", "yh", {
      providerName: "galaxy",
      config: {}
    });

    const persisted = JSON.parse(await readFile(paths.accConfigPath, "utf8")) as {
      providers: Record<string, unknown>;
    };
    expect(persisted.providers.gemini).toEqual({});
  });

  it("rejects invalid provider input on upsert and does not persist partial state", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });

    await expect(
      store.upsert("cc", "yh", {
        providerName: "",
        config: {}
      })
    ).rejects.toBeInstanceOf(AccValidationError);

    await expect(store.load()).resolves.toEqual({
      version: 1,
      providers: {
        cc: {},
        codex: {},
        gemini: {}
      }
    });
  });

  it("rejects whitespace-only alias or providerName at store boundary", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });

    await expect(
      store.upsert("cc", "   ", {
        providerName: "galaxy",
        config: {}
      })
    ).rejects.toBeInstanceOf(AccValidationError);

    await expect(
      store.upsert("cc", "yh", {
        providerName: "   ",
        config: {}
      })
    ).rejects.toBeInstanceOf(AccValidationError);
  });

  it("rejects persisted store when provider key does not match entry alias", async () => {
    const homeDir = await createTempHome();
    const paths = resolveAccPaths(homeDir);
    await mkdir(paths.accDir, { recursive: true });
    await writeFile(
      paths.accConfigPath,
      JSON.stringify({
        version: 1,
        providers: {
          cc: {
            yh: {
              alias: "mismatch",
              providerName: "galaxy",
              config: {}
            }
          },
          codex: {},
          gemini: {}
        }
      }),
      "utf8"
    );

    const store = new ProviderStore({ homeDir });
    await expect(store.load()).rejects.toBeInstanceOf(AccValidationError);
  });

  it("rejects persisted store when alias or providerName are whitespace-only", async () => {
    const homeDir = await createTempHome();
    const paths = resolveAccPaths(homeDir);
    await mkdir(paths.accDir, { recursive: true });

    await writeFile(
      paths.accConfigPath,
      JSON.stringify({
        version: 1,
        providers: {
          cc: {
            "   ": {
              alias: "   ",
              providerName: "galaxy",
              config: {}
            }
          },
          codex: {},
          gemini: {}
        }
      }),
      "utf8"
    );

    const store = new ProviderStore({ homeDir });
    await expect(store.load()).rejects.toBeInstanceOf(AccValidationError);

    await writeFile(
      paths.accConfigPath,
      JSON.stringify({
        version: 1,
        providers: {
          cc: {
            yh: {
              alias: "yh",
              providerName: "   ",
              config: {}
            }
          },
          codex: {},
          gemini: {}
        }
      }),
      "utf8"
    );

    await expect(store.load()).rejects.toBeInstanceOf(AccValidationError);
  });

  it("remove deletes only the targeted agent alias and leaves others intact", async () => {
    const homeDir = await createTempHome();
    const store = new ProviderStore({ homeDir });

    await store.upsert("cc", "shared", {
      providerName: "galaxy",
      config: {}
    });
    await store.upsert("codex", "shared", {
      providerName: "openai",
      config: {
        env: {
          OPENAI_API_KEY: "k"
        }
      }
    });

    await store.remove("cc", "shared");

    const loaded = await store.load();
    expect(loaded.providers.cc.shared).toBeUndefined();
    expect(loaded.providers.codex.shared).toEqual({
      alias: "shared",
      providerName: "openai",
      config: {
        env: {
          OPENAI_API_KEY: "k"
        }
      }
    });
  });
});
