# Interaction profile — how it talks to you, never what it checks

> **TL;DR** — A handful of personal dials shape the conversation: how much it explains, how technical it gets, how hard it pushes back, how much happens at once, how often it pauses, and in which language. Pick a preset or tune single dials. No dial can lower coverage, skip a decision point or let the harness guess instead of ask.

> [!NOTE]
> **Status: ✅ implemented.** Built-in presets, layered dials, CLI setters, transient overrides and the ten-line renderer are tested. Custom preset manifests arrive in P1-09. Decision: [ADR-0010](../decisions/0010-interaction-profile-never-changes-coverage.md). Implementation: [P1-06](../../roadmap/phase-1-walking-skeleton.md#p1-06--interaction-profile).

---

## The dials

| Dial | Values (default **bold**) | Changes | Example |
| --- | --- | --- | --- |
| `verbosity` | brief · **standard** · detailed | How much reasoning and context it writes around each action | *brief*: "Spec drafted — 4 stories, 11 criteria." |
| `depth` | product · **balanced** · technical | Vocabulary and level of detail: outcomes vs. code paths, queries, trade-offs | *technical*: names the files, the query plan, the migration |
| `challenge` | supportive · **balanced** · adversarial | How hard it questions your problem, spec and cuts; how many counter-questions; whether it argues the opposite case | *adversarial*: "What if the real issue is discoverability, not search?" |
| `pace` | **guided** · staged · parallel | How many things run at once ([details](../architecture/orchestration-and-gates.md#pace--concurrency-nothing-else)) | *guided*: one builder at a time |
| `stops` | **decisions** · every-step | Pause only at decision points, or after every step in a chained run | *every-step*: "Slices ready. Continue to build?" |
| `teaching` | **off** · on | Explains *why* the harness does what it does, as it does it — good for onboarding | *on*: "I am splitting this vertically because…" |
| `language` | **auto** · any language code | The language it talks to you in | `es` |
| `artifact_language` | **en** · any language code | The language of everything it writes (docs, issues, commits, PRs) | `en` |

## Presets

| Preset | verbosity | depth | challenge | pace | stops | teaching | For |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mentor` | detailed | balanced | supportive | guided | every-step | on | Learning the flow, onboarding a teammate |
| `pair` *(default)* | standard | balanced | balanced | guided | decisions | off | Everyday work |
| `sparring` | standard | technical | adversarial | staged | decisions | off | Stress-testing an idea or a design |
| `autopilot` | brief | balanced | balanced | parallel | decisions | off | Experienced users on well-defined work |

Presets are just bundles; any dial can be overridden on top. Teams can ship their own presets as manifests ([extending](../extending/lenses-templates-profiles.md#profiles)).

## Changing it

```text
wl profile preset sparring          # pick a preset
wl profile set depth=technical      # tune one dial
wl profile show                     # what is in force and where each value came from
```

`--scope user` is the default; `--scope project` changes the team's suggested profile. Selecting a preset resets its six interaction dials and preserves the active language codes. An explicit dial overrides the preset at its own layer. User preferences still beat project suggestions.

`wl profile set depth=technical --scope run --json` emits a transient `override.profile` object without writing a file. A skill passes that object to `wl step begin ... --profile '{"depth":"technical"}' --json`. The override applies to that invocation; the skill carries it through subsequent calls in the session. It is not persisted across a fresh session.

Or simply say it mid-session — "más técnico", "challenge me harder", "slow down" — and a skill can translate that request into a validated run override, offering to remember it. No natural-language parser is embedded in the deterministic CLI.

## What no dial can change

| Invariant | Why |
| --- | --- |
| **The output contract** — preflight, one-line narration, stop on request, receipt | A run must always be legible, whatever the verbosity |
| **Coverage** — every lens, every verification, every cap | Slowing a check down is a preference; narrowing it is a conversation, not a setting |
| **Decision points** | Accountability stays with a person |
| **Ask, never guess** | A `brief` or `autopilot` profile asks fewer *optional* questions, never fewer *necessary* ones |

## How it reaches the model

The core renders the active profile into a **style block of at most ten lines** and includes it in every `wl step begin` payload. Skills do not interpret dials themselves, so the same profile produces the same instructions in every CLI — and the rendering is snapshot-tested.

```text
Style for this run:
- Explain briefly; one line per action unless asked for more.
- Use technical vocabulary; name files, functions and queries.
- Challenge assumptions firmly and argue the opposite case once per decision.
- Talk in Spanish; write every artifact in English.
```

---

<!-- docnav -->
[◀ Configuration](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Providers ▶](providers.md)
