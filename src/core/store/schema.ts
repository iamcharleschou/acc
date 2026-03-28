// Provider Store 的 Zod schema 定义
// 定义了 config.json 的持久化结构：version + 按 agent 分组的 provider 映射
import { z } from "zod";

/** 非空且自动 trim 的字符串校验 */
export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

/** 单个 provider 条目 */
export const providerEntrySchema = z.object({
  alias: nonEmptyTrimmedStringSchema,
  providerName: nonEmptyTrimmedStringSchema,
  config: z.record(z.string(), z.unknown())
});

const providerAliasMapSchema = z.record(z.string(), providerEntrySchema);

/** 附加不变量校验：确保 map key 与 entry.alias 一致 */
const providerAliasMapWithInvariantSchema = providerAliasMapSchema.superRefine((entries, ctx) => {
  for (const [aliasKey, entry] of Object.entries(entries)) {
    if (entry.alias !== aliasKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provider alias must match map key: ${aliasKey}`,
        path: [aliasKey, "alias"]
      });
    }
  }
});

/** config.json 根结构：version 1 + 三个 agent 的 provider 映射 */
export const providerStoreSchema = z.object({
  version: z.literal(1),
  providers: z.object({
    cc: providerAliasMapWithInvariantSchema,
    codex: providerAliasMapWithInvariantSchema,
    gemini: providerAliasMapWithInvariantSchema
  })
});

export type StoredProvider = z.infer<typeof providerEntrySchema>;
export type ProviderStoreConfig = z.infer<typeof providerStoreSchema>;

/** 创建空的初始配置 */
export function createEmptyProviderStoreConfig(): ProviderStoreConfig {
  return {
    version: 1,
    providers: {
      cc: {},
      codex: {},
      gemini: {}
    }
  };
}
