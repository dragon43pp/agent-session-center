/**
 * 判卷：注入脚本对着两代真实形状的 sessions 服务都能开，且两代都缺时报得清楚。
 *
 * 跑法（仓库根目录）：
 *   node node_modules/esbuild/bin/esbuild tools/dsh_session_api_check.ts --bundle \
 *     --platform=node --format=esm --outfile=tools/_dsh_session_api_check.mjs \
 *     && node tools/_dsh_session_api_check.mjs
 *
 * 形状取自真实类型定义，不是编的：
 *   - 0.1.x：ISessions.open(id) + 快照 current（DSH Desktop 2.0.13 内嵌 0.1.5-rc.2）
 *   - 0.2.x：ISessions.retain(target, options) + reference.ready，快照无 current
 */
import { runInNewContext } from 'node:vm'
import { buildOpenSessionScript } from '../electron/dsh-surface/sessionApiScript'

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

const SESSION_ID = 'e9c1f2a4-0b7d-4c11-9a3e-5d6f70819a22'

interface Snapshot {
  byId: Record<string, { id: string }>
  phase: string
  current?: string
}

/** 0.1.x：有 open()，open 后 current 会变成目标。 */
function legacyService(settles: boolean, ids: string[] = [SESSION_ID]) {
  const byId: Record<string, { id: string }> = {}
  for (const id of ids) byId[id] = { id }
  const state: { snapshot: Snapshot; opened: string[] } = {
    snapshot: { byId, phase: 'ready' },
    opened: []
  }
  const sessions = {
    list: {
      getSnapshot: () => state.snapshot,
      subscribe: () => () => undefined
    },
    open(id: string) {
      state.opened.push(id)
      if (settles) state.snapshot = { ...state.snapshot, current: id }
    }
  }
  return { sessions, state }
}

/** 0.2.x：只有 retain()，返回带 ready 的 reference；快照没有 current。 */
function modernService() {
  const calls: { target: string; options: unknown }[] = []
  const sessions = {
    list: {
      getSnapshot: (): Snapshot => ({
        byId: { [SESSION_ID]: { id: SESSION_ID } },
        phase: 'ready'
      }),
      subscribe: () => () => undefined
    },
    retain(target: string, options: unknown) {
      calls.push({ target, options })
      return { ready: Promise.resolve() }
    }
  }
  return { sessions, calls }
}

async function run(
  sessions: unknown,
  sessionId: string,
  timeoutMs = 500
): Promise<{ ok: boolean; message: string }> {
  const sandbox = {
    // 官方页面里 setTimeout 由 Chromium 提供；vm 沙箱得显式喂进去，
    // 否则被测逻辑的轮询分支会先死在 ReferenceError 上。
    setTimeout,
    clearTimeout,
    __ASC_DSH_EMBED__: { ctx: { get: (name: string) => (name === 'sessions' ? sessions : undefined) } }
  }
  const script = buildOpenSessionScript(sessionId, timeoutMs)
  try {
    await runInNewContext(script, sandbox)
    return { ok: true, message: '' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

console.log('0.1.x 形状（open + current）')
{
  const { sessions, state } = legacyService(true)
  const result = await run(sessions, SESSION_ID)
  check('open 后返回成功', result.ok, result.message)
  check('确实调了 open(目标 id)', state.opened.length === 1 && state.opened[0] === SESSION_ID)
}
{
  const { sessions, state } = legacyService(true)
  const result = await run(sessions, SESSION_ID)
  check('同一场重复打开不报错', result.ok, result.message)
  check('两次都调了 open', state.opened.length === 1)
}
{
  const { sessions } = legacyService(false)
  const result = await run(sessions, SESSION_ID, 60)
  check('open 了但 current 不落地 → 明确报错', !result.ok && result.message.includes('did not become current'), result.message)
}
{
  const { sessions } = legacyService(true)
  const result = await run(sessions, 'session-that-does-not-exist', 60)
  check('会话不在列表 → unavailable 且带 phase', !result.ok && result.message.includes('unavailable') && result.message.includes('phase=ready'), result.message)
}

console.log('\n0.2.x 形状（retain + reference.ready，无 current）')
{
  const { sessions, calls } = modernService()
  const result = await run(sessions, SESSION_ID)
  check('retain 路径返回成功（不再报 open 不是函数）', result.ok, result.message)
  check('调了 retain(目标 id, { source })', calls.length === 1 && calls[0]?.target === SESSION_ID && typeof calls[0]?.options === 'object')
}
{
  const calls: unknown[] = []
  const sessions = {
    list: { getSnapshot: (): Snapshot => ({ byId: { [SESSION_ID]: { id: SESSION_ID } }, phase: 'ready' }) },
    retain: (target: string, options: unknown) => {
      calls.push(options)
      return undefined
    }
  }
  const result = await run(sessions, SESSION_ID)
  check('retain 不返回 reference 也不炸', result.ok, result.message)
  check('retain 照样被调用', calls.length === 1)
}
{
  const sessions = {
    list: { getSnapshot: (): Snapshot => ({ byId: { [SESSION_ID]: { id: SESSION_ID } }, phase: 'ready' }) },
    retain: () => ({ ready: Promise.reject(new Error('host said no')) })
  }
  const result = await run(sessions, SESSION_ID)
  check('reference.ready 失败 → 错误透传', !result.ok && result.message.includes('host said no'), result.message)
}

console.log('\n两代都没有（不能甩 TypeError 给用户）')
{
  const sessions = { list: { getSnapshot: (): Snapshot => ({ byId: {}, phase: 'ready' }) }, create: () => undefined, refresh: () => undefined }
  const result = await run(sessions, SESSION_ID, 60)
  check('报「neither open() nor retain()」', !result.ok && result.message.includes('neither open() nor retain()'), result.message)
  check('错误里带可用方法清单', result.message.includes('create') && result.message.includes('refresh'), result.message)
  check('错误里没有 open is not a function', !result.message.includes('open is not a function'), result.message)
}
{
  const result = await run(undefined, SESSION_ID, 60)
  check('没有 sessions 服务 → unavailable', !result.ok && result.message.includes('sessions service is unavailable'), result.message)
}

console.log('\n注入安全与边界')
{
  const nasty = `a"; globalThis.__pwned = 1; //`
  const { sessions, state } = legacyService(true, [nasty])
  const result = await run(sessions, nasty)
  check('带引号的 id 不改写脚本结构', result.ok, result.message)
  check('id 原样传给 open', state.opened[0] === nasty)
}
{
  const { sessions, state } = legacyService(true, ['中文会话 🐳'])
  await run(sessions, '中文会话 🐳')
  check('非 ASCII id 原样传递', state.opened[0] === '中文会话 🐳')
}
{
  const { sessions } = legacyService(true)
  const result = await run(sessions, SESSION_ID, 0)
  check('超时 0ms → 走 unavailable 而不是挂死', !result.ok && result.message.includes('unavailable'), result.message)
}

console.log(`\n通过 ${pass} · 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
