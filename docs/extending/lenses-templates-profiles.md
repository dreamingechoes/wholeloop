# Lenses, templates, profiles and decision points

> **TL;DR** — The other four extension points follow the same pattern as providers: a small manifest in `.wholeloop/<kind>/`, validated by a schema, tested with `wl <kind> test`, overridable by `id`. Lenses add review or verify dimensions, templates reshape artifacts, profiles bundle dials, decision points add stops for a person.

> [!NOTE]
> **Partial.** Template, profile and lens catalogs, validation, inheritance and scaffolding are implemented, and custom profiles, spec templates and lens manifests are consumed. Template selection for other workflows is planned.

---

## Lenses

A lens is one question a gate asks of a change, answered by one `reviewer` (review gate) or `verifier` (verify gate).

```yaml
# .wholeloop/lenses/accessibility/lens.yml
schema: 1
id: accessibility
gate: review                   # review | verify
asks: Can every user perceive, operate and understand the changed UI?
applies-when:
  paths: ["**/*.tsx", "**/*.vue", "**/*.html"]
fail-safe: false               # true: "cannot prove it is fine" counts as a finding
prompt: prompt.md              # ≤ 40 lines: what to look for, what is out of scope
```

| Field | Notes |
| --- | --- |
| `gate` | Which gate runs it. |
| `applies-when` | Deterministic filter (paths, languages, slots bound). A lens that does not apply is reported as *not applicable*, never silently absent. |
| `fail-safe` | Reserve for lenses where a miss is far worse than a false alarm (`security`, `correctness` are fail-safe by default). |

Declare it in project config: `lenses: { add: [accessibility] }`. The loader validates applicability fields and a prompt of at most 40 lines, including inherited resource origins and symlink boundaries. The gate engine evaluates applicability and reports excluded lenses. `lenses.disable: { performance: "No runtime surface in this migration" }` records an explicit reason; empty/blank reasons fail validation. Built-in applicability cannot be narrowed through a manifest, and overrides cannot weaken correctness/security fail-safe defaults. Custom path patterns accept `*`, `**` and `?`; dimensions combine with AND and values within a dimension with OR. Language matching currently recognizes TypeScript, JavaScript, Python, Go, Rust, Ruby, Java, Swift, HTML, CSS and shell by extension.

## Templates

Templates give an artifact your team's shape: a spec, a research brief, a launch plan, a decision record.

```markdown
---
schema: 1
id: spec
extends: builtin:spec          # keep the required sections, add or reorder your own
sections:
  required: [problem, users, stories, criteria, metrics, rollout]
  optional: [risks, alternatives, legal]
---
# {{title}}

## Problem
…
```

The loader checks that every **required section** has a non-empty heading body. The spec workflow consumes `templates.spec` unless repository guidance wins; other selections arrive with their workflows; the framing engine always checks its eight core questions plus `Owner`, including explicit unknown markers. A template may add or reorder sections; removing one the flow depends on (for example `metrics`, which the measurement plan reads) fails validation naming the section and its dependent step. A repo skill bound to `spec.template` takes precedence over a template file in the spec workflow, because it carries more than shape.

## Profiles

```yaml
# .wholeloop/profiles/onboarding/profile.yml
schema: 1
id: onboarding
extends: mentor
dials:
  depth: product
  challenge: supportive
```

A team can suggest a profile (`profile: { preset: onboarding }` in project config); each person's own choice still wins ([why](../configuration/README.md#who-wins)).

## Inspect and scaffold

```text
wl template list --json
wl template test spec --json
wl profile list --json
wl profile test onboarding --json
wl profile preset onboarding --scope run --json
wl lens scaffold accessibility --json
wl lens scaffold accessibility --output .wholeloop/lenses/accessibility --json
wl lens test accessibility --json
```

Each kind supports `list`, `test <id>` and `scaffold <id>`. Scaffold prints a kit by default; `--output <directory>` explicitly creates a new directory and refuses to overwrite an existing one. Lens kits include `prompt.md`. Template kits contain `template.md`; profiles contain `profile.yml`. A flat `templates/<id>.md` also loads.

Catalog precedence is repository, user, installed packages, then built-in. A same-id manifest replaces its predecessor unless it declares `extends`. Maps merge recursively and arrays replace. `extends: builtin:pair` names a built-in explicitly; `extends: pair` on a same-id override selects the next lower layer. Cycles, duplicate IDs within one layer, malformed schemas and unsafe resource paths are reported as problems; list/test exits 4 when any problem exists. Configuration loading rejects a broken profile catalog rather than silently using a different communication profile.

The schemas in `src/extensions/schemas/` describe decoded manifests. Template front matter supplies metadata and the Markdown body supplies `content`. Profile manifests contain dials only; they cannot alter checks or decisions. `profile set` still overrides one dial, while `profile preset <id>` selects any validated catalog profile. User preferences keep their normal precedence.

## Decision points

```yaml
# .wholeloop/config.yml
flow:
  decisions:
    add:
      - security-signoff
```

Current additions apply before `open-pr`; structured custom prompts and record fields remain planned. Added decision points behave like the built-in ones: they stop every mode and every profile, they are listed in the preflight, and the decision is recorded in the journal with who made it.

---

<!-- docnav -->
[◀ Compatibility](compatibility.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Architecture ▶](../architecture/README.md)
