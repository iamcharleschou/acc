// Codex provider 的交互式 prompt
import { input, password, select } from "@inquirer/prompts";
import { AccValidationError } from "../../core/errors.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { isSafeCodexAlias } from "./alias-safety.js";

const REQUIRED_MESSAGE = "不能为空";

function validateRequired(value: string): true | string {
  return value.trim().length > 0 ? true : REQUIRED_MESSAGE;
}

/** 校验 alias 非空且字符集合法（TOML 安全） */
function validateCodexAlias(value: string): true | string {
  if (value.trim().length === 0) {
    return REQUIRED_MESSAGE;
  }
  return isSafeCodexAlias(value.trim()) ? true : "仅支持字母、数字、下划线与连字符（A-Za-z0-9_-）";
}

export type CodexProviderPromptResult = {
  alias: string;
  baseUrl: string;
  apiKey: string;
  wireApi: "responses";
  requiresOpenAiAuth: true;
};

export type CodexProviderEditPromptInput = {
  alias: string;
  baseUrl: string;
  apiKey: string;
};

export type CodexProviderEditPromptResult = {
  field: "baseUrl" | "apiKey";
  value: string;
};

/** 添加 Codex provider 的交互流程 */
export async function promptCodexProviderAdd(): Promise<CodexProviderPromptResult> {
  const alias = (await input({ message: "Alias:", validate: validateCodexAlias })).trim();
  const baseUrl = (await input({ message: "baseUrl:", validate: validateRequired })).trim();
  const apiKey = (await password({ message: "apiKey:", mask: "*", validate: validateRequired })).trim();

  return {
    alias,
    baseUrl,
    apiKey,
    wireApi: "responses",        // 当前 Codex 仅支持 responses wire API
    requiresOpenAiAuth: true     // 默认需要写入 OPENAI_API_KEY 到 auth.json
  };
}

/** 编辑 Codex provider：选择要修改 baseUrl 还是 apiKey */
export async function promptCodexProviderEdit(
  provider: CodexProviderEditPromptInput
): Promise<CodexProviderEditPromptResult> {
  const field = await select<"baseUrl" | "apiKey">({
    message: `编辑 Codex provider (${provider.alias})：`,
    choices: [
      {
        value: "baseUrl",
        name: `baseUrl (current: ${provider.baseUrl})`
      },
      { value: "apiKey", name: "apiKey" }
    ]
  });

  if (field === "apiKey") {
    const value = (await password({ message: "apiKey:", mask: "*", validate: validateRequired })).trim();
    return { field, value };
  }

  const value = (await input({ message: "baseUrl:", validate: validateRequired })).trim();
  return { field, value };
}

/** 从 StoredProvider 中提取字段后调用编辑 prompt */
export async function promptCodexProviderEditFromStored(
  provider: StoredProvider
): Promise<CodexProviderEditPromptResult> {
  return promptCodexProviderEdit({
    alias: provider.alias,
    baseUrl: requiredString(provider.config.baseUrl, "Codex baseUrl"),
    apiKey: requiredString(provider.config.apiKey, "Codex apiKey")
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AccValidationError(`${label} must be a non-empty string`);
  }
  return value;
}
