import type { HeadlessAdapter } from './adapters.js'

export const copilotWorker: HeadlessAdapter = {
  id: 'copilot',
  invocation: ({ repository }) => ({
    command: 'copilot',
    args: [
      '--add-dir',
      repository,
      '--silent',
      '--output-format',
      'text',
      '--available-tools=view,glob,grep',
      '--allow-tool=read',
      '--deny-tool=shell,write,url,memory',
      '--disable-builtin-mcps',
      '--no-ask-user',
      '--no-auto-update',
      '--no-custom-instructions',
      '--no-experimental',
      '--no-remote-export',
      '--disallow-temp-dir',
      '--log-level',
      'none',
    ],
    // Retain the native credential store, but never inherit an ambient bypass.
    env: { COPILOT_ALLOW_ALL: 'false', GITHUB_COPILOT_PROMPT_MODE_EXTENSIONS: 'false' },
  }),
  // Silent text avoids treating JSONL progress or tool content as a final answer.
  // The shared host still requires exactly one assignment-bound JSON envelope.
  response: (stdout) => stdout,
}
