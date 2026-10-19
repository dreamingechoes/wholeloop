---
name: open-pr
description: Prepare a repository-shaped draft, require human testing of the exact committed snapshot, then publish once through the configured code host and hand back its links.
metadata:
  wholeloop.step: open-pr
---
# Publish a tested draft

Read ask-never-guess, output-contract and draft-publication.

1. Resolve the repository's open-pr.convention and read the actual template. Draft
   its body in an external, non-secret file with actual validation evidence. Keep
   the repository's headings and style; do not add tool attribution.
2. Use `wl pr prepare --for <slice-or-part> --body-file <file> --json`. For a
   standalone checked-out branch supply `--base`, `--owner` and `--title`; missing
   facts are batched before mutation. Choose `--provider github|gitlab` or configure
   providers.codehost. Prepare is local: it never pushes or opens anything.
3. Changes must already be committed, the named branch clean and different from
   its target, and planned builds have current verify/review PASS. If a commit
   changes a gate snapshot, rerun those gates and human testing; do not invent a
   new approval from an older receipt. The harness does not commit for this step.
4. Open the allocated environment with `wl worktree open <id> --json`, or hand
   back the standalone branch path. Ask the person to try the exact snapshot.
   Record `wl pr tested --for <id> --by <person> --note <what-they-tested> --json`
   only after their explicit successful result. A generic approved decision alone
   is insufficient. Changed code or a revised PR plan invalidates old approval.
5. On explicit publication, call `wl pr open --for <id> --json`. It journals one
   intent, pushes the pinned object without force and creates an open draft through
   gh/glab using their own credential stores. Body/title JSON goes through stdin.
6. An interrupted or pending result is ambiguous. Inspect the remote branch/PR;
   use `wl pr reconcile --for <id> --url <observed-url> --json` to read the same
   matching draft. Never rerun a write just because its response was lost.
7. For a multi-repository slice repeat on each ready part in its own repository.
   Link the slice, tracker references and known sibling PRs; preserve pending
   tracker mirroring/cross-links explicitly when a remote host cannot perform them.
8. Return the PR URL, branch/SHA/base, testing evidence, retained workspace and
   outside-repository effects/undo steps. External environment declarations follow
   the environment ledger. Human review, ready status and merge remain human.
