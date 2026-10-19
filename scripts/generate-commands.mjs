import { execFileSync } from 'node:child_process'

execFileSync(
  process.execPath,
  [
    'dist/wl.mjs',
    'docs',
    'reference',
    '--kind',
    'commands',
    ...(process.argv.includes('--check') ? [] : ['--write']),
  ],
  { stdio: 'inherit' },
)
