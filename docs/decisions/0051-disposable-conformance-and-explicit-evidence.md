# 0051 — Disposable conformance and explicit evidence

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Adapter goldens and successful core fixtures do not establish that an actual client
loads a skill or runs it correctly. A scenario also needs enough context to avoid
fabricating production evidence, and rerunning against an existing journal can turn
an unrelated success into a misleading pass.

## Decision

- Prepare one disposable Git repository per target and exact CLI version pin. Seed
  synthetic facts and project-scoped native overlays through the real installer.
  Disable inherited Git templates, hooks, signing and identity while seeding. Keep
  control, ownership, prompts, drafts and journals in sibling external directories.
- Bind the run to canonical-source, scenario and bundled-core hashes. Record a
  snapshot after installing and committing the fixture. Do not discover nested
  .wholeloop/distribution output as repository guidance: native-looking packaged
  copies duplicate the real installed overlays, particularly on OpenCode.
- Require explicit fixture or live mode. A fixture worker calls actual installed
  launchers but returns FIXTURE_PASS with simulation evidence. Only an explicitly
  live process can return PASS, after its observed version matches the exact pin.
  Preparing files and version probing are not model execution evidence.
- Start fresh native processes with bounded stdin/stdout, deadlines and group
  cancellation. Keep native project customization enabled so the installed skill
  can load; do not reuse the intentionally customization-free observer recipes.
  Never add permission bypass flags. Native trust/authentication/permission setup
  remains the operator's responsibility. Native recipes are not hermetic sandboxes.
- Isolate wholeloop user configuration and state through per-run XDG roots. Retain
  native auth stores in place rather than copying credentials. Ambient client
  settings, compatible user skills, plugins, native logs and remote effects may
  still exist. A version token is not an attestation of executable provenance.
- Claim each fixture once before process launch. Release the synchronous control
  lock before awaiting work. Interrupted or failed runs remain inspectable but
  cannot be resumed, retried or relabelled; a new fixture is required.
- Judge a bounded, replay-valid journal and the stored artifact projection. Require
  one owned standalone initiative, one framing start/completion in the same run,
  a go outcome, no continuation/skip/approval and an unchanged observed repository.
  A random marker added only to the installed framing skill must be noted between
  start and completion. Failure reports name the CLI, step and missing event.
- Discard native output after bounded process execution. Judge exit metadata and
  journal structure, not native JSON protocol, semantic writing quality, truthful
  narrative evidence, actual hook activation or complete permission enforcement.
  The marker demonstrates instruction consumption, not adversarial loader proof.

## Consequences

The same local structural contract can be exercised for all four tier-A targets
without authenticated model calls. Owner-run live results remain separate from
simulations and cannot silently close the broader permission/conformance matrix.
Native startup files can cause workspace-change failures and need investigation;
ignored files, Git configuration, external writes and service-side state are not
covered by the workspace snapshot. Preserve external evidence for inspection.

## Rejected alternatives

- Marking launcher fixtures as native passes: no native client or model ran.
- Reusing one repository/journal: existing success could satisfy a later failure.
- Disabling every customization: the skill/plugin under test would disappear.
- Automatically bypassing trust or broad tool restrictions: that would test a
  different environment from the one whose native permissions matter.
- Storing full transcripts: journal structure is the initial contract; unrelated
  native diagnostics can contain private settings and authentication details.
