// Claude provider 的交互式 prompt
// 用 @inquirer/prompts 收集用户输入（alias、base URL、认证方式、额外环境变量）
import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import { AccValidationError } from "../../core/errors.js";
import type { StoredProvider } from "../../core/store/schema.js";

const REQUIRED_MESSAGE = "不能为空";

type ClaudeAuthMode = "API_KEY" | "AUTH_TOKEN";
type ClaudeEditMode = "edit" | "add" | "delete";
/** ANTHROPIC_BASE_URL 在 delete 模式下受保护，不可删除 */
const CLAUDE_BASE_URL_KEY = "ANTHROPIC_BASE_URL";

function validateRequired(value: string): true | string {
  return value.trim().length > 0 ? true : REQUIRED_MESSAGE;
}

/** 校验新增环境变量 key：非空且不能与已有 key 重复 */
function validateEnvKey(value: string, env: Record<string, string>): true | string {
  const key = value.trim();
  if (key.length === 0) {
    return REQUIRED_MESSAGE;
  }
  if (key in env) {
    return `环境变量 ${key} 已存在`;
  }
  return true;
}

export type ClaudeProviderPromptResult = {
  alias: string;
  env: Record<string, string>;
};

export type ClaudeProviderEditPromptInput = {
  alias: string;
  env: Record<string, string>;
};

export type ClaudeProviderEditPromptResult =
  | { mode: "edit"; key: string; value: string }
  | { mode: "add"; key: string; value: string }
  | { mode: "delete"; keys: string[] };

/** 添加 Claude provider 的交互流程 */
export async function promptClaudeProviderAdd(): Promise<ClaudeProviderPromptResult> {
  const alias = (await input({ message: "Alias:", validate: validateRequired })).trim();
  const baseUrl = (await input({ message: "ANTHROPIC_BASE_URL:", validate: validateRequired })).trim();
  const authMode = await select<ClaudeAuthMode>({
    message: "认证方式:",
    choices: [
      { value: "API_KEY", name: "API_KEY (ANTHROPIC_API_KEY)" },
      { value: "AUTH_TOKEN", name: "AUTH_TOKEN (ANTHROPIC_AUTH_TOKEN)" }
    ]
  });
  const credential = (await password({
    message: authMode === "API_KEY" ? "ANTHROPIC_API_KEY:" : "ANTHROPIC_AUTH_TOKEN:",
    mask: "*",
    validate: validateRequired
  })).trim();

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: baseUrl
  };

  if (authMode === "API_KEY") {
    env.ANTHROPIC_API_KEY = credential;
  } else {
    env.ANTHROPIC_AUTH_TOKEN = credential;
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

  return {
    alias,
    env
  };
}

/** 编辑 Claude provider 的交互流程（选择 edit/add/delete 模式） */
export async function promptClaudeProviderEdit(
  provider: ClaudeProviderEditPromptInput
): Promise<ClaudeProviderEditPromptResult> {
  const mode = await select<ClaudeEditMode>({
    message: `编辑 Claude provider (${provider.alias})：`,
    choices: [
      { value: "edit", name: "edit: 修改现有环境变量" },
      { value: "add", name: "add: 新增环境变量" },
      { value: "delete", name: "delete: 删除环境变量" }
    ]
  });

  if (mode === "edit") {
    return promptClaudeEnvEdit(provider.env);
  }
  if (mode === "add") {
    return promptClaudeEnvAdd(provider.env);
  }
  return promptClaudeEnvDelete(provider.env);
}

/** 从 StoredProvider 中提取 env 后调用编辑 prompt */
export async function promptClaudeProviderEditFromStored(
  provider: StoredProvider
): Promise<ClaudeProviderEditPromptResult> {
  const env = asStringRecord(provider.config.env, "Claude env");
  return promptClaudeProviderEdit({
    alias: provider.alias,
    env
  });
}

async function promptClaudeEnvEdit(env: Record<string, string>): Promise<ClaudeProviderEditPromptResult> {
  const keys = Object.keys(env).sort();
  const key = await select<string>({
    message: "选择要修改的环境变量:",
    choices: keys.map((name) => ({ value: name, name }))
  });
  const value = (await input({ message: `Value (${key}):`, validate: validateRequired })).trim();
  return { mode: "edit", key, value };
}

async function promptClaudeEnvAdd(env: Record<string, string>): Promise<ClaudeProviderEditPromptResult> {
  const key = (
    await input({
      message: "新增环境变量 Key:",
      validate: (value: string) => validateEnvKey(value, env)
    })
  ).trim();
  const value = (await input({ message: `Value (${key}):`, validate: validateRequired })).trim();
  return { mode: "add", key, value };
}

/** 删除模式：过滤掉 ANTHROPIC_BASE_URL（受保护），让用户多选要删除的 key */
async function promptClaudeEnvDelete(env: Record<string, string>): Promise<ClaudeProviderEditPromptResult> {
  const deletableKeys = Object.keys(env).filter((key) => key !== CLAUDE_BASE_URL_KEY).sort();
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

/** 将 unknown 类型的 env 对象转换为 Record<string, string>，值非 string 时抛错 */
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
