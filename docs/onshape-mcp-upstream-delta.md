# Fork delta and upstream boundaries

Base: altendky/onshape-mcp f78ddc48a445765f32fcf052d9d8e6d709497d56,
workspace 0.5.3-dev.0, MIT OR Apache-2.0. Fork branch:
`edge-robot/onshape-mcp:claw-onshape/external-token`. No new dependencies.

| Feature | Motivation / generic usefulness | Tests | Security / compatibility | Suggested PR boundary |
|---|---|---|---|---|
| Existing external-token mode | Integrate with an external OAuth owner without sharing refresh authority | missing/expiry/rotation, unsafe files, unknown refresh fields, read containment | optional config; no OAuth, refresh, persistence or token adoption; Linux private file contract | external credentials (existing fork commits) |
| Bounded feature modification | Allow externally authorized clients to replace existing features in assigned workspaces | parsing/default deny; wrong document/workspace/element/operation/feature; exclusion; mandatory CAS; body preservation; dispatch denial before credentials | optional mutation section; typed scope; exact route admission; Primary ID supplied by operator; read-only defaults preserved; v16 writes from vendored catalog | target/revision policy and external execution integration |
| Single-attempt HTTP constructor | Prevent write replay through redirects or transport retry | real local HTTP 307 test | additive API; existing upstream constructor unchanged | client retry/redirect control (can be separate) |
| Ambiguous write reporting | Give callers a safe reconciliation signal | UNKNOWN structured error, no retry; execution boundary tests | transport errors, 408, redirects and 5xx treated as UNKNOWN; no workflow ledger; no implicit retry | accompany bounded mutations or separate error contract |
| MCP schema contract test | Prove actual tools/list contains accepted structured schemas | binary stdio protocol tools/list, explain/schema, OAuth-tool refusal | no source mirror, no extra export tool; schemas already complete server-side; optional outputSchema is not invented | protocol regression test |
| JSON Accept admission | Allow automatic OpenAPI JSON response negotiation on bounded reads/updates | catalog-built feature request, payload preservation, alternate/duplicate/authorization header rejection; live native feature read | pure core predicate, exactly one application/json Accept or no headers; all target and revision constraints retained | small external-token policy compatibility fix |
| Format/lint normalization | Make existing fork pass required Rust checks | fmt and strict Clippy | formats previous fork additions; boxes larger auth variant; moves imports before statements; no unrelated architecture refactor | retain with affected fork patch |

The patch has no project IDs, feature names, Claw-Onshape package dependency,
workflow engine or VC framework. Review target scope extensibility and Linux-only
external credential I/O with upstream before proposing PRs. Non-external upstream
OAuth retry behavior is unchanged; bounded mutation safety is claimed only for
external-token execution. Detailed security semantics are in the fork's
`docs/target-policy.md`. The generic Rust changes and overview documentation are
published on `edge-robot/onshape-mcp:claw-onshape/external-token`; the runtime build
remains pinned to implementation revision `612de76266efedc6b1f7fcc1fafe3063837ae8da`.
No changes were pushed to altendky/onshape-mcp and no branch was merged.
