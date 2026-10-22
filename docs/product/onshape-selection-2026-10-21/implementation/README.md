# Selector implementation evidence — 2026-10-22

Task `COC-CONTEXT-SELECTION-UI-20261022`, parent `COC-CONTEXT-SELECTION-20261021`.
These are screenshots of the implemented native page against an intercepted mock
gateway, not the earlier product mockups or live CAD evidence. Contract JSON is read
in place from `docs/interface/work-context-fixtures/`; variants modify copies only.
The displayed fixture dates are fixed historical data, not current provider observations.

`tests/cockpit-selection-browser.mjs` runs from `npm run test:cockpit` and intercepts
all navigation/module requests. It implements mock responses for all five contract
methods; the UI exposes adoption but does not expose an unrelated clear workflow.
Each Part gets a distinct schematic PNG labeled SYNTHETISCH. These images prove
request/image identity and decoding, not geometry or manufacturing correctness.

All states are captured at 1440×900, 1366×768 and 390×844. Dialog `-review.png`
files show the scrolled summary and adoption controls; the regular files show the
column headers. Tests check both document and dialog horizontal fit, reachable
controls, visible keyboard focus, forward focus wrapping and return to the entry.
[Check output](checks.txt) contains the actual 199-test summary and browser scenario log.
Both suites now write to fresh temporary directories by default (paths in the console).
Repository evidence refresh requires `COCKPIT_EVIDENCE_DIR`; use
`COCKPIT_EVIDENCE_FILES` for exact-file selection. See the follow-up below.

| Prefix | Evidence |
| --- | --- |
| `01-before` | Initial compact card; no inferred Part or automatic adoption |
| `02-dialog` | Three columns, bounds, same-name IDs, selected-Part preview |
| `02-empty-studio` | Enumerated empty bound studio vs unenumerated other studio |
| `02-configured-studio` | Configured bound studio explained and disabled |
| `03-adopted` | Compact confirmed card after explicit adoption |
| `04-preview-unavailable` | No substituted studio render; explicit preview recovery |
| `05-revision-winner` | CAS conflict reload shows winner and its revision |
| `06-stale-reviewed` | New microversion catalog and explicit renewed Part choice |
| `07-interlock-*` | Each interlock code from WorkContextView |
| `08-*` | Invalid/unverified reasons; no cached images |
| `09-revision-advanced` | Newer valid observation shown without rewriting adoption |
| `10-goal-focus` | Goal focus and feature-condition limitation before confirmation |
| `11-wrong-preview-reply` | Wrong Part/microversion never displayed |

## Exact screenshot manifest

