// provider 子命令的 hooks 实现
// 负责 provider 的增删改查，通过依赖注入支持不同 agent 的 prompt 和 parser
import { parseClaudeProvider } from "../adapters/claude/schema.js";
import {
  promptClaudeProviderAdd,
  promptClaudeProviderEditFromStored
} from "../adapters/claude/prompts.js";
import { parseGeminiProvider } from "../adapters/gemini/schema.js";
import {
  promptGeminiProviderAdd,
  promptGeminiProviderEditFromStored
} from "../adapters/gemini/prompts.js";
import { parseCodexProvider } from "../adapters/codex/schema.js";
import {
  promptCodexProviderAdd,
  promptCodexProviderEditFromStored
} from "../adapters/codex/prompts.js";
import { parseAgentId, type AgentId } from "../core/agents.js";
import { AccValidationError } from "../core/errors.js";
import { ProviderStore } from "../core/store/provider-store.js";
import type { StoredProvider } from "../core/store/schema.js";
import type { ProviderParsers } from "../adapters/base.js";
import { ProviderService, type ProviderEditMutation } from "../services/provider-service.js";
import { renderTable } from "../ui/table.js";
import type { CliProgramHooks } from "../cli/program.js";

/** 交互式添加 provider 时的 prompt 函数签名 */
export type ProviderAddPrompt = () => Promise<unknown>;
/** 交互式编辑 provider 时的 prompt 函数签名 */
export type ProviderEditPrompt = (provider: StoredProvider) => Promise<ProviderEditMutation>;
/** 按 agent id 索引的 prompt 映射表 */
type ProviderPromptMap<TPrompt> = Partial<Record<AgentId, TPrompt>>;

/** provider 命令的可注入依赖（service、prompts、IO） */
export type ProviderCommandDeps = {
  service: Pick<ProviderService, "add" | "list" | "remove" | "get" | "edit">;
  addPrompts: ProviderPromptMap<ProviderAddPrompt>;
  editPrompts: ProviderPromptMap<ProviderEditPrompt>;
  isInteractive: () => boolean;
  writeLine: (line: string) => void;
};

type ResolvedProviderCommandDeps = Pick<ProviderCommandDeps, "addPrompts" | "editPrompts" | "isInteractive" | "writeLine">;

export type ProviderCommandHooks = Pick<CliProgramHooks, "onProviderAdd" | "onProviderList" | "onProviderRemove" | "onProviderEdit">;

/**
 * 创建 provider 子命令的 hooks。
 * service 采用 lazy 初始化，仅在实际调用时才创建。
 */
export function createProviderCommandHooks(
  partialDeps: Partial<ProviderCommandDeps> = {}
): ProviderCommandHooks {
  const deps = resolveProviderCommandDeps(partialDeps);
  let service = partialDeps.service;

  function getService(): Pick<ProviderService, "add" | "list" | "remove" | "get" | "edit"> {
    service ??= createDefaultProviderService();
    return service;
  }

  return {
    onProviderAdd: async (agent, providerName) => {
      const agentId = requireAgentId(agent);
      const addPrompt = requireAddPrompt(agentId, deps.addPrompts);
      const raw = await addPrompt();
      await getService().add(agentId, providerName, raw);
    },
    onProviderList: async (agent) => {
      const agentId = requireAgentId(agent);
      const providers = await getService().list(agentId);
      deps.writeLine(renderProviderTable(agentId, providers));
    },
    onProviderRemove: async (agent, alias) => {
      const agentId = requireAgentId(agent);
      await getService().remove(agentId, alias);
    },
    onProviderEdit: async (agent, alias) => {
      if (!deps.isInteractive()) {
        throw new AccValidationError("provider edit requires an interactive TTY");
      }

      const agentId = requireAgentId(agent);
      const editPrompt = requireEditPrompt(agentId, deps.editPrompts);
      const provider = await getService().get(agentId, alias);
      const mutation = await editPrompt(provider);
      await getService().edit(agentId, alias, mutation);
    }
  };
}

/** 填充未提供的依赖项为默认值 */
function resolveProviderCommandDeps(partialDeps: Partial<ProviderCommandDeps>): ResolvedProviderCommandDeps {
  return {
    addPrompts: partialDeps.addPrompts ?? {
      cc: promptClaudeProviderAdd,
      codex: promptCodexProviderAdd,
      gemini: promptGeminiProviderAdd
    },
    editPrompts: partialDeps.editPrompts ?? {
      cc: promptClaudeProviderEditFromStored,
      codex: promptCodexProviderEditFromStored,
      gemini: promptGeminiProviderEditFromStored
    },
    isInteractive: partialDeps.isInteractive ?? (() => Boolean(process.stdin.isTTY && process.stdout.isTTY)),
    writeLine: partialDeps.writeLine ?? ((line: string) => console.log(line))
  };
}

