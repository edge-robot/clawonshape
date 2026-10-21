# Wochenplan pib Agentic Engineering – bis 25. Oktober 2026

Aktualisiert am 20.10.2026 nach erfolgreichem GitHub-/Board-Abgleich.
Maßgeblicher neuer Stand: [Board-Review mit allen 29 Karten](github-board-review-2026-10-20.md).
Die dortigen aktuellen Abschlüsse ersetzen die älteren Statusangaben und bedingten
Closure-Empfehlungen dieser ersten Untersuchung.

Stand: 20.10.2026, Europe/Berlin. Produktbewertung und vorgeschlagene Übergabe an
die drei Verantwortlichen; keine Implementierungs-, Deployment- oder CAD-Freigabe.

## Ziel und kürzester Weg

Nutzerentscheidung vom 20.10.: Mutation bleibt am Minimalbeispiel der
[Produktvision](vision-and-features.md): vier Befestigungsbohrungen gezielt ändern,
Positionen und Außenmaße erhalten. 5 mm sind dort ein illustrativer Zielwert,
vor Ausführung am Modell zu bestätigen. Das geprüfte Candidate-Ergebnis erreicht
den ursprünglichen Channel; ein zweiter Auftrag funktioniert ohne Host-Reparatur.

Die separate [pib-Reise](pib-user-journey.md) beginnt mit der Auswahl eines
tatsächlich benötigten vorhandenen Teils und führt über den freigegebenen CAD-Stand
zu STL und H2C-Druckvorbereitung. Eine Mutation ist dafür keine Voraussetzung.

Vorhandenen nativen MCP-, A2A-, REST-Render- und Clawake-Pfad vervollständigen.
Die demonstrierte Dickenänderung ist die technische Ausgangsbasis. Keine neue
CAD-Plattform, kein neuer Renderer, kein neues Projektmanagementsystem.
`clawcad` ist historische Evidenz, keine aktive Implementierung.

Anforderungen bleiben in [Produktvision](vision-and-features.md),
[pib-Reise](pib-user-journey.md) und [Feature-Trace](feature-trace.md).
Dieser Plan priorisiert ein Wocheninkrement; spätere zugesagte Features entfallen
dadurch nicht. Termine sind Zieltermine, keine nachgewiesenen Kapazitätszusagen.

## Untersuchungsstand und Grenzen

