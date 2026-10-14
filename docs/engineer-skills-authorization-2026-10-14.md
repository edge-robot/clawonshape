# Engineer Workshop skills and semantic authorization — 2026-10-14

Scope: stable authorization comparisons and editable Mechanical Engineer skills.
The operator explicitly deferred the complete Candidate mutation workflow. No CAD
mutation, Candidate creation or OAuth write consent was performed by this change.

## Explicit authorization snapshot

`src/authorization-snapshot.ts` replaces raw JSON object serialization comparisons
with validated, frozen field snapshots and structural equality. Criteria are:

- Binding identity: agent, requester, channel, account and optional Discord channel.
- Credential/target binding: connection, document, protected Primary, active workspace
  and optional element.
- Config policy: effective Engineer ID, live-read flag and the complete binding set.
- OAuth: client ID, secret-file reference, callback and all six permission attestations.
- Delegation: Lead/Engineer, authenticated peer/account and signing/transport file references.
- Local MCP: connection reference and credential-directory reference.

Object key order is irrelevant; bindings are an unordered set with duplicate keys
still rejected by the config parser. Missing optional values are absent/unknown;
false and true remain distinct. Invalid types, unknown fields, sparse arrays,
accessors, symbols and non-data record prototypes fail closed. Snapshot values are
copied and frozen, so later mutation cannot rewrite an admitted baseline.

Candidate checks, tool guards, OAuth lifecycle guards, capability membership checks,
CLI revocation checks and MCP credential-maintenance guards use these comparisons.
The signed A2A context ID is still compared exactly. Existing connection-owner IDs,
delegation signatures and provider-request serialization remain compatible.

Typecheck and **85 tests pass**, including equivalent reordered configs at Candidate
POST dispatch, every declared security field change, malformed inputs and immutable
snapshot behavior. This does not enable the Candidate helper for agent/A2A writes.

## Skills and ownership

Three skills were created through native `skills.proposals.create` and applied with
the exact proposal revision hash. They are agent-owned `openclaw-workshop` skills,
eligible and model-visible, not read-only plugin skill registrations:

| Skill | Engineering responsibility | Current execution boundary |
| --- | --- | --- |
| onshape-inspect-features | Read live feature parameters, target revision and evaluation; distinguish parameter evidence from geometry proof | Native MCP reads accepted |
| onshape-edit-feature-parameters | Identify affected features, preserve full definitions, plan the smallest approved parameter change | Inspection/planning until technical mutation authority exists |
| onshape-verify-candidate | Compare before/after state, evaluation, geometry evidence and Primary preservation; reconcile uncertain outcomes | Reads only; no write retries or promotion |

Source templates are in `skills/`. Initial provisioning uses
`scripts/sync-engineer-workshop-skills.mjs`, included in the checksum-pinned package.
It previews without mutation, then uses native Workshop APIs with `--execute`.
Existing Workshop skills are preserved, including operator modifications; a future
plugin synchronization does not silently overwrite them from the templates.

The current Workshop accepts descriptions up to 160 bytes; source templates and
the provisioning preflight respect that limit. The first oversized-description
attempt was rejected before application and corrected through a pinned archive.

`skill_workshop` was added through Clawake to the named Engineer's existing global
and per-agent allowlists after an actual revision test established it was missing.
No shell/file/browser/spawning grant was added. Native operator-requested revision
runs restrict that tool to inspect/revise of the reviewed proposal and revision.

## Runtime acceptance

- Browser inspection of `http://localhost:19489/skills/workshop` shows all three
  installed skills and their content. Private screenshot:
  `state/deployment/workshop-ui-20261014.png`.
- A native Workshop revision run `665e52f0-93ed-42b0-a2df-81804525f2eb` used
  `skill_workshop` inspect/revise and completed. It changed only a test proposal's
  goal; installed content remained unchanged. The acceptance proposal was then
  rejected with its current revision hash, preserving the installed skills.
- Gateway-owned Engineer skill run `6d352efa-4db2-43cd-a5ff-b60b6cae0cab` read the
  actual installed inspection skill through native `skill_workshop(action=read)`
  and invoked native Onshape auth-status, API-explain and API-call tools.
  Completed status ok, zero tool failures.
- Fresh provider result at 09:59 UTC: `holeDiameter="4 mm"`, feature
  `F37MrGsqQOiSdYi_0`, evaluation OK, microversion
  `b83ee0a0efcda65537780ef8`. The Engineer correctly reported parameter evidence,
  not proof of every resulting geometric hole diameter.

Raw private evidence is under `state/deployment/` in
`workshop-revision-evidence-20261014.json`,
`engineer-skill-native-read-20261014.jsonl` and
`engineer-skill-native-evidence-20261014.json`.

The installed-skills collection is a reader in this OpenClaw version. To support
editing from the existing UI without a runtime/UI fork, three unchanged update
proposals were prepared under **Suggestions**. Select the desired proposal, use
**Revise** to describe the engineering change, review the resulting diff, and use
**Apply** only when the revised instructions are ready. Draft creation does not
change the installed skill. After applying, subsequent edits can be proposed in an
Engineer chat using the existing native Skill Workshop tool.

The existing signed Lead-to-Engineer read adapter was rechecked after deployment:
A2A task `0a2de8d6-dbe3-4eec-b560-dc114d8e1009` completed with an independent REST
match (plateWidth 50 mm, feature OK) at 10:03:26.241Z. The prior demo path remains
functional.

## Deployment and OAuth

Claw-Onshape 0.2.4 was deployed with reviewed Clawake setup/sync previews.
Engineer archive SHA-256:
`5b73ea59b474739130b5011e9efcb58cd1c0b577110116aa13391c2233a763d5`.
Lead archive SHA-256:
`b2d2c8593fbecc13a4bedb5d6aa382131a6a92a819800ef799823a6db0bd1d86`.
Both contain the same authorization implementation; Engineer's later artifact also
contains the corrected Workshop descriptions/provisioning preflight. Previous
archives and private inventory/config backups are preserved.

The operator reports application permissions for read, write and delete; these
three app-setting attestations were recorded in the Engineer's managed inventory.
They are not fabricated token scopes or authorization to invoke those operations.
Following the operator's dashboard OAuth consent, the actual handoff contains
**OAuth2Read only**, a valid expiry and no refresh token. MCP readiness returns 200.
Later mutation needs separate write consent plus the deferred execution controls.

The MCP revision/image and exact-target read policy remain unchanged. Its mutation
policy remains absent. Exactly the existing Lead, Engineer and MCP containers run;
no new agent, MCP client, proxy, writer or supervisor was introduced.
