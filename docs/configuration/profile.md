# Interaction profile — how it talks to you, never what it checks

> **TL;DR** — A handful of personal dials shape the conversation: how much it explains, how technical it gets, how hard it pushes back, how much happens at once, how often it pauses, and in which language. Pick a preset or tune single dials. No dial can lower coverage, skip a decision point or let the harness guess instead of ask.

## Contents

- [The dials](#the-dials)
- [Presets](#presets)
- [Changing it](#changing-it)
- [What no dial can change](#what-no-dial-can-change)
- [How it reaches the model](#how-it-reaches-the-model)
- [A profile is not a delegation](#a-profile-is-not-a-delegation)

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

Presets are just bundles; any dial can be overridden on top. Teams can ship their own presets as manifests, in the same catalogue as templates and lenses: `wl profile list`, `wl profile test` and `wl profile scaffold` help you inspect and write one ([custom profiles](../extending/lenses-templates-profiles.md#profiles)).

## Changing it

Pick a preset, then tune a dial. Each command prints the resulting profile and the style block the model will receive:

```console
$ wl profile preset sparring
{
  "preset": "sparring",
  "verbosity": "standard",
  "depth": "technical",
  "challenge": "adversarial",
  "pace": "staged",
  …
}

Style for this run:
- Give enough reasoning and context to assess each action.
- Use technical vocabulary; name files, functions and queries.
- Challenge assumptions and argue the opposite case at decisions.
…
$ wl profile set language=es
{
  "preset": "sparring",
  …
  "language": "es",
  "artifact_language": "en"
}

Style for this run:
…
- Speak in language code es.
- Write artifacts in language code en.
…
```

`wl profile show` prints the same for the profile in force. To see which file each value came from, use `wl config show --explain`.

| Scope | Effect |
| --- | --- |
| `--scope user` (default) | Your own profile, in every repository |
| `--scope project` | The team's suggested profile; your user profile still wins |
| `--scope run` | This run only; nothing is written |

- **A preset resets its six interaction dials** and keeps your language settings. A dial you set explicitly overrides the preset at its own layer.
- **Run scope** prints a temporary override instead of writing a file:

  ```console
  $ wl profile set depth=technical --scope run --json
  {"schema":"wholeloop/profile-set@1","profile":{…,"depth":"technical",…},"style":"Style for this run:\n…","override":{"profile":{"depth":"technical"}}}
  ```

  A skill passes `override.profile` to `wl step begin … --profile '{"depth":"technical"}'` and carries it through the rest of the session. A new session starts without it.

Or simply say it in the conversation: "más técnico", "challenge me harder", "slow down". The skill turns the request into a validated run override and offers to remember it. The CLI itself parses no natural language.

## What no dial can change

| Invariant | Why |
| --- | --- |
| **The output contract**: preflight, one-line narration, stop on request, receipt | A run must always be legible, whatever the verbosity |
| **Coverage**: every lens, every verification, every cap | Slowing a check down is a preference; narrowing it is a conversation, not a setting |
| **Decision points** | Accountability stays with a person; only an explicit autonomous-delivery authorization, never a profile, lets a person decide in advance |
| **Ask, never guess** | A `brief` or `autopilot` profile asks fewer *optional* questions, never fewer *necessary* ones |

## How it reaches the model

The core renders the active profile into a **style block of at most ten lines** and includes it in every `wl step begin` payload. Skills do not interpret the dials themselves, so the same profile produces the same instructions in every client, and the rendering is snapshot-tested. This is the block for `sparring` with `language=es`:

```text
Style for this run:
- Give enough reasoning and context to assess each action.
- Use technical vocabulary; name files, functions and queries.
- Challenge assumptions and argue the opposite case at decisions.
- Run independent workers in bounded stages.
- Pause at every required decision.
- Keep process explanations short unless requested.
- Speak in language code es.
- Write artifacts in language code en.
- Preserve all checks, lenses, caps, required questions, preflight and receipt; stop on request.
```

The last line is always there: no profile can remove it.

## A profile is not a delegation

Choosing `autopilot`, or pausing less often, never delegates a decision, speaks for the owner or skips a gate. Taking a decision in advance needs an explicit grant in [autonomous delivery](../concepts.md#autonomous-delivery), with a pinned rubric for each delegated decision. A profile also cannot widen an autonomous run's [budgets](../tutorials/delivery-budgets.md).

<!-- docnav -->
[◀ Configuration](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Providers ▶](providers.md)
