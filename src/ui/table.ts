// ASCII 表格渲染
// 用于 `acc provider list` 命令的终端输出
export type TableRow = string[];

/** 将表头和数据行渲染为等宽对齐的 ASCII 表格 */
export function renderTable(headers: string[], rows: TableRow[]): string {
  // 计算每列最大宽度（取表头和所有行中的最大值）
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );

  const headerLine = formatRow(headers, widths);
  const separatorLine = widths.map((width) => "-".repeat(width)).join("-+-");
  const bodyLines = rows.map((row) => formatRow(row, widths));

  if (bodyLines.length === 0) {
    return `${headerLine}\n${separatorLine}`;
  }

  return `${headerLine}\n${separatorLine}\n${bodyLines.join("\n")}`;
}

/** 将一行数据按列宽填充对齐，列间用 ` | ` 分隔 */
function formatRow(values: string[], widths: number[]): string {
  return widths
    .map((width, index) => (values[index] ?? "").padEnd(width, " "))
    .join(" | ");
}
