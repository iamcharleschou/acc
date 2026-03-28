// Agent ID 定义与解析
// 支持的 agent：cc (ClaudeCode)、codex (OpenAI Codex)、gemini (Google Gemini)

/** 全部支持的 agent canonical id */
export const AGENT_IDS = ["cc", "codex", "gemini"] as const;

export type AgentId = (typeof AGENT_IDS)[number];

/** 别名 → canonical id 映射（如 `claude` → `cc`） */
const AGENT_ALIAS_TO_CANONICAL: Record<string, AgentId> = {
  cc: "cc",
  claude: "cc",
  codex: "codex",
  gemini: "gemini"
};

/** 将用户输入的 agent 名称规范化为 canonical id，无法识别时原样返回 */
export function canonicalizeAgentId(token: string): string {
  return AGENT_ALIAS_TO_CANONICAL[token.toLowerCase()] ?? token;
}

/** 类型守卫：判断字符串是否为合法 AgentId */
export function isAgentId(value: string): value is AgentId {
  return value === "cc" || value === "codex" || value === "gemini";
}

/** 解析 agent 标识符，支持别名（如 `claude`），无法识别时返回 null */
export function parseAgentId(token: string): AgentId | null {
  const normalized = canonicalizeAgentId(token);
  return isAgentId(normalized) ? normalized : null;
}

/** 判断一个 token 是否能被识别为某个 agent（含别名） */
export function isExplicitAgentId(token: string): boolean {
  return parseAgentId(token) !== null;
}
