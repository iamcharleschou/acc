// Commander 命令树定义
// 通过 hooks 模式将命令行结构与业务逻辑解耦，方便测试时注入 mock 实现
import { Command } from "commander";

/** CLI 各子命令对应的回调 hooks */
export type CliProgramHooks = {
  onProviderAdd?: (agent: string, providerName: string) => Promise<void> | void;
  onProviderList?: (agent: string) => Promise<void> | void;
  onProviderEdit?: (agent: string, alias: string) => Promise<void> | void;
  onProviderRemove?: (agent: string, alias: string) => Promise<void> | void;
  onUse?: (agent: string, alias: string, extra: string[]) => Promise<void> | void;
};

/** 根据给定的 hooks 创建 Commander 命令树 */
export function createProgram(hooks: CliProgramHooks = {}): Command {
  const program = new Command();

  program.name("acc").description("Agent config CLI");
  program.enablePositionalOptions();

  // `acc provider <add|list|edit|remove> <agent> [alias|providerName]`
  const provider = program.command("provider").description("Manage provider aliases");
  provider.command("add <agent> <providerName>").action(async (agent: string, providerName: string) => {
    await hooks.onProviderAdd?.(agent, providerName);
  });
  provider.command("list <agent>").action(async (agent: string) => {
    await hooks.onProviderList?.(agent);
  });
  provider.command("edit <agent> <alias>").action(async (agent: string, alias: string) => {
    await hooks.onProviderEdit?.(agent, alias);
  });
  provider.command("remove <agent> <alias>").action(async (agent: string, alias: string) => {
    await hooks.onProviderRemove?.(agent, alias);
  });

  // `acc use <agent> <alias> [extra...]`
  // allowUnknownOption + passThroughOptions 允许透传 `--` 后的参数给下游 agent CLI
  program
    .command("use <agent> <alias> [extra...]")
    .allowUnknownOption(true)
    .passThroughOptions()
    .action(async (agent: string, alias: string, extra: string[] = []) => {
      await hooks.onUse?.(agent, alias, sanitizePassthroughSeparator(extra));
    });

  return program;
}

export const program = createProgram();

/** Commander 有时会把前置的 `--` 保留在 extra 数组中，需要手动清理 */
function sanitizePassthroughSeparator(extra: string[]): string[] {
  if (extra[0] === "--") {
    return extra.slice(1);
  }
  return extra;
}
