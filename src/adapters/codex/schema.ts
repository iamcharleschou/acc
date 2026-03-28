// Codex provider 配置的 Zod Schema
// 校验规则：alias 必须 TOML 安全，baseUrl/apiKey 必填，wireApi 默认 "responses"
import { z } from "zod";
import { AccValidationError } from "../../core/errors.js";
import type { StoredProvider } from "../../core/store/schema.js";
import { nonEmptyTrimmedStringSchema } from "../base.js";
import { CODEX_ALIAS_SAFETY_MESSAGE, isSafeCodexAlias } from "./alias-safety.js";

const providerNameSchema = nonEmptyTrimmedStringSchema;

const codexProviderSchema = z.object({
  alias: nonEmptyTrimmedStringSchema.refine(isSafeCodexAlias, { message: CODEX_ALIAS_SAFETY_MESSAGE }),
  baseUrl: nonEmptyTrimmedStringSchema,
  apiKey: nonEmptyTrimmedStringSchema,
  wireApi: z.enum(["responses"]).default("responses"),
  requiresOpenAiAuth: z.boolean().default(true)
});

/** 解析并校验 Codex provider 配置 */
export function parseCodexProvider(providerName: string, raw: unknown): StoredProvider {
  const validatedProviderName = providerNameSchema.safeParse(providerName);
  if (!validatedProviderName.success) {
    throw new AccValidationError("Provider name must be a non-empty string", { cause: validatedProviderName.error });
  }

  const validated = codexProviderSchema.safeParse(raw);
  if (!validated.success) {
    throw new AccValidationError(
      `Invalid Codex provider config for ${validatedProviderName.data}`,
      { cause: validated.error }
    );
  }

  return {
    alias: validated.data.alias,
    providerName: validatedProviderName.data,
    config: {
      baseUrl: validated.data.baseUrl,
      apiKey: validated.data.apiKey,
      wireApi: validated.data.wireApi,
      requiresOpenAiAuth: validated.data.requiresOpenAiAuth
    }
  };
}
