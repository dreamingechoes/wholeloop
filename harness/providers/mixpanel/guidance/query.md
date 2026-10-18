# Mixpanel evidence

- Confirm US/EU/IN region and the real project ID; authenticate through the host's OAuth store.
- Discover events/properties and Get-Query-Schema before translating the pinned query into Run-Query JSON.
- Query insights/funnels/flows/retention only; do not create reports or modify Lexicon/flags during research.
- Preserve calendar dates, project timezone, identity/counting rules, filters and report type.
- Record query/results references and any unverified entities or incomplete result warnings.
- A missing baseline is unknown, not zero. Rate limits and permission failures remain open questions.
- The host translates the core query string into the live Run-Query schema without silently changing it.
- [Official reference](https://docs.mixpanel.com/docs/mcp)
- Mapping checked: 2026-10-18. Live account/schema conformance remains pending.
