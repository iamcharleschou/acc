// use 命令的 hooks 实现
// 负责从 store 中加载 provider 配置，然后调用对应 agent 的 activator 启动 CLI
import { activateClaudeProvider } from "../adapters/claude/activate.js";
import { activateCodexProvider } from "../adapters/codex/activate.js";
import { activateGeminiProvider } from "../adapters/gemini/activate.js";
import { parseAgentId, type AgentId } from "../core/agents.js";
import { AccStoreError, AccValidationError } from "../core/errors.js";
import { resolveAccPaths, type AccPaths } from "../core/paths.js";
import { createExecaProcessRunner, type ProcessRunner } from "../core/process.js";
import { ProviderStore } from "../core/store/provider-store.js";
import type { StoredProvider } from "../core/store/schema.js";
import type { CliProgramHooks } from "../cli/program.js";

type UseCommandHooks = Pick<CliProgramHooks, "onUse">;
type UseStoreLike = Pick<ProviderStore, "load">;

// 各 agent activator 的类型签名
type ClaudeActivator = (
  paths: Pick<AccPaths, "claudeSettingsPath" | "accClaudeRuntimePath">,
  provider: StoredProvider,
  extraArgs: string[],
  runner: ProcessRunner
) => Promise<void>;
type CodexActivator = (
  paths: Pick<AccPaths, "codexConfigPath" | "codexAuthPath" | "accCodexBackupDir">,
  provider: StoredProvider,
  extraArgs: string[],
  runner: ProcessRunner
) => Promise<void>;
type GeminiActivator = (
  paths: Pick<AccPaths, "geminiEnvPath">,
  provider: StoredProvider,
  extraArgs: string[],
  runner: ProcessRunner
) => Promise<void>;

/** use 命令的可注入依赖 */
export type UseCommandDeps = {
  store: UseStoreLike;
  resolvePaths: (homeDir: string) => AccPaths;
  runner: ProcessRunner;
  activateClaude: ClaudeActivator;
  activateCodex: CodexActivator;
  activateGemini: GeminiActivator;
};

type ResolvedUseCommandDeps = Pick<
  UseCommandDeps,
  "resolvePaths" | "runner" | "activateClaude" | "activateCodex" | "activateGemini"
>;

/** 创建 use 命令的 hooks，store 采用 lazy 初始化 */
export function createUseCommandHooks(partialDeps: Partial<UseCommandDeps> = {}): UseCommandHooks {
  const deps = resolveUseCommandDeps(partialDeps);
  let store = partialDeps.store;

  function getStore(): UseStoreLike {
    store ??= new ProviderStore();
    return store;
  }

  return {
    onUse: async (agent, alias, extra = []) => {
      const agentId = requireAgentId(agent);
      const aliasKey = requireAlias(alias);
      const provider = await getStoredProvider(getStore(), agentId, aliasKey);
      const paths = deps.resolvePaths(requireHomeDir());

      // 根据 agent 类型调用对应的 activator
      if (agentId === "cc") {
        await deps.activateClaude(paths, provider, extra, deps.runner);
        return;
      }
      if (agentId === "codex") {
        await deps.activateCodex(paths, provider, extra, deps.runner);
        return;
      }
      if (agentId === "gemini") {
        await deps.activateGemini(paths, provider, extra, deps.runner);
        return;
      }
      throw new AccValidationError(`Use activation is not implemented for agent "${agentId}"`);
    }
  };
}

function resolveUseCommandDeps(partialDeps: Partial<UseCommandDeps>): ResolvedUseCommandDeps {
  return {
    resolvePaths: partialDeps.resolvePaths ?? resolveAccPaths,
    runner: partialDeps.runner ?? createExecaProcessRunner(),
    activateClaude: partialDeps.activateClaude ?? activateClaudeProvider,
    activateCodex: partialDeps.activateCodex ?? activateCodexProvider,
    activateGemini: partialDeps.activateGemini ?? activateGeminiProvider
  };
}

function requireAgentId(agent: string): AgentId {
  const parsed = parseAgentId(agent);
  if (parsed === null) {
    throw new AccValidationError(`Unsupported agent id: ${agent}`);
  }
  return parsed;
}

function requireAlias(alias: string): string {
  const trimmed = alias.trim();
  if (trimmed.length === 0) {
    throw new AccValidationError("Alias must be a non-empty string");
  }
  return trimmed;
}

/** 从 store 中按 agent + alias 查找 provider，不存在则抛出错误 */
async function getStoredProvider(store: UseStoreLike, agentId: AgentId, alias: string): Promise<StoredProvider> {
  const config = await store.load();
  const provider = config.providers[agentId][alias];
  if (!provider) {
    throw new AccValidationError(`Provider alias "${alias}" not found for agent "${agentId}"`);
  }
  return provider;
}

function requireHomeDir(): string {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    throw new AccStoreError("HOME directory is required");
  }
  return homeDir;
}
