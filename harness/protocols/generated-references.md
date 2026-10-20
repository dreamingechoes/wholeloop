# Generated reference ownership

- ⛔ `current-generated-references` — check command/config/provider/adapter tables against
  the built core. Missing pages and missing, reversed or duplicate marker pairs
  fail; an absent marker must not pass an empty comparison. Rebuild after source
  contract changes before comparing references.
- ⛔ `explicit-reference-writes` — checking is read-only. Regeneration requires
  --write, preflights every selected page/marker, preserves surrounding prose and
  skips unchanged output. Inspect interrupted pages before rerunning; preflight
  does not guarantee multi-file crash atomicity.

Declared provider rows describe registry metadata, not authenticated availability,
server semantics or native conformance. Adapter rows describe local rendering and engines, never native execution. Keep actual platform evidence separate.
