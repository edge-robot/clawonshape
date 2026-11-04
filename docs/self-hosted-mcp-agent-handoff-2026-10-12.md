# Agent-Handoff: Claw-Onshape / lokales Onshape MCP

Stand: 2026-10-12, letzte Dienstprüfung ca. 18:31 UTC / 20:31 CEST.
Dieser Bericht ist ohne Chat-Kontext lesbar. Die Originalmission ist **nicht
abgeschlossen**: Der lokale Read-only-Dienst läuft, aber native gebundene Aufrufe
und CAD-Mutation bleiben BLOCKED. Es gab keinen Candidate- oder CAD-Schreibversuch.

## Auftrag und verbindliche Grenzen

Ziel: hosted Onshape Labs MCP durch ein selbst gehostetes, von Clawake verwaltetes
`altendky/onshape-mcp` ersetzen. Claw-Onshape bleibt OAuth- und einziger
Refresh-Owner. Danach soll ein ausdrücklich genehmigter, einzelner Versuch
`Camera Mount Plate / plateWidth: 50 mm → 60 mm` auf einem Candidate erfolgen.
Primary darf niemals mutiert werden.

REST Control Plane = Claw-Onshape: OAuth, Refresh, vertrauenswürdige Zielbindung,
Candidate-Erstellung, Revision, Operatorfreigabe, unabhängige Prüfung und Rendering.
MCP Data Plane = lokaler Dienst: strukturierte Onshape-Ausführung, später eng
begrenzte Mutation/FeatureScript. Deployment = Clawake: Lifecycle, Isolation,
Konfiguration, Mounts, Health, private Verbindung; kein Credential-Broker.
Mechanical Engineer erhält nur bewachte Fähigkeiten, keine freien REST-Aufrufe,
Credentials oder generischen MCP-Schreibwerkzeuge.

Nicht umgehen: kein eigener MCP-Client/Proxy als Ersatz für native OpenClaw-
Invocation, keine privaten gehashten SDK-Imports als Produktionsschnittstelle,
keine erfundene Session-/Scheduler-Authority, keine zweite OAuth-/Refresh-Instanz.
Ein Preflight-GET ersetzt kein providerseitiges CAS. Nach unklarem Write-Timeout
kein Retry: UNKNOWN persistieren, Providerzustand abgleichen, neuen Versuch erst
nach Reconciliation zulassen. Eine spätere Live-Mutation erfordert separate,
explizite Operatorfreigabe für das konkrete Candidate-Payload.

## Repositories und Push-Stand

Workspace: `<workspace>`.

