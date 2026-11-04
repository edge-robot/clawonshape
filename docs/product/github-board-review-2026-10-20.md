# GitHub-Abgleich: Edge Robot Engineering #4

Stand: 20.10.2026, Abruf bis 12:21 UTC (14:21 CEST). Lesender Zugriff über den
freigegebenen Host-Broker; keine GitHub-Änderungen oder Runtime-Aufrufe.
Ergänzt und aktualisiert den [Wochenplan](weekly-execution-2026-10-25.md).

## Bestätigter Bestand

[Project #4](https://github.com/orgs/edge-robot/projects/4/views/1) ist privat und
erreichbar. Alle 29 gelieferten Karten wurden mit den drei Repositorylisten
abgeglichen. Keine doppelten Karten für dieselbe Repository-/Issue-URL gefunden.
Stand des letzten Board-Abrufs: 8 Backlog, 1 Ready, 3 In progress, 7 In review,
10 Done. Die 18 Felder enthalten bereits Status, Assignees, Priority, Size,
Start date und Target date. Keine zusätzlichen Felder oder Spalten nötig.
In den gelieferten Karten fehlen gesetzte Assignees, Priority und Termine.

Repository-Branches, frisch über GitHub gelesen:

| Repository | Arbeitsstand | Einordnung |
| --- | --- | --- |
| Clawake | `main` @ `85079c8cfa22` | PR #33 und #35 gemergt; #35 am 20.10. um 11:39:06 UTC. |
| ClawOnshape | `demo/gateway-native-read-20261014` @ `bdc93f6ef21e` | Aktuelle Entwicklung; GitHub-Default bleibt `feat/native-plugin-foundation` @ `a0e1a7865ba4`. Kein offener PR vorhanden. Nicht den Default-Branch als aktuellen Produktstand behandeln. |
| onshape-mcp | `claw-onshape/external-token` @ `acceacd9e8de` | Enthält Approval-v2-expand. Default `main` @ `f78ddc48a445`; kein offener PR. Integration/Release bleibt vom vorhandenen Feature-Branch zu unterscheiden. |

Clawake hat nur noch PR #8 offen, ein Formatter-Draft. Keine automatische
Branchumstellung, kein Merge und keine Schließung durch diese Prüfung.

## Korrekturen gegenüber dem ersten Wochenplan

- **Clawake #35/#28/#29/#30/#31/#34: erledigt.** PR gemergt, Issues geschlossen,
  Board Done. Aus NOW entfernen. #26 belegt zusätzlich die privaten Backups im
  echten Adoptionslauf. Keine erneute Backup-/Upgrade-Implementierung beauftragen.
- **Clawake #26: erledigt.** Während des Abgleichs geschlossen und Board auf Done
  aktualisiert. [Abschlusskommentar](https://github.com/edge-robot/clawake/issues/26):
  Adoption auf `85079c8`, private Backups, Lead/Engineer nach 79/86 s ready,
  SecretRef/Allowlist, anschließende Setup-/Rollout-Vorschau ohne Änderungen und
  positiver Discord-Roundtrip. #21 bleibt separat für den fehlenden Negativtest offen.
- **ClawOnshape #15: erledigt.** [Review und Push](https://github.com/edge-robot/clawonshape/issues/15)
  bestätigen `618076f`, Bericht `6a48d5b`, Push `bdc93f6`.
  Reproduzierbare Installation und `test:native-files` sind laut Review grün.
  `powerLossDurability` bleibt UNVERIFIED. Der ursprüngliche Lockfile-Blocker und
  die pauschale Aussage „Native-SDK-Test fehlt“ sind damit überholt.
- **MCP #1/#3: geschlossen, Board Done.** Nicht wieder als offene Arbeit planen.
  Ihre letzten sichtbaren Kommentare verlangen noch Image-/Live-E2E und enthalten
  keinen nachgetragenen Abschlussbeleg. Eine geschlossene Karte allein beweist
  diesen Runtime-Nachweis nicht. Architect ergänzt den Beleg im bestehenden
  Integrationsnachweis; keine erneute Katalog-/Rustls-Entwicklung.
- **MCP #2: expand implementiert, Board In review.** Commit `acceacd9` enthält den
  [Bericht](https://github.com/edge-robot/onshape-mcp/blob/acceacd9e8de79e2fd58857bc414149863da9c0e/docs/prompts/2026-10-16-approval-v2-expand.report.md)
  für `e894809..344d3e0`: v1/v2, Pflichtfreigabe beim Start, Candidate-Claims/-Reads
  und Replay-Schutz; 637 nextest-Tests, 638 inklusive Doctests sowie cargo deny grün
  laut Bericht. Replay-Speicher ist pro Prozess, begrenzt auf 1024 IDs; nach Restart
  bleibt CAS der Schutz. Review/CR-Abgleich und Live-Integration stehen an.
  Die frühere Bewertung „Pflichtfreigabe fehlt im Branch“ ist überholt.

## Empfehlungen für alle vorhandenen Karten

Owner sind Verantwortungsrollen zur Übergabe durch den Menschen, keine erfundenen
GitHub-Benutzernamen. Vorhandenes Assignees-Feld mit den tatsächlichen Accounts
belegen. Priority hat im Export keine Optionsliste; keine Werte erfinden, bis die
bestehende Konfiguration geklärt ist. NOW/NEXT in Beschreibungen reicht zunächst.

| Karten | Ist | Empfehlung, Verantwortlicher und Ziel |
| --- | --- | --- |
| ClawOnshape #1 | Backlog | Architektur-/Featureübersicht als Referenz führen. Keine zusätzliche Implementierungsschicht daraus ableiten; #11 liefert das Wocheninkrement. Architect. |
| ClawOnshape #2 | Backlog | Titel/Kriterien auf die beschlossene native MCP-Ausführung korrigieren; alte Factory-Forderung ist überholt. Status-/Capability-Lücke erhalten. Architect, bis 21.10. |
| ClawOnshape #3 | Backlog | NOW, unter #11 verfolgen. Entscheidung für Claims getroffen; nach integriertem Wegfall des Host-Reprovisionings schließen. Architect, bis 24.10. |
| ClawOnshape #4 | Backlog | Dokumentierte Audit-Hash-Entscheidung im Vertrag/ADR gegen das Kriterium prüfen; dann mit Entscheidung schließen. Kein neuer Hash-Mechanismus ohne Bedarf. Architect, bis 21.10. |
| ClawOnshape #5/#10 | In progress | Code und Teil-Live-Belege vorhanden. Review-/Closure-Belege ergänzen, bei verbleibender Abnahme In review. Nicht neu implementieren. Architect, bis 21.10. |
| ClawOnshape #6 | Ready | Readiness-Anzeige vervollständigen, falls für verlässliche Abnahme nötig; laufend und nutzbar unterscheiden. Architect, bis 22.10. |
| ClawOnshape #7 | Backlog | Bestehende Netzwerkgrenze und Freigabeentscheidung dokumentiert prüfen. Neue Auth-Architektur nicht automatisch Wochenumfang. Änderungen an Grenzen entscheidet der Mensch. |
| ClawOnshape #8 | Backlog | NOW: Spezifikation/README an akzeptierte und implementierte Fähigkeiten angleichen, ohne neue Live-Verfügbarkeit zu behaupten. Architect, bis 22.10. |
| ClawOnshape #9/#12/#14 | In review | Bestehende Reviews abschließen: Tooling, bereits reparierte Proposal-Fehler und fertige Vertragsarbeit jeweils getrennt von Produkt-E2E bewerten. Architect, bis 21.10. |
| ClawOnshape #11 | In progress | Hauptkarte NOW bis 24.10.: P0/P1 nicht erneut planen; MCP-expand reviewen, Plugin-P3 und statische P4-Konfiguration integrieren, P5 am Platten-Minimalbeispiel abnehmen. Langlebige richtige Channel-Ergebnisse einschließen. Architect. |
| Clawake #36 | Backlog | NEXT; geringer TarError-Fehler ohne vorangehende Mutation. Clawake Developer. |
| Clawake #34/#35/#28/#29/#30/#31 | Done | Unverändert erledigt lassen. Vorhandene Merge-/Test-/Adoptionsbelege verlinken. |
| MCP #1/#3 | Done | Unverändert geschlossen; fehlenden Abschlussnachweis zum tatsächlichen Image nachtragen. Architect, zusammen mit nächster Integration. |
| MCP #2 | In review | NOW: expand technisch reviewen, Klarstellungen bestätigen, v1-Kompatibilität und danach v2 mit Plugin prüfen. Kein zweiter Entwicklungsauftrag. Architect, Review bis 21.10. |
| Clawake #5 | In review | Reale Pin-Änderung für genau einen Member bei der nächsten Integration nachweisen. First-run-Bootstrap-Restscope separat kenntlich lassen; nicht pauschal schließen. Clawake Developer, bis 22.10. |
| Clawake #17 | Backlog | NOW: Timeout-Budget und abgeglichenen unklaren Ausgang prüfen; getrennt vom A2A-Timeout. Clawake Developer, bis 21.10. |
| Clawake #21 | In review | Einziger ausdrücklich benannter Rest: Nicht-Allowlist-Nutzer darf keinen Aufruf/Reply auslösen. Zweites Testkonto fehlt; Mensch stellt Teilnehmer bereit, Operator führt aus. Clawake Developer, bis 22.10. |
| Clawake #24 | In review | Implementierter Rollout: mit echter Pin-Änderung/idempotenter Wiederholung abnehmen; Teilkriterien gegen #5/#19/#22 prüfen, danach nur erfüllten Scope schließen. Clawake Developer, bis 22.10. |
| Clawake #26 | Done | Live-Adoption belegt, erledigt lassen. Nicht erneut planen. |
| ClawOnshape #15 | Done | Reproduzierbaren Build-Fix erledigt lassen; grüne Installation/native Dateiprüfung künftig als erwartete Gates verwenden. |

Keine Karte im abgerufenen Bestand deckt ausdrücklich die vollständige
pib-Teilauswahl/STL- oder H2C-Vorbereitungsreise ab; auch die aktuellen Issue-Listen
enthalten keine entsprechende eigenständige Aufgabe. #1 erwähnt Export als
Zielbild. Empfehlung: dort verlinkte, jeweils kleine Umsetzungskarten ergänzen,
falls der Architect/Clawake Developer keine bereits laufende Entsprechung liefert:
revisionsgebundener pib-STL-Export (Architect) und H2C-Vorbereitung im Engineer-Ablauf
(Clawake Developer). Kein weiteres Epic/Board und kein automatischer Druckstart.

Die nicht im Board enthaltenen offenen Clawake-Tickets #14/#15/#16/#18/#19/#22
bleiben im Repo auffindbar. Nur für den Pilot notwendige Punkte unter #24/#11
referenzieren; keine pauschale Verschiebung aller Tickets in diese Woche.

## Wirkung auf die Woche

Dienstag/Mittwoch entfallen Backup-Fix, Discord-Adoption und Lockfile-Reparatur als
Entwicklungsarbeit. Die frei werdende Zeit gehört Plugin-P3, korrekter später
Ergebniszustellung und der vollständigen Plattenabnahme. MCP-expand wird zuerst
reviewt und integriert. Die pib-STL-/H2C-Reise bleibt der zweite begrenzte Strang,
ohne Mutation am pib zu verlangen. DoD und menschliche Freigabegrenzen bleiben bestehen.

Aktuelle Tickets und Status werden direkt im [Project #4](https://github.com/orgs/edge-robot/projects/4/views/1)
und den verlinkten GitHub-Issues/PRs gelesen. Dieser Bericht hält die Bewertung
zum genannten Zeitpunkt fest; lokale Kopien der GitHub-Daten werden nicht gepflegt.
Keine Aussage über eine heute von mir geprüfte Runtime.
