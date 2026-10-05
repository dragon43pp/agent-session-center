export function centerIconBasename(
  platform: NodeJS.Platform,
  shouldUseDarkColors: boolean
): 'asc' | 'asc-white' | 'ascTemplate' {
  if (platform === 'darwin') return 'ascTemplate'
  return shouldUseDarkColors ? 'asc-white' : 'asc'
}

/** Packaged Windows taskbar uses the exe/shortcut ICO unless we point AppUserModel at this file. */
export function centerWindowsIconFile(): 'asc-app.ico' {
  return 'asc-app.ico'
}
