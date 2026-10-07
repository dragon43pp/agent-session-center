/**
 * DeepSeek Harness —— `$DSH_HOME/sessions/<encoded-cwd>/<session-dir>/session.jsonl.zstd`
 *
 * dsh 与 WorkBuddy 一样不是「终端里那种 CLI」：它自己就是个带客户端的 harness
 * （DSH Desktop 只是给它套的 Electron 壳，两者共用同一个 `~/.dsh`）。所以这里
 * 不提供终端恢复命令，恢复走 ASC 的 DSH 表面（见 DshWebSurfaceController）。
 *
 * 数据形状（2026-10-06 在本机 139 个真实会话上实测）：
 *
 *   sessions/            第一层是「一个工作目录一个桶」，不是会话（和 Grok 同构）
 *   <bucket>/            桶名是编码后的 cwd，**不可逆解码**（`~0040` 是 @ 的十六进制
 *                        转义，`-` 既可能是分隔符也可能是路径里的字面量）。所以
 *                        cwd 一律读会话头记录里的 `cwd` 字段，不解释桶名。
 *   <session-dir>/       目录名通常是 `session-<uuid>`，但实测有 4 个是裸 `<uuid>`
 *                        （`--workspaces-11--` 桶），所以 id 也一律以头记录为准。
 *   session.jsonl.zstd   串联 zstd 帧容器，**每追加一批压一帧**（804 KB / 2099 帧）。
 *                        必须按帧解（见 ./zstdFrames.ts），直接整文件解压只会拿到
 *                        文件头那 171 字节。
 *
 * 记录（每行一个 JSON，均有 `type`；除头记录外都带 `time`（毫秒）与 `data`）：
 *
 *   session              { id, createdAt, cwd, delegationDepth, agentPreset }
 *   session/title        { title }                      ← 标题；改过名的话最后的赢
 *   request/context      { provider, model, contextWindow }  ← 模型
 *   user/message         { content: [{type:'text',text}] }   ← 首条用户消息当兜底标题
 *   assistant/message    { message, usage? }            ← 消息计数 + token
 *   assistant/chunk      { chunk: { type:'usage', usage } }
 *   turn/start · turn/end · step/start · step/end
 *   reasoning-chunks · text-chunks · tool-call-chunks    ← 体积全在这儿，按 type 直接丢
 *
 * **token 口径（dsh 官方 `dsh-token-meter` 定案，不是猜的）**：
 *   内部把 `usage.inputTokens` 改名 `uncachedInputTokens`，总量按
 *   `inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens` 相加
 *   —— 与 Grok 同族：**input 不含 cache，是兄弟字段要相加**，正好和 Codex 相反。
 *   reasoning 不单列（源码注释：sum disjoint buckets without double-counting
 *   reasoning output），已含在 outputTokens 里。
 *   另一条同样重要：usage 是**按 (turn, step) 覆盖**语义（`addReplacing`：同一步
 *   后报的替换先报的，一次 attempt 一条累计量），所以不能无脑求和所有 usage 事件，
 *   否则同一 step 的首报与终报会被加两遍。下面按 (turn, step) 取最后一条再跨步求和。
 *
 * 只读：本模块不写任何文件。
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'
import type { HistorySession, TokenUsage } from '../types'
import { emptyUsage, hasUsage, withTotal } from '../types'
import { isDirectory, isoFromMs, num, toTitle } from '../fsUtil'
import { scanZstdFrames } from './zstdFrames'

/** 只有这些 type 参与统计；其余（chunks 系列）是体积大头，按 type 直接丢。 */
const WANTED_TYPES = new Set([
  'session',
  'session/title',
  'request/context',
  'user/message',
  'assistant/message',
  'turn/end',
  'session/end-seed'
])

/** 单次消息里带 `type` 的形态：`{"type":"session/title","seq":...}`。 */
const TYPE_PATTERN = /^\{"type":"([^"]{1,40})"/

interface HeaderRecord {
  id?: unknown
  createdAt?: unknown
  cwd?: unknown
  delegationDepth?: unknown
  agentPreset?: unknown
}

