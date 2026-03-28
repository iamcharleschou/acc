import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activateCodexProvider } from "../../../src/adapters/codex/activate.js";
import type { ProcessRunner } from "../../../src/core/process.js";
import type { StoredProvider } from "../../../src/core/store/schema.js";

const tempDirs: string[] = [];

function createCodexProvider(alias = "dev", apiKey = "secret-key"): StoredProvider {
  return {
    alias,
    providerName: "openai",
    config: {
      baseUrl: "https://proxy.example.com/v1",
      apiKey,
      wireApi: "responses",
      requiresOpenAiAuth: true
    }
  };
}

describe("activateCodexProvider", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes config/auth, creates backups, and launches codex", async () => {
    const root = await mkdirTempRoot();
    const codexDir = join(root, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const codexAuthPath = join(codexDir, "auth.json");
    const accCodexBackupDir = join(root, ".acc", "backups", "codex");

    await mkdir(codexDir, { recursive: true });
    await writeFile(
      codexConfigPath,
      `theme = "dark"
model_provider = "legacy"

[model_providers.dev]
name = "legacy"
base_url = "https://legacy.example.com/v1"
wire_api = "responses"
requires_openai_auth = false
`,
      "utf8"
    );
    await writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: "old-key" }), "utf8");

    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await activateCodexProvider(
      { codexConfigPath, codexAuthPath, accCodexBackupDir },
      createCodexProvider(),
      ["--model", "gpt-5"],
      runner
    );

    const nextConfig = await readFile(codexConfigPath, "utf8");
    expect(nextConfig).toContain(`model_provider = "dev"`);
    expect(nextConfig).toContain("[model_providers.dev]");
    expect(nextConfig).toContain(`name = "openai"`);
    expect(nextConfig).toContain(`base_url = "https://proxy.example.com/v1"`);
    expect(nextConfig).toContain(`wire_api = "responses"`);
    expect(nextConfig).toContain("requires_openai_auth = true");
    expect(nextConfig).toContain(`theme = "dark"`);
    expect(nextConfig).not.toContain(`base_url = "https://legacy.example.com/v1"`);

    const nextAuth = JSON.parse(await readFile(codexAuthPath, "utf8")) as Record<string, unknown>;
    expect(nextAuth).toEqual({ OPENAI_API_KEY: "secret-key" });

    const backups = await readdir(accCodexBackupDir);
    const configBackup = backups.find((name) => name.startsWith("config.toml."));
    const authBackup = backups.find((name) => name.startsWith("auth.json."));
    expect(configBackup).toBeDefined();
    expect(authBackup).toBeDefined();
    expect(await readFile(join(accCodexBackupDir, configBackup as string), "utf8")).toContain(`model_provider = "legacy"`);
    expect(await readFile(join(accCodexBackupDir, authBackup as string), "utf8")).toContain(`old-key`);

    expect(run).toHaveBeenCalledWith("codex", ["--model", "gpt-5"]);
  });

  it("applies secret-safe permissions for auth file and auth backup artifacts", async () => {
    const root = await mkdirTempRoot();
    const codexDir = join(root, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const codexAuthPath = join(codexDir, "auth.json");
    const accCodexBackupDir = join(root, ".acc", "backups", "codex");

    await mkdir(codexDir, { recursive: true });
    await writeFile(codexConfigPath, `model_provider = "legacy"\n`, "utf8");
    await writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: "old-key" }), "utf8");

    const runner: ProcessRunner = { run: vi.fn(async () => undefined) };
    await activateCodexProvider(
      { codexConfigPath, codexAuthPath, accCodexBackupDir },
      createCodexProvider(),
      [],
      runner
    );

    const backups = await readdir(accCodexBackupDir);
    const authBackup = backups.find((name) => name.startsWith("auth.json."));
    expect(authBackup).toBeDefined();

    expect((await stat(codexAuthPath)).mode & 0o777).toBe(0o600);
    expect((await stat(accCodexBackupDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(accCodexBackupDir, authBackup as string))).mode & 0o777).toBe(0o600);
  });

  it("rejects unsafe alias for TOML table keys", async () => {
    const root = await mkdirTempRoot();
    const codexDir = join(root, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const codexAuthPath = join(codexDir, "auth.json");
    const accCodexBackupDir = join(root, ".acc", "backups", "codex");
    await mkdir(codexDir, { recursive: true });
    await writeFile(codexConfigPath, `model_provider = "old"\n`, "utf8");
    await writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: "old-key" }), "utf8");

    const run = vi.fn(async () => undefined);
    const runner: ProcessRunner = { run };

    await expect(
      activateCodexProvider(
        { codexConfigPath, codexAuthPath, accCodexBackupDir },
        {
          ...createCodexProvider(),
          alias: "bad.alias"
        },
        [],
        runner
      )
    ).rejects.toThrow(/alias/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("rolls back config/auth when codex launch fails", async () => {
    const root = await mkdirTempRoot();
    const codexDir = join(root, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const codexAuthPath = join(codexDir, "auth.json");
    const accCodexBackupDir = join(root, ".acc", "backups", "codex");

    await mkdir(codexDir, { recursive: true });
    const oldConfig = `model_provider = "legacy"
[model_providers.legacy]
name = "legacy"
base_url = "https://legacy.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
`;
    const oldAuth = JSON.stringify({ OPENAI_API_KEY: "old-key" });
    await writeFile(codexConfigPath, oldConfig, "utf8");
    await writeFile(codexAuthPath, oldAuth, "utf8");

    const runError = new Error("codex failed to launch");
    const run = vi.fn(async () => {
      throw runError;
    });
    const runner: ProcessRunner = { run };

    await expect(
      activateCodexProvider(
        { codexConfigPath, codexAuthPath, accCodexBackupDir },
        createCodexProvider(),
        ["--model", "gpt-5"],
        runner
      )
    ).rejects.toThrow("codex failed to launch");

    expect(await readFile(codexConfigPath, "utf8")).toBe(oldConfig);
    expect(await readFile(codexAuthPath, "utf8")).toBe(oldAuth);
  });

  it("serializes concurrent activations with a process-level lock", async () => {
    const root = await mkdirTempRoot();
    const codexDir = join(root, ".codex");
    const codexConfigPath = join(codexDir, "config.toml");
    const codexAuthPath = join(codexDir, "auth.json");
    const accCodexBackupDir = join(root, ".acc", "backups", "codex");

    await mkdir(codexDir, { recursive: true });
    await writeFile(codexConfigPath, `model_provider = "legacy"\n`, "utf8");
    await writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: "legacy-key" }), "utf8");

    let resolveFirstRun!: () => void;
    const firstRunStarted = new Promise<void>((resolve) => {
      resolveFirstRun = () => resolve();
    });
    let releaseFirstRun!: () => void;
    const firstRunGate = new Promise<void>((resolve) => {
      releaseFirstRun = () => resolve();
    });

    const runner: ProcessRunner = {
      run: vi.fn(async (_command, args) => {
        if (args[0] === "--first") {
          resolveFirstRun();
          await firstRunGate;
        }
      })
    };

    const firstActivation = activateCodexProvider(
      { codexConfigPath, codexAuthPath, accCodexBackupDir },
      createCodexProvider("dev1", "key-1"),
      ["--first"],
      runner
    );
    await firstRunStarted;

    const secondActivation = activateCodexProvider(
      { codexConfigPath, codexAuthPath, accCodexBackupDir },
      createCodexProvider("dev2", "key-2"),
      ["--second"],
      runner
    );

    await new Promise((resolve) => setTimeout(resolve, 40));
    const duringFirst = await readFile(codexConfigPath, "utf8");
    expect(duringFirst).toContain(`model_provider = "dev1"`);
    expect(duringFirst).not.toContain(`model_provider = "dev2"`);

    releaseFirstRun();
    await Promise.all([firstActivation, secondActivation]);

    const finalConfig = await readFile(codexConfigPath, "utf8");
    expect(finalConfig).toContain(`model_provider = "dev2"`);
  });
});

async function mkdirTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "acc-codex-activate-test-"));
  tempDirs.push(root);
  return root;
}
