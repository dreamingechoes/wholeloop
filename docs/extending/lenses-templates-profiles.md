# Lenses, templates, profiles and decision points

> **TL;DR** — The other four extension points follow the same pattern as providers: a small manifest in `.throughline/<kind>/`, validated by a schema, tested with `tl <kind> test`, overridable by `id`. Lenses add review or verify dimensions, templates reshape artifacts, profiles bundle dials, decision points add stops for a person.

> [!NOTE]
> **Status: 📐 design.** Lenses land with the gate engine ([P3-03](../../roadmap/phase-3-build.md#p3-03--gate-engine)); templates and profiles with the walking skeleton ([P1-09](../../roadmap/phase-1-walking-skeleton.md#p1-09--manifest-loader-for-the-other-extension-kinds)).

---

## Lenses

A lens is one question a gate asks of a change, answered by one `reviewer` (review gate) or `verifier` (verify gate).

```yaml
# .throughline/lenses/accessibility/lens.yml
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
|---|---|
| `gate` | Which gate runs it. |
| `applies-when` | Deterministic filter (paths, languages, slots bound). A lens that does not apply is reported as *not applicable*, never silently absent. |
| `fail-safe` | Reserve for lenses where a miss is far worse than a false alarm (`security`, `correctness` are fail-safe by default). |

Activate it in project config: `lenses: { add: [accessibility] }`. Built-in lenses can only be disabled with a written reason (`lenses: { disable: { performance: "batch tool, never user-facing" } }`), and the reason appears in every preflight.

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

The **required sections** are what `tl step complete` checks. A template may add or reorder sections; removing one the flow depends on (for example `metrics`, which the measurement plan reads) fails validation with an explanation. A repo skill bound to `spec.template` takes precedence over a template file, because it carries more than shape.

## Profiles

```yaml
# .throughline/profiles/onboarding/profile.yml
schema: 1
id: onboarding
extends: mentor
dials:
  depth: product
  challenge: supportive
```

A team can suggest a profile (`profile: { preset: onboarding }` in project config); each person's own choice still wins ([why](../configuration/README.md#who-wins)).

## Decision points

```yaml
# .throughline/config.yml
flow:
  decisions:
    add:
      - id: security-signoff
        before: open-pr
        ask: "Has the security owner reviewed the threat model for this slice?"
        record: [who, when, link]
```

Added decision points behave exactly like the built-in ones: they stop every mode and every profile, they are listed in the preflight, and the decision is recorded in the journal with who made it.

---

<!-- docnav -->
[◀ Writing a provider](providers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Platforms ▶](../platforms/README.md)
