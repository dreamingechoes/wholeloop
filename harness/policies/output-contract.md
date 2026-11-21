# Core-owned output contract rules

- ⛔ `public-versioned-json-contract` — register every command output in the general JSON Schema with one exact versioned discriminator. Keep source schema identities unique/versioned and preserve existing event payload rules when adding metadata.
- ⛔ `v1-declaration-compatibility` — retain frozen declarations, existing command signatures/options and exit codes. Record new identities separately; do not silently replace a prior contract. Generated delivery manifests validate before emission. A candidate baseline is not a published release or native acceptance.

- ⛔ `human-command-text` — ordinary commands render text unless --json is requested, consuming structured observations without serializing and parsing them again. Preserve explicit raw/artifact formats and native guard/process wire contracts; human views create no approval or execution evidence.
