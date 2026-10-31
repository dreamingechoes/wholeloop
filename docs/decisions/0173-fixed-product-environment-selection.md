# 0173 — Fixed product environment selection

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

The fixed dispatcher can execute root product QA but requires a caller to supply an already prepared environment. That leaves original provisioning outside dispatch composition. Recorded original preparation now provides the bounded, recoverable input needed to select an environment without another effect after controller interruption.

## Decision

Add a fixed same-store product-environment selector configured with a copied map of milestone candidate/assembly/helper-image inputs. Require the exact assembly reader used by the integration adapter. Before any backend call, validate the original issued integration context, current complete unit QA and its owned assembly, exact current integrated candidate, one complete recipe and machine coverage with supported case owners. Derive workspaces from the immutable candidate and an environment key from the original invocation.

Consume a complete original product binding before preparation. Use one fixed preparation phase per invocation, regardless of configuration, so changed selections cannot acquire another allowance through a fresh phase. Preserve the original deadline, signal, ownership predicate and root registration. After positively observing the original ready result, release its waiting-external boundary inside a transaction that rechecks current ownership and private authority; the existing reducer still refuses other unresolved effects. This cannot undo an operator pause. Pass the selected original environment to the existing integration adapter, which independently checks current readiness and executes actual QA. No prepared-input flag becomes a QA verdict.

An optionally configured dispatcher performs this selection internally and refuses caller overrides. The existing explicit-selection path remains unchanged when no product selector is configured. Historical inspection reopens the original product binding and preparation result without consulting current selection configuration, executing a backend or changing the journal. Existing integration cancellation discovers original preparation phases even before main QA starts.

This increment accepts one complete recipe per product. Multiple recipe orchestration, creation of the candidate/assembly inputs, complete runtime preflight, public foreground execution and other unfinished P6-10 route composition remain separate technical work.

## Alternatives rejected

An arbitrary selector callback reintroduces unregistered host behavior into the fixed dispatcher. Inferring readiness from a candidate or worker claim omits current unit QA and actual setup. Changing phase or key when configuration changes can duplicate provisioning under one original invocation. Requiring current configuration during metadata recovery loses the original result after controller reconstruction. Replacing the explicit path would unnecessarily break existing standalone callers and evaluations.

## Verification

Table-driven admission tests cover original cancellation, expiration, fencing, malformed deadlines, changed plan/stage/invocation, unsupported stage kinds, missing selection, unverified vectors and consumed binding loss. Asynchronous controls preserve the original signal/predicate and copied map despite caller replacements. Dispatcher tests exercise automatic admission, caller-override refusal and exact fixed-reader/store registration. The opt-in product-environment assembly mode retains every original producer/QA/acceptance/handoff/recovery/retirement control and adds automatic dispatch plus paused selector-free product binding recovery and loss/restoration controls. Evidence and unfinished capability boundaries are recorded in the journal.
