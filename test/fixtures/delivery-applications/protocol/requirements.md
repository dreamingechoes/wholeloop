# Combined task protocol

The independently maintained frontend and backend must agree on the public response containing an ids array. Both component unit suites must remain green, and the actual combined public entrypoint must return the agreed task identifiers. Repair protocol disagreement without changing the expected contract or omitting a component.
