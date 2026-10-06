const { _electron: electron } = require('@playwright/test')
const { existsSync, mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

/**
 * A packaged Electron app must never inherit Electron/Node bootstrap overrides
 * from whatever shell starts the release. With ELECTRON_RUN_AS_NODE set, the
 * binary boots as a plain Node process, dies on Electron-only flags such as
 * --remote-debugging-port, and Playwright only reports the opaque
 * "Process failed to launch!". Strip both so this gate tests the app rather
 * than the caller's environment.
 */
function launchEnvironment() {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.NODE_OPTIONS
  return environment
}

async function main() {
  const executablePath = resolve(process.argv[2] ?? '')
  if (!existsSync(executablePath)) {
    throw new Error(`Packaged executable was not found: ${executablePath}`)
  }

  const app = await electron.launch({
    executablePath,
    env: {
      ...launchEnvironment(),
      ASC_E2E: '1',
      ASC_USER_DATA_DIR: mkdtempSync(join(tmpdir(), 'asc-release-tray-'))
    }
  })
  try {
    await app.firstWindow({ timeout: 30_000 })
    const result = await app.evaluate(({ nativeImage }) => {
      const separator = process.platform === 'win32' ? '\\' : '/'
      const iconPath = [process.resourcesPath, 'tray', 'asc-16.png'].join(
        separator
      )
      const image = nativeImage.createFromPath(iconPath)
      const debug = globalThis.__ascMainDebug
      return {
        iconPath,
        iconEmpty: image.isEmpty(),
        iconSize: image.getSize(),
        trayCreated: debug?.hasTray() ?? false
      }
    })
    if (
      result.iconEmpty ||
      !result.trayCreated ||
      result.iconSize.width !== 16 ||
      result.iconSize.height !== 16
    ) {
      throw new Error(`Packaged tray verification failed: ${JSON.stringify(result)}`)
    }
    process.stdout.write(`Packaged tray verified: ${JSON.stringify(result)}\n`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
