// Codex 配置应用（不启动 CLI）
// 仅将 provider 配置写入 ~/.codex/config.toml 和 ~/.codex/auth.json，
// 不触发 codex 进程启动，用于 `acc provider active codex <alias>` 命令。
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AccStoreError, AccValidationError } from "../../core/errors.js";
import type { AccPaths } from "../../core/paths.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { CODEX_ALIAS_SAFETY_MESSAGE, isSafeCodexAlias } from "./alias-safety.js";
import { setModelProvider, upsertModelProviderBlock } from "./toml-patch.js";

type CodexConfigPaths = Pick<AccPaths, "codexConfigPath" | "codexAuthPath">;

const SECRET_DIR_MODE = 0o700;
const SECRET_FILE_MODE = 0o600;

/**
 * 将 Codex provider 配置写入 config.toml 和 auth.json，不启动 CLI。
 * 用于 `acc provider active codex <alias>`。
 */
export async function applyCodexProviderConfig(
  paths: CodexConfigPaths,
  provider: StoredProvider
): Promise<void> {
  const config = readCodexProviderConfig(provider);
  const alias = requireSafeAlias(provider.alias);

  await ensureSecretDirectory(dirname(paths.codexConfigPath));
  await ensureSecretDirectory(dirname(paths.codexAuthPath));

  // 读取当前 config.toml（不存在时为空字符串）
  const currentToml = await readFileOrEmpty(paths.codexConfigPath);

  // 写入 [model_providers.<alias>] 块并设置顶层 model_provider = "<alias>"
  const withProviderBlock = upsertModelProviderBlock(currentToml, alias, {
    name: provider.providerName,
    baseUrl: config.baseUrl,
    wireApi: config.wireApi,
    requiresOpenAiAuth: config.requiresOpenAiAuth
  });
  const nextToml = setModelProvider(withProviderBlock, alias);

  await writeFile(paths.codexConfigPath, nextToml, "utf8");
  await writeSecretAuthFile(paths.codexAuthPath, config.apiKey);
}

/** 从 StoredProvider 中提取并校验 Codex 所需的配置字段 */
function readCodexProviderConfig(provider: StoredProvider): {
  baseUrl: string;
  apiKey: string;
  wireApi: string;
  requiresOpenAiAuth: boolean;
} {
  const baseUrl = requireNonEmptyString(provider.config.baseUrl, "Codex baseUrl");
  const apiKey = requireNonEmptyString(provider.config.apiKey, "Codex apiKey");
  const wireApi = requireNonEmptyString(provider.config.wireApi, "Codex wireApi");

  if (typeof provider.config.requiresOpenAiAuth !== "boolean") {
    throw new AccValidationError("Codex requiresOpenAiAuth must be a boolean");
  }

  return {
    baseUrl,
    apiKey,
    wireApi,
    requiresOpenAiAuth: provider.config.requiresOpenAiAuth
  };
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new AccValidationError(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AccValidationError(`${label} must be a non-empty string`);
  }
  return trimmed;
}

function requireSafeAlias(alias: string): string {
  const trimmed = alias.trim();
  if (trimmed.length === 0 || !isSafeCodexAlias(trimmed)) {
    throw new AccValidationError(CODEX_ALIAS_SAFETY_MESSAGE);
  }
  return trimmed;
}

async function readFileOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return "";
    }
    throw new AccStoreError(`Failed to read file at ${path}`, { cause: error });
  }
}

async function writeSecretAuthFile(authPath: string, apiKey: string): Promise<void> {
  try {
    await writeFile(
      authPath,
      `${JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)}\n`,
      { encoding: "utf8", mode: SECRET_FILE_MODE }
    );
    await chmod(authPath, SECRET_FILE_MODE);
  } catch (error) {
    throw new AccStoreError(`Failed to write Codex auth file at ${authPath}`, { cause: error });
  }
}

async function ensureSecretDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: SECRET_DIR_MODE });
    await chmod(path, SECRET_DIR_MODE);
  } catch (error) {
    throw new AccStoreError(`Failed to prepare secret directory at ${path}`, { cause: error });
  }
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
