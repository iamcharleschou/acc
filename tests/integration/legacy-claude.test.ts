import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/runtime.js";

describe("legacy Claude command compatibility", () => {
  it("routes acc add <provider-name> to provider add cc flow", async () => {
    const calls: Array<{ agent: string; providerName: string }> = [];

    await runCli(["add", "anthropic"], {
      onProviderAdd: async (agent, providerName) => {
        calls.push({ agent, providerName });
      }
    });

    expect(calls).toEqual([{ agent: "cc", providerName: "anthropic" }]);
  });

  it("routes acc list to provider list cc flow", async () => {
    const calls: string[] = [];

    await runCli(["list"], {
      onProviderList: async (agent) => {
        calls.push(agent);
      }
    });

    expect(calls).toEqual(["cc"]);
  });

  it("routes acc use <alias> to cc use flow through default use wiring", async () => {
    const calls: Array<{ agent: string; alias: string; extra: string[] }> = [];

    await runCli(
      ["use", "YH", "--dangerously-skip-permissions"],
      {},
      {
        loadDefaultUseHooks: async () => ({
          onUse: (agent, alias, extra) => {
            calls.push({ agent, alias, extra });
          }
        })
      }
    );

    expect(calls).toEqual([
      {
        agent: "cc",
        alias: "YH",
        extra: ["--dangerously-skip-permissions"]
      }
    ]);
  });
});
