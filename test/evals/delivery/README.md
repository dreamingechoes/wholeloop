# Original delivery controls

The reviewed literals live in test/fixtures/delivery-applications and remain byte-bound by baseline.json. Run npm run eval:delivery-fixtures for actual trusted Node/HTTP and broker controls, and npm run eval:delivery-browser -- --retire-success for the actual isolated Chromium restart/fresh-context/backend fixture. All state and reports remain external.

Baseline success means the expected defect was detected while normal controls passed. Reference success is a control, not a model repair. Controller self-checks refuse changed source and execute only reviewed original controls with a fresh environment; changed implementations use the isolated application hosts. Broker fixtures, actual browser observations, native coding clients and hosted effects retain separate evidence levels. See [the operator guide](../../../docs/tutorials/delivery-evaluation-fixtures.md).
