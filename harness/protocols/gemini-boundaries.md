# Gemini execution boundaries

- ⛔ `gemini-observer-tools` — local observer agents have explicit read tools and
  declared web reads, with no shell, write, memory, wildcard MCP or delegation
  tool. The main session supplies observed command/provider evidence. Inherit the
  selected model; retain canonical tier hints without inventing model names.
- ⛔ `gemini-explicit-fallback` — retain the per-repository Git fallback for loose
  overlays. Native extension trust/enablement stays explicit; never rewrite shared
  settings or infer activation from file installation or static loaders.
- ⛔ `gemini-safe-hook-root` — hydrate extensionPath only into the native hook's
  environment value, never executable shell text. Verify the exact target/core
  before guard execution; missing or changed context denies without raw payloads.

Subagents cannot nest delegation. Return additional role work to the main session
for sequential handoff. If a structured question tool is unavailable, return the
exact plain-text options and wait; never infer an answer or approval.
