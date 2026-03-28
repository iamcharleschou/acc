#!/usr/bin/env node
// acc CLI 入口，将 argv 传给 runCli 并统一处理未捕获错误
import { runCli } from "./cli/runtime.js";

void runCli(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
