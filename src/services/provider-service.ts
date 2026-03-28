// Provider 业务逻辑层
// 在 store 和 adapter 之间做桥接：
//   add/edit 时通过 parser 校验输入后写入 store
//   list/get 时从 store 读取并返回
//   edit 支持三种变更模式（env 风格的 edit/add/delete，以及 codex 的字段替换）
import { parseAgentId, type AgentId } from "../core/agents.js";
import { AccValidationError } from "../core/errors.js";
import type { ProviderStore } from "../core/store/provider-store.js";
import type { StoredProvider } from "../core/store/schema.js";
import type { EnvStyleProviderEditMutation, ProviderParser, ProviderParsers } from "../adapters/base.js";

export type ProviderStoreLike = Pick<ProviderStore, "load" | "upsert" | "remove">;

// --- Edit Mutation 类型 ---
// Claude 和 Gemini 使用 env 风格（修改/新增/删除环境变量键值对）
// Codex 使用字段风格（直接替换 baseUrl 或 apiKey）

export type ClaudeProviderEditMutation = EnvStyleProviderEditMutation;
export type GeminiProviderEditMutation = EnvStyleProviderEditMutation;
export type CodexProviderEditMutation = {
  field: "baseUrl" | "apiKey";
  value: string;
};
export type ProviderEditMutation =
  | ClaudeProviderEditMutation
  | GeminiProviderEditMutation
  | CodexProviderEditMutation;

/** Claude env 中的 base URL 键名 */
const CLAUDE_BASE_URL_KEY = "ANTHROPIC_BASE_URL";
/** Gemini env 中的 API key 键名 */
const GEMINI_API_KEY_KEY = "GEMINI_API_KEY";

export class ProviderService {
  constructor(
    private readonly store: ProviderStoreLike,
    private readonly parsers: ProviderParsers
  ) {}

  /** 添加：使用 agent 对应的 parser 校验后写入 store */
  async add(agent: string, providerName: string, raw: unknown): Promise<void> {
    const parser = this.resolveParser(agent);
    const parsed = parser(providerName, raw);
    await this.store.upsert(agent, parsed.alias, parsed);
  }

  /** 列出 agent 下所有 provider */
  async list(agent: string): Promise<StoredProvider[]> {
    const agentId = this.resolveAgentId(agent);
    const config = await this.store.load();
    return Object.values(config.providers[agentId]);
  }

  async remove(agent: string, alias: string): Promise<void> {
    await this.store.remove(agent, alias);
  }

  /** 获取单个 provider，不存在时抛出错误 */
  async get(agent: string, alias: string): Promise<StoredProvider> {
    const agentId = this.resolveAgentId(agent);
    const aliasKey = this.resolveAlias(alias);
    const config = await this.store.load();
    const provider = config.providers[agentId][aliasKey];
    if (!provider) {
      throw new AccValidationError(`Provider alias "${aliasKey}" not found for agent "${agentId}"`);
    }
    return provider;
  }

  /** 编辑：在现有 provider 上应用 mutation，再通过 parser 重新校验后写入 */
  async edit(agent: string, alias: string, mutation: ProviderEditMutation): Promise<void> {
    const agentId = this.resolveAgentId(agent);
    const aliasKey = this.resolveAlias(alias);
    const current = await this.get(agentId, aliasKey);
    const parser = this.resolveParser(agentId);
    const raw = this.applyMutation(agentId, current, mutation);
    const parsed = parser(current.providerName, raw);
    await this.store.upsert(agentId, aliasKey, parsed);
  }

  private resolveParser(agent: string): ProviderParser {
    const agentId = this.resolveAgentId(agent);
    const parser = this.parsers[agentId];
    if (!parser) {
      throw new AccValidationError(`Provider parser is not implemented for agent "${agentId}"`);
    }
    return parser;
  }

  private resolveAgentId(agent: string): AgentId {
    const agentId = parseAgentId(agent);
    if (agentId === null) {
      throw new AccValidationError(`Unsupported agent id: ${agent}`);
    }
    return agentId;
  }

  private resolveAlias(alias: string): string {
    const aliasKey = alias.trim();
    if (aliasKey.length === 0) {
      throw new AccValidationError("Alias must be a non-empty string");
    }
    return aliasKey;
  }

  /** 根据 agent 类型分发到不同的 mutation 应用策略 */
  private applyMutation(agentId: AgentId, current: StoredProvider, mutation: ProviderEditMutation): Record<string, unknown> {
    if (agentId === "cc") {
      return this.applyClaudeMutation(current, mutation);
    }
    if (agentId === "gemini") {
      return this.applyGeminiMutation(current, mutation);
    }
    if (agentId === "codex") {
      return this.applyCodexMutation(current, mutation);
    }
    throw new AccValidationError(`Provider edit is not implemented for agent "${agentId}"`);
  }

  // --- Claude / Gemini: env 风格 mutation ---
  // 共用 applyEnvStyleMutation，仅 protectedDeleteKeys 不同