| Repo / lokales Verzeichnis | Gepushter Branch | Commit der Implementierung |
|---|---|---|
| [edge-robot/clawonshape](https://github.com/edge-robot/clawonshape/tree/feat/native-plugin-foundation) / `clawonshape` | feat/native-plugin-foundation | ba2a5d6 |
| [edge-robot/clawake](https://github.com/edge-robot/clawake/tree/fix/14-discord-message-grants) / `clawake` | fix/14-discord-message-grants | 68679f311cda738b3e22e65749d476dbc99b5401 |
| [edge-robot/onshape-mcp](https://github.com/edge-robot/onshape-mcp/tree/claw-onshape/external-token) / `onshape-mcp` | claw-onshape/external-token | 80d9f3a; README-Publikation c959c2d126b518e2ae248b21eabb58206bd9dae6 |

Dieser Bericht und aktualisierte Fork-Metadaten folgen in einem zusätzlichen
Claw-Onshape-Dokumentationscommit auf demselben Branch. Die Änderung am README
ändert den getesteten MCP-Code nicht. Keine Branches wurden gemergt, keine PRs
erstellt und kein Force-Push ausgeführt. Beim Claw-Onshape-Push wurden auch die
fünf vorher lokal committed Vorgänger mit veröffentlicht: c644a49, 12da2be,
b8d1416, 42f41b3, f8e95b1. Das sind A2A-, Candidate- und Readiness-Voraussetzungen.

Upstream-Basis des MCP: `f78ddc48a445765f32fcf052d9d8e6d709497d56`,
workspace 0.5.3-dev.0, MIT OR Apache-2.0. MCP-Remote `origin` bleibt altendky;
**nur `edge-robot` zum Push verwenden**. Clawake origin ist SSH, Claw-Onshape
origin HTTPS. Beide ersten Pushes scheiterten an fehlendem Git-Helper bzw. SSH-
Schlüssel. Vorhandene GitHub-CLI-Anmeldung funktionierte; keine Tokens ausgegeben.
Pushes erfolgten mit einem pro Aufruf gesetzten Helper, ohne globale Git-Konfig:

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push <remote-or-https-url> <branch>
```

## Vorhandene lokale Änderungen erhalten

Diese Änderungen waren vor der Integration vorhanden und wurden bewusst weder
committed noch gepusht. Nicht verwerfen oder beiläufig in neue Commits aufnehmen:

- Claw-Onshape: README.md, agents/agent-lead.md, agents/mechanical-engineer.md,
  docs/architecture.md; untracked docs/camera-mount-mcp-live-sprint-2026-10-12.md
  und docs/evidence/camera-mount-mcp-{catalog,live-sprint}-2026-10-12.json.
- Clawake: docs/omarchy-harness.md, src/clawake/cli.py, src/clawake/config.py,
  src/clawake/services/gateway_config.py, tests/test_gateway_config.py. CLI/config
  enthalten gemischte Änderungen; nur unsere MCP-Hunks wurden committed. Die
  verbliebenen Änderungen betreffen unter anderem bestehende globale Tool-Grants.
- onshape-mcp war nach dem Push clean; dort sind die sechs Rust-Dateien und README
  committed. Temporäre Build-Caches/Artefakte aus /tmp wurden nicht hineinkopiert.

Die laufende Deployment-Konfiguration bewahrt die bestehenden Grants. Ein frischer
Clone ersetzt nicht automatisch den gesamten aktuellen lokalen Runtime-Zustand.
Keine fremden Grant-Änderungen bei einem Re-Deployment zurücksetzen.

## Implementierung und Phasenstatus

| Phase | Status und Beleg |
|---|---|
| Architektur / Inventar | Erledigt: vorhandene ADRs, Code, Dashboard, Clawake und Upstream gelesen; Matrix und ADR-018 ergänzt |
| Lokaler Runtime | Erledigt: gepinnter separater rootless Service; native names-only Discovery PASS |
| Credentials | Erledigt für MVP: access-only atomare Datei, einzige bestehende Refresh-Instanz, Rotation/Expiry getestet |
| Native Read-only-Integration | PARTIAL: Discovery PASS; vollständige native Schemas und Auth-/Dokument-/Feature-Aufrufe nicht akzeptiert |
| Mutation-Vertrag | PARTIAL: exakte Operation/Skew-Schema bekannt; API-Version und Live-CAS unakzeptiert |
| Fehlende Features | External-token und Read-only-Isolation implementiert; bewachte Mutation/Attempt-Ledger noch nicht implementiert |
| Kontrollierter Live-Test | BLOCKED; keine Candidate-Erstellung, kein Freigabeaufruf, kein Write |

Claw-Onshape 0.2.2 ist in Engineer installiert; Lead behält 0.2.1 und seine
Read/Render-/A2A-/Discord-Konfiguration. Bestehendes REST-OAuth bleibt erhalten.
`src/mcp-credentials.ts` publiziert über native private atomare Secret-Dateien
nur accessToken, expiresAt (Epoch-ms), scopes. Store-Änderungen invalidieren den
Handoff zuerst. `src/mcp-token-owner.ts` synchronisiert serialisiert alle 15 s mit
dem bisherigen Owner/Refresh-Lock und widerruft bei Fehler/Dispose.
`localMcp` bindet genau eine vorhandene Connection und ein privates Verzeichnis.
`src/mcp.ts` nutzt lokale URL und separate Statusprojektion. Dashboard zeigt
configured/running sowie Credential AVAILABLE/MISSING/EXPIRED/UNKNOWN; Discovery
bleibt UNKNOWN, da names-only keine vollständige aktuelle Schema-Akzeptanz ist.
`rejectMcpCall` verweigert weiterhin alle Claw-Onshape-MCP-Aufrufe.

Upstream-Patch: sechs Rust-Dateien, 209 zusätzliche / 6 entfernte Zeilen. Optional
`[external_token]` mit file, document_id, workspace_id, element_id. Keine OAuth-
Initiierung, Refresh, Legacy-Tokenübernahme, Watcher, Persistence oder Retry in
diesem Modus. Strenge JSON-/Ownership-/Permission-/Link-/Größenprüfung; pro Dispatch
neu laden, Expiry mit 30-s-Marge. Nur gelistete exakte GETs; alle Writes, fremden
mutable Targets, freie Header, Query-Parameter, Bodies und Dateizugriffe abweisen.
Keine Candidate-Mutationsfreigabe in diesem Patch enthalten.

Extern sichtbare fünf Werkzeuge: onshape_api_search, onshape_api_explain,
onshape_api_schema, onshape_api_call, onshape_auth_status. Native Discovery ergänzt
resources_list/resources_read. Insgesamt sieben Namen, null tools/call-Aufrufe.
Elf vollständige Upstream-Schemas wurden aus Source generiert und als getrennte
Evidenz gespeichert; das ist keine native Schema-Abfrage.

## Runtime und operatorseitige Pfade

Service: `clawonshape-mcp.service` / Container `clawonshape-mcp`.
Client: `clawcad-mechanical-engineer`; Lead: `clawcad-robotics-lead`.
Privater Bridge: `clawonshape-mcp-private`, URL
`http://clawonshape-mcp:8080/mcp`. Keine veröffentlichten Ports; Provider-Egress
ist erforderlich. Separater UID/GID-1000-Container, keep-id, read-only root,
NoNewPrivileges, alle Capabilities entfernt, kein Agent-Workspace/Engine-Socket,
Credential-Mount read-only, /tmp 16 MiB, pids 128, RAM 512 MiB, CPUQuota 100%.

Gespeicherter produktiver native MCP-Connector zeigt auf diese lokale URL und
bleibt **enabled:false**. Nur das Operatorprofil
`onshape-local-readonly-20261012` aktiviert Discovery. Das Profil ist keine
Engineer-Mutationsautorität. Lead/Engineer-Grants und A2A/Discord wurden erhalten.

Private, ignorierte Host-Dateien unter `clawonshape/state/deployment/`:

- `team.json`: aktuelle Clawake-Team-Konfiguration; `team-self-hosted.json` als
  staging copy. Nicht ungeprüft wieder die staging copy über die aktuelle kopieren.
- `onshape-mcp/service.json`: gepinnter Clawake-Service-Spec.
- `onshape-mcp/config.toml`: nicht-secret Ziel-/Transportkonfiguration.
- `onshape-mcp/credentials/`: private Handoff-Datei; niemals ausgeben/committen.
  Engineer sieht sie unter /run/onshape-credentials read/write, MCP read-only.
- `artifacts/edge-robot-claw-onshape-0.2.2.tgz`: installierter Engineer-Plugin-Pack.
- `artifacts/self-hosted-mcp-before-20261012/{feature-before.json,before.png}`:
  unabhängige REST-Baseline; kein Tokeninhalt.
- `onshape-mcp/verify-readonly.mjs`: operatorseitige REST-Diagnose, kein nativer
  MCP-Akzeptanzersatz. Nicht für Mutationen verwenden.
- `backups/self-hosted-mcp-20261012/`: Team-/Runtime-Backups, owner-only.

Quadlets: `~/.config/containers/systemd/clawonshape-mcp.container`
und `clawonshape-mcp-private.network`. Deployment immer über Clawake verwalten.
Build läuft isoliert ohne Produktionsmounts; finaler Austausch erfolgte nach den
Tests mit Stop → Digest-Update → Clawake Apply/Start → Health/Discovery.

| Gepinntes Artefakt | SHA-256 |
|---|---|
| Laufendes Image | d2a4404afabecf7059cd94427104a3b23cc5fe88cfdf371e6980357fd244e90f |
| Stripped Rust-Binary | b979220bf040c086367842c7aa28e7c01188c564ad4937830cfcd5759c611ec1 |
| Code-Patch | c97f3f80453cd01776552fb85594be2756e9871f32099e1a97dbc33c210e46cd |
| Installiertes Plugin-Archiv | d1a16f67caedcd5d3a0b02ef26da9491b70bd0c135fbf3e49f171050480b9c1a |

Build-Assets: `clawonshape/deploy/onshape-mcp/`; gepinnte Rust-/Debian-Images und
Cargo.lock, Rust 1.99.0. Debug-Binary wird gestripped. apt-Paketauflösung ist noch
nicht separat versioniert; spätere Builds können andere Image-Digests ergeben.
`build.sh` klont die Originalrevision und appliziert den Patch. Auf dem bereits
modifizierten Fork-Branch den Patch **nicht noch einmal** anwenden.

## Bekannter Live-Zustand und Mutation-Vertrag

Letzte neue Health-Prüfung: `/health = 200`, `/health/ready = 200`, ca. 18:31 UTC.
Der Operator hat zuvor Read-OAuth im Engineer-Dashboard
`http://localhost:19489` erneuert und „verbunden“ bestätigt. Das ist keine Write-
Genehmigung. Bei späterer 503/Expiry die aktuelle REST-Verbindung prüfen, keine
Credentials restaurieren/duplizieren. Bestehende Refresh-Zuverlässigkeit bei
providerseitig abgelaufenen Tokens bleibt offen.

Unabhängige Live-REST-Beobachtung: **2026-10-12T18:08:07.723Z**, kein späterer
CAD-Zustand behauptet. Primary nach den Reads unverändert:

| Ziel | Wert |
|---|---|
| Dokument | 8b63eacf80efca72049f8017 |
| Source / Primary wid | 1e76fac0ddca3ed10ecc9f28 |
| Part Studio eid | 7768b96c15d71e78cdbdd7d9 |
| Microversion | b83ee0a0efcda65537780ef8 |
| Feature fid | F37MrGsqQOiSdYi_0 |
| Name / Typ | ClawCAD Mount Plate 1 / clawcadMountPlate |
| Parameter | plateWidth = 50 mm; Feature-Status OK |
| libraryVersion / serializationVersion | 3095 / 1.2.23 |

Baseline-PNG 800×800, 42.710 Bytes, SHA-256
`3475c98025ecc2b6abc31eba18db48888843e4fa8570422cc0ab8f048f2e5c26`.
Das Bild ist kein dimensionaler Geometry-Test.

Exakte Catalog-Operation: `updatePartStudioFeature`, POST
`/partstudios/d/{did}/w/{wid}/e/{eid}/features/featureid/{fid}`,
OAuth2Write. Request `BTFeatureDefinitionCall-1406`: kompletter kopierter Feature-
Payload, btType, unveränderte libraryVersion/serializationVersion, **Candidate**
sourceMicroversion, rejectMicroversionSkew:true. Nur genehmigten Ausdruck ändern.
Response `BTFeatureDefinitionResponse-1617` mit feature/featureState/revision.
MCP api_call-Argumente heißen endpoint, path_params, query_params, header_params,
body, file_refs; explain benutzt endpoint, schema benutzt schema.

Der Catalog dokumentiert providerseitige Skew-Ablehnung. Keine Live-Stale-Write-
Prüfung wurde vorgenommen. Catalog advertisiert API v16, aktueller Adapter nutzt
fix v10 wie REST: exakte Write-Version-Kompatibilität bleibt UNKNOWN. Das Feature
verweist auf externes FeatureScript; Parameteränderung kann Regeneration und
Topology-/Downstream-Referenzen verändern. Keine FeatureScript-Quelländerung ist
für den Width-Test vorgesehen.

Es gibt **keinen Candidate wid**, keinen genehmigten Payload und keinen Attempt.
Source wid ist Primary und darf niemals als Write-Ziel eingesetzt werden. Die
bestehende REST-Candidate-Funktion mit persistenten UNKNOWN-Receipts behalten;
Candidate-Erstellung nicht in MCP verlagern oder nach Unklarheit wiederholen.

## Tests, Grenzen und Dokumentationsindex

Letzte Implementierungsprüfungen bestanden: upstream Rust 697/697, Claw-Onshape
78/78, TypeScript PASS, Clawake 254/254, Ruff der geänderten Python-Dateien PASS.
Gezielte Coverage: fehlende/abgelaufene/rotierte Tokens, Refresh-Ausschluss,
private Dateirechte/Symlinks, Ziel-GET/Write-Denial, Status ohne Secret-Ausgabe,
Service-/Registry-Konfiguration und native Probe-Vertragsprüfung. Vorhandene
OAuth-/Candidate-/Dashboard-/Read-/Render-/Role-Tests liefen mit.
Die Counts stammen aus den damaligen lokalen Working Trees einschließlich der
oben aufgeführten vorher vorhandenen Änderungen; kein separater Clean-Clone-Test
wurde behauptet. Die anschließenden Publikations-/Handoff-Änderungen sind nur Docs.

Nicht akzeptiert: native Auth-/Dokument-/Feature-Aufrufe, komplette native Schemas,
Candidate-only **Writes**, falsches Element/Operation/Stale-Revision bei Mutation,
doppelte Mutation-Attempts, Write-Timeout-Reconciliation, neue Discord-Regressions-
journey, Geometry-/Render-/Primary-Verifikation nach einer Mutation. Bestehende
Candidate-Creation-Tests sind keine Mutation-Replay-Tests.

Zuerst lesen:

1. [Integrationsbericht A–L](self-hosted-mcp-integration-2026-10-12.md),
   [Feature-Matrix](self-hosted-mcp-feature-matrix.md),
   [Architektur](self-hosted-mcp-architecture.md), ADR-018 in [ADR.md](ADR.md).
2. [Read-only-Evidenz](evidence/self-hosted-mcp-readonly-2026-10-12.json),
   [Mutation-Operation/Schemas](evidence/self-hosted-mcp-mutation-contract-2026-10-12.json),
   [Source-Schemas](evidence/self-hosted-mcp-upstream-tool-schemas-2026-10-12.json).
3. docs/architecture/control-data-plane.md, docs/plans/cad-mutation-mvp.md,
   docs/product-mvp-status.md, docs/mcp-dashboard-readiness.md; ältere Abschnitte
   sind historisch, explizite ADR-018-Amendments gelten für den lokalen Connector.
4. Fork README und external_token.rs; Claw-Onshape mcp.ts,
   mcp-credentials.ts, mcp-token-owner.ts, credentials.ts, authorization.ts,
   config.ts, index.ts; Clawake services/onshape_mcp.py und runtime_config.py.

Der lokale, noch untracked Camera-Mount-Sprint dokumentiert eine wichtige native
Fehlermeldung: **Session MCP runtime scheduler has not been bound by its lifecycle
owner**. SessionMcpRuntime-Typen und öffentliche Catalog-/Harness-Helfer existieren,
aber standalone Acquisition liefert nicht automatisch Plugin-Authority. Das wurde
nicht durch private Imports oder Scheduler-Manipulation umgangen. „Kein unterstützter
Pfad etabliert“ ist der Befund; nicht alle zukünftigen OpenClaw-Versionen werden
damit ausgeschlossen. Pinned Runtime bleibt OpenClaw 2026.9.9.

## Genau eine nächste Aufgabe

**Eine unterstützte ownergebundene native OpenClaw-MCP-Acquisition/Invocation-
Schnittstelle für Claw-Onshape mit vollständigen Tool-Schemas etablieren, ohne
Raw-Tools in Engineer-Sessions zu projizieren.** Erst mit Read-only Auth-/Ziel-/
Feature-Abfragen akzeptieren. Den vorhandenen öffentlichen SDK-Vertrag und dessen
Lifecycle-/Requester-Ownership untersuchen; nötige SDK-Erweiterung isoliert und
reviewbar vorbereiten. Runtime-Version nicht stillschweigend upgraden.

Akzeptanz: exakter Owner/Requester/Session-Kontext, natives Catalog/Invocation-
Handle und Dispose, vollständige Input/Output-Schemas, feste lokale Serverbindung,
kein generischer Agent-Bypass, keine Tokens in Resultaten/Logs. Erst danach die
nachgelagerten Write-Gates bearbeiten: geprüfter Candidate, gebundene Genehmigung/
Payload/Operation/Revision, providerseitiges CAS, persistenter einzelner Attempt,
UNKNOWN-Reconciliation und unabhängige Nachprüfung. Noch keine Live-Freigabe fragen.

Optionale operatorseitige Read-only-Prüfungen auf dem bestehenden Host:

```bash
cd <workspace>/clawake
.venv/bin/clawake onshape-mcp --config ../clawonshape/state/deployment/onshape-mcp/service.json --action status --execute
.venv/bin/clawake onshape-mcp --config ../clawonshape/state/deployment/onshape-mcp/service.json --action probe --execute
podman exec clawonshape-mcp curl --fail --silent http://127.0.0.1:8080/health/ready
```

Probe konfiguriert nur das isolierte Operatorprofil und entdeckt Namen; keine
CAD-Aufrufe. Es ist kein Ersatz für die nächste Aufgabe. Host-/Netzwerkbefehle
können Sandbox-Freigaben benötigen. Private State-/Credential-Dateien nicht in
Tool-Ausgaben dumpen. Vor neuem Arbeiten git status prüfen und erhaltene Änderungen
respektieren; bei unklaren Write-Gates Mutation gesperrt lassen.
