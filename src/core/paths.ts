// acc 文件路径集中定义
// 所有路径都基于 $HOME 计算，确保 acc 管理的各 agent 配置文件位置一致
import { join } from "node:path";

/** acc 所涉及的全部文件路径 */
export type AccPaths = {
  accDir: string;                 // ~/.acc/
  accConfigPath: string;          // ~/.acc/config.json — provider 主配置
  accClaudeRuntimePath: string;   // ~/.acc/runtime/claude/settings.json — Claude 运行时生成的 settings
  accCodexBackupDir: string;      // ~/.acc/backups/codex/ — Codex 配置备份目录
  claudeSettingsPath: string;     // ~/.claude/settings.json — 用户原始的 Claude settings
  codexConfigPath: string;        // ~/.codex/config.toml — Codex 主配置
  codexAuthPath: string;          // ~/.codex/auth.json — Codex 认证文件
  geminiEnvPath: string;          // ~/.gemini/.env — Gemini 环境变量文件
};

/** 根据用户 home 目录计算所有路径 */
export function resolveAccPaths(homeDir: string): AccPaths {
  const accDir = join(homeDir, ".acc");
  const codexDir = join(homeDir, ".codex");

  return {
    accDir,
    accConfigPath: join(accDir, "config.json"),
    accClaudeRuntimePath: join(accDir, "runtime", "claude", "settings.json"),
    accCodexBackupDir: join(accDir, "backups", "codex"),
    claudeSettingsPath: join(homeDir, ".claude", "settings.json"),
    codexConfigPath: join(codexDir, "config.toml"),
    codexAuthPath: join(codexDir, "auth.json"),
    geminiEnvPath: join(homeDir, ".gemini", ".env")
  };
}
