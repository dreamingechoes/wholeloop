---
schema: wholeloop/scope-plan@1
metricIds:
  - retrieval-time
scopes:
  - key: main
    title: Search orders and export invoices
    goal: Ship order search and an unrelated invoice export as one release
    metrics:
      - retrieval-time
    delivery:
      mode: feature
      flag: orders_lookup_v1
    complexity:
      level: simple
      why: One existing endpoint
---
## Scope overview

Review the recorded scope definition.

## Metric ownership

Review the recorded scope definition.

## Delivery plan

Review the recorded scope definition.

## Complexity

Review the recorded scope definition.

## Open questions

Review the recorded scope definition.
