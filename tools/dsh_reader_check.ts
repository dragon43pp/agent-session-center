/**
 * dsh reader 的离线判卷。
 *
 * 造合成会话目录（多帧 zstd，和 dsh 真实写法的形状一致），验：
 *   ① 多帧容器必须读全 —— 这是本项目最容易错的一处：`zstdDecompressSync`
 *      丢进整个文件只解第一帧（本机真实文件 804 KB → 只出 171 字节）。
 *   ② 标题取「最后一条 session/title」（dsh 的 summary 口径是最新持久标题）。
 *   ③ 兜底标题取首条 user/message。
 *   ④ cwd 读会话头字段，不去反解桶名（桶名编码不可逆）。
 *   ⑤ 目录名是裸 uuid（本机实测有 4 个）时也能读，id 以头记录为准。
 *   ⑥ token 覆盖语义：同 (turn, step) 后报替换先报，跨 step 相加；
 *      input 不含 cacheRead（dsh-token-meter 的口径）。
 *   ⑦ 尾部半帧（进程被杀）不报错，前面的记录照读。
 *   ⑧ 空文件 / 无文件 → 跳过，不抛。
 *   ⑨ 真损坏（magic 不对）→ 抛错，由 index.ts 隔离成该 agent 的错误。
 *
 * 跑法：
 *   node node_modules/esbuild/bin/esbuild tools/dsh_reader_check.ts --bundle \
 *     --platform=node --format=esm --outfile=tools/_dsh_reader_check.mjs \
 *     && node tools/_dsh_reader_check.mjs
 * 真机体检（只读，扫本机 ~/.dsh 全部会话）：
 *   DSH_REAL=1 node tools/_dsh_reader_check.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { readDshSessions } from '../electron/sessions/readers/dsh'
import { scanZstdFrames } from '../electron/sessions/readers/zstdFrames'
import { dshHome } from '../electron/sessions/paths'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, extra = ''): void {
  if (ok) {
    pass += 1
    console.log(`  \u2714 ${name}`)
  } else {
    fail += 1
    console.log(`  \u2716 ${name}${extra ? ` \u2014 ${extra}` : ''}`)
  }
}

/** 一个帧一条记录：dsh 每追加一批压一帧，这里逐条压，等价。 */
function writeSession(dir: string, records: unknown[]): void {
  mkdirSync(dir, { recursive: true })
  const frames = records.map((record) =>
    zstdCompressSync(Buffer.from(JSON.stringify(record) + '\n', 'utf8'))
  )
  writeFileSync(join(dir, 'session.jsonl.zstd'), Buffer.concat(frames))
}

const SID = 'session-11111111-2222-3333-4444-555555555555'
const root = mkdtempSync(join(tmpdir(), 'dsh-reader-check-'))
// reader 读的是 <root>/sessions/<bucket>/<session-dir>/，fixture 必须同构。
const sessionsRoot = join(root, 'sessions')
mkdirSync(sessionsRoot, { recursive: true })

function header(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'session',
    version: 0,
    id: SID,
    createdAt: 1787191558813,
    cwd: 'D:\\grok',
    delegationDepth: 0,
    agentPreset: 'standard',
    ...overrides
  }
}

function at(type: string, seq: number, time: number, data: Record<string, unknown>): unknown {
  return { type, seq, time, data }
}