interface UsageBuckets {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** dsh 的 usage 是覆盖语义，用 (turn, step) 当键，同键后者胜。 */
function usageKey(turn: number, step: number): string {
  return `${turn}:${step}`
}

function bucketsFromUsage(usage: unknown): UsageBuckets | null {
  if (typeof usage !== 'object' || usage === null) return null
  const u = usage as Record<string, unknown>
  const input = num(u['inputTokens'])
  const output = num(u['outputTokens'])
  const cacheRead = num(u['cacheReadTokens'])
  const cacheWrite = num(u['cacheWriteTokens'])
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) return null
  return { input, output, cacheRead, cacheWrite }
}

/** 从一条记录里挖出 usage（assistant/message 的 data.usage 或 chunk 的 usage）。 */
function usageOf(record: Record<string, unknown>): UsageBuckets | null {
  const data = record['data'] as Record<string, unknown> | undefined
  if (!data) return null
  const direct = bucketsFromUsage(data['usage'])
  if (direct) return direct
  const chunk = data['chunk'] as Record<string, unknown> | undefined
  if (chunk && chunk['type'] === 'usage') return bucketsFromUsage(chunk['usage'])
  return null
}

function firstUserText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue
    const p = part as Record<string, unknown>
    if (p['type'] === 'text' && typeof p['text'] === 'string') return p['text']
  }
  return ''
}

interface FoldedSession {
  header: HeaderRecord | null
  title: string
  fallbackTitle: string
  model: string
  createdAtMs: number | null
  lastTimeMs: number | null
  userMessages: number
  assistantMessages: number
  buckets: Map<string, UsageBuckets>
}

/**
 * 折一条会话的全部记录。行按帧拼接，跨帧的残行要留到下一帧补全。
 */
export function foldDshSession(chunks: Iterable<Buffer>): FoldedSession {
  const folded: FoldedSession = {
    header: null,
    title: '',
    fallbackTitle: '',
    model: '',
    createdAtMs: null,
    lastTimeMs: null,
    userMessages: 0,
    assistantMessages: 0,
    buckets: new Map()
  }
  let carry = ''
  const consume = (line: string): void => {
    if (line === '' || line === '\r') return
    // 先按前缀判 type：chunks 系列一行可达数 MB，不值得 JSON.parse。
    const match = TYPE_PATTERN.exec(line)
    if (!match) return
    const type = match[1]!
    if (!WANTED_TYPES.has(type)) return
    let record: Record<string, unknown>
    try {
      record = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    const time = num(record['time'])
    if (time > 0 && (folded.lastTimeMs === null || time > folded.lastTimeMs)) {
      folded.lastTimeMs = time
    }
    if (type === 'session') {
      folded.header = record as HeaderRecord
      const created = num((record as HeaderRecord).createdAt)
      if (created > 0) folded.createdAtMs = created
      return
    }
    const data = record['data'] as Record<string, unknown> | undefined
    if (!data) return
    if (type === 'session/title') {
      const title = typeof data['title'] === 'string' ? data['title'].trim() : ''
      // 会话可以被改名（dsh 的 summary 口径是「最新的持久标题」），最后一条胜。
      if (title) folded.title = title
      return
    }
    if (type === 'request/context') {
      const model = typeof data['model'] === 'string' ? data['model'].trim() : ''
      if (model && !folded.model) folded.model = model
      return
    }
    if (type === 'user/message') {
      folded.userMessages += 1
      if (!folded.fallbackTitle) {
        folded.fallbackTitle = firstUserText(data['content'])
      }
      return
    }
    if (type === 'assistant/message') {
      folded.assistantMessages += 1
      const buckets = usageOf(record)
      if (buckets) {
        const turn = num(data['turn'])
        const step = num(data['step'])
        folded.buckets.set(usageKey(turn, step), buckets)
      }
      return
    }
    const buckets = usageOf(record)
    if (buckets) {
      const turn = num(data['turn'])
      const step = num(data['step'])
      folded.buckets.set(usageKey(turn, step), buckets)
    }
  }
  for (const chunk of chunks) {
    carry += chunk.toString('utf8')
    let index = carry.indexOf('\n')
    while (index !== -1) {
      consume(carry.slice(0, index))
      carry = carry.slice(index + 1)
      index = carry.indexOf('\n')
    }
    // 单条记录本身可能极大（tool/result 里有整段输出）；留一个上限防止
    // 一条坏行把内存吃掉。
    if (carry.length > 1_000_000) carry = ''
  }
  consume(carry)
  return folded
}

function usageFromBuckets(buckets: Map<string, UsageBuckets>): TokenUsage {
  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  for (const b of buckets.values()) {
    input += b.input
    output += b.output
    cacheRead += b.cacheRead
    cacheWrite += b.cacheWrite
  }
  if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) {
    return emptyUsage()
  }
  return withTotal({ input, output, cacheRead, cacheWrite, reasoning: 0 })
}

