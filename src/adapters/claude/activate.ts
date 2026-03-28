// Claude provider 激活流程
// 1. 读取用户现有的 ~/.claude/settings.json
// 2. 合并 provider 的 env 配置生成运行时 settings
// 3. 写入 ~/.acc/runtime/claude/settings.json
// 4. 调用 `claude --settings <runtime_path>` 启动
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AccStoreError, AccValidationError } from "../../core/errors.js";
import type { AccPaths } from "../../core/paths.js";
import type { ProcessRunner } from "../../core/process.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { buildClaudeRuntimeSettings, buildClaudeUseArgs } from "./runtime.js";

type ClaudeActivationPaths = Pick<AccPaths, "claudeSettingsPath" | "accClaudeRuntimePath">;

export async function activateClaudeProvider(
  paths: ClaudeActivationPaths,
  provider: StoredProvider,
  extraArgs: string[],
  runner: ProcessRunner
): Promise<void> {
  const userSettings = await readClaudeUserSettings(paths.claudeSettingsPath);
  const runtimeSettings = buildClaudeRuntimeSettings(userSettings, provider);

  await mkdir(dirname(paths.accClaudeRuntimePath), { recursive: true });
  await writeFile(paths.accClaudeRuntimePath, `${JSON.stringify(runtimeSettings, null, 2)}\n`, "utf8");

  const args = buildClaudeUseArgs(paths.accClaudeRuntimePath, extraArgs);
  await runner.run("claude", args);
}

/** 读取用户原始 Claude settings，不存在或为空时返回空对象 */
async function readClaudeUserSettings(settingsPath: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return {};
    }
    throw new AccStoreError(`Failed to read Claude settings at ${settingsPath}`, { cause: error });
  }

  if (raw.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new AccValidationError(`Invalid JSON in Claude settings at ${settingsPath}`, { cause: error });
  }

  if (!isJsonObject(parsed)) {
    throw new AccValidationError(`Claude settings at ${settingsPath} must be a JSON object`);
  }

  return parsed;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
