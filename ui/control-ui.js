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
const knownCount = (value) => (Number.isSafeInteger(value) && value >= 0 ? String(value) : 'unbekannt');
// A missing summary projects null counters as well as a null sequence. Null sequence alone is not clearance.
export const journalKnown = (progress) =>
  progress &&
  Number.isSafeInteger(progress.dispatches) &&
  progress.dispatches >= 0 &&
  Number.isSafeInteger(progress.remaining) &&
  progress.remaining >= 0 &&
  Object.hasOwn(progress, 'unreconciledSequence');
const reviewComplete = (goal) =>
  typeof goal.goalText === 'string' &&
  goal.goalText.length > 0 &&
  Array.isArray(goal.goalConditions) &&
  goal.goalConditions.length > 0 &&
  Array.isArray(goal.preservationConditions) &&
  [...goal.goalConditions, ...goal.preservationConditions].every((c) => typeof c.text === 'string' && c.id && c.kind) &&
  Array.isArray(goal.scope?.featureIds) &&
  goal.scope.featureIds.length > 0 &&
  Array.isArray(goal.scope.operations) &&
  goal.scope.operations.length > 0 &&
  Number.isSafeInteger(goal.scope.maxDispatches) &&
  goal.scope.maxDispatches > 0 &&
  Number.isSafeInteger(goal.scope.lifetimeMs) &&
  goal.scope.lifetimeMs > 0 &&
  ['documentId', 'elementId', 'primaryWorkspaceId', 'baseMicroversion'].every((key) => validId(goal.target?.[key])) &&
  (goal.target.candidateWorkspaceId === null ||
    (validId(goal.target.candidateWorkspaceId) &&
      goal.target.candidateWorkspaceId !== goal.target.primaryWorkspaceId)) &&
  /^[a-f0-9]{64}$/.test(goal.goalHash ?? '') &&
  Number.isFinite(goal.confirmation?.expiresAt);
export function goalLabel(goal) {
  if (goal.state === 'COMPLETED') {
    return goal.progress?.lastVerification?.passed === true
      ? '✓ Ziel erreicht · geprüft'
      : 'Zielabschluss nicht belegt · Prüfnachweis fehlt';
  }
  return (
    {
      AWAITING_CONFIRMATION: 'Ziel wartet auf Bestätigung',
      ACTIVE: 'Ziel freigegeben · Engineer arbeitet',
      RECONCILING: 'Ausgang unklar · Abgleich läuft',
      BLOCKED: 'Ziel blockiert',
      STOPPED: 'Ziel gestoppt',
      EXPIRED: 'Zielfreigabe abgelaufen',
      FAILED: 'Ziel fehlgeschlagen',
      CLOSED: 'Ziel abgeschlossen · Änderungen bleiben erhalten',
    }[goal.state] ?? 'Zielstatus unbekannt'
  );
}
export function goalRevisionLink(goal) {
  const raw = goal.result?.revisionUrl;
  if (typeof raw !== 'string') {
    return undefined;
  }
  const match =
    /^https:\/\/cad\.onshape\.com\/documents\/([a-f0-9]{24})\/w\/([a-f0-9]{24})\/m\/([a-f0-9]{24})\/e\/([a-f0-9]{24})$/.exec(
      raw,
    );
  if (
    !match ||
    match[1] !== goal.target?.documentId ||
    match[2] !== goal.target?.candidateWorkspaceId ||
    match[4] !== goal.target?.elementId
  ) {
    return undefined;
  }
  return raw;
}

