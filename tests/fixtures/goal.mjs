// Goal workflow test harness: a fake Onshape (REST reads, candidate creation), a minimal stand-in for the server
// goal admission (§12.3 subset: grant file, scope, journal, budget) and the MCP probe endpoints. No network.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
import {parseConfig} from '../../dist/config.js';
import {grantViolations} from '../../dist/goal-lifecycle.js';
import {goalStore} from '../../dist/goal-store.js';
import {proposeGoal} from '../../dist/goal-service.js';

// Same behaviour as the other suites' private-file mock (mode 0600 files, 0700 directories). Whichever mock the
// loader resolves, the files on disk are identical; tests assert on disk, never on a write log.
if (!globalThis.__goalSecretMock) {
  globalThis.__goalSecretMock = true;
  globalThis.__nativeWrites ??= [];
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'openclaw/plugin-sdk/secret-file-runtime') {
        return {url: 'mock:goal-safe-files', shortCircuit: true};
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'mock:goal-safe-files') {
        return {
          format: 'module',
          shortCircuit: true,
          source: `
        import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
        import path from 'node:path';
        export function readSecretFileSync(p) {
          return readFileSync(p, 'utf8');
        }
        export async function writePrivateSecretFileAtomic(options) {
          globalThis.__nativeWrites.push(options);
          mkdirSync(path.dirname(options.filePath), {recursive: true, mode: 0o700});
          writeFileSync(options.filePath, options.content, {mode: 0o600});
        }
      `,
        };
      }
      return next(url, context);
    },
  });
}

export const D = '0123456789abcdef01234567';
export const E = 'fedcba9876543210fedcba98';
export const P = 'eeeeeeeeeeeeeeeeeeeeeeee';
export const C = '89abcdef0123456789abcdef';
export const BASE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
export const binding = Object.freeze({
  agentId: 'engineer',
  requesterSenderId: 'requester-fixture',
  messageChannel: 'discord',
  agentAccountId: 'default',
  connectionRef: 'owner-rest',
  documentId: D,
  primaryWorkspaceId: P,
  workspaceId: P,
  elementId: E,
});
export const origin = Object.freeze({channel: 'discord', target: 'channel:origin-fixture'});

const contractFixture = async (name) =>
  JSON.parse(await readFile(new URL(`../contract/${name}`, import.meta.url), 'utf8'));
export const featuresFixture = async () =>
  JSON.parse(await readFile(new URL('./features-response-goal-2026-10-21.json', import.meta.url), 'utf8'));
export const vector = () => contractFixture('goal-workflow/goal-hash/vector.json');
export const requestFixture = (name) => contractFixture(`goal-grant/requests/${name}.request.json`);

const clone = (value) => structuredClone(value);
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

