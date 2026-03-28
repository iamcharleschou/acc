// CLI 运行时：组装 argv 预处理 → hooks 合并 → Commander 解析执行
// 采用按需 lazy import 策略，只在命令实际被调用时才加载对应的 provider/use 模块
import { expandLegacyArgs, normalizeControlArgs } from "./normalize.js";
import { createProgram, type CliProgramHooks } from "./program.js";

type ProviderHookKeys = "onProviderAdd" | "onProviderList" | "onProviderEdit" | "onProviderRemove";
type ProviderCliHooks = Pick<CliProgramHooks, ProviderHookKeys>;
type UseCliHooks = Pick<CliProgramHooks, "onUse">;

/** 允许外部注入 hooks 加载器，用于测试时 mock 依赖 */
export type CliRuntimeDeps = {
  loadDefaultProviderHooks?: () => Promise<ProviderCliHooks>;
  loadDefaultUseHooks?: () => Promise<UseCliHooks>;
};

/** 先归一化 argv（大小写 + 旧版扩展），再交给 expandLegacyArgs 做旧版兼容 */
function resolveCliArgs(argv: string[]): string[] {
  const normalizedArgs = normalizeControlArgs(argv);
  return expandLegacyArgs(normalizedArgs);
}

/** CLI 主函数：预处理 argv → 按需合并默认 hooks → 执行 Commander 解析 */
export async function runCli(
  argv: string[],
  hooks: CliProgramHooks = {},
  deps: CliRuntimeDeps = {}
): Promise<void> {
  const resolvedArgs = resolveCliArgs(argv);
  const mergedHooks = await mergeHooksForCommand(resolvedArgs, hooks, deps);
  const program = createProgram(mergedHooks);
  await program.parseAsync(resolvedArgs, { from: "user" });
}

/**
 * 根据实际命令按需加载默认 hooks。
 * 当调用方未提供对应 hook 时，才 lazy import 默认实现。
 */
async function mergeHooksForCommand(
  resolvedArgs: string[],
  hooks: CliProgramHooks,
  deps: CliRuntimeDeps
): Promise<CliProgramHooks> {
  let mergedHooks: CliProgramHooks = { ...hooks };

  if (needsDefaultProviderHooks(resolvedArgs, mergedHooks)) {
    const defaultProviderHooks = await (deps.loadDefaultProviderHooks ?? loadDefaultProviderHooks)();
    mergedHooks = {
      ...defaultProviderHooks,
      ...mergedHooks
    };
  }

  if (needsDefaultUseHooks(resolvedArgs, mergedHooks)) {
    const defaultUseHooks = await (deps.loadDefaultUseHooks ?? loadDefaultUseHooks)();
    mergedHooks = {
      ...defaultUseHooks,
      ...mergedHooks
    };
  }

  return mergedHooks;
}

/** 仅当当前命令是 provider 子命令且对应 hook 未被外部提供时，才需要加载默认 hooks */
function needsDefaultProviderHooks(resolvedArgs: string[], hooks: CliProgramHooks): boolean {
  if (resolvedArgs[0] !== "provider") {
    return false;
  }

  const command = resolvedArgs[1];
  if (command === "add") {
    return hooks.onProviderAdd === undefined;
  }
  if (command === "list") {
    return hooks.onProviderList === undefined;
  }
  if (command === "remove") {
    return hooks.onProviderRemove === undefined;
  }
  if (command === "edit") {
    return hooks.onProviderEdit === undefined;
  }
  return false;
}

function needsDefaultUseHooks(resolvedArgs: string[], hooks: CliProgramHooks): boolean {
  return resolvedArgs[0] === "use" && hooks.onUse === undefined;
}

// --- 默认 hooks 加载器（lazy import） ---

async function loadDefaultProviderHooks(): Promise<ProviderCliHooks> {
  const { createProviderCommandHooks } = await import("../commands/provider.js");
  return createProviderCommandHooks();
}

async function loadDefaultUseHooks(): Promise<UseCliHooks> {
  const { createUseCommandHooks } = await import("../commands/use.js");
  return createUseCommandHooks();
}
