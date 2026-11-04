# Selector V2 – Designreview 22.10.2026

Task: COC-CONTEXT-SELECTION-UX-20261022.
Status: V2-Design vom Nutzer am 22.10.2026 im PO-Chat mit „OK“ bestätigt.
X1 ist damit für die gezeigten V2-Ansichten erfüllt. Der vorher ausdrücklich
angekündigte Entwicklungsauftrag an onshape-architekt ist hiermit autorisiert;
Deployment, Live-Zugriffe und Berechtigungsänderungen bleiben ausgeschlossen.

## Quellen und Grenzen

Nutzer-Screenshot vom 22.10.2026 im Chat visuell geprüft. Die benannte Datei im
UI-Worktree ist in dieser PO-Sitzung nicht verfügbar. Die gleichnamige Datei
`docs/prompts/2026-10-22-work-context-selector-ux-rework.md` im Hauptrepository
wurde gelesen, zusammen mit §11 des work-context-Vertrags und den Fixtures
DocumentPage, WorkspaceList und PartSearch. Lokaler HEAD bei Untersuchung:
`9c8e48e`. Keine eigene Live-Prüfung. Auf ausdrücklichen Nutzerwunsch ist der
bestehende onshape-architekt nur mit lesender HMI-Extraktion im UI-Worktree und
Vergleich zur hier verfügbaren Fassung beauftragt. Die gelesene Rückmeldung
bestätigt die Designrichtung und fordert Kurz-IDs, explizite Studio-Vorschau und
präzisere Konfliktbehandlung; diese Punkte wurden ergänzt. Die sichtbare
Rückmeldung enthält keinen belastbaren Gleichheits-/Revisionsnachweis der beiden
Promptdateien; deren Gleichheit wird daher nicht behauptet.

## Entscheidungsvorschlag

[Desktop 1440×900](selector-desktop-v2.png),
[Mobile 390×844 – Bauteil](selector-mobile-v2.png),
[Mobile 390×844 – Dokument](selector-mobile-documents-v2.png).
Gleichnamige SVGs sind bearbeitbare Produktmockups, keine ausführbare UI.
Alle Daten sind Beispiele aus den Vertragsfixtures. Geometrie schematisch.

Desktop: Links ein zusammengehöriger Kontextbereich mit Schritt 1 Dokument und
Schritt 2 Workspace. Rechts Schritt 3 mit Bauteilliste und angrenzender großer
Vorschau. Damit ist die eigentliche Bauteilentscheidung der Schwerpunkt. Nur
am aktuell ausgewählten, übernehmbaren Part erscheint die primäre Aktion
„Dieses Bauteil übernehmen“. Vorschau und technische Aktionen stehen nachrangig.
Die Suche ist eine echte Dokument-/Bauteilsuche nach Vertrag, keine rein lokale
Filterung der bisherigen Zuordnung. Treffer anderer Part Studios bleiben sichtbar.

Mobile: Die Schritte werden nacheinander geöffnet; bereits gewähltes Dokument
und Workspace bilden einen kompakten Kopf mit „Ändern“. Die ausgewählte Partkarte
enthält Vorschau und Übernehmen, andere Treffer bleiben darunter erreichbar.
„Weiter zum Workspace“ ist reine Navigation. Keine seitlich überlaufenden Spalten.
Der Footer mit „Schließen“ bleibt am unteren Dialogrand erreichbar, verdeckt
keine Inhalte; der Inhaltsbereich scrollt bei Bedarf.

Genau eine sichtbare Abbruchaktion: „Schließen“ unten. Kein oberes X und kein
zweites „Abbrechen“. Escape verwirft wie Schließen den Entwurf und führt den
Fokus zurück. Erfolgreiches Übernehmen schließt ebenfalls und stellt die
bestehende kompakte Arbeitskontextkarte wieder her. Gewöhnliche Fehler halten den Dialog offen und erklären den nächsten Schritt.
Bei Revisionskonflikt oder unklarem Verbindungs-/Speicherzustand wird dagegen
der aktuelle Status geladen: den tatsächlich bestätigten Kontext anzeigen,
bei fremder gewinnender Auswahl die Abweichung erklären und erneute Prüfung
verlangen. Bleibt der Status unbekannt, ist Übernehmen gesperrt. Keine falsche
Behauptung, der alte lokale Kontext sei weiterhin der bestätigte Stand.

