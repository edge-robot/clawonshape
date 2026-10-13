# Architecture

This plugin is intentionally narrow: a native OpenClaw extension that reads configured Onshape state and renders a pinned PNG for a trusted engineering flow.

## System view

```text
Discord user
   ↓
Robotics Lead (native role)
   ↓ signed A2A delegation
Mechanical Engineer (native role)
   ↓ verified host binding + OAuth
Onshape REST API
   ↓
Pinned PNG artifact + integrity metadata
   ↓
Lead returns final Discord response
```

## Primary responsibilities

### Lead agent
- Accepts user intent and coordinates the request.
- Calls the native delegated render flow.
- Validates the signed Engineer response and PNG metadata before responding in Discord.
- Receives no direct REST token or CAD tool.

### Mechanical Engineer
- Owns CAD inspection and engineering interpretation.
- Uses the host-configured Onshape target and connection.
- Calls status, inspect, and render only when the trust checks pass.
- Returns JSON status/results that include signed proof for the exact delegation context.

### Host/plugin layer
- Enforces trusted routing, binding, and requester checks.
- Holds the configured document/workspace/element IDs and OAuth connection references.
- Stores private credentials in native private files and checks them before execution.
- Rejects missing identity data, invalid callbacks, and unverified state.

## Control/data-plane split

Claw-Onshape owns the control plane: OAuth and sole refresh ownership, trusted
target selection, signed A2A context, Candidate preparation, approval, independent
REST inspection/verification and pinned rendering. Existing REST reads and
orchestration remain valid.

onshape-mcp owns the CAD data plane: structured tool execution, exact target and
operation admission, revision constraints and mutation uncertainty. OpenClaw is
the native MCP client; the Engineer invokes MCP tools alongside plugin tools.
The plugin does not contain a second MCP client or an unrestricted REST CAD
mutation path. Clawake owns service lifecycle, image pins, mounts and isolation.

Isolated native MCP feature reads pass. Production access and live CAD writes
remain disabled pending the remaining workflow and runtime gates. See
[native read acceptance](native-mcp-engineer-readonly-2026-10-13.md) and
[ADR-018](ADR.md).

## What is intentionally not included

- agent-side CAD writes
- branch creation or merge operations
- dynamic FeatureScript or production MCP execution
- generic multi-user self-service onboarding
- any fallback path that skips authorization validation

## Design constraints

- Onshape is the authoritative source for CAD state.
- The plugin never infers trust from prompt text or user names.
- The trusted state is derived from native host configuration and signed delegation context.
- Rendering is evidence of inspection output, not proof of dimensional correctness.
- Unknown or failed state remains `UNKNOWN` or `UNAVAILABLE`; it does not become capability.

## Important references

- [README.md](../README.md) — current operator-facing overview
- [docs/product-mvp-status.md](product-mvp-status.md) — current validation status
- [docs/mcp-dashboard-readiness.md](mcp-dashboard-readiness.md) — dashboard readiness and disabled MCP scope
- [docs/oauth-capabilities.md](oauth-capabilities.md) — OAuth and permission boundaries
- [agents/mechanical-engineer.md](../agents/mechanical-engineer.md) — role instructions
- [agents/agent-lead.md](../agents/agent-lead.md) — delegation contract
