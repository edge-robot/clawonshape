# Clawake-owned tool policy remediation

Status: Operator explicitly approved and implemented on October 11; live application in progress.

Native OpenClaw `tool-policy-pipeline-BhdrHJWh.mjs` applies `tools.allow` and agent policy as separate filtering steps. Engineer's global list contains only `clawcad_render_current` and `clawcad_explore_cad`; newly reconciled `agents.entries.<id>.tools.alsoAllow` cannot override that global restriction. Operator A2A probes selected the historical tool and were correctly rejected for missing signed results. This blocks the agent read/render MVP despite successful native OAuth and REST rendering.

Proposed focused change in **edge-robot/clawake**:

1. `src/clawake/config.py:InstanceSpec`: add optional explicit `global_tool_allow: list[str]`, default empty, validated like existing tool names (no wildcards/group grants). This is an operator-owned opt-in, not inferred from per-agent grants.
2. `src/clawake/services/gateway_config.py`: reconcile only these explicitly owned names into an existing explicit `payload.tools.allow`; record them in Clawake reconciliation state and remove prior owned grants when withdrawn. Preserve unrelated allow entries and all denies. Do not create a global restrictive list when none exists; reject that unsupported case with actionable guidance rather than alter host defaults.
3. Add focused reconciliation tests: explicit allow merge, withdrawal, no-change idempotence, unrelated policies preserved, invalid names rejected, absent global allow rejected. Extend CLI preview to show these changes.
4. Local deployment inventory: Engineer adds exactly `onshape_status`, `onshape_inspect`, `onshape_render`; Lead adds exactly `onshape_delegate_render`. Retain per-agent grants, native identity admission and plugin factory restrictions. These read-only additions do not admit MCP or REST writes.
5. Run Clawake tests, preview, apply through `sync-plugins`, restart and inspect effective catalog. Repeat signed native A2A probe, then a real authorized Discord request.

The user requested no direct edits to generated runtime configuration and no silent cross-repository changes. This proposal is reviewable before implementation. No Clawake source or generated global tool policy has been changed by Claw-Onshape.

Implemented in the named Clawake model/reconciler/CLI/test files. The state owns only newly introduced global names, preserving pre-existing operator grants on withdrawal. A missing or empty global allowlist is rejected rather than replacing defaults; withdrawal that would leave an empty allowlist is also rejected to prevent accidental broadening. 48 focused model/reconciliation/CLI tests and Ruff pass. User approval is recorded in the session; no unrelated Clawake changes were overwritten.
