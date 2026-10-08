/* Agent Session Center — interactive demo: the string table.
 *
 * Two languages, one key space. Everything the page says in prose lives here; the
 * machine-shaped text (status ids, event fields, capability levels, the log itself)
 * deliberately does not, because it is a quotation of what the product would print
 * rather than a sentence about it.
 *
 * Voice rules, borrowed from hub/docs/brand.md: no contractions, no exclamation marks,
 * and never a claim about the product that the source does not support.
 *
 * Initial language resolution order:
 *   1. ?lang=zh | ?lang=en
 *   2. localStorage
 *   3. <html data-default-lang>   ← patched per deploy by scripts/build-demo-site.cjs
 *   4. navigator.language
 */
;(function () {
  'use strict'

  var STORAGE_KEY = 'asc-demo-lang'
  var LANGUAGES = ['en', 'zh']

  var STRINGS = {
    /* ─────────────────────────── English ─────────────────────────── */
    en: {
      'doc.title': 'Agent Session Center — interactive demo',
      'doc.description':
        'An interactive, entirely fabricated demo of Agent Session Center: watch an agent event become a session status, and watch one session ask for you.',

      'badge.fake': 'Fabricated data',

      'hero.kicker': 'Interactive demo',
      'hero.title': 'Six sessions. One of them needs you.',
      'hero.lede':
        'Everything on this page is invented — the sessions, the turn counts, the token counts, the timestamps. What is not invented is the mechanism: press play and watch a single agent event travel through the four stages that turn it into a status, and watch one session begin asking for you.',
      'hero.note':
        'Coral means one thing only: this session is blocked on your confirmation. It is the only colour in the product that glows.',

      'sim.title': 'The pipeline, one step at a time',
      'sim.step': 'Step',
      'sim.sessions': 'Sessions',
      'sim.pipeline': 'Event pipeline',
      'sim.projection': 'Projection',
      'sim.tally': 'Every session, accounted for',
      'sim.log': 'Event log',
      'sim.logHint':
        'Every line is fabricated, but the shape is the real contract.',
      'sim.sourcesNote':
        'Six of the eight event sources the contract allows. The contract additionally has fixture, which exists only in tests, and the platform adds lifecycle for processes it started itself.',
      'sim.logEmpty': 'waiting for the first event',

      'stage.normalizer': 'native protocol → AgentEvent',
      'stage.queue': 'ordered by seq, never by clock',
      'stage.reducer': 'correlates tools, approvals, input',
      'stage.projector': 'six states, confidence, capabilities',

      'ctl.play': 'Play',
      'ctl.pause': 'Pause',
      'ctl.step': 'Step',
      'ctl.reset': 'Reset',
      'ctl.atStart': 'Ready. Press play, or step through it one stage at a time.',
      'ctl.atEnd':
        'One event became a status, and one session is now blocked on you. The session in the terminal never noticed.',

      'legend.title': 'Six states, one of them glows',
      'legend.lede':
        'The status vocabulary is exactly these six values, and they are a projection of events rather than a reading of the terminal. When the observer cannot be sure, it says so with a confidence flag instead of inventing a seventh state.',
      'legend.working.body': 'Streaming output. Nothing for you to do.',
      'legend.needs-you.body':
        'Blocked on your confirmation. This is the one that finds you.',
      'legend.done.body': 'Finished. Collect the result.',
      'legend.error.body': 'Failed. Needs a human.',
      'legend.idle.body': 'Alive, nothing happening right now.',
      'legend.exited.body': 'Process gone. Still recoverable from history.',
      'legend.note':
        'Exited is deliberately not an error: a process that ended cleanly is a different fact from one that failed, and the difference is what tells you whether to intervene.',

      'caps.title': 'What each agent can actually report',
      'caps.lede':
        'Harnesses are not equally observable. Every level below is declared in the source — electron/agents/adapters/*/types.ts for the six harnesses, and electron/dsh-host/DshProjectionBridge.ts for DeepSeek Harness — rather than invented for this page.',
      'caps.note':
        'Read the right-hand columns first, because that is where the sources separate: OpenCode goes furthest overall and is the only one that reports message summaries, and Pi is the only one that reports tokens and context rather than a single number. Read the left-hand columns to see what everybody gets — a thinking phase and a tool lifecycle, everywhere. Antigravity and WorkBuddy have no live path at all; they appear in session history only.',
      'caps.headNote':
        'Bar length is how deep that dimension goes. A full bar means this harness reaches the top level for that column.',
      'caps.col.harness': 'harness',
      'caps.gloss.harness': 'the observer that declares the row',
      'caps.col.thinking': 'thinking',
      'caps.col.tools': 'tools',
      'caps.col.approvals': 'approvals',
      'caps.col.inputRequests': 'inputRequests',
      'caps.col.usage': 'usage',
      'caps.col.messages': 'messages',
      'caps.gloss.thinking': 'how much of the reasoning phase is visible',
      'caps.gloss.tools': 'whether tool calls are counted or just started',
      'caps.gloss.approvals': 'structured approval prompts',
      'caps.gloss.inputRequests': 'structured questions back to you',
      'caps.gloss.usage': 'tokens, context window, or neither',
      'caps.gloss.messages': 'assistant message summaries',

      'truth.title': 'What is real here, and what is not',
      'truth.realLabel': 'Real:',
      'truth.real':
        'the four pipeline stages, the six states, the event fields in the log (<span class="mono">seq</span>, <span class="mono">nativeId</span>, <span class="mono">observerHealth</span>, <span class="mono">statusConfidence</span>), the capability levels, and the degradation behaviour when an observer dies.',
      'truth.fakeLabel': 'Fabricated:',
      'truth.fake':
        'every session name, turn count, timestamp, token count and cost. Nothing on this page contacted a CLI, there is no backend, and no file was read.',
      'truth.noneLabel': 'Not shown:',
      'truth.none':
        'the terminal itself. In the real application the CLI keeps its native TUI in the main pane — the whole point is that ASC never parses those bytes.',

      'try.title': 'Try it for real',
      'try.lede':
        'This page is a demonstration, not the application. The desktop app is an unsigned download for Windows, Linux and macOS, and this repository is where it is built.',
      'try.download': 'Download the latest release',
      'try.repo': 'Read the source',

      'foot.line':
        'Agent Session Center · Apache-2.0 · this demo is a static page with no network calls.',

      /* One sentence per step. These are the narration, not the log. */
      'n.1':
        'Raw protocol in, a typed AgentEvent out. The normalizer is the only place in the system that knows what "PreToolUse" means.',
      'n.2':
        'The queue orders by seq and drops anything it has already seen — hooks replay, and an RPC reconnect delivers twice.',
      'n.3':
        'The reducer keeps a per-session set of facts: parallel tools, pending approvals, the idle override. It still refuses to name a status.',
      'n.4':
        'Now the facts become a status, for every session at once. Note grok-build: its observer went quiet, so the status is reported at low confidence rather than guessed.',
      'n.5':
        'A second event, arriving over a different channel. Same four stages, no special case.',
      'n.6':
        'Ordered again. The timestamp on this one is older than the one before it, and that changes nothing.',
      'n.7':
        'The reducer pairs the request with the turn that is waiting on it. One session now has an unresolved approval.',
      'n.8':
        'The projector promotes that session to needs-you. Coral, and the only glow on the page — because being blocked on a human is the one thing worth interrupting you for.'
    },

    /* ─────────────────────────── 简体中文 ─────────────────────────── */
    zh: {
      'doc.title': 'Agent Session Center —— 交互式演示',
      'doc.description':
        'Agent Session Center 的交互式演示：所有内容均为虚构。看一条 agent 事件如何变成一个会话状态，以及某个会话如何开始找你。',

      'badge.fake': '全部为假数据',

      'hero.kicker': '交互式演示',
      'hero.title': '六个会话，其中一个在等你。',
      'hero.lede':
        '这一页上的东西全是编的 —— 会话、轮次、token 数、时间戳。没有编的是机制：点播放，看一条 agent 事件穿过四个阶段变成一个状态，并看着某个会话开始找你。',
      'hero.note':
        '珊瑚色只代表一件事：这个会话卡在等你确认。它是整个产品里唯一会发光的颜色。',

      'sim.title': '流水线，一步一步走',
      'sim.step': '进度',
      'sim.sessions': '会话',
      'sim.pipeline': '事件流水线',
      'sim.projection': '投影',
      'sim.tally': '每个会话都被算到',
      'sim.log': '事件日志',
      'sim.logHint': '每一行都是编的，但字段形状是真实的契约。',
      'sim.sourcesNote':
        '契约允许八种事件源，这里画了六种。另外两种是 fixture（只存在于测试里）和平台自己补的 lifecycle。',
      'sim.logEmpty': '等待第一条事件',

      'stage.normalizer': '原生协议 → AgentEvent',
      'stage.queue': '只按 seq 排序，不认时钟',
      'stage.reducer': '关联工具、审批、输入',
      'stage.projector': '六个状态、置信度、能力',

      'ctl.play': '播放',
      'ctl.pause': '暂停',
      'ctl.step': '单步',
      'ctl.reset': '重置',
      'ctl.atStart': '就绪。点播放，或者一次只走一个阶段。',
      'ctl.atEnd':
        '一条事件变成了一个状态，而有一个会话现在卡在等你。终端里的那个会话对这一切毫无察觉。',

      'legend.title': '六个状态，只有一颗灯是亮的',
      'legend.lede':
        '状态词汇恰好就是这六个值，而且它们是事件的投影，不是对终端屏幕的读图。观测者拿不准的时候会标记置信度，而不是编出第七个状态。',
      'legend.working.body': '正在输出。没你什么事。',
      'legend.needs-you.body': '卡在等你确认。会主动找到你的那一个。',
      'legend.done.body': '跑完了，可以收结果。',
      'legend.error.body': '炸了，需要人介入。',
      'legend.idle.body': '活着，但此刻没动静。',
      'legend.exited.body': '进程退了。历史里还能捞回来。',
      'legend.note':
        'exited 故意不等同于 error：干净退出与失败退出是两个不同的事实，而正是这个差别在告诉你该不该介入。',

      'caps.title': '每个 agent 实际上能汇报什么',
      'caps.lede':
        '各家 harness 的可见度并不相同。下面每一档都是在源码里声明的 —— 六个 harness 看 electron/agents/adapters/*/types.ts，DeepSeek Harness 看 electron/dsh-host/DshProjectionBridge.ts —— 不是为这一页编的。',
      'caps.note':
        '先看右边的列，差别都在那儿：OpenCode 整体走得最远，而且是唯一会汇报消息摘要的；Pi 是唯一同时报 token 和上下文的，不是只给一个数。再看左边的列，那是所有人都有的 —— 思考阶段和工具生命周期，一个不落。Antigravity 和 WorkBuddy 完全没有实时通道，只出现在会话历史里。',
      'caps.headNote': '条长表示这个维度能探到多深。满格意味着该 harness 在这一列达到了最高档。',
      'caps.col.harness': 'harness',
      'caps.gloss.harness': '声明这一行的观测方',
      'caps.col.thinking': 'thinking',
      'caps.col.tools': 'tools',
      'caps.col.approvals': 'approvals',
      'caps.col.inputRequests': 'inputRequests',
      'caps.col.usage': 'usage',
      'caps.col.messages': 'messages',
      'caps.gloss.thinking': '思考阶段能看到多少',
      'caps.gloss.tools': '工具调用是只报开始，还是报进度',
      'caps.gloss.approvals': '是否有结构化的审批请求',
      'caps.gloss.inputRequests': '是否有结构化的问题回给你',
      'caps.gloss.usage': 'token、上下文窗口，或两者都没有',
      'caps.gloss.messages': '助手消息摘要',

      'truth.title': '这一页里哪些是真的，哪些不是',
      'truth.realLabel': '真的：',
      'truth.real':
        '四个流水线阶段、六个状态、日志里的那些事件字段（<span class="mono">seq</span>、<span class="mono">nativeId</span>、<span class="mono">observerHealth</span>、<span class="mono">statusConfidence</span>）、能力档位，以及观测者死亡时的降级行为。',
      'truth.fakeLabel': '编的：',
      'truth.fake':
        '每一个会话名、轮次、时间戳、token 数和费用。这一页没有接触任何 CLI，没有后端，也没有读过任何文件。',
      'truth.noneLabel': '没有展示：',
      'truth.none':
        '终端本身。在真实应用里，CLI 的主面板跑的是它自己的原生 TUI —— 重点就在于 ASC 从不解析那些字节。',

      'try.title': '去用真家伙',
      'try.lede':
        '这一页是演示，不是应用。桌面版是 Windows、Linux、macOS 的未签名下载包，而这个仓库就是它被构建出来的地方。',
      'try.download': '下载最新版本',
      'try.repo': '看源码',

      'foot.line':
        'Agent Session Center · Apache-2.0 · 本演示是一个静态页面，不发起任何网络请求。',

      'n.1':
        '原生协议进，带类型的 AgentEvent 出。normalizer 是整个系统里唯一知道 "PreToolUse" 是什么意思的地方。',
      'n.2':
        '队列按 seq 排序，并丢掉已经见过的那些 —— hook 会重放，RPC 重连会重复投递。',
      'n.3':
        'reducer 为每个会话维护一组事实：并行的工具、待处理的审批、idle 覆盖。它到这里仍然拒绝给出状态。',
      'n.4':
        '现在事实变成状态了，而且是所有会话一起。注意 grok-build：它的观测者失联了，所以状态以低置信度上报，而不是猜一个。',
      'n.5':
        '第二条事件，走的是另一条通道。同样四个阶段，没有特例。',
      'n.6':
        '再次排队。这一条的时间戳比上一条还早，而这没有改变任何事。',
      'n.7':
        'reducer 把这个请求和正在等它的那一轮配上了。现在有一个会话带着未解决的审批。',
      'n.8':
        'projector 把这个会话提升为 needs-you。珊瑚色，也是整页唯一的光晕 —— 因为「卡在等人」是唯一值得打断你的事。'
    }
  }

  var current = 'en'

  function isLanguage(value) {
    return LANGUAGES.indexOf(value) !== -1
  }

  function fromQuery() {
    try {
      var match = /[?&]lang=([A-Za-z-]+)/.exec(window.location.search)
      if (!match) return null
      var value = match[1].toLowerCase()
      if (value.indexOf('zh') === 0 || value === 'cn') return 'zh'
      if (value.indexOf('en') === 0) return 'en'
    } catch (error) {
      /* A blocked cookie jar or a sandboxed iframe is not a reason to stop. */
    }
    return null
  }

  function fromStorage() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY)
      return isLanguage(value) ? value : null
    } catch (error) {
      return null
    }
  }

  function fromDocument() {
    var value = document.documentElement.getAttribute('data-default-lang')
    return isLanguage(value) ? value : null
  }

  function fromNavigator() {
    var value = (navigator.language || '').toLowerCase()
    return value.indexOf('zh') === 0 ? 'zh' : 'en'
  }

  function resolve() {
    return fromQuery() || fromStorage() || fromDocument() || fromNavigator()
  }

  var listeners = []

  function t(key, language) {
    var pack = STRINGS[language || current] || STRINGS.en
    if (Object.prototype.hasOwnProperty.call(pack, key)) return pack[key]
    if (Object.prototype.hasOwnProperty.call(STRINGS.en, key)) return STRINGS.en[key]
    return key
  }

  function apply(language) {
    current = isLanguage(language) ? language : 'en'

    var pack = STRINGS[current]
    document.documentElement.setAttribute('lang', current === 'zh' ? 'zh-CN' : 'en')
    document.title = t('doc.title')

    var description = document.querySelector('meta[name="description"]')
    if (description) description.setAttribute('content', t('doc.description'))

    var nodes = document.querySelectorAll('[data-i18n]')
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index]
      var key = node.getAttribute('data-i18n')
      if (!Object.prototype.hasOwnProperty.call(pack, key) &&
          !Object.prototype.hasOwnProperty.call(STRINGS.en, key)) {
        continue
      }
      /* The table is authored, ships with the page, and two entries carry inline
         markup on purpose, so this is innerHTML and not textContent. */
      node.innerHTML = t(key)
    }

    var buttons = document.querySelectorAll('.lang-btn')
    for (var index2 = 0; index2 < buttons.length; index2 += 1) {
      var button = buttons[index2]
      button.setAttribute(
        'aria-pressed',
        button.getAttribute('data-lang') === current ? 'true' : 'false'
      )
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, current)
    } catch (error) {
      /* Private mode. The language still applies for this page view. */
    }

    for (var index3 = 0; index3 < listeners.length; index3 += 1) {
      listeners[index3](current)
    }
  }

  window.ASCDemo = window.ASCDemo || {}
  window.ASCDemo.i18n = {
    LANGUAGES: LANGUAGES,
    strings: STRINGS,
    t: t,
    apply: apply,
    get language() {
      return current
    },
    resolve: resolve,
    onChange: function (listener) {
      listeners.push(listener)
    }
  }
})()
