// Serverless native page fixture: all requests are intercepted; no Gateway/provider IO.
import {readFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {pngFixture} from '../tests/fixtures/png.mjs';
import {imageHash} from '../dist/render.js';
import {runSelectionBrowser} from '../tests/cockpit-selection-browser.mjs';
import {target} from '../tests/fixtures/cockpit.mjs';
const origin = 'https://cockpit-fixture.test';
const output = '/tmp/clawonshape-ui-cockpit-regression';
const png = pngFixture();
const image = {
  ...target,
  status: 'ok',
  microversionId: '1'.repeat(24),
  documentName: 'PNG labels are not current metadata',
  revisionUrl: `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}/m/${'1'.repeat(24)}/e/${target.elementId}`,
  renderedAt: new Date().toISOString(),
  width: 800,
  height: 800,
  bytes: png.length,
  sha256: imageHash(png),
  pngBase64Chunks: [png.toString('base64')],
};
const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Cockpit · Synthetic fixture</title>
<style>body{margin:0;background:#090f17;color:#e3ebf4;font:14px system-ui}#demo{padding:8px 18px;color:#f2d399;font-size:12px}#app{max-width:1800px;margin:auto}</style>
<div id="demo">DEMONSTRATION · synthetische Testdaten · keine Live-CAD-, Ziel- oder Druckbelege</div><div id="app"></div>
<script type="module" nonce="cockpit-fixture">
import ui from '/ui.js';import {data as fixtureData,status,workspaceContext,goalFixture} from '/fixture.js';
window.data={...fixtureData,oauthWrite:true};window.metadata={...workspaceContext,documentName:'DEMO Document',elementName:'<b>DEMO current studio</b>'};
window.goalFixture=goalFixture;window.goals={ok:true,goal:goalFixture(),history:[]};window.mode='normal';window.calls=[];window.image=${JSON.stringify(image)};window.connection={canAdmin:true};
ui.activate({ui:{registerNavigation(){},registerPage(page){window.view=page.mount(document.querySelector('#app'),{signal:new AbortController().signal,host:{connection:window.connection,async request(method,args){
window.calls.push(args);
if(args.actionId==='work-context-status')return {ok:true,result:{ok:true,workContext:{selectionRevision:0,validity:'none',reason:null,selection:null,interlock:{blocked:false,code:null,goalId:null},observedAt:Date.now()}}};
if(args.actionId==='goal-status')return {ok:true,result:window.goals};
if(args.actionId==='goal-confirm'){window.goals={ok:true,goal:goalFixture('ACTIVE'),history:[]};return {ok:true,result:window.goals};}
if(args.actionId==='goal-stop'){window.goals={ok:true,goal:goalFixture('STOPPED'),history:[]};return {ok:true,result:window.goals};}
if(args.actionId==='goal-close'){window.goals={ok:true,goal:null,history:[goalFixture('CLOSED')]};return {ok:true,result:{ok:true,goal:goalFixture('CLOSED')}};}
if(args.actionId==='status')return {ok:true,result:status};
if(args.actionId==='workspace-context'){
  if(window.mode==='metadata-delay'){window.metadataPending=true;await new Promise(r=>window.releaseMetadata=r);}
  if(window.mode==='metadata-error')return {ok:true,result:{status:'unavailable',code:'onshape_unavailable'}};
  return {ok:true,result:window.metadata};}
if(args.actionId==='render'){
  if(window.mode==='render-delay'){window.renderPending=true;await new Promise(r=>window.releaseImage=r);}
  if(window.mode==='render-error')throw Error('synthetic image failure');
  return {ok:true,result:window.image};}
if(['mutation-approve','mutation-reconcile','candidate-prepare'].includes(args.actionId))return {ok:true,result:{status:'ok',message:'DEMONSTRATION · explicit action recorded in memory'}};
if(window.mode==='error')throw Error('synthetic status failure');
return {ok:true,result:window.mode==='empty'?{...window.data,proposals:[]}:window.data};
}}});}}});</script></html>`;
const csp =
  "default-src 'self'; script-src 'self' 'nonce-cockpit-fixture'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; object-src 'none'";
let browser;
try {
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [],
    rejectedRequests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No local server, sockets or real DNS requests: route every document/module request.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !['/', '/ui.js', '/fixture.js'].includes(url.pathname)) {
      rejectedRequests.push(url.origin + url.pathname);
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {'Content-Security-Policy': csp},
      contentType: url.pathname === '/' ? 'text/html' : 'text/javascript',
      body:
        url.pathname === '/'
          ? html
          : await readFile(
              url.pathname === '/ui.js' ? 'dist/control-ui/product/index.js' : 'tests/fixtures/cockpit.mjs',
              'utf8',
            ),
    });
  });
  await page.goto(origin);
  const nav = page.getByRole('navigation', {name: 'Arbeitsbereich'});
  await page.getByRole('heading', {name: 'Dein Engineering-Workspace', exact: true}).waitFor();
  await page.getByText('Wähle ein Bauteil für deine CAD-Aufgabe.', {exact: true}).waitFor();
  assert.deepEqual(await nav.getByRole('button').allTextContents(), ['Workspace', 'CAD', '3D Print']);
  assert.equal(await nav.getByRole('button', {name: 'Workspace', exact: true}).getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('#coc-connections').getAttribute('open'), null);
  assert.equal(await page.locator('#coc-operator-actions').getAttribute('open'), null);
  assert.deepEqual(
    (await page.evaluate(() => window.calls)).map((c) => c.actionId),
    ['status', 'mutation-status', 'workspace-context', 'goal-status', 'work-context-status'],
  );
  await mkdir(output, {recursive: true});
  const capture = async (name) => {
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({width, height});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits ${width}`);
      assert(await nav.isVisible(), 'navigation remains reachable');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({path: `${output}/goal-ui-${name}-${width}x${height}.png`});
      if (['confirm', 'active', 'completed'].includes(name)) {
        await page.screenshot({path: `${output}/goal-ui-${name}-${width}x${height}-full.png`, fullPage: true});
      }
    }
    await page.setViewportSize({width: 1440, height: 900});
  };
  await capture('workspace');
  await nav.getByRole('button', {name: 'CAD', exact: true}).focus();
  assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.coc-candidate').count(), 2, 'multiple payloads do not create Candidates');
  assert(await page.getByText(/Abstammung nicht belegt/).isVisible());
  assert(await page.getByText('Ziel wartet auf Bestätigung', {exact: true}).isVisible());
  assert.equal((await page.evaluate(() => window.calls)).filter((c) => c.actionId === 'render').length, 0);
  assert(await page.getByText('Part Studio: <b>DEMO current studio</b>', {exact: true}).isVisible());
  assert.equal(await page.locator('.coc img').count(), 0, 'metadata renders as text');
  await page.getByRole('button', {name: 'CAD-Ansicht laden / erneuern', exact: true}).click();
  await page.locator('figure img').waitFor();
  assert(await page.locator('figure img').evaluate((i) => i.complete && i.naturalWidth === 800));
  await capture('confirm');
  const goalPanel = page.locator('#coc-goal');
  const beforeConfirm = await page.evaluate(() => structuredClone(window.goals.goal));
  const confirm = goalPanel.getByRole('button', {name: 'Ziel bestätigen & Iteration erlauben', exact: true});
  assert(await confirm.isEnabled());
  assert(await goalPanel.getByText(beforeConfirm.goalHash, {exact: true}).isVisible());
  await page.keyboard.press('Tab');
  await confirm.focus();
  assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
  await page.keyboard.press('Enter');
  await goalPanel.getByText('Ziel freigegeben · Engineer arbeitet', {exact: true}).waitFor();
  assert.deepEqual((await page.evaluate(() => window.calls)).find((c) => c.actionId === 'goal-confirm').payload, {
    connectionRef: 'owner-rest',
    goalId: beforeConfirm.goalId,
    nonce: beforeConfirm.confirmation.nonce,
    expectedGoalHash: beforeConfirm.goalHash,
  });
  await capture('active');
  await page.evaluate(() => {
    window.goals = {ok: true, goal: window.goalFixture('COMPLETED'), history: []};
  });
  await page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  await goalPanel.getByText('✓ Ziel erreicht · geprüft', {exact: true}).waitFor();
  assert(await goalPanel.getByText('Prüfergebnisse', {exact: true}).isVisible());
  await capture('completed');
  const history = page.getByText('Payload-Vorschläge & technische Nachweise', {exact: true});
  await history.click();
  await page.getByLabel('Vorschlag auswählen').selectOption('fixture-VERIFIED');
  await page.getByText('Änderung durch Abgleich belegt', {exact: true}).waitFor();
  assert.equal(
    await page
      .locator('details')
      .filter({has: page.locator('#coc-evidence')})
      .getAttribute('open'),
    '',
    'F8: selection preserves the open evidence disclosure',
  );
  assert(await page.getByText('Änderung durch Abgleich belegt', {exact: true}).isVisible());
  assert(await page.getByText('✓ Ziel erreicht · geprüft', {exact: true}).isVisible());
  await capture('cad-payload-evidence');
  await page.evaluate(() => {
    window.mode = 'render-error';
  });
  await page.getByRole('button', {name: 'CAD-Ansicht laden / erneuern', exact: true}).click();
  await page.getByText(/Ansicht nicht verfügbar/).waitFor();
  assert(await page.getByText('Part Studio: <b>DEMO current studio</b>', {exact: true}).isVisible());
  await page.evaluate(() => {
    window.mode = 'metadata-error';
  });
  await page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  await page.getByText(/veraltet \/ Aktualisierung fehlgeschlagen/).waitFor();
  assert.equal(await page.locator('figure img').count(), 0);
  await page.evaluate(() => {
    window.mode = 'normal';
  });
  await page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  await page.getByText('Part Studio: <b>DEMO current studio</b>', {exact: true}).waitFor();
  await nav.getByRole('button', {name: '3D Print', exact: true}).click();
  assert(await page.getByRole('heading', {name: 'Druckvorschau · blockiert', exact: true}).isVisible());
  assert.equal(await page.locator('input[type=file]').count(), 0);
  await capture('print-blocked');
  // Retain the interim action regression coverage using in-memory responses only.
  const operators = page.locator('#coc-operator-actions');
  await operators.locator('summary').click();
  const card = (state) =>
    operators
      .locator('section')
      .filter({has: page.getByRole('heading', {name: new RegExp(`fixture-${state} — ${state}`)})});
  assert(await card('REJECTED').getByRole('button', {name: 'Approve this Candidate update', exact: true}).isDisabled());
  await card('PROPOSED').getByRole('button', {name: 'Approve this Candidate update', exact: true}).click();
  await page.waitForFunction(() => !document.querySelector('.coc select').disabled);
  await card('UNKNOWN').getByRole('button', {name: 'Reconcile execution outcome', exact: true}).click();
  await page.waitForFunction(() => !document.querySelector('.coc select').disabled);
  const calls = await page.evaluate(() => window.calls);
  assert.deepEqual(calls.find((c) => c.actionId === 'mutation-approve').payload, {
    connectionRef: 'owner-rest',
    proposalId: 'fixture-PROPOSED',
    expectedPayloadHash: '0'.repeat(64),
  });
  assert.deepEqual(calls.find((c) => c.actionId === 'mutation-reconcile').payload, {
    connectionRef: 'owner-rest',
    proposalId: 'fixture-UNKNOWN',
  });
  await page.evaluate(() => {
    window.data = {...window.data, target: {...window.data.target, workspaceId: window.data.target.primaryWorkspaceId}};
    window.metadata = {...window.metadata, target: window.data.target};
  });
  await page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  await operators.getByRole('button', {name: 'Candidate vorbereiten', exact: true}).click();
  assert(await operators.getByRole('button', {name: 'Candidate vorbereiten', exact: true}).isDisabled());
  assert.equal(await page.evaluate(() => window.calls.filter((c) => c.actionId === 'candidate-prepare').length), 1);
  await page.evaluate(() => {
    window.mode = 'empty';
  });
  await page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  await nav.getByRole('button', {name: 'CAD', exact: true}).click();
  await page.getByText('Noch kein Änderungsvorschlag vorhanden.', {exact: true}).waitFor();
  await page.evaluate(() => {
    window.mode = 'error';
  });
  await page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  await page.getByText(/Daten nicht verfügbar/).waitFor();
  assert.equal(await page.locator('.coc-candidate').count(), 0);
  assert.deepEqual(rejectedRequests, [], 'no unexpected remote requests');
  assert.deepEqual(errors, []);
  console.log(
    `Serverless Chromium fixture passed. Synthetic screenshots: ${output}/goal-ui-{workspace,confirm,active,completed,cad-payload-evidence,print-blocked}-{1440x900,1366x768,390x844}.png`,
  );
} finally {
  await browser?.close();
}

await runSelectionBrowser();