- [01-before-1366x768.png](01-before-1366x768.png)
- [01-before-1440x900.png](01-before-1440x900.png)
- [01-before-390x844.png](01-before-390x844.png)
- [02-configured-studio-1366x768-review.png](02-configured-studio-1366x768-review.png)
- [02-configured-studio-1366x768.png](02-configured-studio-1366x768.png)
- [02-configured-studio-1440x900-review.png](02-configured-studio-1440x900-review.png)
- [02-configured-studio-1440x900.png](02-configured-studio-1440x900.png)
- [02-configured-studio-390x844-review.png](02-configured-studio-390x844-review.png)
- [02-configured-studio-390x844.png](02-configured-studio-390x844.png)
- [02-dialog-1366x768-review.png](02-dialog-1366x768-review.png)
- [02-dialog-1366x768.png](02-dialog-1366x768.png)
- [02-dialog-1440x900-review.png](02-dialog-1440x900-review.png)
- [02-dialog-1440x900.png](02-dialog-1440x900.png)
- [02-dialog-390x844-review.png](02-dialog-390x844-review.png)
- [02-dialog-390x844.png](02-dialog-390x844.png)
- [02-empty-studio-1366x768-review.png](02-empty-studio-1366x768-review.png)
- [02-empty-studio-1366x768.png](02-empty-studio-1366x768.png)
- [02-empty-studio-1440x900-review.png](02-empty-studio-1440x900-review.png)
- [02-empty-studio-1440x900.png](02-empty-studio-1440x900.png)
- [02-empty-studio-390x844-review.png](02-empty-studio-390x844-review.png)
- [02-empty-studio-390x844.png](02-empty-studio-390x844.png)
- [03-adopted-1366x768.png](03-adopted-1366x768.png)
- [03-adopted-1440x900.png](03-adopted-1440x900.png)
- [03-adopted-390x844.png](03-adopted-390x844.png)
- [04-preview-unavailable-1366x768-review.png](04-preview-unavailable-1366x768-review.png)
- [04-preview-unavailable-1366x768.png](04-preview-unavailable-1366x768.png)
- [04-preview-unavailable-1440x900-review.png](04-preview-unavailable-1440x900-review.png)
- [04-preview-unavailable-1440x900.png](04-preview-unavailable-1440x900.png)
- [04-preview-unavailable-390x844-review.png](04-preview-unavailable-390x844-review.png)
- [04-preview-unavailable-390x844.png](04-preview-unavailable-390x844.png)
- [05-revision-winner-1366x768.png](05-revision-winner-1366x768.png)
- [05-revision-winner-1440x900.png](05-revision-winner-1440x900.png)
- [05-revision-winner-390x844.png](05-revision-winner-390x844.png)
- [06-stale-reviewed-1366x768-review.png](06-stale-reviewed-1366x768-review.png)
- [06-stale-reviewed-1366x768.png](06-stale-reviewed-1366x768.png)
- [06-stale-reviewed-1440x900-review.png](06-stale-reviewed-1440x900-review.png)
- [06-stale-reviewed-1440x900.png](06-stale-reviewed-1440x900.png)
- [06-stale-reviewed-390x844-review.png](06-stale-reviewed-390x844-review.png)
- [06-stale-reviewed-390x844.png](06-stale-reviewed-390x844.png)
- [07-interlock-goal_active_conflict-1366x768.png](07-interlock-goal_active_conflict-1366x768.png)
- [07-interlock-goal_active_conflict-1440x900.png](07-interlock-goal_active_conflict-1440x900.png)
- [07-interlock-goal_active_conflict-390x844.png](07-interlock-goal_active_conflict-390x844.png)
- [07-interlock-goal_state_invalid-1366x768.png](07-interlock-goal_state_invalid-1366x768.png)
- [07-interlock-goal_state_invalid-1440x900.png](07-interlock-goal_state_invalid-1440x900.png)
- [07-interlock-goal_state_invalid-390x844.png](07-interlock-goal_state_invalid-390x844.png)
- [07-interlock-mutation_reconciliation_required-1366x768.png](07-interlock-mutation_reconciliation_required-1366x768.png)
- [07-interlock-mutation_reconciliation_required-1440x900.png](07-interlock-mutation_reconciliation_required-1440x900.png)
- [07-interlock-mutation_reconciliation_required-390x844.png](07-interlock-mutation_reconciliation_required-390x844.png)
- [08-invalid-configuration_unsupported-1366x768.png](08-invalid-configuration_unsupported-1366x768.png)
- [08-invalid-configuration_unsupported-1440x900.png](08-invalid-configuration_unsupported-1440x900.png)
- [08-invalid-configuration_unsupported-390x844.png](08-invalid-configuration_unsupported-390x844.png)
- [08-invalid-selection_part_missing-1366x768.png](08-invalid-selection_part_missing-1366x768.png)
- [08-invalid-selection_part_missing-1440x900.png](08-invalid-selection_part_missing-1440x900.png)
- [08-invalid-selection_part_missing-390x844.png](08-invalid-selection_part_missing-390x844.png)
- [08-invalid-selection_part_unsupported-1366x768.png](08-invalid-selection_part_unsupported-1366x768.png)
- [08-invalid-selection_part_unsupported-1440x900.png](08-invalid-selection_part_unsupported-1440x900.png)
- [08-invalid-selection_part_unsupported-390x844.png](08-invalid-selection_part_unsupported-390x844.png)
- [08-unverified-authorization_changed-1366x768.png](08-unverified-authorization_changed-1366x768.png)
- [08-unverified-authorization_changed-1440x900.png](08-unverified-authorization_changed-1440x900.png)
- [08-unverified-authorization_changed-390x844.png](08-unverified-authorization_changed-390x844.png)
- [08-unverified-live_reads_disabled-1366x768.png](08-unverified-live_reads_disabled-1366x768.png)
- [08-unverified-live_reads_disabled-1440x900.png](08-unverified-live_reads_disabled-1440x900.png)
- [08-unverified-live_reads_disabled-390x844.png](08-unverified-live_reads_disabled-390x844.png)
- [08-unverified-provider_protocol_error-1366x768.png](08-unverified-provider_protocol_error-1366x768.png)
- [08-unverified-provider_protocol_error-1440x900.png](08-unverified-provider_protocol_error-1440x900.png)
- [08-unverified-provider_protocol_error-390x844.png](08-unverified-provider_protocol_error-390x844.png)
- [09-revision-advanced-1366x768.png](09-revision-advanced-1366x768.png)
- [09-revision-advanced-1440x900.png](09-revision-advanced-1440x900.png)
- [09-revision-advanced-390x844.png](09-revision-advanced-390x844.png)
- [10-goal-focus-1366x768.png](10-goal-focus-1366x768.png)
- [10-goal-focus-1440x900.png](10-goal-focus-1440x900.png)
- [10-goal-focus-390x844.png](10-goal-focus-390x844.png)
- [11-wrong-preview-reply-1366x768-review.png](11-wrong-preview-reply-1366x768-review.png)
- [11-wrong-preview-reply-1366x768.png](11-wrong-preview-reply-1366x768.png)
- [11-wrong-preview-reply-1440x900-review.png](11-wrong-preview-reply-1440x900-review.png)
- [11-wrong-preview-reply-1440x900.png](11-wrong-preview-reply-1440x900.png)
- [11-wrong-preview-reply-390x844-review.png](11-wrong-preview-reply-390x844-review.png)
- [11-wrong-preview-reply-390x844.png](11-wrong-preview-reply-390x844.png)