## Texte, Verhalten und Zustände

- Zugeordnetes Dokument zuerst und ausdrücklich „Zugeordnet“; „ausgewählt“ zeigt
  separat den provisorischen Kontext. Dokument-Suche ab zwei Zeichen, mindestens
  300 ms Verzögerung nach Vertrag; weitere Seiten nur bei hasMore, 20 Einträge.
  Beim leeren Feld verfügbare Anfangsliste/zugeordnetes Dokument anzeigen, keine
  unerklärte Leere. Bei einem Zeichen den Suchhinweis anzeigen.
- Workspaces mit belegter Rolle. Primary bleibt geschützt. Candidate und andere
  Workspaces können zum Ansehen geöffnet werden; keine neue Zielquelle behaupten.
- Partsuche über alle Part Studios des gewählten Workspaces, gruppierte Treffer;
  bei abgeschnittenem Ergebnis „Weitere Treffer vorhanden – Suche eingrenzen“.
  Parentwechsel löscht abhängige Vorschau und Auswahl, alte Antworten ignorieren.
- „Nur ansehen“ bedeutet eine bedienbare Zeile für Vorschau, keinen defekten
  ausgegrauten Treffer. Den tatsächlichen Grund anzeigen: anderes Dokument,
  anderer Workspace, bestehender Candidate, nicht zugeordnetes Part Studio,
  nicht unterstützte Konfiguration oder Bauteilart. Keine Übernahmeaktion für
  selectable:false. Auch goalEligible:true allein erlaubt keine Partübernahme.
- Vorschau zeigt den konkreten Part; Part-Studio-Vorschau ausdrücklich als solche
  beschriften. Kein Ersatz einer fehlenden Partvorschau durch Gesamtstudio. Bei
  Fehler „Vorschau nicht verfügbar“ mit Retry und zulässigem Onshape-Link;
  kein kaputtes Bildsymbol oder alte Geometrie. Fehlende optionale Vorschau ist
  von fehlender serverseitiger Übernahmebereitschaft zu unterscheiden.
- Ladezustand innerhalb betroffener Liste/Vorschau; kein Layoutsprung zu leerer
  Vollseite. Such-Leerzustand „Keine Bauteile gefunden – Suchbegriff ändern“.
  Verbindungs-/Zuordnungsfehler mit tatsächlichem nächsten Schritt.
- Laufende/ungeklärte Arbeit: Hinweis beim ausgewählten Part und keine aktive
  Übernahme. Begründung und erlaubten nächsten Schritt anzeigen. Keine neue
  Stop-/Freigabeaktion in diesen Dialog einbauen. Nach Bestätigung nichts
  automatisch mutieren oder starten.
- Während Übernahme Button „Wird übernommen …“, gegen Doppelversand sperren;
  Konflikt/Fehler direkt in derselben Karte zeigen, kein blinder Retry.
- „Stand & technische Details“ enthält Revision, Zeitpunkt, technische Identität
  und nachrangige Katalogaktualisierung. Diese Informationen bleiben erreichbar,
  dominieren aber den Einstiegsfluss nicht. Ein bloßer Katalog-Refresh ist keine
  bestätigte neue Auswahl.
- Lange Namen umbrechen; Titel/Part Studio/Kurz-ID unterscheiden gleiche Namen.
  Mindestbedienflächen, Tastaturzugang, Fokus und textliche Auswahlkennzeichnung
  vorsehen. Vorschau-Sprung darf Tastaturfokus nicht verlieren.

## Review-/spätere Abnahmekriterien

