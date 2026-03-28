// Claude 运行时 settings 构建
// 将用户的 settings.json 与 provider 的 env 合并为最终运行时配置
import type { StoredProvider } from "../../core/store/schema.js";

const DEFAULT_SETTING_SOURCES = "project,local";
const SETTING_SOURCES_FLAG = "--setting-sources";
const SETTINGS_FLAG = "--settings";

/**
 * 合并用户 settings 和 provider env 为运行时 settings。
 *
 * 认证互斥规则：
 * - 如果 provider 提供了 API_KEY，则删除 AUTH_TOKEN 并配置 apiKeyHelper
 * - 如果 provider 提供了 AUTH_TOKEN，则删除 API_KEY 和 apiKeyHelper
 */
export function buildClaudeRuntimeSettings(
  userSettings: Record<string, unknown>,
  provider: StoredProvider
): Record<string, unknown> {
  const runtimeSettings: Record<string, unknown> = { ...userSettings };
  const providerEnv = readProviderEnv(provider);
  const mergedEnv: Record<string, unknown> = {
    ...readObjectRecord(userSettings.env),
    ...providerEnv
  };

  if (hasNonEmptyString(providerEnv.ANTHROPIC_API_KEY)) {
    // API_KEY 模式：移除冲突的 AUTH_TOKEN，配置 apiKeyHelper 用于 Claude CLI 获取密钥
    delete mergedEnv.ANTHROPIC_AUTH_TOKEN;
    runtimeSettings.apiKeyHelper = buildApiKeyHelper(providerEnv.ANTHROPIC_API_KEY);
  } else if (hasNonEmptyString(providerEnv.ANTHROPIC_AUTH_TOKEN)) {
    // AUTH_TOKEN 模式：移除冲突的 API_KEY 和 apiKeyHelper
    delete mergedEnv.ANTHROPIC_API_KEY;
    delete runtimeSettings.apiKeyHelper;
  }

  runtimeSettings.env = mergedEnv;
  return runtimeSettings;
}

/**
 * 构建传给 `claude` CLI 的参数列表。
 * 
 * 如果用户没有显式传 --setting-sources，默认使用 "project,local"
 * 以跳过远端 settings 拉取
 */
export function buildClaudeUseArgs(runtimePath: string, extraArgs: string[]): string[] {
  const args: string[] = [];
  if (!hasExplicitSettingSources(extraArgs)) {
    args.push(SETTING_SOURCES_FLAG, DEFAULT_SETTING_SOURCES);
  }
  args.push(SETTINGS_FLAG, runtimePath, ...extraArgs);
  return args;
}

function hasExplicitSettingSources(extraArgs: string[]): boolean {
  return extraArgs.some((arg) => arg === SETTING_SOURCES_FLAG || arg.startsWith(`${SETTING_SOURCES_FLAG}=`));
}

/** 从 provider config 中提取 env，过滤掉非 string 值 */
function readProviderEnv(provider: StoredProvider): Record<string, string> {
  const rawEnv = readObjectRecord(provider.config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function readObjectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** 构建 apiKeyHelper 命令，Claude CLI 会执行该命令来获取 API key */
function buildApiKeyHelper(apiKey: string): string {
  // 对单引号做转义：' → '"'"'（结束引用 → 转义引号 → 重新开始引用）
  const escaped = apiKey.replaceAll("'", "'\"'\"'");
  return `echo '${escaped}'`;
}