/**
 * 读一个会话目录。目录里没有 `session.jsonl.zstd`（dsh 起过又立刻失败的会话会
 * 留下空目录）、或文件是 0 字节：返回 null，不报错——那不是损坏，是没有内容。
 */
async function readOneSession(dir: string): Promise<HistorySession | null> {
  const file = join(dir, 'session.jsonl.zstd')
  let bytes: Buffer
  let fileMtimeMs = 0
  try {
    const info = await stat(file)
    if (info.size === 0) return null
    fileMtimeMs = info.mtimeMs
    bytes = await readFile(file)
  } catch {
    return null
  }
  const scan = scanZstdFrames(bytes)
  if (scan.frames.length === 0) return null
  const chunks: Buffer[] = []
  for (const frame of scan.frames) {
    chunks.push(bytes.subarray(frame.start, frame.end))
  }
  // 逐帧解压：Node 的 zstd API 只解第一帧，多帧容器必须自己切。
  const decoded: Buffer[] = []
  for (const chunk of chunks) {
    try {
      decoded.push(zstdDecompressSync(chunk))
    } catch {
      // 单帧解不开：前面的帧仍然有效，读到这儿为止（多半是断电/被杀留下的半帧）。
      break
    }
  }
  if (decoded.length === 0) return null
  const folded = foldDshSession(decoded)
  const header = folded.header
  if (!header) return null
  const id = typeof header.id === 'string' && header.id ? header.id : null
  if (!id) return null
  const cwd = typeof header.cwd === 'string' ? header.cwd : ''
  const updatedMs = Math.max(folded.lastTimeMs ?? 0, fileMtimeMs)
  const delegationDepth = num(header.delegationDepth)
  const usage = usageFromBuckets(folded.buckets)
  return {
    agent: 'dsh',
    id,
    title: toTitle(folded.title || folded.fallbackTitle || id),
    cwd,
    createdAt: isoFromMs(folded.createdAtMs),
    updatedAt: isoFromMs(updatedMs || null),
    messageCount: folded.userMessages + folded.assistantMessages,
    model: folded.model,
    usage,
    // 有 usage 才谈得上定价：标 'unpriced' 让 index.ts 的 priceSessions 统一去查
    // catalog（查不到就保持 unpriced）；压根没有 usage 的是 'none'。
    costUsd: 0,
    costSource: hasUsage(usage) ? 'unpriced' : 'none',
    storage: 'dir',
    path: dir,
    archived: false,
    // delegationDepth > 0 = 被别的会话派生的子会话，不是用户自己开的。
    subagent: delegationDepth > 0
  }
}

/**
 * 扫一个 dsh 数据根（`<root>/sessions/<bucket>/<session-dir>/`）。
 *
 * 单个会话坏掉不影响其它会话：外层整个 try/catch，坏的那个跳过。
 */
export async function readDshSessions(root: string | null): Promise<HistorySession[]> {
  if (!root) return []
  const sessionsRoot = join(root, 'sessions')
  const buckets = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => [])
  const out: HistorySession[] = []
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue
    const bucketDir = join(sessionsRoot, bucket.name)
    const entries = await readdir(bucketDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sessionDir = join(bucketDir, entry.name)
      try {
        const session = await readOneSession(sessionDir)
        if (session) out.push(session)
      } catch (error) {
        // 单场坏掉不能带走整家 agent 的历史（index.ts 的隔离哲学）。但也不能
        // 静默：一条可诊断的日志，比让用户以为「dsh 只有 138 场」要好。
        console.warn(
          '[sessions/dsh] skipped unreadable session:',
          sessionDir,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  }
  return out
}

/** 便于判卷与体检：会话目录在不在。 */
export async function dshSessionsRootExists(root: string): Promise<boolean> {
  return isDirectory(join(root, 'sessions'))
}
