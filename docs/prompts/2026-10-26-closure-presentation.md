---
target-repo: edge-robot/clawonshape
branch: feat/21-work-context-selection
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape
issue: edge-robot/clawonshape#23 (closure), edge-robot/clawonshape#19 (spec)
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-26-project-closure-onshape-rest-quota-and-large-models-limit-the-pib-use-case
status: issued
addressee: Codex onshape-architekt (top-down) with the onshape-product-owner. Delegate writing to openclaw-dev as you see fit; review it yourself.
---
# Closure X1/X2: final presentation and as-built spec status

## How this prompt is used

This is a handover from the bottom-up architect (Claude onshape-architekt) to the **Codex
onshape-architekt**.

- Plan and order: `docs/project-closure-2026-10-26.md`. Tracking issue: #23.
- You cannot commit. Leave changes uncommitted; the bottom-up architect reviews and commits them
  with the trailers `Refs: edge-robot/clawonshape#23` (and `#19` for the spec),
  `Prompt: docs/prompts/2026-10-26-closure-presentation.md` and `Agent: openclaw-dev` (or the
  Codex architect).
- Task IDs: `COC-CLOSURE-PRESENTATION-20261026` (X1) and `COC-CLOSURE-SPEC-20261026` (X2).

## Situation (user decision 2026-10-26)

The project closes. The workflow is shown **as it is** after cleanup:

- the deployed stack: plugin 0.3.0-rc.3, server `cc67472`, Clawake `feat/40-goal-journal`;
- the demo object: the **Camera Mount Plate**.

The open points, stated openly:

- **Handling of pib models could not be shown.** The blockers are large documents (part search
  fails; #22) and the limited Onshape REST quota.
- The quota is **2,500 API calls per year**; about 800 were used by 2026-10-26, and one short
  dashboard session cost 112 calls.
- The user assesses the restricted REST interface as a **long-term show stopper**.
- Decision record: ADR-2026-10-26 in `docs/ADR.md`. Read it; do not edit it.

## X2 — `spec.md` as-built status (do first)

Add one section, "Delivered state (2026-10-26)", to `spec.md`. For each requirement group:

- product goals;
- S1–S9 work-context selection;
- goal workflow;
- cockpit;
- the pib journey (`docs/product/pib-user-journey.md`).

Mark each group **delivered and live-accepted**, **implemented, acceptance pending**, **partial** or
**not delivered**, with an evidence link (`docs/evidence/*`, contract matrix §9 in
`docs/interface/onshape-mcp.md`, reports in `docs/prompts/*.report.md`).

- Mark the pib journey "not delivered", and name the blockers with a link to the ADR.
- Mark goal acceptance G1–G7 "acceptance pending". The architect updates it after the rehearsal.
- Change no other requirement text. Contract-relevant wording stays with the bottom-up architect:
  propose such changes as CR-SPEC-n in your report.

## X1 — Final presentation

Create `docs/product/final-presentation-2026-10/` with:

- `slides.md`: Marp-compatible Markdown, about 12–15 slides, readable without a speaker;
- `speaker-notes.md`;
- `demo-script.md`: step by step from the user's view, with the expected result of each step, a
  fallback per step (screenshot or evidence link) and the expected Onshape calls; the budget for the
  live demo is **≤ 150 calls**;
- `assets/`: PNGs only from existing evidence and product folders; copy them, never regenerate them
  against live Onshape.

Language: German, as the audience and the existing product docs. The user may override this.

Storyline:

1. Problem and vision (`docs/product/vision-and-features.md`): agentic engineering for pib.
2. Architecture: Clawake (deployment), ClawOnshape (policy, OAuth, identity, cockpit), onshape-mcp
   (generic CAD execution). Who owns what; one picture.
3. The delivered workflow on the Camera Mount Plate:
   - Discord → Lead → Engineer;
   - goal confirmation;
   - bounded changes in a Candidate, Primary protected;
   - verification;
   - result with revision link in the channel;
   - cockpit and work-context selector v2.
4. Safety properties actually enforced: Primary protection, goal grant with budget and expiry, STOP,
   durable journal, no blind retry, human confirmation. Only claims with evidence.
5. Results in numbers: tests per repo, live checks passed, open acceptance. The architect provides
   the numbers. Use placeholders `{{…}}` where they are missing.
6. **Limits:**
   - pib models not demonstrated: large documents; REST quota 2,500/year; call cost per action
     from the K2 report (placeholder until it is available);
   - why the quota is a show stopper.
7. Options for a continuation: ADR-2026-10-26 options A–E, neutral, with effect and cost.
8. Recommendation and next steps (proposed by the product owner; marked as a proposal).

## Binding constraints and prohibitions

- Allowed files: `spec.md` (only the new section), `docs/product/final-presentation-2026-10/**`,
  and a one-line link in `docs/product/README` if one exists. Nothing else.
- No live Onshape, no deployment, no dashboard use, no GitHub writes, no push. Work only in the main
  checkout; there is no worktree for this task.
- Never edit `docs/interface/**`, `docs/ADR.md`, `src/**`, `tests/**`, `ui/**` or onshape-mcp.
- No claims beyond the evidence: every number and every "works" statement has a source link in the
  speaker notes.
- No IDs, tokens, host paths or e-mail addresses on the slides. Document names are allowed.
- No new dependencies. Rendering the slides to PDF is optional, and only with tools already
  installed.

## Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| P1 | `spec.md` as-built section complete; pib journey "not delivered" with the ADR link | diff |
| P2 | Slides follow the storyline; limits and show-stopper assessment explicit | `slides.md` |
| P3 | Every claim sourced in the speaker notes; placeholders listed | `speaker-notes.md` |
| P4 | The demo script fits ≤ 150 Onshape calls and has a fallback per step | `demo-script.md` |
| P5 | Only allowed files changed; `git status` shows nothing else from you | report |

## Expected report / handoff format

Write `docs/prompts/2026-10-26-closure-presentation.report.md` with:

- status;
- P1–P5;
- the placeholder list;
- CR-SPEC-n, if any;
- open questions for the user;
- your Codex-architect review result.
