// V2 consumer acceptance: real browsing gateway shapes, fully intercepted offline.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createEvidenceCapture} from './cockpit-evidence.mjs';

const outcomes = {
  selection_observation_stale: /Stand hat sich geändert/,
  selection_part_missing: /Bauteil nicht mehr vorhanden/,
  selection_part_unsupported: /Bauteilart nicht unterstützt/,
  configuration_unsupported: /Konfiguriertes Part Studio nicht unterstützt/,
  element_not_provisioned: /Part Studio nicht für Ziele freigegeben/,
  selection_target_not_allowed: /Auswahl außerhalb der erlaubten Zuordnung/,
  selection_revision_conflict: /Andere Auswahl war schneller/,
  connection_busy_or_state_unavailable: /Gerade belegt · Status neu geladen/,
  target_not_part_studio: /Gebundenes Element ist kein Part Studio/,
  target_missing: /Gebundenes Element nicht vorhanden/,
  preview_unavailable: /Vorschau nicht verfügbar/,
  invalid_arguments: /Auswahlanfrage ungültig/,
  authorization_changed: /Zugriff geändert/,
  live_reads_disabled: /Live-Lesen deaktiviert/,
  not_configured: /Keine Zuordnung eingerichtet/,
  provider_protocol_error: /Onshape-Antwort nicht lesbar/,
  goal_active_conflict: /Schließe zuerst das aktuelle Ziel ab/,
  mutation_reconciliation_required: /Unklaren Änderungs- oder Candidate-Ausgang/,
  goal_state_invalid: /Arbeitsstatus nicht lesbar/,
  document_not_accessible: /Kein Zugriff auf dieses Dokument/,
  provider_quota_exhausted: /Onshape-API-Kontingent erschöpft/,
  provider_rate_limited: /Zu viele Anfragen · später erneut/,
  provider_forbidden: /Dokumentsuche nicht erlaubt/,
  provider_timeout: /Onshape antwortet nicht rechtzeitig/,
  reconnect_required: /Verbindung abgelaufen/,
};
export async function runSelectionBrowser() {
  const F = {};
  for (const name of [
    'document-page',
    'workspace-list',
    'part-search',
    'catalog',
    'view-valid',
    'view-invalid',
    'view-none',
    'adopt-request',
    'error-codes',
  ]) {
    F[name] = JSON.parse(await readFile(`docs/interface/work-context-fixtures/${name}.json`, 'utf8'));
  }
  const evidence = await createEvidenceCapture('selector');
  const origin = 'https://selection-v2-fixture.test';
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Selector V2 · Offline</title>
<style>body{margin:0;background:#090f17;color:#e3ebf4;font:14px system-ui}#demo{padding:8px 18px;color:#f2d399}#app{max-width:1800px;margin:auto}</style>
<div id="demo">DEMONSTRATION · synthetische Daten · kein Live-CAD-Nachweis</div><div id="app"></div>
<script type="module">
import ui from '/ui.js';import {data,status,workspaceContext,goalFixture} from '/fixture.js';
window.F=${JSON.stringify(F)};window.calls=[];window.pending=[];window.errors={};window.delay={};window.connection={canAdmin:true};
window.variant='normal';window.mv='a'.repeat(24);window.view=structuredClone(F['view-none']);window.goals={ok:true,goal:goalFixture(),history:[]};
window.png=(size,id)=>{const c=document.createElement('canvas');c.width=c.height=size;const p=c.getContext('2d');p.fillStyle='#0b1923';p.fillRect(0,0,size,size);p.strokeStyle=id==='JIG'?'#d9ae70':'#80cbdc';p.lineWidth=3;p.beginPath();p.moveTo(size*.15,size*.35);p.lineTo(size*.6,size*.18);p.lineTo(size*.85,size*.44);p.lineTo(size*.85,size*.68);p.lineTo(size*.4,size*.84);p.lineTo(size*.15,size*.6);p.closePath();p.stroke();p.beginPath();p.ellipse(size*.53,size*.38,size*.08,size*.04,0,0,Math.PI*2);p.stroke();p.fillStyle='#e3ebf4';p.font=Math.max(10,size/20)+'px system-ui';p.fillText('SYNTHETISCH · '+id,size*.15,size*.95);return c.toDataURL('image/png').split(',')[1];};
window.gateway=async args=>{
 const a=args.actionId,p=args.payload;window.calls.push({...structuredClone(args),time:Date.now()});let result;
 if(window.errors[a])result={ok:false,code:window.errors[a]};
 else if(a==='status')result={...status,connections:['owner-rest','other-rest']};
 else if(a==='mutation-status')result=data;
 else if(a==='workspace-context')result=workspaceContext;
 else if(a==='goal-status')result=window.goals;
 else if(a==='work-context-status')result={ok:true,workContext:structuredClone(window.view)};
 else if(a==='work-context-documents'){
  const page=structuredClone(F['document-page']);page.query=p.query;page.offset=p.offset;
  if(p.offset){page.items=[{documentId:'3'.repeat(24),name:'More Mounts',bound:false,goalEligible:false,reason:'document_not_provisioned'}];page.hasMore=false;}
  if(window.variant==='nullable')page.items.forEach(d=>d.name=null);
  if(window.variant==='long')page.items[0].name='Langer Dokumentname '.repeat(18);
  result={ok:true,documents:page};
 }else if(a==='work-context-workspaces'){
  const list=structuredClone(F['workspace-list']);list.documentId=p.documentId;
  if(p.documentId!==F['catalog'].document.documentId){list.items=[{workspaceId:'9'.repeat(24),name:'Library default',role:'default',readOnly:true,goalEligible:false,reason:'document_not_provisioned'}];}
  if(window.variant==='nullable')list.items.forEach(w=>w.name=null);
  if(window.variant==='empty-workspaces')list.items=[];
  result={ok:true,workspaces:list};
 }else if(a==='work-context-parts'){
  const parts=structuredClone(F['part-search']);parts.documentId=p.documentId;parts.workspaceId=p.workspaceId;parts.query=p.query;parts.observedMicroversion=window.mv;
  parts.hits.push(...F.catalog.partStudios[0].parts.filter(h=>!parts.hits.some(h2=>h2.partId===h.partId)).map(h=>({...h,elementId:F.catalog.partStudios[0].elementId,partNumber:null})));
  let reason=p.documentId!==F.catalog.document.documentId?'document_not_provisioned':p.workspaceId==='c'.repeat(24)?'candidate_inspection_only':p.workspaceId!=='e'.repeat(24)?'workspace_inspection_only':null;
  if(reason)parts.hits.forEach(h=>{h.selectable=false;h.reason=reason;});
  if(window.variant==='configured'){parts.studios[0].reason='configuration_unsupported';parts.hits.filter(h=>h.elementId===parts.studios[0].elementId).forEach(h=>{h.selectable=false;h.reason='configuration_unsupported';});}
  if(window.variant==='not-selectable'){parts.hits.forEach(h=>{h.selectable=false;h.reason='part_kind_unsupported';});}
  if(window.variant==='nullable')parts.studios.forEach(s=>s.name=null);
  if(window.variant==='truncated'){parts.truncated=true;parts.truncatedReason='part_search_truncated';if(!p.elementId)parts.hits=parts.hits.filter(h=>h.elementId===parts.studios[0].elementId);}
  if(window.variant==='empty-parts')parts.hits=[];
  if(p.elementId)parts.hits=parts.hits.filter(h=>h.elementId===p.elementId);
  if(p.query)parts.hits=parts.hits.filter(h=>(h.name+' '+(h.partNumber??'')).toLocaleLowerCase().includes(p.query.toLocaleLowerCase()));
  result={ok:true,parts};
 }else if(a==='work-context-preview')result={ok:true,preview:{mimeType:'image/png',dataBase64:window.png(p.partId?256:128,p.partId??'STUDIO'),partId:p.partId??null,observedMicroversion:p.observedMicroversion}};
 else if(a==='work-context-adopt'){
  const old=structuredClone(F['view-valid']);old.selectionRevision=p.expectedSelectionRevision+1;Object.assign(old.selection,{partId:p.partId,partName:p.partId==='JIG'?'Clamp right':p.partId==='JIF'?'Clamp left':'Bracket',observedMicroversion:p.observedMicroversion,currentMicroversion:p.observedMicroversion});window.view=old;result={ok:true,workContext:structuredClone(old)};
 }else throw Error('Unexpected method '+a);
 if(window.delay[a]){const pending={action:a,payload:structuredClone(p),result};window.pending.push(pending);await new Promise(r=>pending.release=r);result=pending.result;}
 return {ok:true,result};
};
ui.activate({ui:{registerNavigation(){},registerPage(page){window.mounted=page.mount(document.querySelector('#app'),{signal:new AbortController().signal,host:{connection:window.connection,request(method,args){if(method!=='plugins.sessionAction')throw Error('Unexpected route');return window.gateway(args);}}});}}});
</script></html>`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
  });
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [],
    escaped = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !['/', '/ui.js', '/fixture.js'].includes(url.pathname)) {
      escaped.push(url.href);
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: url.pathname === '/' ? 'text/html' : 'text/javascript',
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; object-src 'none'",
      },
      body:
        url.pathname === '/'
          ? html
          : await readFile(
              url.pathname === '/ui.js' ? 'dist/control-ui/product/index.js' : 'tests/fixtures/cockpit.mjs',
              'utf8',
            ),
    });
  });
  const dialog = page.getByRole('dialog', {name: 'Arbeitskontext auswählen'}),
    card = page.locator('[data-work-context]');
  const focus = (key) => dialog.locator(`[data-focus="${key}"]`);
  const part = (id, e = F.catalog.partStudios[0].elementId) =>
    dialog.locator(`[data-part="${id}"][data-element="${e}"]`);
  const preview = dialog.getByRole('region', {name: 'Vorschau', exact: true});
  const change = () => card.getByRole('button', {name: 'Auswahl ändern', exact: true});
  const refresh = () => page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  const ready = async () => {
    await change().waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-context-change]').disabled);
  };
  const reset = async () => {
    await page.goto(origin);
    await ready();
  };
  const open = async () => {
    await change().click();
    await page.waitForFunction(
      () =>
        window.calls.some((c) => c.actionId === 'work-context-parts') &&
        !document.querySelector('dialog').textContent.includes('Dokumente werden geladen'),
    );
  };
  const enterParts = async () => {
    if (await focus('continue-workspace').isVisible()) {
      await focus('continue-workspace').click();
      await focus(`workspace-${F.catalog.workspaces[0].workspaceId}`).click();
    }
    await dialog.getByRole('searchbox', {name: 'Bauteile in allen Part Studios suchen', exact: true}).waitFor();
    await page.waitForFunction(() => !document.querySelector('dialog').textContent.includes('Bauteile werden geladen'));
  };
  const select = async (id, e) => {
    await part(id, e).getByRole('button').first().click();
    await preview.getByRole('img', {name: new RegExp(` · ${id}$`)}).waitFor();
    await preview.getByRole('img').evaluate((i) => i.decode());
  };
  const close = () => focus('close-selection').click();
  const noAdopt = async () =>
    assert.equal(await dialog.getByRole('button', {name: 'Dieses Bauteil übernehmen', exact: true}).count(), 0);
  const capture = async (name) => {
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({width, height});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (await dialog.count()) {
        assert(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth));
        const footer = dialog.locator('.coc-selector-footer');
        assert(await focus('close-selection').isVisible());
        assert(await footer.evaluate((f) => f.getBoundingClientRect().bottom <= innerHeight));
        assert(
          await dialog
            .locator('.coc-selector-body')
            .evaluate((b) => b.getBoundingClientRect().bottom <= b.nextElementSibling.getBoundingClientRect().top + 1),
        );
      } else {
        await card.scrollIntoViewIfNeeded();
        assert.equal(await card.locator('img,input,select').count(), 0);
      }
      await evidence.screenshot(page, `v2-${name}-${width}x${height}.png`);
    }
    await page.setViewportSize({width: 1440, height: 900});
  };
  const checks = [];
  try {
    await reset();
    assert.deepEqual(
      await page.evaluate(() =>
        window.calls.filter((c) => c.actionId.startsWith('work-context-')).map((c) => c.actionId),
      ),
      ['work-context-status'],
    );
    await open();
    await enterParts();
    assert.equal(await dialog.getByRole('button', {name: 'Schließen', exact: true}).count(), 1);
    assert.equal(await dialog.getByRole('button', {name: 'Abbrechen', exact: true}).count(), 0);
    assert.equal(await focus('adopt-part').count(), 0);
    const docs = dialog.getByRole('region', {name: 'Dokumente', exact: true});
    assert((await docs.getByRole('button').first().getAttribute('aria-pressed')) === 'true');
    assert.match(await docs.getByRole('button').first().textContent(), /Zugeordnet/);
    const initial = await page.evaluate(
      () => window.calls.filter((c) => c.actionId === 'work-context-documents').length,
    );
    await dialog.getByRole('searchbox', {name: 'Dokument suchen', exact: true}).fill('m');
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-documents').length),
      initial,
    );
    const searchStart = Date.now();
    await focus('document-search').fill('mo');
    await page.waitForTimeout(120);
    await focus('document-search').fill('mount');
    await page.waitForTimeout(120);
    assert.equal(
      await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-documents').length),
      initial,
    );
    await focus('more-documents').waitFor();
    const searched = await page.evaluate(() =>
      window.calls.filter((c) => c.actionId === 'work-context-documents').at(-1),
    );
    assert.equal(searched.payload.query, 'mount');
    assert(searched.time - searchStart >= 300);
    assert.equal(searched.payload.offset, 0);
    await focus('more-documents').click();
    await docs.getByText(/More Mounts/).waitFor();
    assert.equal(await focus('more-documents').count(), 0);
    assert.equal(
      await page.evaluate(
        () => window.calls.filter((c) => c.actionId === 'work-context-documents').at(-1).payload.offset,
      ),
      20,
    );
    checks.push(
      'X3 document min-2, 300ms debounce, empty initial page, bound first/marked, paging offset 20 and hasMore',
    );
    await select('JIF');
    assert.equal(await part('JIF').getByRole('button', {name: 'Dieses Bauteil übernehmen', exact: true}).count(), 1);
    await capture('part');
    await dialog
      .locator(`[data-studio="${F['part-search'].studios[1].elementId}"]`)
      .getByRole('button', {name: 'Studio ansehen', exact: true})
      .click();
    await preview.getByRole('img', {name: /Part-Studio-Vorschau/}).waitFor();
    assert(await preview.getByText('Part-Studio-Vorschau · kein Einzelbauteil', {exact: true}).isVisible());
    assert.equal(await part('JIF').getAttribute('data-selected'), 'true');
    assert(await preview.evaluate((n) => n === document.activeElement));
    const studioCall = await page.evaluate(() =>
      window.calls.filter((c) => c.actionId === 'work-context-preview').at(-1),
    );
    assert.equal(studioCall.payload.documentId, F.catalog.document.documentId);
    assert.equal(studioCall.payload.workspaceId, F.catalog.workspaces[0].workspaceId);
    assert(!Object.hasOwn(studioCall.payload, 'partId'));
    await capture('studio');
    await preview.getByRole('button', {name: 'Bauteilvorschau', exact: true}).click();
    await preview.getByRole('img', {name: / · JIF$/}).waitFor();
    await focus('adopt-part').click();
    await dialog.waitFor({state: 'detached'});
    assert.deepEqual(await page.evaluate(() => window.calls.find((c) => c.actionId === 'work-context-adopt').payload), {
      connectionRef: 'owner-rest',
      ...Object.fromEntries(Object.entries(F['adopt-request']).filter(([k]) => k !== '_comment')),
    });
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    assert.equal(await card.locator('img,input,select').count(), 0);
    assert(await change().evaluate((n) => n === document.activeElement));
    await capture('compact');
    await page
      .getByRole('navigation', {name: 'Arbeitsbereich'})
      .getByRole('button', {name: 'CAD', exact: true})
      .click();
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    await page
      .getByRole('navigation', {name: 'Arbeitsbereich'})
      .getByRole('button', {name: 'Workspace', exact: true})
      .click();
    checks.push(
      'X2/X5/X6 selected-card adoption, full exact payload, studio/null identity, return to Part preview, compact synchronized Workspace/CAD',
    );
    for (const [w, h] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({width: w, height: h});
      await open();
      await enterParts();
      assert.equal(await part('JIF').getAttribute('data-selected'), 'true');
      if (w === 390) {
        assert.equal(await part('JIF').getByRole('region', {name: 'Vorschau'}).count(), 1);
        await focus('change-document').click();
        await focus('document-search').waitFor();
      }
      await focus('close-selection').focus();
      await page.keyboard.press('Tab');
      assert(await dialog.evaluate((d) => d.contains(document.activeElement)));
      assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      assert(await change().evaluate((n) => n === document.activeElement));
      await open();
      await enterParts();
      await select('JIG');
      await close();
      assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    }
    await page.setViewportSize({width: 1440, height: 900});
    await reset();
    await open();
    await enterParts();
    await focus(`document-${F['document-page'].items[1].documentId}`).click();
    await focus(`workspace-${'9'.repeat(24)}`).waitFor();
    assert.equal(await dialog.locator('[data-part]').count(), 0);
    assert.equal(await preview.getByRole('img').count(), 0);
    await focus(`workspace-${'9'.repeat(24)}`).click();
    await select('JIF');
    await noAdopt();
    assert(
      await part('JIF')
        .getByText(/Anderes Dokument/)
        .isVisible(),
    );
    const foreign = await page.evaluate(
      () => window.calls.filter((c) => c.actionId === 'work-context-preview').at(-1).payload,
    );
    assert.equal(foreign.workspaceId, '9'.repeat(24));
    assert.equal(foreign.documentId, F['document-page'].items[1].documentId);
    await capture('inspection-document');
    checks.push(
      'X3/X5 foreign parent clears descendants, default/readOnly role, explicit workspace in foreign preview, no adoption',
    );
    for (const [ws, reason] of [
      ['c', 'Candidate'],
      ['d', 'Anderer Workspace'],
    ]) {
      await reset();
      await open();
      await focus(`workspace-${ws.repeat(24)}`).click();
      await select('JIF');
      await noAdopt();
      assert(await part('JIF').getByText(new RegExp(reason)).isVisible());
    }
    for (const [id, e, reason] of [
      ['JFD', F['part-search'].studios[1].elementId, /nicht für Ziele freigegeben/],
      ['JKD', undefined, /Bauteilart nicht unterstützt/],
    ]) {
      await reset();
      await open();
      await select(id, e);
      await noAdopt();
      assert(await part(id, e).getByText(reason).isVisible());
    }
    await reset();
    await page.evaluate(() => (window.variant = 'configured'));
    await open();
    await select('JIF');
    await noAdopt();
    assert(
      await part('JIF')
        .getByText(/Konfiguriertes/)
        .isVisible(),
    );
    await reset();
    await page.evaluate(() => (window.variant = 'not-selectable'));
    await open();
    await select('JIF');
    await noAdopt();
    checks.push(
      'X4 all six inspection reasons clickable; goalEligible:true never overrides selectable:false; configured studio still enumerates',
    );
    await reset();
    await page.evaluate(() => (window.variant = 'truncated'));
    await open();
    await dialog.getByText(/Weitere Treffer vorhanden/).waitFor();
    const unscanned = F['part-search'].studios[1].elementId;
    assert.equal(await dialog.locator(`[data-studio="${unscanned}"]`).count(), 1);
    await focus('studio-refinement').selectOption(unscanned);
    await part('JFD', unscanned).waitFor();
    assert.equal(
      await page.evaluate(
        () => window.calls.filter((c) => c.actionId === 'work-context-parts').at(-1).payload.elementId,
      ),
      unscanned,
    );
    await focus('part-search').fill('FB-0042');
    await part('JFD', unscanned).waitFor();
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-parts').at(-1).payload.query),
      'FB-0042',
    );
    await capture('refinement');
    checks.push('X4 CR-18 all studios on truncated search, explicit studio refinement and server part-number query');
    await reset();
    await page.evaluate(() => (window.variant = 'empty-parts'));
    await open();
    await dialog.getByText(/Keine Bauteile gefunden/).waitFor();
    await noAdopt();
    await reset();
    await page.evaluate(() => (window.variant = 'empty-workspaces'));
    await change().click();
    await dialog.getByText(/Keine Workspaces verfügbar/).waitFor();
    await reset();
    await page.evaluate(() => (window.variant = 'nullable'));
    await open();
    assert(await docs.getByText('Name nicht verfügbar', {exact: true}).first().isVisible());
    assert.equal(await docs.getByText(/\bnull\b/).count(), 0);
    await select('JIF');
    await capture('missing-names');
    await reset();
    await page.evaluate(() => (window.variant = 'long'));
    await open();
    await select('JIF');
    await capture('long-names');
    checks.push(
      'U1/U2 nullable and long names, strict Part labels, secondary IDs, same-name and hidden Parts, empty relevant regions and responsive layout',
    );
    for (const id of ['JHD', 'JHH']) {
      await reset();
      await open();
      await select(id);
      assert.equal(await part(id).getAttribute('data-selected'), 'true');
    }
    // Unavailable images are optional, but a studio is never a substitute and read errors keep their code.
    await reset();
    await open();
    await page.evaluate(() => (window.errors['work-context-preview'] = 'preview_unavailable'));
    await part('JIF').getByRole('button').first().click();
    await preview.getByText(outcomes.preview_unavailable).waitFor();
    assert.equal(await preview.getByRole('img').count(), 0);
    assert(await focus('adopt-part').isEnabled());
    await capture('preview-unavailable');
    for (const code of [
      'reconnect_required',
      'document_not_accessible',
      'provider_quota_exhausted',
      'provider_rate_limited',
      'provider_forbidden',
      'authorization_changed',
    ]) {
      await reset();
      await open();
      await page.evaluate((c) => (window.errors['work-context-preview'] = c), code);
      await part('JIF').getByRole('button').first().click();
      await preview.getByText(outcomes[code]).waitFor();
      await noAdopt();
    }
    checks.push(
      'X5 optional unavailable Part preview, no studio substitute, R1/provider access/quota/rate distinctions preserved',
    );
    await reset();
    await open();
    await select('JIF');
    await page.evaluate(() => (window.errors['work-context-preview'] = 'preview_unavailable'));
    await dialog
      .locator(`[data-studio="${F['part-search'].studios[1].elementId}"]`)
      .getByRole('button', {name: 'Studio ansehen', exact: true})
      .click();
    await preview.getByText(outcomes.preview_unavailable).waitFor();
    assert(await preview.getByText('Part-Studio-Vorschau · kein Einzelbauteil', {exact: true}).isVisible());
    assert.equal(await part('JIF').getAttribute('data-selected'), 'true');
    assert(
      await part('JIF')
        .getByText(/nicht das angezeigte Studio/)
        .isVisible(),
    );
    await page.evaluate(() => delete window.errors['work-context-preview']);
    await preview.getByRole('button', {name: 'Bauteilvorschau', exact: true}).click();
    await preview.getByRole('img', {name: / · JIF$/}).waitFor();
    for (const invalid of ['oversize', 'dimensions', 'decode']) {
      await reset();
      await open();
      await page.evaluate(() => (window.delay['work-context-preview'] = true));
      await part('JIF').getByRole('button').first().click();
      await page.waitForFunction(() => window.pending.length === 1);
      await page.evaluate((mode) => {
        const p = window.pending[0];
        p.result.preview.dataBase64 =
          mode === 'oversize' ? 'A'.repeat(65000) : mode === 'dimensions' ? window.png(128, 'JIF') : 'bm90IHBuZw==';
        p.release();
      }, invalid);
      await preview.getByText(outcomes.preview_unavailable).waitFor();
      assert.equal(await preview.getByRole('img').count(), 0);
    }
    checks.push(
      'X5 studio-unavailable retains selected Part identity and explicit return; PNG length, decoded dimensions and decoder failures suppress images',
    );
    // U3: old adoption codes plus CAS/Busy. Start with an existing confirmed Part to prove retention.
    for (const code of [
      ...F['error-codes'].plugin.filter((c) => c !== 'preview_unavailable'),
      ...F['error-codes'].reused,
      'connection_busy_or_state_unavailable',
      'target_not_part_studio',
      'target_missing',
    ]) {
      await reset();
      await page.evaluate(() => {
        window.view = structuredClone(window.F['view-valid']);
      });
      await refresh();
      await ready();
      await open();
      await select('JIG');
      await page.evaluate((c) => {
        window.errors['work-context-adopt'] = c;
        if (['selection_revision_conflict', 'connection_busy_or_state_unavailable'].includes(c)) {
          window.view.selection.partId = 'JHH';
          window.view.selection.partName = 'Winning bracket';
          window.view.selectionRevision = 7;
        }
        if (c === 'selection_observation_stale') {
          window.mv = 'b'.repeat(24);
          window.view.selection.currentMicroversion = window.mv;
        }
      }, code);
      await focus('adopt-part').click();
      if (['selection_revision_conflict', 'connection_busy_or_state_unavailable'].includes(code)) {
        await dialog.waitFor({state: 'detached'});
        assert(await card.getByRole('heading', {name: 'Winning bracket', exact: true}).isVisible());
        assert(await card.getByText(outcomes[code]).isVisible());
        assert(await card.getByText(/Auswahlrevision 7/).isVisible());
      } else {
        await dialog.getByText(outcomes[code]).first().waitFor();
        assert.equal(await page.evaluate(() => window.view.selection.partId), 'JIF');
      }
      assert.equal(
        await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-adopt').length),
        1,
      );
      checks.push(`U3 ${code}: distinct outcome, previous record/winner, no write retry`);
    }
    for (const action of ['work-context-documents', 'work-context-workspaces', 'work-context-parts']) {
      for (const code of [
        'document_not_accessible',
        'provider_quota_exhausted',
        'provider_rate_limited',
        'invalid_arguments',
        'provider_protocol_error',
        'live_reads_disabled',
        'reconnect_required',
        'authorization_changed',
      ]) {
        await reset();
        await page.evaluate(({a, c}) => (window.errors[a] = c), {a: action, c: code});
        await change().click();
        await dialog.getByText(outcomes[code]).first().waitFor();
        assert(
          await dialog
            .getByRole('region', {
              name:
                action === 'work-context-documents'
                  ? 'Dokumente'
                  : action === 'work-context-workspaces'
                    ? 'Workspaces'
                    : 'Bauteile',
              exact: true,
            })
            .getByText(outcomes[code])
            .isVisible(),
        );
        const n = await page.evaluate((a) => window.calls.filter((c) => c.actionId === a).length, action);
        await page.waitForTimeout(30);
        assert.equal(await page.evaluate((a) => window.calls.filter((c) => c.actionId === a).length, action), n);
      }
    }
    checks.push('X3/X4 §11.5 errors local to documents/workspaces/parts, rate limit never automatically retried');
    for (const code of ['goal_active_conflict', 'mutation_reconciliation_required', 'goal_state_invalid']) {
      await reset();
      await page.evaluate((c) => {
        window.view = structuredClone(window.F['view-invalid']);
        window.view.interlock.code = c;
        window.goals = {ok: true, goal: null, history: []};
      }, code);
      await refresh();
      await card.getByText(outcomes[code]).waitFor();
      assert(await change().isDisabled());
      assert.equal(await card.locator('img').count(), 0);
    }
    for (const validity of ['invalid', 'unverified']) {
      await reset();
      await page.evaluate((v) => {
        window.view = structuredClone(window.F['view-valid']);
        window.view.validity = v;
        window.view.reason = 'selection_part_missing';
      }, validity);
      await refresh();
      await ready();
      assert.equal(await card.locator('img').count(), 0);
      await open();
      assert.equal(await preview.getByRole('img').count(), 0);
    }
    await reset();
    await page.evaluate(() => (window.connection.canAdmin = false));
    await open();
    await select('JIF');
    assert(await focus('adopt-part').isDisabled());
    await reset();
    await page.evaluate(() => {
      window.goals.goal.target.focus = {
        partId: 'JIF',
        partName: '<b>Clamp left</b>',
        elementId: window.goals.goal.target.elementId,
        selectionRevision: 1,
      };
    });
    await refresh();
    await page
      .getByRole('navigation', {name: 'Arbeitsbereich'})
      .getByRole('button', {name: 'CAD', exact: true})
      .click();
    const goal = page.locator('#coc-goal');
    assert(await goal.getByRole('heading', {name: 'Bauteil-Fokus: <b>Clamp left</b>', exact: true}).isVisible());
    assert.equal(await goal.locator('b').count(), 0);
    assert(await goal.getByText(/bleiben featurebasiert/).isVisible());
    checks.push(
      'U4/U5 view-owned interlocks even without goal, invalid/unverified no cached previews, operator.read only, unchanged literal target.focus and feature-condition note',
    );
    for (const [validity, reason] of [
      ['invalid', 'selection_part_unsupported'],
      ['invalid', 'configuration_unsupported'],
      ['unverified', 'authorization_changed'],
      ['unverified', 'live_reads_disabled'],
      ['unverified', 'provider_protocol_error'],
      ['valid', 'revision_advanced'],
    ]) {
      await reset();
      await page.evaluate(
        ({validity, reason}) => {
          window.view = structuredClone(window.F['view-valid']);
          window.view.validity = validity;
          window.view.reason = reason;
          window.view.selection.currentMicroversion = 'b'.repeat(24);
          window.mv = 'b'.repeat(24);
        },
        {validity, reason},
      );
      await refresh();
      await ready();
      assert.equal(await card.locator('img').count(), 0);
      assert(
        await card.getByText(reason === 'revision_advanced' ? /Stand neuer als Auswahl/ : outcomes[reason]).isVisible(),
      );
      if (validity === 'unverified') {
        await open();
        await select('JIF');
        assert(await focus('adopt-part').isDisabled());
      }
    }
    await reset();
    await page.evaluate(() => {
      window.view.selectionRevision = 9;
    });
    await refresh();
    await ready();
    await open();
    await select('JIF');
    await focus('adopt-part').click();
    await dialog.waitFor({state: 'detached'});
    assert.equal(
      await page.evaluate(
        () => window.calls.find((c) => c.actionId === 'work-context-adopt').payload.expectedSelectionRevision,
      ),
      9,
    );
    assert(await card.getByText(/Auswahlrevision 10/).isVisible());
    await reset();
    await page.evaluate(
      () =>
        (window.goals.goal.target.focus = {
          partId: 'JIF',
          partName: 'Clamp left',
          elementId: window.goals.goal.target.elementId,
          selectionRevision: 1,
        }),
    );
    await refresh();
    await page
      .getByRole('navigation', {name: 'Arbeitsbereich'})
      .getByRole('button', {name: 'CAD', exact: true})
      .click();
    assert(
      await page.locator('#coc-goal').evaluate((n) => {
        const h = [...n.querySelectorAll('h3')].find((e) => e.textContent.startsWith('Bauteil-Fokus'));
        const b = [...n.querySelectorAll('button')].find(
          (e) => e.textContent === 'Ziel bestätigen & Iteration erlauben',
        );
        return !!(h.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
    );
    checks.push(
      'U4/U5/U6 all invalid/unverified/revision-advanced reasons, cleared selection retains revision, focus is rendered before separate goal confirmation',
    );
    await reset();
    await open();
    await select('JIF');
    await page.evaluate(() => (window.errors['work-context-documents'] = 'authorization_changed'));
    await focus('document-search').fill('new');
    await docs.getByText(outcomes.authorization_changed).waitFor();
    assert.equal(await preview.getByRole('img').count(), 0);
    await noAdopt();
    checks.push(
      'U4 authorization failure during another-region search revalidates status and suppresses the old selected-Part preview/readiness',
    );
    // Late requests: queue serialization plus fences for query/page, parent, context and preview identity.
    await reset();
    await open();
    await page.evaluate(() => (window.delay['work-context-preview'] = true));
    await part('JIF').getByRole('button').first().click();
    await page.waitForFunction(() => window.pending.length === 1);
    await part('JIG').getByRole('button').first().click();
    await page.evaluate(() => {
      window.delay['work-context-preview'] = false;
      window.pending[0].release();
    });
    await preview.getByRole('img', {name: / · JIG$/}).waitFor();
    assert.equal(await preview.getByRole('img', {name: / · JIF$/}).count(), 0);
    for (const wrong of ['part', 'microversion']) {
      await reset();
      await open();
      await page.evaluate(() => (window.delay['work-context-preview'] = true));
      await part('JIF').getByRole('button').first().click();
      await page.waitForFunction(() => window.pending.length === 1);
      await page.evaluate((w) => {
        const r = window.pending[0];
        if (w === 'part') {
          r.result.preview.partId = 'JIG';
        } else {
          r.result.preview.observedMicroversion = 'b'.repeat(24);
        }
        r.release();
      }, wrong);
      await preview.getByText(outcomes.preview_unavailable).waitFor();
      assert.equal(await preview.getByRole('img').count(), 0);
    }
    await reset();
    await open();
    await page.evaluate(() => (window.delay['work-context-documents'] = true));
    await focus('more-documents').click();
    await page.waitForFunction(() => window.pending.length === 1);
    await focus('document-search').fill('new query');
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.delay['work-context-documents'] = false;
      window.pending[0].result.documents.items[0].name = 'OLD PAGE';
      window.pending[0].release();
    });
    await focus('more-documents').waitFor();
    assert.equal(await docs.getByText(/OLD PAGE/).count(), 0);
    await reset();
    await open();
    await page.evaluate(() => (window.delay['work-context-parts'] = true));
    await focus('part-search').fill('left');
    await page.waitForFunction(() => window.pending.length === 1);
    await focus(`workspace-${'c'.repeat(24)}`).click();
    assert.equal(await preview.getByRole('img').count(), 0);
    await page.evaluate(() => {
      window.delay['work-context-parts'] = false;
      window.pending[0].release();
    });
    await part('JIF').waitFor();
    await noAdopt();
    assert(
      await part('JIF')
        .getByText(/Candidate/)
        .isVisible(),
    );
    for (const operation of ['close', 'refresh', 'connection', 'dispose']) {
      await reset();
      await open();
      await page.evaluate(() => (window.delay['work-context-preview'] = true));
      await part('JIF').getByRole('button').first().click();
      await page.waitForFunction(() => window.pending.length === 1);
      if (operation === 'close') {
        await close();
      } else if (operation === 'dispose') {
        await page.evaluate(() => window.mounted.dispose());
      } else if (operation === 'connection') {
        await page.evaluate(() => {
          const s = document.querySelector('[aria-label="Onshape-Verbindung"]');
          s.value = 'other-rest';
          s.dispatchEvent(new Event('change'));
        });
      } else {
        await page.evaluate(() => document.querySelector('.coc-main>.coc-controls button').click());
      }
      await page.evaluate(() => window.pending[0].release());
      await page.waitForTimeout(30);
      assert.equal(await page.locator('dialog img').count(), 0);
    }
    checks.push(
      'U6/X5 fences: newest Part, wrong Part/mv, old page/query, old parent, close/refresh/connection/dispose; per-connection browse serialization',
    );
    await reset();
    await page.evaluate(() => (window.delay['work-context-workspaces'] = true));
    await change().click();
    await page.waitForFunction(() => window.pending.length === 1);
    await focus(`document-${F['document-page'].items[1].documentId}`).click();
    await focus(`document-${F.catalog.document.documentId}`).click();
    await page.evaluate(() => {
      window.delay['work-context-workspaces'] = false;
      window.pending[0].result.workspaces.items[0].name = 'OLD WORKSPACE';
      window.pending[0].release();
    });
    await focus(`workspace-${'e'.repeat(24)}`).waitFor();
    assert.equal(await dialog.getByText(/OLD WORKSPACE/).count(), 0);
    await focus(`workspace-${'e'.repeat(24)}`).click();
    await select('JIF');
    assert.equal(
      await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-workspaces').length),
      2,
    );
    await reset();
    await open();
    await page.evaluate(() => (window.delay['work-context-parts'] = true));
    await focus('part-search').fill('left');
    await page.waitForFunction(() => window.pending.length === 1);
    await focus('part-search').fill('right');
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      window.delay['work-context-parts'] = false;
      window.pending[0].release();
    });
    await part('JIG').waitFor();
    assert.equal(await part('JIF').count(), 0);
    assert.equal(await focus('part-search').inputValue(), 'right');
    await reset();
    await open();
    await page.evaluate(() => (window.delay['work-context-preview'] = true));
    await part('JIF').getByRole('button').first().click();
    await page.waitForFunction(() => window.pending.length === 1);
    await dialog
      .locator(`[data-studio="${F['part-search'].studios[1].elementId}"]`)
      .getByRole('button', {name: 'Studio ansehen', exact: true})
      .click();
    await page.evaluate(() => {
      window.delay['work-context-preview'] = false;
      window.pending[0].release();
    });
    await preview.getByRole('img', {name: /Part-Studio-Vorschau/}).waitFor();
    assert.equal(await preview.getByRole('img', {name: / · JIF$/}).count(), 0);
    assert.equal(await part('JIF').getAttribute('data-selected'), 'true');
    checks.push(
      'X3-X5 late workspace-parent and Part-query replies ignored; obsolete queued parent reads skipped; studio response wins over older Part preview without changing adoption identity',
    );

    await reset();
    await open();
    await select('JIF');
    await page.evaluate(() => (window.delay['work-context-adopt'] = true));
    await focus('adopt-part').click();
    await page.waitForFunction(() => window.pending.length === 1);
    assert(await focus('close-selection').isDisabled());
    assert(await dialog.getByRole('button', {name: 'Wird übernommen …', exact: true}).isDisabled());
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1);
    await page.evaluate(() => window.pending[0].release());
    await dialog.waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-adopt').length), 1);
    await reset();
    await open();
    await select('JIF');
    await page.evaluate(() => {
      window.errors['work-context-adopt'] = 'connection_busy_or_state_unavailable';
      window.errors['work-context-status'] = 'goal_state_invalid';
    });
    await focus('adopt-part').click();
    await dialog.getByText(/Status unbekannt · Übernehmen gesperrt/).waitFor();
    await noAdopt();
    checks.push(
      'U6/X6 pending adoption blocks duplicate/dismissal; uncertain winner status never claims local success',
    );
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({width, height});
      await reset();
      await open();
      await focus('document-search').fill('mount');
      await focus('more-documents').waitFor();
      await focus('more-documents').click();
      await docs.getByText(/More Mounts/).waitFor();
      await focus(`document-${F['document-page'].items[1].documentId}`).click();
      await focus(`workspace-${'9'.repeat(24)}`).click();
      await select('JIF');
      await noAdopt();
      if (width === 390) {
        await focus('change-document').click();
      }
      await focus(`document-${F.catalog.document.documentId}`).click();
      await page.evaluate(() => (window.variant = 'truncated'));
      await focus(`workspace-${'e'.repeat(24)}`).click();
      await focus('studio-refinement').selectOption(F['part-search'].studios[1].elementId);
      await select('JFD', F['part-search'].studios[1].elementId);
      await noAdopt();
      if (width === 390) {
        await focus('change-workspace').click();
      }
      await page.evaluate(() => (window.variant = 'normal'));
      await focus(`workspace-${'e'.repeat(24)}`).click();
      await select('JIF');
      await dialog
        .locator(`[data-studio="${F['part-search'].studios[1].elementId}"]`)
        .getByRole('button', {name: 'Studio ansehen', exact: true})
        .click();
      await preview.getByRole('img', {name: /Part-Studio-Vorschau/}).waitFor();
      assert(await preview.evaluate((n) => n === document.activeElement));
      await preview.getByRole('button', {name: 'Bauteilvorschau', exact: true}).click();
      await preview.getByRole('img', {name: / · JIF$/}).waitFor();
      await focus('close-selection').focus();
      await page.keyboard.press('Tab');
      assert(await dialog.evaluate((d) => d.contains(document.activeElement)));
      await page.keyboard.press('Shift+Tab');
      assert(await focus('close-selection').evaluate((n) => n === document.activeElement));
      await focus('adopt-part').click();
      await dialog.waitFor({state: 'detached'});
      assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
      assert(await change().evaluate((n) => n === document.activeElement));
      assert.equal(
        await page.evaluate(
          () =>
            window.calls.filter((c) =>
              ['render', 'goal-confirm', 'candidate-prepare', 'mutation-approve'].includes(c.actionId),
            ).length,
        ),
        0,
      );
    }
    checks.push(
      'X2-X6 complete real-search/page/foreign-parent/studio-refinement/part+studio-preview/adopt/compact/focus journey at all three required viewports; no CAD/goal/approval calls',
    );
    await reset();
    await open();
    await focus('document-search').fill('mount');
    await focus('more-documents').waitFor();
    await capture('documents');
    assert.deepEqual(errors, []);
    assert.deepEqual(escaped, []);
    console.log(
      `Selector V2 browser acceptance passed (${checks.length} check groups). Screenshots: ${evidence.directory}`,
    );
    for (const c of checks) {
      console.log(`  ${c}`);
    }
    return checks;
  } finally {
    await browser.close();
  }
}
