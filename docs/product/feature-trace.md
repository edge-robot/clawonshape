# Feature implementation trace

Assessment date: 2026-10-20.

Examined ClawOnshape revision:
2ac80f88fa29a08a15aeb03d6e44ddfeb1910f43
on branch demo/gateway-native-read-20261014, with local changes.

The product requirements were untracked local files at review time.
This assessment covers the inspected working tree, not HEAD alone.

Requirements:

- Product vision and features (vision-and-features.md)
- pib user journey (pib-user-journey.md)

## Assessment method

Percentages are rough architectural estimates of implementation coverage
against the complete requirement. They are not measured completion,
acceptance scores, delivery forecasts, or evidence of runtime availability.

A 0% estimate means no integrated implementation of the required product
workflow was identified. Generic tool capabilities and adjacent CAD
infrastructure do not establish an implemented manufacturing workflow.

Historical acceptance is recorded separately. No tests, runtime checks,
CAD calls, or deployment actions were performed during this review.
No aggregate percentage is calculated because requirements differ in size
and no agreed weighting exists.

## Feature list

| ID | Feature | Status | Estimated implementation | Implementation evidence | Acceptance and missing evidence |
|---|---|---|---|---|---|
| K1 | Robotics Lead handles user communication in the originating channel | Partial | 60% | Identity-bound delegation (../../src/delegation.ts), Lead contract (../../agents/robotics-lead/workspace/AGENTS.md) | Historical single-owner read/render acceptance. Late mutation completion was not relayed correctly; manufacturing communication is missing. |
| K2 | Understandable results with usable views and artifacts | Partial | 50% | Render delivery (../../src/index.ts), MVP report (../product-mvp-status.md) | Historical PNG delivery confirmed by the user. Complete mutation presentation, STL delivery, and print previews remain unaccepted. |
| D1 | Dashboard lists Onshape and Bambu Studio | Partial | 50% | Dashboard UI (../../ui/control-ui.js) | Onshape REST/MCP sections exist. Bambu Studio integration and combined dashboard acceptance are missing. |
| D2 | Per-tool status, freshness, and required action | Partial | 40% | Dashboard UI (../../ui/control-ui.js), Readiness model (../../src/readiness.ts) | Historical Onshape UI checks exist. Bambu status and consistent freshness/staleness handling are missing. |
| D3 | Dashboard reflects actually available capabilities | Partial | 30% | Capability model (../../src/capabilities.ts), MCP status (../../src/mcp.ts) | Capability infrastructure exists, but mutation availability and blockers remain static. No consistent end-to-end capability acceptance. |
| D4 | Dashboard shows authorized team, project, printer, and profile context | Partial | 20% | Bindings (../../src/config.ts), Dashboard UI (../../ui/control-ui.js) | Connection/workspace context exists. Printer/profile context and two-team isolation acceptance are missing. |
| D5 | Dashboard and channel show a consistent task state | Partial | 30% | Mutation receipts (../../src/mutation-workflow.ts), Dashboard actions (../../src/dashboard.ts) | Historical expiry reconciliation passed. Mutation R7 exposed inconsistent channel reporting; stale dashboard cards were also observed. |
| F1 | Team, project, and authorization assignment | Partial | 30% | Binding validation (../../src/config.ts), Signed delegation (../../src/delegation.ts) | Single-owner foundations and authorization tests exist. Two-team isolation across artifacts, approvals, and printers is unproven. |
| F2 | Inspect CAD, select assembly parts, and explain findings | Partial | 40% | Independent feature verification (../../src/rest.ts), Read evidence (../dashboard-connection-fix-2026-10-14.md) | Historical feature reads passed. Confirmed pib assembly/part/side selection with revision and quantity is missing. |
| F3 | Complete Candidate mutation with result verification | Partial | 60% | Mutation workflow (../../src/mutation-workflow.ts), Workflow description (../free-engineering-tasks-2026-10-14.md) | Historical R7 thickness mutation reached VERIFIED. The agreed hole-change case, preservation checks, before/after presentation, and correct channel completion remain unaccepted. |
| F4 | Production approval binds a fixed CAD revision and part selection | Open | 0% | Existing mutation approval (../../src/mutation-workflow.ts) covers a different authorization purpose | No production-order approval workflow or acceptance identified. Mutation approval does not substitute for production approval. |
| F5 | Reproducible STL export with accessible result | Open | 0% | No integrated product workflow identified in the tool catalog (../../openclaw.plugin.json) | No approved-revision STL with selection, units, export parameters, file identity, dimension checks, and user delivery accepted. |
| F6 | Traceable handoff to the Engineer's print subagent | Open | 0% | The active Engineer contract (../../agents/mechanical-engineer/workspace/AGENTS.md) excludes further delegation | No print-subagent handoff, acceptance/rejection response, or complete authorized production context identified. |
| F7 | STL validation, Bambu Studio preparation, and preview | Open | 0% | No Bambu preparation integration identified in the tool catalog or dashboard | Pilot import, dimensions, profiles, build volume, slicing, preview, estimates, and blocked cases remain unaccepted. |
| F8 | Separate print-start approval and physical execution | Open | 0% | Active Lead contract (../../agents/robotics-lead/workspace/AGENTS.md) excludes printing | No printer/job-bound start approval, confirmed dispatch, or duplicate-start prevention acceptance identified. |
| F9 | Print progress, error reporting, and recovery | Open | 0% | CAD reconciliation exists in the mutation workflow; no print-job workflow identified | No print monitoring, completion/error reporting, or reconciliation of uncertain starts accepted. |

