// Adapter 层公共类型定义
import { z } from "zod";
import type { AgentId } from "../core/agents.js";
import type { StoredProvider } from "../core/store/schema.js";

/** 将用户 prompt 输入转换为 StoredProvider 的解析函数 */
export type ProviderParser = (providerName: string, raw: unknown) => StoredProvider;

/** 按 agent id 索引的 parser 映射表 */
export type ProviderParsers = Partial<Record<AgentId, ProviderParser>>;

/**
 * Claude / Gemini 通用的 env 风格编辑变更类型：
 * - edit: 修改已有键的值
 * - add: 新增键值对
 * - delete: 批量删除键
 */
export type EnvStyleProviderEditMutation =
  | { mode: "edit"; key: string; value: string }
  | { mode: "add"; key: string; value: string }
  | { mode: "delete"; keys: string[] };

export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
