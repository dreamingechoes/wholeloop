// Renders the README diagrams to SVG, because npm shows a package README without running Mermaid.
// Each SVG records the digest of its source, so `npm run check` can find one left stale without a
// browser; rendering needs one, so it runs only when a diagram changes:
//   npm run docs:diagrams        (uses CHROME_PATH, or Google Chrome or Chromium where installed)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const DIAGRAMS = 'docs/assets/diagrams'
// The same Mermaid major the parse check uses, published at least fourteen days before it was
// chosen; --before applies the same cooldown to the tool's own dependencies (ADR-0019).
const CLI = '@mermaid-js/mermaid-cli@12.2.0'
const BEFORE = '2026-11-03T00:00:00Z'

export const sourceDigest = (text) => createHash('sha256').update(text).digest('hex')
export const stamp = (name, digest) =>
  `<!-- Generated from ${name}.mmd by npm run docs:diagrams; source sha256 ${digest} -->`

function chrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const found = candidates.find((path) => path && existsSync(path))
  if (!found) throw new Error('Set CHROME_PATH to a Chrome or Chromium executable')
  return found
}

function render() {
  const work = mkdtempSync(join(tmpdir(), 'wholeloop-diagrams-'))
  try {
    const config = join(work, 'puppeteer.json')
    writeFileSync(config, JSON.stringify({ executablePath: chrome() }))
    // Plain SVG text instead of HTML in <foreignObject>: an SVG shown through <img>, as GitHub
    // and npm show README images, does not render HTML labels everywhere.
    const settings = join(work, 'mermaid.json')
    // A font every viewer has keeps the text the width Chrome measured when it laid out the boxes.
    const font = 'arial, helvetica, sans-serif'
    writeFileSync(
      settings,
      JSON.stringify({
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        fontFamily: font,
        themeVariables: { fontFamily: font },
      }),
    )
    for (const file of readdirSync(DIAGRAMS)
      .filter((entry) => entry.endsWith('.mmd'))
      .sort()) {
      const name = file.slice(0, -4)
      const digest = sourceDigest(readFileSync(join(DIAGRAMS, file), 'utf8'))
      // One light render on a white background reads on GitHub's light and dark themes and on npm;
      // a dark render made the light subgraph fills unreadable, and npm shows only one image.
      const output = join(DIAGRAMS, `${name}.svg`)
      execFileSync(
        'npm',
        [
          'exec',
          '--yes',
          `--before=${BEFORE}`,
          `--package=${CLI}`,
          '--',
          'mmdc',
          '--input',
          join(DIAGRAMS, file),
          '--output',
          output,
          '--theme',
          'default',
          '--backgroundColor',
          'white',
          '--puppeteerConfigFile',
          config,
          '--configFile',
          settings,
        ],
        { stdio: 'inherit', env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' } },
      )
      writeFileSync(output, `${stamp(name, digest)}\n${readFileSync(output, 'utf8')}`)
      console.log(`rendered ${output}`)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) render()
