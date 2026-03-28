// acc 错误层级定义
// AccCliError 为基类，子类通过 code 字段区分错误类型，便于上层统一处理

type ErrorWithCodeOptions = ErrorOptions & {
  code?: string;
};

/** CLI 通用错误基类 */
export class AccCliError extends Error {
  readonly code: string;

  constructor(message: string, options: ErrorWithCodeOptions = {}) {
    super(message, options);
    this.name = "AccCliError";
    this.code = options.code ?? "ACC_CLI_ERROR";
  }
}

/** 校验错误，如非法的 agent id、空 alias 等用户输入问题 */
export class AccValidationError extends AccCliError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, { ...options, code: "ACC_VALIDATION_ERROR" });
    this.name = "AccValidationError";
  }
}

/** 存储层错误，如文件读写失败、JSON 解析错误等 */
export class AccStoreError extends AccCliError {
  constructor(message: string, options: ErrorOptions = {}) {
    super(message, { ...options, code: "ACC_STORE_ERROR" });
    this.name = "AccStoreError";
  }
}
