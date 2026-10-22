// Offline consumer acceptance against contract fixtures read in place. No provider or gateway IO.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
// Independent user-visible outcomes from work-context.md §8, rather than assertions against UI helpers.
const expectedReasons = {
  selection_observation_stale: /Stand hat sich geändert/,
  selection_part_missing: /Bauteil nicht mehr vorhanden/,
  selection_part_unsupported: /Bauteilart nicht unterstützt/,
  part_kind_unsupported: /nur Volumenbauteile ohne Netz/,
  configuration_unsupported: /Konfiguriertes Part Studio nicht unterstützt/,
  element_not_provisioned: /Part Studio nicht für Ziele freigegeben/,
  selection_target_not_allowed: /Auswahl außerhalb der erlaubten Zuordnung/,
  selection_revision_conflict: /Eine andere Auswahl wurde übernommen/,
  preview_unavailable: /Vorschau nicht verfügbar/,
  invalid_arguments: /Auswahlanfrage ungültig/,
  authorization_changed: /Zugriff geändert/,
  live_reads_disabled: /Live-Lesen deaktiviert/,
  not_configured: /Keine Zuordnung eingerichtet/,
  provider_protocol_error: /Onshape-Antwort nicht lesbar/,
  goal_active_conflict: /Schließe zuerst das aktuelle Ziel ab/,
  mutation_reconciliation_required: /Unklaren Änderungs- oder Candidate-Ausgang zuerst abgleichen/,
  goal_state_invalid: /Arbeitsstatus nicht lesbar/,
  candidate_inspection_only: /Candidate · nur Ansicht/,
  revision_advanced: /Stand neuer als Auswahl/,
};
const workContextReason = (code) => {
  assert(expectedReasons[code], `Missing independent expectation: ${code}`);
  return expectedReasons[code];
};

