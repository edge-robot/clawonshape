## Nutzerproblem und Ziel

Nutzer benötigen eine verständliche Übersicht über ihren Onshape-Workspace und
die zugehörigen Candidates: Was wurde geändert, freigegeben, ausgeführt und
geprüft? Der ausgewählte CAD-Stand und der nächste Schritt müssen sofort erkennbar sein.

Das vom Nutzer bestätigte dunkle Engineering-Cockpit soll die bestehende native
ClawOnshape-Dashboardseite ersetzen beziehungsweise weiterentwickeln.

## Designreferenz

Bestätigter Entwurf im Entwicklungsworkspace:
`docs/product/dashboard-cockpit.png` und `docs/product/dashboard-cockpit.svg`.
Den Screenshot bei der Issue-Anlage anhängen, falls die Dateien noch nicht auf
GitHub verfügbar sind. Die Referenz zeigt illustrative Daten, keine Runtime-Belege.

## Umfang

- Dunkle, hochwertige HMI entsprechend dem bestätigten Entwurf, deutsche Beschriftungen.
- Workspace, Bauteil, Revision, Primary-/Candidate-Zuordnung und Onshape-Verweis.
- Auswählbare Candidate-Karten mit konsistenten auftragsbezogenen Detailansichten.
- Primary-/Candidate-Vergleich mit revisionsgebundenen Ansichten und Änderungsdaten.
- Freigabe, Ausführung und Prüfung getrennt; zugehörige Nachweise zugänglich.
- Sichtbare Aktualität sowie verständliche Lade-, Leer-, Fehler- und UNKNOWN-Zustände.
- Bestehende Verbindungsverwaltung erhalten; technische Details aufklappbar halten.

Bestehende Umsetzung in `ui/control-ui.js` und `src/dashboard.ts` nutzen.
Onshape-Schnittstellen und notwendige Ergänzungen über den ClawOnshape Architect
abstimmen. Zustands-/Freigabearbeit aus #2, #6 und #11 referenzieren, nicht duplizieren.

## Nicht-Ziele und Grenzen

Keine separate Dashboard-Anwendung, kein neuer Renderer und keine neue Plattform.
Keine neuen Dashboard-Freigaben, automatische CAD-Mutation, Primary-Übernahme oder
Druckstarts. Das Cockpit zeigt den bestehenden Freigabeprozess gemäß ADR vom
16.10.2026. Fehlende Daten oder Fähigkeiten dürfen nicht durch Beispieldaten,
erfundene Prüfungen oder Erfolgsanzeigen ersetzt werden.

## Akzeptanzkriterien

- [ ] Gestaltung und Informationshierarchie entsprechen dem bestätigten Mockup.
- [ ] Tatsächlicher Workspace, CAD-Stand und ausgewählter Candidate sind eindeutig.
- [ ] Candidate-Wechsel aktualisiert Ansichten, Auftrag und Prüfnachweise konsistent.
- [ ] Freigegeben, ausgeführt und geprüft sind unterscheidbar; fehlende/veraltete Daten verständlich markiert.
- [ ] Vergleichsansichten nennen ihre CAD-Stände; fehlende Vorher-/Nachher-Belege werden nicht erfunden.
- [ ] Laden, Auswählen und Aktualisieren lösen keine CAD-Schreibaktion aus; Zugriffsschutz bleibt wirksam.
- [ ] Desktop-/Laptopdarstellung, Tastaturbedienung, sichtbarer Fokus und Status ohne reine Farbcodierung geprüft.
- [ ] Relevante bestehende Checks und gezielte neue Tests bestanden; Oberfläche im Browser geprüft.
- [ ] Eine kompakte, am bestehenden Einstieg verlinkte Nutzerübersicht unter `docs/` erklärt Zugang, Auswahl, Vergleich, Status und Fehlerfälle in etwa einer Bildschirmseite.
- [ ] Gemeinsame Live-Abnahme mit dem Nutzer nach Implementierung: echten Workspace und Candidate auswählen, Vergleich und Nachweise zeigen, Fehler-/Leerzustand und Aktualisierung prüfen.
- [ ] Datum, getestete Revision, Nutzerentscheidung und Restpunkte knapp dokumentiert; ohne tatsächliche Live-Abnahme bleibt diese offen.

Deployment ausschließlich über den autorisierten Clawake-/Operator-Weg.
Für die Live-Abnahme vorhandene Daten verwenden; zusätzliche CAD-Änderungen
benötigen eine gesonderte konkrete Freigabe.

## Zuordnung

Umsetzung: openclaw-dev. Onshape-Koordination und technische Schnittstellen:
ClawOnshape Architect. Produktabnahme: Nutzer mit Product Owner.
Im bestehenden Project „Edge Robot Engineering“ (#4) führen, kein neues Board.
