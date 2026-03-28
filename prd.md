# ACC(Agent Configuration Center) 产品文档

## 1. 背景与问题

Claude Code 在多上游、多账号、多网络环境下使用时，用户需要频繁切换：

- 不同的 `ANTHROPIC_BASE_URL`
- 不同的认证方式与凭证
- 不同的代理或扩展环境变量

如果完全依赖手工修改 `~/.claude/settings.json` 或手动设置 shell 环境变量，会带来以下问题：

- 切换成本高，容易出错
- 多 provider 配置不易持久化管理
- 临时修改会污染全局配置
- 用户级 `hooks`、`permissions` 等 Claude 设置容易在切换过程中被误覆盖
- 团队难以沉淀统一的切换流程

Provider Manager 是ACC的核心功能之一。

Provider Manager 的目标就是把“新增 provider、查看 provider、编辑 provider、删除 provider、激活 provider”收敛成一组稳定、可重复执行的 CLI 工作流。

## 2. Provider Manager 产品目标

### 2.1 核心目标

1. 允许用户维护多个 Claude Code 上游 provider 配置。
2. 允许用户通过一个简短 alias 快速激活目标 provider。
3. 在激活时自动生成 Claude 可直接消费的 settings 文件。
4. 在切换 provider 时保留用户已有的 Claude 用户配置，如 `hooks`、`permissions`。
5. 避免用户级 settings 在运行时被重复加载，降低重复生效风险。

### 2.2 非目标

当前版本不覆盖以下能力：

- 不负责校验 provider 连通性或 API 可用性
- 不负责加密存储密钥
- 不负责同步 provider 配置到云端
- 不负责项目级 provider 模板分发
- 不负责图形界面配置

## 3. 目标用户

### 3.1 主要用户

- 需要在多个 Claude 上游之间切换的个人开发者
- 需要同时维护 API Key 与 Auth Token 两种接入方式的高级用户
- 在不同网络环境下工作的用户

### 3.2 次要用户

- 需要沉淀统一 CLI 工作流的团队成员
- 需要在多个项目中重复切换 provider 的工程师

## 4. 术语定义

- Provider：Claude Code 的上游服务配置集合，至少包含 `ANTHROPIC_BASE_URL` 和一种认证信息
- Alias：用户为 provider 指定的短名称，用于执行 `acc use <alias>`
- 激活：根据 alias 生成 `~/.acc/runtime/claude/settings.json`，并启动 `claude`
- 用户配置：`~/.claude/settings.json`
- 项目配置：`<project>/.claude/settings.json`
- 本地项目配置：`<project>/.claude/settings.local.json`

## 5. 功能范围

Provider Manager 包含 5 个用户可见能力：

1. 添加 provider：`acc add <provider-name>`
2. 查看 provider 列表：`acc list`
3. 编辑 provider：`acc edit <alias>`
4. 删除 provider：`acc remove <alias>`
5. 激活 provider：`acc use <alias> [claude-options...]`

## 6. 用户场景

### 6.1 首次配置新 provider

用户第一次接入新的上游服务，希望通过一次交互式录入完成：

- alias
- base URL
- 认证模式
- 凭证
- 额外环境变量

完成后，配置被持久化，后续可重复使用。

### 6.2 日常切换 provider

用户已保存多个 provider，希望通过单条命令切换到目标 provider 并立即进入 Claude Code 会话。

### 6.3 调整已存在 provider

用户需要补充代理、更新 token、删除无用环境变量，而不是重新创建 provider。

### 6.4 安全保留现有 Claude 用户配置

用户的 `~/.claude/settings.json` 中可能包含：

- `hooks`
- `permissions`
- 其它自定义顶层配置

在执行 `acc use` 时，这些配置不能被无意清空。

## 7. 用户命令与交互设计

### 7.1 添加 provider

命令：

```bash
acc add <provider-name>
```

交互输入项：

1. alias
2. `ANTHROPIC_BASE_URL`
3. 认证模式：`API_KEY` 或 `AUTH_TOKEN`
4. 对应凭证
5. 是否继续补充额外 env

规则：

- alias 不能为空
- alias 不可与已有 provider 重名
- `ANTHROPIC_BASE_URL` 不能为空
- `API_KEY` 模式下必须输入 `ANTHROPIC_API_KEY`
- `AUTH_TOKEN` 模式下必须输入 `ANTHROPIC_AUTH_TOKEN`
- 额外 env 支持多次录入
- 额外 env 键重复时，新值覆盖旧值

