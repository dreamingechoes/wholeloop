# Core-owned output contract rules

- ⛔ `public-versioned-json-contract` — register every command output in the general JSON Schema with one exact versioned discriminator. Keep source schema identities unique/versioned and preserve existing event payload rules when adding metadata.
- ⛔ `v1-declaration-compatibility` — retain frozen declarations, existing command signatures/options and exit codes. Record new identities separately; do not silently replace a prior contract. Generated delivery manifests validate before emission. A candidate baseline is not a published release or native acceptance.

- ⛔ `human-command-text` — ordinary commands render text unless --json is requested, consuming structured observations without serializing and parsing them again. Preserve explicit raw/artifact formats and native guard/process wire contracts; human views create no approval or execution evidence.

- ⛔ `status-actionable-attention` — pending approvals remain upcoming while their producing step is running. Status and overview use the same producer guard as decision recording; only actionable approvals enter attention. Status renders one clipped tree row per visible item, hides closed work unless --all was requested and uses colour only on a terminal with NO_COLOR taking precedence. Recorded checks never certify current workspace bytes.
