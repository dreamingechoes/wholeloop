# Ask before filling a gap

Consume the CLI's question objects rather than reconstructing required inputs. Render the returned choices together, preserving their IDs, free-text support and remember scopes. A suggested choice is not an answer.

- ⛔ `missing-input-blocks-mutation` — missing input or ownership returns questions before creating work. Collect answers and rerun the same command; do not invent a person, evidence, destination or approval to make progress look complete.

`wl answer <qid=value> --remember <scope>` persists only an explicit choice. Non-guidance run and initiative answers need `--for <id>`; reusable answers use user/project configuration. Guidance choices use run/project/user scope; before an item exists use the returned `--run`, then repeat `step begin --run` with that ID. An answer reports its configuration file. Human decisions also need `--by <person>` and remain tied to one revision.

- ⛔ `personal-guidance-is-a-choice` — use repository guidance or wholeloop defaults unless the person selects personal guidance. Description-only matches are excluded. Keep wholeloop’s default first, preserve the offered values, and inspect another client’s personal folders only when requested. Optional personal offers never block the default.

An unavailable step, provider or client capability is a limitation to report. Keep unknown framing evidence as `TBD: <missing evidence>; <who can answer>`.
