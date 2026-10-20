# Client artifacts

- ⛔ `artifacts-contained-source` — bundle bounded regular canonical resources;
  refuse symlinked inputs and escaping paths before rendering client artifacts.
- ⛔ `artifacts-owned-output` — never replace an unowned or changed generated tree.
  Validate its recorded file hashes/modes and complete tree, including unknown entries; retain a previous owned version in an
  explicit backup when upgrading. An unchanged build reports already-correct. Dry runs perform the same read-only ownership preflight.
- ⛔ `artifacts-bundled-core` — include the executable core and source/core hashes
  with every target artifact. Plugin skills call that core; agents require the
  conductor's resolved plugin root instead of guessing an executable on PATH.

- ⛔ `distribution-local-preview` — export seven independently valid native trees
  with one exact source/core/version and a relative local marketplace entry. Keep
  publication and native conformance unclaimed; export never installs or publishes.

A rendered artifact is not installed or proven conformant. All seven native
formats, resources, copied cores and guard bindings are implemented. Actual native
activation/permissions stay separate. Codex/Copilot/Cursor have portable manifests;
Gemini has an extension and Antigravity its independent native plugin. Distribution
previews preserve these boundaries instead of merging incompatible root manifests.
Static validation and synthetic tests establish narrower facts than live loading.
