// argv 预处理：大小写归一化 + 旧版命令扩展
// 在 Commander 解析之前对用户输入做标准化，使得 `ACC Add Claude ...` 等大小写混用也能正常工作
import { canonicalizeAgentId, isExplicitAgentId } from "../domain/agent.js";

/** 需要做大小写归一化的控制关键词 */
const CONTROL_TOKENS = new Set(["provider", "use", "add", "list", "edit", "remove"]);

function normalizeControlToken(token: string): string {
  const lowered = token.toLowerCase();
  return CONTROL_TOKENS.has(lowered) ? lowered : token;
}

/**
 * 对 argv 中的控制关键词做大小写归一（如 `Provider` → `provider`），
 * 并将 agent 别名规范化为 canonical id（如 `claude` → `cc`）
 */
export function normalizeControlArgs(argv: string[]): string[] {
  if (argv.length === 0) {
    return [];
  }

  const normalized = [...argv];
  const command = normalizeControlToken(normalized[0]);
  normalized[0] = command;

  if (command === "provider" && normalized[1]) {
    normalized[1] = normalizeControlToken(normalized[1]);
    if (normalized[2]) {
      normalized[2] = canonicalizeAgentId(normalized[2]);
    }
    return normalized;
  }

  if (command === "use" && normalized[1] && isExplicitAgentId(normalized[1])) {
    normalized[1] = canonicalizeAgentId(normalized[1]);
    return normalized;
  }

  return normalized;
}

/**
 * 将旧版 Claude 简写语法扩展为完整的 provider 子命令。
 *
 * 例如：
 *   `acc add minimax`   → `acc provider add cc minimax`
 *   `acc use yh`        → `acc use cc yh`
 */
export function expandLegacyArgs(argv: string[]): string[] {
  if (argv.length === 0) {
    return [];
  }

  const [command, ...rest] = argv;

  if (command === "add") {
    return ["provider", "add", "cc", ...rest];
  }

  if (command === "list") {
    return ["provider", "list", "cc", ...rest];
  }

  if (command === "edit") {
    return ["provider", "edit", "cc", ...rest];
  }

  if (command === "remove") {
    return ["provider", "remove", "cc", ...rest];
  }

  // `acc use <alias>` 旧版语法默认 agent 为 cc，
  // 但如果第二个参数已经是合法 agent id，则按新语法处理
  if (command === "use" && rest.length > 0) {
    const [second, ...tail] = rest;
    if (isExplicitAgentId(second)) {
      return ["use", canonicalizeAgentId(second), ...tail];
    }
    return ["use", "cc", second, ...tail];
  }

  return argv;
}
