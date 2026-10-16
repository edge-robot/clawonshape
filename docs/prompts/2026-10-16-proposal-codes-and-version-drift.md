---
target-repo: edge-robot/clawonshape
branch: demo/gateway-native-read-20261014
worktree: /home/kaos/Projects/01_pib/02_sw/clawonshape   # devcontainer: /workspaces/clawonshape
issue: edge-robot/clawonshape#12
architecture-ref: clawonshape/docs/ADR.md#adr-2026-10-16-proof-based-mutation-release-prepared-for-verifiable-presentations
contract-version: 0.4.0-draft
foreign-repo-commit: c53d9c9dcda97da195a52ad223c431ae41100f98   # onshape-mcp, unchanged
base-commit: 09f7b49
status: issued
---
# Unblock proposals: drop the version-drift check and pass error codes through

## Goal

Live acceptance (2026-10-16, R2/R3) could not create a proposal. Fix the three plugin defects
that also survive the planned proof-based redesign (epic edge-robot/clawonshape#11):

1. **M21:** `propose` rejects valid bodies because Onshape reports different
   `serializationVersion` values for the same microversion to different clients.
2. **M20:** `invalid_arguments` always says "retry without target arguments", which misled the
   Engineer.
3. **CR-1 / previous report open point 2:** plugin tools collapse unlisted codes to
   `onshape_unavailable`; provider/validation failures leave no diagnostic.

Keep the change small. **Do not** start the proof-based redesign (no new tools, no approval
request/proof, no dashboard changes); that comes in later prompts after the contract major.

## Context

- Contract `docs/interface/onshape-mcp.md` **0.4.0-draft**: §6 (new sentence: tools return the
  code string unchanged in `details.code`; new plugin codes `invalid_arguments`,
  `authorization_changed`, `provider_protocol_error`, `proposal_body_invalid`), changelog.
  Fixture copy `tests/contract/` VERSION `0.4.0-draft`.
- ADR `docs/ADR.md` → "ADR-2026-10-16: Proof-based mutation release …" (Proposed) for direction
  only. Nothing in it is to be implemented here.
- Evidence (read-only): `docs/evidence/2026-10-16-mutation-path-acceptance.md` R2, R3, M20, M21.
  Probe result: same microversion `b83ee0a0…`, onshape-mcp read `serializationVersion "1.2.23"`,
  plugin REST read `"1.2.21"`, `libraryVersion` 3095 both.
- Code:
  - `src/mutation-workflow.ts` `propose` (~L148–175): `featureId` extraction,
    `validateUpdateBody`, then the version equality check that throws `provider_protocol_error`.
  - `src/mutation-workflow.ts` `validateUpdateBody`: throws `invalid_arguments` for non-objects and
    `revision_policy_denied` for feature/baseline/skew problems.
  - `src/readiness.ts` `messages` (L1–87, `invalid_arguments` text at L80) and `userError`
    (L92–96: unknown codes → `onshape_unavailable`).
  - `src/index.ts` ~L209–310: mutation tools return `details = userError(e)`;
    other tools use `userError` too.
  - `src/rest.ts` `featureUpdateBaseline`, `src/http.ts` `jsonRequest` (protocol/transport codes).
  - `tests/contract.test.mjs` `PENDING_CONTRACT_CODES` (from the previous prompt).

## Binding constraints and prohibitions

- Everything in your agent definition applies.
- **Do not weaken real checks.** `propose` MUST still require: object body; `feature.featureId`
  equal to the bound feature and present exactly once in the live read; `sourceMicroversion`
  equal to the live Candidate microversion; `rejectMicroversionSkew === true`; size limit.
  Only the `serializationVersion`/`libraryVersion` equality against the plugin's own REST read is
  removed. Instead require both fields to be **present and well-formed** (`serializationVersion`:
  string matching `^\d+\.\d+\.\d+$`; `libraryVersion`: positive safe integer) → otherwise
  `proposal_body_invalid`.
- `proposal_body_invalid` is used for every structural body defect that the Engineer can fix by
  re-reading and resubmitting the complete native feature (missing/extra-wrapped `feature`,
  missing versions, `featureId` not a string). Keep `revision_policy_denied` for baseline/skew
  defects and `invalid_arguments` for malformed tool arguments outside the body (proposal ID,
  summary, missing `request`). Texts must name the fix, e.g.
  `proposal_body_invalid`: "Submit the complete native v16 feature from getPartStudioFeatures for
  the bound feature, with serializationVersion, libraryVersion, sourceMicroversion and
  rejectMicroversionSkew: true." Replace the misleading `invalid_arguments` text with a neutral
  one ("The tool arguments are malformed. Check the tool schema.").
- **Pass-through:** every code listed in `tests/contract/error-codes.json` (`plugin` and
  `server`) MUST reach `details.code` unchanged. Add `messages` entries for all of them; unknown
  codes may still fall back to `onshape_unavailable`. Do not leak provider bodies or tokens.
- **Diagnostics:** on `provider_protocol_error`, `proposal_body_invalid`, `revision_policy_denied`
  and `provider_transport_error` in the mutation tools, write one warning line through the same
  logger path already used for `claw_onshape.candidate_authorization_rejected` (structured JSON:
  `event: "claw_onshape.mutation_tool_rejected"`, `schemaVersion: 1`, `timestamp`, `tool`,
  `code`, `stage` (e.g. `baseline_read`, `body_validation`), `ownerHash`, `documentId`; for
  provider failures the HTTP status if known). No body, no token, no provider text.
- Do not touch the contract, fixtures, `tests/contract/`, `spec.md`, `docs/ADR.md`,
  `docs/architecture*`, `docs/evidence/`, `deploy/`, `.claude/`, devcontainer files,
  `package.json` version. Foreign uncommitted changes (`.gitignore`, `.codex/`, `deploy/team.json`,
  `docs/product/`, `docs/ADR.md`, `docs/interface/…`, `tests/contract/…`) are not yours; stage by path.

## Steps

1. Preconditions: branch, `tests/contract/VERSION` line 1 `0.4.0-draft`, foreign HEAD `c53d9c9…`,
   `git log -1` = `09f7b49`. Baseline checks.
2. Failing tests first (name them in the report with the red assertion):
   - propose accepts a body whose `serializationVersion` differs from the fake REST read
     (`1.2.23` body vs `1.2.21` read) when everything else is valid → `PROPOSED`.
   - propose rejects a body without `serializationVersion` / with `libraryVersion: "3095"` /
     with the abstract shape `{parameterChanges: [...]}` → `proposal_body_invalid`.
   - propose still rejects wrong `sourceMicroversion` and `rejectMicroversionSkew: false` →
     `revision_policy_denied`.
   - the mutation tools return `details.code` unchanged for `mutation_outcome_unknown`,
     `mutation_approval_unavailable`, `primary_revision_changed`, `proposal_body_invalid`
     (tool-level test through the registered tool, or the smallest seam that exercises `userError`).
   - contract test: every code in `error-codes.json` `plugin` has a `messages` entry and maps to
     itself; `PENDING_CONTRACT_CODES` is empty and removed.
   - a diagnostic line is written for a `provider_protocol_error` in propose and contains no token
     and no body.
3. Implement in `src/mutation-workflow.ts`, `src/readiness.ts`, `src/index.ts`.
4. Update `skills/onshape-edit-feature-parameters/SKILL.md` (and its byte-identical export plus
   manifest hash, as last time) with one sentence: on `proposal_body_invalid` re-read natively
   and resubmit the complete feature; do not strip target fields.
5. Run all mandatory checks including `npx biome ci .`.

## Acceptance criteria and tests

- All step-2 tests exist, were red first, are green now.
- `npm run typecheck`, `npm test`, `npx biome ci .`, `npm pack --dry-run` pass; `npm ci` and
  `test:native-files` may fail exactly as in the baseline (state it).
- No new `any`, casts or suppressions without a listed reason.
- The removed check is gone; all other propose checks are still covered by tests.

## Branch and worktree rules

- Only `demo/gateway-native-read-20261014` in `/workspaces/clawonshape`, on top of `09f7b49`.
  No branches, no worktrees, no switching, no push.
- Commits with `Refs: edge-robot/clawonshape#12`,
  `Prompt: docs/prompts/2026-10-16-proposal-codes-and-version-drift.md`, `Agent: ts-plugin-dev`,
  `Co-Authored-By: …`:
  1. `fix: 🐛 accept Onshape serializationVersion drift in proposals`
  2. `fix: 🧭 pass mutation error codes through with actionable texts`
  3. `feat: 🔎 log bounded diagnostics for rejected mutation tool calls`
  4. `docs: 📖 tell the engineer how to recover from proposal_body_invalid`
  5. `docs: 📖 report for proposal-codes-and-version-drift prompt` (report + this prompt file)

## Expected report / handoff format

`docs/prompts/2026-10-16-proposal-codes-and-version-drift.report.md` per your agent definition,
plus: red→green table; the final `messages` coverage (code → text) for all contract codes; one
example diagnostic line; `e2e-request: required`. Live E2E to request: a new proposal with the
MCP-read body (`serializationVersion` as returned by onshape-mcp) reaches `PROPOSED`; an
abstract body yields `proposal_body_invalid` with the new text.
