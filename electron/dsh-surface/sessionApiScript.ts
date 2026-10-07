/**
 * 注入官方 DSH 页面的「打开一场会话」脚本构造器。
 *
 * 为什么独立成模块：这段代码跑在 dsh 自己的页面上下文里，既不 import electron
 * 也不碰磁盘。判卷可以把它当纯字符串构造器，在 node:vm 里对着假的 sessions
 * 服务跑完整行为（tools/dsh_session_api_check.ts）。
 *
 * 为什么必须分版本：dsh 0.1.x 的 ISessions 有 open(id)，快照带 current；
 * 0.2.0 重构后 open 被删，改成 retain(target, options) 并明确「view selection
 * 归 view 自己管」，快照也不再带 current。两种形状都得能开；两代都没有时报
 * 一句能看懂的错，而不是把 `sessions.open is not a function` 甩到用户脸上，
 * 更不能因此把整个表面判成启动失败。
 */
export const OPEN_SESSION_SCRIPT_TIMEOUT_MS = 20_000

/** retain() 用的来源标记；官方服务把它算进 reference 的 retainInfo。 */
const RETAIN_SOURCE = 'asc-surface'

export function buildOpenSessionScript(
  sessionId: string,
  timeoutMs: number = OPEN_SESSION_SCRIPT_TIMEOUT_MS
): string {
  // sessionId 来自渲染进程。JSON.stringify 保证它只能是字符串字面量，
  // 引号、换行、反斜杠都不会逃出字面量去改写脚本结构。
  const target = JSON.stringify(sessionId)
  const settleBudget = Math.max(0, Math.trunc(timeoutMs))
  return `(async () => {
  const target = ${target};
  const deadline = Date.now() + ${settleBudget};
  const state = globalThis.__ASC_DSH_EMBED__;
  const sessions = state?.ctx?.get?.('sessions');
  if (!sessions) throw new Error('official DSH sessions service is unavailable');
  const legacyOpen = typeof sessions.open === 'function';
  const retain = typeof sessions.retain === 'function';
  if (!legacyOpen && !retain) {
    const shape = Object.keys(sessions)
      .filter((key) => typeof sessions[key] === 'function')
      .sort();
    throw new Error(
      'official DSH sessions service exposes neither open() nor retain(); ' +
      'client API generation mismatch. methods=' + (shape.join(',') || '(none)')
    );
  }
  while (Date.now() < deadline) {
    const snapshot = sessions.list?.getSnapshot?.() ?? {};
    if (snapshot.byId?.[target]) {
      if (legacyOpen) {
        sessions.open(target);
        while (Date.now() < deadline) {
          if (sessions.list.getSnapshot().current === target) return true;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(
          'DSH session did not become current: ' + target +
          ' (phase=' + String(sessions.list.getSnapshot().phase) + ')'
        );
      }
      const reference = sessions.retain(target, { source: '${RETAIN_SOURCE}' });
      if (reference && reference.ready) await reference.ready;
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const snapshot = sessions.list?.getSnapshot?.() ?? {};
  throw new Error(
    'DSH session is unavailable: ' + target +
    ' (phase=' + String(snapshot.phase) + ')'
  );
})()`
}