function createDefaultProviderService(): ProviderService {
  const parsers: ProviderParsers = {
    cc: parseClaudeProvider,
    codex: parseCodexProvider,
    gemini: parseGeminiProvider
  };
  return new ProviderService(new ProviderStore(), parsers);
}

function requireAddPrompt(agentId: AgentId, prompts: ProviderPromptMap<ProviderAddPrompt>): ProviderAddPrompt {
  const prompt = prompts[agentId];
  if (!prompt) {
    throw new AccValidationError(`Provider add prompt is not implemented for agent "${agentId}"`);
  }
  return prompt;
}

function requireEditPrompt(agentId: AgentId, prompts: ProviderPromptMap<ProviderEditPrompt>): ProviderEditPrompt {
  const prompt = prompts[agentId];
  if (!prompt) {
    throw new AccValidationError(`Provider edit prompt is not implemented for agent "${agentId}"`);
  }
  return prompt;
}

function requireAgentId(agent: string): AgentId {
  const parsed = parseAgentId(agent);
  if (parsed === null) {
    throw new AccValidationError(`Unsupported agent id: ${agent}`);
  }
  return parsed;
}

// --- provider list 表格渲染 ---

/** 将 provider 列表渲染为 ASCII 表格，空列表显示使用提示 */
function renderProviderTable(agentId: AgentId, providers: StoredProvider[]): string {
  if (providers.length === 0) {
    return renderEmptyState(agentId);
  }

  const rows = providers
    .map((provider) => toSummaryRow(agentId, provider))
    .sort((left, right) => left[0].localeCompare(right[0]));
  return renderTable(["ALIAS", "PROVIDER", "ENDPOINT", "AUTH"], rows);
}

function renderEmptyState(agentId: AgentId): string {
  const legacyHint = agentId === "cc" ? " (legacy: acc add <providerName>)" : "";
  return `No providers configured for agent "${agentId}".\nAdd one with: acc provider add ${agentId} <providerName>${legacyHint}`;
}

/**
 * 将 StoredProvider 转换为摘要行。
 * 不同 agent 的 config 结构不同，需要分别提取 endpoint 和 auth 信息。
 */
function toSummaryRow(agentId: AgentId, provider: StoredProvider): string[] {
  if (agentId === "cc") {
    const env = asRecord(provider.config.env);
    const endpoint = nonEmptyString(env?.ANTHROPIC_BASE_URL) ?? "(missing)";
    const auth = getClaudeAuthMode(env);
    return [provider.alias, provider.providerName, endpoint, auth];
  }

  if (agentId === "gemini") {
    const env = asRecord(provider.config.env);
    const endpoint = nonEmptyString(env?.GOOGLE_GEMINI_BASE_URL) ?? "(official)";
    const auth = getGeminiAuthSummary(env);
    return [provider.alias, provider.providerName, endpoint, auth];
  }

  // codex: config 直接存储 baseUrl 和 apiKey（非 env 风格）
  const endpoint = nonEmptyString(provider.config.baseUrl) ?? "(missing)";
  const auth = getCodexAuthSummary(provider.config);
  return [provider.alias, provider.providerName, endpoint, auth];
}

// --- 辅助函数 ---

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getClaudeAuthMode(env: Record<string, unknown> | null): string {
  if (nonEmptyString(env?.ANTHROPIC_API_KEY)) {
    return "API_KEY";
  }
  if (nonEmptyString(env?.ANTHROPIC_AUTH_TOKEN)) {
    return "AUTH_TOKEN";
  }
  return "UNKNOWN";
}

function getGeminiAuthSummary(env: Record<string, unknown> | null): string {
  return nonEmptyString(env?.GEMINI_API_KEY) ? "API_KEY" : "UNKNOWN";
}

function getCodexAuthSummary(config: Record<string, unknown>): string {
  const hasApiKey = Boolean(nonEmptyString(config.apiKey));
  if (!hasApiKey) {
    return "UNKNOWN";
  }
  // requiresOpenAiAuth 表示 Codex 需要额外写入 OPENAI_API_KEY 到 auth.json
  const requiresOpenAiAuth = config.requiresOpenAiAuth === true;
  return requiresOpenAiAuth ? "API_KEY + OPENAI_AUTH" : "API_KEY";
}
