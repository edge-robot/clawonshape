# Documentation index

Documents fall into two classes:

- **Normative** documents define the intended behaviour. If code and a normative document disagree,
  the code wins and the drift is tracked as an issue linked from [ADR.md](ADR.md).
- **History** documents (dated notes, evidence, prompts and reports) record what was observed or
  decided at a point in time. They give context and never override normative documents.

## Normative

| Document | Content |
|---|---|
| [../spec.md](../spec.md) | Product specification |
| [architecture.md](architecture.md), [architecture/control-data-plane.md](architecture/control-data-plane.md) | Architecture and the control/data-plane split |
| [ADR.md](ADR.md) | Decision log, shared by ClawOnshape and onshape-mcp |
| [interface/onshape-mcp.md](interface/onshape-mcp.md) | Plugin ↔ MCP server contract, compatibility matrix (§9), gaps (§11) |
| [interface/goal-workflow.md](interface/goal-workflow.md) | Goal-scoped mutation authorization |
| [interface/work-context.md](interface/work-context.md) | Work-context selection and browsing |
| [engineering-cockpit.md](engineering-cockpit.md) | Engineer dashboard (cockpit) |
| [oauth-capabilities.md](oauth-capabilities.md) | OAuth scopes and permission matrix |
| [mcp-dashboard-readiness.md](mcp-dashboard-readiness.md) | Dashboard and MCP readiness model |
| [candidate-preparation-receipts.md](candidate-preparation-receipts.md) | Candidate workspace preparation receipts |
| [a2a-result-audit.md](a2a-result-audit.md) | A2A result integrity and audit warnings |
| [onshape-mcp-upstream-delta.md](onshape-mcp-upstream-delta.md) | Fork delta to upstream onshape-mcp |

## Operating

| Document | Content |
|---|---|
| [prompts/2026-10-19-team-onboarding.md](prompts/2026-10-19-team-onboarding.md) | Bring up the team on a fresh machine (use the pins of the accepted matrix row) |
| [project-closure-2026-10-26.md](project-closure-2026-10-26.md) | Closure scope, delivered state and limits |

## History

- `*-YYYY-MM-DD.md` in this directory, and `plans/`, `reviews/`, `product/`: dated notes,
  designs and reviews.
- [evidence/](evidence/): live acceptance evidence.
- [prompts/](prompts/): coding-agent prompts and their reports.
- Undated records of past checks: `host-integration-attempt.md`, `migration-map.md`,
  `onshape-live-validation.md`, `plugin-discovery-diagnosis.md`, `product-mvp-status.md`,
  `rest-foundation-e2e.md`, `rest-foundation-review.md`, `self-hosted-mcp-architecture.md`,
  `self-hosted-mcp-feature-matrix.md`, `upgrade-install-status.md`, `validation.md`.
