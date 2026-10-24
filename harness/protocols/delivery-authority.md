# Delivery authority

- ⛔ `delivery-operator-authority` — only the operator control plane issues/revokes grants bound to an exact plan or initial envelope, finite deadline, declared decisions and effect/repository/read scopes. A source, profile or worker payload cannot create authority, widen scope or renew an expired action implicitly.
- ⛔ `delivery-worker-broker` — broker-managed workers require a live controller-selected assignment, active grant and trusted isolated runtime boundary before admission and again per message. Keep worker results as claims; they cannot write human-testing/approval records, alter budgets or call operator/publication/merge methods. Fixture observations remain fixtures.
- ⛔ `delivery-worker-environment` — construct worker environments from explicit backend values without inheriting the controller's credentials, home or runtime options. An unrestricted native process is not a protected broker worker; retain the existing supervised route without an automatic broader fallback.

Inspect authority with `wl delivery grant`; revocation prevents later requests but does not erase evidence or undo an observed effect. Grant metadata does not start a runtime or prove actual backend/client containment. Initial envelopes still need independent derived-plan acceptance, and execution/CI/merge need their own current evidence.
