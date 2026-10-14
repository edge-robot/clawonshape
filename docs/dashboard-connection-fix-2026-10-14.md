# Dashboard connection repair — 2026-10-14

The 0.2.6 browser entry referenced the undefined `disconnectWrite` variable
while enabling buttons after a successful native session-action response.
The resulting ReferenceError entered the generic failure handler, replaced the
real connection status with `plugin_unavailable`, and disabled consent buttons.

Version 0.2.7 restores the intended `disconnect.disabled` assignment. The UI test
checks successful status rendering, enabled consent/disconnect controls, and the
native read/write consent payload. Typecheck and all 91 tests pass.

Deployment used Clawake setup and sync-plugins previews before apply for the
existing Lead and Engineer. No MCP changes, CAD mutations, or credential resets
were performed by this repair. Native runtime status after deployment reports
`disconnected`; reconnection requires human Onshape consent. A local headless
browser verified the actual delivered page has no `plugin_unavailable` and an
enabled read/write consent button. Its private screenshot is retained under
`state/deployment/dashboard-connection-fixed-20261014.png`.

Archive: `edge-robot-claw-onshape-0.2.7.tgz`.
SHA256: `727b75b5bc299616e1f8649840c0e18c72c6b41df054362e137f63f15d9c636d`.

## Follow-up: native read-policy diagnosis

The Discord hole-diameter request at 18:09 reached Engineer through signed A2A.
Its native `getPartStudioFeatures` call used the correct configured target, but
added `includeGeometryIds=true`, `noSketchGeometry=false`, and
`rollbackBarIndex=-1`. The existing external-token read policy denies GET query
parameters before provider dispatch. This was not an OAuth failure; the agent's
recommendation to repeat browser consent was incorrect.

The active inspect Workshop skill was updated through native revision-bound
proposal/apply, preserving existing installed content. Normal full feature reads
now explicitly omit query options, and policy denials are distinguished from
connection/consent failures. Both agents' workspace instructions and the skill
distribution template received the same clarification. No server policy was
weakened, no additional read endpoint was granted, and no CAD was changed.

Live acceptance at 18:14 local time: authenticated A2A task
`0e9056ab-11d1-4f7c-b509-85aa1f9660ab` completed successfully in the normal
Gateway-owned Engineer session `f2534008-cbdc-4de9-ad1a-3e862a81c9fe` (`done`).
Engineer invoked native `getPartStudioFeatures` without query parameters and
completed through `onshape_complete_task`. Fresh feature evidence independently
matched REST: `holeDiameter=4 mm`, feature `F37MrGsqQOiSdYi_0`, state `OK`,
microversion `b83ee0a0efcda65537780ef8`. Hole spacing parameters were 60 mm and
30 mm. This verifies feature parameters, not a geometric measurement of every
opening. The signed result returned to the Lead-side delegation caller.
Discord delivery of a new user request has not yet been retested.
Private full evidence: `state/deployment/read-policy-fixed-live-evidence.jsonl`.
