// Gemini 环境变量 key 格式校验
// dotenv 规范要求 key 必须为合法的 shell 变量名

const GEMINI_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GEMINI_ENV_KEY_RULE = "must match ^[A-Za-z_][A-Za-z0-9_]*$";

export function isValidGeminiEnvKey(key: string): boolean {
  return GEMINI_ENV_KEY_PATTERN.test(key);
}

export function geminiEnvKeyValidationMessage(key: string): string {
  return `Gemini env key ${JSON.stringify(key)} ${GEMINI_ENV_KEY_RULE}`;
}
