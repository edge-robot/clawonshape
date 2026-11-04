# Onshape-Kontext und Bauteil auswählen

Gestaltungsvorschlag vom 21.10.2026 zur menschlichen Sichtprüfung.
Nutzerfeedback: Grundentwurf gefällt; nach Auswahl soll der aktuelle Workspace
wieder kompakt dargestellt werden. Dieses Verhalten ist im Entwurf ergänzt. Keine
Implementierungsbeauftragung, Änderung aktiver Konfiguration oder neue
Zugriffsfreigabe. Normative Produktanforderungen bleiben in [spec.md](../../../spec.md).
Dieser Vorschlag konkretisiert die gewünschte Auswahl; noch keine bestätigte
Erweiterung des technischen Zielvertrags.

## Nutzerproblem und Ergebnis

Der Nutzer möchte im Cockpit selbst bestimmen, welchen Onshape-Workspace und
welches Bauteil er als Nächstes bearbeiten will. Heute sieht er dort nur den
zugeordneten Kontext. Danach soll er sein konkretes Bauteil mit Namen, Herkunft
und passender Vorschau erkennen, bewusst übernehmen und ein CAD-Ziel beginnen.
Ein Part Studio ist ein Container und darf nicht als einzelnes Bauteil ausgegeben werden.

## Entwurf zur Sichtprüfung

- [Aktueller Arbeitskontext](01-arbeitskontext.png): Die bisherige Kontextkarte
  bleibt an der im Screenshot markierten Stelle unter „Dein Engineering-Workspace“.
  Nach Übernahme zeigt sie kompakt Bauteilname, Dokument, Onshape-Workspace,
  Part Studio und beobachteten Stand, ohne große Vorschau oder offene Auswahllisten. „Auswahl ändern“ öffnet den
  Dialog; „Weiter zu CAD“ führt anschließend zur Aufgabe.
- [Auswahldialog](02-bauteil-auswaehlen.png): Drei durchsuchbare Spalten für
  Dokument, Onshape-Workspace und Bauteil. Bauteile sind nach Part Studio
  gruppiert. Die untere Zusammenfassung zeigt die vorläufige Auswahl mit Vorschau.
  Erst „Auswahl übernehmen“ setzt den Arbeitskontext und schließt den Dialog.
  Zurück bleibt die kompakte Karte. Abbrechen verwirft den Entwurf.

Dunkle Gestaltung und Türkis folgen den bereits bestätigten Cockpit-Referenzen.
Alle gezeigten Namen, Zustände, Zeiten und Revisionen sind Beispieldaten;
Vorschaubilder sind schematisch. PNGs sind statische Produktmockups,
SVGs deren bearbeitbare Quellen, keine ausführbare Oberfläche.
Der Nutzer hat `screenshot-2026-10-21_14-11-00.png` anschließend im Chat
bereitgestellt. Sichtprüfung bestätigt die Platzierung: Bereich Workspace,
bestehende Karte „Arbeitskontext“, rechts die Einstiege zur Auswahl.
Der Screenshot ist ein vom Nutzer bereitgestellter Oberflächenbeleg, keine
eigene Live-Prüfung der Instanz.

## Empfohlener Ablauf und Zustände

1. Einstieg im Bereich Workspace, zusätzlich derselbe Einstieg „Auswahl ändern“
   am Kontextkopf von CAD. Ohne Auswahl: „Wähle ein Bauteil für deine CAD-Aufgabe“.
2. Auswahl zunächst mit bisherigem Kontext vorbelegen. Nur Kontexte anzeigen,
   die für die konkrete Team-/Aufgabenzuordnung bereits erlaubt sind. OAuth-
   Sichtbarkeit allein reicht nicht. Dokumentauswahl ist innerhalb dieses Bereichs;
   bei genau einem Dokument bleibt es vorausgewählt.
