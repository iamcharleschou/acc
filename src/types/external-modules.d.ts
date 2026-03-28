// 第三方模块的类型声明
// proper-lockfile 和 write-file-atomic 没有自带 TypeScript 类型定义

declare module "proper-lockfile" {
  export type LockRetryOptions = {
    retries: number;
    minTimeout?: number;
    maxTimeout?: number;
  };

  export type LockOptions = {
    realpath?: boolean;
    retries?: number | LockRetryOptions;
  };

  /** 释放锁的回调函数 */
  export type ReleaseLock = () => Promise<void>;

  const lockfile: {
    lock(file: string, options?: LockOptions): Promise<ReleaseLock>;
  };

  export default lockfile;
}

declare module "write-file-atomic" {
  export type WriteFileAtomicOptions = {
    encoding?: BufferEncoding;
    fsync?: boolean;
  };

  /** 原子性写入文件，避免写入过程中崩溃导致数据损坏 */
  export default function writeFileAtomic(
    filename: string,
    data: string | Uint8Array,
    options?: WriteFileAtomicOptions
  ): Promise<void>;
}