export async function goalHarness(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'goal-workflow-'));
  const approvalDirectory = join(root, 'approval');
  const before = (await featuresFixture()).before;
  let clock = 4102444000000;
  let mvCounter = 0;
  const nextMicroversion = () => (++mvCounter).toString(16).padStart(24, 'b');
  // Workspace state: Primary at BASE; Candidates are copies created at the requested microversion.
  const workspaces = new Map([[P, clone(before)]]);
  const fail = {features: undefined, microversion: undefined, crashAfterCreate: false};
  const calls = {creates: 0, reads: [], microversionReads: 0};
  let attempt;
  const client = {
    async goalFeatures(b, workspaceId) {
      assert.equal(b.documentId, D);
      calls.reads.push(workspaceId);
      if (fail.features) {
        throw new Error(fail.features);
      }
      const w = workspaces.get(workspaceId);
      if (!w) {
        throw new Error('provider_not_found');
      }
      return {microversionId: w.sourceMicroversion, features: clone(w.features), featureStates: clone(w.featureStates)};
    },
    async goalWorkspaceMicroversion(_b, workspaceId) {
      calls.microversionReads++;
      if (fail.microversion) {
        throw new Error(fail.microversion);
      }
      return workspaces.get(workspaceId).sourceMicroversion;
    },
    async goalCandidateExists(_b, workspaceId) {
      return workspaceId !== P && workspaces.has(workspaceId);
    },
  };
  const candidateIds = [C, '9'.repeat(24), '8'.repeat(24)];
  const creation = {
    readAttempt: async () => attempt,
    async create(input) {
      calls.creates++;
      assert.equal(input.sourceMicroversionId, workspaces.get(P).sourceMicroversion);
      if (attempt) {
        assert.equal(input.replaceCompletedAttemptId, attempt.attemptId);
      }
      const id = candidateIds[calls.creates - 1];
      workspaces.set(id, clone(workspaces.get(P)));
      attempt = {
        schemaVersion: 1,
        attemptId: randomUUID(),
        status: 'VERIFIED',
        candidateWorkspaceId: id,
        sourceWorkspaceId: P,
        sourceMicroversionId: input.sourceMicroversionId,
      };
      if (fail.crashAfterCreate) {
        throw new Error('provider_transport_error');
      }
      return {status: 'ok', created: true, references: {candidateWorkspaceId: id}};
    },
  };
  // Server stand-in: journal per goal, grant file on disk, §12.3 subset and §12.7 summary.
  const journal = new Map();
  const server = {capability: 'goal', journalDown: false, outcome: 'OK'};
  const grantPath = join(approvalDirectory, 'goal-grant.json');
  const readGrant = async () => {
    try {
      return JSON.parse(await readFile(grantPath, 'utf8'));
    } catch {
      return undefined;
    }
  };
  const summaryOf = async (goalId) => {
    const entries = journal.get(goalId) ?? [];
    const grant = await readGrant();
    const reconciledThrough = grant?.goalId === goalId ? grant.reconciledThrough : 0;
    const uncertain = entries.find((e) => e.outcome === 'UNCERTAIN' && e.sequence > reconciledThrough);
    const counted = entries.filter((e) => e.outcome !== 'NOT_DISPATCHED');
    return {
      goalId,
      entries: entries.length,
      counted: counted.length,
      maxSequence: entries.length,
      unreconciledSequence: uncertain ? uncertain.sequence : null,
      lastOutcome: entries.at(-1)?.outcome ?? null,
      lastAdmittedAt: entries.at(-1)?.admittedAt ?? null,
    };
  };
  const fetcher = async (url, init) => {
    assert.equal(init.redirect, 'error');
    const u = new URL(url);
    assert.equal(u.host, 'clawonshape-mcp:8080');
    if (u.pathname === '/capabilities') {
      if (server.capability === '404') {
        return json({}, 404);
      }
      return json(
        await contractFixture(
          server.capability === 'goal'
            ? 'capabilities/approval-v2-and-goal.json'
            : 'capabilities/approval-v2-only.json',
        ),
      );
    }
    const m = /^\/goals\/([a-f0-9-]{36})\/journal-summary$/.exec(u.pathname);
    if (m) {
      return server.journalDown ? json({code: 'dispatch_journal_unavailable'}, 503) : json(await summaryOf(m[1]));
    }
    return json({}, 404);
  };
  // §12.3 subset. Returns the server code or {code: 'admitted', sequence}.
  const dispatch = async (request) => {
    const grant = await readGrant();
    if (!grant) {
      return {code: 'mutation_approval_unavailable'};
    }
    if (grantViolations(grant).length || grant.expiresAt <= clock) {
      return {code: 'goal_grant_invalid'};
    }
    if (grant.state !== 'ACTIVE') {
      return {code: 'goal_grant_stopped'};
    }
    const m =
      /^\/partstudios\/d\/([a-f0-9]{24})\/w\/([a-f0-9]{24})\/e\/([a-f0-9]{24})\/features\/featureid\/(\w+)$/.exec(
        request.path,
      );
    if (
      !m ||
      m[1] !== grant.target.documentId ||
      m[2] !== grant.target.workspaceId ||
      m[3] !== grant.target.elementId ||
      !grant.featureIds.includes(m[4]) ||
      request.body.feature.featureId !== m[4]
    ) {
      return {code: 'goal_scope_denied'};
    }
    const entries = journal.get(grant.goalId) ?? [];
    journal.set(grant.goalId, entries);
    if (entries.some((e) => e.outcome === 'UNCERTAIN' && e.sequence > grant.reconciledThrough)) {
      return {code: 'goal_reconciliation_required'};
    }
    if (entries.filter((e) => e.outcome !== 'NOT_DISPATCHED').length >= grant.maxDispatches) {
      return {code: 'goal_budget_exhausted'};
    }
    const sequence = entries.length + 1;
    const candidate = workspaces.get(grant.target.workspaceId);
    const apply = () => {
      const feature = candidate.features.find((f) => f.featureId === m[4]);
      for (const parameter of request.body.feature.parameters) {
        const target = feature.parameters.find((p) => p.parameterId === parameter.parameterId);
        target.expression = parameter.expression;
        target.nodeId = `Mnode${sequence}`.padEnd(16, 'x');
      }
      candidate.sourceMicroversion = nextMicroversion();
    };
    if (server.outcome === 'UNCERTAIN_APPLIED' || server.outcome === 'UNCERTAIN_NOT_APPLIED') {
      if (server.outcome === 'UNCERTAIN_APPLIED') {
        apply();
      }
      entries.push({sequence, outcome: 'UNCERTAIN', admittedAt: clock});
      return {
        code: 'mutation_outcome_unknown_reconcile_required',
        data: {
          goalId: grant.goalId,
          sequence,
          featureId: m[4],
          sourceMicroversion: request.body.sourceMicroversion,
          admittedAt: clock,
        },
      };
    }
    if (request.body.sourceMicroversion !== candidate.sourceMicroversion) {
      entries.push({sequence, outcome: 'PROVIDER_REJECTED', admittedAt: clock});
      return {code: 'provider_rejected', sequence};
    }
    apply();
    entries.push({sequence, outcome: 'OK', admittedAt: clock});
    return {code: 'admitted', sequence};
  };
  const config = parseConfig({
    bindings: [options.binding ?? binding],
    liveReads: true,
    goals: options.goals ?? {enabled: true, approvalDirectory},
    ...(options.localMcp ? {localMcp: options.localMcp(root)} : {}),
    ...(options.oauth ? {oauth: options.oauth} : {}),
  });
  const ctx = {
    stateDir: root,
    config,
    binding: options.binding ?? binding,
    client,
    fetcher,
    now: () => clock,
    guard: () => {},
  };
  return {
    root,
    approvalDirectory,
    grantPath,
    ctx,
    client,
    creation,
    calls,
    fail,
    server,
    journal,
    workspaces,
    dispatch,
    readGrant,
    summaryOf,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
    setAttempt: (value) => {
      attempt = value;
    },
    // The Engineer re-reads the Candidate and builds the request on the current revision (CAS).
    async request(name, candidate = C) {
      const request = await requestFixture(name);
      request.path = request.path.replace(C, candidate);
      request.body.sourceMicroversion = workspaces.get(candidate)?.sourceMicroversion ?? BASE;
      return request;
    },
    async record(goalId) {
      return (await goalStore(root)).read(goalId);
    },
    cleanup: () => rm(root, {recursive: true, force: true}),
  };
}

export async function proposeVector(h, overrides = {}, envelope = {}) {
  const v = await vector();
  return proposeGoal(
    h.ctx,
    {workflow: 'goal', origin: {...origin}, ...envelope},
    {
      goalText: v.scope.goalText,
      goalConditions: v.scope.goalConditions,
      preservationConditions: v.scope.preservationConditions,
      featureIds: v.scope.featureIds,
      ...overrides,
    },
  );
}

export const admin = Object.freeze({kind: 'dashboard-operator', clientId: 'conn-fixture', scopes: ['operator.admin']});
