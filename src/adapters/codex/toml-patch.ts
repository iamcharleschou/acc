// Codex config.toml 的文本级 patch 工具
// 不使用 TOML 解析库，而是直接操作文本行，以保留用户原有的注释和格式
//
// 主要功能：
//   setModelProvider    — 设置顶层 `model_provider = "alias"`
//   upsertModelProviderBlock — 插入或替换 [model_providers.<alias>] 块

export type CodexModelProviderBlock = {
  name: string;
  baseUrl: string;
  wireApi: string;
  requiresOpenAiAuth: boolean;
};

type ParsedTableHeader = {
  key: string;
  isArray: boolean;
};

/**
 * 设置或替换顶层 `model_provider = "alias"` 字段。
 * 只在第一个 table header 之前搜索（确保不误改 table 内的同名字段）。
 */
export function setModelProvider(source: string, alias: string): string {
  const nextLine = `model_provider = ${toTomlString(alias)}`;
  const lines = toLines(source);

  for (let index = 0; index < lines.length; index += 1) {
    if (parseTableHeaderLine(lines[index]) !== null) {
      break;
    }
    if (isModelProviderLine(lines[index])) {
      lines[index] = nextLine;
      return fromLines(lines);
    }
  }

  // 顶层没有 model_provider 字段，在文件头部插入
  const remaining = trimLeadingEmptyLines(lines);
  const next = remaining.length > 0 ? [nextLine, "", ...remaining] : [nextLine];
  return fromLines(next);
}

/**
 * 插入或替换 [model_providers.<alias>] 块。
 * 如果已存在同名块则整块替换，否则追加到文件末尾。
 */
export function upsertModelProviderBlock(
  source: string,
  alias: string,
  provider: CodexModelProviderBlock
): string {
  const lines = toLines(source);
  const blockLines = buildProviderBlockLines(alias, provider);
  const blockKey = `model_providers.${alias}`;

  const blockStart = findTableHeaderIndex(lines, blockKey);
  if (blockStart === -1) {
    // 不存在：追加到文件末尾
    const before = trimTrailingEmptyLines(lines);
    const next = before.length > 0 ? [...before, "", ...blockLines] : blockLines;
    return fromLines(next);
  }

  // 已存在：替换从 blockStart 到下一个 table header 之间的内容
  const blockEnd = findNextTableHeader(lines, blockStart + 1);
  const before = trimTrailingEmptyLines(lines.slice(0, blockStart));
  const after = trimLeadingEmptyLines(lines.slice(blockEnd));

  const next = [...before];
  if (next.length > 0) {
    next.push("");
  }
  next.push(...blockLines);
  if (after.length > 0) {
    next.push("");
    next.push(...after);
  }

  return fromLines(next);
}

/** 生成 [model_providers.<alias>] 块的文本行 */
function buildProviderBlockLines(alias: string, provider: CodexModelProviderBlock): string[] {
  return [
    `[model_providers.${alias}]`,
    `name = ${toTomlString(provider.name)}`,
    `base_url = ${toTomlString(provider.baseUrl)}`,
    `wire_api = ${toTomlString(provider.wireApi)}`,
    `requires_openai_auth = ${provider.requiresOpenAiAuth ? "true" : "false"}`
  ];
}

// --- TOML 结构解析（仅解析 table header，不做完整 TOML 解析） ---

/** 查找第一个匹配指定 key 的 table header 行索引 */
function findTableHeaderIndex(lines: string[], key: string): number {
  for (let index = 0; index < lines.length; index += 1) {
    const header = parseTableHeaderLine(lines[index]);
    if (header !== null && !header.isArray && header.key === key) {
      return index;
    }
  }
  return -1;
}

/** 从指定位置开始查找下一个 table header 的行索引 */
function findNextTableHeader(lines: string[], fromIndex: number): number {
  for (let index = fromIndex; index < lines.length; index += 1) {
    if (parseTableHeaderLine(lines[index]) !== null) {
      return index;
    }
  }
  return lines.length;
}

/**
 * 解析一行是否为 TOML table header（如 `[foo.bar]` 或 `[[array]]`）。
 * 考虑了括号内的引号字符串和行尾注释。
 */
function parseTableHeaderLine(line: string): ParsedTableHeader | null {
  const trimmed = line.trimStart();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const isArray = trimmed.startsWith("[[");
  const bracketCount = isArray ? 2 : trimmed.startsWith("[") ? 1 : 0;
  if (bracketCount === 0) {
    return null;
  }

  const closeIndex = findClosingBracket(trimmed, bracketCount);
  if (closeIndex === -1) {
    return null;
  }

  const key = trimmed.slice(bracketCount, closeIndex).trim();
  if (key.length === 0) {
    return null;
  }

  // 右括号后只允许空白或注释
  const afterHeader = trimmed.slice(closeIndex + bracketCount).trimStart();
  if (afterHeader.length > 0 && !afterHeader.startsWith("#")) {
    return null;
  }

  return { key, isArray };
}

/** 在考虑 TOML 引号转义的情况下查找对应的右括号 */
function findClosingBracket(text: string, bracketCount: number): number {
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;

  for (let index = bracketCount; index < text.length; index += 1) {
    const char = text[index];

    if (inDoubleQuote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === "\"") {
      inDoubleQuote = true;
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      continue;
    }
    if (char !== "]") {
      continue;
    }

    if (bracketCount === 1) {
      return index;
    }
    // 双括号 `]]` 需要连续两个 `]`
    if (text[index + 1] === "]") {
      return index;
    }
  }
  return -1;
}

/** 判断一行是否为顶层 `model_provider = ...` 赋值 */
function isModelProviderLine(line: string): boolean {
  const body = stripTomlInlineComment(line).trim();
  if (body.length === 0) {
    return false;
  }
  const separator = body.indexOf("=");
  if (separator === -1) {
    return false;
  }
  const key = body.slice(0, separator).trim();
  return key === "model_provider";
}

/** 在考虑双引号字符串的情况下去除行尾注释 */
function stripTomlInlineComment(line: string): string {
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\" && inDoubleQuote && !escaped) {
      escaped = true;
      continue;
    }
    if (char === "\"" && !escaped) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "#" && !inDoubleQuote) {
      return line.slice(0, index);
    }
    escaped = false;
  }

  return line;
}

// --- 字符串工具 ---

/** 将值转义为 TOML 双引号字符串 */
function toTomlString(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"");
  return `"${escaped}"`;
}

function toLines(source: string): string[] {
  if (source.length === 0) {
    return [];
  }
  return source.replaceAll("\r\n", "\n").split("\n");
}

/** 从行数组重建文本，末尾保留换行符 */
function fromLines(lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }
  return `${lines.join("\n")}\n`;
}

function trimLeadingEmptyLines(lines: string[]): string[] {
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") {
    start += 1;
  }
  return lines.slice(start);
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") {
    end -= 1;
  }
  return lines.slice(0, end);
}