  private applyClaudeMutation(current: StoredProvider, mutation: ProviderEditMutation): { alias: string; env: Record<string, string> } {
    return this.applyEnvStyleMutation(current, mutation, {
      providerLabel: "Claude",
      protectedDeleteKeys: new Set([CLAUDE_BASE_URL_KEY])
    });
  }

  private applyGeminiMutation(current: StoredProvider, mutation: ProviderEditMutation): { alias: string; env: Record<string, string> } {
    return this.applyEnvStyleMutation(current, mutation, {
      providerLabel: "Gemini",
      protectedDeleteKeys: new Set([GEMINI_API_KEY_KEY])
    });
  }

  /**
   * env 风格 mutation 的通用实现：
   * - edit: 修改已有 key 的 value
   * - add: 新增 key-value（key 已存在则报错）
   * - delete: 批量删除 key（受保护的 key 不可删除）
   */
  private applyEnvStyleMutation(
    current: StoredProvider,
    mutation: ProviderEditMutation,
    options: { providerLabel: string; protectedDeleteKeys: Set<string> }
  ): { alias: string; env: Record<string, string> } {
    if (!isEnvStyleMutation(mutation)) {
      throw new AccValidationError(`${options.providerLabel} provider edit supports mode: edit | add | delete`);
    }

    const env = this.readStringRecord(current.config.env, `${options.providerLabel} env`);
    if (mutation.mode === "delete") {
      return {
        alias: current.alias,
        env: this.deleteEnvFields(env, mutation.keys, options)
      };
    }

    const key = this.requireNonEmpty(mutation.key, `${options.providerLabel} env key`);
    const value = this.requireNonEmpty(mutation.value, `${options.providerLabel} env value`);
    if (mutation.mode === "edit" && !(key in env)) {
      throw new AccValidationError(`Cannot edit missing ${options.providerLabel} env field: ${key}`);
    }
    if (mutation.mode === "add" && key in env) {
      throw new AccValidationError(`Cannot add existing ${options.providerLabel} env field: ${key}`);
    }
    return {
      alias: current.alias,
      env: {
        ...env,
        [key]: value
      }
    };
  }

  /** 批量删除 env 字段，受保护的键（如 ANTHROPIC_BASE_URL、GEMINI_API_KEY）不可删除 */
  private deleteEnvFields(
    env: Record<string, string>,
    keys: string[],
    options: { providerLabel: string; protectedDeleteKeys: Set<string> }
  ): Record<string, string> {
    const next = { ...env };
    for (const rawKey of keys) {
      const key = this.requireNonEmpty(rawKey, `${options.providerLabel} env key`);
      if (options.protectedDeleteKeys.has(key)) {
        throw new AccValidationError(`Cannot delete ${key} from a ${options.providerLabel} provider`);
      }
      delete next[key];
    }
    return next;
  }

  // --- Codex: 字段风格 mutation ---

  /** Codex 编辑只支持替换 baseUrl 或 apiKey 单个字段 */
  private applyCodexMutation(current: StoredProvider, mutation: ProviderEditMutation): Record<string, unknown> {
    if (!isCodexMutation(mutation)) {
      throw new AccValidationError("Codex provider edit supports field: baseUrl | apiKey");
    }

    const next = {
      alias: current.alias,
      baseUrl: this.readString(current.config.baseUrl, "Codex baseUrl"),
      apiKey: this.readString(current.config.apiKey, "Codex apiKey"),
      wireApi: this.readString(current.config.wireApi, "Codex wireApi"),
      requiresOpenAiAuth: typeof current.config.requiresOpenAiAuth === "boolean" ? current.config.requiresOpenAiAuth : true
    };
    next[mutation.field] = this.requireNonEmpty(mutation.value, `Codex ${mutation.field}`);
    return next;
  }

  // --- 通用校验辅助 ---

  private requireNonEmpty(value: string, label: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new AccValidationError(`${label} must be a non-empty string`);
    }
    return trimmed;
  }

  private readString(value: unknown, label: string): string {
    if (typeof value !== "string") {
      throw new AccValidationError(`${label} must be a string`);
    }
    return value;
  }

  private readStringRecord(value: unknown, label: string): Record<string, string> {
    if (typeof value !== "object" || value === null) {
      throw new AccValidationError(`${label} must be an object`);
    }
    const record = value as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const [key, item] of Object.entries(record)) {
      if (typeof item !== "string") {
        throw new AccValidationError(`${label}.${key} must be a string`);
      }
      next[key] = item;
    }
    return next;
  }
}

// --- 类型守卫 ---

function isEnvStyleMutation(mutation: ProviderEditMutation): mutation is EnvStyleProviderEditMutation {
  return "mode" in mutation;
}

function isCodexMutation(mutation: ProviderEditMutation): mutation is CodexProviderEditMutation {
  return "field" in mutation;
}
