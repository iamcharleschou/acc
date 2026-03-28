import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderStore } from "../../src/core/store/provider-store.js";
import { runCli } from "../../src/cli/runtime.js";

describe("provider default wiring", () => {
  const tempHomes: string[] = [];
  let previousHome = process.env.HOME;

  async function createTempHome(): Promise<string> {
    const homeDir = await mkdtemp(join(tmpdir(), "acc-provider-runtime-test-"));
    tempHomes.push(homeDir);
    return homeDir;
  }

  afterEach(async () => {
    process.env.HOME = previousHome;
    await Promise.all(tempHomes.splice(0).map((homeDir) => rm(homeDir, { recursive: true, force: true })));
    vi.restoreAllMocks();
    previousHome = process.env.HOME;
  });

  it("uses default provider hooks for list with meaningful table output", async () => {
    const homeDir = await createTempHome();
    process.env.HOME = homeDir;
    const store = new ProviderStore({ homeDir });
    await store.upsert("cc", "yh", {
      providerName: "anthropic",
      config: {
        env: {
          ANTHROPIC_BASE_URL: "https://api.example.com",
          ANTHROPIC_API_KEY: "secret"
        }
      }
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["provider", "list", "cc"]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const table = String(logSpy.mock.calls[0][0]);
    const [headerLine, separatorLine, rowLine] = table.split("\n");
    expect(headerLine.split("|").map((cell) => cell.trim())).toEqual(["ALIAS", "PROVIDER", "ENDPOINT", "AUTH"]);
    expect(separatorLine).toMatch(/-+\+-+\+-+\+-+/);
    expect(rowLine).toContain("yh");
    expect(rowLine).toContain("anthropic");
    expect(rowLine).toContain("https://api.example.com");
    expect(rowLine).toContain("API_KEY");
  });

  it("prints empty-state guidance for default Gemini list flow", async () => {
    const homeDir = await createTempHome();
    process.env.HOME = homeDir;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["provider", "list", "gemini"]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      'No providers configured for agent "gemini".\nAdd one with: acc provider add gemini <providerName>'
    );
  });
});
