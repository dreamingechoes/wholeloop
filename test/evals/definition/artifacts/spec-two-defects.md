---
schema: wholeloop/spec@1
impact: Reduce the time returning customers need to retrieve a past order.
stories:
  - id: find-order
    actor: returning customer
    want: filter past orders by order number
    benefit: retrieve a previous purchase without paging through unrelated orders
    criteria:
      - id: exact-number
        text: An exact order-number query returns only that customer's matching order.
        test: Seed two customers with overlapping order numbers and assert ownership
          filtering.
      - id: no-match
        text: A query with no match shows an empty result and preserves the query text.
        test: Query a nonexistent order number and assert an empty state with the
          entered text.
metrics:
  - id: retrieval-time
    name: Time to find a previous order
    unit: seconds
    baseline:
      status: known
      value: 48
      evidence: https://example.com/fixture-baseline
    target:
      operator: lte
      value: 20
rollout:
  strategy: flagged
  flag: orders_search_v1
  stages:
    - name: pilot
      audience: internal test accounts
      exposure: 10
      exit: No ownership leaks or query errors observed
    - name: general
      audience: returning customers
      exposure: 100
      exit: Pilot review approved
  rollback: Disable the proposed flag and retain the existing order list.
---
# Order search specification

## Problem

Returning customers have difficulty retrieving a previous purchase.

## Users

Customers with more than twenty past orders.

## Stories

The structured find-order story defines the first user-visible outcome.

## Criteria

The structured criteria cover exact matches, ownership boundaries and empty results.

## Metrics

The retrieval-time metric uses an explicit fixture baseline and target.

## Rollout

Pilot first, then broaden after review. Flag changes remain a human action.

## Measurement plan

The pinned metadata contains the provider, stored query, unit, baseline, target and window.

## Technical appendix

Touches the orders API query and order-history page. Reuse the current authorization filter.
