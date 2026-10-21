// Native OpenClaw overview with separate, explicit interim operator actions.
const validId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
export function cadLink(target, revision) {
  if (
    !validId(target?.documentId) ||
    !validId(target?.elementId) ||
    !validId(target?.workspaceId) ||
    (revision !== undefined && !validId(revision))
  ) {
    return undefined;
  }
  return `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}${revision ? `/m/${revision}` : ''}/e/${target.elementId}`;
}
export function proposalState(p, now = Date.now()) {
  if (!p) {
    return {
      label: 'Kein Vorschlag',
      approval: 'Nicht belegt',
      execution: 'Nicht belegt',
      verification: 'Nicht belegt',
      next: 'Änderungswunsch mit dem Robotics Lead klären.',
    };
  }
  const expired = Number.isFinite(p.expiresAt) && p.expiresAt <= now;
  const verified = p.status === 'VERIFIED' && validId(p.resultMicroversion) && !!p.approvedAt;
  const rejected = p.status === 'REJECTED';
  return {
    label: verified
      ? '✓ Parameter geprüft'
      : rejected
        ? 'Abgelaufen / abgelehnt'
        : p.status === 'PROPOSED'
          ? 'Vorgeschlagen'
          : 'UNKNOWN · Ausgang unklar',
    approval: p.approvedAt ? `Erteilt${expired ? ' · Zeitfenster abgelaufen' : ''}` : 'Nicht belegt',
    execution: verified
      ? 'Änderung durch Abgleich belegt'
      : rejected && p.reason === 'approval_expired_not_dispatched'
        ? 'Nicht ausgeführt · abgeglichen'
        : 'Nicht belegt',
    verification: verified ? 'Feature-Parameter und Status geprüft' : 'Kein erfolgreicher Prüfnachweis',
    next: verified
      ? 'Variante fachlich beurteilen; offene Geometrie- und Erhaltungsprüfungen mit dem Lead klären.'
      : rejected
        ? 'Neuen Vorschlag über den Robotics Lead anfordern.'
        : p.status === 'PROPOSED'
          ? 'Vorschlag mit dem Lead prüfen; Freigabeweg durch den Operator klären.'
          : 'Ausgang über Engineer / Operator abgleichen lassen. Nicht erneut ausführen.',
    verified,
  };
}
export function candidateChoices(data) {
  const t = data?.target;
  if (!t || !validId(t.workspaceId) || !validId(t.primaryWorkspaceId)) {
    return [];
  }
  // Current contract exposes only the assigned workspace. Never infer extra workspaces from stale receipts.
  return [...new Set([t.workspaceId, t.primaryWorkspaceId])].map((workspaceId) => ({
    workspaceId,
    primary: workspaceId === t.primaryWorkspaceId,
    proposals: (data.proposals ?? [])
      .filter(
        (p) =>
          p.documentId === t.documentId &&
          p.workspaceId === workspaceId &&
          p.elementId === t.elementId &&
          p.primaryWorkspaceId === t.primaryWorkspaceId,
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  }));
}
const short = (value) => (value ? String(value).slice(0, 8) : 'nicht belegt');
const date = (value) =>
  value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('de-DE') : 'nicht belegt';
const connectionText = (code) =>
  ({
    connected: 'Verbunden · gespeicherter Verbindungsstatus',
    ready: 'Verbunden',
    disconnected: 'Nicht verbunden · Verbindung einrichten',
    reconnect_required: 'Verbindung abgelaufen · erneut verbinden',
    authorization_in_progress: 'Onshape-Einwilligung im Browser abschließen',
    not_configured: 'Keine Zuordnung · Operator kontaktieren',
    authorization_changed: 'Zugriff geändert · neu anmelden',
    live_reads_disabled: 'Live-Lesen deaktiviert · Operator kontaktieren',
    oauth_configuration_required: 'Onshape-Einrichtung fehlt · Operator kontaktieren',
  })[code] ?? 'Status unbekannt · Diagnose prüfen und aktualisieren';
const css = `
.coc{color:#e3ebf4;background:#0c141e;font:14px/1.55 system-ui,sans-serif;border:1px solid #28394a;border-radius:12px;overflow:hidden;min-width:0;color-scheme:dark}.coc *{box-sizing:border-box}.coc h1,.coc h2,.coc h3,.coc p{margin:0 0 12px}.coc h1,.coc .coc-candidate strong{overflow-wrap:anywhere}.coc h1{font-size:27px;line-height:1.25}.coc h2{font-size:17px}.coc h3{font-size:15px}.coc button,.coc select,.coc a.coc-action{font:inherit;border:1px solid #3c5669;border-radius:8px;padding:9px 13px;background:#203141;color:#e3ebf4;cursor:pointer;max-width:100%}.coc button:hover,.coc a.coc-action:hover{background:#294351}.coc button:disabled{opacity:.5;cursor:wait}.coc :focus-visible{outline:3px solid #69e5de;outline-offset:3px}.coc a{color:#68dbd5;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.coc .coc-muted{color:#a2b5c6}.coc .coc-eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a2b5c6}.coc .coc-top{padding:20px 26px;border-bottom:1px solid #28394a;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.coc .coc-top strong{font-size:18px}.coc .coc-shell{display:grid;grid-template-columns:180px minmax(0,1fr)}.coc .coc-rail{padding:24px 16px;background:#0b131d;border-right:1px solid #28394a}.coc .coc-rail a{display:block;padding:10px 8px;margin-bottom:8px;text-decoration:none}.coc .coc-rail a:first-of-type{background:#19323d;border-radius:8px}.coc .coc-rail .coc-tools{border-top:1px solid #28394a;margin-top:25px;padding-top:24px}.coc .coc-rail p{font-size:12px}.coc .coc-main{padding:26px;min-width:0}.coc .coc-context p{overflow-wrap:anywhere}.coc .coc-context{display:flex;justify-content:space-between;align-items:start;gap:18px;margin-bottom:20px;flex-wrap:wrap}.coc .coc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:0 0 20px}.coc .coc-candidate{text-align:left;background:#141f2c;min-height:105px;display:flex;flex-direction:column;gap:6px}.coc .coc-candidate[aria-pressed=true]{border-color:#55d4d0;box-shadow:inset 0 0 0 1px #55d4d0;background:#18313b}.coc .coc-candidate strong{font-size:16px}.coc .coc-body{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;align-items:start}.coc .coc-panel{background:#141f2c;border:1px solid #28394a;border-radius:12px;padding:20px;min-width:0}.coc .coc-viewer{padding:0;overflow:hidden}.coc .coc-viewhead{padding:16px 20px;background:#192633;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}.coc .coc-modes{display:flex;gap:5px;flex-wrap:wrap}.coc .coc-modes button{padding:5px 10px;font-size:12px}.coc .coc-modes button[aria-pressed=true]{background:#2c4854;color:#68dbd5}.coc .coc-stage{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:radial-gradient(ellipse at center,#1a2d3a,#0f1b26);min-height:330px}.coc .coc-stage.coc-single{grid-template-columns:1fr}.coc figure{margin:0;padding:20px;min-width:0;display:flex;flex-direction:column;gap:14px}.coc figure+figure{border-left:1px dashed #385061}.coc .coc-empty-image{flex:1;min-height:200px;display:grid;place-content:center;text-align:center;padding:24px;color:#a2b5c6;background-image:linear-gradient(#8da9bd08 1px,transparent 1px),linear-gradient(90deg,#8da9bd08 1px,transparent 1px);background-size:28px 28px}.coc figcaption{font-size:12px;overflow-wrap:anywhere}.coc .coc-lower{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:18px}.coc .coc-steps{list-style:none;padding:0;margin:20px 0}.coc .coc-steps li{padding:0 0 18px 18px;border-left:2px solid #3d5668}.coc .coc-steps strong,.coc .coc-steps span{display:block}.coc .coc-steps span{font-size:12px;color:#a2b5c6}.coc .coc-next{border:1px solid #315956;background:#17312f;border-radius:8px;padding:14px;margin-top:18px}.coc .coc-notice{padding:12px 16px;border:1px solid #826c43;background:#2b281f;border-radius:8px;margin-bottom:18px;color:#f2d399}.coc dl{margin:0}.coc dt{font-size:12px;color:#a2b5c6;margin-top:12px}.coc dd{margin:3px 0;overflow-wrap:anywhere}.coc pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px}.coc details{margin-top:18px}.coc summary{cursor:pointer;font-weight:600;padding:8px 0}.coc .coc-controls{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.coc .coc-foot{font-size:12px;color:#a2b5c6;margin-top:16px}.coc .coc-badge{color:#68dbd5}.coc .coc-revision{font-family:monospace;font-size:12px;overflow-wrap:anywhere}.coc .coc-parameter{padding:10px 0;border-bottom:1px solid #28394a}.coc .coc-parameter strong{color:#68dbd5}.coc img{width:100%;height:auto;max-height:440px;object-fit:contain}.coc [hidden]{display:none!important}@media(max-width:1250px){.coc .coc-shell{grid-template-columns:1fr}.coc .coc-rail{display:none}.coc .coc-body{grid-template-columns:minmax(0,1fr) 280px}.coc .coc-main{padding:20px}.coc .coc-lower{grid-template-columns:1fr}}@media(max-width:850px){.coc .coc-body{grid-template-columns:1fr}.coc .coc-stage{grid-template-columns:1fr}.coc figure+figure{border-left:0;border-top:1px dashed #385061}.coc .coc-main{padding:14px}.coc h1{font-size:23px}}
.coc .coc-navigation{display:flex;flex-direction:column;gap:10px}.coc .coc-navigation button{text-align:left;border:0;background:transparent}.coc .coc-navigation button[aria-current=page]{background:#19343f;color:#68dbd5;border-left:3px solid #68dbd5}.coc .coc-tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:18px 0}.coc .coc-cad-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px}.coc .coc-cad-work{min-width:0}.coc .coc-branches .coc-cards{grid-template-columns:1fr}.coc .coc-cad-work>.coc-panel{margin-bottom:18px}.coc .coc-body{grid-template-columns:minmax(0,1fr) 245px}.coc .coc-lower{grid-template-columns:1fr}.coc h3{overflow-wrap:anywhere}.coc .coc-panel+.coc-panel{margin-top:18px}.coc button:disabled{cursor:not-allowed}.coc .coc-tool-grid>.coc-panel{margin-top:0}
@media(max-width:1250px){.coc .coc-rail{display:block;padding:10px;border-right:0;border-bottom:1px solid #28394a}.coc .coc-rail>.coc-eyebrow,.coc .coc-rail>.coc-tools{display:none}.coc .coc-navigation{flex-direction:row;flex-wrap:wrap}.coc .coc-cad-layout{grid-template-columns:200px minmax(0,1fr)}.coc .coc-body{grid-template-columns:1fr}}
@media(max-width:850px){.coc .coc-cad-layout,.coc .coc-tool-grid{grid-template-columns:1fr}.coc .coc-branches .coc-cards{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.coc .coc-top{padding:16px}.coc .coc-stage{min-height:260px}}

`;
export default {
  id: 'claw-onshape',
  activate(host) {
    host.ui.registerNavigation({id: 'onshape', label: 'Claw-Onshape', page: {id: 'onshape'}, icon: 'link'});
    host.ui.registerPage({
      id: 'onshape',
      label: 'Engineering Cockpit',
      mount(container, context) {
        const el = (tag, text, cls) => {
          const node = document.createElement(tag);
          if (text !== undefined) {
            node.textContent = text;
          }
          if (cls) {
            node.className = cls
              .split(' ')
              .map((name) => (name === 'coc' ? name : `coc-${name}`))
              .join(' ');
          }
          return node;
        };
        const button = (text, handler) => {
          const node = el('button', text);
          node.type = 'button';
          node.onclick = handler;
          return node;
        };
        const anchor = (text, href, cls) => {
          const node = el('a', text, cls);
          node.href = href;
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
          return node;
        };
        const panel = (title) => {
          const node = el('section', undefined, 'panel');
          node.append(el('h2', title));
          return node;
        };
        const root = el('section', undefined, 'coc');
        root.setAttribute('aria-label', 'Engineering Cockpit');
        root.append(el('style', css));
        const top = el('header', undefined, 'top');
        top.append(
          el('strong', 'Engineering Cockpit'),
          el('span', 'Übersicht & Prüfung · Mechanical Engineer', 'muted'),
        );
        const shell = el('div', undefined, 'shell'),
          rail = el('aside', undefined, 'rail'),
          main = el('main', undefined, 'main');
        rail.append(el('p', 'Arbeitsbereich', 'eyebrow'));
        const navigation = el('nav', undefined, 'navigation');
        navigation.setAttribute('aria-label', 'Arbeitsbereich');
        const destinations = new Map();
        for (const [key, text] of [
          ['workspace', 'Workspace'],
          ['cad', 'CAD'],
          ['print', '3D Print'],
        ]) {
          const item = button(text, () => {
            selectedView = key;
            render();
            content.querySelector?.('h1')?.focus();
          });
          item.setAttribute('aria-controls', 'coc-view');
          item.setAttribute('data-view', key);
          destinations.set(key, item);
          navigation.append(item);
        }
        rail.append(navigation);
        const tools = el('div', undefined, 'tools'),
          onshape = el('p'),
          bambu = el('p', 'Bambu Studio · nicht integriert');
        tools.append(
          el('h3', 'Verbindungen'),
          onshape,
          bambu,
          el('p', 'STL, Slicing und Druckstart stehen hier nicht zur Verfügung.', 'muted'),
        );
        rail.append(tools);
        const toolbar = el('div', undefined, 'controls'),
          select = el('select');
        select.setAttribute('aria-label', 'Onshape-Verbindung');
        const refresh = button('Aktualisieren', () => load());
        toolbar.append(select, refresh);
        const notice = el('p', 'Daten werden geladen …', 'notice');
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        const content = el('div');
        content.id = 'coc-view';
        const connections = el('details', undefined, 'panel');
        connections.id = 'coc-connections';
        connections.append(el('summary', 'Verbindung & technische Details'));
        const connectionStatus = el('p'),
          diagnostic = el('pre'),
          authLink = el('a', 'Einwilligung bei Onshape fortsetzen ↗', 'action');
        authLink.hidden = true;
        authLink.target = '_blank';
        authLink.rel = 'noopener noreferrer';
        const connect = button('Onshape verbinden', () => connectionAction('connect'));
        const connectWrite = button('Lese-/Schreibzugriff verbinden', () => connectionAction('connect', true));
        const disconnect = button('Verbindung trennen', () => connectionAction('disconnect'));
        const controls = el('div', undefined, 'controls');
        controls.append(connect, connectWrite, disconnect, authLink);
        connections.append(
          connectionStatus,
          controls,
          el(
            'p',
            'Verbindungsänderungen benötigen Administratorrechte. Eine OAuth-Einwilligung ist keine CAD-Freigabe. Trennen entfernt die lokale Verbindung; den Anbieterzugriff bei Bedarf in Onshape widerrufen.',
            'muted',
          ),
          diagnostic,
        );
        const operators = el('details', undefined, 'notice');
        operators.id = 'coc-operator-actions';
        operators.append(el('summary', 'Operator-Aktionen (Übergang bis Discord-Freigabe)'));
        const operatorOutput = el('div'),
          operatorResult = el('p');
        operatorResult.setAttribute('role', 'status');
        operators.append(
          el(
            'p',
            'Benötigt operator.admin. Übergangsweg bis Discord-Freigabe (edge-robot/clawonshape#11, P3b). Jeder Klick ist ein einzelner Versuch; keine automatische Wiederholung.',
          ),
          operatorResult,
          operatorOutput,
        );
        main.append(toolbar, notice, content, operators, connections);
        shell.append(rail, main);
        root.append(top, shell);
        container.append(root);
        let disposed = false,
          generation = 0,
          timer,
          staleTimer,
          selectedView = 'workspace',
          selectedWorkspace,
          selectedProposal,
          mode = 'current',
          snapshot,
          loadedAt,
          operatorBusy = false,
          candidateAttempted = false;
        let imageGeneration = 0,
          cadImage,
          observedNames,
          namesKey,
          metadataState = 'unavailable',
          connectionCode,
          latestCapabilities,
          imageLoading = false,
          imageError,
          imageTimer;
        const clearImage = () => {
          clearTimeout(imageTimer);
          imageGeneration++;
          cadImage = undefined;
          imageLoading = false;
          imageError = undefined;
        };
        const active = (g) => !disposed && !context.signal.aborted && g === generation;
        const call = async (actionId, connectionRef, extra = {}) => {
          const wire = await context.host.request('plugins.sessionAction', {
            pluginId: 'claw-onshape',
            actionId,
            payload: {...(connectionRef ? {connectionRef} : {}), ...extra},
          });
          if (!wire?.ok || !wire.result) {
            throw new Error('plugin_unavailable');
          }
          return wire.result;
        };
        const setBusy = (busy) => {
          refresh.disabled = select.disabled = connect.disabled = connectWrite.disabled = disconnect.disabled = busy;
          root.setAttribute('aria-busy', String(busy));
        };
        const canAdmin = () => context.host.connection?.canAdmin === true;
        const operatorAllowed = (actionId, p) => {
          if (!canAdmin() || operatorBusy || !snapshot) {
            return false;
          }
          if (actionId === 'candidate-prepare') {
            return (
              !candidateAttempted &&
              snapshot.oauthWrite === true &&
              validId(snapshot.target?.workspaceId) &&
              snapshot.target.workspaceId === snapshot.target.primaryWorkspaceId
            );
          }
          if (!snapshot.proposals.includes(p)) {
            return false;
          }
          return actionId === 'mutation-approve'
            ? p.status === 'PROPOSED' && snapshot.oauthWrite === true
            : p.status === 'UNKNOWN';
        };
        const runOperator = async (actionId, p, g, ref) => {
          if (!active(g) || ref !== select.value || !operatorAllowed(actionId, p)) {
            return;
          }
          operatorBusy = true;
          if (actionId === 'candidate-prepare') {
            candidateAttempted = true;
          }
          setBusy(true);
          renderOperators();
          operatorResult.textContent = 'Aktion läuft …';
          try {
            const result = await call(
              actionId,
              ref,
              p
                ? {
                    proposalId: p.id,
                    ...(actionId === 'mutation-approve' ? {expectedPayloadHash: p.payloadHash} : {}),
                  }
                : {},
            );
            if (!active(g)) {
              return;
            }
            operatorResult.textContent = result.message ?? JSON.stringify(result, null, 2);
          } catch {
            if (active(g)) {
              operatorResult.textContent =
                'Aktion fehlgeschlagen. Status aktualisieren; keine automatische Wiederholung.';
            }
          } finally {
            operatorBusy = false;
            if (active(g)) {
              if (actionId !== 'candidate-prepare') {
                await load(true);
              } else {
                setBusy(false);
                renderOperators();
              }
            }
          }
        };
        const renderOperators = () => {
          operatorOutput.replaceChildren();
          operatorOutput.append(
            el(
              'p',
              canAdmin()
                ? 'Exakten Payload vor der Freigabe prüfen. Primary bleibt geschützt.'
                : 'operator.admin fehlt oder ist unbekannt. Aktionen bleiben deaktiviert.',
            ),
          );
          const g = generation,
            ref = select.value;
          const prepare = button('Candidate vorbereiten', () => runOperator('candidate-prepare', undefined, g, ref));
          prepare.disabled = !operatorAllowed('candidate-prepare');
          operatorOutput.append(prepare);
          for (const p of snapshot?.proposals ?? []) {
            const card = el('section', undefined, 'panel');
            card.append(el('h3', `${p.id} — ${p.status}${p.reason ? ` (${p.reason})` : ''}`), el('p', p.summary));
            card.append(
              el(
                'pre',
                JSON.stringify(
                  {
                    target: {documentId: p.documentId, workspaceId: p.workspaceId, elementId: p.elementId},
                    featureId: p.featureId,
                    sourceMicroversion: p.sourceMicroversion,
                    payloadHash: p.payloadHash,
                    body: p.body,
                  },
                  null,
                  2,
                ),
              ),
            );
            const approve = button('Approve this Candidate update', () => runOperator('mutation-approve', p, g, ref));
            const reconcile = button('Reconcile execution outcome', () => runOperator('mutation-reconcile', p, g, ref));
            approve.disabled = !operatorAllowed('mutation-approve', p);
            reconcile.disabled = !operatorAllowed('mutation-reconcile', p);
            const actions = el('div', undefined, 'controls');
            actions.append(approve, reconcile);
            card.append(actions);
            operatorOutput.append(card);
          }
        };
        const targetKey = (t, ref = select.value) =>
          t ? [ref, t.documentId, t.workspaceId, t.primaryWorkspaceId, t.elementId].join('/') : undefined;
        const metadataText = () => {
          if (metadataState === 'loading') {
            return 'Namen werden aktualisiert …';
          }
          if (!observedNames) {
            return 'Namen nicht verfügbar · Verbindung und Leserechte prüfen.';
          }
          return `Aktuelle Namen vom ${date(observedNames.observedAt)} · ${metadataState === 'fresh' && Date.now() - new Date(observedNames.observedAt).getTime() < 300000 ? 'aktuell' : 'veraltet / Aktualisierung fehlgeschlagen'}. Keine Revisions- oder Geometrieprüfung.`;
        };
        const capabilitiesText = () =>
          [
            ['read_document', 'CAD lesen'],
            ['render_part_studio', 'CAD-Ansicht'],
            ['execute_mcp_cad_mutation', 'CAD ändern'],
          ]
            .map(
              ([key, label]) =>
                `${label}: ${{AVAILABLE: 'verfügbar', UNAVAILABLE: 'nicht verfügbar', UNKNOWN: 'ungeprüft'}[latestCapabilities?.[key]?.availability] ?? 'ungeprüft'}`,
            )
            .join(' · ');
        const title = (text) => {
          const h = el('h1', text);
          h.setAttribute('tabindex', '-1');
          return h;
        };
        const renderWorkspace = () => {
          const t = snapshot?.target;
          const names = namesKey === targetKey(t) ? observedNames : undefined;
          content.append(el('p', 'Workspace', 'eyebrow'), title('Dein Engineering-Workspace'));
          const contextPanel = panel('Arbeitskontext');
          contextPanel.append(
            el('p', names?.documentName ?? (t ? `Dokument ${short(t.documentId)}` : 'Keine bestätigte Zuordnung')),
            el('p', 'Team-/Projektbezeichnung nicht konfiguriert.', 'muted'),
            el(
              'p',
              t
                ? `Workspace ${names?.workspaceName ?? t.workspaceId} · Part Studio ${names?.elementName ?? t.elementId ?? 'nicht zugeordnet'}`
                : 'Zuordnung durch den Operator prüfen lassen.',
            ),
            el('p', metadataText(), 'foot'),
          );
          const toolsPanel = el('div', undefined, 'tool-grid'),
            cad = panel('Onshape'),
            print = panel('Bambu Studio / Bambu Lab');
          cad.append(
            el('p', connectionText(connectionCode), 'badge'),
            el('p', capabilitiesText()),
            el('p', `Gespeicherter Status geladen: ${date(loadedAt)}. Fähigkeiten ersetzen keine Freigabe.`, 'muted'),
            button('Verbindung verwalten', () => {
              connections.open = true;
              connections.querySelector?.('summary')?.focus();
            }),
            button('CAD öffnen', () => {
              selectedView = 'cad';
              render();
              content.querySelector?.('h1')?.focus();
            }),
          );
          print.append(
            el('p', 'Nicht verfügbar · keine unterstützte Anbindung', 'notice'),
            el('p', 'Slicing, Profilprüfung und Druckvorschau sind hier nicht angebunden.'),
            button('Voraussetzungen ansehen', () => {
              selectedView = 'print';
              render();
              content.querySelector?.('h1')?.focus();
            }),
          );
          toolsPanel.append(cad, print);
          const next = panel('Nächster Schritt');
          next.append(
            el(
              'p',
              connectionCode === 'connected' && t
                ? 'CAD öffnen und zugeordneten Stand prüfen. Zieliteration ist noch gesperrt.'
                : 'Verbindung und Zuordnung unter „Verbindung & technische Details“ prüfen.',
            ),
          );
          content.append(contextPanel, toolsPanel, next);
        };
        const renderPrint = () => {
          content.append(
            el('p', '3D Print', 'eyebrow'),
            title('Vom STL zur Druckvorschau'),
            el('p', 'Druckvorbereitung · derzeit nicht verfügbar', 'notice'),
          );
          const grid = el('div', undefined, 'tool-grid');
          const prerequisites = panel('Datei, Profile & Slicing');
          prerequisites.append(
            el('p', 'Bambu Studio / Bambu Lab · keine unterstützte Anbindung'),
            el('p', 'STL-Import und Einheitenprüfung sind hier nicht angebunden. Keine Datei zugeordnet.'),
            el(
              'p',
              'Benötigt: geprüfte Slicer-Anbindung, vollständiges Drucker-/Düsen-, Material- und Prozessprofil sowie ein validiertes Projekt mit Werkzeugzuordnung.',
            ),
            el('p', 'Ein unterstütztes Zugriffsverfahren und die Berechtigung für den konkreten Auftrag fehlen.'),
          );
          const preview = panel('Druckvorschau · blockiert');
          preview.append(
            el('div', 'Keine geprüfte Slicing-Datei · keine Vorschau verfügbar.', 'empty-image'),
            el('p', 'Menge, Zeit und Materialbedarf sind nicht belegt.'),
            el(
              'p',
              'Nächster Schritt: STL und Profile in Bambu Studio manuell prüfen; eine unterstützte Anbindung durch den Operator bereitstellen lassen.',
            ),
            el('p', 'Kein Druckstart. CAD-Freigabe ersetzt keine Produktions- oder Druckfreigabe.', 'muted'),
          );
          grid.append(prerequisites, preview);
          content.append(grid);
        };
        const render = () => {
          renderOperators();
          for (const [key, item] of destinations) {
            if (selectedView === key) {
              item.setAttribute('aria-current', 'page');
            } else {
              item.removeAttribute('aria-current');
            }
          }
          content.replaceChildren();
          if (selectedView === 'workspace') {
            renderWorkspace();
            return;
          }
          if (selectedView === 'print') {
            renderPrint();
            return;
          }
          const choices = candidateChoices(snapshot),
            t = snapshot?.target;
          if (!choices.length) {
            content.append(
              el('p', 'Kein Workspace zugeordnet. Der Operator muss Dokument, Workspace und Bauteil prüfen.', 'notice'),
            );
            return;
          }
          const selected = choices.find((c) => c.workspaceId === selectedWorkspace) ?? choices[0];
          selectedWorkspace = selected.workspaceId;
          const p = selected.proposals.find((p) => p.id === selectedProposal) ?? selected.proposals[0];
          selectedProposal = p?.id;
          const state = proposalState(p),
            target = {...t, workspaceId: selected.workspaceId};
          const names = observedNames;
          const workspaceName = (wid) => (wid === t.workspaceId ? names?.workspaceName : names?.primaryWorkspaceName);
          const header = el('header', undefined, 'context');
          header.id = 'coc-workspace';
          const identity = el('div');
          identity.append(
            el('p', 'Onshape Workspace', 'eyebrow'),
            title(
              `${selected.primary ? 'Primary' : 'Candidate'} · ${workspaceName(selected.workspaceId) ?? short(selected.workspaceId)}`,
            ),
            el('p', `Dokument: ${names?.documentName ?? `Dokument ${short(t.documentId)}`}`),
            el(
              'p',
              `Part Studio: ${selected.workspaceId === t.workspaceId && names?.elementName ? names.elementName : `Name nicht geladen · ${short(t.elementId)}`}`,
            ),
            el('p', `Dokument ${t.documentId} · Bauteil ${t.elementId ?? 'nicht zugeordnet'}`, 'revision'),
            el('p', `Workspace ${selected.workspaceId}`, 'revision'),
            el(
              'p',
              cadImage
                ? `CAD-Stand ${cadImage.microversionId} · Ansicht vom ${date(cadImage.renderedAt)}. Bild ist revisionsgebunden; Namen beschreiben den aktuellen Workspace.`
                : 'Quelle: konfigurierte Zuordnung und gespeicherte Payload-Vorschläge. CAD-Ansicht separat laden.',
              'muted',
            ),
          );
          if (names) {
            identity.append(el('p', metadataText(), 'muted'));
          }
          header.append(identity);
          const url = cadLink(target);
          if (url) {
            header.append(anchor('Workspace in Onshape öffnen ↗', url, 'action'));
          }
          const cards = el('div', undefined, 'cards');
          cards.id = 'coc-candidates';
          for (const choice of choices) {
            const card = button('', () => {
              clearImage();
              selectedWorkspace = choice.workspaceId;
              selectedProposal = undefined;
              render();
              content.querySelector?.(`[data-workspace="${choice.workspaceId}"]`)?.focus();
            });
            card.className = 'coc-candidate';
            card.setAttribute('data-workspace', choice.workspaceId);
            card.setAttribute('aria-pressed', String(choice.workspaceId === selectedWorkspace));
            card.append(
              el(
                'span',
                choice.primary
                  ? 'Primary · geschützt'
                  : proposalState(choice.workspaceId === selectedWorkspace ? p : choice.proposals[0]).label,
                'badge',
              ),
              el(
                'strong',
                `${choice.primary ? 'Primary' : 'Candidate'} · ${workspaceName(choice.workspaceId) ?? short(choice.workspaceId)}`,
              ),
              el(
                'span',
                `${choice.proposals.length} Vorschläge${choice.workspaceId === selectedWorkspace ? ' · ausgewählt' : ''}`,
                'muted',
              ),
            );
            cards.append(card);
          }
          const branches = panel('Versionen & Branches');
          branches.className += ' coc-branches';
          branches.append(
            cards,
            el(
              'p',
              'Abstammung nicht belegt. Die Zuordnung bestätigt keine Branch-Historie; deshalb werden keine Verbindungslinien gezeichnet.',
              'muted',
            ),
          );
          const work = el('div', undefined, 'cad-work');
          const goal = panel('Feature-Ziel & Iteration');
          goal.id = 'coc-goal';
          goal.append(
            el('p', 'Blockiert · Zieliteration noch nicht verfügbar', 'notice'),
            el('p', 'Ein Ziel kann hier noch nicht verbindlich bestätigt oder zur Iteration freigegeben werden.'),
            el(
              'p',
              `Arbeitsbereich: ${selected.primary ? 'Primary · geschützt' : 'zugeordneter Candidate'} · ${names?.documentName ?? short(t.documentId)} / ${selected.workspaceId === t.workspaceId ? (names?.elementName ?? short(t.elementId)) : short(t.elementId)}`,
            ),
            el(
              'p',
              'Payload-Vorschläge sind keine Zielautorisierung. Bis der Ziel-Freigabeweg verfügbar ist, gelten die bestehenden einzelnen Operator-Freigaben.',
              'muted',
            ),
          );
          const aggregate = el('p');
          aggregate.textContent = `Gespeicherte Payload-Belege im ausgewählten Workspace: ${selected.proposals.length} · ${selected.proposals.filter((p) => p.status === 'VERIFIED').length} mit Status VERIFIED · ${selected.proposals.filter((p) => p.status === 'UNKNOWN').length} mit unklarem Ausgang. Kein Nachweis einer erreichten Zieliteration.`;
          goal.append(aggregate);
          work.append(goal);
          const cadLayout = el('div', undefined, 'cad-layout');
          cadLayout.append(branches, work);
          content.append(header, cadLayout);
          const body = el('div', undefined, 'body'),
            left = el('div'),
            viewer = el('section', undefined, 'panel viewer'),
            viewhead = el('div', undefined, 'viewhead'),
            modes = el('div', undefined, 'modes');
          viewhead.append(el('h2', 'Modellvergleich'));
          for (const [key, label] of [
            ['compare', 'Vergleich'],
            ['candidate', 'Auswahl'],
            ['current', 'Aktueller CAD-Stand'],
          ]) {
            const b = button(label, () => {
              mode = key;
              render();
              content.querySelector?.(`[data-mode="${key}"]`)?.focus();
            });
            b.setAttribute('data-mode', key);
            b.setAttribute('aria-pressed', String(mode === key));
            modes.append(b);
          }
          viewhead.append(modes);
          const loadImage = button(imageLoading ? 'Ansicht wird geladen …' : 'CAD-Ansicht laden / erneuern', () =>
            loadCadImage(),
          );
          loadImage.disabled = imageLoading || selected.workspaceId !== t.workspaceId;
          viewhead.append(loadImage);
          const stage = el('div', undefined, mode === 'compare' && !selected.primary ? 'stage' : 'stage single');
          const view = (label, workspaceId, revision) => {
            const figure = el('figure');
            figure.append(
              el('strong', label, 'badge'),
              el(
                'div',
                'Keine revisionsgebundene Ansicht verfügbar. Ansicht über den Robotics Lead anfordern.',
                'empty-image',
              ),
            );
            const caption = el('figcaption');
            caption.append(
              el('p', `CAD-Stand: ${revision ?? 'nicht belegt'}`, 'revision'),
              el(
                'p',
                revision
                  ? 'Quelle: gespeicherter Vorschlag / Abgleich. Aktualität gegenüber Onshape unbekannt.'
                  : 'Aktuellen CAD-Stand über den Lead prüfen lassen.',
                'muted',
              ),
            );
            const revisionUrl = revision && cadLink({...t, workspaceId}, revision);
            if (revisionUrl) {
              caption.append(anchor('Diesen CAD-Stand in Onshape öffnen ↗', revisionUrl));
            }
            figure.append(caption);
            return figure;
          };
          if (mode === 'current') {
            const figure = el('figure');
            figure.append(el('strong', 'Aktuell geladene CAD-Ansicht · kein Geometrieprüfnachweis', 'badge'));
            if (cadImage) {
              const displayedImage = cadImage,
                displayedGeneration = imageGeneration;
              const img = el('img');
              img.alt = `Onshape Part Studio · CAD-Revision ${cadImage.microversionId}`;
              img.src = `data:image/png;base64,${cadImage.pngBase64Chunks.join('')}`;
              img.width = cadImage.width;
              img.height = cadImage.height;
              img.onerror = () => {
                if (
                  disposed ||
                  context.signal.aborted ||
                  imageGeneration !== displayedGeneration ||
                  cadImage !== displayedImage
                ) {
                  return;
                }
                clearImage();
                imageError =
                  'Bildanzeige fehlgeschlagen. Browser-Richtlinie und Verbindung durch den Operator prüfen lassen.';
                render();
              };
              figure.append(img);
              const caption = el('figcaption');
              caption.append(
                el('p', `CAD-Stand: ${cadImage.microversionId}`, 'revision'),
                el(
                  'p',
                  `Quelle: Onshape REST · gerendert ${date(cadImage.renderedAt)}${Date.now() - new Date(cadImage.renderedAt).getTime() >= 300000 ? ' · Ansicht veraltet, bitte erneuern' : ''}`,
                  'muted',
                ),
                anchor('Diesen CAD-Stand in Onshape öffnen ↗', cadImage.revisionUrl),
              );
              if (p && cadImage.microversionId !== (p.resultMicroversion ?? p.sourceMicroversion)) {
                caption.append(
                  el(
                    'p',
                    'Dieser CAD-Stand weicht vom ausgewählten Vorschlag ab. Dessen Freigabe und Prüfbelege gelten nicht automatisch für diese Ansicht.',
                    'notice',
                  ),
                );
              }
              const details = el('details');
              details.append(
                el('summary', 'Bildherkunft & Integrität'),
                el('p', `${cadImage.width} × ${cadImage.height} Pixel · ${cadImage.bytes} Bytes`),
                el('p', `SHA-256: ${cadImage.sha256}`, 'revision'),
              );
              caption.append(details);
              figure.append(caption);
            } else {
              figure.append(
                el(
                  'div',
                  imageLoading
                    ? 'CAD-Ansicht wird geladen …'
                    : (imageError ??
                        (selected.workspaceId === t.workspaceId
                          ? 'Ansicht ausdrücklich mit „CAD-Ansicht laden / erneuern“ abrufen.'
                          : 'Live-Ansicht nur für den konfigurierten Workspace verfügbar. Für Primary den revisionsgebundenen Onshape-Link im Vergleich nutzen.')),
                  'empty-image',
                ),
              );
            }
            stage.append(figure);
          } else {
            if (mode === 'compare' && !selected.primary) {
              stage.append(view('Primary · Ausgangsstand', t.primaryWorkspaceId, p?.primaryMicroversionId));
            }
            stage.append(
              view(
                selected.primary ? 'Primary · geschützt' : 'Candidate · ausgewählter Stand',
                selected.workspaceId,
                p?.resultMicroversion ?? p?.sourceMicroversion,
              ),
            );
          }
          viewer.append(viewhead, stage);
          left.append(viewer);
          const lower = el('div', undefined, 'lower'),
            changes = panel('Was hat sich geändert?'),
            reuse = panel('Ergebnis & Weiterverwendung');
          changes.append(
            el(
              'p',
              state.verified
                ? 'Parameter im Ergebnis stimmen mit dem freigegebenen Payload überein. Vorher-Werte sind nicht gespeichert.'
                : 'Noch keine ausgeführten Änderungen belegt.',
              'muted',
            ),
          );
          for (const param of p?.body?.feature?.parameters ?? []) {
            if (typeof param.expression !== 'string') {
              continue;
            }
            const row = el('div', undefined, 'parameter');
            row.append(
              el('span', `${param.parameterId ?? 'Parameter'} · ${state.verified ? 'abgeglichen' : 'vorgeschlagen'}: `),
              el('strong', param.expression),
            );
            changes.append(row);
          }
          changes.append(
            el('h3', 'Erhaltungsbedingungen'),
            el(
              'p',
              'Siehe Auftrag. Positionen, Außenmaße und mechanische Eignung sind nicht separat nachgewiesen.',
              'muted',
            ),
          );
          if (state.verified) {
            changes.append(
              el('p', 'Primary war beim Ergebnisabgleich unverändert. Dies ist keine Aussage über spätere Änderungen.'),
            );
          }
          reuse.append(
            el('p', 'Onshape · verfügbare Fähigkeiten', 'eyebrow'),
            el(
              'p',
              [
                ['read_document', 'CAD lesen'],
                ['render_part_studio', 'CAD-Ansicht'],
                ['execute_mcp_cad_mutation', 'CAD ändern'],
              ]
                .map(([key, label]) => {
                  const available = snapshot.capabilities?.[key]?.availability;
                  return `${label}: ${{AVAILABLE: 'verfügbar', UNAVAILABLE: 'nicht verfügbar', UNKNOWN: 'ungeprüft'}[available] ?? 'ungeprüft'}`;
                })
                .join(' · '),
            ),
            el(
              'p',
              'Bei ungeprüften Fähigkeiten Verbindung und Diagnose prüfen. Verfügbarkeit ersetzt keine Freigabe.',
              'muted',
            ),
            el('p', 'STL & Druckvorbereitung', 'eyebrow'),
            el('p', 'Nicht verfügbar · keine angebundene Produktionsfreigabe, kein bestätigtes Slicing.'),
            el('p', 'Channel-Zustellung: kein bestätigter Beleg verfügbar.', 'muted'),
            el('p', 'CAD-Stand und Prüfumfang mit dem Robotics Lead beurteilen.'),
          );
          lower.append(changes, reuse);
          left.append(lower);
          const history = el('details', undefined, 'panel');
          history.append(el('summary', 'Payload-Vorschläge & technische Nachweise'));
          const evidence = el('section');
          evidence.append(el('h2', 'Auftrag & Nachweise'));
          evidence.id = 'coc-evidence';
          if (selected.proposals.length > 1) {
            const releases = el('select');
            releases.setAttribute('aria-label', 'Vorschlag auswählen');
            for (const item of selected.proposals) {
              const option = el('option', `${short(item.id)} · ${proposalState(item).label}`);
              option.value = item.id;
              releases.append(option);
            }
            releases.value = p.id;
            releases.onchange = () => {
              clearImage();
              selectedProposal = releases.value;
              render();
              content.querySelector?.('[aria-label="Vorschlag auswählen"]')?.focus();
            };
            evidence.append(releases);
          }
          evidence.append(
            el('p', state.label, 'badge'),
            el('p', p ? `Auftrag ${p.requestId}` : 'Kein gespeicherter Auftrag', 'revision'),
            el('h3', 'Änderungsziel'),
            el('p', p?.summary ?? 'Noch kein Änderungsvorschlag vorhanden.'),
          );
          if (p) {
            evidence.append(el('h3', 'Originalauftrag'), el('p', p.task));
          }
          const steps = el('ol', undefined, 'steps');
          for (const [title, detail] of [
            ['1 · Vorgeschlagen', p ? date(p.createdAt) : 'Nicht vorhanden'],
            ['2 · Freigabe', `${state.approval}${p?.approvedAt ? ` · ${date(p.approvedAt)}` : ''}`],
            ['3 · Ausführung', state.execution],
            ['4 · Prüfung', state.verification],
          ]) {
            const li = el('li');
            li.append(el('strong', title), el('span', detail));
            steps.append(li);
          }
          evidence.append(
            steps,
            el(
              'p',
              'Eine Freigabe ist kein Ausführungsnachweis. Parameterprüfung ersetzt keine vollständige Geometrieprüfung.',
              'muted',
            ),
          );
          const next = el('div', undefined, 'next');
          next.append(el('p', 'Nächster Schritt', 'eyebrow'), el('p', state.next));
          evidence.append(next);
          if (p) {
            const details = el('details');
            details.append(
              el('summary', 'Beleg & Freigabezuordnung'),
              el(
                'p',
                'Quelle: gespeicherter ClawOnshape-Mutationsbeleg. Freigebende Identität und separater Ausführungszeitpunkt sind in diesem Datenvertrag nicht enthalten.',
                'muted',
              ),
              el('pre', JSON.stringify(p, null, 2)),
            );
            evidence.append(details);
          }
          evidence.append(el('p', `Daten geladen: ${date(loadedAt)} · kein Live-Abgleich des CAD-Stands`, 'foot'));
          const nextPanel = panel('Nächster Schritt');
          nextPanel.append(
            el('p', 'Zieliteration blockiert. Vorhandene Payload-Belege prüfen; UNKNOWN zuerst abgleichen.'),
            el('p', state.next, 'muted'),
          );
          history.append(evidence);
          body.append(left, nextPanel);
          work.append(body, history);
        };
        const loadCadImage = async () => {
          if (!snapshot || selectedWorkspace !== snapshot.target.workspaceId) {
            return;
          }
          const g = generation;
          clearImage();
          const ig = imageGeneration;
          const target = snapshot.target;
          imageLoading = true;
          mode = 'current';
          render();
          try {
            const result = await call('render', select.value);
            if (!active(g) || ig !== imageGeneration) {
              return;
            }
            if (result.status !== 'ok') {
              throw new Error(result.code ?? 'plugin_unavailable');
            }
            if (
              ['documentId', 'workspaceId', 'elementId'].some((key) => result[key] !== target[key]) ||
              !validId(result.microversionId) ||
              result.revisionUrl !== cadLink(target, result.microversionId) ||
              !Array.isArray(result.pngBase64Chunks) ||
              result.pngBase64Chunks.length < 1 ||
              result.pngBase64Chunks.length > 4 ||
              result.pngBase64Chunks.some(
                (chunk) => typeof chunk !== 'string' || chunk.length > 60000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk),
              ) ||
              result.bytes > 180000 ||
              result.width !== 800 ||
              result.height !== 800 ||
              !Number.isFinite(new Date(result.renderedAt).getTime())
            ) {
              throw new Error('image_metadata_invalid');
            }
            const bytes = Uint8Array.from(atob(result.pngBase64Chunks.join('')), (c) => c.charCodeAt(0));
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
              b.toString(16).padStart(2, '0'),
            ).join('');
            if (!active(g) || ig !== imageGeneration) {
              return;
            }
            if (bytes.length !== result.bytes || digest !== result.sha256) {
              throw new Error('image_metadata_invalid');
            }
            cadImage = result;
            imageTimer = setTimeout(() => {
              if (active(g) && ig === imageGeneration) {
                render();
              }
            }, 300000);
          } catch (error) {
            if (!active(g) || ig !== imageGeneration) {
              return;
            }
            if (
              ['authorization_changed', 'reconnect_required', 'disconnected', 'live_reads_disabled'].includes(
                error.message,
              )
            ) {
              observedNames = undefined;
              metadataState = 'unavailable';
            }
            imageError =
              error.message === 'dashboard_image_too_large'
                ? 'Ansicht zu groß für den Dashboard-Transport (max. 180 kB PNG). CAD im Onshape-Workspace öffnen; Operator informieren.'
                : `Ansicht nicht verfügbar. ${connectionText(error.message)}. Bei Zugriffsfehlern Verbindung und Berechtigungen prüfen.`;
          } finally {
            if (active(g) && ig === imageGeneration) {
              imageLoading = false;
              render();
            }
          }
        };
        const loadWorkspaceContext = async (g, t, ref) => {
          const key = targetKey(t, ref);
          if (namesKey !== key) {
            observedNames = undefined;
          }
          namesKey = key;
          metadataState = 'loading';
          render();
          try {
            const result = await call('workspace-context', ref);
            if (!active(g) || key !== targetKey(snapshot?.target) || key !== namesKey) {
              return;
            }
            if (result.status !== 'ok') {
              throw new Error(result.code ?? 'plugin_unavailable');
            }
            if (
              result.connectionRef !== ref ||
              targetKey(result.target, ref) !== key ||
              !Number.isFinite(new Date(result.observedAt).getTime())
            ) {
              observedNames = undefined;
              throw new Error('context_invalid');
            }
            const labels = {observedAt: result.observedAt};
            for (const field of ['documentName', 'workspaceName', 'primaryWorkspaceName', 'elementName']) {
              const value = result[field];
              if (
                typeof value === 'string' &&
                !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value) &&
                value.trim() &&
                Array.from(value.trim()).length <= 256
              ) {
                labels[field] = value.trim();
              }
            }
            observedNames = labels;
            metadataState = 'fresh';
          } catch (error) {
            if (!active(g) || namesKey !== key) {
              return;
            }
            if (
              [
                'authorization_changed',
                'reconnect_required',
                'disconnected',
                'live_reads_disabled',
                'not_configured',
                'oauth_read_scope_missing',
                'context_invalid',
              ].includes(error.message)
            ) {
              observedNames = undefined;
            }
            metadataState = observedNames ? 'stale' : 'unavailable';
          }
          if (active(g)) {
            render();
          }
        };
        const load = async (keepOperatorResult = false) => {
          candidateAttempted = false;
          if (!keepOperatorResult) {
            operatorResult.textContent = '';
          }
          clearImage();
          metadataState = observedNames ? 'loading' : 'unavailable';
          const g = ++generation,
            ref = select.value;
          clearTimeout(timer);
          clearTimeout(staleTimer);
          setBusy(true);
          onshape.textContent = 'Onshape · Status wird geladen';
          connectionStatus.textContent = 'Status wird geladen …';
          diagnostic.textContent = '';
          snapshot = undefined;
          render();
          notice.textContent = 'Daten werden geladen …';
          try {
            const status = await call('status', ref);
            if (!active(g)) {
              return;
            }
            select.replaceChildren();
            for (const name of status.connections ?? []) {
              const option = el('option', name);
              option.value = name;
              select.append(option);
            }
            select.value = (status.connections ?? []).includes(ref) ? ref : (status.connections?.[0] ?? '');
            connectionCode = status.code;
            latestCapabilities = status.capabilities;
            if (status.code !== 'connected' && status.code !== 'ready') {
              observedNames = undefined;
              namesKey = undefined;
            }
            onshape.textContent = `Onshape · ${connectionText(status.code)}`;
            connectionStatus.textContent = connectionText(status.code);
            diagnostic.textContent = JSON.stringify(
              {code: status.code, capabilities: status.capabilities, mcp: status.mcp},
              null,
              2,
            );
            if (status.code === 'authorization_in_progress') {
              timer = setTimeout(() => load(), 2000);
            } else {
              authLink.hidden = true;
              authLink.removeAttribute('href');
            }
            if (!select.value) {
              throw new Error('not_configured');
            }
            const data = await call('mutation-status', select.value);
            if (!active(g)) {
              return;
            }
            if (data.status !== 'ok' || !Array.isArray(data.proposals)) {
              throw new Error(data.code ?? 'plugin_unavailable');
            }
            snapshot = {...data, capabilities: status.capabilities};
            if (namesKey !== targetKey(data.target)) {
              observedNames = undefined;
            }
            loadedAt = Date.now();
            render();
            notice.textContent =
              'Vorschlagsdaten geladen · CAD-Ansicht separat laden. Freigaben und Prüfbelege gelten nur für ihren jeweiligen CAD-Stand.';
            if (['reconnect_required', 'disconnected'].includes(status.code)) {
              notice.textContent =
                'Gespeicherte Zuordnung geladen. Für Live-Ansichten unter „Verbindung & technische Details“ Onshape erneut verbinden und die Einwilligung abschließen.';
            }
            staleTimer = setTimeout(() => {
              if (active(g)) {
                notice.textContent =
                  'Anzeige veraltet · seit fünf Minuten nicht geladen. Bitte aktualisieren; CAD-Aktualität bleibt separat zu prüfen.';
                render();
              }
            }, 300000);
            if (status.code === 'connected' || status.code === 'ready') {
              await loadWorkspaceContext(g, data.target, select.value);
            } else {
              metadataState = 'unavailable';
              render();
            }
          } catch (error) {
            if (!active(g)) {
              return;
            }
            snapshot = undefined;
            observedNames = undefined;
            namesKey = undefined;
            metadataState = 'unavailable';
            connectionCode = 'unknown';
            latestCapabilities = undefined;
            render();
            onshape.textContent = 'Onshape · Status prüfen';
            notice.textContent =
              'Daten nicht verfügbar. Verbindung und Dashboard-Zugriff prüfen, dann aktualisieren. Es werden keine alten Candidates angezeigt.';
            if (['reconnect_required', 'disconnected', 'oauth_read_scope_missing'].includes(error.message)) {
              notice.textContent =
                'Onshape-Verbindung erneuern: unten „Onshape verbinden“ wählen, Einwilligung im Browser abschließen und anschließend aktualisieren. Keine alten Candidates werden angezeigt.';
              onshape.textContent = 'Onshape · Verbindung erneuern';
            }
            diagnostic.textContent = `Status: ${error.message}`;
          } finally {
            if (active(g)) {
              setBusy(false);
            }
          }
        };
        const connectionAction = async (actionId, write = false) => {
          clearImage();
          observedNames = undefined;
          namesKey = undefined;
          metadataState = 'unavailable';
          const g = ++generation;
          clearTimeout(timer);
          clearTimeout(staleTimer);
          snapshot = undefined;
          render();
          setBusy(true);
          authLink.hidden = true;
          authLink.removeAttribute('href');
          operatorResult.textContent = '';
          notice.textContent = 'Verbindung wird aktualisiert …';
          try {
            const result = await call(actionId, select.value, write ? {requestRestWriteAccess: true} : {});
            if (!active(g)) {
              return;
            }
            connectionStatus.textContent = connectionText(result.code);
            diagnostic.textContent = `Status: ${result.code}`;
            notice.textContent = connectionText(result.code);
            if (result.code === 'authorization_in_progress' && result.authorizationUrl) {
              const url = new URL(result.authorizationUrl);
              if (url.origin !== 'https://oauth.onshape.com' || url.pathname !== '/oauth/authorize') {
                throw new Error('invalid_authorization_url');
              }
              authLink.href = url.href;
              authLink.hidden = false;
              timer = setTimeout(() => load(), 2000);
            } else {
              await load();
            }
          } catch {
            if (active(g)) {
              notice.textContent =
                'Verbindungsänderung fehlgeschlagen. Administratorrechte prüfen und Status aktualisieren.';
            }
          } finally {
            if (active(g)) {
              setBusy(false);
            }
          }
        };
        select.onchange = () => {
          selectedWorkspace = selectedProposal = undefined;
          authLink.hidden = true;
          authLink.removeAttribute('href');
          observedNames = undefined;
          namesKey = undefined;
          return load();
        };
        void load();
        return {
          dispose() {
            clearImage();
            disposed = true;
            generation++;
            clearTimeout(timer);
            clearTimeout(staleTimer);
            root.remove();
          },
        };
      },
    });
  },
};