const css = `
.coc .coc-selection-dialog{color:#e3ebf4;background:#101c29;border:1px solid #476475;border-radius:12px;width:min(1120px,calc(100vw - 24px));max-height:calc(100dvh - 32px);padding:24px;overflow:auto}.coc .coc-selection-dialog::backdrop{background:#000b}.coc .coc-selection-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr);gap:18px;margin:18px 0}.coc .coc-selection-columns section{min-width:0}.coc .coc-selection-columns button{display:block;width:100%;text-align:left;margin:7px 0;overflow-wrap:anywhere}.coc .coc-selection-columns button[aria-pressed=true]{border-color:#68dbd5;background:#193e45}.coc .coc-selection-dialog input{display:block;width:100%;font:inherit;padding:8px;border:1px solid #476475;border-radius:6px;margin:6px 0 12px}.coc .coc-selection-dialog p,.coc .coc-selection-dialog h3{overflow-wrap:anywhere}.coc .coc-selection-studio{border-top:1px solid #345;padding-top:12px;margin-top:14px}.coc .coc-selection-summary{border-top:1px solid #345;padding-top:16px}.coc .coc-selection-summary img{max-height:180px;width:240px;display:block}@media(max-width:700px){.coc .coc-selection-columns{grid-template-columns:1fr}.coc .coc-selection-dialog{padding:16px}}

.coc{color:#e3ebf4;background:#0c141e;font:14px/1.55 system-ui,sans-serif;border:1px solid #28394a;border-radius:12px;overflow:hidden;min-width:0;color-scheme:dark}.coc *{box-sizing:border-box}.coc h1,.coc h2,.coc h3,.coc p{margin:0 0 12px}.coc h1,.coc .coc-candidate strong{overflow-wrap:anywhere}.coc h1{font-size:27px;line-height:1.25}.coc h2{font-size:17px}.coc h3{font-size:15px}.coc button,.coc select,.coc a.coc-action{font:inherit;border:1px solid #3c5669;border-radius:8px;padding:9px 13px;background:#203141;color:#e3ebf4;cursor:pointer;max-width:100%}.coc button:hover,.coc a.coc-action:hover{background:#294351}.coc button:disabled{opacity:.5;cursor:wait}.coc :focus-visible{outline:3px solid #69e5de;outline-offset:3px}.coc a{color:#68dbd5;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.coc .coc-muted{color:#a2b5c6}.coc .coc-eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a2b5c6}.coc .coc-top{padding:20px 26px;border-bottom:1px solid #28394a;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.coc .coc-top strong{font-size:18px}.coc .coc-shell{display:grid;grid-template-columns:180px minmax(0,1fr)}.coc .coc-rail{padding:24px 16px;background:#0b131d;border-right:1px solid #28394a}.coc .coc-rail a{display:block;padding:10px 8px;margin-bottom:8px;text-decoration:none}.coc .coc-rail a:first-of-type{background:#19323d;border-radius:8px}.coc .coc-rail .coc-tools{border-top:1px solid #28394a;margin-top:25px;padding-top:24px}.coc .coc-rail p{font-size:12px}.coc .coc-main{padding:26px;min-width:0}.coc .coc-context p{overflow-wrap:anywhere}.coc .coc-context{display:flex;justify-content:space-between;align-items:start;gap:18px;margin-bottom:20px;flex-wrap:wrap}.coc .coc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:0 0 20px}.coc .coc-candidate{text-align:left;background:#141f2c;min-height:105px;display:flex;flex-direction:column;gap:6px}.coc .coc-candidate[aria-pressed=true]{border-color:#55d4d0;box-shadow:inset 0 0 0 1px #55d4d0;background:#18313b}.coc .coc-candidate strong{font-size:16px}.coc .coc-body{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;align-items:start}.coc .coc-panel{background:#141f2c;border:1px solid #28394a;border-radius:12px;padding:20px;min-width:0}.coc .coc-viewer{padding:0;overflow:hidden}.coc .coc-viewhead{padding:16px 20px;background:#192633;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}.coc .coc-modes{display:flex;gap:5px;flex-wrap:wrap}.coc .coc-modes button{padding:5px 10px;font-size:12px}.coc .coc-modes button[aria-pressed=true]{background:#2c4854;color:#68dbd5}.coc .coc-stage{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:radial-gradient(ellipse at center,#1a2d3a,#0f1b26);min-height:330px}.coc .coc-stage.coc-single{grid-template-columns:1fr}.coc figure{margin:0;padding:20px;min-width:0;display:flex;flex-direction:column;gap:14px}.coc figure+figure{border-left:1px dashed #385061}.coc .coc-empty-image{flex:1;min-height:200px;display:grid;place-content:center;text-align:center;padding:24px;color:#a2b5c6;background-image:linear-gradient(#8da9bd08 1px,transparent 1px),linear-gradient(90deg,#8da9bd08 1px,transparent 1px);background-size:28px 28px}.coc figcaption{font-size:12px;overflow-wrap:anywhere}.coc .coc-lower{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:18px}.coc .coc-steps{list-style:none;padding:0;margin:20px 0}.coc .coc-steps li{padding:0 0 18px 18px;border-left:2px solid #3d5668}.coc .coc-steps strong,.coc .coc-steps span{display:block}.coc .coc-steps span{font-size:12px;color:#a2b5c6}.coc .coc-next{border:1px solid #315956;background:#17312f;border-radius:8px;padding:14px;margin-top:18px}.coc .coc-notice{padding:12px 16px;border:1px solid #826c43;background:#2b281f;border-radius:8px;margin-bottom:18px;color:#f2d399}.coc dl{margin:0}.coc dt{font-size:12px;color:#a2b5c6;margin-top:12px}.coc dd{margin:3px 0;overflow-wrap:anywhere}.coc pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px}.coc details{margin-top:18px}.coc summary{cursor:pointer;font-weight:600;padding:8px 0}.coc .coc-controls{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.coc .coc-foot{font-size:12px;color:#a2b5c6;margin-top:16px}.coc .coc-badge{color:#68dbd5}.coc .coc-revision{font-family:monospace;font-size:12px;overflow-wrap:anywhere}.coc .coc-parameter{padding:10px 0;border-bottom:1px solid #28394a}.coc .coc-parameter strong{color:#68dbd5}.coc img{width:100%;height:auto;max-height:440px;object-fit:contain}.coc [hidden]{display:none!important}@media(max-width:1250px){.coc .coc-shell{grid-template-columns:1fr}.coc .coc-rail{display:none}.coc .coc-body{grid-template-columns:minmax(0,1fr) 280px}.coc .coc-main{padding:20px}.coc .coc-lower{grid-template-columns:1fr}}@media(max-width:850px){.coc .coc-body{grid-template-columns:1fr}.coc .coc-stage{grid-template-columns:1fr}.coc figure+figure{border-left:0;border-top:1px dashed #385061}.coc .coc-main{padding:14px}.coc h1{font-size:23px}}
.coc .coc-navigation{display:flex;flex-direction:column;gap:10px}.coc .coc-navigation button{text-align:left;border:0;background:transparent}.coc .coc-navigation button[aria-current=page]{background:#19343f;color:#68dbd5;border-left:3px solid #68dbd5}.coc .coc-tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:18px 0}.coc .coc-cad-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px}.coc .coc-cad-work{min-width:0}.coc .coc-branches .coc-cards{grid-template-columns:1fr}.coc .coc-cad-work>.coc-panel{margin-bottom:18px}.coc .coc-body{grid-template-columns:minmax(0,1fr) 245px}.coc .coc-lower{grid-template-columns:1fr}.coc h3{overflow-wrap:anywhere}.coc .coc-panel+.coc-panel{margin-top:18px}.coc button:disabled{cursor:not-allowed}.coc .coc-tool-grid>.coc-panel{margin-top:0}
@media(max-width:1250px){.coc .coc-rail{display:block;padding:10px;border-right:0;border-bottom:1px solid #28394a}.coc .coc-rail>.coc-eyebrow,.coc .coc-rail>.coc-tools{display:none}.coc .coc-navigation{flex-direction:row;flex-wrap:wrap}.coc .coc-cad-layout{grid-template-columns:200px minmax(0,1fr)}.coc .coc-body{grid-template-columns:1fr}}
@media(max-width:850px){.coc .coc-cad-layout,.coc .coc-tool-grid{grid-template-columns:1fr}.coc .coc-branches .coc-cards{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.coc .coc-top{padding:16px}.coc .coc-stage{min-height:260px}}

.coc .coc-goal-context{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,3fr);gap:4px 14px}.coc .coc-goal-context dt,.coc .coc-goal-context dd{margin:0}.coc .coc-goal-review{overflow-wrap:anywhere}.coc .coc-goal-progress{font-size:16px;color:#68dbd5;margin-top:16px}.coc #coc-goal ul{padding-left:20px;overflow-wrap:anywhere}@media(max-width:850px){.coc .coc-goal-context{grid-template-columns:1fr}}
`;
// Contract work-context-1.0.0-draft. Drafts never leave this page except on explicit adoption.
export const workContextReason = (code) =>
  ({
    selection_observation_stale: 'Stand hat sich geändert. Katalog aktualisieren und Auswahl erneut prüfen.',
    selection_part_missing: 'Bauteil nicht mehr vorhanden. Bitte erneut auswählen.',
    selection_part_unsupported: 'Bauteilart nicht unterstützt. Ein anderes Volumenbauteil auswählen.',
    part_kind_unsupported: 'Bauteilart nicht unterstützt · nur Volumenbauteile ohne Netz oder abgewickeltes Blech.',
    configuration_unsupported:
      'Konfiguriertes Part Studio nicht unterstützt. Ein Studio ohne Konfigurationsparameter wählen.',
    element_not_provisioned: 'Part Studio nicht für Ziele freigegeben. Zuordnung durch Operator prüfen lassen.',
    selection_target_not_allowed: 'Auswahl außerhalb der erlaubten Zuordnung. Keine Übernahme; Operator kontaktieren.',
    selection_revision_conflict: 'Eine andere Auswahl wurde übernommen. Die gewinnende Auswahl wird neu geladen.',
    preview_unavailable: 'Vorschau nicht verfügbar. Vorschau erneut laden oder Bauteil in Onshape prüfen.',
    invalid_arguments: 'Auswahlanfrage ungültig. Dialog schließen und erneut öffnen.',
    authorization_changed: 'Zugriff geändert. Verbindung prüfen und erneut anmelden.',
    live_reads_disabled: 'Live-Lesen deaktiviert. Operator muss den Lesezugriff prüfen.',
    not_configured: 'Keine Zuordnung eingerichtet. Operator kontaktieren.',
    provider_protocol_error:
      'Onshape-Antwort nicht lesbar. Katalog erneut laden; bei Wiederholung Operator kontaktieren.',
    goal_active_conflict: 'Schließe zuerst das aktuelle Ziel ab und kläre offene Änderungen. Stop allein genügt nicht.',
    mutation_reconciliation_required:
      'Unklaren Änderungs- oder Candidate-Ausgang zuerst abgleichen lassen. Danach Ziel abschließen.',
    goal_state_invalid: 'Arbeitsstatus nicht lesbar. Auswahl gesperrt; Operator muss den Zustand prüfen.',
    candidate_inspection_only: 'Candidate · nur Ansicht. Für neue Ziele den geschützten Primary auswählen.',
    revision_advanced: 'Stand neuer als Auswahl. Bauteil am aktuellen Stand erneut geprüft.',
    reconnect_required: 'Verbindung abgelaufen. Onshape erneut verbinden und Auswahl prüfen.',
    disconnected: 'Onshape nicht verbunden. Verbindung erneuern und Auswahl prüfen.',
    oauth_read_scope_missing: 'Leseberechtigung fehlt. Onshape-Verbindung durch Operator prüfen lassen.',
    plugin_unavailable: 'Auswahlstatus nicht verfügbar. Verbindung prüfen und Status aktualisieren.',
  })[code] ?? `Auswahl nicht verfügbar (${code ?? 'unbekannt'}). Status aktualisieren.`;

