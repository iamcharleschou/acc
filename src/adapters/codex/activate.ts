// Codex provider 激活流程
// 1. 备份现有的 config.toml 和 auth.json
// 2. 在 config.toml 中写入/更新 model_providers 块和 model_provider 字段
// 3. 将 API key 写入 auth.json（OPENAI_API_KEY 格式）
// 4. 启动 codex CLI
// 5. 出错时自动回滚到备份
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { snapshotFileIfExists } from "../../core/backup.js";
import { AccStoreError, AccValidationError } from "../../core/errors.js";
import type { AccPaths } from "../../core/paths.js";
import type { ProcessRunner } from "../../core/process.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { CODEX_ALIAS_SAFETY_MESSAGE, isSafeCodexAlias } from "./alias-safety.js";
import { setModelProvider, upsertModelProviderBlock } from "./toml-patch.js";

type CodexActivationPaths = Pick<AccPaths, "codexConfigPath" | "codexAuthPath" | "accCodexBackupDir">;
type OptionalFileSnapshot = { exists: boolean; content: Buffer };
const SECRET_DIR_MODE = 0o700;
const SECRET_FILE_MODE = 0o600;

export async function activateCodexProvider(
  paths: CodexActivationPaths,
  provider: StoredProvider,
  extraArgs: string[],
  runner: ProcessRunner
): Promise<void> {
  const config = readCodexProviderConfig(provider);
  const alias = requireSafeAlias(provider.alias);

  await withCodexActivationLock(paths, async () => {
    await ensureSecretDirectory(dirname(paths.codexConfigPath));
    await ensureSecretDirectory(dirname(paths.codexAuthPath));
    await ensureSecretDirectory(paths.accCodexBackupDir);

    // 快照当前文件，用于出错时回滚
    const configSnapshot = await readOptionalFile(paths.codexConfigPath);
    const authSnapshot = await readOptionalFile(paths.codexAuthPath);

    // 备份到 ~/.acc/backups/codex/ 目录（带时间戳）
    await snapshotFileIfExists(paths.codexConfigPath, paths.accCodexBackupDir, "config.toml");
    await snapshotFileIfExists(paths.codexAuthPath, paths.accCodexBackupDir, "auth.json", { secretSafe: true });

    try {
      // 在 config.toml 中插入/更新 [model_providers.<alias>] 块
      const withProviderBlock = upsertModelProviderBlock(configSnapshot.content.toString("utf8"), alias, {
        name: provider.providerName,
        baseUrl: config.baseUrl,
        wireApi: config.wireApi,
        requiresOpenAiAuth: config.requiresOpenAiAuth
      });
      // 设置顶层 model_provider = "<alias>"
      const nextToml = setModelProvider(withProviderBlock, alias);

      await writeFile(paths.codexConfigPath, nextToml, "utf8");
      await writeSecretAuthFile(paths.codexAuthPath, config.apiKey);
      await runner.run("codex", extraArgs);
    } catch (error) {
      // 启动失败时回滚配置文件
      await rollbackCodexFiles(paths, configSnapshot, authSnapshot, error);
      throw error;
    }
  });
}

/** 读取文件内容，不存在时返回 exists=false 和空 buffer */
async function readOptionalFile(path: string): Promise<OptionalFileSnapshot> {
  try {
    return {
      exists: true,
      content: await readFile(path)
    };
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return {
        exists: false,
        content: Buffer.alloc(0)
      };
    }
    throw new AccStoreError(`Failed to read file at ${path}`, { cause: error });
  }
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

/** 校验 alias 是否为 TOML 安全的键名 */
function requireSafeAlias(alias: string): string {
  const trimmed = alias.trim();
  if (trimmed.length === 0 || !isSafeCodexAlias(trimmed)) {
    throw new AccValidationError(CODEX_ALIAS_SAFETY_MESSAGE);
  }
  return trimmed;
}

/**
 * 回滚：将 config.toml 和 auth.json 恢复到激活前的状态。
 * 如果回滚本身也失败，将原始错误和回滚错误一起包装为 AggregateError 抛出。
 */
async function rollbackCodexFiles(
  paths: CodexActivationPaths,
  configSnapshot: OptionalFileSnapshot,
  authSnapshot: OptionalFileSnapshot,
  activationError: unknown
): Promise<void> {
  const rollbackErrors: unknown[] = [];

  try {
    await restoreFile(paths.codexConfigPath, configSnapshot);
  } catch (error) {
    rollbackErrors.push(new AccStoreError(`Failed to roll back Codex config at ${paths.codexConfigPath}`, { cause: error }));
  }

  try {
    await restoreFile(paths.codexAuthPath, authSnapshot);
  } catch (error) {
    rollbackErrors.push(new AccStoreError(`Failed to roll back Codex auth at ${paths.codexAuthPath}`, { cause: error }));
  }

  if (rollbackErrors.length > 0) {
    throw new AccStoreError(
      "Codex activation failed and rollback was incomplete",
      {
        cause: new AggregateError([activationError, ...rollbackErrors])
      }
    );
  }
}

/** 恢复文件：已存在的写回内容，原本不存在的删除 */
async function restoreFile(path: string, snapshot: OptionalFileSnapshot): Promise<void> {
  if (snapshot.exists) {
    await writeFile(path, snapshot.content);
    return;
  }
  await rm(path, { force: true });
}

/** 写入 auth.json，设置 0o600 权限保护敏感信息 */
async function writeSecretAuthFile(authPath: string, apiKey: string): Promise<void> {
  try {
    await writeFile(authPath, `${JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)}\n`, { encoding: "utf8", mode: SECRET_FILE_MODE });
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

/** 对 Codex 备份目录加文件锁，防止并发激活导致配置冲突 */
async function withCodexActivationLock<T>(paths: CodexActivationPaths, action: () => Promise<T>): Promise<T> {
  await ensureSecretDirectory(paths.accCodexBackupDir);
  const release = await lockfile.lock(paths.accCodexBackupDir, {
    realpath: false,
    retries: {
      retries: 10,
      minTimeout: 20,
      maxTimeout: 100
    }
  });
  try {
    return await action();
  } finally {
    await release();
  }
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
