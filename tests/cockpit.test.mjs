import test from 'node:test';
import assert from 'node:assert/strict';
import ui, {candidateChoices, proposalState, cadLink} from '../ui/control-ui.js';
import {target, data, status, proposal, workspaceContext, goalFixture} from './fixtures/cockpit.mjs';
import {pngFixture} from './fixtures/png.mjs';
import {imageHash} from '../dist/render.js';

class Element {
  constructor(tag) {
    this.tag = tag;
  }
  children = [];
  attrs = {};
  value = '';
  textContent = '';
  append(...items) {
    this.children.push(...items);
  }
  replaceChildren(...items) {
    this.children = items;
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  removeAttribute(k) {
    delete this.attrs[k];
  }
  remove() {}
}
const nodes = (e) => [e, ...e.children.flatMap(nodes)];
const tick = () => new Promise((r) => setImmediate(r));
async function mounted(
  run,
  {
    canAdmin = true,
    initial = data,
    actionResponse = status,
    destination = 'cad',
    goalResponse = {ok: true, goal: null, history: []},
  } = {},
) {
  const original = globalThis.document;
  globalThis.document = {createElement: (tag) => new Element(tag)};
  let page, view;
  ui.activate({
    ui: {
      registerNavigation() {},
      registerPage(p) {
        page = p;
      },
    },
  });
  try {
    const container = new Element(),
      requests = [];
    let response = initial,
      contextResponse = workspaceContext,
      statusResponse = status,
      goals = goalResponse;
    view = page.mount(container, {
      signal: {aborted: false},
      host: {
        connection: {canAdmin},
        async request(_method, args) {
          requests.push(args);
          return {
            ok: true,
            result:
              args.actionId === 'mutation-status'
                ? await response
                : args.actionId === 'status'
                  ? statusResponse
                  : args.actionId === 'goal-status'
                    ? await goals
                    : args.actionId === 'workspace-context'
                      ? await contextResponse
                      : await (typeof actionResponse === 'function' ? actionResponse(args) : actionResponse),
          };
        },
      },
    });
    await tick();
    if (destination === 'cad') {
      nodes(container)
        .find((e) => e.attrs['data-view'] === 'cad')
        .onclick();
    }
    await run({
      container,
      requests,
      setGoals(value) {
        goals = value;
      },
      setContext(value) {
        contextResponse = value;
      },
      setStatus(value) {
        statusResponse = value;
      },
      setResponse(value) {
        response = value;
      },
      all: () => nodes(container),
      text: () =>
        nodes(container)
          .map((e) => e.textContent)
          .join('\n'),
      dispose: () => view.dispose(),
    });
  } finally {
    view?.dispose();
    globalThis.document = original;
  }
}
test('approval, execution and narrow verification stay separate, including expired UNKNOWN', () => {
  const unknown = proposalState(proposal('UNKNOWN', {approvedAt: '2026-10-20T10:00:00Z', expiresAt: 1}));
  assert.match(unknown.approval, /abgelaufen/);
  assert.equal(unknown.execution, 'Nicht belegt');
  assert.match(unknown.next, /Nicht erneut/);
  assert.equal(proposalState(proposal('VERIFIED')).verified, false);
  assert.equal(proposalState(data.proposals[2]).verified, true);
  assert.match(proposalState(data.proposals[3]).execution, /Nicht ausgeführt/);
});
test('only assigned candidates are selectable; links reject malformed or foreign URLs', () => {
  assert.equal(
    candidateChoices({...data, proposals: [...data.proposals, proposal('PROPOSED', {workspaceId: '9'.repeat(24)})]})[0]
      .proposals.length,
    4,
  );
  assert.equal(candidateChoices({}).length, 0);
  assert.equal(cadLink({...target, documentId: 'javascript:alert(1)'}), undefined);
  const revision = '1'.repeat(24);
  assert.equal(
    cadLink(target, revision),
    `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}/m/${revision}/e/${target.elementId}`,
  );
  assert.equal(
    cadLink(target),
    `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}/e/${target.elementId}`,
  );
  assert.equal(cadLink({...target, workspaceId: undefined}, revision), undefined);
  assert.equal(cadLink(target, 'bad-revision'), undefined);
  const primary = {...target, workspaceId: target.primaryWorkspaceId};
  assert.equal(
    cadLink(primary, revision),
    `https://cad.onshape.com/documents/${target.documentId}/w/${target.primaryWorkspaceId}/m/${revision}/e/${target.elementId}`,
  );
});
test('native page auto-loads read-only data, selects Primary and proposals consistently', async () => {
  await mounted(async ({all, text, requests}) => {
    assert.deepEqual(
      requests.map((r) => r.actionId),
      ['status', 'mutation-status', 'workspace-context', 'goal-status'],
    );
    assert.match(text(), /Engineering Cockpit/);
    assert.equal(all().find((e) => e.id === 'coc-operator-actions').open, undefined);
    const proposals = all().find((e) => e.attrs['aria-label'] === 'Vorschlag auswählen');
    proposals.value = 'fixture-UNKNOWN';
    proposals.onchange();
    assert.match(text(), /Ausgang über Engineer/);
    const primary = all().find(
      (e) => e.attrs['aria-pressed'] === 'false' && e.children.some((c) => c.textContent === 'Primary · geschützt'),
    );
    primary.onclick();
    assert.match(text(), /Kein gespeicherter Auftrag/);
    assert.equal(requests.length, 4);
  });
});
test('refresh clears old cards on error; late response after dispose cannot render', async () => {
  await mounted(async ({all, text, setResponse, dispose}) => {
    setResponse({code: 'authorization_changed'});
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert.match(text(), /keine alten Candidates/);
    assert(!text().includes('DEMO-Auftrag'));
    let resolve;
    setResponse(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const refreshing = all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    await tick();
    dispose();
    resolve(data);
    await refreshing;
    assert(!text().includes('DEMO-Auftrag'));
  });
});
test('read/write consent remains an explicit connection action', async () => {
  await mounted(async ({all, requests}) => {
    await all()
      .find((e) => e.textContent === 'Lese-/Schreibzugriff verbinden')
      .onclick();
    assert(requests.some((r) => r.actionId === 'connect' && r.payload.requestRestWriteAccess === true));
    assert(
      requests.every((r) =>
        ['status', 'mutation-status', 'workspace-context', 'goal-status', 'connect'].includes(r.actionId),
      ),
    );
  });
});

const operatorCards = (all) =>
  all()
    .find((e) => e.id === 'coc-operator-actions')
    .children.at(-1)
    .children.filter((e) => e.tag === 'section');
const actionButton = (card, name) => nodes(card).find((e) => e.textContent === name);
test('operator section is collapsed; exact payload precedes approval; no actions or render on load', async () => {
  await mounted(async ({all, requests}) => {
    const section = all().find((e) => e.id === 'coc-operator-actions');
    assert.equal(section.tag, 'details');
    assert(!section.open);
    const card = operatorCards(all)[0];
    const review = JSON.parse(card.children[2].textContent);
    assert.deepEqual(review, {
      target: {documentId: target.documentId, workspaceId: target.workspaceId, elementId: target.elementId},
      sourceMicroversion: data.proposals[0].sourceMicroversion,
      payloadHash: data.proposals[0].payloadHash,
      body: data.proposals[0].body,
    });
    assert.equal(card.children[2].tag, 'pre');
    assert.equal(card.children[3].children[0].textContent, 'Approve this Candidate update');
    assert.deepEqual(
      requests.map((r) => r.actionId),
      ['status', 'mutation-status', 'workspace-context', 'goal-status'],
    );
  });
});
test('operator enablement covers status, OAuth write and missing or unknown admin; terminal reasons remain', async () => {
  for (const canAdmin of [true, false, undefined]) {
    for (const oauthWrite of [true, false, undefined]) {
      const proposals = ['PROPOSED', 'UNKNOWN', 'REJECTED', 'VERIFIED', 'FAILED', 'APPROVED'].map((s) =>
        proposal(s, {
          reason: s === 'REJECTED' ? 'approval_expired_not_dispatched' : undefined,
        }),
      );
      await mounted(
        async ({all, text}) => {
          for (const [i, card] of operatorCards(all).entries()) {
            assert.equal(
              actionButton(card, 'Approve this Candidate update').disabled,
              !(canAdmin === true && oauthWrite === true && proposals[i].status === 'PROPOSED'),
            );
            assert.equal(
              actionButton(card, 'Reconcile execution outcome').disabled,
              !(canAdmin === true && proposals[i].status === 'UNKNOWN'),
            );
          }
          assert.match(text(), /fixture-REJECTED — REJECTED \(approval_expired_not_dispatched\)/);
        },
        {canAdmin: canAdmin ?? null, initial: {...data, oauthWrite, proposals}},
      );
    }
  }
});
test('explicit approval sends reviewed hash once, locks while pending and refreshes status', async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  await mounted(
    async ({all, requests}) => {
      const approve = actionButton(operatorCards(all)[0], 'Approve this Candidate update');
      const click = approve.onclick();
      await approve.onclick();
      assert(operatorCards(all).every((c) => actionButton(c, 'Approve this Candidate update').disabled));
      assert.equal(requests.filter((r) => r.actionId === 'mutation-approve').length, 1);
      assert.deepEqual(requests.at(-1).payload, {
        connectionRef: 'owner-rest',
        proposalId: 'fixture-PROPOSED',
        expectedPayloadHash: data.proposals[0].payloadHash,
      });
      resolve({status: 'approved'});
      await click;
      assert.equal(requests.filter((r) => r.actionId === 'mutation-status').length, 2);
    },
    {initial: {...data, oauthWrite: true}, actionResponse: pending},
  );
});
test('UNKNOWN reconcile sends only proposal identity and refreshes even on failure, without retry', async () => {
  await mounted(
    async ({all, requests, text}) => {
      await actionButton(operatorCards(all)[1], 'Reconcile execution outcome').onclick();
      assert.deepEqual(requests.find((r) => r.actionId === 'mutation-reconcile').payload, {
        connectionRef: 'owner-rest',
        proposalId: 'fixture-UNKNOWN',
      });
      assert.equal(requests.filter((r) => r.actionId === 'mutation-reconcile').length, 1);
      assert.equal(requests.filter((r) => r.actionId === 'mutation-status').length, 2);
      assert.match(text(), /Aktion fehlgeschlagen/);
    },
    {
      actionResponse: () => {
        throw Error('fixture');
      },
    },
  );
});
test('Candidate preparation is gated to Primary and OAuth write; one attempt per explicit click, no retry', async () => {
  for (const primary of [true, false]) {
    for (const oauthWrite of [true, false]) {
      await mounted(
        async ({all, requests, text}) => {
          const prepare = all().find((e) => e.textContent === 'Candidate vorbereiten');
          assert.equal(prepare.disabled, !(primary && oauthWrite));
          await prepare.onclick();
          await prepare.onclick();
          assert.equal(
            requests.filter((r) => r.actionId === 'candidate-prepare').length,
            primary && oauthWrite ? 1 : 0,
          );
          if (primary && oauthWrite) {
            assert.match(text(), /Aktion fehlgeschlagen/);
            assert.equal(all().find((e) => e.textContent === 'Candidate vorbereiten').disabled, true);
          }
        },
        {
          initial: {
            ...data,
            target: {...target, workspaceId: primary ? target.primaryWorkspaceId : target.workspaceId},
            oauthWrite,
          },
          actionResponse: () => {
            throw Error('fixture');
          },
        },
      );
    }
  }
});
test('old operator controls cannot dispatch after refresh, target change or disposal', async () => {
  await mounted(
    async ({all, requests, setResponse, dispose}) => {
      const approve = actionButton(operatorCards(all)[0], 'Approve this Candidate update');
      setResponse({...data, target: {...target, workspaceId: '9'.repeat(24)}});
      await all()
        .find((e) => e.textContent === 'Aktualisieren')
        .onclick();
      await approve.onclick();
      const reconcile = actionButton(operatorCards(all)[1], 'Reconcile execution outcome');
      dispose();
      await reconcile.onclick();
      assert(
        !requests.some((r) => ['mutation-approve', 'mutation-reconcile', 'candidate-prepare'].includes(r.actionId)),
      );
    },
    {initial: {...data, oauthWrite: true}},
  );
});

test('admin absence prevents handler dispatch; successful Candidate response is shown and old attempts stay fenced', async () => {
  await mounted(
    async ({all, requests}) => {
      await actionButton(operatorCards(all)[0], 'Approve this Candidate update').onclick();
      await actionButton(operatorCards(all)[1], 'Reconcile execution outcome').onclick();
      await all()
        .find((e) => e.textContent === 'Candidate vorbereiten')
        .onclick();
      assert.deepEqual(
        requests.map((r) => r.actionId),
        ['status', 'mutation-status', 'workspace-context', 'goal-status'],
      );
    },
    {canAdmin: false, initial: {...data, oauthWrite: true}},
  );
  await mounted(
    async ({all, text, requests}) => {
      const prepare = all().find((e) => e.textContent === 'Candidate vorbereiten');
      await prepare.onclick();
      assert.match(text(), /fixture preparation result/);
      await prepare.onclick();
      assert.equal(requests.filter((r) => r.actionId === 'candidate-prepare').length, 1);
      assert.deepEqual(requests.at(-1).payload, {connectionRef: 'owner-rest'});
    },
    {
      initial: {...data, oauthWrite: true, target: {...target, workspaceId: target.primaryWorkspaceId}},
      actionResponse: {status: 'ok', message: 'fixture preparation result'},
    },
  );
});

test('three real destinations start on Workspace, keep technical sections closed and never invent project or print controls', async () => {
  await mounted(
    async ({all, text, requests}) => {
      const nav = all().filter((e) => e.attrs['data-view']);
      assert.deepEqual(
        nav.map((e) => e.textContent),
        ['Workspace', 'CAD', '3D Print'],
      );
      assert.equal(nav[0].attrs['aria-current'], 'page');
      assert.match(text(), /DEMO Document/);
      assert(!text().includes('pib /'));
      assert(!all().find((e) => e.id === 'coc-connections').open);
      assert(!all().find((e) => e.id === 'coc-operator-actions').open);
      nav[1].onclick();
      assert.equal(nav[1].attrs['aria-current'], 'page');
      assert.match(text(), /Versionen & Branches/);
      assert.match(text(), /Abstammung nicht belegt/);
      assert.equal(all().filter((e) => e.className === 'coc-candidate').length, 2);
      assert.match(text(), /Payload-Vorschläge sind keine Zielautorisierung/);
      nav[2].onclick();
      assert.equal(nav[2].attrs['aria-current'], 'page');
      assert.match(text(), /Druckvorschau · blockiert/);
      assert.match(text(), /Menge, Zeit und Materialbedarf sind nicht belegt/);
      assert(!all().some((e) => e.tag === 'input'));
      assert.deepEqual(
        requests.map((r) => r.actionId),
        ['status', 'mutation-status', 'workspace-context', 'goal-status'],
      );
      nav[0].onclick();
      assert.match(text(), /Dein Engineering-Workspace/);
    },
    {destination: 'workspace'},
  );
});
test('current labels are independent of PNG success, failure and refresh; metadata failure is marked stale', async () => {
  await mounted(async ({all, text, setContext, requests}) => {
    assert.match(text(), /Part Studio: DEMO current studio/);
    await all()
      .find((e) => e.textContent === 'CAD-Ansicht laden / erneuern')
      .onclick();
    assert.match(text(), /Ansicht nicht verfügbar/);
    assert.match(text(), /Part Studio: DEMO current studio/);
    setContext({status: 'unavailable', code: 'onshape_unavailable'});
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert.match(text(), /DEMO Candidate/);
    assert.match(text(), /veraltet \/ Aktualisierung fehlgeschlagen/);
    assert(!all().some((e) => e.tag === 'img'));
    setContext({...workspaceContext, documentName: 'Updated document', elementName: 'Updated studio'});
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert.match(text(), /Updated document/);
    assert.match(text(), /Part Studio: Updated studio/);
    assert.equal(requests.filter((r) => r.actionId === 'render').length, 1);
    assert(!requests.some((r) => ['mutation-approve', 'mutation-reconcile', 'candidate-prepare'].includes(r.actionId)));
  });
});
test('metadata refresh invalidates names on target, connection and authorization changes; late old responses cannot return', async () => {
  await mounted(async ({all, text, setContext, setResponse, setStatus}) => {
    let resolve;
    setContext(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const old = all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    await tick();
    const changed = {...target, workspaceId: '9'.repeat(24)};
    setResponse({...data, target: changed});
    setContext({...workspaceContext, target: changed, workspaceName: 'New target'});
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    resolve(workspaceContext);
    await old;
    assert.match(text(), /New target/);
    assert(!text().includes('DEMO Candidate'));
    setContext({status: 'unavailable', code: 'authorization_changed'});
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert(!text().includes('New target'));
    assert(!text().includes('DEMO Document'));
    setStatus({...status, code: 'disconnected'});
    setContext(workspaceContext);
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert(!text().includes('DEMO Document'));
  });
});
test('metadata rejects swapped response identity and unsafe labels, keeps primary element name separate, and ignores late disposal', async () => {
  await mounted(async ({all, text, setContext, dispose}) => {
    setContext({
      ...workspaceContext,
      documentName: 'bad\nname',
      elementName: 'X'.repeat(257),
      workspaceName: '<b>Current</b>',
    });
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert.match(text(), /<b>Current<\/b>/);
    assert(!text().includes('bad\nname'));
    assert(!text().includes('X'.repeat(257)));
    const primary = all().find((e) => e.attrs['data-workspace'] === target.primaryWorkspaceId);
    primary.onclick();
    assert(!text().includes('Part Studio: DEMO current studio'));
    setContext({...workspaceContext, connectionRef: 'foreign'});
    await all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    assert(!text().includes('DEMO Document'));
    let resolve;
    setContext(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = all()
      .find((e) => e.textContent === 'Aktualisieren')
      .onclick();
    await tick();
    dispose();
    resolve(workspaceContext);
    await pending;
    assert(!text().includes('DEMO Document'));
  });
});

test('validated PNG and current names stay separate through image decoder failure, corrupt hash and a late target switch', async () => {
  const png = pngFixture();
  const result = {
    status: 'ok',
    ...target,
    documentName: 'PNG label must not replace current names',
    microversionId: '1'.repeat(24),
    revisionUrl: cadLink(target, '1'.repeat(24)),
    width: 800,
    height: 800,
    bytes: png.length,
    sha256: imageHash(png),
    renderedAt: new Date().toISOString(),
    pngBase64Chunks: [png.toString('base64')],
  };
  let imageResult = result;
  await mounted(
    async ({all, text, setResponse, setContext}) => {
      await all()
        .find((e) => e.textContent === 'CAD-Ansicht laden / erneuern')
        .onclick();
      const image = all().find((e) => e.tag === 'img');
      assert(image);
      assert.match(text(), /DEMO Document/);
      assert(!text().includes('PNG label must not replace current names'));
      image.onerror();
      assert(!all().some((e) => e.tag === 'img'));
      assert.match(text(), /DEMO current studio/);
      imageResult = {...result, sha256: '0'.repeat(64)};
      await all()
        .find((e) => e.textContent === 'CAD-Ansicht laden / erneuern')
        .onclick();
      assert(!all().some((e) => e.tag === 'img'));
      assert.match(text(), /DEMO current studio/);
      let resolve;
      imageResult = new Promise((r) => {
        resolve = r;
      });
      const pending = all()
        .find((e) => e.textContent === 'CAD-Ansicht laden / erneuern')
        .onclick();
      await tick();
      const changed = {...target, workspaceId: '9'.repeat(24)};
      setResponse({...data, target: changed});
      setContext({...workspaceContext, target: changed, workspaceName: 'Other target'});
      await all()
        .find((e) => e.textContent === 'Aktualisieren')
        .onclick();
      resolve(result);
      await pending;
      assert(!all().some((e) => e.tag === 'img'));
      assert.match(text(), /Other target/);
      assert(!text().includes(`CAD-Stand ${result.microversionId}`));
    },
    {actionResponse: () => imageResult},
  );
});

const goalNodes = (all) => nodes(all().find((e) => e.id === 'coc-goal'));
const goalText = (all) =>
  goalNodes(all)
    .map((e) => e.textContent)
    .join('\n');
const goalButton = (all, name) => goalNodes(all).find((e) => e.tag === 'button' && e.textContent === name);
const confirmedLabel = 'Ziel bestätigen & Iteration erlauben';
const goalResponse = (goal, history = []) => ({ok: true, goal, history});

test('F8 selecting VERIFIED keeps payload history open and exposes execution evidence after rerender', async () => {
  await mounted(async ({all}) => {
    const history = all().find(
      (e) => e.tag === 'details' && e.children[0]?.textContent === 'Payload-Vorschläge & technische Nachweise',
    );
    assert(!history.open);
    history.open = true;
    history.ontoggle?.();
    const selection = all().find((e) => e.attrs['aria-label'] === 'Vorschlag auswählen');
    selection.value = 'fixture-VERIFIED';
    selection.onchange();
    const rendered = all().find(
      (e) => e.tag === 'details' && e.children[0]?.textContent === 'Payload-Vorschläge & technische Nachweise',
    );
    assert.equal(rendered.open, true, 'selected proof stays visible, not merely present in a collapsed subtree');
    assert(nodes(rendered).some((e) => e.textContent === 'Änderung durch Abgleich belegt'));
  });
});

test('U2 full goal review precedes exact confirmation; one pending click means one attempt', async () => {
  const goal = goalFixture();
  let resolve;
  await mounted(
    async ({all, requests, setGoals}) => {
      const text = goalText(all);
      for (const value of [
        goal.goalText,
        goal.goalHash,
        ...Object.values(goal.target).filter(Boolean),
        ...goal.scope.featureIds,
        ...goal.scope.operations,
        '10',
        '120 Minuten',
        ...goal.goalConditions.map((c) => c.text),
        ...goal.preservationConditions.map((c) => c.text),
      ]) {
        assert(text.includes(value), `review contains ${value}`);
      }
      assert.match(text, /Neuer Candidate aus Primary/);
      assert.match(text, /Bestätigung gültig bis/);
      assert(
        requests.every((r) => ['status', 'mutation-status', 'workspace-context', 'goal-status'].includes(r.actionId)),
      );
      const button = goalButton(all, confirmedLabel);
      assert.equal(button.disabled, false);
      const pending = button.onclick();
      await tick();
      assert.equal(goalButton(all, confirmedLabel).disabled, true);
      await button.onclick(); // stale handler must also respect the lock
      assert.equal(requests.filter((r) => r.actionId === 'goal-confirm').length, 1);
      assert.deepEqual(requests.find((r) => r.actionId === 'goal-confirm').payload, {
        connectionRef: 'owner-rest',
        goalId: goal.goalId,
        nonce: goal.confirmation.nonce,
        expectedGoalHash: goal.goalHash,
      });
      setGoals(goalResponse(goalFixture('ACTIVE')));
      resolve({ok: true, goal: goalFixture('ACTIVE')});
      await pending;
      assert.match(goalText(all), /Engineer arbeitet/);
      assert.equal(requests.filter((r) => r.actionId === 'goal-status').length, 2);
      assert(!requests.some((r) => r.actionId === 'render'));
    },
    {
      goalResponse: goalResponse(goal),
      actionResponse: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  );
});

test('U2 confirmation enablement rejects missing admin, nonce, capability, expired or incomplete review', async () => {
  for (const canAdmin of [true, false, null]) {
    for (const capability of ['AVAILABLE', 'BLOCKED', 'UNSUPPORTED', undefined]) {
      for (const nonce of ['b'.repeat(32), null, undefined]) {
        const goal = goalFixture('AWAITING_CONFIRMATION', {capability});
        goal.confirmation.nonce = nonce;
        await mounted(
          async ({all}) => {
            assert.equal(
              goalButton(all, confirmedLabel).disabled,
              !(canAdmin === true && capability === 'AVAILABLE' && nonce),
            );
          },
          {canAdmin, goalResponse: goalResponse(goal)},
        );
      }
    }
  }
  for (const mutate of [
    (g) => {
      g.confirmation.expiresAt = 1;
    },
    (g) => {
      delete g.goalHash;
    },
    (g) => {
      g.goalConditions = [];
    },
    (g) => {
      delete g.scope.maxDispatches;
    },
    (g) => {
      g.target.documentId = '9'.repeat(24);
    },
    (g) => {
      delete g.target.baseMicroversion;
    },
  ]) {
    const goal = goalFixture();
    mutate(goal);
    await mounted(
      async ({all}) => {
        assert.equal(goalButton(all, confirmedLabel).disabled, true);
      },
      {goalResponse: goalResponse(goal)},
    );
  }
});

test('U3 all goal states have text labels; completed requires passed verification and notes remain open', async () => {
  const states = {
    AWAITING_CONFIRMATION: 'wartet auf Bestätigung',
    ACTIVE: 'Engineer arbeitet',
    RECONCILING: 'Abgleich läuft',
    BLOCKED: 'Ziel blockiert',
    STOPPED: 'Ziel gestoppt',
    EXPIRED: 'Zielfreigabe abgelaufen',
    COMPLETED: 'Ziel erreicht · geprüft',
    FAILED: 'Ziel fehlgeschlagen',
    CLOSED: 'Änderungen bleiben erhalten',
  };
  for (const [state, label] of Object.entries(states)) {
    await mounted(
      async ({all}) => {
        assert(goalText(all).includes(label));
        assert.match(goalText(all), /Offene Prüfgrenzen/);
        assert.match(goalText(all), /Mechanische Eignung muss fachlich beurteilt werden/);
        if (state !== 'AWAITING_CONFIRMATION') {
          assert(!goalButton(all, confirmedLabel));
        }
      },
      {goalResponse: goalResponse(goalFixture(state))},
    );
  }
  for (const lastVerification of [null, {passed: false, checks: [], openLimits: []}]) {
    const goal = goalFixture('COMPLETED');
    goal.progress.lastVerification = lastVerification;
    await mounted(
      async ({all}) => {
        assert.match(goalText(all), /Zielabschluss nicht belegt/);
        assert(!goalText(all).includes('Ziel erreicht · geprüft'));
      },
      {goalResponse: goalResponse(goal)},
    );
  }
  const goal = goalFixture('ACTIVE', {
    progress: {
      dispatches: null,
      remaining: null,
      unreconciledSequence: null,
      lastOutcome: null,
      lastVerification: null,
    },
    capability: 'BLOCKED',
  });
  await mounted(
    async ({all}) => {
      assert.match(goalText(all), /Schritte: unbekannt · verbleibend: unbekannt/);
      assert.match(goalText(all), /Zieliteration blockiert/);
      assert(!goalText(all).includes('Schritte: 0'));
    },
    {goalResponse: goalResponse(goal)},
  );
});

test('U4 STOP state/admin matrix and reconcile guidance never invent error data', async () => {
  for (const state of [
    'AWAITING_CONFIRMATION',
    'ACTIVE',
    'RECONCILING',
    'BLOCKED',
    'STOPPED',
    'EXPIRED',
    'COMPLETED',
    'FAILED',
    'CLOSED',
  ]) {
    for (const canAdmin of [true, false, null]) {
      await mounted(
        async ({all, requests}) => {
          const stop = goalButton(all, 'Iteration stoppen');
          if (['AWAITING_CONFIRMATION', 'ACTIVE', 'RECONCILING', 'BLOCKED'].includes(state)) {
            assert.equal(stop.disabled, canAdmin !== true);
          } else {
            assert.equal(stop, undefined);
          }
          if (state === 'RECONCILING') {
            assert.equal(goalButton(all, 'Ausgang abgleichen').disabled, true);
            assert.match(goalText(all), /Engineer gleicht mit den vollständigen Server-Fehlerdaten/);
          }
          assert(!requests.some((r) => r.actionId === 'goal-reconcile'));
        },
        {canAdmin, goalResponse: goalResponse(goalFixture(state))},
      );
    }
  }
  await mounted(
    async ({all, requests, setGoals}) => {
      setGoals(goalResponse(goalFixture('STOPPED')));
      await goalButton(all, 'Iteration stoppen').onclick();
      assert.deepEqual(requests.find((r) => r.actionId === 'goal-stop').payload, {
        connectionRef: 'owner-rest',
        goalId: goalFixture().goalId,
      });
    },
    {
      goalResponse: goalResponse(goalFixture('ACTIVE', {capability: 'BLOCKED'})),
      actionResponse: {ok: true, goal: goalFixture('STOPPED')},
    },
  );
});

test('U4 close needs a known clear journal and explicit second confirmation; history cannot act', async () => {
  for (const state of ['STOPPED', 'EXPIRED', 'BLOCKED']) {
    for (const progress of [
      undefined,
      {},
      {dispatches: null, remaining: null, unreconciledSequence: null},
      {dispatches: 1, remaining: 9},
      {dispatches: 1, remaining: 9, unreconciledSequence: 1},
    ]) {
      await mounted(
        async ({all}) => {
          assert.equal(goalButton(all, 'Ziel abschließen …').disabled, true);
        },
        {goalResponse: goalResponse(goalFixture(state, {progress}))},
      );
    }
    await mounted(
      async ({all, requests, setGoals}) => {
        const start = goalButton(all, 'Ziel abschließen …');
        assert.equal(start.disabled, false);
        start.onclick();
        assert(!requests.some((r) => r.actionId === 'goal-close'));
        assert.match(goalText(all), /Ausgeführte Änderungen und der Candidate bleiben erhalten/);
        goalButton(all, 'Abbrechen').onclick();
        assert(!goalButton(all, 'Ziel abschließen'));
        goalButton(all, 'Ziel abschließen …').onclick();
        setGoals(goalResponse(null, [goalFixture('CLOSED')]));
        await goalButton(all, 'Ziel abschließen').onclick();
        assert.deepEqual(requests.find((r) => r.actionId === 'goal-close').payload, {
          connectionRef: 'owner-rest',
          goalId: goalFixture().goalId,
        });
        const history = all().find((e) => e.id === 'coc-goal-history');
        assert.equal(history.open, false);
        assert(!nodes(history).some((e) => e.tag === 'button'));
        assert(!goalButton(all, 'Ziel abschließen …'));
      },
      {goalResponse: goalResponse(goalFixture(state)), actionResponse: {ok: true, goal: goalFixture('CLOSED')}},
    );
  }
  for (const canAdmin of [false, null]) {
    await mounted(
      async ({all}) => {
        assert.equal(goalButton(all, 'Ziel abschließen …').disabled, true);
      },
      {canAdmin, goalResponse: goalResponse(goalFixture('STOPPED'))},
    );
  }
});

test('goal action failure shows human message and technical code, reads status once and never retries', async () => {
  await mounted(
    async ({all, requests}) => {
      await goalButton(all, confirmedLabel).onclick();
      assert.match(goalText(all), /Bitte Ziel erneut prüfen/);
      const details = goalNodes(all).find(
        (e) => e.tag === 'details' && e.children[0]?.textContent === 'Technische Zieldiagnose',
      );
      assert(nodes(details).some((e) => e.textContent === 'goal_hash_mismatch'));
      assert.equal(requests.filter((r) => r.actionId === 'goal-confirm').length, 1);
      assert.equal(requests.filter((r) => r.actionId === 'goal-status').length, 2);
      assert.equal(goalButton(all, confirmedLabel).disabled, true);
    },
    {
      goalResponse: goalResponse(goalFixture()),
      actionResponse: {ok: false, code: 'goal_hash_mismatch', message: 'Bitte Ziel erneut prüfen.'},
    },
  );
});

test('stale goal status and action responses cannot replace a refreshed or switched connection', async () => {
  await mounted(
    async ({all, setGoals, setStatus}) => {
      let resolve;
      setGoals(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const old = all()
        .find((e) => e.textContent === 'Aktualisieren')
        .onclick();
      await tick();
      setGoals(goalResponse(goalFixture('ACTIVE', {goalText: 'New goal'})));
      await all()
        .find((e) => e.textContent === 'Aktualisieren')
        .onclick();
      resolve(goalResponse(goalFixture('COMPLETED', {goalText: 'Obsolete goal'})));
      await old;
      assert(goalText(all).includes('New goal'));
      assert(!goalText(all).includes('Obsolete goal'));
      setStatus({...status, connections: ['owner-rest', 'other']});
      setGoals(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const stale = all()
        .find((e) => e.textContent === 'Aktualisieren')
        .onclick();
      await tick();
      const select = all().find((e) => e.attrs['aria-label'] === 'Onshape-Verbindung');
      setGoals(goalResponse(goalFixture('STOPPED', {goalText: 'Other connection'})));
      select.value = 'other';
      await select.onchange();
      resolve(goalResponse(goalFixture('ACTIVE', {goalText: 'Old connection'})));
      await stale;
      assert.match(goalText(all), /Other connection/);
      assert(!goalText(all).includes('Old connection'));
    },
    {goalResponse: goalResponse(goalFixture())},
  );
  let resolve;
  await mounted(
    async ({all, setGoals, setStatus}) => {
      const pending = goalButton(all, confirmedLabel).onclick();
      await tick();
      setStatus({...status, connections: ['owner-rest', 'other']});
      setGoals(goalResponse(goalFixture('ACTIVE', {goalText: 'New connection goal'})));
      await all()
        .find((e) => e.textContent === 'Aktualisieren')
        .onclick();
      const select = all().find((e) => e.attrs['aria-label'] === 'Onshape-Verbindung');
      select.value = 'other';
      await select.onchange();
      resolve({ok: false, message: 'Old action error', code: 'old'});
      await pending;
      assert.match(goalText(all), /New connection goal/);
      assert(!goalText(all).includes('Old action error'));
    },
    {
      goalResponse: goalResponse(goalFixture()),
      actionResponse: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  );
});

test('goal text stays text; result links must match goal document Candidate and element', async () => {
  for (const url of [
    'javascript:alert(1)',
    'https://foreign.test/',
    `https://cad.onshape.com/documents/${'9'.repeat(24)}/w/${target.workspaceId}/m/${'1'.repeat(24)}/e/${target.elementId}`,
  ]) {
    const goal = goalFixture('COMPLETED', {goalText: '<img src=x onerror=alert(1)>'});
    goal.result.revisionUrl = url;
    await mounted(
      async ({all}) => {
        assert(goalText(all).includes('<img src=x onerror=alert(1)>'));
        assert(!goalNodes(all).some((e) => e.tag === 'img'));
        assert(!goalNodes(all).some((e) => e.tag === 'a'));
      },
      {goalResponse: goalResponse(goal)},
    );
  }
  await mounted(
    async ({all}) => {
      const link = goalNodes(all).find((e) => e.tag === 'a');
      assert.equal(link.href, goalFixture('COMPLETED').result.revisionUrl);
      assert.equal(link.rel, 'noopener noreferrer');
    },
    {goalResponse: goalResponse(goalFixture('COMPLETED'))},
  );
});
