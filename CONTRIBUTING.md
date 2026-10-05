# 参与 Agent Session Center 的开发

感谢你愿意花时间。Agent Session Center 是一个面向多 Coding Agent 工作流的桌面终端：
保留每个 CLI 原本的 TUI，在外层补上会话状态、注意力提醒、悬浮监控、快速启动和只读工作区浏览。

## 三种参与方式

| 想做什么 | 怎么做 |
| --- | --- |
| 报bug | 提 [issue](https://github.com/dragon43pp/agent-session-center/issues/new/choose)，用Bug 模板。描述里请贴上复现步骤。 |
| 提需求 | 提 issue，用 Feature 模板。重点写**使用场景**，不要只写功能名。 |
| 提 PR |  fork → 建分支 → 改 → 提 PR。大型功能请先开 issue 讨论，避免白做。 |

## 本地开发

需要 Node.js 与 npm。仓库没有 `.nvmrc`，CI 用的是 Node 20；本机装 20 LTS 最稳。

```bash
git clone https://github.com/dragon43pp/agent-session-center.git
cd agent-session-center
npm install
npm run dev
```

桌面程序在仓库根目录（`src/` + `electron/`）；Python 会话工具与飞书助手在同一仓库的 `hub/` 目录。

提交前的自查：

```bash
npm run typecheck
npm run build
```

改到 Observer 或终端层时，请补一个能证明**事件顺序**与**降级行为**的 fixture 或 runtime 测试 —— 这类改动肉眼看不出问题，只能靠测试兜住。

## 分支命名

- `feat/xxx` —— 新功能
- `fix/xxx` —— 修bug
- `docs/xxx` —— 只改文档

## Commit 规范

用 [Conventional Commits](https://www.conventionalcommits.org/)，常用前缀：

`feat:` 新功能 · `fix:` 修 bug · `docs:` 改文档 · `refactor:` 重构 · `chore:` 杂项

例：`feat(observer): 支持 Kimi Code 的审批事件`

## PR 要求

1. 关联 issue（`Closes #123`），或在PR 里说明为什么不需要。
2. 说清楚改了什么、为什么。
3. **涉及界面改动的 PR 必须贴截图**（改前 / 改后）。
4. `npm run typecheck` 与 `npm run build` 都要通过。

## 响应时限

这个项目目前是单人维护，**首次响应在 72 小时内**。如果超过一周没动静，直接在 issue 里 ping 一下即可。

## 环境变量说明

环境变量统一使用 `ASC_` 前缀（如 `ASC_USER_DATA_DIR`、`ASC_LINUX_ARCH`）。
早期工作名的前缀已全部废弃，不再做兼容读取；如果你的外部脚本还在用旧前缀，
请同步改成 `ASC_`。

## 行为准则

保持友善即可。这是给一群陌生人协作用的开源项目，不接受人身攻击、刷屏和无关广告。
