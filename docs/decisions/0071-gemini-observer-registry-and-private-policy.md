# 0071 — Gemini observer registry and private policy

- **Status:** Accepted
- **Date:** 2026-10-20

**Amended 2026-11-11.** Gemini 0.67.0 honours a system settings file only when root owns it, so the worker's file is skipped there. Gemini also refuses project configuration in an untrusted workspace. Both failures blocked the read-only probe and the framing scenario. Three changes, all observed on 0.67.0:

- **Disposable home:** the observer gets its own `GEMINI_CLI_HOME`. Its user settings carry the same restrictions plus only the user's auth method, `security.auth.selectedType`, so no hook, skill, extension, MCP server or memory of the user reaches it. The credential stays in the client's own store.
- **Admin-tier policy:** the read-only boundary is now an `--admin-policy` file. It denies every tool and every MCP server, then allows only the read tools. Gemini ignores supplemental admin policies when its system policy directory holds a `.toml` file, so such a file counts as an existing administrator policy and the worker refuses to start.
- **Session trust:** `--skip-trust` trusts the directory wholeloop created for that session only. The framing scenario gets the same trust and an admin policy that grants exactly the checked launcher through `commandPrefix` and exact writes to the draft, decision and review files. Gemini splits compound commands, checks every part and downgrades redirections. A hand-written `commandRegex` was rejected: Gemini refuses it as a ReDoS risk and never anchors it.

The read-only probe passed live (`gemini-3-flash-preview`; the default model returned 503). The framing scenario reached `frame finalize` with every grant honoured, and was then stopped by the free tier's daily request quota.

## Context

Gemini has a headless entrypoint, but allowed-tools only bypasses confirmation and project settings may be dropped in an untrusted workspace. Plan mode alone is not a positive tool boundary. Existing managed settings must not be replaced, and redirecting the system settings path also changes the default defaults-file path.

## Decision

- Add a shell-free Gemini JSON worker with stdin assignments, explicit default approval mode and repository include-directory data. Use the same gate envelope, assignment checks, bounded transport and failure handling as other adapters. Accept only a non-empty successful JSON response; do not mine progress output.
- Generate one bounded non-secret worker-settings.json under the private external .gemini directory. Use a positive core read/list/glob/search registry, not just confirmation grants. Disable MCP, extensions, skills, ordinary hooks, discovered command tools, IDE integration and experimental agents/plan tools. Explicitly disable both built-in delegators because they can register even when experimental agents are off. Inherit the selected model and native authentication in place.
- Apply this policy through a worker-only system-settings environment override so it survives untrusted project-setting removal. Refuse an existing default managed settings entry or any supplied system-settings override. Fail on unreadable policy presence rather than interpreting it as absence. Keep macOS/Linux native paths in one platform module; make no Windows support claim.
- Preserve the original system-defaults file path, or an existing absolute explicit override, instead of letting native derivation redirect it into the worker. Keep existing native denies and trust settings; change no HOME, credential store, model, trust flag or permission-bypass setting. Reject comma/newline paths rather than let native include-directory parsing broaden the selected roots.
- Pass the host's effective environment into recipe planning before applying worker overrides. Managed-setting checks must see caller-supplied host options, not only the parent process environment. Refused setup starts no native client.
- Extend the existing policy stager's closed path list with the one Gemini file. Preflight all selected parents/files before writing, retain private modes and reject symlinks/existing output. Preserve Cursor behavior; claim no crash-atomic multi-file transaction or hermetic native process.
- Advertise local headless capability while retaining unverified conformance. Actual native activation, trust/authentication, client logs/updaters, inherited include roots, ignored/external effects and model behavior remain manual checks. Antigravity's remaining recipe does not block this implementation.

## Alternatives rejected

Project-only settings can disappear under native trust handling. Allowed-tools alone leaves other tool surfaces available. Enabling plan mode introduces a different experimental surface and does not establish a positive registry. Replacing an administrator policy or copying HOME/authentication would cross a user setup boundary. Disabling only experimental agents misses the two built-in delegators. Reusing the derived defaults path would silently skip original system defaults. Searching mixed stdout for a result could accept an intermediate value.

## Verification

Test the pure policy/environment/invocation, supported platform table, managed settings refusal, retained default paths, unsafe native include paths, strict JSON decoding and private/mixed-parent staging. Exercise actual compiled fanout through a synthetic Gemini client and prove an effective host managed override starts no client. Update only the capability change in the native golden tree.

With installed Gemini 0.27.0 in a credential-free external HOME, load the generated production policy and hostile user settings, declare the workspace DO_NOT_TRUST, then call its actual settings merger/config loader/tool-registry builder without initializing authentication or a model. The registry contains only glob, list_directory, read_file and search_file_content; MCP/extensions/hooks/delegation are disabled. An initially unmarked trust fixture defaulted to trusted in this settings loader, so repeat with an explicit untrusted rule rather than infer trust from a missing entry. This metadata probe is not a native model/session pass.

## Sources

- [Gemini configuration](https://geminicli.com/docs/reference/configuration/)
- [Gemini trusted folders](https://geminicli.com/docs/cli/trusted-folders/)
- [Gemini 0.27.0 source](https://github.com/google-gemini/gemini-cli/tree/v0.27.0)

[◀ Decisions index](./README.md)