3. Dokumentwechsel leert Workspace und Bauteil, Workspacewechsel leert Bauteil.
   Ladezustand und Such-Leerzustand pro Spalte erklären. Ohne vollständige,
   bestätigte Auswahl bleibt Übernehmen deaktiviert. Keine Namen oder Vorschaubilder
   aus einem anderen Kontext stehenlassen; verspätete Antworten ignorieren.
4. Pro Workspace Namen und belegte Rolle zeigen: geschützter Ausgangsstand oder
   Candidate mit zugehörigem Ziel. Unbekannte Rolle als unbekannt kennzeichnen.
   Bestehende Candidates nicht allein wegen sichtbarer Liste für fremde Ziele
   wiederverwenden. Ziel und Candidate bleiben nach bestehendem Vertrag verbunden.
5. Einzelnes Bauteil mit Part Studio und stabiler Identität unterscheiden;
   gleiche Namen durch Kontext und nachrangige Kurz-ID unterscheiden. Assemblies
   und nicht unterstützte Elemente erklären, statt sie als bearbeitbar darzustellen.
6. Vorschau nur für die konkrete Auswahl und den beobachteten Stand laden;
   fehlt sie, „Vorschau nicht verfügbar“ mit Onshape-Link zeigen. Keine alte
   Geometrie als neue Auswahl ausgeben. Fehler mit erneutem Ladeversuch anbieten.
7. Beim Übernehmen Kontext erneut prüfen. Bei Rechteverlust oder verschwundenem
   Ziel bleibt der bisherige bestätigte Kontext bestehen; der Dialog erklärt den
   Fehler. Nach Erfolg zeigt auch CAD dieselbe Auswahl. Eine spätere Nutzung
   prüft den CAD-Stand erneut; die Auswahl friert einen Workspace nicht dauerhaft ein.
8. Ein laufendes oder ungeklärtes Ziel verhindert den Kontextwechsel. Zeigen:
   „Schließe zuerst das aktuelle Ziel ab und kläre offene Änderungen.“ Ein bloßes
   Stoppen beseitigt keinen unklaren Schreibausgang. Bisherige Nachweise und
   Freigaben bleiben beim alten Ziel; keine Übertragung auf die neue Auswahl.
9. Schmale Ansicht: Schritte untereinander statt drei gedrängter Spalten;
   Zusammenfassung und Übernehmen am Ende. Tastaturfokus im Dialog führen,
   Escape entspricht Abbrechen, danach Fokus zurück auf den Einstieg.

Auswahl und Übernehmen starten keine CAD-Änderung, Candidate-Anlage oder Freigabe.
Geschützter Primary bleibt geschützt. Spätere Zielbestätigung benennt separat den
konkreten Candidate, Umfang und Stand. Die Auswahl erweitert keine Berechtigungen.
Wenn ein Kontext erst zusätzlich freigegeben werden müsste, bleibt er gesperrt
mit dem nächsten Schritt „Zuordnung durch Operator prüfen lassen“.

## Scope und Priorität

NOW für diesen Entwurfsauftrag: verständliche Auswahl eines vorhandenen Bauteils
in einem bereits autorisierten Dokument/Workspace, eindeutige Herkunft und
bestätigte Übernahme als Ausgangspunkt der nächsten CAD-Aufgabe.

Nicht-Ziele dieses Inkrements: globale Onshape-Suche, neue OAuth-Befugnisse,
Änderung von Team-/Channel-Bindings, Mehrfachauswahl, Assembly-Instanzauflösung,
Versionsbrowser, neue Branch-Anlage, automatisches Stoppen/Migrieren laufender
Ziele, Merge, Export, Druck und Runtime-/Deployment-Aktionen. Die umfassendere
pib-Nutzerreise bleibt zugesagter Produktscope; sie wird hier nicht gestrichen.

## Akzeptanzkriterien für eine spätere Entwicklungsübergabe

