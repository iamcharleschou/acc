# acc

> **A**gent **C**onfiguration **C**enter — 统一管理 ClaudeCode、Codex、Gemini 的 provider 配置，一键切换运行环境。

## 功能概览

- **Provider 管理** — 为每个 Agent 添加、编辑、删除多套 provider（别名索引）
- **一键切换** — `acc use <agent> <alias>` 自动写入对应 Agent 的配置文件并启动 CLI
- **安全存储** — 敏感文件使用 `0o600` 权限，修改前自动备份
- **旧版兼容** — 支持 `acc add / list / edit / remove` 简写（默认操作 ClaudeCode）

## 环境要求

- Node.js ≥ 20
- pnpm ≥ 10

## 安装

```bash
pnpm add -g acc
```

或：

```bash
npm install -g acc
```

## 使用

### Provider 管理（通用语法）

```bash
acc provider add    <agent> <providerName>   # 交互式添加
acc provider list   <agent>                  # 列表展示
acc provider edit   <agent> <alias>          # 交互式编辑
acc provider remove <agent> <alias>          # 删除
```

### 切换并启动 Agent

```bash
acc use <agent> <alias> [-- <额外参数>]
```

`--` 之后的参数会透传给对应的 Agent CLI。

---

### ClaudeCode (`cc`)

```bash
acc provider add cc minimax
acc provider list cc
acc provider edit cc minimax
acc provider remove cc minimax
acc use cc minimax -- --dangerously-skip-permissions --mcp-config .mcp.json
```

`acc use cc <alias>` 会合并用户 `~/.claude/settings.json` 与 provider 环境变量，生成运行时 settings 后启动 `claude`。

**旧版兼容语法**（默认 agent 为 `cc`）：

```bash
acc add minimax          # → acc provider add cc minimax
acc list                 # → acc provider list cc
acc edit minimax         # → acc provider edit cc minimax
acc remove minimax       # → acc provider remove cc minimax
acc use minimax -- --dangerously-skip-permissions --mcp-config .mcp.json  # claude --dangerously-skip-permissions --mcp-config .mcp.json
```

### Codex

```bash
acc provider add codex runanytime
acc provider list codex
acc provider edit codex runanytime
acc provider remove codex runanytime
acc use codex runanytime -- --model gpt-5.4
```

`acc use codex <alias>` 会：
1. 在 `~/.codex/config.toml` 中写入 `[model_providers.<alias>]` 块并设置 `model_provider`
2. 将 `OPENAI_API_KEY` 写入 `~/.codex/auth.json`
3. 启动 `codex`；失败时自动回滚配置文件

### Gemini

```bash
acc provider add gemini official
acc provider list gemini
acc provider edit gemini official
acc provider remove gemini official
acc use gemini official -- --model gemini-2.5-pro
```

`acc use gemini <alias>` 会**完整覆盖**（非合并）`~/.gemini/.env`，然后启动 `gemini`。

| 环境变量 | 必填 | 说明 |
|---|---|---|
| `GEMINI_API_KEY` | 是 | API 密钥 |
| `GOOGLE_GEMINI_BASE_URL` | 否 | 未配置时使用官方 endpoint |
| `GEMINI_MODEL` | 否 | 未配置时使用 CLI 默认模型 |
| 自定义键 (`^[A-Za-z_][A-Za-z0-9_]*$`) | 否 | 一并写入 `.env` |

## 数据文件

| 文件路径 | 用途 |
|---|---|
| `~/.acc/config.json` | Provider 主配置（全部 agent） |
| `~/.acc/runtime/claude/settings.json` | Claude 运行时生成的 settings |
| `~/.acc/backups/codex/` | Codex 配置备份（含时间戳） |
| `~/.codex/config.toml` | Codex 主配置 |
| `~/.codex/auth.json` | Codex 认证文件 |
| `~/.gemini/.env` | Gemini 环境变量 |

## 开发

```bash
pnpm install
pnpm lint          # TypeScript 类型检查
pnpm test:run      # 运行测试
pnpm dev -- provider list cc   # 开发模式运行
```

构建后直接执行：

```bash
pnpm build
node dist/cli.cjs provider list cc
```

## License

MIT
