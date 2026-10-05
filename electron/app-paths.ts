import { join } from 'node:path'
import type { DshHomeMode } from '../shared/dsh-ipc'

export function resolveAppUserDataDir(
  appDataDir: string,
  isPackaged: boolean
): string {
  // userData 目录名沿用历史产品名，避免迁移用户本地配置（飞书 token、LLM key）；如需改名必须附带迁移逻辑
  return join(appDataDir, isPackaged ? 'Grok Build Center' : 'Grok Build Center Dev')
}

export function resolveNativeDshHome(
  mode: DshHomeMode,
  userHome: string,
  isolatedHome: string
): string {
  return mode === 'shared' ? join(userHome, '.dsh') : isolatedHome
}

export function resolveWslDshHome(
  mode: DshHomeMode,
  userHome: string
): string {
  const root = userHome === '/' ? '' : userHome.replace(/\/+$/, '')
  return mode === 'shared'
    ? `${root}/.dsh`
    : `${root}/.local/share/gbc/dsh-home`
}