| Quelle | Tatsächlich untersucht | Grenze |
| --- | --- | --- |
| ClawOnshape lokal | Branch `demo/gateway-native-read-20261014`, HEAD `2ac80f88fa29a08a15aeb03d6e44ddfeb1910f43`; Git-Status/Log/Branches; README, Produktunterlagen, ADRs, Vertrag, Berichte, Agentenanweisungen, Implementierung und Testquellen | Working Tree verändert; u. a. `deploy/team.json` und Vertrag modifiziert, `biome.json` lokal gelöscht, `docs/product/` untracked. Privates GitHub jetzt über Broker lesbar: Arbeitsbranch bdc93f6, Issues/PRs im Board-Review abgeglichen. Lokaler Checkout wurde nicht aktualisiert. |
| Clawake | Freigegebene lokale README, `docs/`, `src/`; öffentliche Issues und PRs #8, #33, #35 | Lokales `.git` und lokale Tests nicht freigegeben. Öffentlicher PR #33: Merge nach `main` als `5d0bf09` am 20.10.; letzter Branch-HEAD und lokaler Checkout dadurch nicht bewiesen. |
| onshape-mcp | Öffentliche README, Issues #1–3, PR-Liste; Branch `claw-onshape/external-token`: `tools.rs`, `config.rs`, `tests/contract.rs`, IO `lib.rs`/`external_token.rs`, G1- und Rustls-Berichte | Kein lokaler Zugriff; gelesene Branch-Dateien sind veränderliche Referenzen. Aktuelle Remote-Branchliste über Broker nachgelesen; Feature-HEAD acceacd9, siehe Board-Review. Öffentliche PR-Liste zeigt keine offenen PRs. Neuere private/unveröffentlichte Arbeit bleibt unbekannt. |
| GitHub Project | Vom Menschen bestätigter Link: [Edge Robot Engineering #4, View 1](https://github.com/orgs/edge-robot/projects/4/views/1) | Jetzt erreichbar: alle 29 Karten und 18 Felder gelesen, kein Duplikat derselben Item-URL gefunden. Konkrete Empfehlungen im Board-Review ersetzen den ersten bedingten Stand unten. |
| Runtime und Tests | Bereinigte, datierte Repositorybelege und Testquellen gelesen | Keine neuen Tests, Runtime-Proben, CAD-Aufrufe oder Nachrichten ausgelöst. Berichts-Testzahlen sind historische Ergebnisse, keine heutige Wiederholung. |

Der freigegebene lesende gh-Broker funktioniert jetzt. Alle drei Repositorylisten,
Remote-Branches und das Board wurden abgeglichen. Direkte Netz-/Credential-Zugriffe
bleiben gesperrt; lokale Checkout-/Runtime-Zustände anderer Repositories bleiben
unterscheidbar von den nun belegten GitHub-Ständen.

## Ist-Zustand und Lücken

„Implementiert“ beschreibt Code oder einen benannten Teilnachweis, nicht automatisch
Deployment oder vollständige Nutzerabnahme. „Blockiert“ kann fehlende Abnahmebelege
bedeuten. „Fehlend“ gilt nur für den untersuchten Umfang.

| Arbeit | Einordnung | Beleg und verbleibende Lücke |
| --- | --- | --- |
| Discord → Lead → Engineer → CAD-Lesen/PNG | Implementiert, historisch abgenommen für einen Owner | [MVP-Abnahme](../product-mvp-status.md), native Reads vom 14.10.; Empfang des PNG vom Nutzer bestätigt. Heute nicht erneut geprüft. |
| Freie inspect/edit/verify-Aufgaben, signierte Zuordnung, unabhängige Featureprüfung | Implementiert; Agentenreise teilweise | `src/delegation.ts`, `src/rest.ts`, `tests/engineering-tasks.test.mjs`. Lead-Regeln enthalten zugleich alte pauschale Mutationssperren und neue Candidate-Anweisungen; harmonisieren und mit echten Aufgaben testen. |
| Candidate-Dickenänderung | Teilweise als Produktreise; Live-Mutation nachgewiesen | [R7 am 16.10.](../evidence/2026-10-16-mutation-path-acceptance.md): genau ein Update, Receipt VERIFIED, Approval gelöscht. Lead meldete fälschlich UNKNOWN; unabhängige geometrische Nachprüfung und vollständige Vorher-/Nachher-Zustellung fehlen. |
| Ablauf-/Payload-Reparaturen #5/#10/#12 | Implementiert, gezielte Abschlussprüfung | `src/mutation-workflow.ts`, `tests/mutation-workflow.test.mjs`, Berichte vom 16.10.: `apiCall`, terminales REJECTED nach ungenutzter Freigabe, Strukturprüfung und Versionsdrift. R1/R5/R6/R7 stützen Teilabnahmen. Nicht erneut entwickeln. |
| Wahrheitsgemäßer Mutationsstatus #2/#8 | Teilweise; konkrete Lücke im Code | `src/capabilities.ts` setzt `execute_mcp_cad_mutation` pauschal UNAVAILABLE. Das beschreibt die nachgewiesene Live-Fähigkeit nicht korrekt. README und Teile der ADR-Einleitungen sind ebenfalls veraltet. |
| Vereinfachte Freigabe #11, Vertrag #14, Spike #13 | Teilweise | [ADR vom 16.10.](../ADR.md): Richtung entschieden, 1.0.0-draft vorhanden, nativer Slash-/Folgemeldungs-Spike live bestanden. Produktionsreife Freigabeverifikation, langlebige Ergebniszustellung, Candidate-Claims und Migration nicht als integriert belegt. `src/` des untersuchten Plugin-Branches enthält keinen `registerCommand`-Freigabepfad. |
| Pflichtfreigabe im MCP, onshape-mcp#2 | Implementiert im aktuellen Feature-Branch, In review | `claw-onshape/external-token` @ `acceacd9e8de`: expand mit v1/v2, verpflichtender Freigabedatei, Claims und Replay-Schutz. Bericht nennt 637 bestandene nextest-Tests. Review und integrierter Live-Nachweis fehlen; alte Branch-Beobachtung ist überholt. |
| MCP-Katalog/Contract, onshape-mcp#1 | Implementiert, Issue CLOSED, Board Done | Review/Tests vorhanden. Letzter sichtbarer Kommentar fordert Image-E2E; Abschlussbeleg zum verwendeten Image nachtragen, keine erneute Entwicklung oder Wiedereröffnung allein wegen der Beleglücke. |
| Rustls, onshape-mcp#3 | Implementiert, Issue CLOSED, Board Done | `3ba95e0`, cargo deny laut Review grün. Fehlenden Abschlussverweis zum Image im bestehenden Integrationsnachweis ergänzen. |
| Clawake Readiness, selektive Restarts, Runtime-Pins | Implementiert, Teilabläufe live belegt | [PR #33](https://github.com/edge-robot/clawake/pull/33) gemergt als `5d0bf09`; #20/#23 geschlossen. Lokale Belege vom 19.10.: Readiness, unverändertes Setup ohne Restart, selektiver Plugin-Sync und idempotente Wiederholung. |
| Clawake Rollout #24, Discord/Site Values #26/#21 | #26 live abgenommen und Done; #24/#21 In review | #26-Abschluss vom 20.10.: Adoption, SecretRef, Allowlist, private Backups, positiver Discord-Roundtrip und unveränderte Folgevorschau belegt. #21 fehlt konkret der Negativtest mit zweitem Konto; #24 echte Pin-Änderung/idempotente Wiederholung nachweisen. |
| Clawake Backup/Upgrade #28/#29/#30/#31/#34 | Implementiert, gemergt und Done | PR #35 am 20.10. um 11:39:06 UTC gemergt, alle genannten Issues geschlossen. Private Backups zusätzlich durch #26-Adoptionslauf belegt. Aus offener Entwicklung entfernen. |
| Client-/Server-Timeout #17 | Fehlend im gelesenen Clawake-Code | `src/clawake/services/runtime_config.py:50` setzt weiterhin 30000 ms. Verhältnis zum 30-s-Serverbudget und UNKNOWN-Verhalten testen; getrennt vom A2A-90-s-Problem behandeln. |
| pib-Auswahl, revisionsgebundener STL-Export | Teilweise / integriert fehlend | CAD-Grundlagen bestehen; keine akzeptierte Zuordnung eines echten pib-Teils mit Revision, Seite und Menge. Generische Exportmöglichkeiten sind kein belegter Export im eingeschränkten external-token-Pfad. |
| H2C/Bambu Studio im Engineer-Ablauf | Fehlend im untersuchten Integrationsumfang | Keine Bambu-/H2C-Implementierung in freigegebenem Clawake-Code gefunden; keine akzeptierte STL→Slicing→Lead-Zustellung. Offizielle H2C-Profile existieren in [Bambu Studio](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/Bambu%20Lab%20H2C%200.4%20nozzle%20template%20machine_start_gcode.json); installierte Version und konkretes Profil sind ungeprüft. |
| Alte ClawCAD-Fehler, pauschal „Mutation unmöglich“ | Obsolet als aktive Implementierungsbasis | Historische Tickets gegen den aktiven ClawOnshape-Pfad abgleichen. Agentennamen mit `clawcad-` bezeichnen teils weiterhin Instanzen; daraus folgt kein aktives ClawCAD-Repo. |

Testgrenzen: Der historische Bericht vom 16.10. nannte 115 bestandene Tests,
aber rote Installations-/Native-SDK-Gates. Der aktuelle #15-Review bestätigt
Installationsfix und grüne native Dateiprüfung; `powerLossDurability` bleibt
UNVERIFIED. Keine Testausführung durch den PO. Vorhandene lokale Änderungen sind
nicht automatisch durch diese Review-Ergebnisse abgedeckt.

## Ausführungsplan Dienstag bis Sonntag

Nur PO, ClawOnshape Architect und Clawake Developer sind Ansprechpartner des
Menschen. Alle Onshape-/MCP-Unteraufträge und technischen Abstimmungen laufen
über den Architect. Die folgende Tabelle ist eine Übergabe für den Menschen;
es wurden keine Agenten beauftragt. Ausführung und Lifecycle bleiben beim jeweils
autorisierten Entwickler/Operator; Releasefreigabe beim Menschen.

| Rang / Termin | Verantwortlich | Ergebnis und Abhängigkeiten | Abnahme |
| --- | --- | --- | --- |
| NOW 0 – Di 20.10. | PO | Mutationsscope ist durch Nutzerentscheidung auf das Platten-Minimalbeispiel festgelegt. Separates pib-Teil für die Fertigungsreise auswählen. Architect und Clawake Developer liefern aktuelle SHAs, offene PRs/CI und fehlende Board-Daten. | Platte, vier Bohrungen, aktueller Durchmesser, bestätigter Zielwert, Positionen/Außenmaße, Prüfmethode und Berechtigter eindeutig. Separat: benötigtes pib-Teil mit Quelle/Revision/Seite/Menge. Für H2C: konkreter Drucker, Düse, Material/Profil. |
| NOW 1 – Di/Mi | Clawake Developer | Vorhandenen Runtime-Stand nutzen; #35 und #26 sind erledigt. Restabnahme #24/#5/#21 sowie Timeout #17 bündeln. | Echte Pin-Änderung betrifft nur vorgesehenen Member; Wiederholung ohne Restart. Nicht-Allowlist-Nutzer wird abgewiesen. Clientbudget erlaubt Serverantwort oder einen abgeglichenen UNKNOWN-Zustand. Keine erneute Backup-/Discord-Adoptionsentwicklung. |
| NOW 2 – Di/Mi | ClawOnshape Architect | Aktuellen Mutationspfad stabilisieren: #1 späte Ergebnisse und Auftragszuordnung, #2/#8 Status, Agenten-/Skill-Widersprüche. Parallel zu NOW 1; Live-Abnahme danach. | Auftrag über Lead, genau ein nativer Update-Dispatch, unabhängige Ergebnisprüfung, verständlicher Endstatus und PNG im Ursprungschannel. Ein absichtlich >90 s dauernder Auftrag endet dort korrekt; Timeout führt nicht zur zweiten Mutation. Neue freigegebene Aufgabe wird nicht als alte Wiederholung blockiert. |
| NOW 3 – Mi/Do | ClawOnshape Architect; Clawake Developer für statisches Provisioning | #11/#14-Migration integrieren: vorhandenes MCP-expand @ acceacd9 reviewen, Plugin-P3 umsetzen, verbleibende P4-Konfiguration, E2E, erst dann alte Variante entfernen. #26 erfüllt; #21-Negativtest noch offen. | Ein berechtigter nativer Slash-Befehl bindet Nonce, Ablauf, Payload und Ziel; unberechtigt, abgelaufen, verändert, wiederholt und Primary werden abgewiesen. Kein Host-Reprovisioning pro Vorschlag. Ein Candidate pro Aufgabe, Baseline geprüft. Spätes Ergebnis überlebt freigegebenen Restart ohne erneuten Dispatch. |
| NOW 4 – Do 22.10. | ClawOnshape Architect | Platten-Minimalbeispiel vollständig abnehmen; parallel vorhandenes pib-Teil auswählen und kleinsten Export des bestätigten Stands integrieren. Mutationsabnahme baut auf NOW 0/2/3 auf; pib-Auswahl/Export braucht keine Mutation. | Platte: vier Bohrungen am Zielwert, Positionen/Außenmaße nachgemessen, Primary unverändert, Vorher-/Nachher-Ergebnis zugestellt. pib: Teil im Baugruppenkontext bestätigt. Nach separater Produktionsfreigabe zugängliches STL mit Revision, Teileauswahl, Einheit, Exportparametern, Dateihash und erwarteten/gemessenen Abmessungen. Spätere CAD-Änderung verschiebt den Exportstand nicht stillschweigend. |
| NOW 5 – Fr 23.10. | Clawake Developer; Architect verantwortet Onshape-Artefakt und Lead-Übergabe | Kleine H2C-/Bambu-Studio-Integration in den Engineer-Ablauf. Vorhandene Fähigkeiten/Installationen zuerst prüfen. Parallel mit bekanntem Test-STL beginnen, Abnahme mit NOW-4-STL. | Engineer stößt Vorbereitung über den freigegebenen Weg an. Passende Bambu-Studio-Version, H2C-/Düsen-/Material-/Prozessprofile; Importmaßstab, Bauraum, Orientierung, Stützen und Menge geprüft. Zugängliche Vorschau/Projektdatei und als Schätzungen markierte Zeit/Materialmenge über Lead. Fehlendes Profil, zu großes oder ungültiges STL ergeben verständliche Blockade. Kein Druckstart durch Vorbereitung. |
| NOW 6 – Sa 24.10. | Architect + Clawake Developer; PO nimmt ab | Zweiter Durchlauf derselben Nutzerreise, gezielte Fehlerfälle und Closure-Paket; keine zusätzliche Plattformarbeit. | Zwei getrennte Aufträge mit eigener Freigabe, korrekter Zuordnung und erreichbaren Ergebnissen. Zweiter Lauf ohne manuelle Payload-Reparatur, Runtime-Dateiedits oder Lifecycle-Aktion pro Auftrag. Fehler werden nachvollziehbar abgeglichen; kein doppelter CAD-Dispatch. |
| NOW 7 – So 25.10. | PO | Gegen die DoD prüfen, GitHub-Updates zur Übernahme vorlegen, menschliche Entscheidung dokumentieren. | Pro Kriterium Beleg, Datum und Revision; erledigte Teilaufgaben geschlossen, Restumfang explizit offen. Kein „Done“ allein aufgrund eines Berichts-Headers. |

Donnerstag-Mittag-Entscheidung: Fehlt die integrierte Freigabemigration, darf der
bestehende explizit freigegebene Candidate-Pfad weiterhin eine beaufsichtigte
Platten-Erprobung tragen. Das ist ein Teilergebnis; die DoD „wiederholbar ohne
Host-Reprovisioning“ ist dann nicht erfüllt. H2C-Vorbereitung kann parallel lernen,
ersetzt aber die CAD-Abnahme nicht. Keine Schutzgrenze wird für den Termin gesenkt.

NEXT: Physischer H2C-Druck mit gesonderter Startfreigabe, Jobbestätigung und
menschlicher Passform-/Qualitätsprüfung; vereinbarte Druck-Subagent-Reise;
Zwei-Team-Isolation und weitere benötigte Onshape-Operationen. Fehlt für das
Wocheninkrement eine neue Agenten-/Berechtigungsentscheidung, wird sie vor
Aktivierung dem Menschen vorgelegt. Kein neuer Druckagent wird hier vorausgesetzt.

LATER: VP/VC-Technik, Multi-Material-Optimierung und erweiterte Drucküberwachung,
soweit für den Pilot nicht nötig. NOT PRODUCT für diese Woche: ClawCAD-Reaktivierung,
zweites Board, neuer CAD-Backend-/Rendererbau und allgemeine Orchestrierungsplattform.

## Drei wichtigste Risiken

1. **Falscher Abschluss und Doppelarbeit:** R7 beweist den verlorenen Endstatus;
   auch der native Client hat ein knappes Timeout. Architect und Clawake Developer
   müssen A2A- und MCP-Fehler getrennt reproduzieren. Sperre: kein automatischer
   Schreibretry bei UNKNOWN; Abschluss über auftragsgebundene Reconciliation.
2. **Vertrag, Artefakt und Deployment laufen auseinander:** Plugin 0.2.10,
   Contract 0.4.0 in Tests, neues 1.0.0-draft, optionales Approval im gelesenen MCP,
   gemergter Runtime-Code und offene Live-Abnahmen sind verschiedene Zustände.
   Gegenmittel: ein gemeinsamer Nachweis der tatsächlich eingesetzten SHAs,
   Paket-/Image-Digests, Grants und Tests vor dem ersten neuen Freigabeflow.
3. **Pilot/H2C und Bestandsaudit sind unvollständig belegt:** echtes Teil,
   konkrete Fertigungsdaten und vorhandene Druckeranbindung offen; Board-Zugriff
   und aktuelle private Onshape-PRs fehlen. Gegenmittel: Pilotdaten am Dienstag,
   Clawake-Fähigkeitsnachweis spätestens Mittwoch, Board-Export/Architektenbericht.
   Reine manuelle Studio-Vorbereitung zählt als Erprobung, nicht als abgenommene
   Agentenintegration.

## Definition of Done – Sonntag, 25.10.2026

- Platten-Minimalbeispiel: vier Befestigungsbohrungen auf bestätigten Zieldurchmesser
  geändert, Positionen und Außenmaße erhalten; Ausgangsrevision und Prüfmethode belegt.
- Lead → Engineer → autorisierter Candidate-Update → unabhängige Prüfung → Lead
  funktioniert am Minimalbeispiel zweimal mit getrennten freigegebenen Aufträgen.
  Eine erneute Mutation benötigt einen sinnvollen, ausdrücklich bestätigten Zielwert.
  Nutzer erhält Werte, Vorher-/Nachher-Ansicht, CAD-Verweis und richtigen terminalen
  Status; Primary bleibt unverändert.
- Kein Host-/MCP-Reprovisioning pro Vorschlag; freigegebene Rollen, Tool-Grants und
  Berechtigungen bleiben wirksam. Veraltete oder unberechtigte Freigaben und
  Wiederholungen erzeugen keine unerlaubten Writes. Unklarer Ausgang wird abgeglichen.
- Separates echtes pib-Teil im Baugruppenkontext bestätigt, inklusive Seite und Menge;
  keine Mutation erforderlich. Produktionsfreigabe bindet den exportierten Stand; STL ist zugänglich,
  maßhaltig und mit CAD-Stand/Hash verknüpft. H2C-Vorbereitung aus genau dieser
  Datei ist über Engineer/Lead nutzbar, inklusive Profilen und Vorschau.
- Das Ergebnis ist **bis zur Druckvorbereitung** abgenommen. Physischer Druck und
  Passform gelten erst nach eigener Freigabe und echtem Befund als nachgewiesen.
- Reproduzierbarer Build/Install und relevante Plugin-/MCP-/Clawake-Checks am
  integrierten Stand; native Dateihandoff-Prüfung im geeigneten Harness; gezielte
  Negativfälle und langsame Rückmeldung bestanden. Historische rote Gates bleiben
  offen, bis aktuelle Belege sie auflösen.
- Project #4 enthält belegte Abschlüsse und verbleibende Arbeit ohne Duplikate.
  Ohne Board-Abgleich oder ohne Wiederholung wird die Woche als teilweise erreicht
  bewertet. Release und Deployment bedürfen weiterhin menschlicher Freigabe.

## Empfohlene Updates im vorhandenen GitHub Project #4

Keine Änderungen ausgeführt. Bestehende Karten/Statusfelder verwenden; keine
neuen Spalten, Labels oder Epics verlangen. Priorität/Datum/Owner bei Bedarf in
vorhandene Beschreibungen eintragen. Vorschläge sind bis zum Board-Abgleich bedingt.

| Bestehendes Item | Empfehlung und Abschlussbeleg |
| --- | --- |
| Clawake #33; #20/#23 | Bereits gemergt/geschlossen: Board auf vorhandenen Done-Status abgleichen, `5d0bf09` und datierte E2E-Belege verlinken. Keine neuen Tickets. |
| Clawake #35 mit #28/#29/#30/#31/#34 | NOW, Clawake Developer: vorhandenen PR reviewen, Checks/Live-Nachweis ergänzen, menschliche Mergeentscheidung; danach dessen vorhandene Closes-Verknüpfungen nutzen. |
| Clawake #24/#26/#21 und #5 | NOW, Clawake Developer: vorhandene Umsetzung von ausstehender Abnahme trennen. #21 in #26 referenzieren; nach identischer vollständiger Abnahme entsprechend schließen. Keine Implementierungsduplikate. |
| ClawOnshape #1 | NOW, Architect: R7/Timeout und verspätete Ergebniszustellung als Abnahmekern eintragen. Erst nach langsamem E2E und korrektem Channel-Abschluss schließen. Aktuellen GitHub-Status zuerst verifizieren. |
| ClawOnshape #11 mit #14/#13/#3; onshape-mcp#2 | NOW, Architect: vorhandenes Epic und Teilaufgaben für Claims/Freigabe/Migration verwenden. #13 ist bestandener Spike, #14 Vertragsarbeit; beides nicht mit fertiger Produktreise gleichsetzen. #3 erst nach Wegfall des Host-Schritts schließen. |
| ClawOnshape #5/#10/#12 | Closure-Kandidaten anhand vorhandener Code-, Test- und Live-Belege; nur noch kriterienspezifische Lücken prüfen. Kein erneut beauftragter Rewrite. |
| ClawOnshape #2/#8 | Bestehende Status-/Dokumentationslücke aktualisieren. Alte MCP-Factory-Richtung als überholt kennzeichnen, aktuelle native Architektur erhalten. |
| onshape-mcp#1/#3 | Implementiert / wartet auf Live-Abnahme; gemeinsam gegen das neu gebaute Image prüfen und dann mit Nachweisen schließen. |
| Clawake #17/#18/#19/#22 | #17 NOW; #18 Source→Digest-Nachweis und #19 aktive Inventarzuordnung in den Integrationsnachweis aufnehmen. #22 nur soweit für konkrete Diagnose nötig. Keine allgemeine Observability-Initiative. |
| Clawake #14/#15 und PR #8 | Bestandsbereinigung: #14 stammt aus ClawCAD; aktiven PNG-Nachweis und die alten Kriterien vergleichen, ggf. als ersetzt schließen. #15 enthält über Workspace-Trennung hinaus frischen Host/Git-Provisioning-Scope: nicht pauschal schließen. PR #8 reiner Formatter-Draft; bei nachgewiesener Abdeckung durch aktuellen Stand als ersetzt schließen, nicht blind mergen. |
| Clawake #36 | NEXT, geringe Schwere: sauberer TarError-Abbruch beim Upgrade; kein Grund, den pib-Pilot um Architekturarbeit zu erweitern. |
| pib-Pilot und H2C/STL | Erst Board nach vorhandenen Karten durchsuchen. Ergebnis/Abnahme dort ergänzen. Nur bei fehlender Entsprechung minimalen Eintrag erstellen; Onshape-Owner Architect, H2C-Owner Clawake Developer. |

Closure-Kommentar: erfüllte Kriterien, Commit/PR, tatsächlich verwendetes
Artefakt, Test-/Live-Beleg mit Datum und noch offene Grenzen. Ein gemergter PR
schließt seinen Implementierungsscope; ein separates Nutzerabnahme-Item bleibt
bis zur zugestellten, überprüften Nutzerwirkung offen.
