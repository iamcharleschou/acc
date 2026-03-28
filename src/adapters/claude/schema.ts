// Claude provider 配置的 Zod Schema
// 校验规则：
//   1. ANTHROPIC_BASE_URL 必填
//   2. ANTHROPIC_API_KEY 和 ANTHROPIC_AUTH_TOKEN 二选一，不可同时存在或同时缺失
import { z } from "zod";
import { AccValidationError } from "../../core/errors.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { nonEmptyTrimmedStringSchema } from "../base.js";

const providerNameSchema = nonEmptyTrimmedStringSchema;

const claudeProviderSchema = z
  .object({
    alias: nonEmptyTrimmedStringSchema,
    env: z.record(z.string(), z.string())
  })
  .superRefine((value, ctx) => {
    // 校验 ANTHROPIC_BASE_URL 必填
    const hasBaseUrlField = "ANTHROPIC_BASE_URL" in value.env;
    const baseUrl = hasBaseUrlField ? value.env.ANTHROPIC_BASE_URL : "";
    if (!hasBaseUrlField || baseUrl.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env.ANTHROPIC_BASE_URL must be a non-empty string",
        path: ["env", "ANTHROPIC_BASE_URL"]
      });
    }

    // 校验认证字段：API_KEY 和 AUTH_TOKEN 必须恰好存在一个
    const hasApiKeyField = "ANTHROPIC_API_KEY" in value.env;
    const hasAuthTokenField = "ANTHROPIC_AUTH_TOKEN" in value.env;
    const apiKey = hasApiKeyField ? value.env.ANTHROPIC_API_KEY : "";
    const authToken = hasAuthTokenField ? value.env.ANTHROPIC_AUTH_TOKEN : "";

    if (hasApiKeyField && apiKey.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env.ANTHROPIC_API_KEY must be a non-empty string when provided",
        path: ["env", "ANTHROPIC_API_KEY"]
      });
    }

    if (hasAuthTokenField && authToken.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env.ANTHROPIC_AUTH_TOKEN must be a non-empty string when provided",
        path: ["env", "ANTHROPIC_AUTH_TOKEN"]
      });
    }

    const hasApiKey = hasApiKeyField && apiKey.trim().length > 0;
    const hasAuthToken = hasAuthTokenField && authToken.trim().length > 0;
    if (hasApiKey === hasAuthToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "env must include exactly one of ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN",
        path: ["env"]
      });
    }
  });

/** 解析并校验 Claude provider 配置，返回标准化后的 StoredProvider */
export function parseClaudeProvider(providerName: string, raw: unknown): StoredProvider {
  const validatedProviderName = providerNameSchema.safeParse(providerName);
  if (!validatedProviderName.success) {
    throw new AccValidationError("Provider name must be a non-empty string", { cause: validatedProviderName.error });
  }

  const validated = claudeProviderSchema.safeParse(raw);
  if (!validated.success) {
    throw new AccValidationError(
      `Invalid Claude provider config for ${validatedProviderName.data}`,
      { cause: validated.error }
    );
  }

  // 对关键字段做 trim 标准化
  const env = { ...validated.data.env };
  env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL.trim();
  if ("ANTHROPIC_API_KEY" in env) {
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY.trim();
  }
  if ("ANTHROPIC_AUTH_TOKEN" in env) {
    env.ANTHROPIC_AUTH_TOKEN = env.ANTHROPIC_AUTH_TOKEN.trim();
  }

  return {
    alias: validated.data.alias,
    providerName: validatedProviderName.data,
    config: {
      env
    }
  };
}
