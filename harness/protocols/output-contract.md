# Preflight and receipt

- ⛔ `public-versioned-json-contract` — register every command output in the general JSON Schema with one exact versioned discriminator. Keep source schema identities unique/versioned and preserve existing event payload rules when adding metadata.
- ⛔ `v1-declaration-compatibility` — retain frozen declarations, existing command signatures/options and exit codes. Record new identities separately; do not silently replace a prior contract. Generated delivery manifests validate before emission. A candidate baseline is not a published release or native acceptance.

Use the profile style block from the CLI to set language, detail and tone. Coverage, questions, decisions and artifact checks remain the same.

Before producing an artifact, show the returned preflight: the step, its inputs, resolved repository guidance, where it writes and where it stops. Load selected repository guidance and follow it while retaining the core contract.

After a successful command, show its receipt: the item ID, artifact/reference, what was verified, open questions and the next available command. Distinguish local evidence from live integrations and manual checks. An error payload is not a receipt; preserve the exit code's meaning and report the missing action.

Only `wl` writes runtime state. Draft artifacts in a temporary location outside repositories and pass them to `step complete`; never edit projections directly. The next step is a suggestion until its availability and decisions are checked.
