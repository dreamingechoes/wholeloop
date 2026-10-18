# Repository docs

- This is intentional publication of documentation, never a runtime-state store.
- Resolve the requested Markdown path under the repository docs/ directory and reject symlink escapes.
- Ask for an explicit destination if none is known. Do not invent a tracked path.
- The host maps native.read-file/write-file to its own file tools; the core never runs arbitrary shell text.
- Create exclusively, without overwriting existing content. Update only through read-modify-write.
- Preserve front matter, navigation and unrelated sections; follow repository docs conventions.
- Normalize a full UTF-8 read to ref/body/revision (content digest for local concurrency checks).
- Verify the expected digest before atomic replacement. A conflict requires a fresh read/review.
- Report the relative path and optional code-host URL; do not commit or push as a side effect.
- Native tool availability, path containment and concurrent-write behavior need host conformance.
