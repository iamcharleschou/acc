// 外部进程运行器抽象
// 封装 execa，便于在测试中 mock 子进程调用
import { execa } from "execa";

export type ProcessRunner = {
  run: (command: string, args: string[]) => Promise<void>;
};

/** 创建基于 execa 的进程运行器，stdio 直接继承当前终端 */
export function createExecaProcessRunner(): ProcessRunner {
  return {
    run: async (command, args) => {
      await execa(command, args, {
        stdio: "inherit"
      });
    }
  };
}
