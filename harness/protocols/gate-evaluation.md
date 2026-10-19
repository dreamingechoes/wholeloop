# Gate evaluation

⛔ `gate-eval-observations` — Score only explicit complete observations bound to
the exact corpus digest. Keep synthetic/recorded provenance visible; absent workers
are unknown, never negative results. Never manufacture a reviewer output to fill
an omitted case.

For a regression use `wl eval gates <corpus> --inputs --json` for blind assignments.
Keep labels, reasons and baseline outputs out of worker context. Collect actual
gate results and independent refutations, preserve opaque case IDs and supply
`--predictions <file>` for before/after matrices. The runner owns arithmetic, not
semantic truth or proof of independent execution. Validate labels/findings and
keep actual host evidence separately before claiming a quality measurement.