| ID | Beobachtbares Ergebnis |
| --- | --- |
| S1 | Nutzer wählt ohne ID-Eingabe Dokument, Workspace und genau ein Bauteil; bei mehreren Parts im Part Studio ist der tatsächliche Part eindeutig. |
| S2 | Beispiel mit linker/rechter Abdeckung und gleichen Namen in unterschiedlichen Part Studios bleibt anhand Herkunft und passender Vorschau unterscheidbar. Fehlende Vorschau wird ehrlich gezeigt. |
| S3 | Abbrechen lässt den bisherigen Kontext bestehen. Übernehmen schließt den Dialog und zeigt dieselbe bestätigte Auswahl in Workspace und CAD. Die Workspace-Karte bleibt kompakt, ohne große Vorschau oder offene Auswahlfelder; „Auswahl ändern“ öffnet den Dialog mit der bisherigen Auswahl erneut. |
| S4 | Elternwechsel, schnelle Folgeauswahl, alte Antworten und Ladefehler vermischen keine Namen, IDs, Revisionen oder Bilder. |
| S5 | Fremde/unzugeordnete Kontexte werden serverseitig abgewiesen. Fehlende Lesebefugnis erzeugt keinen scheinbaren Auswahl-Erfolg. Auswahl erteilt keine Schreibrechte. |
| S6 | Laufendes/ungeklärtes Ziel verhindert Übernahme eines anderen Kontextes. Alte Freigaben, Bilder und Nachweise werden nicht dem neuen Ziel zugeordnet. |
| S7 | Kein CAD-Schreibaufruf, keine Candidate-Anlage und kein Freigabeaufruf durch Suchen, Vorschau oder Übernehmen. |
| S8 | Leere Listen, keine Suchtreffer, abgelaufene Verbindung und verschwundener Part nennen jeweils einen verständlichen nächsten Schritt. |
| S9 | Tastatur, sichtbarer Fokus und Auswahltext funktionieren ohne reine Farbcodierung; Layout bei 1440×900, 1366×768 und 390×844 prüfen. |

## Belegstand und technische Fragen

Lesende Untersuchung am 21.10.2026, HEAD `dc12610`, vorhandener veränderter
Working Tree. Quellen: README, spec, engineering-cockpit, bisheriger bestätigter
Dashboard-Entwurf und dessen synthetisches Workspace-Browserbild sowie
`ui/control-ui.js` (`renderWorkspace`, `workspaceChoices`, Kontextdarstellung).
Kein Live-Zugriff und keine Behauptung über die laufende Instanz.

Beobachtung: Die UI beschreibt den zugeordneten Kontext; Workspace-Karten
beschränken sich auf konfigurierte Primary/Candidate-Ziele. `elementId` bezeichnet
hier ein Part Studio. Eine einzelne Part-Auswahl ist damit nicht nachgewiesen.
Einordnung: Produkt-/Scope-Erweiterung und ClawOnshape-Oberfläche; zusätzlich
Plugin-/Onshape-MCP-Zielvertrag und hostseitige Zuordnung betroffen.

Vor Umsetzung muss der Architekt klären: bestehende autorisierte Listen- und
Part-Metadatenwege, eindeutige Part-Identität, Persistenz und Reichweite der
Arbeitsauswahl (keine still globale Umstellung für andere Nutzer/Channels),
Prüfung der Zuordnung bei Übernahme und späterer Zielbestätigung sowie
Abgrenzung zwischen gewähltem Part und erlaubten Feature-Änderungen im Part Studio.
Die Auswahl eines Parts darf nicht vortäuschen, dass jede Feature-Änderung nur
diesen Part betrifft. Zusätzliche Zugriffs- oder Freigabeänderungen benötigen
menschliche Entscheidung. Hier wird keine neue Schnittstelle vorgegeben.

Empfehlung zur menschlichen Designentscheidung: Kontextkarte plus dreistufiger
Auswahldialog wie gezeigt. Eine dauerhaft sichtbare Drei-Dropdown-Leiste ist
kompakter, bietet jedoch weniger Raum für unterscheidbare Bauteile und Vorschau.
Noch keine Weitergabe oder Implementierung; zunächst Sichtprüfung dieses Entwurfs.
