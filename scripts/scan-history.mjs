// Pre-publication secret scan of the complete Git history (P7-06).
//   npm run scan:history
// gitleaks runs in Docker from a digest-pinned image, with no network and the
// repository mounted read-only, so the scan adds no project dependency and
// cannot change the repository. The report is redacted by gitleaks and this
// script prints only rule, file, commit and line: never a secret or its match.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GITLEAKS_IMAGE =
  'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f' // v8.30.1

/** The fields a reviewer needs to resolve a finding, and nothing that could carry the secret. */
export function summarize(findings) {
  return findings.map((finding) => ({
    rule: finding.RuleID,
    file: finding.File,
    commit: finding.Commit,
    line: finding.StartLine,
  }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const output = mkdtempSync(join(tmpdir(), 'wholeloop-history-scan-'))
  try {
    const scan = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '-e',
        'GIT_CONFIG_COUNT=1',
        '-e',
        'GIT_CONFIG_KEY_0=safe.directory',
        '-e',
        'GIT_CONFIG_VALUE_0=/repo',
        '-v',
        `${root}:/repo:ro`,
        '-v',
        `${output}:/out`,
        GITLEAKS_IMAGE,
        'git',
        '/repo',
        // The published history: other local refs, such as rewrite backups, never become public.
        '--log-opts',
        'main',
        // Reviewed false positives, by fingerprint; see the file for each reason.
        '--gitleaks-ignore-path',
        '/repo/.gitleaksignore',
        '--redact',
        '--no-banner',
        '--log-level',
        'warn',
        '--report-format',
        'json',
        '--report-path',
        '/out/report.json',
      ],
      { encoding: 'utf8' },
    )
    // gitleaks exits 1 when it finds leaks and other codes when it cannot scan.
    if (scan.status !== 0 && scan.status !== 1) {
      console.error(`scan: gitleaks could not complete (exit ${scan.status}); is Docker running?`)
      process.exitCode = 2
    } else {
      const findings = summarize(JSON.parse(readFileSync(join(output, 'report.json'), 'utf8')))
      const commits = spawnSync('git', ['rev-list', '--count', 'main'], {
        cwd: root,
        encoding: 'utf8',
      })
      for (const finding of findings) console.log(JSON.stringify(finding))
      console.log(
        `scan: ${findings.length} finding(s) across ${commits.stdout.trim()} commits with ${GITLEAKS_IMAGE.split('@')[0]} v8.30.1`,
      )
      process.exitCode = findings.length ? 1 : 0
    }
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}
