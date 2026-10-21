# Bambu H2C integration: source review and admission gates

Checked: 2026-10-20. Decision: **do not provision either reviewed skill unchanged**.
Use the existing Mechanical Engineer and gateway, with a bounded native read tool
and a small Workshop skill after transport hardening and architect review. No new
agent, container, broker, sidecar, cloud account, or permanent polling service is
justified by Stage A.

This review made no printer connections, installed no printer-control executable,
changed no runtime grants, and performed no deployment. H2C hardware compatibility
remains **UNVERIFIED**. Source inspection and offline tests are not printer tests.
A production read-only integration was not implemented: neither candidate meets
the admission gates below, and the signed printer interface is not yet agreed.

## Source identity and reproducibility

The two supplied OpenClaw Easy pages are discovery pages, not capability evidence:

- https://openclaw-easy.com/skills/bambu-cli.html
- https://openclaw-easy.com/skills/bambu-local.html

Their linked archives were downloaded into `/tmp/bambu-review`, inspected without
installation, and identified as:

| Artifact | Version | SHA-256 |
| --- | --- | --- |
| bambu-cli.zip | 1.0.0 | `5b1bb27af1e80d34faab67d23fc8ef37e64c5fd0b2b2887ef0414e327c4c76fb` |
| bambu-local.zip | 1.0.1 | `bf69de2ca5c3e3bfb37404a501cd87b5c3e0ec7b66cc6d56e514b7193378c289` |

The CLI archive contains SKILL.md, a command reference, metadata and a skill card;
it contains **no CLI executable or implementation**. Its publisher is
`tobiasbischoff`; the matching implementation is
https://github.com/tobiasbischoff/bambu-cli at
`bba9349dc76165a79d8846a448da50a8acda20be` (last commit 2026-01-08).
Do not substitute the unrelated davglass, latsss, or other similarly named CLIs.
The archive's command surface matches this implementation, but the archive does
not pin a source commit or binary digest.

The local archive contains SKILL.md, `bambu.py`, an example config, metadata and
skill card. The archived source is directly inspectable. Its homepage points to
OpenBambuAPI, which documents protocols rather than implementing this skill.
A web-cached `openclaw/skills/skills/tanguyvans/bambu-local/SKILL.md` was found;
the corresponding current GitHub contents API returned 404. Therefore the inspected
ZIP hash, rather than an assumed current upstream checkout, identifies this review.
Temporary downloads are not durable deployment artifacts.

## Capability comparison

All implementation claims below refer to the exact sources above. Neither column
contains successful H2C hardware tests.

| Area | bambu-cli | bambu-local |
| --- | --- | --- |
| Architecture | Skill generates shell commands; separate Go CLI required | Skill invokes Python script; Python and paho-mqtt required |
| Communication | Direct LAN MQTT/TLS 8883; implicit FTPS 990; proprietary TLS JPEG camera 6000 | Direct LAN MQTT/TLS 8883 only |
| Cloud | No cloud login or cloud discovery implementation found | No cloud implementation found |
| H2C | No explicit H2C model handling, fixture or compatibility assertion found | Documented list is A1/A1 Mini/P1P/P1S/X1/X1C; no H2C code found |
| Status/progress | JSON/plain/human; state, stage, percent, layers, ETA, temperatures, filename, Wi-Fi, print_error | Human text; temperatures, Wi-Fi, state; percent/layers/ETA only for RUNNING |
| AMS/material | `ams status` returns raw print.ams JSON; human formatting of units/trays/material/color | No AMS/filament command or output |
| Files | FTPS list/upload/download/delete | None |
| Job operations | Start from 3MF or wrapped G-code; pause/resume/stop; plate and AMS mapping | Pause/resume/stop; no upload/start |
| Camera | TLS/JPEG snapshot only; no RTSPS implementation | None |
| Diagnostics | doctor checks TCP ports; print_error; no comprehensive HMS decoding | No diagnostic command; MQTT/JSON errors inadequately surfaced |
| Other actuation | Raw G-code, movement, homing, heating, fans, light, calibration, reboot | Raw G-code, heating, speed, light |
| Podman fit | Potential single executable in existing image, but no current exec grant | Python plus dependency needed; README's `bambu` wrapper is absent from ZIP |

