# Ask before filling a gap

Consume the CLI's question objects rather than reconstructing required inputs. Render the returned choices together, preserving their IDs, free-text support and remember scopes. A suggested choice is not an answer.

- ⛔ `missing-input-blocks-mutation` — missing input or ownership returns questions before creating work. Collect answers and rerun the same command; do not invent a person, evidence, destination or approval to make progress look complete.

`wl answer <qid=value> --remember <scope>` persists only an explicit choice. Run and initiative answers need `--for <id>`; reusable answers use user/project configuration. Slot choices use project/user scope. Human decisions also need `--by <person>` and remain tied to one revision.

An unavailable step, provider or client capability is a limitation to report. Keep unknown framing evidence as `TBD: <missing evidence>; <who can answer>`.
