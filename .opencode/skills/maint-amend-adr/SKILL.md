---
name: maint-amend-adr
description: Record a design change or correction in this repository's decision records, amending the existing ADR instead of adding a new one per fix. Use when a change alters a decision, or someone asks whether a change needs an ADR.
---
<!-- Generated from maintainer/ by npm run maintainer:render; edit the source instead. -->

# Amend or add a decision record

Decision records live in `docs/decisions/`; the index is `docs/decisions/README.md`.

## Choose

- **Amend** when the change corrects, narrows or extends a decision that already has a record. This is the normal case: a fix, a refinement or a closed gap belongs to the record that made the decision.
- **New record** only for a decision no record covers: a new subsystem, contract or policy. A task that names a new ADR in its deliverables gets one.
- **Supersede** when a later decision replaces an earlier one entirely. The old record keeps its text.

## Amend

1. Find the record: search `docs/decisions/` for the subsystem and read the whole record.
2. Add a paragraph `**Amended <date> (<task>).**` at the start of its Context, saying what changed and why in a few sentences.
3. Edit the Decision bullets to state the current rule, so a reader does not have to replay amendments.
4. Add any rejected alternative to its Alternatives section with the reason it lost.
5. Update Verification with the tests that now enforce it.

## Supersede

1. Set the old status to `Superseded by [ADR-NNNN](./NNNN-slug.md)` and add a short `**Superseded <date>.**` note under Context.
2. Change its row in the index to `Superseded by NNNN`.
3. Say in the new record why the old one no longer holds.

## New record

Copy the structure of a recent record: title, Status and Date, Context, Decision, Alternatives rejected, Consequences, Verification, and the index link. Add its row to the index.

## Check

`npm run docs:check` validates links, anchors and that every referenced record has a settled status. Never edit a record to hide a decision; history stays readable.

This skill never commits, pushes or changes repository settings.