try {
  // ── ① 多帧 + ② 标题 + ④ cwd + ⑥ token 口径 ────────────────────────────
  const richDir = join(sessionsRoot, '--D-grok--', 'session-' + SID.slice(8))
  writeSession(richDir, [
    header(),
    at('permission/preset', 0, 1787191559160, { preset: 'danger-full-access' }),
    at('user/message', 1, 1787278231900, {
      content: [{ type: 'text', text: '第一条用户消息，用来兜底当标题' }],
      role: 'user'
    }),
    // 体积大的 chunk 记录：reader 必须按 type 丢掉，不能崩
    at('reasoning-chunks', 2, 1787278232000, { texts: ['x'.repeat(5000)] }),
    at('session/title', 3, 1787278232138, { title: '早先的标题', messageSeqs: [1] }),
    at('request/context', 4, 1787278232145, {
      provider: 'colasoft-company',
      model: 'deepseek/deepseek-v4-pro',
      contextWindow: 262144
    }),
    // 同一步报两次 usage：先报的被后报的替换（dsh addReplacing 语义）
    at('assistant/chunk', 5, 1787278232148, {
      turn: 1,
      step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } }
    }),
    at('assistant/chunk', 6, 1787278232200, {
      turn: 1,
      step: 1,
      chunk: {
        type: 'usage',
        usage: { inputTokens: 15000, outputTokens: 800, cacheReadTokens: 4000 }
      }
    }),
    at('assistant/message', 7, 1787278232250, {
      turn: 1,
      step: 1,
      message: { role: 'assistant', content: [{ type: 'text', text: '好' }] },
      usage: { inputTokens: 15000, outputTokens: 800, cacheReadTokens: 4000 }
    }),
    at('assistant/message', 8, 1787278250000, {
      turn: 1,
      step: 2,
      message: { role: 'assistant', content: [{ type: 'text', text: '第二步' }] },
      usage: { inputTokens: 2000, outputTokens: 300, cacheWriteTokens: 500 }
    }),
    at('turn/end', 9, 1787278579932, { turn: 1, reason: { kind: 'completed' } }),
    // 改名：最后一条 title 才是权威
    at('session/title', 10, 1787278600000, { title: '改名后的真标题', messageSeqs: [1] })
  ])

  // ⑤ 裸 uuid 目录名（本机 --workspaces-11-- 桶里真有 4 个）
  const bareDir = join(sessionsRoot, '--workspaces-11--', '902dd584-0d8c-4066-bd53-b89eb86cda7d')
  writeSession(bareDir, [header({ id: '902dd584-0d8c-4066-bd53-b89eb86cda7d', cwd: '/workspaces/11' })])

  // ⑦ 尾部半帧：合法帧 + 被截断的帧
  const tornDir = join(sessionsRoot, '--D-tmp--', 'session-torn')
  mkdirSync(tornDir, { recursive: true })
  const whole = zstdCompressSync(Buffer.from(JSON.stringify(header({ id: 'session-torn' })) + '\n'))
  const partial = zstdCompressSync(Buffer.from('{"type":"user/message"}\n')).subarray(0, 12)
  writeFileSync(join(tornDir, 'session.jsonl.zstd'), Buffer.concat([whole, partial]))

  // ⑧ 空文件 / 完全没有文件
  const emptyDir = join(sessionsRoot, '--D-tmp--', 'session-empty')
  mkdirSync(emptyDir, { recursive: true })
  writeFileSync(join(emptyDir, 'session.jsonl.zstd'), Buffer.alloc(0))
  mkdirSync(join(sessionsRoot, '--D-tmp--', 'session-nofile'), { recursive: true })

  // ⑨ 真损坏：magic 不对
  const brokenDir = join(sessionsRoot, '--D-tmp--', 'session-broken')
  mkdirSync(brokenDir, { recursive: true })
  writeFileSync(join(brokenDir, 'session.jsonl.zstd'), Buffer.from('this is not zstd at all'))

  // 非目录的杂项（dsh 的 sessions/ 下可能有文件）
  writeFileSync(join(sessionsRoot, 'stray.txt'), 'x')

  const sessions = await readDshSessions(root)
  const byId = new Map(sessions.map((s) => [s.id, s]))
  console.log(`读数：${sessions.length} 场（期望 3：rich / bare / torn）`)

  check('坏会话不带走整个 agent（3 场正常返回）', sessions.length === 3, `实际 ${sessions.length}`)

  const rich = byId.get(SID)
  check('① 多帧读全（后面帧的记录也解析到了）', Boolean(rich?.model), rich?.model)
  check('② 标题取最后一条 session/title', rich?.title === '改名后的真标题', rich?.title)
  check('④ cwd 取会话头字段而非桶名', rich?.cwd === 'D:\\grok', rich?.cwd)
  check('createdAt 从毫秒转 ISO', (rich?.createdAt ?? '').startsWith('2026-'), rich?.createdAt ?? '')
  check('updatedAt 取最后记录时间', (rich?.updatedAt ?? '').startsWith('2026-'), rich?.updatedAt ?? '')
  check('messageCount = user + assistant', rich?.messageCount === 3, String(rich?.messageCount))
  check('model 原样保留 provider/model', rich?.model === 'deepseek/deepseek-v4-pro', rich?.model)
  check('storage=dir 且 path 指向会话目录', rich?.storage === 'dir' && (rich?.path ?? '').endsWith(SID.slice(8)), rich?.path)
  check('subagent=false（delegationDepth 0）', rich?.subagent === false)
  check('costSource=unpriced（有 usage，等 catalog 定价）', rich?.costSource === 'unpriced', rich?.costSource)

  // ⑥ token：同 step 覆盖（15000 不是 15100），跨 step 相加；cache 单列
  check('⑥ 同 step 后报覆盖先报', rich?.usage.input === 17000, String(rich?.usage.input))
  check('⑥ output 同步相加', rich?.usage.output === 1100, String(rich?.usage.output))
  check('⑥ cacheRead 单独成桶（不并入 input）', rich?.usage.cacheRead === 4000, String(rich?.usage.cacheRead))
  check('⑥ cacheWrite 单独成桶', rich?.usage.cacheWrite === 500, String(rich?.usage.cacheWrite))
  check('⑥ total = input+output+cacheRead+cacheWrite+reasoning', rich?.usage.total === 22600, String(rich?.usage.total))

  const bare = byId.get('902dd584-0d8c-4066-bd53-b89eb86cda7d')
  check('⑤ 裸 uuid 目录名可读，id 以头记录为准', Boolean(bare), String(bare?.id))
  check('⑤ 桶名不作 cwd 来源', bare?.cwd === '/workspaces/11', bare?.cwd)
  check('⑤ 空会话 costSource=none', bare?.costSource === 'none', bare?.costSource)
  check('⑤ 空会话标题兜底成 id', (bare?.title ?? '').startsWith('902dd584'), bare?.title)

  const torn = byId.get('session-torn')
  check('⑦ 尾部半帧照样返回前半截', Boolean(torn), String(torn?.id))

  check('⑧ 空文件被跳过', !byId.has('session-empty'))
  check('⑧ 无文件目录被跳过', !byId.has('session-nofile'))

  // ⑨ 损坏的处置分两层：
  //   原语（scanZstdFrames）必须**抛**——结构不对就是不对，静默会把 bug 藏起来；
  //   reader 必须**吞**——单场坏掉不能带走整家 agent 的历史（index.ts 的隔离哲学），
  //   同时留一条 console.warn 让人能查。
  let primitiveThrew = false
  try {
    scanZstdFrames(Buffer.from('this is not zstd at all'))
  } catch {
    primitiveThrew = true
  }
  check('⑨ 原语遇坏 magic 抛错（不静默）', primitiveThrew)

  let warned = 0
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    if (String(args[0]).includes('[sessions/dsh]')) warned += 1
  }
  const afterBroken = await readDshSessions(root)
  console.warn = originalWarn
  check('⑨ reader 吞掉坏场，其余照常返回', afterBroken.length === 3, String(afterBroken.length))
  check('⑨ 坏场留下了可诊断日志', warned >= 1, String(warned))

  // 全部会话都坏时：返回空而不是把 agent 判成失败（拿不到可信的「为什么」）
  const allBrokenRoot = mkdtempSync(join(tmpdir(), 'dsh-all-broken-'))
  try {
    const brokenBucket = join(allBrokenRoot, 'sessions', '--D-tmp--', 'session-x')
    mkdirSync(brokenBucket, { recursive: true })
    writeFileSync(join(brokenBucket, 'session.jsonl.zstd'), Buffer.from('garbage'))
    const originalWarn2 = console.warn
    console.warn = () => undefined
    const none = await readDshSessions(allBrokenRoot)
    console.warn = originalWarn2
    check('⑨ 全线损坏返回空数组（不抛）', none.length === 0, String(none.length))
  } finally {
    rmSync(allBrokenRoot, { recursive: true, force: true })
  }

  // 直接测原语：单帧 API 与多帧扫描的差别（这就是 ① 的证据）
  const multi = Buffer.concat([
    zstdCompressSync(Buffer.from('AAA')),
    zstdCompressSync(Buffer.from('BBB'))
  ])
  const scan = scanZstdFrames(multi)
  const { zstdDecompressSync } = await import('node:zlib')
  const naive = zstdDecompressSync(multi).toString('utf8')
  const frameWise = scan.frames
    .map((f) => zstdDecompressSync(multi.subarray(f.start, f.end)).toString('utf8'))
    .join('')
  check('帧扫描切出 2 帧', scan.frames.length === 2, String(scan.frames.length))
  check('整文件单次解压只拿到第一帧（AAA）', naive === 'AAA', naive)
  check('逐帧解压拿到全部（AAABBB）', frameWise === 'AAABBB', frameWise)
  check('无残缺帧', scan.tornStart === undefined, String(scan.tornStart))

  // 根目录不存在 → 空数组，不抛
  const missing = await readDshSessions(join(root, 'nope'))
  check('根目录不存在返回空数组', Array.isArray(missing) && missing.length === 0)

  if (process.env['DSH_REAL'] === '1') {
    console.log('\n真机只读体检：' + dshHome())
    const started = Date.now()
    const real = await readDshSessions(dshHome())
    const ms = Date.now() - started
    const withUsage = real.filter((s) => s.usage.total > 0)
    console.log(
      `  ${real.length} 场 · ${withUsage.length} 场有 usage · ${real.filter((s) => s.subagent).length} 场是子会话 · ${ms} ms`
    )
    check('真机扫描不抛错', true)
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n通过 ${pass} · 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
