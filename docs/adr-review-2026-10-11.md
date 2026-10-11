# ADR review — 2026-10-11

Result: reviewed and corrected against current code, native host source and live
acceptance. Reviewed scope: ADR-001–015, product status and the new root spec.md.
This is an in-repository review, not independent security certification.

| Finding | Correction |
| --- | --- |
| Foundational ADRs still described rendering, native onboarding and A2A acceptance as missing | Updated ADR-001/004/006–011 to implemented/live boundaries; future lifecycle and geometry verification remain separate |
| Refresh was both deferred and implemented in different paragraphs | ADR-006/010 refer to the shared lifecycle and ADR-014's actual evidence limits |
| Historical troubleshooting addenda contradicted later decisions | Removed chronological experiments from ADR; retain exact history in diagnostics/live-validation documents |
| /reset soft was presented as a reliable native Codex role refresh | ADR-015 records the actual frozen snapshot contract, native expectedHash file writes and deliberate /new boundary |
| Proposed unified dashboard onboarding could be read as existing functionality | ADR-012 remains Proposed; spec separates Connect/Status from missing private provisioning/Discord wizard |
| Successful fresh-grant refresh could be mistaken for expired-token recovery/rotation | Explicitly partial: prior expired-grant HTTP-200 validation failure remains unexplained; fresh grant returned unchanged values |
| Local/operator probes could be mistaken for Discord E2E acceptance | Current status now cites actual 19:01 UTC Discord invocation, delivered:true and user's receipt confirmation |
| Architectural acceptance could imply authorized CAD writes | Every mutation/lifecycle capability remains unimplemented/disabled; read/render does not confer write authority |

All ADRs retain Status, Context, Decision, Rationale, Evidence, Adaptation,
Consequences, Rejected Alternatives and Open Questions. Reuse decisions distinguish
provider knowledge/patterns from superseded ClawCAD services/database/workflows.

Remaining review concerns: provider-expired refresh/rotation acceptance; canonical
account association and multi-user onboarding; non-blocking provenance/duplicate
warnings; current hosted MCP containment/revision contracts before any mutation.
Clawake's separately approved policy change remains an external repository dependency.
