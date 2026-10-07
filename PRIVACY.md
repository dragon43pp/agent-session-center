# Privacy policy

**Agent Session Center** (ASC) is a local-first desktop application. It reads the session
history that other AI coding agents already keep on your own machine and shows it to you in
one place.

**Short version:** ASC has no telemetry, no analytics, no crash reporting, no account system,
and no server of its own. It does not collect anything about you. Nothing is transmitted to any
system you did not specify, and the few features that do talk to the network are either
opt-in or can be switched off — see [Turning network features off](#6-turning-network-features-off).

This policy applies to the desktop application distributed from
<https://github.com/fatedawn/agent-session-center>. The English text is authoritative.

---

## 1. What ASC stores on your machine

Everything ASC persists lives under your operating system's per-user application data
directory — on Windows `%APPDATA%\Agent Session Center\`, on macOS
`~/Library/Application Support/Agent Session Center/`, on Linux `~/.config/Agent Session Center/`.
You can point it elsewhere with the `ASC_USER_DATA_DIR` environment variable.

| File | Contents | Sensitive? |
| --- | --- | --- |
| `main-prefs.json` | UI preferences: theme, language, layout, notification sound choice | No |
| `asc-diagnostic.jsonl` | Local diagnostic log (application lifecycle, errors) | May contain local file paths |
| `ai-cli-scan.json`, `models.json`, `usage.json`, `stats.json` | Cached index and token/cost roll-ups of the sessions found on this machine | Contains session titles and working directories |
| `assistant-model.json` | Your AI assistant endpoint, model name, and **API key** | Yes — see §5 |
| `feishu.json` | Feishu/Lark app credentials and the paired-user allow-list, written with `0600` permissions | Yes — see §5 |
| `bridge-state.json`, `events.jsonl`, `history.jsonl`, `updates.jsonl` | Internal state for the local bridge, observer events, and the update history | No |
| `dsh-home/` | Runtime state for a locally hosted DeepSeek Harness instance | Depends on your usage |

ASC writes exactly one file **outside** its own data directory, and only as part of setting up
an agent integration you explicitly asked for: a hook definition (`asc-observer.json`, or a
managed block in the agent's own `config.toml`) inside that agent's configuration directory,
such as `~/.grok/hooks/`, `~/.codex/`, or `~/.kimi-code/`. The application asks you to review and
trust that hook before it takes effect, and does not touch configuration files belonging to
agents you have not connected.

## 2. What ASC reads on your machine

ASC reads session history, read-only, from the directories each agent already owns:

| Agent | Directory |
| --- | --- |
| Grok Build | `~/.grok/` (`$GROK_HOME`) |
| Claude Code | `~/.claude/` (`$CLAUDE_CONFIG_DIR`) |
| Codex | `~/.codex/` (`$CODEX_HOME`) |
| OpenCode | `~/.local/share/opencode/` (`$OPENCODE_DATA_DIR`) |
| Kimi Code | `~/.kimi-code/` (`$KIMI_CODE_HOME`) |
| Pi | `~/.pi/agent/` (`$PI_CODING_AGENT_DIR`) |
| DeepSeek Harness | `~/.dsh/` (`$DSH_HOME`) |
| WorkBuddy | `~/.workbuddy/` (`$WORKBUDDY_HOME`) |
| Antigravity | `~/.gemini/antigravity-cli/`, `~/.gemini/antigravity/` |

Session transcripts stay local. ASC reads them to build the session list, to compute token and
cost totals, and to render a transcript when **you** open one. It does not upload them.

## 3. Network activity — the complete list

This is every outbound request the application is capable of making. If a row says
"off by default", no request is made until you configure and enable that feature.

| Feature | Target | When it fires | What is sent | Default |
| --- | --- | --- | --- | --- |
| **Update check** | `github.com/fatedawn/agent-session-center` release metadata (via `electron-updater`) | Automatically, shortly after a packaged build starts, and then periodically | A standard HTTPS request. GitHub sees your IP address, your user agent, and the version you are running | **On** — disable with `ASC_DISABLE_UPDATES=1` |
| **Update download** | The release asset on `github.com` | Only when you press *Download update* | Same as above | On demand |
| **Price catalogue refresh** | `https://models.dev/api.json` | Only when you press *Refresh pricing* in Settings | A plain GET. No request body, no identifiers | On demand |
| **AI assistant / smart search** | The OpenAI-compatible endpoint **you** enter in *Settings → AI assistant* | Only when you send a question to the assistant | Session **metadata** for up to 400 sessions (key, agent name, title truncated to 80 chars, working directory truncated to 80 chars, model, timestamp, message count, token total), the last 6 turns of your assistant chat (2000 chars each), and your question. **Message bodies are never sent.** | **Off** — requires endpoint, key, and model |
| **Remote agent host** (OpenCode transport, DSH host, DSH web surface) | The host **you** configure | When you connect to that host | Task and session data needed to drive that host | **Off** — requires a configured host |
| **Feishu / Lark integration** | `open.feishu.cn`, `accounts.feishu.cn` — **your own** self-built app | After you bind your app credentials | Message content you send to the bot, plus events your app subscribes to. This is your own Feishu tenant, not ours | **Off** — requires binding an app |
| **Remote desktop / remote drive** | The join URL **you** paste | When you join a remote session | Terminal I/O and workspace file listings for that session | **Off** — requires a join URL |

`https://dsh.invalid` appears in the source as a base for URL parsing only and is never dialled.
`https://json.schemastore.org/...` appears as a JSON Schema identifier and is never fetched.
There is no error-reporting endpoint.

## 4. Third-party components and services

Your use of the features above is also governed by the other party's policy:

- **GitHub** (update checks, release downloads) — <https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement>
- **models.dev** (price catalogue, a plain public GET) — <https://models.dev>
- **Your AI model provider** (assistant) — the policy of whichever endpoint you configured
- **Feishu / Lark** (bot integration) — <https://www.feishu.cn/policy/privacy> (or your Lark region's policy)
- **DeepSeek Harness** (when you run a local or remote host) — the policy of that distribution

Bundled open-source components — Electron, `node-pty`, `ws`, `electron-updater`, the Lark SDK —
make no network requests of their own beyond those listed in §3.

## 5. How credentials are handled

- Your assistant API key and your Feishu app secret are stored **on your machine only**, in the
  application data directory, and are never written to a log, a diagnostic file, or a release
  asset. API keys are held in the main process; the renderer never receives them.
- Feishu credentials are written with `0600` permissions using an atomic
  write-temp-then-rename, so a half-written file never becomes the live credential.
- Credentials are read from disk per request and kept in memory for the shortest period that
  the request needs. They are not synced, not backed up to us, and not shared between ASC and
  any other product.

## 6. Turning network features off

| Want to stop | How |
| --- | --- |
| Update checks | Launch with `ASC_DISABLE_UPDATES=1`. Development builds never contact the update server. |
| Price catalogue refresh | Do not press the button. The shipped price snapshot works offline. |
| Assistant requests | Leave *Settings → AI assistant* unconfigured, or clear the endpoint. |
| Feishu traffic | Unbind the Feishu app, or do not bind one. |
| Remote hosts | Do not add a host or join a URL. |

Because the only automatic request is the GitHub update check, `ASC_DISABLE_UPDATES=1` is
sufficient to run ASC with no automatic network activity at all. The application is fully
functional offline; the update check and the price refresh are conveniences, not dependencies.

## 7. Data retention and deletion

ASC keeps no data anywhere except your own machine, so there is nothing for us to retain or
delete on your behalf. To remove everything:

1. Uninstall the application (Windows: *Apps & features*, or the uninstaller in the install
   directory; macOS: move the app to the Trash; Linux: remove the AppImage/`deb`).
2. Delete the application data directory listed in §1.
3. Remove the agent integration files listed in §1 if you enabled one.

Session history itself belongs to the agents that created it and is untouched by uninstalling
ASC.

## 8. Children

ASC is a developer tool. It is not directed at children and does not knowingly collect
information from anyone, including children.

## 9. Changes to this policy

Changes are made in this repository, so the full history of this policy is public in the git
log. A change that expands what leaves your machine will be called out in `CHANGELOG.md` and in
the release notes.

## 10. Contact

Open an issue at <https://github.com/fatedawn/agent-session-center/issues>, or see
[`SECURITY.md`](./.github/SECURITY.md) for a private channel.

---

# 隐私政策（中文版）

> 以下为英文版的中文对照。**以英文版为准**；两者冲突时以英文版为准。

**Agent Session Center**（简称 ASC）是一个本地优先的桌面应用。它把各个 AI 编程 Agent 已经存在你
本机的会话历史读出来，集中展示给你。

**一句话版本：** ASC 没有遥测、没有统计分析、没有崩溃上报、没有账号体系，也没有自己的服务器。
它不收集任何与你有关的信息。任何数据都不会被传送到你未指定的系统；少数会联网的功能要么需要你主动
开启，要么可以直接关掉 —— 见下方「关闭联网功能」。

**1. 本机落盘位置**

全部持久化数据都在操作系统的用户数据目录下：Windows 为 `%APPDATA%\Agent Session Center\`，
macOS 为 `~/Library/Application Support/Agent Session Center/`，Linux 为
`~/.config/Agent Session Center/`。可以用 `ASC_USER_DATA_DIR` 环境变量改到别处。

其中**含敏感信息**的两个文件：`assistant-model.json`（AI 助手端点、模型名、API 密钥）、
`feishu.json`（飞书应用凭据与配对名单，以 `0600` 权限写入）。其余为界面偏好、本地诊断日志、
会话索引与用量汇总、以及内部桥接状态。

ASC 只会在**你自己主动接入某个 Agent** 时，往该 Agent 自己的配置目录（如 `~/.grok/hooks/`、
`~/.codex/`、`~/.kimi-code/`）写一个 hook 定义文件。写入前程序会请你确认并信任该 hook；
你没有接入过的 Agent，它的配置文件不会被触碰。

**2. 本机读取范围**

只读地读取各 Agent 自己的会话目录（Grok / Claude Code / Codex / OpenCode / Kimi Code / Pi /
DeepSeek Harness / WorkBuddy / Antigravity，完整路径见英文版 §2）。会话正文**不出本机**：
读取仅用于生成会话列表、计算 token 与费用、以及**你自己打开某场会话时**渲染正文。

**3. 全部联网行为**

| 功能 | 目标 | 触发时机 | 发送内容 | 默认 |
| --- | --- | --- | --- | --- |
| 检查更新 | GitHub Release 元数据 | 打包版启动后自动检查，之后周期性检查 | 标准 HTTPS 请求；GitHub 会看到你的 IP、UA 与应用版本 | **开** —— 可用 `ASC_DISABLE_UPDATES=1` 关闭 |
| 下载更新 | GitHub Release 资产 | 只有你点「下载更新」时 | 同上 | 按需 |
| 刷新价目表 | `https://models.dev/api.json` | 只有你在设置里点「刷新价目表」时 | 普通 GET，无请求体、无标识 | 按需 |
| AI 助手 / 智能查找 | **你自己填的** OpenAI 兼容端点 | 只有你向助手提问时 | 最多 400 场会话的**元数据**（key、Agent 名、标题截断 80 字、工作目录截断 80 字、模型、时间、消息数、token 数）、最近 6 轮助手对话（各截断 2000 字）、以及你的问题。**会话正文从不发送。** | **关** —— 需填端点、密钥、模型 |
| 远程 Agent 宿主（OpenCode / DSH） | **你自己配置的**宿主 | 你连接该宿主时 | 驱动该宿主所需的任务与会话数据 | **关** —— 需先配置 |
| 飞书集成 | `open.feishu.cn` 等你**自建应用**的域名 | 你绑定应用凭据之后 | 你发给机器人的消息内容与订阅事件。这是你自己的飞书租户，不是我们的 | **关** —— 需先绑定应用 |
| 远程桌面 / 远程工作区 | **你自己粘贴的**接入 URL | 你加入远程会话时 | 该会话的终端 I/O 与工作区文件列表 | **关** —— 需先有 URL |

源码中出现的 `https://dsh.invalid` 仅用于 URL 解析、不会被实际请求；
`https://json.schemastore.org/...` 仅作为 JSON Schema 标识符，不会被抓取。
本项目没有错误上报端点。

**4. 第三方组件与服务**

上述功能同时受对方隐私政策约束：GitHub（检查/下载更新）、models.dev（价目表，公开 GET）、
你自己配置的模型服务商、飞书 / Lark（机器人集成）。打包内置的开源组件（Electron、`node-pty`、
`ws`、`electron-updater`、飞书 SDK）自身不会产生上表以外的网络请求。

**5. 凭据处理**

AI 助手密钥与飞书应用密钥**只存在你本机**，不会进日志、不会进诊断文件、不会进发布产物；
API 密钥只保留在主进程，渲染进程拿不到。飞书凭据以 `0600` 权限、临时文件 + rename 原子写入，
半截文件不会成为正式凭据。凭据不做同步、不上传、不在不同产品之间共享。

**6. 关闭联网功能**

| 想关掉 | 怎么做 |
| --- | --- |
| 检查更新 | 启动时加环境变量 `ASC_DISABLE_UPDATES=1`。开发版从不连更新服务。 |
| 刷新价目表 | 不点那个按钮即可；内置价目快照离线可用。 |
| AI 助手请求 | 保持「设置 → AI 助手」未配置，或清空端点。 |
| 飞书流量 | 解绑飞书应用，或从一开始就不绑定。 |
| 远程宿主 | 不添加宿主、不粘贴接入 URL。 |

因为唯一会自动发起的请求就是 GitHub 更新检查，设置 `ASC_DISABLE_UPDATES=1` 之后 ASC
在本机可以做到**零自动联网**。应用离线完全可用：更新检查与价目表刷新是便利功能，不是依赖。

**7. 数据留存与删除**

ASC 不在你自己的机器之外保存任何数据，因此我们没有可代你留存或删除的东西。彻底清除：

1. 卸载应用（Windows：设置 → 应用，或用安装目录里的卸载器；macOS：App 拖进废纸篓；
   Linux：删除 AppImage / `deb`）。
2. 删除第 1 节列出的用户数据目录。
3. 如启用过 Agent 集成，删除第 1 节列出的集成文件。

会话历史本身属于创建它的那些 Agent，卸载 ASC 不会影响它们。

**8. 儿童**

ASC 是开发者工具，不面向儿童，也不会有意收集任何人（包括儿童）的信息。

**9. 政策变更**

本政策在本仓库内维护，修改历史在 git 日志中公开可查。若某次变更扩大了离开你机器的数据范围，
会在 `CHANGELOG.md` 与发行说明中明确标注。

**10. 联系方式**

在 <https://github.com/fatedawn/agent-session-center/issues> 提 issue；需要私下沟通见
[`SECURITY.md`](./.github/SECURITY.md)。
