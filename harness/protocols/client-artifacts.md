# Client artifacts

- ⛔ `artifacts-contained-source` — bundle bounded regular canonical resources;
  refuse symlinked inputs and escaping paths before rendering client artifacts.
- ⛔ `artifacts-owned-output` — never replace an unowned or changed generated tree.
  Validate its recorded file hashes/modes; retain a previous owned version in an
  explicit backup when upgrading. An unchanged build reports already-correct.
- ⛔ `artifacts-bundled-core` — include the executable core and source/core hashes
  with every target artifact. Plugin skills call that core; agents require the
  conductor's resolved plugin root instead of guessing an executable on PATH.

A rendered artifact is not installed or proven conformant. Current generation
supports Claude skills/agents/resources and a plugin manifest only; hooks and
other targets remain unimplemented. Keep conformance unverified until the actual
client discovers and executes the generated components. Static manifest validation
and synthetic golden tests establish separate, narrower facts.