成功结果：

- 配置写入 `~/.acc/config.json`
- 终端返回成功提示
- 给出下一步命令 `acc use <alias>`

### 7.2 查看 provider 列表

命令：

```bash
acc list
```

输出内容：

- alias
- provider 名称
- `ANTHROPIC_BASE_URL`
- 认证模式

空状态：

- 若没有配置任何 provider，提示用户执行 `acc add <provider-name>`

### 7.3 编辑 provider

命令：

```bash
acc edit <alias>
```

支持三类操作：

- `edit`：修改现有环境变量
- `add`：新增环境变量
- `delete`：删除环境变量

当前行为约束：

- `delete` 模式下不允许删除 `ANTHROPIC_BASE_URL`
- `edit` / `delete` 通过交互式多选界面选择字段
- 新增字段时，若键名已存在，允许覆盖并提示警告

### 7.4 删除 provider

命令：

```bash
acc remove <alias>
```

当前行为：

- 若 alias 不存在，报错并提示使用 `acc list`
- 若存在，则从 `~/.acc/config.json` 中删除该条记录

### 7.5 激活 provider

命令：

```bash
acc use <alias> [claude-options...]
```

激活步骤：

1. 从 `~/.acc/config.json` 读取 alias 对应 provider
2. 读取 `~/.claude/settings.json`
3. 保留用户原有 `hooks`、`permissions` 和其它顶层字段
4. 用 provider 覆盖认证和网络相关字段
5. 生成 `~/.acc/runtime/claude/settings.json`
6. 启动 Claude Code

默认启动命令语义：

```bash
claude --setting-sources project,local --settings ~/.acc/runtime/claude/settings.json
```

说明：

- `project,local` 为默认 settings source
- `user` 不再由 Claude 运行时直接重复加载
- 用户级配置已提前合并进 `~/.acc/runtime/claude/settings.json`
- 若用户显式传入 `--setting-sources`，系统应尊重用户输入，不做额外改写

## 9. 核心产品规则

### 9.1 认证模式规则

Provider 支持两种认证模式：

- `API_KEY`
- `AUTH_TOKEN`

映射规则：

- `API_KEY` 模式写入 `ANTHROPIC_API_KEY`
- `AUTH_TOKEN` 模式写入 `ANTHROPIC_AUTH_TOKEN`

激活时的清理规则：

- 如果当前 provider 使用 `API_KEY`，历史 `ANTHROPIC_AUTH_TOKEN` 应被清理
- 如果当前 provider 使用 `AUTH_TOKEN`，历史 `ANTHROPIC_API_KEY` 与 `apiKeyHelper` 应被清理

### 9.2 settings 合并规则

生成 `~/.acc/runtime/claude/settings.json` 时，合并逻辑如下：

1. 读取用户级 `~/.claude/settings.json`
2. 复制其顶层字段
3. 合并 `env`
4. 仅覆盖 provider 管理字段：
   - `ANTHROPIC_BASE_URL`
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_AUTH_TOKEN`
   - `apiKeyHelper`
   - provider 自定义 env
5. 保留非 provider 管理字段：
   - `hooks`
   - `permissions`
   - 其它自定义顶层配置

### 9.3 CLI 参数透传规则

- `acc use <alias>` 后的额外参数应原样透传给 `claude`
- 若额外参数中显式包含 `--setting-sources` 或 `--setting-sources=...`，则不再自动补默认值

### 9.4 存储规则

Provider 配置持久化在：

```text
~/.acc/config.json
```

运行时生成配置保存在：

```text
~/.acc/runtime/claude/settings.json
```

配置结构定义如下：

```json
{
  "<alias>": {
    "provider_name": "galaxy",
    "alias": "yh",
    "auth_mode": "API_KEY",
    "settings": {
      "ANTHROPIC_BASE_URL": "https://api.example.com",
      "ANTHROPIC_API_KEY": "your-api-key",
      "HTTP_PROXY": "http://127.0.0.1:7890",
      "HTTPS_PROXY": "http://127.0.0.1:7890",
    }
  }
}
```

## 9. 信息架构与配置关系

### 9.1 配置文件位置

- Provider 仓库：`~/.acc/config.json`
- Provider 激活产物：`~/.acc/runtime/claude/settings.json`
- Claude 用户配置：`~/.claude/settings.json`
- 项目配置：`<project>/.claude/settings.json`
- 项目本地配置：`<project>/.claude/settings.local.json`

### 9.2 激活链路图

```text
生成阶段
────────

