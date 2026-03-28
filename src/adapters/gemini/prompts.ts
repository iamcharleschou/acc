// Gemini provider 的交互式 prompt
// 流程类似 Claude，但包含 Gemini 特有的字段（GEMINI_API_KEY、GOOGLE_GEMINI_BASE_URL、GEMINI_MODEL）
import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import { AccValidationError } from "../../core/errors.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { geminiEnvKeyValidationMessage, isValidGeminiEnvKey } from "./env-key.js";

const REQUIRED_MESSAGE = "不能为空";
type GeminiEditMode = "edit" | "add" | "delete";

// Gemini 的三个内置 env key
const GEMINI_API_KEY_KEY = "GEMINI_API_KEY";
const GEMINI_BASE_URL_KEY = "GOOGLE_GEMINI_BASE_URL";
const GEMINI_MODEL_KEY = "GEMINI_MODEL";

function validateRequired(value: string): true | string {
  return value.trim().length > 0 ? true : REQUIRED_MESSAGE;
}

/** 校验新增 key：非空 + 格式合法 + 不重复 */
function validateEnvKey(value: string, env: Record<string, string>): true | string {
  const key = value.trim();
  if (key.length === 0) {
    return REQUIRED_MESSAGE;
  }
  if (!isValidGeminiEnvKey(key)) {
    return geminiEnvKeyValidationMessage(key);
  }
  if (key in env) {
    return `环境变量 ${key} 已存在`;
  }
  return true;
}

export type GeminiProviderPromptResult = {
  alias: string;
  env: Record<string, string>;
};

export type GeminiProviderEditPromptInput = {
  alias: string;
  env: Record<string, string>;
};

export type GeminiProviderEditPromptResult =
  | { mode: "edit"; key: string; value: string }
  | { mode: "add"; key: string; value: string }
  | { mode: "delete"; keys: string[] };

/** 添加 Gemini provider 的交互流程 */
export async function promptGeminiProviderAdd(): Promise<GeminiProviderPromptResult> {
  const alias = (await input({ message: "Alias:", validate: validateRequired })).trim();
  const apiKey = (await password({ message: "GEMINI_API_KEY:", mask: "*", validate: validateRequired })).trim();
  // GOOGLE_GEMINI_BASE_URL 和 GEMINI_MODEL 为可选字段
  const baseUrl = (await input({ message: "GOOGLE_GEMINI_BASE_URL (optional):" })).trim();
  const model = (await input({ message: "GEMINI_MODEL (optional):" })).trim();

  const env: Record<string, string> = {
    [GEMINI_API_KEY_KEY]: apiKey
  };
  if (baseUrl.length > 0) {
    env[GEMINI_BASE_URL_KEY] = baseUrl;
  }
  if (model.length > 0) {
    env[GEMINI_MODEL_KEY] = model;
  }

  // 可选：循环添加额外环境变量
  while (await confirm({ message: "是否添加额外环境变量?", default: false })) {
    const extraKey = (
      await input({
        message: "额外环境变量 Key:",
        validate: (value: string) => validateEnvKey(value, env)
      })
    ).trim();
    const extraValue = (
      await input({
        message: `Value (${extraKey}):`,
        validate: validateRequired
      })
    ).trim();
    env[extraKey] = extraValue;
  }

  return { alias, env };
}

/** 编辑 Gemini provider 的交互流程 */
export async function promptGeminiProviderEdit(
  provider: GeminiProviderEditPromptInput
): Promise<GeminiProviderEditPromptResult> {
  const mode = await select<GeminiEditMode>({
    message: `编辑 Gemini provider (${provider.alias})：`,
    choices: [
      { value: "edit", name: "edit: 修改现有环境变量" },
      { value: "add", name: "add: 新增环境变量" },
      { value: "delete", name: "delete: 删除环境变量" }
    ]
  });

  if (mode === "edit") {
    return promptGeminiEnvEdit(provider.env);
  }
  if (mode === "add") {
    return promptGeminiEnvAdd(provider.env);
  }
  return promptGeminiEnvDelete(provider.env);
}

/** 从 StoredProvider 中提取 env 后调用编辑 prompt */
export async function promptGeminiProviderEditFromStored(
  provider: StoredProvider
): Promise<GeminiProviderEditPromptResult> {
  const env = asStringRecord(provider.config.env, "Gemini env");
  return promptGeminiProviderEdit({
    alias: provider.alias,
    env
  });
}

async function promptGeminiEnvEdit(env: Record<string, string>): Promise<GeminiProviderEditPromptResult> {
  const keys = Object.keys(env).sort();
  const key = await select<string>({
    message: "选择要修改的环境变量:",
    choices: keys.map((name) => ({ value: name, name }))
  });
  const value = (await input({ message: `Value (${key}):`, validate: validateRequired })).trim();
  return { mode: "edit", key, value };
}

async function promptGeminiEnvAdd(env: Record<string, string>): Promise<GeminiProviderEditPromptResult> {
  const key = (
    await input({
      message: "新增环境变量 Key:",
      validate: (value: string) => validateEnvKey(value, env)
    })
  ).trim();
  const value = (await input({ message: `Value (${key}):`, validate: validateRequired })).trim();
  return { mode: "add", key, value };
}

/** 删除模式：GEMINI_API_KEY 受保护不可删除 */
async function promptGeminiEnvDelete(env: Record<string, string>): Promise<GeminiProviderEditPromptResult> {
  const deletableKeys = Object.keys(env).filter((key) => key !== GEMINI_API_KEY_KEY).sort();
  if (deletableKeys.length === 0) {
    return { mode: "delete", keys: [] };
  }

  const keys = await checkbox<string>({
    message: "选择要删除的环境变量:",
    choices: deletableKeys.map((name) => ({ value: name, name }))
  });
  if (keys.length === 0) {
    return { mode: "delete", keys: [] };
  }
  const confirmed = await confirm({
    message: `确认删除字段: ${keys.join(", ")} ?`,
    default: false
  });
  if (!confirmed) {
    return { mode: "delete", keys: [] };
  }
  return { mode: "delete", keys };
}

function asStringRecord(value: unknown, label: string): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    throw new AccValidationError(`${label} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(raw)) {
    if (typeof item !== "string") {
      throw new AccValidationError(`${label}.${key} must be a string`);
    }
    next[key] = item;
  }
  return next;
}
