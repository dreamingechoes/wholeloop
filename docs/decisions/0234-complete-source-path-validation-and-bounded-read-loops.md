# 0234 — Validate final source paths and bound buffer reads

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Controlled source reads accept growth, truncation, same-size edits and a replacement symlink after the final descriptor stat. The final path stat follows aliases and checks only device/inode, omitting current size and timestamps. Separately, the source loop can ask for zero bytes after growth fills its bounded buffer. That request returns no data and supplies no EOF proof.

Normal source/journal reads make two data API calls for a nonempty ordinary file: content followed by EOF. These initially look redundant, but a Linux regular procfs file advertises zero bytes while actually containing 1123 bytes in the executed control. Metadata is not a complete-content proof.

## Decision

Keep the extra-byte buffer, explicit EOF observation, bounded partial-read loop and actual-byte quota refusal. Stop the source loop when its buffer is full rather than when its quota is exhausted; never issue a zero-length read. Preserve short reads, premature EOF refusal and all original containment/descriptor guards.

Use a non-following final source path stat and compare its regular-file type, exact device/inode, size and nanosecond modification/change timestamps with the descriptor. Use integer stats throughout this reader to avoid rounding distinct inode/time observations equal. Keep descriptor before/after size/time checks and canonical containment. This replaces the existing final stat with lstat; it adds no metadata syscall. Journal leaf runtime behavior remains unchanged; document its EOF proof so a later optimization does not remove it.

## Rejected alternatives

- Reading only the advertised extent passes 118 initial focused controls but accepts the actual Linux procfs input as an empty source; the original refuses it. Reject that prototype and its eight proposed count reductions. They are not eight product defects.
- Assuming regular-file metadata implies a fixed, complete extent fails on actual virtual filesystems.
- A timer or metadata cache cannot replace current bytes and final path identity.
- Adding another final stat would add I/O where the existing syscall already returns the required fields.
- Removing the actual-byte quota check changes the original oversized refusal when metadata understates contents.

## Verification

Original-source controls reproduce four post-descriptor path acceptances. A separate growth control observes an unnecessary zero-length source read; the buffer-bound loop removes it while retaining rejection. Final controls cover normal/empty/binary and actual short reads, premature EOF, in-read edits, post-descriptor changes, deceptive regular-file extents and actual-byte quota refusal. Initial fixture overload typing errors and a prototype quota-classification regression are corrected before final validation.

Actual Linux comparison preserves the original virtual-file refusal in the final reader; the discarded prototype's false empty acceptance remains separate evidence. Normal API counts intentionally remain one EOF call for empty files and content plus EOF for the declared nonempty files. All 160 final focused actual macOS native controls in eight files and strict types pass; required increment gates remain pending; no complete-route performance or platform parity is inferred.

[◀ Decisions index](./README.md)
