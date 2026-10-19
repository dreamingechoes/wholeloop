import { execFileSync } from 'node:child_process'

execFileSync(
  process.execPath,
  [
    'dist/wl.mjs',
    'docs',
    'reference',
    '--kind',
    'config',
    ...(process.argv.includes('--check') ? [] : ['--write']),
  ],
  { stdio: 'inherit' },
)
