#!/usr/bin/env node
/**
 * Build the two deployable roots for the interactive demo.
 *
 * `docs/site/` is one page with one string table for both languages, which is the right
 * shape for authoring and the wrong shape for serving: the English site should land in
 * English for someone who has never visited, and the Chinese site should land in Chinese,
 * with neither depending on localStorage or on the browser's locale.
 *
 * So this script emits two complete static roots from the single source, differing only in
 * the four head fields that decide the initial language. No path rewriting is involved,
 * because each root has `index.html` at its own top level.
 *
 *   dist/demo-site/en/   → point the English vhost here
 *   dist/demo-site/zh/   → point the Chinese vhost here
 *
 * Both roots are fully self-contained: three assets, one stylesheet, no build step, no
 * network calls. A plain `rsync` is the entire deployment.
 *
 * Optional environment variables, used only to emit `<link rel="alternate" hreflang>`
 * so the two sites advertise each other to crawlers. Omit them and the tags are left out
 * rather than guessed:
 *
 *   ASC_DEMO_EN_URL   e.g. https://asc.example.com/
 *   ASC_DEMO_ZH_URL   e.g. https://asc-cn.example.com/
 *
 * Usage:
 *   node scripts/build-demo-site.cjs [--out dist/demo-site]
 */

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'docs', 'site')
const LOCALES = [
  { dir: 'en', lang: 'en', attr: 'en' },
  { dir: 'zh', lang: 'zh', attr: 'zh-CN' }
]

function parseArgs(argv) {
  let out = path.join(ROOT, 'dist', 'demo-site')
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      out = path.resolve(argv[index + 1] || '')
      index += 1
    } else if (argv[index].startsWith('--out=')) {
      out = path.resolve(argv[index].slice('--out='.length))
    } else {
      throw new Error('unknown argument: ' + argv[index])
    }
  }
  if (!out || out === path.parse(out).root) throw new Error('refusing to write to a drive root')
  return { out }
}

/* Read the string table by executing i18n.js, rather than by re-typing the title here.
   A build that paraphrases the page it is building drifts away from it. */
function loadStrings() {
  const source = fs.readFileSync(path.join(SOURCE, 'assets', 'i18n.js'), 'utf8')
  const sandbox = { window: { location: { search: '' } }, navigator: { language: 'en' } }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  const strings = sandbox.window.ASCDemo && sandbox.window.ASCDemo.i18n && sandbox.window.ASCDemo.i18n.strings
  if (!strings || !strings.en || !strings.zh) {
    throw new Error('assets/i18n.js did not expose both language packs')
  }
  return strings
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function buildHead(html, locale, strings) {
  const title = strings[locale.lang]['doc.title']
  const description = strings[locale.lang]['doc.description']
  if (!title || !description) {
    throw new Error('the ' + locale.lang + ' pack is missing doc.title or doc.description')
  }

  let out = html

  const htmlTag = /<html\b[^>]*>/
  if (!htmlTag.test(out)) throw new Error('no <html> tag to rewrite')
  out = out.replace(htmlTag, `<html lang="${locale.attr}" data-default-lang="${locale.lang}">`)

  const titleTag = /<title>[\s\S]*?<\/title>/
  if (!titleTag.test(out)) throw new Error('no <title> to rewrite')
  out = out.replace(titleTag, `<title>${escapeAttribute(title)}</title>`)

  const meta = /<meta name="description" content="[^"]*">/
  if (!meta.test(out)) throw new Error('no <meta name="description"> to rewrite')
  out = out.replace(meta, `<meta name="description" content="${escapeAttribute(description)}">`)

  /* hreflang only when both URLs are actually known. A half-filled alternate set is worse
     than none: it tells a crawler about a page that does not exist. */
  const en = process.env.ASC_DEMO_EN_URL
  const zh = process.env.ASC_DEMO_ZH_URL
  if (en && zh) {
    const links = [
      `<link rel="alternate" hreflang="en" href="${escapeAttribute(en)}">`,
      `<link rel="alternate" hreflang="zh-Hans" href="${escapeAttribute(zh)}">`,
      `<link rel="alternate" hreflang="x-default" href="${escapeAttribute(en)}">`
    ].join('\n')
    out = out.replace('</head>', links + '\n</head>')
  }

  return out
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  let files = 0
  let bytes = 0
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) {
      const nested = copyTree(source, target)
      files += nested.files
      bytes += nested.bytes
      continue
    }
    fs.copyFileSync(source, target)
    files += 1
    bytes += fs.statSync(target).size
  }
  return { files, bytes }
}

function main() {
  const { out } = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(path.join(SOURCE, 'index.html'))) {
    throw new Error('docs/site/index.html is missing; nothing to build')
  }

  const strings = loadStrings()
  const html = fs.readFileSync(path.join(SOURCE, 'index.html'), 'utf8')
  const report = []

  for (const locale of LOCALES) {
    const target = path.join(out, locale.dir)
    fs.rmSync(target, { recursive: true, force: true })

    const copied = copyTree(SOURCE, target)
    const built = buildHead(html, locale, strings)
    if (built !== html) {
      fs.writeFileSync(path.join(target, 'index.html'), built, 'utf8')
    }
    report.push({
      locale,
      target,
      files: copied.files,
      bytes: copied.bytes,
      changed: built !== html
    })
  }

  console.log('built ' + path.relative(ROOT, out).replace(/\\/g, '/'))
  for (const entry of report) {
    console.log(
      '  ' + entry.locale.dir.padEnd(3) +
      String(entry.files).padStart(2) + ' files  ' +
      (entry.bytes / 1024).toFixed(1).padStart(6) + ' KB  ' +
      'head ' + (entry.changed ? 'rewritten to ' + entry.locale.attr : 'as authored') +
      '   ->  ' + entry.target.replace(/\\/g, '/')
    )
  }

  const en = process.env.ASC_DEMO_EN_URL || '<english host>'
  const zh = process.env.ASC_DEMO_ZH_URL || '<chinese host>'
  console.log(`
deploy with two vhosts over the same tree shape:

  # English site
  server {
    listen 443 ssl http2;
    server_name ${en.replace(/^https?:\/\//, '').replace(/\/$/, '')};
    root ${path.join(out, 'en').replace(/\\/g, '/')};
    index index.html;
    location / { try_files $uri $uri/ =404; }
  }

  # Chinese site
  server {
    listen 443 ssl http2;
    server_name ${zh.replace(/^https?:\/\//, '').replace(/\/$/, '')};
    root ${path.join(out, 'zh').replace(/\\/g, '/')};
    index index.html;
    location / { try_files $uri $uri/ =404; }
  }

Both roots are static and identical apart from their <head>, so a single
\`rsync -a --delete\` per host is the whole deployment. Nothing here has a backend,
a database, or an outbound request at runtime.`)
}

main()