function createWorkContext({el, button, anchor, panel, root, call, canAdmin, render, alive, ref, showGoal, showCad}) {
  let view,
    statusError,
    statusLoading = false,
    statusRequest = 0;
  let dialog,
    draft,
    catalog,
    catalogLoading = false,
    catalogRequest = 0,
    previewRequest = 0;
  let preview,
    previewLoading = false,
    previewError,
    message,
    adopting = false,
    adoptRequest = 0,
    returnView;
  let filters = {document: '', workspace: '', part: ''};
  const matches = (g, connection) => alive(g) && connection === ref();
  const clearPreview = () => {
    previewRequest++;
    preview = undefined;
    previewLoading = false;
    previewError = undefined;
  };
  const close = (focus = true) => {
    catalogRequest++;
    adoptRequest++;
    clearPreview();
    draft = catalog = undefined;
    catalogLoading = adopting = false;
    if (dialog) {
      dialog.close();
      dialog.remove();
      dialog = undefined;
    }
    if (focus) {
      root.querySelector?.('[data-context-change]')?.focus();
    }
  };
  const reset = () => {
    close(false);
    statusRequest++;
    view = undefined;
    statusError = undefined;
    statusLoading = false;
  };
  const goodView = (value) =>
    value &&
    ['none', 'valid', 'invalid', 'unverified'].includes(value.validity) &&
    Number.isSafeInteger(value.selectionRevision) &&
    value.selectionRevision >= 0 &&
    typeof value.interlock?.blocked === 'boolean';
  const blocked = () => statusLoading || !view || statusError || view.interlock.blocked;
  const readStatus = async (g, connection) => {
    const request = ++statusRequest;
    statusLoading = true;
    view = undefined;
    clearPreview();
    render();
    draw();
    try {
      const result = await call('work-context-status', connection);
      if (!matches(g, connection) || request !== statusRequest) {
        return;
      }
      if (!result.ok || !goodView(result.workContext)) {
        throw new Error(result.code ?? 'provider_protocol_error');
      }
      view = result.workContext;
      statusError = undefined;
      if (
        view.validity !== 'valid' ||
        view.interlock.blocked ||
        (draft &&
          view.selection?.currentMicroversion &&
          draft.observedMicroversion !== view.selection.currentMicroversion)
      ) {
        draft = catalog = undefined;
        catalogRequest++;
        clearPreview();
      }
    } catch (error) {
      if (!matches(g, connection) || request !== statusRequest) {
        return;
      }
      view = undefined;
      statusError = error.message;
      draft = catalog = undefined;
      catalogRequest++;
      clearPreview();
    } finally {
      if (matches(g, connection) && request === statusRequest) {
        statusLoading = false;
        render();
        draw();
      }
    }
  };
  const loadPreview = async (g, connection) => {
    clearPreview();
    if (!draft) {
      draw();
      return;
    }
    const choice = draft,
      request = previewRequest;
    previewLoading = true;
    draw();
    try {
      const result = await call('work-context-preview', connection, {
        elementId: choice.elementId,
        partId: choice.partId,
        observedMicroversion: choice.observedMicroversion,
      });
      if (!matches(g, connection) || !dialog || request !== previewRequest || draft !== choice) {
        return;
      }
      if (!result.ok) {
        previewError = result.code ?? 'preview_unavailable';
        if (previewError !== 'preview_unavailable') {
          const code = previewError;
          message = workContextReason(code);
          draft = catalog = undefined;
          await readStatus(g, connection);
          if (code === 'selection_observation_stale' && matches(g, connection) && dialog && !blocked()) {
            await loadCatalog(g, connection);
          }
          return;
        }
      } else if (
        result.preview?.partId === choice.partId &&
        result.preview.observedMicroversion === choice.observedMicroversion &&
        result.preview.mimeType === 'image/png' &&
        typeof result.preview.dataBase64 === 'string' &&
        result.preview.dataBase64.length <= 1000000 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(result.preview.dataBase64)
      ) {
        preview = result.preview;
      } else {
        previewError = 'preview_unavailable';
      }
    } catch {
      if (matches(g, connection) && request === previewRequest) {
        previewError = 'preview_unavailable';
      }
    } finally {
      if (matches(g, connection) && request === previewRequest) {
        previewLoading = false;
        draw();
      }
    }
  };
  const loadCatalog = async (g, connection, retry = 0) => {
    const request = ++catalogRequest;
    clearPreview();
    draft = catalog = undefined;
    catalogLoading = true;
    draw();
    try {
      const result = await call('work-context-catalog', connection);
      if (!matches(g, connection) || !dialog || request !== catalogRequest) {
        return;
      }
      if (!result.ok) {
        if (result.code === 'selection_observation_stale' && retry === 0) {
          message = workContextReason(result.code);
          await loadCatalog(g, connection, 1);
          return;
        }
        throw new Error(result.code ?? 'provider_protocol_error');
      }
      const next = result.catalog;
      if (
        !next?.document?.preselected ||
        !validId(next.document.documentId) ||
        !validId(next.observedMicroversion) ||
        !Array.isArray(next.workspaces) ||
        !Array.isArray(next.partStudios) ||
        !Number.isSafeInteger(next.selectionRevision)
      ) {
        throw new Error('provider_protocol_error');
      }
      // A later status observation invalidates an older catalog even if its request is the newest.
      const current = view?.selection?.currentMicroversion;
      if (current && current !== next.observedMicroversion) {
        throw new Error('selection_observation_stale');
      }
      catalog = next;
      const previous = view?.validity === 'valid' ? view.selection : undefined;
      const workspace = next.workspaces.find((w) => w.workspaceId === previous?.workspaceId && w.selectable);
      const studio = next.partStudios.find((s) => s.elementId === previous?.elementId && s.goalEligible);
      const part = studio?.parts?.find((p) => p.partId === previous?.partId && p.selectable);
      if (previous && workspace && studio && part) {
        draft = {
          documentId: next.document.documentId,
          workspaceId: workspace.workspaceId,
          elementId: studio.elementId,
          partId: part.partId,
          observedMicroversion: next.observedMicroversion,
        };
      }
      catalogLoading = false;
      draw();
      if (draft) {
        await loadPreview(g, connection);
      }
    } catch (error) {
      if (matches(g, connection) && dialog && request === catalogRequest) {
        message = workContextReason(error.message);
      }
    } finally {
      if (matches(g, connection) && request === catalogRequest) {
        catalogLoading = false;
        draw();
      }
    }
  };
  const adopt = async (g, connection) => {
    if (!draft || !catalog || blocked() || !canAdmin() || adopting || catalogLoading || previewLoading) {
      return;
    }
    const request = ++adoptRequest,
      choice = draft;
    adopting = true;
    message = 'Auswahl wird geprüft …';
    draw();
    try {
      const result = await call('work-context-adopt', connection, {
        expectedSelectionRevision: catalog.selectionRevision,
        ...choice,
      });
      if (!matches(g, connection) || !dialog || request !== adoptRequest) {
        return;
      }
      if (result.ok && goodView(result.workContext)) {
        view = result.workContext;
        statusError = undefined;
        close(false);
        render();
        root.querySelector?.('[data-context-change]')?.focus();
        return;
      }
      const code = result.code ?? 'provider_protocol_error';
      message = workContextReason(code);
      clearPreview();
      draft = undefined;
      if (code === 'selection_revision_conflict') {
        await readStatus(g, connection);
        if (matches(g, connection) && dialog && request === adoptRequest) {
          close(false);
          render();
          const note = root.querySelector?.('[data-context-notice]');
          if (note) {
            note.textContent = `${workContextReason(code)} Gewinner geladen.`;
          }
          root.querySelector?.('[data-context-change]')?.focus();
        }
      } else if (code === 'selection_observation_stale') {
        await readStatus(g, connection);
        if (matches(g, connection) && dialog && request === adoptRequest) {
          await loadCatalog(g, connection);
        }
      } else {
        // Re-read the authoritative validity/interlock after every rejected adoption; never retry the write.
        await readStatus(g, connection);
      }
    } catch {
      if (matches(g, connection) && request === adoptRequest) {
        message = 'Ausgang der Übernahme unklar. Status aktualisieren; nicht erneut übernehmen.';
        draft = catalog = undefined;
        clearPreview();
        await readStatus(g, connection);
      }
    } finally {
      if (matches(g, connection) && request === adoptRequest) {
        adopting = false;
        render();
        draw();
      }
    }
  };
  const draw = () => {
    if (!dialog) {
      return;
    }
    const focused = document.activeElement;
    const field = focused?.getAttribute?.('data-search');
    const focusText = focused?.tagName === 'BUTTON' ? focused.textContent : undefined;
    const selectionStart = focused?.selectionStart;
    dialog.replaceChildren();
    const heading = el('h2', 'Arbeitskontext auswählen');
    heading.id = 'coc-selection-title';
    const dismiss = button('Schließen', () => close());
    dismiss.disabled = adopting;
    dialog.append(
      heading,
      dismiss,
      el('p', 'Eine Auswahl pro Zuordnung · Übernehmen startet keine CAD-Arbeit.', 'muted'),
    );
    if (message) {
      const note = el('p', message, 'notice');
      note.setAttribute('role', 'status');
      dialog.append(note);
    }
    if (blocked()) {
      dialog.append(
        el(
          'p',
          statusLoading ? 'Auswahlstatus wird geprüft …' : workContextReason(statusError ?? view?.interlock.code),
          'notice',
        ),
      );
    }
    const reload = button('Katalog aktualisieren', async () => {
      message = undefined;
      await readStatus(returnView.g, returnView.connection);
      if (dialog && !blocked()) {
        await loadCatalog(returnView.g, returnView.connection);
      }
    });
    reload.disabled = adopting || statusLoading;
    dialog.append(reload);
    if (catalogLoading) {
      dialog.append(el('p', 'Katalog wird geladen …'));
    }
    if (catalog) {
      const columns = el('div', undefined, 'selection-columns');
      const column = (title, key) => {
        const node = el('section');
        node.append(el('h3', title));
        const label = el('label', `${title} durchsuchen`),
          input = el('input');
        input.type = 'search';
        input.value = filters[key];
        input.setAttribute('data-search', key);
        input.setAttribute('aria-label', `${title} durchsuchen`);
        input.oninput = () => {
          filters[key] = input.value;
          draw();
        };
        label.append(input);
        node.append(label);
        columns.append(node);
        return node;
      };
      const contains = (text, key) => text.toLocaleLowerCase('de').includes(filters[key].toLocaleLowerCase('de'));
      const documents = column('Dokument', 'document');
      if (contains(catalog.document.name, 'document')) {
        const item = button(`${catalog.document.name} · vorausgewählt`, () => {
          // The sole bound document is already selected; no parent switch exists in increment 1.
        });
        item.setAttribute('aria-pressed', 'true');
        documents.append(item);
      } else {
        documents.append(el('p', 'Keine Suchtreffer im zugeordneten Dokument. Suche anpassen.'));
      }
      const workspaces = column('Onshape-Workspace', 'workspace');
      let workspaceCount = 0;
      for (const workspace of catalog.workspaces) {
        if (!contains(workspace.name, 'workspace')) {
          continue;
        }
        workspaceCount++;
        const item = button(
          `${workspace.name} · ${workspace.role === 'primary' ? 'geschützter Primary' : 'Candidate'}`,
          () => {
            if (!workspace.selectable || adopting) {
              return;
            }
            draft = undefined;
            clearPreview();
            draw();
          },
        );
        item.disabled = !workspace.selectable || adopting;
        item.setAttribute(
          'aria-pressed',
          String(workspace.selectable && (!draft || draft.workspaceId === workspace.workspaceId)),
        );
        workspaces.append(item);
        if (workspace.reason) {
          workspaces.append(el('p', workContextReason(workspace.reason), 'muted'));
        }
      }
      if (!workspaceCount) {
        workspaces.append(el('p', 'Keine Suchtreffer. Workspace-Suche anpassen.'));
      }
      const parts = column('Bauteil', 'part');
      let count = 0;
      for (const studio of catalog.partStudios) {
        const group = el('section', undefined, 'selection-studio');
        group.append(el('h3', `Part Studio: ${studio.name}`));
        if (studio.reason) {
          group.append(el('p', workContextReason(studio.reason), 'muted'));
        }
        if (studio.parts === null) {
          group.append(el('p', 'Bauteile nicht geladen.'));
        } else if (studio.parts?.length === 0) {
          group.append(el('p', 'Keine Bauteile in diesem Part Studio.'));
        }
        for (const part of studio.parts ?? []) {
          if (!contains(`${studio.name} ${part.name} ${part.partId}`, 'part')) {
            continue;
          }
          count++;
          const item = button(`${part.name} · ${part.partId}${part.hidden ? ' · ausgeblendet in Onshape' : ''}`, () => {
            const workspace = catalog.workspaces.find((w) => w.selectable && w.role === 'primary');
            if (!part.selectable || !studio.goalEligible || !workspace || adopting) {
              return;
            }
            draft = {
              documentId: catalog.document.documentId,
              workspaceId: workspace.workspaceId,
              elementId: studio.elementId,
              partId: part.partId,
              observedMicroversion: catalog.observedMicroversion,
            };
            message = undefined;
            void loadPreview(returnView.g, returnView.connection);
          });
          item.replaceChildren(
            el('span', part.name),
            el('span', ` · ${part.partId}${part.hidden ? ' · ausgeblendet in Onshape' : ''}`, 'revision'),
          );
          item.disabled = !part.selectable || !studio.goalEligible || adopting || !!blocked();
          item.setAttribute(
            'aria-pressed',
            String(draft?.elementId === studio.elementId && draft?.partId === part.partId),
          );
          group.append(item);
          if (part.reason) {
            group.append(el('p', workContextReason(part.reason), 'muted'));
          }
        }
        if (studio.truncated) {
          group.append(el('p', 'Liste gekürzt · höchstens 500 Bauteile. Auswahl bei Bedarf in Onshape prüfen.'));
        }
        parts.append(group);
      }
      if (!count && filters.part) {
        parts.append(el('p', 'Keine Suchtreffer. Bauteilsuche anpassen.'));
      }
      dialog.append(
        columns,
        el('p', `Katalogstand ${catalog.observedMicroversion} · ${date(catalog.observedAt)}`, 'revision'),
      );
    }
    const summary = el('section', undefined, 'selection-summary');
    summary.setAttribute('aria-label', 'Vorläufige Auswahl');
    if (draft) {
      const studio = catalog.partStudios.find((s) => s.elementId === draft.elementId);
      const part = studio?.parts?.find((p) => p.partId === draft.partId);
      summary.append(
        el('h3', `${part?.name} · ${draft.partId}`),
        el('p', `${catalog.document.name} / Primary / ${studio?.name}`),
      );
      if (preview) {
        const image = el('img');
        image.src = `data:image/png;base64,${preview.dataBase64}`;
        image.alt = `Vorschau nur für ${part?.name} · ${draft.partId}`;
        const shown = preview;
        image.onerror = () => {
          if (preview === shown) {
            clearPreview();
            previewError = 'preview_unavailable';
            draw();
          }
        };
        summary.append(image);
      } else {
        summary.append(
          el(
            'p',
            previewLoading
              ? 'Bauteilvorschau wird geladen …'
              : workContextReason(previewError ?? 'preview_unavailable'),
          ),
        );
      }
      if (!previewLoading) {
        summary.append(button('Vorschau erneut laden', () => loadPreview(returnView.g, returnView.connection)));
      }
      const url = cadLink(draft);
      if (url) {
        summary.append(anchor('Arbeitskontext in Onshape öffnen ↗', url));
      }
    } else {
      summary.append(el('p', 'Wähle genau ein Bauteil. Ohne vollständige Auswahl ist keine Übernahme möglich.'));
    }
    dialog.append(summary);
    const actions = el('div', undefined, 'controls');
    const accept = button('Auswahl übernehmen', () => adopt(returnView.g, returnView.connection));
    accept.disabled = !draft || !catalog || !!blocked() || !canAdmin() || adopting || previewLoading || catalogLoading;
    const cancel = button('Abbrechen', () => close());
    cancel.disabled = adopting;
    actions.append(cancel, accept);
    dialog.append(actions);
    if (!canAdmin()) {
      dialog.append(el('p', 'Übernehmen benötigt operator.admin. Lesender Zugriff erlaubt die Auswahlprüfung.'));
    }
    if (field) {
      const input = dialog.querySelector(`[data-search="${field}"]`);
      input?.focus();
      if (typeof selectionStart === 'number' && input) {
        input.setSelectionRange(selectionStart, selectionStart);
      }
    } else if (focusText) {
      const buttons = [...dialog.querySelectorAll('button:not([disabled])')];
      (buttons.find((node) => node.textContent === focusText) ?? buttons[0])?.focus();
    }
  };
  const open = (g, connection) => {
    if (!matches(g, connection) || blocked() || dialog) {
      return;
    }
    returnView = {g, connection};
    filters = {document: '', workspace: '', part: ''};
    message = undefined;
    dialog = el('dialog', undefined, 'selection-dialog');
    dialog.setAttribute('aria-labelledby', 'coc-selection-title');
    dialog.oncancel = (event) => {
      event.preventDefault();
      if (!adopting) {
        close();
      }
    };
    const opened = dialog;
    dialog.onclose = () => {
      if (dialog === opened && !opened.open) {
        close();
      }
    };
    dialog.onkeydown = (event) => {
      if (event.key !== 'Tab') {
        return;
      }
      const controls = [...opened.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')].filter(
        (node) => node.getClientRects().length,
      );
      const first = controls[0],
        last = controls.at(-1);
      if (
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    root.append(dialog);
    draw();
    dialog.showModal();
    void (async () => {
      await readStatus(g, connection);
      if (dialog === opened && !blocked()) {
        await loadCatalog(g, connection);
      }
    })();
  };
  const card = (g) => {
    const node = panel('Arbeitskontext');
    node.setAttribute('data-work-context', '');
    const notice = el('p', '', 'muted');
    notice.setAttribute('data-context-notice', '');
    notice.setAttribute('role', 'status');
    node.append(notice);
    if (statusLoading) {
      node.append(el('p', 'Auswahlstatus wird geprüft …'));
    } else if (statusError || !view) {
      node.append(el('p', workContextReason(statusError), 'notice'));
    } else {
      const s = view.selection;
      node.append(
        el(
          'p',
          {
            none: 'Wähle ein Bauteil für deine CAD-Aufgabe.',
            valid: 'Bestätigte Bauteilauswahl',
            invalid: 'Auswahl ungültig · nicht für Ziele verwendbar',
            unverified: 'Auswahl ungeprüft · nicht für Ziele verwendbar',
          }[view.validity],
          'badge',
        ),
      );
      if (s) {
        node.append(
          el('h3', s.partName ?? 'Bauteilname nicht verfügbar'),
          el(
            'p',
            `Dokument: ${s.documentName ?? 'Name nicht verfügbar'} · Workspace: ${s.workspaceName ?? 'Name nicht verfügbar'} · Part Studio: ${s.partStudioName ?? 'Name nicht verfügbar'}`,
          ),
          el(
            'p',
            `Part ${s.partId} · Auswahlrevision ${view.selectionRevision} · ausgewählt bei ${s.observedMicroversion} · aktuell ${s.currentMicroversion ?? 'ungeprüft'}`,
            'revision',
          ),
        );
        const url = cadLink(s);
        if (url && url === s.onshapeUrl) {
          node.append(anchor('Auswahl in Onshape öffnen ↗', url));
        }
      }
      node.append(el('p', `Geprüft: ${date(view.observedAt)}`, 'muted'));
      if (view.reason) {
        node.append(el('p', workContextReason(view.reason), 'notice'));
      }
      if (view.interlock.blocked) {
        node.append(el('p', workContextReason(view.interlock.code), 'notice'), button('Zum Zielbereich', showGoal));
      }
    }
    const change = button('Auswahl ändern', () => open(g, ref()));
    change.setAttribute('data-context-change', '');
    change.disabled = !!blocked();
    node.append(change, button('Weiter zu CAD', showCad));
    return node;
  };
  return {card, readStatus, reset};
}

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
        const workContext = createWorkContext({
          el,
          button,
          anchor,
          panel,
          root,
          call,
          canAdmin,
          render: () => render(),
          alive: active,
          ref: () => select.value,
          showGoal: () => {
            selectedView = 'cad';
            render();
            const goal = root.querySelector?.('#coc-goal');
            goal?.setAttribute('tabindex', '-1');
            goal?.focus();
          },
          showCad: () => {
            selectedView = 'cad';
            render();
            content.querySelector?.('h1')?.focus();
          },
        });
        // Goal status has its own request fence. Legacy payloads never supply goal evidence.
        let goalSnapshot,
          goalLoading = false,
          goalError,
          goalActionMessage,
          goalRequest = 0,
          goalPending,
          closeReview,
          payloadHistoryOpen = false,
          goalHistoryOpen = false;
        const sameGoalContext = (g, ref, request) => active(g) && ref === select.value && request === goalRequest;
        const goalTargetMatches = (goal) =>
          snapshot &&
          ['documentId', 'elementId', 'primaryWorkspaceId'].every(
            (key) => validId(goal?.target?.[key]) && goal.target[key] === snapshot.target?.[key],
          );
        const invalidateGoal = () => {
          goalRequest++;
          goalSnapshot = undefined;
          goalLoading = false;
          goalError = undefined;
          goalActionMessage = undefined;
          closeReview = undefined;
        };
        const readGoals = async (g, ref) => {
          const request = ++goalRequest;
          goalLoading = true;
          closeReview = undefined;
          render();
          try {
            const result = await call('goal-status', ref);
            if (!sameGoalContext(g, ref, request)) {
              return;
            }
            if (
              result.ok !== true ||
              !Array.isArray(result.history) ||
              !(result.goal === null || result.goal?.goalId)
            ) {
              goalSnapshot = undefined;
              goalError = {
                message: result.message ?? 'Zielstatus nicht verfügbar. Bitte aktualisieren.',
                code: result.code ?? 'goal_status_invalid',
              };
            } else {
              goalSnapshot = result;
              goalError = undefined;
            }
          } catch {
            if (sameGoalContext(g, ref, request)) {
              goalSnapshot = undefined;
              goalError = {
                message: 'Zielstatus nicht verfügbar. Verbindung prüfen und aktualisieren.',
                code: 'plugin_unavailable',
              };
            }
          } finally {
            if (sameGoalContext(g, ref, request)) {
              goalLoading = false;
              render();
            }
          }
        };
        const goalAllowed = (action, goal) => {
          if (
            !canAdmin() ||
            goalPending ||
            goalLoading ||
            goalError ||
            goal !== goalSnapshot?.goal ||
            !goalTargetMatches(goal)
          ) {
            return false;
          }
          if (action === 'goal-confirm') {
            return (
              goal.state === 'AWAITING_CONFIRMATION' &&
              goal.capability === 'AVAILABLE' &&
              /^[a-f0-9]{32}$/.test(goal.confirmation?.nonce ?? '') &&
              reviewComplete(goal) &&
              goal.confirmation.expiresAt > Date.now()
            );
          }
          if (action === 'goal-stop') {
            return ['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING', 'BLOCKED'].includes(goal.state);
          }
          return (
            action === 'goal-close' &&
            ['STOPPED', 'EXPIRED', 'BLOCKED'].includes(goal.state) &&
            goal.capability === 'AVAILABLE' &&
            journalKnown(goal.progress) &&
            goal.progress.unreconciledSequence === null
          );
        };
        const runGoal = async (action, goal, g, ref) => {
          if (!active(g) || ref !== select.value || !goalAllowed(action, goal)) {
            return;
          }
          if (action === 'goal-close' && closeReview !== goal) {
            return;
          }
          const pending = {};
          goalPending = pending;
          const request = ++goalRequest;
          closeReview = undefined;
          goalActionMessage = 'Aktion läuft …';
          render();
          try {
            const result = await call(action, ref, {
              goalId: goal.goalId,
              ...(action === 'goal-confirm' ? {nonce: goal.confirmation.nonce, expectedGoalHash: goal.goalHash} : {}),
            });
            if (!sameGoalContext(g, ref, request)) {
              return;
            }
            if (result.ok !== true) {
              goalError = {
                message: result.message ?? 'Zielaktion fehlgeschlagen. Status prüfen.',
                code: result.code ?? 'goal_action_failed',
              };
              goalActionMessage = undefined;
            } else {
              goalError = undefined;
              goalActionMessage = 'Aktion bestätigt.';
            }
            // One explicit attempt; the follow-up is read-only, including after a rejection.
          } catch {
            if (sameGoalContext(g, ref, request)) {
              goalError = {
                message: 'Ausgang der Zielaktion unklar. Status prüfen; nicht erneut ausführen.',
                code: 'plugin_unavailable',
              };
              goalActionMessage = undefined;
            }
          } finally {
            if (sameGoalContext(g, ref, request)) {
              const actionError = goalError;
              await Promise.all([readGoals(g, ref), workContext.readStatus(g, ref)]);
              if (active(g) && ref === select.value && actionError) {
                goalError = actionError;
              }
            }
            if (goalPending === pending) {
              goalPending = undefined;
            }
            if (!disposed && !context.signal.aborted) {
              render();
            }
          }
        };
        const renderGoalDetails = (node, goal) => {
          const verification = goal.progress?.lastVerification;
          const list = (title, entries) => {
            node.append(el('h3', title));
            const ul = el('ul');
            for (const entry of entries) {
              ul.append(el('li', entry));
            }
            node.append(ul);
          };
          if (goal.result?.summary) {
            node.append(el('p', goal.result.summary));
          }
          if (verification) {
            node.append(
              el(
                'p',
                `Prüfung: ${verification.passed === true ? 'bestanden' : 'nicht bestanden / unvollständig'} · ${date(verification.verifiedAt)}`,
              ),
            );
            list(
              'Prüfergebnisse',
              (verification.checks ?? []).map(
                (check) =>
                  `${check.conditionId}: ${{pass: 'bestanden', fail: 'nicht bestanden', unverifiable: 'nicht prüfbar'}[check.result] ?? 'unbekannt'}${check.observed === undefined ? '' : ` · ${JSON.stringify(check.observed)}`}`,
              ),
            );
          } else {
            node.append(el('p', 'Kein erfolgreicher Zielprüfnachweis verfügbar.'));
          }
          const limits = [
            ...new Set([
              ...(goal.goalConditions ?? []).filter((c) => c.kind === 'note').map((c) => c.text),
              ...(goal.preservationConditions ?? []).filter((c) => c.kind === 'note').map((c) => c.text),
              ...(verification?.openLimits ?? []),
              ...(goal.result?.openLimits ?? []),
            ]),
          ];
          list('Offene Prüfgrenzen', limits.length ? limits : ['Keine zusätzlichen Prüfgrenzen gemeldet.']);
          const url = goalRevisionLink(goal);
          if (url) {
            node.append(anchor('Geprüften Candidate-Stand in Onshape öffnen ↗', url));
          } else if (goal.result?.revisionUrl) {
            node.append(el('p', 'Revisionslink nicht eindeutig dem Ziel zugeordnet.'));
          }
        };
        const renderGoalPanel = () => {
          const node = panel('Feature-Ziel & Iteration');
          node.id = 'coc-goal';
          if (goalLoading) {
            node.append(el('p', 'Zielstatus wird geladen …', 'muted'));
          }
          if (goalError) {
            node.append(el('p', goalError.message, 'notice'));
            const details = el('details');
            details.append(el('summary', 'Technische Zieldiagnose'), el('pre', goalError.code));
            node.append(details);
          }
          if (goalActionMessage) {
            const message = el('p', goalActionMessage);
            message.setAttribute('role', 'status');
            node.append(message);
          }
          const goal = goalSnapshot?.goal;
          if (!goal) {
            node.append(el('p', 'Kein aktuelles Ziel. Änderungswunsch mit dem Robotics Lead klären.'));
          } else {
            node.append(el('p', goalLabel(goal), 'badge'), el('h3', goal.goalText));
            if (goal.capability !== 'AVAILABLE') {
              node.append(
                el(
                  'p',
                  'Zieliteration blockiert · Fähigkeit nicht verfügbar oder unbekannt. Operator kontaktieren.',
                  'notice',
                ),
              );
            }
            if (!goalTargetMatches(goal)) {
              node.append(
                el('p', 'Zielzuordnung nicht bestätigt. Verbindung und Arbeitsbereich aktualisieren.', 'notice'),
              );
            }
            node.append(el('p', `Verbindung: ${select.value} · Ziel ${goal.goalId}`, 'revision'));
            const review = goal.state === 'AWAITING_CONFIRMATION' ? el('div') : el('details');
            if (goal.state !== 'AWAITING_CONFIRMATION') {
              review.append(el('summary', 'Bestätigter Zielrahmen'));
            }
            review.className = 'coc-goal-review';
            for (const [heading, conditions] of [
              ['Zielbedingungen', goal.goalConditions],
              ['Erhaltungsbedingungen', goal.preservationConditions],
            ]) {
              review.append(el('h3', heading));
              for (const condition of conditions ?? []) {
                review.append(el('p', `${condition.kind === 'note' ? 'Offene Prüfgrenze: ' : ''}${condition.text}`));
                const fields = [
                  ['id', 'Bedingung'],
                  ['kind', 'Prüfart'],
                  ['featureId', 'Feature'],
                  ['parameterId', 'Parameter'],
                  ['expression', 'Sollwert'],
                  ['state', 'Sollstatus'],
                ];
                review.append(
                  el(
                    'p',
                    fields
                      .filter(([key]) => condition[key] !== undefined)
                      .map(([key, label]) => `${label}: ${condition[key]}`)
                      .join(' · '),
                    'revision',
                  ),
                );
              }
            }
            const t = goal.target ?? {};
            if (t.focus) {
              review.append(
                el('h3', `Bauteil-Fokus: ${t.focus.partName}`),
                el(
                  'p',
                  `Part Studio: ${t.focus.elementId} · Part ${t.focus.partId} · Auswahlrevision ${t.focus.selectionRevision}`,
                  'revision',
                ),
                el(
                  'p',
                  'Der Fokus beschreibt die Absicht. Ziel- und Erhaltungsbedingungen bleiben featurebasiert; eine erfolgreiche Prüfung belegt nicht, dass nur dieses Bauteil geändert wurde.',
                  'notice',
                ),
              );
            }
            const dl = el('dl', undefined, 'goal-context');
            for (const [label, value] of [
              ['Dokument', t.documentId],
              ['Element', t.elementId],
              ['Geschützter Primary', t.primaryWorkspaceId],
              ['Ausgangsrevision', t.baseMicroversion],
              [
                'Candidate-Plan',
                t.candidateWorkspaceId === null
                  ? `Neuer Candidate aus Primary bei ${t.baseMicroversion}`
                  : t.candidateWorkspaceId,
              ],
              ['Zulässige Features', goal.scope?.featureIds?.join(', ')],
              ['Zulässige Operationen', goal.scope?.operations?.join(', ')],
              ['Maximale Schritte', goal.scope?.maxDispatches],
              [
                'Laufzeit',
                Number.isFinite(goal.scope?.lifetimeMs) ? `${goal.scope.lifetimeMs / 60000} Minuten` : undefined,
              ],
              ['Bestätigung gültig bis', date(goal.confirmation?.expiresAt)],
              ['Zielkennung (Hash)', goal.goalHash],
            ]) {
              dl.append(el('dt', label), el('dd', value == null ? 'unbekannt' : String(value)));
            }
            review.append(dl);
            node.append(review);
            const progress = goal.progress;
            node.append(
              el(
                'p',
                `Schritte: ${knownCount(progress?.dispatches)} · verbleibend: ${knownCount(progress?.remaining)}`,
                'goal-progress',
              ),
            );
            node.append(
              el(
                'p',
                `Letzter Ausgang: ${progress?.lastOutcome ?? 'unbekannt'} · Status vom ${date(goal.observedAt)}`,
                'muted',
              ),
            );
            if (goal.grant) {
              node.append(
                el(
                  'p',
                  `Freigabe gültig bis ${date(goal.grant.expiresAt)} · verbleibende Zeit bei Anzeige: ${Math.max(0, Math.ceil((goal.grant.expiresAt - Date.now()) / 60000))} Minuten`,
                ),
              );
            }
            if (!journalKnown(progress)) {
              node.append(el('p', 'Journalstatus unbekannt · Abschluss gesperrt. Status aktualisieren.', 'muted'));
            }
            if (Number.isSafeInteger(progress?.unreconciledSequence) && progress.unreconciledSequence > 0) {
              node.append(el('p', `Ausgang von Schritt ${progress.unreconciledSequence} abgleichen.`, 'notice'));
              const reconcile = button('Ausgang abgleichen', () => {
                // GoalView has no complete reconciliation tuple; this disabled control performs no action.
              });
              reconcile.disabled = true;
              node.append(
                reconcile,
                el(
                  'p',
                  'Der Engineer gleicht mit den vollständigen Server-Fehlerdaten ab. Diese Ansicht enthält nur die Schrittnummer, nicht alle erforderlichen Angaben. Keine Wiederholung auslösen.',
                ),
              );
            }
            const g = generation,
              ref = select.value;
            const actions = el('div', undefined, 'controls');
            if (goal.state === 'AWAITING_CONFIRMATION') {
              node.append(
                el('p', 'Du erlaubst notwendige Iterationen innerhalb dieses Zielrahmens. Primary bleibt geschützt.'),
              );
              const confirm = button('Ziel bestätigen & Iteration erlauben', () =>
                runGoal('goal-confirm', goal, g, ref),
              );
              confirm.disabled = !goalAllowed('goal-confirm', goal);
              actions.append(confirm);
              if (!reviewComplete(goal)) {
                node.append(el('p', 'Zielrahmen unvollständig · Bestätigung gesperrt.'));
              }
            }
            if (['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING', 'BLOCKED'].includes(goal.state)) {
              const stop = button('Iteration stoppen', () => runGoal('goal-stop', goal, g, ref));
              stop.disabled = !goalAllowed('goal-stop', goal);
              actions.append(stop);
            }
            if (['STOPPED', 'EXPIRED', 'BLOCKED'].includes(goal.state)) {
              const close = button('Ziel abschließen …', () => {
                if (active(g) && ref === select.value && goalAllowed('goal-close', goal)) {
                  closeReview = goal;
                  render();
                }
              });
              close.disabled = !goalAllowed('goal-close', goal);
              actions.append(close);
              node.append(el('p', 'Fortsetzen nach Stop oder Ablauf benötigt eine neue Bestätigung über den Lead.'));
            }
            node.append(actions);
            if (closeReview === goal) {
              const confirmation = el('section', undefined, 'notice');
              confirmation.setAttribute('aria-label', 'Zielabschluss bestätigen');
              confirmation.append(
                el(
                  'p',
                  'Ziel abschließen? Ausgeführte Änderungen und der Candidate bleiben erhalten. Danach kann ein neues Ziel beginnen.',
                ),
              );
              const yes = button('Ziel abschließen', () => runGoal('goal-close', goal, g, ref));
              yes.disabled = !goalAllowed('goal-close', goal);
              confirmation.append(
                yes,
                button('Abbrechen', () => {
                  closeReview = undefined;
                  render();
                }),
              );
              node.append(confirmation);
            }
            if (!canAdmin()) {
              node.append(
                el('p', 'Administratorrecht fehlt oder ist unbekannt. Zielaktionen bleiben gesperrt.', 'muted'),
              );
            }
            renderGoalDetails(node, goal);
          }
          const history = el('details');
          history.id = 'coc-goal-history';
          history.open = goalHistoryOpen;
          history.ontoggle = () => {
            if (history.isConnected !== false) {
              goalHistoryOpen = history.open;
            }
          };
          history.append(el('summary', 'Abgeschlossene Ziele & Nachweise'));
          for (const item of (goalSnapshot?.history ?? [])
            .filter((h) => ['COMPLETED', 'FAILED', 'CLOSED'].includes(h.state))
            .slice(-10)) {
            const entry = el('section', undefined, 'panel');
            entry.append(el('h3', item.goalText), el('p', goalLabel(item)), el('p', `Ziel ${item.goalId}`, 'revision'));
            renderGoalDetails(entry, item);
            history.append(entry);
          }
          node.append(history, el('p', 'Payload-Vorschläge sind keine Zielautorisierung.', 'muted'));
          return node;
        };

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
          content.append(el('p', 'Workspace', 'eyebrow'), title('Dein Engineering-Workspace'));
          const contextPanel = workContext.card(generation);
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
          content.append(workContext.card(generation));
          const choices = candidateChoices(snapshot),
            t = snapshot?.target;
          if (!choices.length) {
            content.append(renderGoalPanel());
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
          work.append(renderGoalPanel());
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
          history.open = payloadHistoryOpen;
          history.ontoggle = () => {
            if (history.isConnected !== false) {
              payloadHistoryOpen = history.open;
            }
          };
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
              payloadHistoryOpen = true;
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
            el('p', 'Zielstatus und Freigaben oben prüfen. Payload-Belege sind separate Nachweise.'),
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
          workContext.reset();
          invalidateGoal();
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
            await Promise.all([
              status.code === 'connected' || status.code === 'ready'
                ? loadWorkspaceContext(g, data.target, select.value)
                : Promise.resolve(),
              readGoals(g, select.value),
              workContext.readStatus(g, select.value),
            ]);
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
          workContext.reset();
          invalidateGoal();
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
            workContext.reset();
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
