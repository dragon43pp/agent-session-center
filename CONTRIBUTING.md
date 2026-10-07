# 参与 Agent Session Center 的开发

感谢你愿意花时间。Agent Session Center 是一个面向多 Coding Agent 工作流的桌面终端：
保留每个 CLI 原本的 TUI，在外层补上会话状态、注意力提醒、悬浮监控、快速启动和只读工作区浏览。

## 三种参与方式

| 想做什么 | 怎么做 |
| --- | --- |
| 报bug | 提 [issue](https://github.com/fatedawn/agent-session-center/issues/new/choose)，用Bug 模板。描述里请贴上复现步骤。 |
| 提需求 | 提 issue，用 Feature 模板。重点写**使用场景**，不要只写功能名。 |
| 提 PR |  fork → 建分支 → 改 → 提 PR。大型功能请先开 issue 讨论，避免白做。 |

## 本地开发

需要 Node.js 与 npm。仓库没有 `.nvmrc`，CI 用的是 Node 20；本机装 20 LTS 最稳。

```bash
git clone https://github.com/fatedawn/agent-session-center.git
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

## 安全政策

### 报告漏洞

**不要**用公开 issue 报告安全问题。请走 GitHub 的私下渠道：

[打开一条 Security Advisory](https://github.com/fatedawn/agent-session-center/security/advisories/new)

请附上：受影响的版本、复现步骤或 PoC、影响面（本地提权 / 数据外泄 / 远程执行），以及你希望怎么署名（默认匿名）。首次响应同样按 **72 小时内**。修复发布后会在 advisory 里致谢，除非你要求匿名。

支持范围与处理流程见 [`.github/SECURITY.md`](./.github/SECURITY.md)。

### 代码签名角色

本项目通过 [SignPath Foundation](https://signpath.org) 的免费计划对 Windows 安装包做代码签名。按该计划的要求，团队角色划分如下（单人维护期间三个角色由同一人兼任）：

| 角色 | 职责 | 成员 |
| --- | --- | --- |
| Authors（提交者） | 可不经额外评审直接改源码 | [`@fatedawn`](https://github.com/fatedawn) |
| Reviewers（评审者） | 评审一切由无提交权限者提出的改动 —— 即所有来自 fork 的 PR 都必须有人看过才能合并 | [`@fatedawn`](https://github.com/fatedawn) |
| Approvers（审批者） | 逐次审批发签请求，判断某个版本是否可以签名 | [`@fatedawn`](https://github.com/fatedawn) |

约束：

1. **所有成员必须对 GitHub 与 SignPath 开启 MFA。** 没有例外；这项不满足就失去权限。
2. **签名请求必须人工审批。** 构建工作流只能产出未签名的安装包；签名是在 SignPath 门户里由 Approver 手动批准的，工作流无法自行触发。
3. **只签自己的东西。** 只能签由本仓库流水线构建出的产物；上游开源项目的二进制不得用本项目的证书重签。
4. **构建脚本与 CI 配置按代码同等标准评审。** 它们决定了「签名最终签的是什么东西」，改这两类文件时不能图快。
5. 若之后有新的维护者加入，第三个角色改为双人流程 —— **该版本的提交者不能同时审批该版本的发签请求**。

签名政策全文（英文为主）见 [README 的 Code signing policy 一节](./README.md#code-signing-policy)。

### 隐私与数据流

改动如果新增了任何出网行为，或改变了发往用户未指定系统的数据，**必须同步更新 [PRIVACY.md](./PRIVACY.md)**，并在 PR 描述里单独说明。PRIVACY.md 里那张联网表是逐条对照源码写出来的 —— 加一个 `fetch` 就要加一行。

### 上游沿革

本仓库是对 [`UniRound-Tec/hrack`](https://github.com/UniRound-Tec/hrack)（Apache-2.0）的二次开发，已做品牌更名与功能重做；沿革与改动范围记录在 [NOTICE](./NOTICE) 里。提 PR 时如果改动落在与上游同路径的文件上，请在描述里提一句，便于评审时对照。