## F1–F3 follow-up — 2026-10-22

Task `COC-CONTEXT-SELECTION-UI-FIX-20261022`; architect review PENDING.
The [follow-up report](../../../prompts/2026-10-22-work-context-selector-ui-followup.report.md)
records 217 passing tests and 38 selector check groups, the amended contract
(CR-1–CR-8), and the exact change list. The original checks.txt above is historical.
The [hash/status audit](followup-evidence-audit.json) proves normal runs preserve
evidence and lists the exact six refreshed and nine new PNGs. All other committed
PNGs remain byte-identical; no timestamp-only refresh was performed.

Only the six `02-dialog-*-review.png` and `06-stale-reviewed-*-review.png` files
were refreshed: they now show the 256×256 preview and actual workspace label in
the selected-Part provenance. New screenshots below show the concurrent-adoption
winner and nullable-name fallbacks with secondary short IDs (three viewports).

- [12-busy-winner-1366x768.png](12-busy-winner-1366x768.png)
- [12-busy-winner-1440x900.png](12-busy-winner-1440x900.png)
- [12-busy-winner-390x844.png](12-busy-winner-390x844.png)
- [13-null-names-1366x768-review.png](13-null-names-1366x768-review.png)
- [13-null-names-1366x768.png](13-null-names-1366x768.png)
- [13-null-names-1440x900-review.png](13-null-names-1440x900-review.png)
- [13-null-names-1440x900.png](13-null-names-1440x900.png)
- [13-null-names-390x844-review.png](13-null-names-390x844-review.png)
- [13-null-names-390x844.png](13-null-names-390x844.png)
