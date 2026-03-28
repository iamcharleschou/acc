import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateGeminiProvider } from "../../../src/adapters/gemini/activate.js";
import type { ProcessRunner } from "../../../src/core/process.js";
import type { StoredProvider } from "../../../src/core/store/schema.js";

const tempDirs: string[] = [];

function createGeminiProvider(env: Record<string, string>): StoredProvider {
  return {
    alias: "official",
    providerName: "google",
    config: {
      env
    }
  };
}

describe("activateGeminiProvider", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes ~/.gemini/.env with required entries and launches gemini", async () => {
    const root = await mkdirTempRoot();
    const geminiEnvPath = join(root, ".gemini", ".env");
    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await activateGeminiProvider(
      { geminiEnvPath },
      createGeminiProvider({
        GEMINI_API_KEY: "gemini-key",
        GEMINI_MODEL: "gemini-2.5-pro",
        GOOGLE_GEMINI_BASE_URL: "https://proxy.example.com"
      }),
      ["--model", "gemini-2.5-flash"],
      runner
    );

    const envContent = await readFile(geminiEnvPath, "utf8");
    expect(envContent).toContain("GEMINI_API_KEY=gemini-key");
    expect(envContent).toContain("GEMINI_MODEL=gemini-2.5-pro");
    expect(envContent).toContain("GOOGLE_GEMINI_BASE_URL=https://proxy.example.com");
    expect(run).toHaveBeenCalledWith("gemini", ["--model", "gemini-2.5-flash"]);
    expect((await stat(dirname(geminiEnvPath))).mode & 0o777).toBe(0o700);
    expect((await stat(geminiEnvPath)).mode & 0o777).toBe(0o600);
  });

  it("omits optional base/model keys when absent and keeps custom env keys", async () => {
    const root = await mkdirTempRoot();
    const geminiEnvPath = join(root, ".gemini", ".env");
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };

    await activateGeminiProvider(
      { geminiEnvPath },
      createGeminiProvider({
        Z_CUSTOM: "zeta",
        GEMINI_API_KEY: "gemini-key",
        A_CUSTOM: "alpha"
      }),
      [],
      runner
    );

    const envContent = await readFile(geminiEnvPath, "utf8");
    expect(envContent).not.toContain("GOOGLE_GEMINI_BASE_URL=");
    expect(envContent).not.toContain("GEMINI_MODEL=");
    expect(envContent).toBe(`A_CUSTOM=alpha\nGEMINI_API_KEY=gemini-key\nZ_CUSTOM=zeta\n`);
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    const root = await mkdirTempRoot();
    const geminiEnvPath = join(root, ".gemini", ".env");
    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await expect(
      activateGeminiProvider(
        { geminiEnvPath },
        createGeminiProvider({
          GEMINI_MODEL: "gemini-2.5-pro"
        }),
        [],
        runner
      )
    ).rejects.toThrow(/GEMINI_API_KEY/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects invalid env key in stored provider before writing env file", async () => {
    const root = await mkdirTempRoot();
    const geminiEnvPath = join(root, ".gemini", ".env");
    await mkdir(dirname(geminiEnvPath), { recursive: true });
    await writeFile(geminiEnvPath, "EXISTING=keep\n", "utf8");
    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await expect(
      activateGeminiProvider(
        { geminiEnvPath },
        createGeminiProvider({
          GEMINI_API_KEY: "gemini-key",
          "BAD-KEY": "invalid"
        }),
        [],
        runner
      )
    ).rejects.toThrow(/key/i);

    expect(await readFile(geminiEnvPath, "utf8")).toBe("EXISTING=keep\n");
    expect(run).not.toHaveBeenCalled();
  });

  it("fully overwrites existing ~/.gemini/.env instead of merging old keys", async () => {
    const root = await mkdirTempRoot();
    const geminiEnvPath = join(root, ".gemini", ".env");
    await mkdir(dirname(geminiEnvPath), { recursive: true });
    await writeFile(geminiEnvPath, "OLD_KEY=old\nGEMINI_API_KEY=old\n", "utf8");
    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };

    await activateGeminiProvider(
      { geminiEnvPath },
      createGeminiProvider({
        GEMINI_API_KEY: "new-key",
        GEMINI_MODEL: "gemini-2.5-pro"
      }),
      [],
      runner
    );

    const envContent = await readFile(geminiEnvPath, "utf8");
    expect(envContent).toBe("GEMINI_API_KEY=new-key\nGEMINI_MODEL=gemini-2.5-pro\n");
    expect(envContent).not.toContain("OLD_KEY=");
  });
});

async function mkdirTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-gemini-activate-test-"));
  tempDirs.push(root);
  return root;
}
