# Cockpit: zielbezogene CAD-Iteration

> Historical human-confirmed visual/workflow assignment and acceptance checklist.
> The product direction is consolidated in [spec.md](../../../spec.md#bounded-goal-workflow),
> the sole normative product requirements source. Assignment, images and evidence
> below are preserved; their status statements are dated, not current runtime claims.

Stand: 21.10.2026. Task-ID: `COC-GOAL-WORKFLOW-20261021`.
Gestaltung vom Menschen am 21.10.2026 im Gespräch als Entwicklungsgrundlage bestätigt.
Übergabe an den bestehenden Architekten ausdrücklich autorisiert; technische
Untersuchung, Entwurf und Implementierung durch openclaw-dev sind beauftragt.
Keine Implementierung oder Runtime-Aktion durch den Product Owner.

Übergabe am 21.10.2026 über `onshape-team prompt --stdin` eingereicht. Der Aufruf
endete mit Status-Timeout (`submission_may_have_happened`); nicht erneut gesendet.
Der anschließende Status belegt den bestehenden `onshape-architekt` als `working`
mit Terminaltitel `Prüfe COC-GOAL-WORKFLOW-20261021`. Technischer Abschluss,
Entwicklerbeauftragung und Produktabnahme sind damit noch nicht nachgewiesen.

## Nutzerproblem und Nutzen

Das aktuelle Dashboard zerlegt die Konstruktion in einzelne Candidates und
Änderungsfreigaben. Der Nutzer möchte ein Feature-Ziel einmal bestätigen und dem
Mechanical Engineer anschließend die nötigen Iterationen im selben Candidate
überlassen. Kleine Änderungen verfolgt er unmittelbar in Onshape. Das Dashboard
soll Arbeitskontext, Ziel, Fortschritt und verständliches Ergebnis zeigen.

Die Nutzeranweisung vom 21.10.2026 autorisiert diese Richtung sowie nach Sichtung
der Bilder die Entwicklungskette PO → onshape-architekt → openclaw-dev.
Die vier Bilder sind als Gestaltungsgrundlage bestätigt. Live-Aktivierung,
Deployment, echte CAD-Mutation und physischer Druck sind damit nicht freigegeben.

## Visuelle Referenzen

Der bestehende, im Gespräch erneut gezeigte Entwurf
[dashboard-cockpit.png](../dashboard-cockpit.png) bleibt die gestalterische Basis:
dunkle Oberfläche, Türkis, linke Navigation, große CAD-Ansicht, zurückhaltende Panels.

| Bild | Zustand und Zweck |
| --- | --- |
| [01 Workspace](01-workspace.png) | Arbeitskontext und Verbindungsverwaltung nach Aufgabenbereichen |
| [02 CAD: Ziel bestätigen](02-cad-ziel.png) | Ein Candidate, nachvollziehbares Ziel und einmalige Iterationsfreigabe |
| [03 CAD: Iteration](03-cad-iteration.png) | Derselbe Candidate, aggregierter Fortschritt und Stop-Möglichkeit |
| [04 3D Print](04-3d-print.png) | STL-Import, Profil, Slicing und Druckauftragsvorschau |

Die gleichnamigen SVGs sind bearbeitbare Produktentwürfe, keine installierbare UI.
Alle Namen, Maße, Status und Schätzungen sind illustrative Beispieldaten.
Der CAD-Körper ist schematisch. Die Druckansicht zeigt den gewünschten Zustand
einer verfügbaren Integration; die Workspace-Ansicht illustriert dagegen eine
noch fehlende Bambu-Einrichtung. Das sind verschiedene Demonstrationszustände.
Produkttext für die echte Anwendung soll keine Entwurfs-/Architekturhinweise übernehmen.

Die neu genannten Host-Screenshots `screenshot-2026-10-21_09-17-23.png` und
`screenshot-2026-10-21_09-32-42.png` waren unter `~/Pictures/` nicht
verfügbar. Ein genauer Abgleich steht aus. Für das Branch-Prinzip wurde ersatzweise
die vorhandene Onshape-Referenz [mutation_user_journey.png](../mutation_user_journey.png)
betrachtet. Der Baum zeigt Primary, Ausgangspunkt und einen seitlichen Candidate;
er soll echte Onshape-Beziehungen wiedergeben und keine Historie erfinden.

## Scope und Workflow

- **Workspace:** Team/Projekt und Verbindungen. Zunächst Onshape und
  Bambu Studio/Bambu Lab, nach Fähigkeit CAD beziehungsweise Druckvorbereitung.
  Spätere unterstützte Werkzeuge passen in dieselbe Struktur. Kein neuer
  allgemeiner Plugin-Marktplatz oder frei konfigurierbares Integrationsframework.
- **CAD:** Feature-Ziel formulieren, Zielbedingungen und unveränderliche
  Eigenschaften prüfen, genau einen Candidate pro Feature-Ziel anlegen oder
  den eindeutig zugeordneten bestehenden Candidate wiederverwenden. Keine
  neue Branch-Anlage pro Parameteränderung, Aktualisierung oder Wiederaufnahme.
  Die konkrete Anlage-/Bearbeitungsansicht ergänzt die Entwicklung konsistent
  zur Referenz; die Bilder zeigen den anschließenden Freigabe- und Arbeitszustand.
- Die einmalige menschliche Freigabe bezieht sich auf Ziel, zulässigen
  Änderungsumfang, Team, Dokument, Element und konkreten Candidate. Sie erlaubt
  mehrere notwendige Änderungen innerhalb dieses Rahmens. Keine pauschale
  Schreibfreigabe für andere Ziele oder Workspaces.
- Der Engineer iteriert und prüft im selben Branch, bis die Zielbedingungen
  belegt erfüllt sind oder eine Blockade beziehungsweise Stop-Bedingung eintritt.
  Keine erneute Nutzerfreigabe nur wegen des nächsten zulässigen Einzelschritts.
  Interne Prüfungen und nachvollziehbare Änderungsbelege bleiben erforderlich.
- Ziel-/Bereichswechsel benötigt erneute Bestätigung. Widerruf/Stop verhindert
  weitere Schritte; bereits ausgeführte Änderungen werden nicht automatisch
  rückgängig gemacht. Bei unklarem Schreibausgang erst abgleichen; kein blinder Retry.
- Laufzeit-, Wiederaufnahme- und Abbruchregeln muss der Architekt konkretisieren.
  Keine Endlosschleife oder unbegrenzte Befugnis aus einem UI-Klick ableiten.
  Menschliche Rückfragen nur für wirklichen Änderungs-/Entscheidungsbedarf.
- Nach Zielerreichung: Ergebnis, Zielprüfung, offene Grenzen und Onshape-Verweis
  im Dashboard und über den Lead im ursprünglichen Channel. Fachliche
  Ergebnisbewertung ist vom Abschluss einzelner Tool-Aufrufe unterscheidbar.
- **3D Print:** STL-Import, Dateizuordnung/Einheit, Drucker-/Material-/Prozessprofil,
  Slicing und Vorschau des vorbereiteten Auftrags. Keine CAD-Branch-Verwaltung.
  CAD-seitiger STL-Export bleibt bei der CAD-Übergabe. Unterstützte bestehende
  Integrationen verwenden; neue Dienste, Kosten oder Zugriffswege nicht voraussetzen.

## Grenzen und Bestand

Primary bleibt geschützt; automatische Übernahme/Merge ist kein Teil dieses
Auftrags. Produktionsfreigabe und separate Druckstartfreigabe werden durch
Zielbestätigung nicht ersetzt. Dieser Dashboard-Umbau endet bei Druckvorbereitung;
die längerfristig zugesagte Druckreise wird nicht gestrichen.

Die bestehende Freigabe ist laut untersuchtem Code payloadbezogen. Das neue
Zielmodell ist eine bewusste, vom Nutzer gewünschte Produktänderung. Es darf
nicht durch das Verbergen, Umgehen oder automatische Anklicken bisheriger
Einzelfreigaben simuliert werden. Architektur muss erforderliche Änderungen an
Plugin-/MCP-Vertrag und Durchsetzung erkennen und geschlossen testen. Zusätzliche
Berechtigungsänderungen außerhalb des beschriebenen Zielrahmens gehen an den Menschen.

Vorhandene Operator-Wege für Freigabe, UNKNOWN-Abgleich und Candidate-Anlage
bleiben während des Übergangs zugänglich, getrennt und standardmäßig eingeklappt.
Kein stilles Entfernen als Nebenwirkung der Navigation.

## Akzeptanzkriterien

| ID | Beobachtbares Ergebnis / erforderlicher Nachweis |
| --- | --- |
| A1 | Genau drei Hauptbereiche: Workspace, CAD, 3D Print. Bestehender dunkler Stil und Hierarchie entsprechen den bestätigten Bildern. |
| A2 | Workspace zeigt richtige Zuordnung, Werkzeugstatus, Aktualität und nächsten Schritt. Weitere unterstützte Werkzeuge benötigen keinen zusätzlichen Hauptmenüpunkt. Unbekannt/fehlt/abgelaufen wird wahrheitsgemäß gezeigt. |
| A3 | Ein Feature-Ziel hat genau einen zugeordneten Candidate. Aktualisieren, mehrere Iterationen und Wiederaufnahme erzeugen keine zusätzlichen Branches. Baum und Onshape-Links entsprechen den tatsächlichen CAD-Beziehungen. |
| A4 | Vor Freigabe sind Ziel, Erhaltungsbedingungen und Arbeitsbereich verständlich. Ein berechtigter Mensch bestätigt einmal; mindestens zwei unterschiedliche notwendige Änderungen funktionieren im selben Candidate ohne weitere Einzelfreigabe. |
| A5 | Ziel- oder Bereichsüberschreitung, fremdes Team, Primary-Schreiben und fehlende/widerrufene Freigabe werden serverseitig abgewiesen. STOP verhindert weitere Schritte; ein laufender unklarer Aufruf wird abgeglichen. Gezielte Negativtests und Review des Vertrages. |
| A6 | Dashboard zeigt aggregierten Fortschritt, Blockade oder belegte Zielerreichung; feine Historie/Nachweise sind nachrangig zugänglich. Ein fehlender Prüfnachweis ergibt keinen Erfolgsstatus. Ergebnis erreicht den richtigen Channel. |
| A7 | 3D Print führt ein unterstütztes STL über Profile/Slicing zur zugeordneten Vorschau mit Menge und verfügbaren Zeit-/Materialschätzungen. Fehlende Integration zeigt eine echte Blockade statt scheinbar funktionierender Demoaktionen. Kein Druckstart. |
| A8 | Bestehende Operator-Aktionen und deren Schutz bleiben bis zur geprüften Migration erreichbar. Kein automatisches Approve/Batch-Approve als Ersatz für Zielautorisierung. |
| A9 | Produktnamen bleiben unabhängig vom Render-Abruf sichtbar; Refresh/Fehler/alte Daten erzeugen keine irreführenden Namen, Bilder oder Revisionen. Laden/Auswählen startet keine Mutation. |
| A10 | Browserbilder der tatsächlichen Umsetzung bei 1440×900 und schmalem Laptopformat gegen alle vier Referenzen prüfen; Tastaturzugang, Fokus und Status ohne reine Farbcodierung. Relevante Checks und technische Review mit tatsächlichen Ergebnissen. |

Die Prüfung A4/A5 umfasst zuerst aussagekräftige lokale Tests. Eine reale CAD-/Channel-
Abnahme benötigt den dafür autorisierten Operator und konkrete menschliche
Live-Freigabe. Statische Bilder beweisen weder Integration noch erfolgreiches CAD.

## Belege und Übergabevoraussetzungen

Untersucht am 21.10.2026: lokaler HEAD
`b63a82b3fb7eac3241d16c18516db372fdf6a5aa`, bereits umfangreich veränderter
Working Tree. `README.md`, `ui/control-ui.js`, vorhandene Produktunterlagen und
[Operator-Auftrag](../../prompts/2026-10-21-cockpit-operator-actions.md) wurden gelesen.
Keine aktuellen Runtime-Proben oder Tests ausgeführt. Einordnung:
Produkt-/Workflowproblem, Anforderungsänderung und Plugin-Oberfläche;
Zielautorisierung berührt zusätzlich Plugin-/MCP-Integration. Kein Beleg für
einen Runtime-, Discord- oder Infrastrukturdefekt.

Der vom Nutzer verpflichtend genannte Bericht
`docs/prompts/2026-10-21-cockpit-operator-actions.report.md` existierte bei der
Untersuchung noch nicht. Der Architekt muss ihn vor Entwicklungsbeauftragung
lesen und seine Findings/Restpunkte einbeziehen. Fehlt er weiterhin, muss er
diese konkrete Abhängigkeit klären und darf keine angebliche Berichtsprüfung melden.
Die Vorgabe des früheren Operator-Auftrags, Backend-Semantik unverändert zu
lassen, gilt für dessen Reparatur. Sie löst das neue Zielmodell nicht. Beide
Aufträge sauber abgrenzen und vorhandene Änderungen nicht überschreiben.

Nach menschlicher Sichtprüfung der Bilder: über den Skill
`onshape-team-coordination` ausschließlich den bestehenden `onshape-architekt`
mit dieser Task-ID beauftragen. Auftrag umfasst technische Untersuchung,
Entwurf, Übergabe der autorisierten Implementierung an `openclaw-dev` und
technischen Review gegen A1–A10. Keine neue Agenteninstanz, kein direkter
Entwicklerauftrag durch den PO. Bestehenden Working Tree seriell weiterführen;
keine Commits, Branchwechsel, Veröffentlichung, Deployment oder Runtime-Eingriffe
als Teil dieses Auftrags. Der PO prüft anschließend Review und reale Bilder;
offene Live-Abnahme bleibt ausdrücklich offen.
