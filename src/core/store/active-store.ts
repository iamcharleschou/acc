// Active Store：持久化各 agent 当前激活的 provider alias
// 存储路径：~/.acc/active.json
// 结构：{ "codex": "myalias", "cc": "work", "gemini": "official" }
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import writeFileAtomic from "write-file-atomic";
import { z } from "zod";
import { AccStoreError } from "../errors.js";
import { type AgentId } from "../agents.js";

const activeStoreSchema = z
  .record(z.string(), z.string())
  .default({});

export type ActiveStoreData = Record<string, string>;

export class ActiveStore {
  private readonly accDir: string;
  private readonly activePath: string;

  constructor(homeDir?: string) {
    const home = homeDir ?? process.env.HOME;
    if (!home) {
      throw new AccStoreError("HOME directory is required");
    }
    this.accDir = join(home, ".acc");
    this.activePath = join(this.accDir, "active.json");
  }

  /** 加载 active.json，不存在时返回空对象 */
  async load(): Promise<ActiveStoreData> {
    let raw: string;
    try {
      raw = await readFile(this.activePath, "utf8");
    } catch (error) {
      if (this.isErrno(error, "ENOENT")) {
        return {};
      }
      throw new AccStoreError(`Failed to read active store at ${this.activePath}`, { cause: error });
    }

    let parsed: unknown;
    try {
      parsed = raw.trim() === "" ? {} : JSON.parse(raw);
    } catch (error) {
      throw new AccStoreError(`Failed to parse active store at ${this.activePath}`, { cause: error });
    }

    const result = activeStoreSchema.safeParse(parsed);
    if (!result.success) {
      return {};
    }
    return result.data;
  }

  /** 获取指定 agent 当前激活的 alias，未设置时返回 null */
  async getActive(agentId: AgentId): Promise<string | null> {
    const data = await this.load();
    return data[agentId] ?? null;
  }

  /** 设置指定 agent 的激活 alias */
  async setActive(agentId: AgentId, alias: string): Promise<void> {
    const data = await this.load();
    data[agentId] = alias;
    await this.write(data);
  }

  private async write(data: ActiveStoreData): Promise<void> {
    await mkdir(this.accDir, { recursive: true });
    await writeFileAtomic(
      this.activePath,
      `${JSON.stringify(data, null, 2)}\n`,
      { encoding: "utf8" }
    );
  }

  private isErrno(error: unknown, code: string): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }
}
