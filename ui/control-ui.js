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
 .coc .coc-selection-dialog{color:#e3ebf4;background:#101e29;border:1px solid #3a5565;border-radius:16px;width:calc(100vw - 48px);max-width:1360px;height:calc(100dvh - 48px);max-height:1000px;padding:0;overflow:hidden}.coc .coc-selection-dialog[open]{display:flex;flex-direction:column}.coc .coc-selection-dialog::backdrop{background:#050d15db}.coc .coc-selector-head{padding:22px 30px 12px}.coc .coc-selector-head h2{font-size:28px}.coc .coc-selector-head p{color:#acc0ce;margin:0}.coc .coc-selector-body{padding:8px 24px 18px;overflow:auto;min-height:0;flex:1}.coc .coc-selector-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px}.coc .coc-selector-context{background:#0b1923;border:1px solid #294351;border-radius:12px;padding:18px}.coc .coc-selector-document-results{max-height:225px;overflow:auto;padding:0 3px}.coc .coc-selector-workspaces{margin-top:24px}.coc .coc-selector-context button{display:block;text-align:left;width:100%;margin:8px 0;padding:12px;overflow-wrap:anywhere}.coc .coc-selector-context button[aria-pressed=true]{background:#183e45;border-color:#65d8d0}.coc .coc-choice-state{display:block;font-size:12px;color:#a9c0cd;margin-top:5px}.coc .coc-selector-part-area{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;align-items:start}.coc .coc-selector-part-list{min-width:0}.coc .coc-selector-studio{margin:18px 0}.coc .coc-selector-studio-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.coc .coc-selector-studio-head h3{font-size:12px;color:#a9c0cd;margin:0;min-width:0}.coc .coc-selector-studio-head button{padding:4px 0;background:none;border:0;color:#68dbd5;white-space:nowrap;min-height:44px}.coc .coc-selector-part-card{border:1px solid #294351;border-radius:12px;padding:12px;margin:10px 0;background:#142632;overflow-wrap:anywhere}.coc .coc-selector-part-card[data-selected=true]{border-color:#68dbd5;background:#193e45}.coc .coc-selector-part-card>button:first-child{border:0;background:none;padding:0;text-align:left;width:100%;min-height:44px}.coc .coc-selector-part-card button[data-focus=adopt-part]{width:100%;background:#60d8ce;color:#082b31;font-weight:700;margin:12px 0 4px;min-height:44px}.coc .coc-selection-preview{background:#0b1923;border:1px solid #294351;border-radius:12px;padding:20px;overflow-wrap:anywhere;min-width:0}.coc .coc-selection-preview img{display:block;width:100%;height:auto;max-height:320px;object-fit:contain;margin:18px 0}.coc .coc-selection-preview>button{margin:8px 8px 8px 0}.coc .coc-selection-preview .coc-revision{font-size:11px;color:#a9c0cd}.coc .coc-selector-footer{display:flex;justify-content:space-between;gap:18px;align-items:center;border-top:1px solid #294351;padding:16px 24px;flex-shrink:0;background:#101e29}.coc .coc-selector-footer p{margin:0;font-size:12px}.coc .coc-selector-footer button{min-width:118px;min-height:44px}.coc .coc-selection-dialog input{display:block;width:100%;font:inherit;background:#0a1822;color:#e3ebf4;border:1px solid #3c5669;border-radius:8px;min-height:44px;padding:10px;margin:8px 0 14px}.coc .coc-selection-dialog label{display:block;font-size:12px;color:#b3c4d0}.coc .coc-selection-dialog p,.coc .coc-selection-dialog h3{overflow-wrap:anywhere}.coc .coc-selector-details{margin-top:16px;color:#a9c0cd}.coc .coc-selector-details button{margin:8px 0}.coc .coc-inspection{color:#e8c995;font-size:12px}.coc .coc-loading{color:#a9c0cd;padding:14px 0}.coc .coc-selector-context-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 10px;background:#142632;border:1px solid #294351;border-radius:12px;padding:12px;margin-bottom:16px;overflow-wrap:anywhere}.coc .coc-selector-context-summary p{margin:0;font-size:12px}.coc .coc-selector-context-summary button{background:none;border:0;color:#68dbd5;padding:8px;font-size:12px}@media(max-width:1000px) and (min-width:701px){.coc .coc-selector-layout{grid-template-columns:220px minmax(0,1fr);gap:16px}.coc .coc-selector-part-area{grid-template-columns:1fr}.coc .coc-selector-head{padding:18px}}@media(max-width:700px){.coc .coc-selection-dialog{width:calc(100vw - 16px);height:calc(100dvh - 16px);max-height:none;margin:8px;border-radius:12px}.coc .coc-selector-head{padding:16px 14px 8px}.coc .coc-selector-head h2{font-size:21px}.coc .coc-selector-head p{font-size:12px}.coc .coc-selector-body{padding:8px 14px 14px}.coc .coc-selector-layout,.coc .coc-selector-part-area{display:block}.coc .coc-selector-context{border:0;padding:0;background:none}.coc .coc-selector-workspaces{margin-top:0}.coc .coc-selector-footer{padding:10px 14px;align-items:end}.coc .coc-selector-footer p{font-size:10px;line-height:1.4}.coc .coc-selection-preview{background:none;border:0;padding:8px 0}.coc .coc-selection-preview img{max-height:140px;margin:6px 0}.coc .coc-selection-preview[data-preview-kind=part]>h3{display:none}.coc .coc-selection-preview>p{font-size:12px;margin-bottom:6px}.coc .coc-selection-preview>button{padding:6px 0;border:0;background:none;color:#68dbd5;font-size:12px}.coc .coc-selector-part-list>h3{font-size:18px}.coc .coc-selector-part-list>label:first-of-type{font-size:0}.coc .coc-selector-part-list>label:first-of-type input{font-size:14px}.coc .coc-selector-document-results{max-height:none}.coc .coc-selection-preview .coc-revision{display:none}.coc .coc-selection-preview[data-preview-kind=studio] .coc-revision{display:block}.coc .coc-selector-part-card{padding:12px}.coc .coc-selector-studio>button{min-height:44px}}


.coc{color:#e3ebf4;background:#0c141e;font:14px/1.55 system-ui,sans-serif;border:1px solid #28394a;border-radius:12px;overflow:hidden;min-width:0;color-scheme:dark}.coc *{box-sizing:border-box}.coc h1,.coc h2,.coc h3,.coc p{margin:0 0 12px}.coc h1,.coc .coc-candidate strong{overflow-wrap:anywhere}.coc h1{font-size:27px;line-height:1.25}.coc h2{font-size:17px}.coc h3{font-size:15px}.coc button,.coc select,.coc a.coc-action{font:inherit;border:1px solid #3c5669;border-radius:8px;padding:9px 13px;background:#203141;color:#e3ebf4;cursor:pointer;max-width:100%}.coc button:hover,.coc a.coc-action:hover{background:#294351}.coc button:disabled{opacity:.5;cursor:wait}.coc :focus-visible{outline:3px solid #69e5de;outline-offset:3px}.coc a{color:#68dbd5;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.coc .coc-muted{color:#a2b5c6}.coc .coc-eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a2b5c6}.coc .coc-top{padding:20px 26px;border-bottom:1px solid #28394a;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}.coc .coc-top strong{font-size:18px}.coc .coc-shell{display:grid;grid-template-columns:180px minmax(0,1fr)}.coc .coc-rail{padding:24px 16px;background:#0b131d;border-right:1px solid #28394a}.coc .coc-rail a{display:block;padding:10px 8px;margin-bottom:8px;text-decoration:none}.coc .coc-rail a:first-of-type{background:#19323d;border-radius:8px}.coc .coc-rail .coc-tools{border-top:1px solid #28394a;margin-top:25px;padding-top:24px}.coc .coc-rail p{font-size:12px}.coc .coc-main{padding:26px;min-width:0}.coc .coc-context p{overflow-wrap:anywhere}.coc .coc-context{display:flex;justify-content:space-between;align-items:start;gap:18px;margin-bottom:20px;flex-wrap:wrap}.coc .coc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:0 0 20px}.coc .coc-candidate{text-align:left;background:#141f2c;min-height:105px;display:flex;flex-direction:column;gap:6px}.coc .coc-candidate[aria-pressed=true]{border-color:#55d4d0;box-shadow:inset 0 0 0 1px #55d4d0;background:#18313b}.coc .coc-candidate strong{font-size:16px}.coc .coc-body{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;align-items:start}.coc .coc-panel{background:#141f2c;border:1px solid #28394a;border-radius:12px;padding:20px;min-width:0}.coc .coc-viewer{padding:0;overflow:hidden}.coc .coc-viewhead{padding:16px 20px;background:#192633;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}.coc .coc-modes{display:flex;gap:5px;flex-wrap:wrap}.coc .coc-modes button{padding:5px 10px;font-size:12px}.coc .coc-modes button[aria-pressed=true]{background:#2c4854;color:#68dbd5}.coc .coc-stage{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:radial-gradient(ellipse at center,#1a2d3a,#0f1b26);min-height:330px}.coc .coc-stage.coc-single{grid-template-columns:1fr}.coc figure{margin:0;padding:20px;min-width:0;display:flex;flex-direction:column;gap:14px}.coc figure+figure{border-left:1px dashed #385061}.coc .coc-empty-image{flex:1;min-height:200px;display:grid;place-content:center;text-align:center;padding:24px;color:#a2b5c6;background-image:linear-gradient(#8da9bd08 1px,transparent 1px),linear-gradient(90deg,#8da9bd08 1px,transparent 1px);background-size:28px 28px}.coc figcaption{font-size:12px;overflow-wrap:anywhere}.coc .coc-lower{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:18px}.coc .coc-steps{list-style:none;padding:0;margin:20px 0}.coc .coc-steps li{padding:0 0 18px 18px;border-left:2px solid #3d5668}.coc .coc-steps strong,.coc .coc-steps span{display:block}.coc .coc-steps span{font-size:12px;color:#a2b5c6}.coc .coc-next{border:1px solid #315956;background:#17312f;border-radius:8px;padding:14px;margin-top:18px}.coc .coc-notice{padding:12px 16px;border:1px solid #826c43;background:#2b281f;border-radius:8px;margin-bottom:18px;color:#f2d399}.coc dl{margin:0}.coc dt{font-size:12px;color:#a2b5c6;margin-top:12px}.coc dd{margin:3px 0;overflow-wrap:anywhere}.coc pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px}.coc details{margin-top:18px}.coc summary{cursor:pointer;font-weight:600;padding:8px 0}.coc .coc-controls{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.coc .coc-foot{font-size:12px;color:#a2b5c6;margin-top:16px}.coc .coc-badge{color:#68dbd5}.coc .coc-revision{font-family:monospace;font-size:12px;overflow-wrap:anywhere}.coc .coc-parameter{padding:10px 0;border-bottom:1px solid #28394a}.coc .coc-parameter strong{color:#68dbd5}.coc img{width:100%;height:auto;max-height:440px;object-fit:contain}.coc [hidden]{display:none!important}@media(max-width:1250px){.coc .coc-shell{grid-template-columns:1fr}.coc .coc-rail{display:none}.coc .coc-body{grid-template-columns:minmax(0,1fr) 280px}.coc .coc-main{padding:20px}.coc .coc-lower{grid-template-columns:1fr}}@media(max-width:850px){.coc .coc-body{grid-template-columns:1fr}.coc .coc-stage{grid-template-columns:1fr}.coc figure+figure{border-left:0;border-top:1px dashed #385061}.coc .coc-main{padding:14px}.coc h1{font-size:23px}}
.coc .coc-navigation{display:flex;flex-direction:column;gap:10px}.coc .coc-navigation button{text-align:left;border:0;background:transparent}.coc .coc-navigation button[aria-current=page]{background:#19343f;color:#68dbd5;border-left:3px solid #68dbd5}.coc .coc-tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:18px 0}.coc .coc-cad-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:18px}.coc .coc-cad-work{min-width:0}.coc .coc-branches .coc-cards{grid-template-columns:1fr}.coc .coc-cad-work>.coc-panel{margin-bottom:18px}.coc .coc-body{grid-template-columns:minmax(0,1fr) 245px}.coc .coc-lower{grid-template-columns:1fr}.coc h3{overflow-wrap:anywhere}.coc .coc-panel+.coc-panel{margin-top:18px}.coc button:disabled{cursor:not-allowed}.coc .coc-tool-grid>.coc-panel{margin-top:0}
@media(max-width:1250px){.coc .coc-rail{display:block;padding:10px;border-right:0;border-bottom:1px solid #28394a}.coc .coc-rail>.coc-eyebrow,.coc .coc-rail>.coc-tools{display:none}.coc .coc-navigation{flex-direction:row;flex-wrap:wrap}.coc .coc-cad-layout{grid-template-columns:200px minmax(0,1fr)}.coc .coc-body{grid-template-columns:1fr}}
@media(max-width:850px){.coc .coc-cad-layout,.coc .coc-tool-grid{grid-template-columns:1fr}.coc .coc-branches .coc-cards{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.coc .coc-top{padding:16px}.coc .coc-stage{min-height:260px}}

.coc .coc-goal-context{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,3fr);gap:4px 14px}.coc .coc-goal-context dt,.coc .coc-goal-context dd{margin:0}.coc .coc-goal-review{overflow-wrap:anywhere}.coc .coc-goal-progress{font-size:16px;color:#68dbd5;margin-top:16px}.coc #coc-goal ul{padding-left:20px;overflow-wrap:anywhere}@media(max-width:850px){.coc .coc-goal-context{grid-template-columns:1fr}}
`;
// Contract work-context-1.1.0-draft. Browsing is read-only; only explicit adoption persists a selection.
export const workContextReason = (code) =>
  ({
    document_not_provisioned: 'Anderes Dokument · nur ansehen; keine Zielzuordnung.',
    workspace_inspection_only: 'Anderer Workspace · nur ansehen; Ziele bleiben Primary-basiert.',
    document_not_accessible: 'Kein Zugriff auf dieses Dokument. Onshape-Zugriff prüfen oder anderes Dokument wählen.',
    provider_quota_exhausted: 'Onshape-API-Kontingent erschöpft. Betreiber kontaktieren.',
    provider_rate_limited: 'Zu viele Anfragen · später erneut versuchen. Keine automatische Wiederholung.',
    provider_forbidden: 'Dokumentsuche nicht erlaubt. Onshape-Berechtigung prüfen lassen.',
    provider_unavailable: 'Onshape vorübergehend nicht verfügbar. Später erneut laden.',
    provider_timeout: 'Onshape antwortet nicht rechtzeitig. Später erneut laden.',
    part_search_truncated: 'Weitere Treffer vorhanden – Studio auswählen und Suche eingrenzen.',
    selection_observation_stale: 'Stand hat sich geändert. Treffer aktualisieren und Auswahl erneut prüfen.',
    selection_part_missing: 'Bauteil nicht mehr vorhanden. Bitte erneut auswählen.',
    selection_part_unsupported: 'Bauteilart nicht unterstützt. Ein anderes Volumenbauteil auswählen.',
    part_kind_unsupported: 'Bauteilart nicht unterstützt · nur Volumenbauteile ohne Netz oder abgewickeltes Blech.',
    configuration_unsupported:
      'Konfiguriertes Part Studio nicht unterstützt. Ein Studio ohne Konfigurationsparameter wählen.',
    element_not_provisioned: 'Part Studio nicht für Ziele freigegeben. Zuordnung durch Operator prüfen lassen.',
    selection_target_not_allowed: 'Auswahl außerhalb der erlaubten Zuordnung. Keine Übernahme; Operator kontaktieren.',
    selection_revision_conflict: 'Eine andere Auswahl wurde übernommen. Die gewinnende Auswahl wird neu geladen.',
    connection_busy_or_state_unavailable: 'Gerade belegt · Status neu laden.',
    target_not_part_studio: 'Gebundenes Element ist kein Part Studio · Betreiber prüfen.',
    target_missing: 'Gebundenes Element nicht vorhanden · Betreiber prüfen.',
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

// Browsing narrows no authority: only a selectable Part and a known WorkContextView can be adopted.
function createWorkContext({el, button, anchor, panel, root, call, canAdmin, render, alive, ref, showGoal, showCad}) {
  let view,
    statusError,
    statusLoading = false,
    statusRequest = 0,
    cardNotice;
  let dialog,
    session,
    step = 'documents',
    adopting = false,
    epoch = 0;
  let documents,
    documentQuery = '',
    documentError,
    documentLoading = false;
  let selectedDocument,
    workspaces,
    workspaceError,
    workspaceLoading = false,
    selectedWorkspace;
  let parts,
    partQuery = '',
    studioFilter = '',
    partError,
    partLoading = false,
    selectedPart;
  let previewTarget,
    preview,
    previewError,
    previewLoading = false,
    actionMessage,
    failedPart;
  let documentTimer, partTimer;
  const requests = {documents: 0, workspaces: 0, parts: 0, preview: 0};
  const queues = new Map();
  const media = globalThis.matchMedia?.('(max-width: 700px)');
  const mobile = () => media?.matches === true;
  const known = () => !!view && !statusError && !statusLoading;
  const locked = () => !known() || view.interlock.blocked;
  const nameNodes = (name, id) => [
    el('span', name ?? 'Name nicht verfügbar'),
    el('span', ` · ${short(id)}`, 'revision'),
  ];
  const label = (name) => name ?? 'Name nicht verfügbar';
  const role = (workspace) =>
    ({
      primary: 'Primary geschützt',
      candidate: 'Candidate · nur ansehen',
      default: 'Standard-Workspace · nur ansehen',
      other: 'Anderer Workspace · nur ansehen',
    })[workspace.role] ?? 'Rolle unbekannt · nur ansehen';
  const goodView = (value) =>
    value &&
    ['none', 'valid', 'invalid', 'unverified'].includes(value.validity) &&
    Number.isSafeInteger(value.selectionRevision) &&
    value.selectionRevision >= 0 &&
    typeof value.interlock?.blocked === 'boolean';
  const current = (s) => s && session === s && dialog && alive(s.g) && ref() === s.connection;
  const ticket = (region) => {
    const s = session,
      id = ++requests[region],
      e = epoch;
    return () => current(s) && requests[region] === id && epoch === e;
  };
  // Serialize only browsing reads per connection. Obsolete queued reads never reach the gateway.
  const browse = (action, extra, valid) => {
    const connection = session.connection;
    const result = (queues.get(connection) ?? Promise.resolve()).then(() =>
      valid() ? call(action, connection, extra) : undefined,
    );
    queues.set(
      connection,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  };
  const clearPreview = () => {
    requests.preview++;
    previewTarget = preview = previewError = undefined;
    previewLoading = false;
  };
  const clearParts = () => {
    requests.parts++;
    clearTimeout(partTimer);
    parts = selectedPart = failedPart = partError = undefined;
    partLoading = false;
    clearPreview();
  };
  const clearWorkspace = () => {
    requests.workspaces++;
    workspaces = selectedWorkspace = workspaceError = undefined;
    workspaceLoading = false;
    partQuery = studioFilter = '';
    clearParts();
  };
  const returnFocus = () => {
    const entry = root.querySelector?.('[data-context-change]');
    if (entry?.disabled) {
      const card = root.querySelector?.('[data-work-context]');
      card?.setAttribute('tabindex', '-1');
      card?.focus();
    } else {
      entry?.focus();
    }
  };
  const close = (focus = true) => {
    epoch++;
    clearTimeout(documentTimer);
    clearTimeout(partTimer);
    clearWorkspace();
    documents = selectedDocument = undefined;
    documentLoading = false;
    adopting = false;
    if (dialog) {
      const opened = dialog;
      dialog = undefined;
      opened.close();
      opened.remove();
    }
    session = undefined;
    if (focus) {
      returnFocus();
    }
  };
  const reset = () => {
    close(false);
    statusRequest++;
    view = statusError = cardNotice = undefined;
    statusLoading = false;
  };
  const readStatus = async (g, connection) => {
    const request = ++statusRequest;
    statusLoading = true;
    view = undefined;
    clearPreview();
    render();
    draw();
    try {
      const result = await call('work-context-status', connection);
      if (!alive(g) || ref() !== connection || request !== statusRequest) {
        return;
      }
      if (!result.ok || !goodView(result.workContext)) {
        throw new Error(result.code ?? 'provider_protocol_error');
      }
      view = result.workContext;
      statusError = undefined;
      if (
        view.validity === 'invalid' ||
        view.validity === 'unverified' ||
        view.interlock.blocked ||
        (selectedPart &&
          selectedDocument?.documentId === view.selection?.documentId &&
          selectedWorkspace?.workspaceId === view.selection.workspaceId &&
          parts?.observedMicroversion !== view.selection.currentMicroversion)
      ) {
        selectedPart = undefined;
        clearPreview();
      }
    } catch (error) {
      if (!alive(g) || ref() !== connection || request !== statusRequest) {
        return;
      }
      view = undefined;
      statusError = error.message;
      selectedPart = undefined;
      clearPreview();
    } finally {
      if (alive(g) && ref() === connection && request === statusRequest) {
        statusLoading = false;
        render();
        draw();
      }
    }
  };
  const revalidateReadFailure = async (code) => {
    if (
      session &&
      [
        'authorization_changed',
        'reconnect_required',
        'disconnected',
        'live_reads_disabled',
        'not_configured',
        'oauth_read_scope_missing',
        'provider_forbidden',
      ].includes(code)
    ) {
      selectedPart = undefined;
      clearPreview();
      await readStatus(session.g, session.connection);
    }
  };
  const errorCode = (result) => result?.code ?? 'provider_protocol_error';
  const readDocuments = async (offset = 0, restore = false) => {
    const s = session,
      query = documentQuery.trim().normalize('NFC'),
      valid = ticket('documents');
    documentLoading = true;
    documentError = undefined;
    if (!offset) {
      documents = undefined;
    }
    draw();
    try {
      const result = await browse('work-context-documents', {query, offset}, valid);
      if (!valid()) {
        return;
      }
      if (!result?.ok) {
        throw new Error(errorCode(result));
      }
      const page = result.documents;
      if (
        page?.query !== query ||
        page.offset !== offset ||
        !Array.isArray(page.items) ||
        typeof page.hasMore !== 'boolean' ||
        (!offset && page.items[0]?.bound !== true)
      ) {
        throw new Error('provider_protocol_error');
      }
      const items = offset ? [...documents.items, ...page.items] : page.items;
      documents = {...page, items: [...new Map(items.map((item) => [item.documentId, item])).values()]};
      if (restore && !selectedDocument) {
        selectedDocument =
          documents.items.find((item) => item.documentId === view?.selection?.documentId) ?? documents.items[0];
        await readWorkspaces(selectedDocument, true);
      }
    } catch (error) {
      if (valid()) {
        documentError = error.message;
        await revalidateReadFailure(error.message);
      }
    } finally {
      if (current(s) && valid()) {
        documentLoading = false;
        draw();
      }
    }
  };
  const chooseDocument = async (document) => {
    if (adopting) {
      return;
    }
    selectedDocument = document;
    clearWorkspace();
    actionMessage = undefined;
    step = 'workspaces';
    draw();
    await readWorkspaces(document);
  };
  const readWorkspaces = async (document, restore = false) => {
    const valid = ticket('workspaces');
    workspaceLoading = true;
    workspaceError = undefined;
    draw();
    try {
      const result = await browse('work-context-workspaces', {documentId: document.documentId}, valid);
      if (!valid() || selectedDocument !== document) {
        return;
      }
      if (!result?.ok) {
        throw new Error(errorCode(result));
      }
      if (result.workspaces?.documentId !== document.documentId || !Array.isArray(result.workspaces.items)) {
        throw new Error('provider_protocol_error');
      }
      workspaces = result.workspaces;
      if (restore) {
        const previous = workspaces.items.find((item) => item.workspaceId === view?.selection?.workspaceId);
        const primary = workspaces.items.find((item) => item.role === 'primary');
        selectedWorkspace = previous ?? primary;
        if (selectedWorkspace) {
          await readParts(true);
        }
      }
    } catch (error) {
      if (valid()) {
        workspaceError = error.message;
        await revalidateReadFailure(error.message);
      }
    } finally {
      if (valid()) {
        workspaceLoading = false;
        draw();
      }
    }
  };
  const chooseWorkspace = async (workspace) => {
    if (adopting) {
      return;
    }
    selectedWorkspace = workspace;
    clearParts();
    partQuery = studioFilter = '';
    actionMessage = undefined;
    step = 'parts';
    draw();
    await readParts();
  };
  const readParts = async (restore = false) => {
    if (!selectedDocument || !selectedWorkspace) {
      return;
    }
    const documentId = selectedDocument.documentId,
      workspaceId = selectedWorkspace.workspaceId;
    const query = partQuery.trim().normalize('NFC'),
      elementId = studioFilter;
    const valid = ticket('parts');
    selectedPart = failedPart = undefined;
    clearPreview();
    partLoading = true;
    partError = undefined;
    draw();
    try {
      const result = await browse(
        'work-context-parts',
        {documentId, workspaceId, query, ...(elementId ? {elementId} : {})},
        valid,
      );
      if (!valid() || selectedDocument.documentId !== documentId || selectedWorkspace.workspaceId !== workspaceId) {
        return;
      }
      if (!result?.ok) {
        throw new Error(errorCode(result));
      }
      const next = result.parts;
      if (
        next?.documentId !== documentId ||
        next.workspaceId !== workspaceId ||
        next.query !== query ||
        !validId(next.observedMicroversion) ||
        !Array.isArray(next.hits) ||
        !Array.isArray(next.studios)
      ) {
        throw new Error('provider_protocol_error');
      }
      if (
        restore &&
        view?.validity === 'valid' &&
        view.selection?.documentId === documentId &&
        view.selection.workspaceId === workspaceId &&
        view.selection.currentMicroversion !== next.observedMicroversion
      ) {
        throw new Error('selection_observation_stale');
      }
      parts = next;
      partLoading = false;
      const previous = view?.validity === 'valid' ? view.selection : undefined;
      if (restore && previous?.documentId === documentId && previous.workspaceId === workspaceId) {
        selectedPart = next.hits.find(
          (hit) => hit.elementId === previous.elementId && hit.partId === previous.partId && hit.selectable === true,
        );
        if (selectedPart) {
          step = 'parts';
          await readPreview(selectedPart);
        }
      }
    } catch (error) {
      if (valid()) {
        parts = undefined;
        partError = error.message;
        await revalidateReadFailure(error.message);
      }
    } finally {
      if (valid()) {
        partLoading = false;
        draw();
      }
    }
  };
  const readPreview = async (hit, studio, focusResult = false) => {
    if (!parts || !selectedDocument || !selectedWorkspace || (!hit && !studio)) {
      return;
    }
    clearPreview();
    const source = parts;
    const target = {
      documentId: source.documentId,
      workspaceId: source.workspaceId,
      elementId: studio?.elementId ?? hit.elementId,
      partId: studio ? null : hit.partId,
      observedMicroversion: source.observedMicroversion,
      name: studio ? studio.name : hit.name,
      studioName: studio ? studio.name : source.studios.find((item) => item.elementId === hit.elementId)?.name,
    };
    previewTarget = target;
    previewLoading = true;
    const valid = ticket('preview');
    draw();
    try {
      const {documentId, workspaceId, elementId, partId, observedMicroversion} = target;
      const result = await browse(
        'work-context-preview',
        {documentId, workspaceId, elementId, ...(partId === null ? {} : {partId}), observedMicroversion},
        valid,
      );
      if (!valid() || parts !== source || previewTarget !== target) {
        return;
      }
      if (!result?.ok) {
        throw new Error(errorCode(result));
      }
      const image = result.preview;
      if (
        image?.partId !== partId ||
        image.observedMicroversion !== observedMicroversion ||
        image.mimeType !== 'image/png' ||
        typeof image.dataBase64 !== 'string' ||
        image.dataBase64.length >= 65000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.dataBase64)
      ) {
        throw new Error('preview_unavailable');
      }
      preview = image;
    } catch (error) {
      if (valid()) {
        previewError = error.message;
        if (error.message !== 'preview_unavailable') {
          selectedPart = undefined;
        }
        if (
          [
            'authorization_changed',
            'reconnect_required',
            'disconnected',
            'live_reads_disabled',
            'not_configured',
            'oauth_read_scope_missing',
            'provider_forbidden',
          ].includes(error.message)
        ) {
          view = undefined;
          statusError = error.message;
          render();
        }
      }
    } finally {
      if (valid()) {
        previewLoading = false;
        draw();
        if (focusResult) {
          const region = dialog.querySelector('[data-focus="preview-region"]');
          region?.focus({preventScroll: true});
          region?.scrollIntoView({block: 'start'});
        }
      }
    }
  };
  const choosePart = (hit) => {
    if (adopting || partLoading) {
      return;
    }
    selectedPart = hit;
    step = 'parts';
    failedPart = undefined;
    actionMessage = undefined;
    void readPreview(hit);
  };
  const adoptable = () =>
    selectedPart?.selectable === true &&
    parts &&
    !partLoading &&
    !previewLoading &&
    !workspaceLoading &&
    !documentLoading &&
    !documentError &&
    !workspaceError &&
    !partError &&
    known() &&
    view.validity !== 'unverified' &&
    !view.interlock.blocked &&
    canAdmin() &&
    !adopting;
  const adopt = async () => {
    if (!adoptable()) {
      return;
    }
    const s = session,
      source = parts,
      hit = selectedPart,
      requestEpoch = epoch;
    const payload = {
      expectedSelectionRevision: view.selectionRevision,
      documentId: source.documentId,
      workspaceId: source.workspaceId,
      elementId: hit.elementId,
      partId: hit.partId,
      observedMicroversion: source.observedMicroversion,
    };
    adopting = true;
    actionMessage = undefined;
    draw();
    try {
      const result = await call('work-context-adopt', s.connection, payload);
      if (!current(s) || epoch !== requestEpoch) {
        return;
      }
      if (result.ok && goodView(result.workContext)) {
        view = result.workContext;
        statusError = undefined;
        cardNotice = 'Arbeitskontext übernommen. Keine CAD-Arbeit gestartet.';
        close(false);
        render();
        returnFocus();
        return;
      }
      const code = errorCode(result);
      actionMessage = workContextReason(code);
      failedPart = hit;
      selectedPart = undefined;
      clearPreview();
      await readStatus(s.g, s.connection);
      if (!current(s)) {
        return;
      }
      if (['selection_revision_conflict', 'connection_busy_or_state_unavailable'].includes(code)) {
        if (known()) {
          cardNotice =
            code === 'selection_revision_conflict'
              ? 'Andere Auswahl war schneller · bestätigten Arbeitskontext neu geladen. Bitte erneut prüfen.'
              : 'Gerade belegt · Status neu geladen. Bestätigten Arbeitskontext erneut prüfen.';
          close(false);
          render();
          returnFocus();
        } else {
          actionMessage = 'Status unbekannt · Übernehmen gesperrt. Verbindung prüfen und Status erneut laden.';
        }
      } else if (code === 'selection_observation_stale' && known()) {
        await readParts();
      }
    } catch {
      if (current(s)) {
        failedPart = hit;
        selectedPart = undefined;
        clearPreview();
        actionMessage = 'Ausgang der Übernahme unklar. Status prüfen; nicht erneut übernehmen.';
        await readStatus(s.g, s.connection);
      }
    } finally {
      if (current(s)) {
        adopting = false;
        render();
        draw();
      }
    }
  };
  const errorRegion = (node, code, retry) => {
    node.append(el('p', workContextReason(code), 'notice'));
    const again = button('Erneut laden', retry);
    again.disabled = adopting;
    node.append(again);
  };
  const previewNode = () => {
    const node = el('section', undefined, 'selection-preview');
    node.setAttribute('aria-label', 'Vorschau');
    node.setAttribute('tabindex', '-1');
    node.setAttribute('data-focus', 'preview-region');
    node.setAttribute('data-preview-kind', previewTarget?.partId === null ? 'studio' : 'part');
    if (!previewTarget) {
      node.append(el('h3', 'Vorschau'), el('p', 'Wähle ein Bauteil oder „Studio ansehen“.'));
      return node;
    }
    const target = previewTarget;
    node.append(
      el('p', target.partId === null ? 'Part-Studio-Vorschau · kein Einzelbauteil' : 'Bauteilvorschau', 'eyebrow'),
      el('h3', label(target.name)),
      el('p', `${label(selectedDocument.name)} / ${label(selectedWorkspace.name)} / ${label(target.studioName)}`),
      el('p', `${target.partId === null ? 'Studio' : 'Part'} ${short(target.partId ?? target.elementId)}`, 'revision'),
    );
    if (previewLoading) {
      node.append(el('p', 'Vorschau wird geladen …', 'loading'));
    } else if (preview) {
      const image = el('img');
      image.alt = `${target.partId === null ? 'Part-Studio-Vorschau' : 'Bauteilvorschau'}: ${label(target.name)} · ${target.partId ?? target.elementId}`;
      image.src = `data:image/png;base64,${preview.dataBase64}`;
      const shown = preview;
      const invalidImage = () => {
        if (preview === shown) {
          preview = undefined;
          previewError = 'preview_unavailable';
          draw();
        }
      };
      image.onerror = invalidImage;
      image.onload = () => {
        if (
          image.naturalWidth !== (target.partId === null ? 128 : 256) ||
          image.naturalHeight !== (target.partId === null ? 128 : 256)
        ) {
          invalidImage();
        }
      };
      node.append(image);
    } else {
      node.append(el('p', workContextReason(previewError ?? 'preview_unavailable'), 'notice'));
    }
    if (!previewLoading) {
      const retry = button('Vorschau erneut laden', () => {
        if (!parts || adopting) {
          return;
        }
        return target.partId === null
          ? readPreview(
              undefined,
              parts.studios.find((item) => item.elementId === target.elementId),
            )
          : readPreview(
              parts.hits.find((item) => item.elementId === target.elementId && item.partId === target.partId),
              undefined,
              true,
            );
      });
      retry.disabled = adopting;
      node.append(retry);
    }
    const url = cadLink(target);
    if (url) {
      node.append(anchor('In Onshape öffnen ↗', url));
    }
    if (target.partId === null && selectedPart) {
      node.append(button('Bauteilvorschau', () => readPreview(selectedPart, undefined, true)));
    }

    return node;
  };
  const draw = () => {
    if (!dialog) {
      return;
    }
    const focused = document.activeElement;
    const focusKey = focused?.getAttribute?.('data-focus'),
      caret = focused?.selectionStart;
    const bodyScroll = dialog.querySelector?.('.coc-selector-body')?.scrollTop ?? 0;
    dialog.replaceChildren();
    const heading = el('h2', 'Arbeitskontext auswählen');
    heading.id = 'coc-selection-title';
    const header = el('header', undefined, 'selector-head');
    header.append(
      heading,
      el(
        'p',
        mobile()
          ? 'Dokument → Workspace → Bauteil'
          : 'Finde dein Dokument, wähle den Workspace und übernimm das passende Bauteil.',
      ),
    );
    const body = el('div', undefined, 'selector-body');
    const layout = el('div', undefined, 'selector-layout'),
      context = el('div', undefined, 'selector-context');
    const input = (name, value, key, change) => {
      const labelNode = el('label', name),
        field = el('input');
      field.type = 'search';
      field.maxLength = 100;
      field.value = value;
      field.setAttribute('aria-label', name);
      field.setAttribute('data-focus', key);
      field.disabled = adopting;
      field.oninput = () => change(field.value);
      labelNode.append(field);
      return labelNode;
    };
    const keyed = (text, key, handler) => {
      const node = button(text, handler);
      node.setAttribute('data-focus', key);
      return node;
    };
    if (mobile() && selectedDocument && step !== 'documents') {
      const summary = el('div', undefined, 'selector-context-summary');
      const documentLabel = el('strong', '1 ');
      documentLabel.append(...nameNodes(selectedDocument.name, selectedDocument.documentId));
      summary.append(
        documentLabel,
        keyed('Dokument ändern', 'change-document', () => {
          step = 'documents';
          draw();
        }),
      );
      if (selectedWorkspace) {
        const workspaceLabel = el('p', '2 ');
        workspaceLabel.append(
          ...nameNodes(selectedWorkspace.name, selectedWorkspace.workspaceId),
          el('span', ` · ${role(selectedWorkspace)}`),
        );
        summary.append(
          workspaceLabel,
          keyed('Workspace ändern', 'change-workspace', () => {
            step = 'workspaces';
            draw();
          }),
        );
      }
      body.append(summary);
    }
    const docs = el('section', undefined, 'selector-documents');
    docs.setAttribute('aria-label', 'Dokumente');
    docs.hidden = mobile() && step !== 'documents';
    docs.append(
      el('h3', '1 Dokument'),
      input('Dokument suchen', documentQuery, 'document-search', (value) => {
        documentQuery = value;
        requests.documents++;
        clearTimeout(documentTimer);
        documents = undefined;
        documentError = undefined;
        documentLoading = false;
        if (value.trim().length !== 1) {
          documentTimer = setTimeout(() => {
            if (session) {
              void readDocuments();
            }
          }, 300);
        }
        draw();
      }),
    );
    if (documentQuery.trim().length === 1) {
      docs.append(el('p', 'Bitte mindestens zwei Zeichen eingeben.'));
    }
    if (documentLoading) {
      docs.append(el('p', 'Dokumente werden geladen …', 'loading'));
    }
    if (documentError) {
      errorRegion(docs, documentError, () => readDocuments());
    }
    const documentResults = el('div', undefined, 'selector-document-results');
    for (const item of documents?.items ?? []) {
      const row = keyed('', `document-${item.documentId}`, () => chooseDocument(item));
      row.disabled = adopting;
      row.append(
        ...nameNodes(item.name, item.documentId),
        el(
          'span',
          `${item.bound ? ' · Zugeordnet' : ' · Nur ansehen'}${selectedDocument?.documentId === item.documentId ? ' · ausgewählt' : ''}`,
          'choice-state',
        ),
      );
      row.setAttribute('aria-pressed', String(selectedDocument?.documentId === item.documentId));
      documentResults.append(row);
      if (item.reason) {
        documentResults.append(el('p', workContextReason(item.reason), 'muted'));
      }
    }
    docs.append(documentResults);
    if (documents && !documents.items.length) {
      docs.append(el('p', 'Keine Dokumente gefunden · Suchbegriff ändern.'));
    }
    if (documents?.hasMore) {
      const more = keyed('Weitere Dokumente laden', 'more-documents', () => readDocuments(documents.offset + 20));
      more.disabled = documentLoading || adopting;
      docs.append(more);
    }
    if (mobile() && selectedDocument) {
      docs.append(
        keyed('Weiter zum Workspace', 'continue-workspace', () => {
          step = 'workspaces';
          draw();
        }),
      );
    }
    const spaces = el('section', undefined, 'selector-workspaces');
    spaces.setAttribute('aria-label', 'Workspaces');
    spaces.hidden = mobile() && step !== 'workspaces';
    spaces.append(el('h3', '2 Onshape-Workspace'));
    if (!selectedDocument) {
      spaces.append(el('p', 'Wähle zuerst ein Dokument.'));
    }
    if (workspaceLoading) {
      spaces.append(el('p', 'Workspaces werden geladen …', 'loading'));
    }
    if (workspaceError) {
      errorRegion(spaces, workspaceError, () => readWorkspaces(selectedDocument));
    }
    if (workspaces?.items.length === 0) {
      spaces.append(el('p', 'Keine Workspaces verfügbar · Zugriff in Onshape prüfen.'));
    }
    for (const item of workspaces?.items ?? []) {
      const row = keyed('', `workspace-${item.workspaceId}`, () => chooseWorkspace(item));
      row.disabled = adopting;
      row.append(
        ...nameNodes(item.name, item.workspaceId),
        el(
          'span',
          ` · ${role(item)}${item.readOnly ? ' · schreibgeschützt' : ''}${selectedWorkspace?.workspaceId === item.workspaceId ? ' · ausgewählt' : ''}`,
          'choice-state',
        ),
      );
      row.setAttribute('aria-pressed', String(selectedWorkspace?.workspaceId === item.workspaceId));
      spaces.append(row);
      if (item.reason) {
        spaces.append(el('p', workContextReason(item.reason), 'muted'));
      }
    }
    context.append(docs, spaces);
    layout.append(context);
    const area = el('section', undefined, 'selector-part-area');
    area.setAttribute('aria-label', 'Bauteile');
    area.hidden = mobile() && step !== 'parts';
    const list = el('div', undefined, 'selector-part-list');
    list.append(el('h3', '3 Bauteil auswählen'));
    list.append(
      input('Bauteile in allen Part Studios suchen', partQuery, 'part-search', (value) => {
        step = 'parts';
        partQuery = value;
        requests.parts++;
        clearTimeout(partTimer);
        selectedPart = undefined;
        clearPreview();
        partLoading = true;
        partTimer = setTimeout(() => {
          if (session) {
            void readParts();
          }
        }, 300);
        draw();
      }),
    );
    if (!selectedWorkspace) {
      list.append(el('p', 'Wähle zuerst einen Workspace.'));
    }
    if (partLoading) {
      list.append(el('p', 'Bauteile werden geladen …', 'loading'));
    }
    if (partError) {
      errorRegion(list, partError, () => readParts());
    }
    if (parts?.truncated) {
      list.append(
        el(
          'p',
          'Weitere Treffer vorhanden – Studio auswählen und Suche eingrenzen. Eine Suche allein erreicht nicht alle bisher ungescannten Studios.',
          'notice',
        ),
      );
    }
    if (parts?.studios.length && (parts.truncated || studioFilter)) {
      const refinementLabel = el('label', 'Part Studio eingrenzen'),
        refinement = el('select');
      refinement.setAttribute('aria-label', 'Part Studio eingrenzen');
      refinement.setAttribute('data-focus', 'studio-refinement');
      const all = el('option', 'Alle Part Studios');
      all.value = '';
      refinement.append(all);
      for (const studio of parts.studios) {
        const option = el('option', `${label(studio.name)} · ${short(studio.elementId)}`);
        option.value = studio.elementId;
        refinement.append(option);
      }
      refinement.value = studioFilter;
      refinement.disabled = adopting;
      refinement.onchange = () => {
        step = 'parts';
        studioFilter = refinement.value;
        void readParts();
      };
      refinementLabel.append(refinement);
      list.append(refinementLabel);
    }
    if (parts && !partLoading && !parts.hits.length) {
      list.append(el('p', 'Keine Bauteile gefunden – Suchbegriff ändern oder Studio auswählen.'));
    }
    for (const studio of !partLoading ? (parts?.studios ?? []) : []) {
      const group = el('section', undefined, 'selector-studio');
      group.setAttribute('data-studio', studio.elementId);
      const studioHead = el('div', undefined, 'selector-studio-head');
      studioHead.append(el('h3', `Part Studio · ${label(studio.name)} · ${short(studio.elementId)}`));
      const see = keyed('Studio ansehen', `studio-${studio.elementId}`, () => readPreview(undefined, studio, true));
      see.disabled = adopting;
      studioHead.append(see);
      group.append(studioHead);
      if (studio.reason) {
        group.append(el('p', workContextReason(studio.reason), 'muted'));
      }
      const hits = parts.hits.filter((hit) => hit.elementId === studio.elementId);
      if (!hits.length) {
        group.append(el('p', 'Keine Treffer im Ergebnis. Dieses Studio bei Bedarf gezielt durchsuchen.', 'muted'));
      }
      for (const hit of hits) {
        const chosen = selectedPart === hit,
          card = el('section', undefined, 'selector-part-card');
        card.setAttribute('data-part', hit.partId);
        card.setAttribute('data-element', hit.elementId);
        card.setAttribute('data-selected', String(chosen));
        const selectPart = keyed('', `part-${hit.elementId}-${hit.partId}`, () => choosePart(hit));
        selectPart.disabled = adopting;
        selectPart.append(
          el('strong', hit.name),
          el('span', ` · ${short(hit.partId)}`, 'revision'),
          el('span', chosen ? ' · Ausgewählt' : ' · Vorschau öffnen', 'choice-state'),
        );
        selectPart.setAttribute('aria-pressed', String(chosen));
        card.append(selectPart);
        if (hit.hidden) {
          card.append(el('p', 'In Onshape ausgeblendet · Vorschau hier möglich.', 'muted'));
        }
        if (hit.partNumber) {
          card.append(el('p', `Teilenummer ${hit.partNumber}`, 'muted'));
        }
        if (hit.selectable !== true) {
          card.append(el('p', `Nur ansehen · ${workContextReason(hit.reason)}`, 'inspection'));
        }
        if (failedPart === hit && actionMessage) {
          const failure = el('p', actionMessage, 'notice');
          failure.setAttribute('role', 'status');
          card.append(failure);
        }
        if (chosen) {
          if (mobile()) {
            card.append(previewNode());
          }
          if (hit.selectable === true) {
            if (view?.interlock.blocked) {
              card.append(el('p', workContextReason(view.interlock.code), 'notice'));
            }
            if (!known() || view?.validity === 'unverified') {
              card.append(el('p', 'Status unbekannt oder ungeprüft · Übernehmen gesperrt.', 'notice'));
            }
            if (!canAdmin()) {
              card.append(el('p', 'Übernehmen benötigt operator.admin.', 'muted'));
            }
            if (actionMessage) {
              const message = el('p', actionMessage, 'notice');
              message.setAttribute('role', 'status');
              card.append(message);
            }
            const accept = keyed(adopting ? 'Wird übernommen …' : 'Dieses Bauteil übernehmen', 'adopt-part', () =>
              adopt(),
            );
            accept.disabled = !adoptable();
            card.append(accept);
            if (previewTarget?.partId === null) {
              card.append(
                el(
                  'p',
                  `Übernehmen betrifft ${hit.name} · ${short(hit.partId)}, nicht das angezeigte Studio.`,
                  'muted',
                ),
              );
            }
          }
        }
        group.append(card);
      }
      list.append(group);
    }
    if (actionMessage && !selectedPart && !failedPart) {
      const message = el('p', actionMessage, 'notice');
      message.setAttribute('role', 'status');
      list.append(message);
    }
    area.append(list);
    if (!mobile()) {
      area.append(previewNode());
    } else if (!selectedPart && previewTarget) {
      list.append(previewNode());
    }
    layout.append(area);
    body.append(layout);
    const details = el('details', undefined, 'selector-details');
    details.append(el('summary', 'Stand & technische Details'));
    details.append(
      el(
        'p',
        `Auswahlrevision ${view?.selectionRevision ?? 'unbekannt'} · Stand ${parts?.observedMicroversion ?? 'ungeprüft'} · Beobachtet ${date(parts?.observedAt)}`,
        'revision',
      ),
    );
    if (previewTarget) {
      details.append(
        el(
          'p',
          `Vorschauziel: ${previewTarget.documentId} / ${previewTarget.workspaceId} / ${previewTarget.elementId} · ${previewTarget.partId ?? 'Studio'} · Stand ${previewTarget.observedMicroversion}`,
          'revision',
        ),
      );
    }
    const reload = keyed('Auswahlstatus und Treffer aktualisieren', 'refresh-selection', async () => {
      await readStatus(session.g, session.connection);
      if (session && selectedWorkspace) {
        await readParts();
      }
    });
    reload.disabled = adopting || statusLoading;
    details.append(reload);
    if (statusError) {
      details.append(el('p', workContextReason(statusError)));
    }
    body.append(details);
    const footer = el('footer', undefined, 'selector-footer');
    footer.append(el('p', 'Übernehmen setzt deinen Arbeitskontext. Es startet keine CAD-Arbeit.', 'muted'));
    const dismiss = keyed('Schließen', 'close-selection', () => close());
    dismiss.disabled = adopting;
    footer.append(dismiss);
    dialog.append(header, body, footer);
    body.scrollTop = bodyScroll;
    if (focusKey) {
      const next = [...dialog.querySelectorAll('[data-focus]')].find(
        (node) => node.getAttribute('data-focus') === focusKey,
      );
      if (next && !next.disabled && next.getClientRects().length) {
        next.focus({preventScroll: true});
        if (typeof caret === 'number' && next.tagName === 'INPUT') {
          next.setSelectionRange(caret, caret);
        }
      } else {
        [...dialog.querySelectorAll('[data-focus]')]
          .find((node) => !node.disabled && node.getClientRects().length)
          ?.focus({preventScroll: true});
      }
    }
  };
  const open = async (g, connection) => {
    if (!alive(g) || ref() !== connection || locked() || dialog) {
      return;
    }
    session = {g, connection};
    epoch++;
    documentQuery = partQuery = studioFilter = '';
    actionMessage = undefined;
    step = 'documents';
    const opened = el('dialog', undefined, 'selection-dialog');
    dialog = opened;
    opened.setAttribute('aria-labelledby', 'coc-selection-title');
    opened.oncancel = (event) => {
      event.preventDefault();
      if (!adopting) {
        close();
      }
    };
    opened.onclose = () => {
      if (dialog === opened && !opened.open) {
        close();
      }
    };
    opened.onkeydown = (event) => {
      if (event.key !== 'Tab') {
        return;
      }
      const controls = [
        ...opened.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary',
        ),
      ].filter((node) => node.getClientRects().length);
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
    root.append(opened);
    draw();
    opened.showModal();
    await readStatus(g, connection);
    if (dialog === opened) {
      await readDocuments(0, true);
    }
  };
  const card = (g) => {
    const node = panel('Arbeitskontext');
    node.setAttribute('data-work-context', '');
    if (cardNotice) {
      const notice = el('p', cardNotice, 'notice');
      notice.setAttribute('role', 'status');
      node.append(notice);
    }
    if (statusLoading) {
      node.append(el('p', 'Auswahlstatus wird geprüft …'));
    } else if (!view || statusError) {
      node.append(el('p', workContextReason(statusError), 'notice'));
    } else {
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
      const s = view.selection;
      if (s) {
        node.append(el('h3', s.partName));
        const provenance = el('p');
        provenance.append(
          el('span', 'Dokument: '),
          ...nameNodes(s.documentName, s.documentId),
          el('span', ' · Workspace: '),
          ...nameNodes(s.workspaceName, s.workspaceId),
          el('span', ' · Part Studio: '),
          ...nameNodes(s.partStudioName, s.elementId),
        );
        node.append(provenance);
        node.append(
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
      node.append(el('p', `Status vom ${date(view.observedAt)}`, 'muted'));
      if (view.reason) {
        node.append(el('p', workContextReason(view.reason), 'notice'));
      }
      if (view.interlock.blocked) {
        node.append(el('p', workContextReason(view.interlock.code), 'notice'), button('Zum Zielbereich', showGoal));
      }
    }
    const change = button('Auswahl ändern', () => open(g, ref()));
    change.setAttribute('data-context-change', '');
    change.disabled = !!locked();
    node.append(change, button('Weiter zu CAD', showCad));
    return node;
  };
  const resized = () => draw();
  media?.addEventListener('change', resized);
  return {
    card,
    readStatus,
    reset,
    dispose() {
      reset();
      media?.removeEventListener('change', resized);
    },
  };
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
            workContext.dispose();
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
