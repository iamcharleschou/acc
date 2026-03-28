// Gemini provider 配置的 Zod Schema
// 校验规则：
//   1. env key 必须匹配 ^[A-Za-z_][A-Za-z0-9_]*$（合法 dotenv key）
//   2. GEMINI_API_KEY 必填
//   3. GOOGLE_GEMINI_BASE_URL 和 GEMINI_MODEL 可选，但提供时不能为空
import { z } from "zod";
import { AccValidationError } from "../../core/errors.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { nonEmptyTrimmedStringSchema } from "../base.js";
import { geminiEnvKeyValidationMessage, isValidGeminiEnvKey } from "./env-key.js";

const GEMINI_API_KEY_KEY = "GEMINI_API_KEY";
const GEMINI_BASE_URL_KEY = "GOOGLE_GEMINI_BASE_URL";
const GEMINI_MODEL_KEY = "GEMINI_MODEL";

const providerNameSchema = nonEmptyTrimmedStringSchema;

const geminiProviderSchema = z
  .object({
    alias: nonEmptyTrimmedStringSchema,
    env: z.record(z.string(), z.string())
  })
  .superRefine((value, ctx) => {
    // 校验所有 key 的格式
    for (const key of Object.keys(value.env)) {
      if (!isValidGeminiEnvKey(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: geminiEnvKeyValidationMessage(key),
          path: ["env", key]
        });
      }
    }

    // GEMINI_API_KEY 必填
    const hasApiKeyField = GEMINI_API_KEY_KEY in value.env;
    const apiKey = hasApiKeyField ? value.env[GEMINI_API_KEY_KEY] : "";
    if (!hasApiKeyField || apiKey.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env.GEMINI_API_KEY must be a non-empty string",
        path: ["env", GEMINI_API_KEY_KEY]
      });
    }

    // 可选字段存在时不能为空
    if (GEMINI_BASE_URL_KEY in value.env && value.env[GEMINI_BASE_URL_KEY].trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env.GOOGLE_GEMINI_BASE_URL must be a non-empty string when provided",
        path: ["env", GEMINI_BASE_URL_KEY]
      });
    }

    if (GEMINI_MODEL_KEY in value.env && value.env[GEMINI_MODEL_KEY].trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env.GEMINI_MODEL must be a non-empty string when provided",
        path: ["env", GEMINI_MODEL_KEY]
      });
    }
  });

/** 解析并校验 Gemini provider 配置，返回标准化后的 StoredProvider */
export function parseGeminiProvider(providerName: string, raw: unknown): StoredProvider {
  const validatedProviderName = providerNameSchema.safeParse(providerName);
  if (!validatedProviderName.success) {
    throw new AccValidationError("Provider name must be a non-empty string", { cause: validatedProviderName.error });
  }

  const validated = geminiProviderSchema.safeParse(raw);
  if (!validated.success) {
    throw new AccValidationError(
      `Invalid Gemini provider config for ${validatedProviderName.data}`,
      { cause: validated.error }
    );
  }

  // 对关键字段做 trim 标准化
  const env = { ...validated.data.env };
  env[GEMINI_API_KEY_KEY] = env[GEMINI_API_KEY_KEY].trim();
  if (GEMINI_BASE_URL_KEY in env) {
    env[GEMINI_BASE_URL_KEY] = env[GEMINI_BASE_URL_KEY].trim();
  }
  if (GEMINI_MODEL_KEY in env) {
    env[GEMINI_MODEL_KEY] = env[GEMINI_MODEL_KEY].trim();
  }

  return {
    alias: validated.data.alias,
    providerName: validatedProviderName.data,
    config: {
      env
    }
  };
}