## Component ownership and next steps

| Scope | Responsible component | Recommended next step |
|---|---|---|
| K1–K2, D5 | ClawOnshape | Preserve task identity across timeouts and relay confirmed late results to the originating channel. |
| D1–D4 | ClawOnshape | Define consistent tool status, freshness, capability, and authorized context projections, including Bambu Studio. |
| F1 | ClawOnshape; Clawake for deployment | Define team authorization and demonstrate isolation with two test teams and deliberate misassignment attempts. |
| F2–F3 | ClawOnshape control plane; onshape-mcp CAD execution | Complete the agreed plate acceptance with explicit preservation checks and usable before/after results; specify pib assembly selection. |
| Candidate deployment | Clawake; ClawOnshape supplies validated claims | Move lifecycle responsibility out of ClawOnshape provisioning scripts while preserving reviewed target and approval boundaries. |
| F4 | ClawOnshape | Define production approval independently from mutation and print-start approval. |
| F5 | onshape-mcp for generic CAD execution; ClawOnshape for approval binding and delivery | Specify revision-bound export, artifact provenance, dimensions, and accessible delivery. |
| F6–F9 | ClawOnshape integration; print execution component to be designed; Clawake for deployment | Define the subordinate print-agent contract, Bambu preparation, separate start authorization, job identity, and recovery. |

## Historical acceptance versus runtime state

- Read/render MVP report (../product-mvp-status.md):
  historical single-owner Discord-to-PNG acceptance, including user confirmation.
- Native read evidence (../dashboard-connection-fix-2026-10-14.md):
  historical independent feature-parameter verification; not complete geometry verification.
- Mutation acceptance, R7 (../evidence/2026-10-16-mutation-path-acceptance.md):
  historical Candidate thickness update reached VERIFIED, but the Lead reported
  UNKNOWN to the channel. This does not establish full plate-journey acceptance.
- Current runtime availability was not checked.
- No complete pib manufacturing task was identified as accepted.
- README and older workflow status statements lag behind the newer mutation report.

## Outstanding product acceptance

The following remain unaccepted:

- Plate hole change with preservation conditions and delivered before/after results.
- Complete pib journey, including a path without prior mutation.
- Isolation of two teams across projects, artifacts, approvals, and printers.
- Stable approved export revision despite later CAD changes.
- STL selection, scale, dimensions, and invalid-file rejection.
- Complete print order with printer, material, quantity, settings, and labeled estimates.
- Separate print-start approval, changed-order handling, and duplicate/uncertain-start protection.
- Useful results delivered through the Lead for the complete journey.
- Pilot evidence of reduced effort and understandable approvals.

Before pilot acceptance, the Product Owner must select teams, a concrete pib
part, printer, material, success criteria, and authorized approvers.
The proposed rules for renewed approvals after changes also require confirmation.

