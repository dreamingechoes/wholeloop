# 0008 — Extensibility through declarative manifests

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The harness is meant to fit the widest possible range of teams. Each team has its own tools — Confluence or Notion, Jira or Linear, PostHog or Amplitude, Zendesk or Intercom — and its own extra checks, templates and decision points. Built-ins cover the common cases; they can never cover all of them. If adding a tool meant changing the core, every team would maintain a fork.

Extensions are also a safety surface: an integration written by anyone must not be able to make the harness send a message, flip a flag or merge a pull request.

## Decision

1. **A capability taxonomy is the stable contract.** Steps ask for capabilities (`docs.create`, `tracker.create-item`, `source.support.query`…), never vendors. The taxonomy has **no verb** for sending, toggling, merging or deleting, so no extension can express those actions.
2. **Five extension points are declarative manifests**, validated by JSON Schema and versioned (`schema: 1`):

   | Point | Manifest |
   | --- | --- |
   | Provider | `provider.yml` + short guidance files |
   | Lens | `lens.yml` + prompt |
   | Template | Markdown with front matter |
   | Profile preset | `profile.yml` |
   | Decision point | config entry |

3. **Discovery order:** repo (`.wholeloop/<kind>/`) → user (`~/.config/wholeloop/<kind>/`) → packages listed in config → built-in (`harness/<kind>/`). Same `id` replaces; `extends:` merges.
4. **Packages carry manifests only.** `wl` reads YAML and Markdown from an npm package; it never executes code from one.
5. **Adapters are the only code extension** — supporting a new CLI is a TypeScript module, reviewed like core code.
6. **Every manifest kind has `scaffold`, `test` and `list` commands.** An invalid manifest is reported by `wl doctor` and ignored; it never half-loads.

## Consequences

### Positive

- Adding a tool is a small file, reviewable in minutes, with no release needed.
- Research sources, destinations and services grow without touching any skill.
- Safety holds for third-party extensions by construction.

### Negative

- The taxonomy must be designed carefully; changing it is a breaking change for every provider.
- Some exotic tools will need more than verb mapping — they wait for a taxonomy extension rather than an escape hatch.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Hard-code integrations in the core | Every new tool needs a release; forks multiply |
| Code plugins (JS/TS) for providers | Arbitrary code execution, hard to sandbox, hard to review |
| Let skills call any MCP tool freely | No safety contract; behaviour diverges per vendor |

## Links

- [Providers](../configuration/providers.md) · [Extending](../extending/README.md) · [Writing a provider](../extending/providers.md)
- [P1-08 — provider registry](../../roadmap/phase-1-walking-skeleton.md#p1-08--provider-registry-v1)

[◀ Decisions index](./README.md)
