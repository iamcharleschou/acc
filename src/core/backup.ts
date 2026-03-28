// 文件备份工具
// 在修改 Codex 配置文件前，将原文件快照到备份目录，用于出错时回滚
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { AccStoreError } from "./errors.js";

export type SnapshotFileOptions = {
  /** 是否使用安全权限（0o700 目录 / 0o600 文件），用于包含敏感信息的文件 */
  secretSafe?: boolean;
};

const SECRET_DIR_MODE = 0o700;
const SECRET_FILE_MODE = 0o600;

/**
 * 将指定文件快照到备份目录。
 * 如果源文件不存在，返回 null 而不是报错。
 * 备份文件名格式：`{backupName}.{timestamp}.bak`
 */
export async function snapshotFileIfExists(
  sourcePath: string,
  backupDir: string,
  backupName: string = basename(sourcePath),
  options: SnapshotFileOptions = {}
): Promise<string | null> {
  let content: Buffer;
  try {
    content = await readFile(sourcePath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return null;
    }
    throw new AccStoreError(`Failed to read file for backup at ${sourcePath}`, { cause: error });
  }

  await ensureBackupDir(backupDir, options);
  const backupPath = join(backupDir, `${backupName}.${Date.now()}.bak`);

  try {
    await writeFile(backupPath, content, options.secretSafe ? { mode: SECRET_FILE_MODE } : undefined);
    if (options.secretSafe) {
      await chmod(backupPath, SECRET_FILE_MODE);
    }
  } catch (error) {
    throw new AccStoreError(`Failed to write backup file at ${backupPath}`, { cause: error });
  }

  return backupPath;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function ensureBackupDir(backupDir: string, options: SnapshotFileOptions): Promise<void> {
  try {
    await mkdir(backupDir, { recursive: true, mode: options.secretSafe ? SECRET_DIR_MODE : undefined });
    if (options.secretSafe) {
      await chmod(backupDir, SECRET_DIR_MODE);
    }
  } catch (error) {
    throw new AccStoreError(`Failed to prepare backup directory at ${backupDir}`, { cause: error });
  }
}