Vorgaben X1–X7 des UX-Prompts gelten weiterhin; X1 ist durch das Nutzer-OK erfüllt. Der Entwurf
adressiert X2 (ein unterer Ausgang, Übernahme am Part), X3 (echte Dokument-/
Workspaceauswahl), X4 (studioübergreifende Suche und Nur-ansehen-Gründe), X5
(angrenzende Vorschau), X6 (unveränderte Zielbindung/kompakte Karte) gestalterisch.
Das sind keine Implementierungs- oder Testnachweise.

Nach Nutzer-OK Übergabe ausschließlich an bestehenden onshape-architekt; er
prüft aktuellen erlaubten Worktree, Vertrag und Prompt, beauftragt openclaw-dev
im autorisierten UI-Scope und reviewt echte Browsernachweise bei 1440×900,
1366×768 und 390×844. Kein PO-Code, keine Backend-/Vertragsänderung durch UI,
kein Deployment/Live-Zugriff/GitHub-Schreiben. Abweichende Vertragsbedarfe als
CR-UI-n an den zuständigen Architekten, keine stillen Befugniserweiterungen.

## Ergänzungen aus dem Architekturfeedback

Sichtbare Part-Kurz-IDs JIF/JIG/JFD sind in die Mockups aufgenommen.
„Studio ansehen“ öffnet die ausdrücklich als Part-Studio-Vorschau beschriftete
Ansicht des jeweiligen Studios im selben Vorschauplatz. Beim Wechsel dort
„Bauteilvorschau“ als Rückweg anbieten. Die ausgewählte Partkarte und deren
Übernahme bleiben eindeutig; Studioansicht ist keine neue Partauswahl und
kein Ersatznachweis für das Bauteil. Bei Vorschau eines anderen Parts oder
Studios dessen Identität deutlich nennen. Der Rückweg ist kein zweiter
Dialogausgang. Beide Vorschauarten halten Stand und Identität zusammen.

## Entwicklungsübergabe nach Design-OK

Autorisiert: technische Prüfung, Beauftragung von openclaw-dev im bestehenden
UI-Worktree und technischer Review gegen X1–X7. Maßgeblich sind die bestätigten
V2-PNGs/SVGs und diese Verhaltensbeschreibung, nicht die älteren V1-Ansichten.
Der Architekt liest den aktuellen UX-Rework-Prompt im UI-Worktree und arbeitet
gegen dessen aktuellen erlaubten work-context-Vertrag/Fixtures. Betroffene
Dateien: ui/**, tests/cockpit*, scripts/test-cockpit-browser.mjs,
docs/engineering-cockpit.md und zugehörige Design-/Nachweise unter docs/product/**;
Abschlussbericht am im Prompt vorgesehenen Ort. Keine Änderungen an src/**,
Backendtests, spec.md, ADR.md oder docs/interface/** im UI-Auftrag.

Nicht-Ziele: neue Backendfunktionen oder Abhängigkeiten, Änderungen an Ziel-/
Freigabegrenzen, Runtime-/Lifecycle-Aktionen, Live-Onshape, Deployment, GitHub-
Schreiben sowie Commits, Pushes oder neue Branches/Worktrees durch diese Kette.
Vorhandene fremde Änderungen erhalten. Ausstehende Backendintegration ehrlich
benennen; bei fehlender Fähigkeit keine scheinbar funktionierende UI anbieten.

Rückgabe: tatsächlicher Diff, X1–X7 mit Ergebnissen und Grenzen, Browserbilder
bei 1440×900, 1366×768 und 390×844, Checks gemäß UX-Prompt sowie eigenes
Architektenreview. Der PO prüft anschließend Nutzerwirkung und visuelle Übereinstimmung.

Übergabe nach Nutzer-OK am 22.10.2026 einmalig mit `onshape-team prompt --stdin`
eingereicht. Vermittler meldete Status-Timeout (`submission_may_have_happened`);
anschließender Status zeigte den bestehenden Architekten als `working`.
Inhaltliche Empfangsbestätigung und Entwicklerbeauftragung noch nicht gelesen.
Kein automatisches erneutes Senden.
