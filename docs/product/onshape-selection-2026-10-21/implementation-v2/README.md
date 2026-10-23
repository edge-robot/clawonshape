# Implemented selector V2 — offline browser evidence

Task `COC-CONTEXT-SELECTION-UX-20261022`. These are actual Chromium captures of the
implemented V2 page, not replacement designs or live CAD evidence. Approval X1 is
reported by the PO/architect handoff (2026-10-22, PO chat, "OK"); this developer did
not directly observe that chat. Approved PNG/SVG/design-review inputs were read
only from main; their hashes are in [audit.json](audit.json).

The bound document/workspace, grouped list with adjacent preview on desktop,
sequential mobile context and in-card preview/adoption, explicit studio preview
and one bottom exit follow the approved V2 design. All geometry here is synthetic.

[Full source diff](review.patch), [numbered excerpts](source-review.md),
[check output](checks.txt), [hash/status audit](audit.json),
[handoff report](../../../prompts/2026-10-22-work-context-selector-ux-rework.report.md).
The full suite has one unchanged backend readiness-message failure (CR-UI-1), so
these captures do not claim X7, architect, product or live acceptance.

Normal browser runs write only to unique temporary directories. This evidence was
explicitly opted in with COCKPIT_EVIDENCE_DIR and a 27-file COCKPIT_EVIDENCE_FILES
allowlist; old V1/follow-up evidence was not regenerated.

| Prefix | Evidence |
| --- | --- |
| part | Selected selectable Part, adjacent desktop/in-card mobile preview and adoption |
| studio | Explicit Part-Studio preview; selected Part identity and return action remain |
| compact | Confirmed compact context after adoption, without persistent image or lists |
| documents | Real search/page flow and sequential mobile document step |
| inspection-document | Foreign document/workspace preview; no adoption |
| refinement | Truncated search, full studio list and explicit studio refinement |
| missing-names | Nullable labels and secondary IDs |
| long-names | Wrapping without horizontal overflow |
| preview-unavailable | Optional unavailable Part preview; no studio fallback |

## Exact PNG manifest

- [v2-part-1440x900.png](v2-part-1440x900.png)
- [v2-part-1366x768.png](v2-part-1366x768.png)
- [v2-part-390x844.png](v2-part-390x844.png)
- [v2-studio-1440x900.png](v2-studio-1440x900.png)
- [v2-studio-1366x768.png](v2-studio-1366x768.png)
- [v2-studio-390x844.png](v2-studio-390x844.png)
- [v2-compact-1440x900.png](v2-compact-1440x900.png)
- [v2-compact-1366x768.png](v2-compact-1366x768.png)
- [v2-compact-390x844.png](v2-compact-390x844.png)
- [v2-inspection-document-1440x900.png](v2-inspection-document-1440x900.png)
- [v2-inspection-document-1366x768.png](v2-inspection-document-1366x768.png)
- [v2-inspection-document-390x844.png](v2-inspection-document-390x844.png)
- [v2-refinement-1440x900.png](v2-refinement-1440x900.png)
- [v2-refinement-1366x768.png](v2-refinement-1366x768.png)
- [v2-refinement-390x844.png](v2-refinement-390x844.png)
- [v2-missing-names-1440x900.png](v2-missing-names-1440x900.png)
- [v2-missing-names-1366x768.png](v2-missing-names-1366x768.png)
- [v2-missing-names-390x844.png](v2-missing-names-390x844.png)
- [v2-long-names-1440x900.png](v2-long-names-1440x900.png)
- [v2-long-names-1366x768.png](v2-long-names-1366x768.png)
- [v2-long-names-390x844.png](v2-long-names-390x844.png)
- [v2-preview-unavailable-1440x900.png](v2-preview-unavailable-1440x900.png)
- [v2-preview-unavailable-1366x768.png](v2-preview-unavailable-1366x768.png)
- [v2-preview-unavailable-390x844.png](v2-preview-unavailable-390x844.png)
- [v2-documents-1440x900.png](v2-documents-1440x900.png)
- [v2-documents-1366x768.png](v2-documents-1366x768.png)
- [v2-documents-390x844.png](v2-documents-390x844.png)
