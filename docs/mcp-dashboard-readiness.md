# Operator dashboard MCP readiness

Implemented and deployed through Clawake as 0.2.1 on 2026-10-12; visual browser
acceptance remains pending. Open the existing Claw-Onshape page and refresh
status. Onshape REST retains its connection controls and read/Candidate Workspace
capabilities. Onshape MCP is a separate read-only section, accessible through the
existing session action requiring `operator.read`; Connect/Disconnect still apply
only to REST and require `operator.admin`.

## Native interface and signals

The supported interface is `openclaw mcp status --json`. OpenClaw documents
[status as inspecting saved configuration without connecting](https://docs.openclaw.ai/cli/mcp/registry)
and [JSON output for dashboards](https://docs.openclaw.ai/cli/mcp/json-output).
The prior pinned 2026.9.9 investigation also verified optional `authStatus.expiresAt`
(epoch milliseconds). No private runtime module or credential file is accessed.
The executable must be available in the plugin host's PATH and use that runtime's
native profile; the plugin supplies no alternate profile or credential location.
The corrected adapter was executed read-only from memory on both native 2026.9.9
hosts, then installed through Clawake on both members; visual dashboard acceptance
remains pending. See the
[runtime acceptance report and follow-up](mcp-dashboard-runtime-acceptance-2026-10-12.md).

| Signal | Meaning / limitations |
| --- | --- |
| Provider | Fixed identifier `onshape`; no arbitrary endpoint/launch data exposed |
| Configured | Boolean from native entry; false when absent from a valid server list; UNKNOWN on invalid/unavailable status |
| Enabled | Native boolean; absent provider or unavailable status gives UNKNOWN |
| Stored grant | Native `authStatus.hasTokens`; absent OAuth metadata gives UNKNOWN |
| Expiry | Optional native timestamp, serialized as ISO UTC; absence gives UNKNOWN; expired metadata requires operator action |
| Operator action | Native `requiresAuthorization`, or true for expired metadata; missing evidence gives UNKNOWN |
| OAuth connection | DISCONNECTED for reported absent tokens; UNKNOWN for saved tokens, since status cannot verify validity/renewal/reachability; this integration never emits CONNECTED |
| Discovery | HISTORICAL, specifically October 9 ClawCAD evidence; no current authenticated tool catalog verified |
| CAD mutation | Always BLOCKED regardless of configuration or OAuth evidence |

Native OAuth discovery cache metadata is not a record of authenticated tool
discovery. NOT_PERFORMED/VERIFIED states are reserved in the typed model; this
increment records neither a new discovery nor a successful verification.

Output is projected, never forwarded. Unknown keys, other providers, paths,
client information, auth URLs, provider text and token fields are discarded.
Malformed/oversized results, duplicate server names, CLI timeout/failure and unknown
contract shapes fail closed. The command has a fifteen-second timeout and 1 MiB bound;
the server list is bounded to 256. Native `ok` describes enabled/resolved transport
configuration, not current connectivity: valid disabled entries have `ok:false`
and still provide independent saved configuration/OAuth metadata. Errors are fixed text and are never logged with
native stdout/stderr. Agent status uses the existing REST-only lifecycle, so it
cannot retrieve the new native metadata. MCP failures do not alter REST readiness.

## Mutation and next dependency

Mutation is blocked by unverified Candidate Workspace containment, missing atomic
revision enforcement, unverified guarded native MCP invocation and an unverified
Part Studio mutation contract. Authentication cannot remove these gates.

Future OAuth must be initiated by the operator using native OpenClaw MCP
Settings/CLI in an explicitly approved isolated profile, preserving disabled
production connectors and grants. This page initiates no consent, refresh,
login/logout, discovery, tools, native configuration changes or grant changes.
REST and MCP credentials remain separate; no tokens are copied or exchanged.

Exactly one next increment: validate this read-only projection on the pinned
OpenClaw 2026.9.9 host with MCP still disabled. Verify operator scope and the
sanitized configuration/expiry/UNKNOWN UI without network discovery or consent.
Authenticated discovery still depends on isolated native operator onboarding;
CAD execution additionally depends on all four mutation gates above.


Deployment and operator browser/Lead continuation are recorded in the
[Clawake deployment guide](clawake-mcp-dashboard-deployment-2026-10-12.md).
The Lead role explains that Clawake administration belongs to the owning host
operator outside the agent sandbox; this does not grant host tools to agents.
