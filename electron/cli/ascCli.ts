import { createConnection, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  BridgeRequest,
  BridgeSocketMessage,
  BridgeWatchEvent
} from '../../shared/bridge-protocol'
import { BridgeError } from '../bridge/errors'
import { bridgeSocketPath, readBridgeTokenFile } from '../bridge/paths'
import {
  cliUsage,
  extractAscCliArgv,
  isAscCliInvocation,
  parseAscCli
} from './parseAscCli'

export { extractAscCliArgv, isAscCliInvocation, parseAscCli, cliUsage }

export interface AscCliIo {
  stdout: { write(chunk: string): void }
  stderr: { write(chunk: string): void }
  connect?: (path: string) => Promise<Socket>
  token?: string
  socketPath?: string
  userDataDir?: string
}

const ASC_NOT_RUNNING =
  'Agent Session Center is not running. Open Agent Session Center first, then retry this command.'

function defaultUserDataCandidates(): string[] {
  if (process.env.ASC_USER_DATA_DIR) return [process.env.ASC_USER_DATA_DIR]
  const appData =
    process.env.APPDATA ||
    process.env.XDG_CONFIG_HOME ||
    join(homedir(), process.platform === 'darwin' ? 'Library/Application Support' : '.config')
  // 目录名与正式产品名保持一致；旧品牌名的目录已由 main.ts 迁移到这里。
  return [
    join(appData, 'Agent Session Center Dev'),
    join(appData, 'Agent Session Center')
  ]
}

async function resolveToken(io: AscCliIo): Promise<string> {
  if (io.token) return io.token
  if (process.env.ASC_BRIDGE_TOKEN) return process.env.ASC_BRIDGE_TOKEN
  const dirs = io.userDataDir ? [io.userDataDir] : defaultUserDataCandidates()
  for (const dir of dirs) {
    const token = await readBridgeTokenFile(dir)
    if (token) return token
  }
  throw BridgeError.disconnected(ASC_NOT_RUNNING)
}

function connectSocket(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    const onError = (error: Error): void => {
      socket.off('connect', onConnect)
      reject(error)
    }
    const onConnect = (): void => {
      socket.off('error', onError)
      resolve(socket)
    }
    socket.once('error', onError)
    socket.once('connect', onConnect)
  })
}

async function openBridge(io: AscCliIo): Promise<{ socket: Socket; token: string }> {
  const token = await resolveToken(io)
  const path = io.socketPath ?? process.env.ASC_BRIDGE_SOCKET ?? bridgeSocketPath()
  try {
    const socket = await (io.connect ? io.connect(path) : connectSocket(path))
    socket.setEncoding('utf8')
    return { socket, token }
  } catch {
    throw BridgeError.disconnected(ASC_NOT_RUNNING)
  }
}

function readMessages(
  socket: Socket
): AsyncGenerator<BridgeSocketMessage> {
  let buffer = ''
  const queue: BridgeSocketMessage[] = []
  let notify: (() => void) | null = null
  let done = false
  let failure: Error | null = null

  const push = (message: BridgeSocketMessage): void => {
    queue.push(message)
    notify?.()
  }

  socket.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) {
        try {
          push(JSON.parse(line) as BridgeSocketMessage)
        } catch {
          failure = new BridgeError('invalid', 'Invalid response from Agent Session Center')
          notify?.()
          return
        }
      }
      newline = buffer.indexOf('\n')
    }
  })
  socket.on('close', () => {
    done = true
    notify?.()
  })
  socket.on('error', (error) => {
    failure = error
    done = true
    notify?.()
  })

  return (async function* () {
    while (true) {
      if (failure) throw failure
      if (queue.length > 0) {
        yield queue.shift() as BridgeSocketMessage
        continue
      }
      if (done) return
      await new Promise<void>((resolve) => {
        notify = resolve
      })
      notify = null
    }
  })()
}

function printJson(io: AscCliIo, value: unknown): void {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export async function runAscCli(
  argv: readonly string[],
  io: AscCliIo
): Promise<number> {
  const extracted =
    extractAscCliArgv(argv) ?? extractAscCliArgv(['node', ...argv])
  if (!extracted) {
    io.stderr.write(`${cliUsage()}\n`)
    return 1
  }
  let parsed
  try {
    parsed = parseAscCli(extracted)
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
  if (parsed.kind === 'help') {
    io.stdout.write(`${cliUsage()}\n`)
    return 0
  }

  let socket: Socket
  let token: string
  try {
    const opened = await openBridge(io)
    socket = opened.socket
    token = opened.token
  } catch (error) {
    const bridged =
      error instanceof BridgeError
        ? error
        : BridgeError.disconnected(ASC_NOT_RUNNING)
    io.stderr.write(`${bridged.message}\n`)
    return bridged.exitCode
  }

  const request: BridgeRequest = {
    id: `cli-${Date.now()}`,
    token,
    method: parsed.method,
    params: parsed.params
  }
  socket.write(`${JSON.stringify(request)}\n`)

  const interrupt = (): void => {
    socket.destroy()
    io.stderr.write('\n')
    process.exitCode = 130
  }
  if (parsed.watch) {
    process.once('SIGINT', interrupt)
  }

  try {
    const messages = readMessages(socket)
    let watching = Boolean(parsed.watch)
    for await (const message of messages) {
      if (message.kind === 'result') {
        if (!message.ok) {
          printJson(io, { error: message.error })
          socket.destroy()
          return message.error.code === 'unauthorized' ? 2 : 1
        }
        if (!watching) {
          printJson(io, message.result)
          socket.end()
          return process.exitCode === 130 ? 130 : 0
        }
        continue
      }
      if (message.kind === 'event') {
        io.stdout.write(`${JSON.stringify(message.event)}\n`)
        if ((message.event as BridgeWatchEvent).type === 'exited') {
          socket.end()
          return process.exitCode === 130 ? 130 : 0
        }
      }
    }
    if (watching) return process.exitCode === 130 ? 130 : 0
    io.stderr.write('Agent Session Center closed the bridge connection\n')
    return 2
  } catch (error) {
    if (process.exitCode === 130) return 130
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    socket.destroy()
    return 1
  } finally {
    if (parsed.watch) process.off('SIGINT', interrupt)
  }
}
