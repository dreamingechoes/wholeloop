---
schema: wholeloop/slice-plan@1
repositories:
  - key: api
    path: /example/api
  - key: web
    path: /example/web
slices:
  - key: search
    title: Find an owned order by number
    objective: A returning customer retrieves one past order
    outcomes:
      - Customer retrieves the matching owned order
    demonstration:
      entry: Order history page
      steps:
        - Sign in as the seeded customer
        - Enter an owned order number
        - Submit the search form
      expected: The page shows only the matching owned order returned by the API
    criteria:
      - id: exact-number
        text: An exact order-number query returns only that customer's matching order.
        test: Seed two customers with overlapping order numbers and assert ownership
          filtering.
    tests:
      - id: owned-order
        criteria:
          - exact-number
        steps:
          - Seed overlapping order numbers for two customers
          - Sign in and search for the owned order number
        expected: The page renders only the owned order
    repositories:
      - web
      - api
    contract:
      repository: api
      interface: GET /orders?number=<order-number> returns only authorized matching orders
      examples:
        - GET /orders?number=123 returns [{id:123,owner:current-customer}]
---
## Slice overview

Read the structured slice definition and review its boundaries.

## Acceptance criteria

Read the structured slice definition and review its boundaries.

## Test cases

Read the structured slice definition and review its boundaries.

## End-to-end demonstrations

Read the structured slice definition and review its boundaries.

## Repositories and contracts

Read the structured slice definition and review its boundaries.

## Dependencies

Read the structured slice definition and review its boundaries.

## Open questions

Read the structured slice definition and review its boundaries.
