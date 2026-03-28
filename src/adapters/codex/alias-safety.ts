// Codex alias 安全校验
// Codex 的 alias 会作为 TOML 的 [model_providers.<alias>] 键名，
// 必须限制为安全字符集以避免生成非法 TOML

const SAFE_CODEX_ALIAS_PATTERN = /^[A-Za-z0-9_-]+$/;

export const CODEX_ALIAS_SAFETY_MESSAGE =
  "Codex alias must match ^[A-Za-z0-9_-]+$ to be used as a TOML model_providers key";

export function isSafeCodexAlias(alias: string): boolean {
  return SAFE_CODEX_ALIAS_PATTERN.test(alias);
}