Camera support must be assessed per model/firmware. OpenBambuAPI's
[video notes](https://github.com/Doridian/OpenBambuAPI/blob/main/video.md) distinguish
JPEG from RTSPS, and discuss H2D/H2S, not evidence for this H2C. Changing a port
alone cannot turn this CLI's JPEG decoder into an RTSPS client.

## Security and correctness findings

1. **Unauthenticated TLS server identity:** Go MQTT, FTP and camera clients use
   `tls.Config{InsecureSkipVerify:true}` without an alternative verifier. Python
   uses `ssl.CERT_NONE` and `tls_insecure_set(True)`. Transport encryption alone
   does not authenticate the printer. Access codes can be disclosed to an
   impersonated endpoint. Require verified device trust before sending credentials.
2. **Telemetry can falsely look successful:** Go `cmdStatus` and `cmdAMS` discard
   both PushAll and WaitForData errors. Missing numeric values become zero;
   absent AMS becomes null with successful JSON output. Python waits three seconds
   and defaults missing gcode_state to IDLE. Neither is acceptable readiness evidence.
3. **Read intent is not subscribe-only:** Go status and AMS publish `pushing/pushall`
   on `device/<serial>/request`. This is a telemetry request, not a print command,
   but must be explicitly admitted if subscribe-only telemetry is insufficient.
4. **No exact-job approval:** Go `cmdPrintStart` has no RequireConfirmation call;
   pause/resume also lack it. Stop uses an interactive/force token, not an
   authenticated approval bound to artifact, printer and settings. Python offers
   no approval gate for any action. Prompt instructions cannot supply this boundary.
5. **Acknowledgement gap:** Publishing a command does not establish printer
   acceptance or a physical state transition. Python prints success after fixed
   sleeps without checking device acknowledgement. Go start returns publish result.
6. **Configuration override risk:** Go reads project `.bambu.json` even when
   `--config` is supplied, and environment/flags override configuration. A future
   wrapper must fix target and credential path, sanitize environment, use a trusted
   working directory and prohibit arbitrary flags. Generic exec access is unsuitable.
7. **H2C semantics unproven:** Go start hardcodes textured plate and calibration
   settings, defaults AMS mapping to `0`, and lacks explicit H2C nozzle/toolchanger
   validation. Legacy single nozzle status fields do not prove complete H2C telemetry.
8. **Additional parser risks:** Go uses `json.Decoder.UseNumber`, but its float
   conversion calls Int64 on json.Number; decimal temperatures can become zero.
   Its snapshot is shallow and nested telemetry merge is partial. These are code
   findings, not reproduced hardware failures. Go flag parsing stops at the first
   positional argument: documented examples putting `--plate` after a filename
   require correction/verification before any operator use.
9. **No assumed read-only credential:** Both programs use the same `bblp` access
   code for reads and control. No restricted printer credential was demonstrated.
   Enforce Stage A in host-owned code, preserve agent tool denies and keep secrets
   outside the agent workspace. A read-only mount limits file modification, not
   what someone who can read that secret can do with it.

Evidence locations in the pinned Go tree: `cmd/bambu-cli/main.go` functions
resolvePrinter, cmdStatus, cmdAMS, cmdPrintStart, cmdPrintPause, cmdPrintResume;
`internal/printer/{mqtt,status,ftp,camera,payloads}.go`. Python evidence is in
`bambu.py`: get_client, get_status, send_command and print_control.

## Dependencies, maintenance and licensing

Go declares Go 1.22, Paho MQTT Go 1.4.3, jlaffaye/ftp 0.2.0, plus pinned indirect
websocket, x/net, x/sync and Hashicorp dependencies in go.mod/go.sum. This reduces
install ambiguity but is not a vulnerability assessment. No test files were found
in the inspected CLI tree. GitHub reports it is not archived; no newer commit than
January 8 was found. Open issues include
[FTPS session reuse on P2S](https://github.com/tobiasbischoff/bambu-cli/issues/2) and
[P2S camera/light](https://github.com/tobiasbischoff/bambu-cli/issues/1). These are
maintenance signals, not evidence of the same H2C failure.

Python instructs unpinned `pip install paho-mqtt`; its CallbackAPIVersion.VERSION2
usage requires the newer API. No lockfile, tests or LICENSE are in its archive.
The Go source also has no LICENSE file; GitHub license metadata is null. Both
skill cards leave License/Terms blank. Do not infer reuse/distribution permission
from a public download or the catalog's general open-source wording. Resolve the
license before vendoring or redistributing either candidate. Dependency licensing
must be reviewed separately: ftp metadata identifies ISC; Paho metadata returned
NOASSERTION and needs examination of the exact dependency release's license texts.
No comprehensive dependency/CVE audit was performed and no dependencies installed.

## Existing deployment and live observations

ClawOnshape checkout: `demo/gateway-native-read-20261014`, HEAD
`2ac80f88fa29a08a15aeb03d6e44ddfeb1910f43`, with pre-existing uncommitted work.
Inventory source: `deploy/team.json`; both listed team workspaces and role/contract
files were inspected. Runtime inventory is discovered rather than fixed to two roles.
Clawake reference checkout is detached at `4e3e43b`; main points at `5d0bf09`.
A separate worktree `clawake-integrate` contains branch
`fix/28-backup-and-upgrade-hardening` at `c412668`. No reference repository changed.

Locally verified using bounded `podman exec`:

- Both inventory-derived team containers run OpenClaw `2026.9.9 (bcfc888)`.
- Engineer health: `ok:true`; loaded claw-onshape plugin `0.2.10`.
- `openclaw config get tools.allow` matches the finite Onshape/Workshop tool set.
- `openclaw config get tools.deny` includes exec/process/read/write/edit/apply_patch,
  browser/web_fetch/web_search, sessions_spawn and gateway.
- `agents.entries.clawcad-mechanical-engineer.tools` adds only the existing tools.
- `skills list --json` shows the three Onshape Workshop skills, no Bambu skill.
- CLI help supports `skills install`, not the catalog's `skills add` recipe.
- Node require.resolve from the default container working directory did not resolve
  `mqtt`; this is not a complete image dependency inventory.

[Official skills documentation](https://docs.openclaw.ai/de/tools/skills) describes
skills as instructions plus supporting resources. A skill does not grant a missing
execution tool. Actual configured denies above take precedence over a skill recipe.
No model turn or forbidden-tool attempt was run to test enforcement dynamically.

Live GitHub state, checked October 20:

| Work | Observed status and implication |
| --- | --- |
| PR #33 | MERGED at 08:39 UTC, commit 5d0bf09; rollout/readiness/pins/Discord work exists on main; detached reference README is older |
| PR #35 | OPEN, head c412668, MERGEABLE, lint-test-render SUCCESS; backup hardening is not merged |
| #28, #29, #30, #31, #34 | OPEN; backup pruning/collision/atomicity/pins/privacy concerns remain tracked |
| #36 | OPEN; upgrade backup TarError still tracked separately |
| #26, #21 | OPEN despite PR #33 merge; do not equate PR merge with issue acceptance or live Discord migration |
| #24 | OPEN rollout ergonomics; inspect current implementation before adding rollout helpers |
| #22 | OPEN MCP logging; do not attach printer logging to that unrelated service |
| #19, #15, #16, #18, #17 | OPEN inventory/workspace/UID/provenance/timeout work |
| #25, #23, #20, #27, #32 | CLOSED integration/readiness/site values/JSON upgrade/validation work |
| PR #8 | Still OPEN older CI-formatting work; not a printer integration base |

Links: https://github.com/edge-robot/clawake/issues and
https://github.com/edge-robot/clawake/pulls. No issues, PRs, comments or messages
were created. Existing managed global and per-agent grant reconciliation is in
`src/clawake/services/gateway_config.py`; reuse it and preserve unmanaged grants
and explicit denies. Do not grant exec or replace Discord/A2A configuration.

## Minimal architecture and architect handoff

Recommendation: reuse Engineer, existing gateway, plugin provisioning, private
secret mounts and Workshop skill distribution. `bambu-cli` is the stronger
functional candidate but **not approved for deployment**. Prefer fixing upstream
license/trust/error handling before deciding whether a narrow CLI adapter is less
maintenance than a small native MQTT read adapter. Do not fork a full printer CLI
just to expose four telemetry fields.

| Option | Benefit/cost/boundary | Decision |
| --- | --- | --- |
| Existing Engineer + skill + native bounded tool | Same identity and lifecycle; one MQTT connection per bounded read; no extra model turn; needs host-side enforcement and signed result integration | Smallest fit |
| Native subagent task | Extra model turn/latency; no credential or protocol isolation by itself; sessions_spawn currently denied | No Stage A need |
| Persistent native agent in gateway | Separate context/routing but shared gateway trust; more policy and memory ownership | No demonstrated need |
| Separate Clawake instance/service | Independent lifecycle/OS isolation possible; more secrets, health, rollout and recovery work | Reserve for a concrete isolation/scaling requirement |

Proposed interface for architect review (not registered tools): one `printer_status`
operation, no arbitrary command, host, URL, topic, path, G-code or credential inputs.
Resolve a logical printer from host-owned team/project authorization, including a
validated signed requester context. Return typed connectivity, observation timestamp,
completeness, state/progress/ETA, AMS slot/material data and diagnostic codes.
Unknown fields remain null/UNKNOWN, never zero/IDLE by default. Bound payload size,
read deadline and retry count; redact errors; treat all printer text as data.
Expose hardware model/firmware verification separately from connectivity.

Start with subscribe-only `device/<configured serial>/report`. If full reports are
unavailable, separately review an exact immutable pushall payload. Do not expose
Publish as a tool or forward caller-supplied JSON. TLS trust must be verified before
MQTT authentication; no insecure fallback. Credential retrieval happens inside
host-owned implementation. A gateway compromise remains a boundary limitation.

The architect owns team/target binding, signed printer evidence and Lead delivery.
The current signed engineering workflow accepts only inspect/edit/verify CAD tasks;
`onshape_complete_task` verifies CAD observations, not printer status. Do not label
printer data as CAD-verified or overload existing signatures. Keep protected Primary,
exact CAD approvals and UNKNOWN reconciliation unchanged.

The product documents currently mention a print subagent. This user's October 20
instruction prefers the existing Mechanical Engineer; flag that product wording
for architect reconciliation without silently rewriting it. The existing architect
handoff specifies human transfer between sessions; no connected architect session
was demonstrated. This document is the concrete review handoff, **not an architect
approval or a claim that coordination has already occurred**.

Before managed rollout: resolve code/license gates, review the interface with the
architect, pin reviewed artifact and dependencies, provision private per-printer
configuration/secret, preview only Engineer changes using the current Clawake
revision and backup policy, and prepare rollback to prior pin/mount/grant state.
Add only the approved native read tool to both managed allowlists. Install the
reviewed Workshop skill through the existing workflow. Verify health, denial of
controls, unchanged CAD/A2A/Discord behavior and actual H2C telemetry. On failure,
withdraw the new grants and restore prior pins/config via managed reconciliation;
do not edit generated runtime JSON or delete pending CAD receipts.

## Hardware acceptance and private configuration

No H2C IP/serial/access-code file or trusted device certificate was supplied for
this task. No scan, cloud-login reuse or extraction from Studio credentials was
performed. To prepare the pilot:

1. Operator identifies the exact printer, firmware and network mode at its UI.
   Obtain IP, serial and LAN access code there; exact menu labels need firmware
   confirmation. Do not enable developer mode merely as a speculative fix.
2. Existing host paths found by filename-only inspection:
   `~/.config/BambuStudio/BambuStudio.conf` and `BambuNetworkEngine.conf`.
   Neither file's contents were read. No `~/.config/bambu` exists. These Studio
   files may contain private account/device data and are not deployment templates.
3. Create dedicated operator-owned config and access-code file outside `/workspace`,
   with private directory/file permissions, using existing secret provisioning.
   Reuse the pattern, not OAuth credentials. Supply only paths in chat. Do not
   mount all Studio configuration into the gateway.
4. Establish printer TLS trust through a verified CA/name or an independently
   confirmed certificate pin. A fingerprint from an unauthenticated first network
   connection alone is insufficient. Firmware changes may require a reviewed pin
   update. Exact H2C certificate support remains to be investigated.
5. From the existing container's network namespace, test only the assigned endpoint:
   TLS identity, MQTT authentication/subscription, timeout/offline behavior, idle and
   already-running status, progress, AMS trays, error codes. Compare with the printer
   display/Studio. Record firmware and timestamp; redact access codes and identities.
6. H2C-specific acceptance includes multiple nozzle/tool states and AMS topology.
   Missing fields must be reported unsupported/unknown. Do not induce a hazardous
   fault or start a job to test reads. Existing print observations suffice initially.

## Stage B: separate admission

Upload is a printer write and requires a reviewed target/path and immutable prepared
artifact. Upload consent does not authorize starting. Do not send unsliced STL as a
print job; wrapping G-code in ZIP is not slicing or profile validation.

Every start requires an authenticated human approval bound to team, physical printer,
artifact hash, plate, slicer/version, printer/nozzle/material/process profile hashes,
AMS slot/tool mapping, quantity and relevant safety/calibration settings. Confirm
local readiness (bed/plate/material) through the agreed human workflow. Expire and
consume approvals atomically; persist an attempt before dispatch. A different file,
printer or setting invalidates approval. MQTT publication is not start confirmation.
An uncertain result becomes UNKNOWN and requires read reconciliation; no automatic
retry, replay or duplicate start. CAD mutation and production approval are distinct.

Pause, resume and cancel need their own explicit authorization and current job
identity. Resume can restart motion/heating; cancel is destructive to the current
job. None is enabled by default. Raw G-code, heating, homing, movement, calibration,
firmware/reboot and arbitrary file deletion remain outside this integration.

## Slicing investigation

Installed host package: `bambu-studio 2.8.2.61-3`; CLI reports
`BambuStudio-02.08.02.61`. `--help` runs without DISPLAY/WAYLAND_DISPLAY.
Locally verified flags: `--datadir`, `--load-settings`, `--load-filaments`,
`--load-filament-ids`, `--slice`, `--export-3mf`, `--outputdir`, `--check-preset`.
Help itself created `result.json` in the working directory; the newly created
review artifact was removed. Future diagnostics must use a scratch working directory.

Installed resources contain 11 H2C-named machine/template files, 211 H2C-named
filament files and 18 H2C-named process files. The model advertises 0.2/0.4/0.6/0.8
nozzles; the 0.4 profile has two 0.4 nozzle entries and inherits
`fdm_bbl_3dp_002_common`. Default filament/process are Bambu PLA Basic / 0.20mm
Standard for H2C. Presence proves profiles exist, not that CLI input is complete.

An isolated synthetic 10 mm cube test used the installed raw machine, process and
PLA JSON profiles, one filament, `--arrange 1 --slice 0 --export-3mf`, no display,
a fresh `--datadir`, and scratch output. Result: **SIGABRT (return -6)** in
`std::vector<double>::operator[]`, after `no filament colors found in projects`.
No print file was admitted and no transfer attempted. This specific invocation
failed; raw inherited profiles and missing project/tool metadata may be relevant.
It does not prove every H2C CLI workflow fails. No workaround disabling checks
was attempted. Scratch evidence: `/tmp/bambu-review/slicing/result.log`.

[Official CLI usage](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage)
supports STL plus settings and slicing a prepared 3MF with embedded settings.
The next bounded test should use a GUI-prepared H2C project with explicit colors,
nozzle/tool state and material mapping, then compare CLI output with GUI preview.
Logical filament-to-extruder mapping must not be confused with physical AMS tray
mapping. No such reviewed pilot project was available here. For now preserve
manual Bambu Studio import, profile selection, slicing, preview and prepared-job
handoff; automated slicing and transfer remain unaccepted.

Historical H2C CLI [issue #9963](https://github.com/bambulab/BambuStudio/issues/9963)
is CLOSED (2026-05-18); do not cite it as an open blocker or the confirmed cause
of the local crash. OrcaSlicer was not found on PATH or in the checked config path;
this is not an exhaustive disk inventory. Upstream H2C support
[PR #14685](https://github.com/OrcaSlicer/OrcaSlicer/pull/14685) is MERGED (July 13).
Latest stable GitHub release query returned v2.4.2 (July 7); the
[release page](https://github.com/OrcaSlicer/OrcaSlicer/releases) advertises H2C in
2.5.0 alpha. Neither installed nor tested here. No reason to switch the existing
Bambu Studio workflow solely to avoid investigating one failed CLI invocation.

## Test evidence and remaining work

Completed: archive/hash inspection; pinned Go/Python source review; live runtime
version/health/grant/Workshop inspection; live GitHub status; local slicer help and
profile inspection; one isolated slicing attempt. No production code was changed,
so the unrelated CAD test suite was not run.

Two offline Python reproductions used the archive's actual bambu.py with an
in-memory fake paho module, synthetic config, no-op sleeps and **no sockets**:
no telemetry produces IDLE; pause with no acknowledgement produces success text.
Both assertions passed, confirming the error-reporting defects without printer IO.
Go findings above are static inspection only; the control CLI was not built/run.

Remaining, in order:

1. Architect agreement on the signed read interface and existing-Engineer ownership.
2. Resolve candidate license, TLS trust, timeout/completeness and dependency gates;
   select hardened CLI adapter versus small native read implementation.
3. Privately provision H2C target/credential/trust and record firmware; run bounded
   hardware read acceptance from the existing runtime before production activation.
4. Implement and negatively test the finite tool, then managed preview/rollback and
   read-only rollout with unchanged existing permissions.
5. Validate a complete GUI-produced H2C 3MF through CLI; retain manual slicing until
   reproducibility, AMS/nozzle mapping and preview are demonstrated.
6. Separately design/accept exact-job approvals and uncertain-outcome reconciliation
   before upload/start/pause/resume/cancel capabilities.
