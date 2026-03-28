import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/runtime.js";

describe("runCli", () => {
  it("forwards dash-prefixed extra args for legacy use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "YH", "--force"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "cc", alias: "YH", extra: ["--force"] }]);
  });

  it("forwards dash-prefixed extra args for explicit agent use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "codex", "dev", "--model", "gpt-5"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "codex", alias: "dev", extra: ["--model", "gpt-5"] }]);
  });

  it("strips passthrough separator for explicit agent use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "codex", "dev", "--", "--model", "gpt-5"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "codex", alias: "dev", extra: ["--model", "gpt-5"] }]);
  });

  it("preserves literal double-dash after stripping CLI separator for explicit use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "codex", "dev", "--", "--", "--model", "gpt-5"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "codex", alias: "dev", extra: ["--", "--model", "gpt-5"] }]);
  });

  it("forwards passthrough args for explicit gemini use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "gemini", "official", "--", "--model", "gemini-2.5-flash"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "gemini", alias: "official", extra: ["--model", "gemini-2.5-flash"] }]);
  });

  it("strips passthrough separator for legacy use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "YH", "--", "--dangerously-skip-permissions"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "cc", alias: "YH", extra: ["--dangerously-skip-permissions"] }]);
  });

  it("preserves literal double-dash after stripping CLI separator for legacy use", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(["use", "YH", "--", "--", "--dangerously-skip-permissions"], {
      onUse: (agent, alias, extra) => {
        calls.push({ agent, alias, extra });
      }
    });

    expect(calls).toEqual([{ agent: "cc", alias: "YH", extra: ["--", "--dangerously-skip-permissions"] }]);
  });

  it("does not load default provider hooks for non-provider commands", async () => {
    let loadCalls = 0;

    await runCli(
      ["use", "YH"],
      {
        onUse: () => undefined
      },
      {
        loadDefaultProviderHooks: async () => {
          loadCalls += 1;
          return {};
        }
      }
    );

    expect(loadCalls).toBe(0);
  });

  it("loads default use hooks when use command is missing onUse", async () => {
    let loadCalls = 0;
    const useCalls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(
      ["use", "YH", "--force"],
      {},
      {
        loadDefaultUseHooks: async () => {
          loadCalls += 1;
          return {
            onUse: (agent, alias, extra) => {
              useCalls.push({ agent, alias, extra });
            }
          };
        }
      }
    );

    expect(loadCalls).toBe(1);
    expect(useCalls).toEqual([{ agent: "cc", alias: "YH", extra: ["--force"] }]);
  });

  it("loads default provider hooks when provider subcommand requires them", async () => {
    let loadCalls = 0;
    const listCalls: string[] = [];

    await runCli(
      ["provider", "list", "cc"],
      {},
      {
        loadDefaultProviderHooks: async () => {
          loadCalls += 1;
          return {
            onProviderList: async (agent) => {
              listCalls.push(agent);
            }
          };
        }
      }
    );

    expect(loadCalls).toBe(1);
    expect(listCalls).toEqual(["cc"]);
  });

  it("loads default provider hooks for provider edit when missing", async () => {
    let loadCalls = 0;
    const editCalls: Array<{ agent: string; alias: string }> = [];

    await runCli(
      ["provider", "edit", "cc", "yh"],
      {},
      {
        loadDefaultProviderHooks: async () => {
          loadCalls += 1;
          return {
            onProviderEdit: async (agent, alias) => {
              editCalls.push({ agent, alias });
            }
          };
        }
      }
    );

    expect(loadCalls).toBe(1);
    expect(editCalls).toEqual([{ agent: "cc", alias: "yh" }]);
  });
});
