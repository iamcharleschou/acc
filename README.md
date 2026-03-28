# acc

`acc` 是 ClaudeCode (`cc`)、Codex 和 Gemini 的 Agent Configuration Center，用于统一管理 provider alias，并一键切换运行环境。

## Requirements

- Node.js >= 20
- pnpm >= 10

## Install

```bash
pnpm add -g acc
```

或：

```bash
npm install -g acc
```

## Development

```bash
pnpm install
pnpm lint
pnpm test:run
pnpm dev -- provider list cc
```

构建后可直接执行：

```bash
pnpm build
node dist/cli.cjs provider list cc
```

## Commands

### ClaudeCode (`cc`)

```bash
acc provider add cc minimax
acc provider list cc
acc provider edit cc yh
acc provider remove cc yh
acc use cc yh -- --model opus
```

### Legacy Claude 兼容语法

```bash
acc add minimax
acc list
acc edit yh
acc remove yh
acc use yh -- --model opus
```

### Codex

```bash
acc provider add codex 88code
acc provider list codex
acc provider edit codex 88code
acc provider remove codex 88code
acc use codex 88code -- --model gpt-5
```

`acc use codex <alias>` 会管理 `~/.codex/auth.json`，并将所选 provider 的 `OPENAI_API_KEY` 写入该文件（用于当前设计下的 Codex 认证切换）。

### Gemini

```bash
acc provider add gemini google
acc provider list gemini
acc provider edit gemini official
acc provider remove gemini official
acc use gemini official -- --model gemini-2.5-pro
```

`acc use gemini <alias>` 会完整管理并覆盖 `~/.gemini/.env`（不是与旧文件合并），然后启动 `gemini` 命令。  
`acc use gemini <alias> -- ...` 会把 `--` 后的参数透传给 `gemini`。  
Gemini provider 存储在 `config.env`，其中 `GEMINI_API_KEY` 必填；`GOOGLE_GEMINI_BASE_URL` 与 `GEMINI_MODEL` 可选。  
当未配置 `GOOGLE_GEMINI_BASE_URL` 时，Gemini CLI 使用官方 endpoint；当未配置 `GEMINI_MODEL` 时，Gemini CLI 使用其默认模型。  
除了上述内置字段，`config.env` 也可包含合法 dotenv 风格键（`^[A-Za-z_][A-Za-z0-9_]*$`），`use gemini` 时会一并写入 `~/.gemini/.env`。

## Data Files

- `~/.acc/config.json`
- `~/.acc/runtime/claude/settings.json`
- `~/.codex/config.toml`
- `~/.codex/auth.json`
- `~/.gemini/.env`
