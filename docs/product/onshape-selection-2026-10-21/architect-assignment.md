# Architekturauftrag COC-CONTEXT-SELECTION-20261021

Vom Nutzer am 21.10.2026 ausdrücklich beauftragt: spec.md und ADR.md für die
Workspace-/Bauteilauswahl anpassen, mit dem Claude-Architekten durchsprechen und
dafür Issues anlegen. Autorisiert ist Anforderungs-/Architektur- und Issue-Arbeit,
keine Implementierung, kein Deployment und keine Runtime-Aktion.

## Problem, Nutzen und bestätigte Richtung

Im Workspace-Bereich fehlt dem Nutzer die Auswahl des Onshape-Workspaces und
des tatsächlich zu bearbeitenden Bauteils. Die vorhandene Arbeitskontextkarte
soll der Einstieg sein. Der vorgestellte Auswahldialog gefällt dem Nutzer;
seine verbindliche Ergänzung: Nach Übernahme wieder kompakte Darstellung des
aktuellen Kontexts. Keine dauerhaft große Vorschau oder ausgeklappten Listen.

Design und Kriterien S1–S9: [README](README.md).
Ansichten: [kompakter Kontext](01-arbeitskontext.png),
[Auswahldialog](02-bauteil-auswaehlen.png).
Der Nutzer-Screenshot wurde im PO-Chat angesehen: bestehender Bereich Workspace,
Karte Arbeitskontext, rechts markierter Platz für Auswahl. Er ist nicht als
lokale Datei verfügbar. PNGs/SVGs hier sind Produktmockups mit Beispieldaten.

## Auftrag an den bestehenden onshape-architekt

1. Aktuellen Working Tree und relevante Regeln prüfen; bestehende fremde
   Änderungen erhalten und seriell arbeiten. Aktuelle Anforderungen und Verträge
   lesen, insbesondere spec.md, docs/ADR.md und tatsächlichen Ziel-/Binding-Vertrag.
2. spec.md als alleinige normative Anforderungsquelle um die Nutzerreise und
   prüfbare Kriterien ergänzen: Dokument → autorisierter Onshape-Workspace →
   konkretes Bauteil, Gruppierung nach Part Studio, Suche, eindeutige Herkunft,
   kontrollierte Übernahme, kompakte Karte danach und erneutes Öffnen.
3. In docs/ADR.md technische Entscheidungen bzw. offene Vorschläge begründen:
   Part Studio versus Part-Identität; autorisierte Listen/Metadaten/Preview;
   Persistenz und Reichweite der Auswahl ohne globale Fremdumschaltung;
   serverseitige Zuordnungsprüfung; Zielbindung und aktive/unklare Ziele;
   Race-/Cache-Invalidierung; Auswirkungen einer Feature-Änderung auf weitere
   Parts. Keine neue Schnittstelle oder Fähigkeit ohne Bestandsprüfung behaupten.
4. Den Vorschlag mit dem bestehenden Claude-Architekten besprechen, soweit ein
   für deine Rolle ausdrücklich erlaubter Kommunikationsweg existiert. Der Nutzer
   autorisiert diese Abstimmung. Keine neuen Agenten starten oder Zugriffsgrenzen
   umgehen. Fehlt der erlaubte Weg, konkrete Review-Unterlage und offene Fragen
   bereitstellen und den Hinderungsgrund zurückmelden. Keine Abstimmung behaupten,
   solange keine tatsächliche Antwort vorliegt.
5. Abgestimmte Arbeit in wenige umsetzbare, voneinander abhängige Issues mit
   Nutzerwirkung, Scope/Nicht-Zielen, Akzeptanzkriterien, Repo-Zuordnung,
   Vertragsabhängigkeiten und Nachweisen zerlegen. Bestehende Issues zuerst
   prüfen, Doppelungen vermeiden. Zugelassene Repositories sind
   edge-robot/clawonshape, edge-robot/onshape-mcp und edge-robot/clawake;
   das Lifecycle-Repository nur bei konkretem Bedarf berücksichtigen.
   GitHub-Schreibzugriff ist für den PO gesperrt. Dieser Auftrag erweitert keine
   technische/rollenbezogene GitHub-Befugnis: Issues nur dann tatsächlich anlegen,
   wenn dein eigener erlaubter Weg das ausdrücklich trägt. Andernfalls fertige
   Issue-Entwürfe unter docs/product/onshape-selection-2026-10-21/ an und melde
   die fehlende Schreibmöglichkeit. Keine alternativen Auth-/Netzwerkwege nutzen.
6. Ergebnis zurückgeben: geänderte Dateien, Spec-/ADR-Abschnitte, echte
   Claude-Review-Ergebnisse oder offene Abstimmung, Issue-Links oder fertige
   Entwürfe, verbleibende menschliche Entscheidungen und Beleggrenzen.

## Grenzen und Abnahme

Keine Produktcode-, Test-, Skill-, Runtime- oder Deployment-Änderung und kein
Implementierungsauftrag an openclaw-dev in dieser Phase. Keine Commits, Pushes,
Branches/Worktrees, CAD-Aufrufe, Lifecycle-Aktionen oder neuen laufenden Kosten.
Die Auswahl selbst gewährt keine Schreibrechte, legt keinen Candidate an und
überträgt keine bestehenden Freigaben. OAuth-Sichtbarkeit ersetzt keine
Team-/Channel-Zuordnung. Geschützter Primary bleibt geschützt.

Zusätzliche Sicherheits-/Zugriffs-/Freigabeänderungen als offene menschliche
Entscheidung führen. Die Doku darf den gewünschten Auswahlablauf beschreiben,
aber eine ungeklärte Befugniserweiterung nicht als bereits beschlossen darstellen.

Abnahme dieses Auftrags: konsistente Spec/ADR-Änderungen gegen S1–S9, explizit
kompakter Zustand nach Auswahl; belegte Abstimmung oder klarer Blocker; konkrete
Issues/Entwürfe mit Abhängigkeiten; keine Behauptung implementierter oder live
verfügbarer Auswahl.

## Übergabestatus

Am 21.10.2026 einmalig über `onshape-team prompt --stdin` eingereicht.
Der Aufruf meldete Status-Timeout mit `submission_may_have_happened: true`;
der begleitende Status zeigte den bestehenden onshape-architekt als `working`.
Nicht erneut gesendet. Auslesen während der Arbeit wurde vom Vermittler mit
`agent_not_idle` abgewiesen. Damit sind inhaltliche Empfangsbestätigung,
Spec-/ADR-Änderungen, Claude-Abstimmung und angelegte Issues noch nicht belegt.
