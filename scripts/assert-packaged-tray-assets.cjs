const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

const REQUIRED_TRAY_ASSETS = [
  'asc-16.png',
  'asc-32.png',
  'asc-256.png',
  'asc-white-16.png',
  'asc-white-32.png',
  'asc-white-256.png',
  'ascTemplate-16.png',
  'ascTemplate-32.png',
  'asc.ico',
  'asc-white.ico',
  'asc-app-16.png',
  'asc-app-32.png',
  'asc-app.ico'
]

function packagedResourcesDir(context) {
  if (context.electronPlatformName !== 'darwin') {
    return join(context.appOutDir, 'resources')
  }
  const appBundle = readdirSync(context.appOutDir).find((name) =>
    name.endsWith('.app')
  )
  if (!appBundle) throw new Error('Packaged macOS app bundle was not found')
  return join(context.appOutDir, appBundle, 'Contents', 'Resources')
}

exports.default = async function assertPackagedTrayAssets(context) {
  const trayDir = join(packagedResourcesDir(context), 'tray')
  const missing = REQUIRED_TRAY_ASSETS.filter(
    (filename) => !existsSync(join(trayDir, filename))
  )
  if (missing.length > 0) {
    throw new Error(`Packaged tray assets are missing: ${missing.join(', ')}`)
  }
}
