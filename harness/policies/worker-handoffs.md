# Core-owned worker handoffs rules

- ⛔ `rendered-role-tool-contract` — rendered instructions must not require a tool disabled by the rendered role configuration. Refuse an incompatible render; never grant a tool just to make an instruction executable. Missing tools or inputs remain unavailable evidence.
