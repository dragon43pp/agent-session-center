import { join } from 'node:path'
import type { DshHomeMode } from '../shared/dsh-ipc'

export function resolveAppUserDataDir(
  appDataDir: string,
  isPackaged: boolean
): string {
  // userData 目录名必须与正式产品名保持一致；一旦改动这里，务必同步更新
  // main.ts 里的 migrateLegacyUserDataDir（旧目录的整体迁移逻辑在那边）。
  return join(
    appDataDir,
    isPackaged ? 'Agent Session Center' : 'Agent Session Center Dev'
  )
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
    : `${root}/.local/share/asc/dsh-home`
}
