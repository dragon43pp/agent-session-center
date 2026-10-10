// Build-time gate for the bundled UI themes in src/themes/*.json.
//
// resolveUiTheme() requires every UI_COLOR_TOKENS entry to be present; a theme
// missing even one token used to fall back to the emergency light palette at
// runtime while the Settings page kept advertising it by name — silently. 16 of
// the 18 bundled themes shipped missing exactly one token (bg.hover) this way.
// This script fails the build instead, so the registry and the JSONs can never
// drift apart again.
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Parse the token list straight out of the schema source, so this gate cannot
// be bypassed by adding a token to the schema without updating themes.
const schemaSource = await readFile(
  join(repositoryRoot, 'shared', 'theme-schema.ts'),
  'utf8'
)
const tokenBlock = schemaSource.match(/UI_COLOR_TOKENS = \[([\s\S]*?)\] as const/)
if (!tokenBlock) throw new Error('Cannot locate UI_COLOR_TOKENS in shared/theme-schema.ts')
const tokens = [...tokenBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
if (tokens.length === 0) throw new Error('UI_COLOR_TOKENS parsed as empty')

const tokenSet = new Set(tokens)
const hexColorPattern = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i
const functionColorPattern = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^;{}]+\)$/i
const isColorLiteral = (value) =>
  typeof value === 'string' &&
  (value.trim() === 'transparent' ||
    hexColorPattern.test(value.trim()) ||
    functionColorPattern.test(value.trim()))

const problems = []
const files = (await readdir(join(repositoryRoot, 'src/themes')))
  .filter((name) => name.endsWith('.json'))

for (const filename of files) {
  const path = join(repositoryRoot, 'src/themes', filename)
  let theme
  try {
    theme = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    problems.push(`${filename}: JSON 解析失败（${error.message}）`)
    continue
  }
  if (typeof theme.id !== 'string' || theme.id.length === 0) {
    problems.push(`${filename}: id 缺失`)
  } else if (!filename.startsWith(`${theme.id}.json`)) {
    problems.push(`${filename}: 文件名与 id "${theme.id}" 不一致`)
  }
  if (theme.type !== 'light' && theme.type !== 'dark') {
    problems.push(`${filename}: type 必须是 light 或 dark，实际是 ${JSON.stringify(theme.type)}`)
  }
  if (typeof theme.colors !== 'object' || theme.colors === null) {
    problems.push(`${filename}: colors 缺失`)
    continue
  }
  const missing = tokens.filter((token) => !(token in theme.colors))
  if (missing.length > 0) {
    problems.push(`${filename}: 缺少颜色 token：${missing.join(', ')}`)
  }
  for (const [token, color] of Object.entries(theme.colors)) {
    if (!tokenSet.has(token)) {
      problems.push(`${filename}: 未知颜色 token：${token}`)
    } else if (!isColorLiteral(color)) {
      problems.push(`${filename}: token ${token} 不是颜色字面量：${JSON.stringify(color)}`)
    }
  }
}

if (files.length < 18) {
  problems.push(`内置主题应有 18 份（light/dark + 16 套），只找到 ${files.length} 份`)
}

if (problems.length > 0) {
  console.error(`[assert-builtin-themes] ${problems.length} 处问题：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`[assert-builtin-themes] ${files.length} 份内置主题 × ${tokens.length} 个 token 全部齐备。`)
