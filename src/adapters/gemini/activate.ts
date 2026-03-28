// Gemini provider 激活流程
// 1. 从 provider config 中读取并校验 env
// 2. 完整覆盖 ~/.gemini/.env（非合并）
// 3. 启动 `gemini` CLI
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AccStoreError, AccValidationError } from "../../core/errors.js";
import type { AccPaths } from "../../core/paths.js";
import type { ProcessRunner } from "../../core/process.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { geminiEnvKeyValidationMessage, isValidGeminiEnvKey } from "./env-key.js";

type GeminiActivationPaths = Pick<AccPaths, "geminiEnvPath">;

const SECRET_DIR_MODE = 0o700;
const SECRET_FILE_MODE = 0o600;

// Gemini 的三个内置 env key
const GEMINI_API_KEY_KEY = "GEMINI_API_KEY";
const GEMINI_BASE_URL_KEY = "GOOGLE_GEMINI_BASE_URL";
const GEMINI_MODEL_KEY = "GEMINI_MODEL";

export async function activateGeminiProvider(
  paths: GeminiActivationPaths,
  provider: StoredProvider,
  extraArgs: string[],
  runner: ProcessRunner
): Promise<void> {
  const env = readGeminiProviderEnv(provider);

  await ensureSecretDirectory(dirname(paths.geminiEnvPath));
  // 注意：这里是完整覆盖 .env 文件，不会与旧内容合并
  await writeGeminiEnvFile(paths.geminiEnvPath, env);
  await runner.run("gemini", extraArgs);
}

/** 从 provider config 中读取 env，校验所有 key 的合法性和必填字段 */
function readGeminiProviderEnv(provider: StoredProvider): Record<string, string> {
  if (!isRecord(provider.config)) {
    throw new AccValidationError("Gemini provider config must be an object");
  }
  const rawEnv = provider.config.env;
  if (!isRecord(rawEnv)) {
    throw new AccValidationError("Gemini provider config.env must be an object");
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    // 校验 key 格式（必须匹配 ^[A-Za-z_][A-Za-z0-9_]*$）
    if (!isValidGeminiEnvKey(key)) {
      throw new AccValidationError(geminiEnvKeyValidationMessage(key));
    }
    if (typeof value !== "string") {
      throw new AccValidationError(`Gemini env.${key} must be a string`);
    }
    env[key] = value;
  }

  // GEMINI_API_KEY 必填
  const apiKey = env[GEMINI_API_KEY_KEY];
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new AccValidationError(`Gemini env.${GEMINI_API_KEY_KEY} must be a non-empty string`);
  }
  env[GEMINI_API_KEY_KEY] = apiKey.trim();

  // GOOGLE_GEMINI_BASE_URL 和 GEMINI_MODEL 可选，但如果提供则不能为空
  normalizeOptionalEnvKey(env, GEMINI_BASE_URL_KEY);
  normalizeOptionalEnvKey(env, GEMINI_MODEL_KEY);
  return env;
}

/** 可选字段存在时做 trim 并校验非空 */
function normalizeOptionalEnvKey(env: Record<string, string>, key: string): void {
  if (!(key in env)) {
    return;
  }
  const trimmed = env[key].trim();
  if (trimmed.length === 0) {
    throw new AccValidationError(`Gemini env.${key} must be a non-empty string when provided`);
  }
  env[key] = trimmed;
}

async function ensureSecretDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true, mode: SECRET_DIR_MODE });
    await chmod(path, SECRET_DIR_MODE);
  } catch (error) {
    throw new AccStoreError(`Failed to prepare Gemini env directory at ${path}`, { cause: error });
  }
}

/** 将 env 写入 .env 文件，设置 0o600 权限 */
async function writeGeminiEnvFile(path: string, env: Record<string, string>): Promise<void> {
  const rendered = renderDotEnv(env);
  try {
    await writeFile(path, rendered, { encoding: "utf8", mode: SECRET_FILE_MODE });
    await chmod(path, SECRET_FILE_MODE);
  } catch (error) {
    throw new AccStoreError(`Failed to write Gemini env file at ${path}`, { cause: error });
  }
}

/** 将 env 渲染为 dotenv 格式（KEY=VALUE），按 key 字母序排列 */
function renderDotEnv(env: Record<string, string>): string {
  const keys = Object.keys(env).sort();
  const lines = keys.map((key) => `${key}=${escapeDotEnvValue(env[key])}`);
  return `${lines.join("\n")}\n`;
}

/** 对 dotenv value 做转义：纯安全字符直接输出，否则 JSON 编码 */
function escapeDotEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
