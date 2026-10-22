# Live acceptance: work-context selection increment 1 (2026-10-22)

Issues: edge-robot/clawonshape#21 (backend), #17 (selector UI). Contract `work-context-1.0.0-draft`
(amended CR-1–CR-8), goal `goal-1.2.0-draft`. Operator: onshape-architekt; human acceptor: user.

## Deployment

| Item | Value |
|---|---|
| Plugin | 0.3.0-rc.2 @ `60de713` (`feat/21-work-context-selection`), packed from `git archive` (217/217 tests in the archive), `sha256:13622697491ba7f360466e8c53a17e89ca51a3453b6cad22896b3a7508444182`, 196 files, Lead + Engineer |
| Server | unchanged: `localhost/clawonshape-mcp:cc67472-goal-grant-curl` |
| Pins | runtime pins overlay switched for both members; backup `pins-backups/20261022T142019Z-before-0.3.0-rc.2.json` |
| Clawake | `feat/40-goal-journal` @ `4b59c83` (contains `main` @ `85079c8`); `setup --execute` and `sync-plugins --execute` run by the user from the operator state directory |
| Status | Lead + Engineer `healthy`, `ready`, `pinned=installed=0.3.0-rc.2`, `loaded`, `enabled`; Engineer extension contains `dist/work-context*.js`; no plugin errors in the logs since the restart; `owner-rest` connected with `OAuth2Read`, `OAuth2Write`; MCP healthcheck ok |

## Checks (user, Engineer dashboard)

| # | Check | Result |
|---|---|---|
| L1 | Selector opens; catalog loads | **technical pass, UX rejected.** The catalog loaded without an error: document `wegwerf-document` preselected, `Main` as protected Primary, `Part Studio 1` with `Part 1 · JHD`, catalog revision `b83ee0a0…ef8`. Implication: **WC1 pass** (`elements/…/m/{mv}/…/configuration` accepted). User verdict: workflow not intuitive. "Schließen" belongs at the bottom; "Auswahl übernehmen" should sit visually and logically next to the part choice. Document and part selection do not work as expected, because the user expects real listing and search. |
| L2 | Real part IDs | `JHD` matches `^[A-Za-z0-9_.+-]{1,64}$` (**WC3** data point; one sample) |
| L3 | Part preview | **WC2 pass**: an isometric preview of the selected part only (`parts/…/m/{mv}/…/partid/JHD/shadedviews`) |
| L4–L6 | Adopt, compact card, reload/Escape, revision advance | not run; the selector is to be reworked first |

## Follow-up

- Research on Onshape REST calls for document/workspace listing and part search:
  `docs/prompts/2026-10-22-onshape-catalog-research.md` (ts-plugin-dev).
- Then a UI rework prompt for the Codex architect, plus a contract revision if the research
  requires one.
- Goal acceptance G1–G7 (2026-10-21 evidence, stage 2) remains open.

Verdict: **deployed; technical reads accepted (WC1–WC3); selector UX not accepted.**