export async function runSelectionBrowser() {
  const fixtures = {};
  for (const name of ['catalog', 'view-valid', 'view-invalid', 'view-none', 'adopt-request', 'error-codes']) {
    fixtures[name] = JSON.parse(await readFile(`docs/interface/work-context-fixtures/${name}.json`, 'utf8'));
  }
  const origin = 'https://selection-fixture.test';
  const output = 'docs/product/onshape-selection-2026-10-21/implementation';
  await mkdir(output, {recursive: true});
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>Bauteilauswahl · Offline fixture</title>
<style>body{margin:0;background:#090f17;color:#e3ebf4;font:14px system-ui}#demo{padding:8px 18px;color:#f2d399}#app{max-width:1800px;margin:auto}</style>
<div id="demo">DEMONSTRATION · synthetische Daten · kein Live-CAD-Nachweis</div><div id="app"></div>
<script type="module">
import ui from '/ui.js';import {data,status,workspaceContext,goalFixture} from '/fixture.js';
window.F=${JSON.stringify(fixtures)};
// Schematic per-Part PNGs prove response identity, never actual geometry.
window.pngs=Object.fromEntries(['JHD','JHH','JIF','JIG','JKD'].map((id,index)=>{
 const canvas=document.createElement('canvas');canvas.width=280;canvas.height=180;const c=canvas.getContext('2d');
 c.fillStyle='#0c1823';c.fillRect(0,0,280,180);c.strokeStyle=['#68dbd5','#d9ae70','#97cafa','#c3a5e5','#d78787'][index];c.lineWidth=3;
 c.beginPath();c.moveTo(50+index*4,55);c.lineTo(145,25);c.lineTo(220,65);c.lineTo(220,110);c.lineTo(125,140);c.lineTo(50+index*4,105);c.closePath();c.stroke();
 c.beginPath();c.ellipse(137+index*3,65,23,12,0,0,Math.PI*2);c.stroke();
 c.fillStyle='#e3ebf4';c.font='13px system-ui';c.fillText('SYNTHETISCH · '+id,60,164);
 return [id,canvas.toDataURL('image/png').split(',')[1]];
}));window.calls=[];window.pending=[];window.errors={};window.delay={};window.connection={canAdmin:true};
window.reset=()=>{
 window.catalog=structuredClone(F.catalog);window.view=structuredClone(F['view-none']);window.errors={};window.delay={};window.calls=[];window.goals={ok:true,goal:goalFixture(),history:[]};
 window.catalog.partStudios[0].truncated=true;
};window.reset();
window.gateway=async args=>{
 window.calls.push(structuredClone(args));let result;
 const action=args.actionId,p=args.payload;
 if(window.errors[action]){result={ok:false,code:window.errors[action],message:'Synthetic error'};}
 else if(action==='status')result=status;
 else if(action==='mutation-status')result=data;
 else if(action==='workspace-context')result=workspaceContext;
 else if(action==='goal-status')result=window.goals;
 else if(action==='work-context-status')result={ok:true,workContext:structuredClone(window.view)};
 else if(action==='work-context-catalog')result={ok:true,catalog:structuredClone(window.catalog)};
 else if(action==='work-context-preview')result={ok:true,preview:{mimeType:'image/png',dataBase64:window.pngs[p.partId],partId:p.partId,observedMicroversion:p.observedMicroversion}};
 else if(action==='work-context-adopt'){
  const studio=window.catalog.partStudios.find(s=>s.elementId===p.elementId),part=studio.parts.find(p2=>p2.partId===p.partId);
  window.view=structuredClone(F['view-valid']);window.view.selectionRevision=p.expectedSelectionRevision+1;
  Object.assign(window.view.selection,{partId:part.partId,partName:part.name,observedMicroversion:p.observedMicroversion,currentMicroversion:p.observedMicroversion});
  window.catalog.selectionRevision=window.view.selectionRevision;result={ok:true,workContext:structuredClone(window.view)};
 } else if(action==='work-context-clear'){
  window.view={...structuredClone(F['view-none']),selectionRevision:p.expectedSelectionRevision+1};result={ok:true,workContext:structuredClone(window.view)};
 } else throw Error('Unexpected method: '+action);
 if(window.delay[action]){
  const pending={action,payload:structuredClone(p),result};window.pending.push(pending);
  await new Promise(resolve=>pending.release=resolve);result=pending.result;
 }
 return {ok:true,result};
};
ui.activate({ui:{registerNavigation(){},registerPage(page){window.mounted=page.mount(document.querySelector('#app'),{signal:new AbortController().signal,host:{connection:window.connection,request(method,args){if(method!=='plugins.sessionAction')throw Error('Unexpected route');return window.gateway(args);}}});}}});
</script></html>`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
  });
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const pageErrors = [],
    rejected = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !['/', '/ui.js', '/fixture.js'].includes(url.pathname)) {
      rejected.push(url.href);
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
  const dialog = page.getByRole('dialog', {name: 'Arbeitskontext auswählen'});
  const card = page.locator('[data-work-context]');
  const change = () => card.getByRole('button', {name: 'Auswahl ändern', exact: true});
  const refresh = () => page.getByRole('button', {name: 'Aktualisieren', exact: true}).click();
  const part = (id) => dialog.getByRole('button').filter({hasText: new RegExp(` · ${id}(?: ·|$)`)});
  const ready = async () => {
    await change().waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-context-change]').disabled);
  };
  const open = async () => {
    await change().click();
    await dialog.getByText('Part Studio: Mount Plate', {exact: true}).waitFor();
  };
  const selected = async (id) => {
    await part(id).click();
    await dialog.getByRole('img', {name: new RegExp(` · ${id}$`)}).waitFor();
    await page.waitForFunction((id) => {
      const i = document.querySelector('dialog img');
      return i?.complete && i.naturalWidth === 280 && i.src === `data:image/png;base64,${window.pngs[id]}`;
    }, id);
  };
  const reset = async () => {
    await page.goto(origin);
    await ready();
  };
  const capture = async (name) => {
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({width, height});
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name}: page fits ${width}`,
      );
      if (await dialog.count()) {
        assert(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth), `${name}: dialog fits ${width}`);
        await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).scrollIntoViewIfNeeded();
        assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isVisible());
        await dialog.evaluate((d) => (d.scrollTop = 0));
      }
      await page.screenshot({path: `${output}/${name}-${width}x${height}.png`});
      if (await dialog.count()) {
        await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).scrollIntoViewIfNeeded();
        await page.screenshot({path: `${output}/${name}-${width}x${height}-review.png`});
      }
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
    assert.equal(await card.locator('img,select,input').count(), 0);
    await capture('01-before');
    await open();
    assert.equal(
      await dialog
        .getByRole('button', {name: 'Camera Mount · vorausgewählt', exact: true})
        .getAttribute('aria-pressed'),
      'true',
    );
    assert(await dialog.getByRole('button', {name: 'goal-candidate · Candidate', exact: true}).isDisabled());
    assert(await dialog.getByRole('button', {name: 'Main · geschützter Primary', exact: true}).isEnabled());
    assert(await part('JKD').isDisabled());
    assert(await part('JHH').isEnabled());
    assert.equal(await part('JHD').count(), 1);
    assert.equal(await part('JHH').count(), 1);
    for (const code of fixtures['error-codes'].viewReasons.filter(
      (c) => !['revision_advanced', 'configuration_unsupported'].includes(c),
    )) {
      assert(await dialog.getByText(workContextReason(code), {exact: true}).first().isVisible(), code);
    }
    assert.equal(await dialog.getByText('Bauteile nicht geladen.', {exact: true}).count(), 1);
    assert.equal(await dialog.getByText('Keine Bauteile in diesem Part Studio.', {exact: true}).count(), 0);
    assert(await dialog.getByText(/Liste gekürzt/).isVisible());
    assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
    for (const name of ['Dokument', 'Onshape-Workspace', 'Bauteil']) {
      const input = dialog.getByRole('searchbox', {name: `${name} durchsuchen`, exact: true});
      await input.fill('no-such-result');
      assert(
        await dialog
          .getByText(/Keine Suchtreffer/)
          .first()
          .isVisible(),
      );
      await input.fill('');
    }
    const search = dialog.getByRole('searchbox', {name: 'Bauteil durchsuchen', exact: true});
    await search.fill('Bracket');
    await search.evaluate((input) => input.setSelectionRange(2, 2));
    await page.keyboard.type('X');
    assert.equal(await search.inputValue(), 'BrXacket');
    assert.equal(await search.evaluate((input) => input.selectionStart), 3);
    await search.fill('');
    await selected('JIF');
    const previewCall = await page.evaluate(() => window.calls.find((c) => c.actionId === 'work-context-preview'));
    assert.deepEqual(previewCall.payload, {
      connectionRef: 'owner-rest',
      elementId: fixtures.catalog.partStudios[0].elementId,
      partId: 'JIF',
      observedMicroversion: fixtures.catalog.observedMicroversion,
    });
    assert.equal(
      await page.evaluate(
        () =>
          window.calls.filter((c) =>
            ['render', 'goal-confirm', 'candidate-prepare', 'mutation-approve'].includes(c.actionId),
          ).length,
      ),
      0,
    );
    await capture('02-dialog');
    // Native modal traps focus, has visible keyboard focus, and Escape discards.
    await dialog.getByRole('button', {name: 'Abbrechen', exact: true}).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Auswahl übernehmen');
    await page.keyboard.press('Tab');
    assert(await dialog.evaluate((d) => d.contains(document.activeElement)));
    assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert(await change().evaluate((n) => n === document.activeElement));
    assert(await card.getByText('Wähle ein Bauteil für deine CAD-Aufgabe.', {exact: true}).isVisible());
    await open();
    assert.equal(await part('JIF').getAttribute('aria-pressed'), 'false');
    await selected('JIF');
    await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).click();
    await dialog.waitFor({state: 'detached'});
    assert.deepEqual(
      await page.evaluate(() => window.calls.find((c) => c.actionId === 'work-context-adopt').payload),
      fixtures['adopt-request'].input ?? {
        connectionRef: 'owner-rest',
        ...Object.fromEntries(Object.entries(fixtures['adopt-request']).filter(([k]) => k !== '_comment')),
      },
    );
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    assert.equal(await card.locator('img,input,select').count(), 0);
    assert(await change().evaluate((n) => n === document.activeElement));
    await capture('03-adopted');
    const selectedLink = await card.getByRole('link', {name: 'Auswahl in Onshape öffnen ↗'}).getAttribute('href');
    assert.equal(selectedLink, fixtures['view-valid'].selection.onshapeUrl);
    await page
      .getByRole('navigation', {name: 'Arbeitsbereich'})
      .getByRole('button', {name: 'CAD', exact: true})
      .click();
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    await page
      .getByRole('navigation', {name: 'Arbeitsbereich'})
      .getByRole('button', {name: 'Workspace', exact: true})
      .click();
    for (const dismiss of ['Abbrechen', 'Schließen', 'Escape']) {
      await open();
      await dialog.getByRole('img').waitFor();
      assert.equal(await part('JIF').getAttribute('aria-pressed'), 'true');
      await selected('JIG');
      if (dismiss === 'Escape') {
        await page.keyboard.press('Escape');
      } else {
        await dialog.getByRole('button', {name: dismiss, exact: true}).click();
      }
      assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
      assert(await change().evaluate((n) => n === document.activeElement));
    }
    await refresh();
    await ready();
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    checks.push(
      'U1/U2/U6: bounds, search, null vs empty, hidden/same-name IDs, keyboard, explicit adopt, compact Workspace/CAD, restore and cancel/close/Escape',
    );
    // Empty and configured variants stay within the bound studio; null is never presented as an empty catalog.
    await reset();
    await page.evaluate(() => (window.catalog.partStudios[0].parts = []));
    await open();
    assert.equal(await dialog.getByText('Keine Bauteile in diesem Part Studio.', {exact: true}).count(), 1);
    assert.equal(await dialog.getByText('Bauteile nicht geladen.', {exact: true}).count(), 1);
    assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
    await capture('02-empty-studio');
    await reset();
    await page.evaluate(() =>
      Object.assign(window.catalog.partStudios[0], {
        goalEligible: false,
        reason: 'configuration_unsupported',
        parts: null,
      }),
    );
    await open();
    assert(await dialog.getByText(workContextReason('configuration_unsupported')).isVisible());
    assert.equal(await dialog.getByText('Bauteile nicht geladen.', {exact: true}).count(), 2);
    assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
    await capture('02-configured-studio');
    // Every new/reused code has a separately asserted outcome and preserves the record on failure.
    for (const code of [...fixtures['error-codes'].plugin, ...fixtures['error-codes'].reused]) {
      await reset();
      await open();
      await selected('JIF');
      if (code === 'preview_unavailable') {
        await page.evaluate((c) => (window.errors['work-context-preview'] = c), code);
        await part('JIG').click();
        await dialog.getByText(workContextReason(code), {exact: true}).waitFor();
        assert.equal(await dialog.getByRole('img').count(), 0);
        await capture('04-preview-unavailable');
        await page.evaluate(() => delete window.errors['work-context-preview']);
        await dialog.getByRole('button', {name: 'Vorschau erneut laden', exact: true}).click();
        await dialog.getByRole('img').waitFor();
      } else {
        await page.evaluate((c) => {
          window.errors['work-context-adopt'] = c;
          if (c === 'selection_revision_conflict') {
            window.view = structuredClone(window.F['view-valid']);
            window.view.selection.partId = 'JIG';
            window.view.selection.partName = 'Clamp right';
            window.view.selectionRevision = 7;
            window.catalog.selectionRevision = 7;
          }
          if (c === 'selection_observation_stale') {
            window.catalog.observedMicroversion = 'b'.repeat(24);
          }
          if (['goal_active_conflict', 'mutation_reconciliation_required', 'goal_state_invalid'].includes(c)) {
            window.view.interlock = {blocked: true, code: c, goalId: null};
          }
        }, code);
        await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).click();
        if (code === 'selection_revision_conflict') {
          await dialog.waitFor({state: 'detached'});
          assert(await card.getByRole('heading', {name: 'Clamp right', exact: true}).isVisible());
          assert(await card.getByText(/Gewinner geladen/).isVisible());
          assert(await card.getByText(/Auswahlrevision 7/).isVisible());
          await capture('05-revision-winner');
        } else {
          await dialog.getByText(workContextReason(code), {exact: true}).first().waitFor();
          await page.waitForFunction(
            () => !document.querySelector('[data-work-context]').textContent.includes('Auswahlstatus wird geprüft'),
          );
          assert.equal(await dialog.getByRole('img').count(), 0, code);
          assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled(), code);
          if (code === 'selection_observation_stale') {
            await dialog.getByText(/Katalogstand bbbbbbbb/).waitFor();
            assert.equal(await part('JIF').getAttribute('aria-pressed'), 'false');
            await selected('JIG');
            assert.equal(
              await page.evaluate(
                () =>
                  window.calls.filter((c) => c.actionId === 'work-context-preview').at(-1).payload.observedMicroversion,
              ),
              'b'.repeat(24),
            );
            await capture('06-stale-reviewed');
          }
        }
        assert.equal(
          await page.evaluate(() => window.calls.filter((c) => c.actionId === 'work-context-adopt').length),
          1,
          `${code}: no write retry`,
        );
        if (code !== 'selection_revision_conflict') {
          assert.equal(await page.evaluate(() => window.view.selection), null, `${code}: old record retained`);
        }
      }
      checks.push(`U3 ${code}: ${workContextReason(code)}`);
    }
    // Failed adoption keeps a non-empty confirmed record, including after a different draft.
    await reset();
    await page.evaluate(() => {
      window.view = structuredClone(window.F['view-valid']);
      window.catalog.selectionRevision = 1;
    });
    await refresh();
    await ready();
    await open();
    await selected('JIG');
    await page.evaluate(() => (window.errors['work-context-adopt'] = 'selection_target_not_allowed'));
    await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).click();
    await dialog.getByText(workContextReason('selection_target_not_allowed')).waitFor();
    assert.equal(await page.evaluate(() => window.view.selection.partId), 'JIF');
    await page.keyboard.press('Escape');
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    checks.push('U3 failed adoption preserves the existing non-empty confirmed record');
    // Catalog stale read retries once, then remains explicit. Reload recovery is a read, never adoption.
    await reset();
    await page.evaluate(() => (window.errors['work-context-catalog'] = 'selection_observation_stale'));
    await change().click();
    await dialog.getByText(workContextReason('selection_observation_stale'), {exact: true}).waitFor();
    await page.waitForFunction(() => window.calls.filter((c) => c.actionId === 'work-context-catalog').length === 2);
    assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
    await page.evaluate(() => delete window.errors['work-context-catalog']);
    await dialog.getByRole('button', {name: 'Katalog aktualisieren', exact: true}).click();
    await part('JIF').waitFor();
    checks.push('U3 stale catalog retries once; explicit catalog recovery');
    // Views alone drive invalidity/interlock, irrespective of the unrelated goal-status fixture.
    for (const code of ['goal_active_conflict', 'mutation_reconciliation_required', 'goal_state_invalid']) {
      await reset();
      await page.evaluate((c) => {
        window.view = structuredClone(window.F['view-invalid']);
        window.view.interlock.code = c;
        window.goals = {ok: true, goal: null, history: []};
      }, code);
      await refresh();
      await card.getByText(workContextReason(code), {exact: true}).waitFor();
      assert(await change().isDisabled());
      assert.equal(await card.locator('img').count(), 0);
      await capture(`07-interlock-${code}`);
      await card.getByRole('button', {name: 'Zum Zielbereich', exact: true}).click();
      assert(await page.locator('#coc-goal').evaluate((n) => n === document.activeElement));
    }
    for (const [validity, reason] of [
      ['invalid', 'selection_part_missing'],
      ['invalid', 'selection_part_unsupported'],
      ['invalid', 'configuration_unsupported'],
      ['unverified', 'authorization_changed'],
      ['unverified', 'live_reads_disabled'],
      ['unverified', 'provider_protocol_error'],
      ['valid', 'revision_advanced'],
    ]) {
      await reset();
      await open();
      await selected('JIF');
      await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).click();
      await dialog.waitFor({state: 'detached'});
      await page.evaluate(
        ({validity, reason}) => {
          window.view.validity = validity;
          window.view.reason = reason;
          window.view.selection.currentMicroversion = 'b'.repeat(24);
          window.catalog.observedMicroversion = 'b'.repeat(24);
        },
        {validity, reason},
      );
      await refresh();
      await card.getByText(workContextReason(reason), {exact: true}).waitFor();
      assert.equal(await page.locator('img').count(), 0);
      assert(await change().isEnabled());
      if (validity !== 'valid') {
        await capture(`08-${validity}-${reason}`);
        await open();
        assert.equal(await dialog.getByRole('img').count(), 0);
        assert.equal(await part('JIF').getAttribute('aria-pressed'), 'false');
      } else {
        await capture('09-revision-advanced');
      }
      checks.push(`U4 ${validity}/${reason}: view reason, no cached image, interlock independent`);
    }
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
    await goal.getByRole('heading', {name: 'Bauteil-Fokus: <b>Clamp left</b>', exact: true}).waitFor();
    assert(await goal.getByText(/Ziel- und Erhaltungsbedingungen bleiben featurebasiert/).isVisible());
    assert.equal(await goal.locator('b').count(), 0);
    assert(
      await goal.evaluate((n) => {
        const heading = [...n.querySelectorAll('h3')].find((n) => n.textContent.startsWith('Bauteil-Fokus'));
        const confirm = [...n.querySelectorAll('button')].find(
          (n) => n.textContent === 'Ziel bestätigen & Iteration erlauben',
        );
        return !!(heading.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
    );
    await capture('10-goal-focus');
    checks.push('U5 target.focus literal name, exact Part Studio element, feature-condition limit before confirmation');
    // Async preview race: release newer first, then older; response identity includes microversion and Part.
    await reset();
    await open();
    await page.evaluate(() => (window.delay['work-context-preview'] = true));
    await part('JHD').click();
    await part('JHH').click();
    await page.waitForFunction(() => window.pending.length === 2);
    await page.evaluate(() => window.pending[1].release());
    await dialog.getByRole('img', {name: / · JHH$/}).waitFor();
    assert.equal(
      await dialog.getByRole('img').getAttribute('src'),
      await page.evaluate(() => `data:image/png;base64,${window.pngs.JHH}`),
    );
    await page.evaluate(() => window.pending[0].release());
    await page.waitForTimeout(30);
    assert.equal(await dialog.getByRole('img', {name: / · JHD$/}).count(), 0);
    for (const wrong of ['microversion', 'part']) {
      await part('JIG').click();
      await page.waitForFunction(() => window.pending.length >= 3);
      await page.evaluate((w) => {
        const p = window.pending.at(-1);
        if (w === 'microversion') {
          p.result.preview.observedMicroversion = 'b'.repeat(24);
        } else {
          p.result.preview.partId = 'JIF';
        }
        p.release();
      }, wrong);
      await dialog.getByText(workContextReason('preview_unavailable'), {exact: true}).waitFor();
      assert.equal(await dialog.getByRole('img').count(), 0);
    }
    await capture('11-wrong-preview-reply');
    await dialog.getByRole('button', {name: 'Abbrechen', exact: true}).click();
    // Provider/authorization errors on preview invalidate the draft, unlike a simple unavailable image.
    for (const code of ['authorization_changed', 'selection_part_missing', 'selection_observation_stale']) {
      await reset();
      await open();
      await page.evaluate((c) => {
        window.errors['work-context-preview'] = c;
        if (c === 'selection_observation_stale') {
          window.catalog.observedMicroversion = 'b'.repeat(24);
        }
      }, code);
      await part('JIF').click();
      await dialog.getByText(workContextReason(code)).first().waitFor();
      assert.equal(await dialog.getByRole('img').count(), 0);
      assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
      if (code === 'selection_observation_stale') {
        await dialog.getByText(/Katalogstand bbbbbbbb/).waitFor();
      }
    }
    // Dismissal cannot promise rollback after adoption was already dispatched.
    await reset();
    await open();
    await selected('JIF');
    await page.evaluate(() => (window.delay['work-context-adopt'] = true));
    await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).click();
    await page.waitForFunction(() => window.pending.length === 1);
    assert(await dialog.getByRole('button', {name: 'Abbrechen', exact: true}).isDisabled());
    assert(await dialog.getByRole('button', {name: 'Schließen', exact: true}).isDisabled());
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 1);
    await page.evaluate(() => window.pending[0].release());
    await dialog.waitFor({state: 'detached'});
    assert(await card.getByRole('heading', {name: 'Clamp left', exact: true}).isVisible());
    checks.push(
      'U3/U6 preview access/membership/stale errors invalidate draft; pending adopt blocks dismissal and closes on success',
    );
    // Pending preview cannot survive cancel, refresh, invalid status or disposal.
    for (const action of ['cancel', 'refresh', 'dispose']) {
      await reset();
      await open();
      await page.evaluate(() => (window.delay['work-context-preview'] = true));
      await part('JIF').click();
      await page.waitForFunction(() => window.pending.length === 1);
      if (action === 'cancel') {
        await page.keyboard.press('Escape');
      } else if (action === 'refresh') {
        await page.evaluate(() => document.querySelector('.coc-main>.coc-controls button').click());
      } else {
        await page.evaluate(() => window.mounted.dispose());
      }
      await page.evaluate(() => window.pending[0].release());
      await page.waitForTimeout(30);
      assert.equal(await page.locator('img').count(), 0);
    }
    // Catalog late reply across cancel/reopen, and a newest reply with the wrong current microversion.
    await reset();
    await page.evaluate(() => (window.delay['work-context-catalog'] = true));
    await change().click();
    await page.waitForFunction(() => window.pending.length === 1);
    await page.keyboard.press('Escape');
    await change().click();
    await page.waitForFunction(() => window.pending.length === 2);
    await page.evaluate(() => {
      window.pending[1].release();
      window.pending[0].result.catalog.document.name = 'OLD CATALOG';
      window.pending[0].release();
    });
    await part('JIF').waitFor();
    assert.equal(await dialog.getByText(/OLD CATALOG/).count(), 0);
    await reset();
    await page.evaluate(() => {
      window.view = structuredClone(window.F['view-valid']);
      window.catalog.selectionRevision = 1;
      window.delay['work-context-catalog'] = true;
    });
    await refresh();
    await ready();
    await change().click();
    await page.waitForFunction(() => window.pending.length === 1);
    await page.evaluate(() => {
      window.pending[0].result.catalog.observedMicroversion = 'b'.repeat(24);
      window.pending[0].release();
    });
    await dialog.getByText(workContextReason('selection_observation_stale'), {exact: true}).waitFor();
    assert.equal(await part('JIF').count(), 0);
    assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
    checks.push(
      'U3/U6 async: newer preview wins; wrong Part/microversion suppressed; cancel/refresh/dispose fences; old catalog discarded; wrong catalog microversion blocked',
    );
    // Read-only operator can inspect but cannot adopt, and status failure clears previous trusted projection.
    await reset();
    await page.evaluate(() => (window.connection.canAdmin = false));
    await open();
    await selected('JIF');
    assert(await dialog.getByRole('button', {name: 'Auswahl übernehmen', exact: true}).isDisabled());
    await reset();
    await page.evaluate(() => {
      window.view = structuredClone(window.F['view-valid']);
      window.errors['work-context-status'] = 'authorization_changed';
    });
    await refresh();
    await card.getByText(workContextReason('authorization_changed'), {exact: true}).waitFor();
    assert(await change().isDisabled());
    assert.equal(await card.getByRole('heading', {name: 'Clamp left', exact: true}).count(), 0);
    checks.push('U4 status failure clears trusted selection; read-only operator cannot adopt');
    // Exercise the whole adoption/cancel/keyboard journey at every required viewport, not only screenshots.
    for (const [width, height] of [
      [1440, 900],
      [1366, 768],
      [390, 844],
    ]) {
      await page.setViewportSize({width, height});
      await reset();
      await open();
      await selected('JIG');
      const dismiss = dialog.getByRole('button', {name: 'Schließen', exact: true});
      await dismiss.focus();
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Auswahl übernehmen');
      await page.keyboard.press('Enter');
      await dialog.waitFor({state: 'detached'});
      assert(await card.getByRole('heading', {name: 'Clamp right', exact: true}).isVisible());
      assert(await change().evaluate((n) => n === document.activeElement));
      await open();
      assert.equal(await part('JIG').getAttribute('aria-pressed'), 'true');
      await selected('JIF');
      await page.keyboard.press('Escape');
      assert(await card.getByRole('heading', {name: 'Clamp right', exact: true}).isVisible());
      assert(await change().evaluate((n) => n === document.activeElement));
    }
    checks.push(
      'U1/U2/U6 full choose/adopt/compact/reopen/cancel journey and backward focus wrapping at all three required viewports',
    );
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(rejected, []);
    console.log(`Selector browser acceptance passed (${checks.length} checks). Screenshots: ${output}`);
    for (const check of checks) {
      console.log(`  ${check}`);
    }
    return checks;
  } finally {
    await browser.close();
  }
}
