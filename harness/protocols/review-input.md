# Review input

- ⛔ `review-incremental-input` — Load the journal-pinned private patch. Round one compares against the named base; later rounds compare against the prior round's changed-file snapshot, including uncommitted bytes, deletions and reversions.
- ⛔ `review-pinned-rubric` — Load the selected review.rubric content and preserve its binding and digest through the run. A changed rubric needs inspection; never silently weaken it after a failed round.
- ⛔ `review-explicit-comment` — Only an explicitly requested host operation can post a codehost comment. Drafting is local; do not approve or request changes.

Keep prior blockers in context. Incremental inspection does not prove that an untouched blocker was fixed. The host must enforce read-only tools and provide independent refutation workers; snapshots cannot observe restored transient writes.
