// Domain 层 re-export
// 将 core/agents.ts 中的 agent 相关类型和函数统一导出给上层使用
export { canonicalizeAgentId, isExplicitAgentId, parseAgentId, type AgentId } from "../core/agents.js";
