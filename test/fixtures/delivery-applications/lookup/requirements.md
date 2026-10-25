# Case-insensitive title lookup

Find task identifiers by a nonempty title substring, ignoring case and preserving Unicode. The CLI and HTTP entrypoints must agree. An empty query returns CLI exit seven or HTTP 400; no match returns an empty identifier array. Preserve ordinary matching behavior while repairing the mixed-case regression.
