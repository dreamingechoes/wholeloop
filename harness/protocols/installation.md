# Managed native installation

Use install/uninstall only for an explicitly requested target and user/project
scope. Read their versioned JSON; a dry run lists changed output and removals.

- ⛔ `owned-native-output` — write/remove only exact receipt-owned regular files
  with matching hashes/modes. Preserve edits, unowned files, unknown private-tree
  contents and unsafe aliases. Uninstall may accept already missing owned files.
- ⛔ `external-installation-control` — runtime receipts, backups and locks stay
  outside Git. Project .wholeloop/distribution output is intentional packaged
  configuration, never execution state. Do not copy shared settings/credentials.
- ⛔ `recover-pending-installation` — preserve pending intent and backup integrity.
  Do not blindly retry interrupted installation. Recover all pending targets
  together through uninstall; unknown/edited output requires inspection.
- ⛔ `installation-is-not-activation` — installed files do not establish native
  discovery, trust, model execution, sandbox enforcement or authentication.
  Follow the returned restart/verification and per-repository Git-hook handoffs.

Every installed skill calls its packaged core through its own relative launcher;
first obtain the checked adapter root and pass it to delegated agents. Claude
native installations use wl-prefixed loose components with scoped hooks; generated
plugins remain a separate delivery format. Never replace that core using PATH.

User configuration roots are resolved at runtime. Project launchers/hooks retain
relative bindings after a checkout moves. A copied project has no local runtime
receipt; existing unmanaged files are preserved rather than automatically adopted.

Doctor can inspect owned user/project scopes without activation. Current means
matching owned bytes/source/core; absent means no local ownership receipt, not no
native components. Stale output can be upgraded; changed/invalid/interrupted state
needs preservation and the report's diagnostic/recovery action.
