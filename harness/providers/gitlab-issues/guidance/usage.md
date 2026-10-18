# GitLab Issues

- Use the official GitLab MCP endpoint; override its host for self-managed instances.
- Confirm the namespace and supported version; save_work_item/get_work_item replace legacy issue tools.
- Creation needs an explicit project_id (or group_id/URL), title and type_name Issue.
- Updates need the existing work item URL or work_item_iid; omit fields that are not changing.
- Resolve actual relationship types with the connected tool schema before link_work_items.
- Do not create labels or choose milestones implicitly. Keep the wholeloop ID in the description.
- Record the returned web_url; preserve a local artifact if tools or permissions are unavailable.
- OAuth is managed by the client. No credential values belong in manifests or arguments.
- Reference: [Official documentation](https://docs.gitlab.com/user/model_context_protocol/mcp_server_tools/)
- Mapping checked: 2026-10-18. Live version/account conformance remains pending.
