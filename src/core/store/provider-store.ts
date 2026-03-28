// Provider Store 持久化层
// 读写 ~/.acc/config.json，使用文件锁（proper-lockfile）防止并发写入冲突，
// 使用 write-file-atomic 确保写入的原子性
import { mkdir, readFile } from "node:fs/promises";
import lockfile from "proper-lockfile";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";
import { parseAgentId, type AgentId } from "../agents.js";
import { AccStoreError, AccValidationError } from "../errors.js";
import { resolveAccPaths } from "../paths.js";
import {
  createEmptyProviderStoreConfig,
  nonEmptyTrimmedStringSchema,
  providerStoreSchema,
  type ProviderStoreConfig
} from "./schema.js";

export type ProviderInput = {
  providerName: string;
  config: Record<string, unknown>;
};

type ProviderStoreOptions = {
  homeDir?: string;
};

const aliasSchema = nonEmptyTrimmedStringSchema;
const providerInputSchema = z.object({
  providerName: nonEmptyTrimmedStringSchema,
  config: z.record(z.string(), z.unknown())
});

export class ProviderStore {
  private readonly paths: ReturnType<typeof resolveAccPaths>;

  constructor(options: ProviderStoreOptions = {}) {
    const homeDir = options.homeDir ?? process.env.HOME;
    if (!homeDir) {
      throw new AccStoreError("HOME directory is required");
    }
    this.paths = resolveAccPaths(homeDir);
  }

  /** 加载 config.json，文件不存在时返回空配置 */
  async load(): Promise<ProviderStoreConfig> {
    let raw: string;
    try {
      raw = await readFile(this.paths.accConfigPath, "utf8");
    } catch (error) {
      if (this.isErrno(error, "ENOENT")) {
        return createEmptyProviderStoreConfig();
      }
      throw new AccStoreError(`Failed to read provider store at ${this.paths.accConfigPath}`, { cause: error });
    }

    let parsed: unknown;
    try {
      parsed = raw.trim() === "" ? createEmptyProviderStoreConfig() : JSON.parse(raw);
    } catch (error) {
      throw new AccStoreError(`Failed to parse provider store at ${this.paths.accConfigPath}`, { cause: error });
    }
    return this.validateStoreConfig(parsed, `Invalid provider store schema at ${this.paths.accConfigPath}`);
  }

  /** 新增或更新 provider，在文件锁保护下执行 read-modify-write */
  async upsert(agent: string, alias: string, provider: ProviderInput): Promise<void> {
    const agentId = this.requireAgentId(agent);
    const aliasKey = this.requireAlias(alias);
    const providerInput = this.requireProviderInput(provider);

    await this.withStoreLock(async () => {
      const next = await this.load();
      next.providers[agentId][aliasKey] = {
        alias: aliasKey,
        providerName: providerInput.providerName,
        config: providerInput.config
      };
      await this.write(next);
    });
  }

  /** 删除 provider，不存在时静默跳过 */
  async remove(agent: string, alias: string): Promise<void> {
    const agentId = this.requireAgentId(agent);
    const aliasKey = this.requireAlias(alias);
    await this.withStoreLock(async () => {
      const next = await this.load();
      if (!next.providers[agentId][aliasKey]) {
        return;
      }
      delete next.providers[agentId][aliasKey];
      await this.write(next);
    });
  }

  // --- 校验辅助方法 ---

  private requireAgentId(agent: string): AgentId {
    const parsed = parseAgentId(agent);
    if (parsed === null) {
      throw new AccValidationError(`Unsupported agent id: ${agent}`);
    }
    return parsed;
  }

  private requireAlias(alias: string): string {
    const validated = aliasSchema.safeParse(alias);
    if (!validated.success) {
      throw new AccValidationError("Alias must be a non-empty string", { cause: validated.error });
    }
    return validated.data;
  }

  private requireProviderInput(provider: ProviderInput): ProviderInput {
    const validated = providerInputSchema.safeParse(provider);
    if (!validated.success) {
      throw new AccValidationError("Invalid provider input", { cause: validated.error });
    }
    return validated.data;
  }

  private validateStoreConfig(config: unknown, message: string): ProviderStoreConfig {
    const normalized = this.normalizeStoreConfig(config);
    const validated = providerStoreSchema.safeParse(normalized);
    if (!validated.success) {
      throw new AccValidationError(message, { cause: validated.error });
    }
    return validated.data;
  }

  /**
   * 向前兼容：旧版配置可能缺少 gemini 分组，
   * 在校验前自动补齐以避免 schema 校验失败
   */
  private normalizeStoreConfig(config: unknown): unknown {
    if (!this.isRecord(config) || config.version !== 1) {
      return config;
    }
    const providers = config.providers;
    if (!this.isRecord(providers) || "gemini" in providers) {
      return config;
    }
    return {
      ...config,
      providers: {
        ...providers,
        gemini: {}
      }
    };
  }

  /** 写入前再次校验，拒绝持久化非法数据 */
  private async write(config: ProviderStoreConfig): Promise<void> {
    const validated = this.validateStoreConfig(config, `Refusing to persist invalid store at ${this.paths.accConfigPath}`);
    await mkdir(this.paths.accDir, { recursive: true });
    await writeFileAtomic(this.paths.accConfigPath, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8" });
  }

  /** 使用 proper-lockfile 对 .acc 目录加锁，防止并发读写 */
  private async withStoreLock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(this.paths.accDir, { recursive: true });
    const release = await lockfile.lock(this.paths.accDir, {
      realpath: false,
      retries: {
        retries: 5,
        minTimeout: 20,
        maxTimeout: 100
      }
    });
    try {
      return await action();
    } finally {
      await release();
    }
  }

  private isErrno(error: unknown, code: string): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === code;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