~/.claude/settings.json
    ↓  保留 hooks / permissions / 其它顶层字段
provider 配置
    ↓  覆盖认证 / 网络字段
~/.acc/runtime/claude/settings.json


运行阶段
────────

<project>/.claude/settings.json
    ↓
<project>/.claude/settings.local.json
    ↓
--settings ~/.acc/runtime/claude/settings.json
    ↓
额外 CLI flags
    ↓
Claude Code 最终运行配置
```

## 10. 异常与边界场景

### 10.1 alias 相关

- alias 为空：阻止创建
- alias 已存在：阻止创建
- alias 不存在：`use` / `edit` / `remove` 均应报错

### 10.2 配置文件相关

- `~/.acc/config.json` 不存在：视为空配置
- `~/.claude/settings.json` 不存在：按空对象处理
- `~/.claude/settings.json` 为空文件：按空对象处理
- `~/.claude/settings.json` JSON 非法：终止激活并提示修复
- `~/.claude/settings.json` 顶层非对象：终止激活并提示修复

### 10.3 交互环境相关

- `edit` 的多选交互依赖 TTY
- 非 TTY 场景下无法进入多选交互，应报错退出

### 10.4 删除行为相关

- 当前实现允许直接删除 provider，不带二次确认
- `edit delete` 模式会先展示待删字段并要求确认

## 11. 用户价值

该功能为用户带来的直接价值：

- 从“手工改配置”切换为“命令级切换”
- 多 provider 场景下显著降低出错率
- 用户级 Claude 配置得以保留
- 项目级与本地级设置仍可参与运行时覆盖
- 支持把 provider 管理纳入可重复的工程流程

## 12. 验收标准

### 12.1 添加

- 输入完整信息后，provider 成功写入 `~/.acc/config.json`
- 重复 alias 时，系统阻止写入并给出清晰提示

### 12.2 查看

- 至少能展示 alias、provider 名称、base URL、认证模式
- 空状态有明确引导

### 12.3 编辑

- 用户可修改已有 env
- 用户可新增 env
- 用户可删除除 `ANTHROPIC_BASE_URL` 外的 env

### 12.4 删除

- 删除已存在 alias 后，配置文件中不再包含该 provider
- 删除不存在 alias 时有明确错误提示

### 12.5 激活

- 执行 `acc use <alias>` 后会生成 `~/.acc/runtime/claude/settings.json`
- 生成文件中包含当前 provider 的认证与网络配置
- 用户 `hooks`、`permissions` 不会因激活而丢失
- 不显式传 `--setting-sources` 时，默认以 `project,local` 启动
- 显式传入 `--setting-sources` 时，系统不篡改用户参数

## 13. 当前限制与后续演进建议

### 13.1 当前限制

- 凭证以明文形式存储在本地配置中
- 未提供 provider 连通性验证
- `edit` 操作仅支持环境变量层面的维护
- 缺少批量导入、导出与备份能力
- 缺少 provider 使用记录与最近激活历史

### 13.2 后续演进建议

1. 增加 `acc provider test <alias>`，验证 base URL 与认证信息可用性
2. 增加导入导出能力，支持团队共享 provider 模板
3. 增加最近使用 provider 展示与快速切换
4. 增加敏感字段脱敏显示
5. 增加 provider 分组、标签或场景化切换

## 14. 附录

### 14.1 相关命令

```bash
acc add <provider-name>
acc list
acc edit <alias>
acc remove <alias>
acc use <alias> [claude-options...]
```

### 14.2 相关配置样例

激活后生成的 settings 示例：

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_API_KEY": "your-api-key",
    "HTTP_PROXY": "http://127.0.0.1:7890"
  },
  "permissions": {
    "allow": ["Bash(git status)"],
    "deny": []
  },
  "hooks": {
    "PreToolUse": []
  },
  "apiKeyHelper": "echo 'your-api-key'"
}
```
