// Explicitly synthetic status fixtures; no CAD model or engineering result evidence.
export const target = {
  documentId: 'a'.repeat(24),
  workspaceId: 'b'.repeat(24),
  primaryWorkspaceId: 'c'.repeat(24),
  elementId: 'd'.repeat(24),
};
export const proposal = (status = 'PROPOSED', extra = {}) => ({
  ...target,
  id: `fixture-${status}`,
  status,
  requestId: 'DEMO-Auftrag',
  task: 'DEMONSTRATION · Bohrung ändern; Positionen erhalten.',
  summary: 'DEMONSTRATION · Parametervorschlag',
  createdAt: '2026-10-20T10:00:00Z',
  sourceMicroversion: 'e'.repeat(24),
  primaryMicroversionId: 'f'.repeat(24),
  payloadHash: '0'.repeat(64),
  body: {feature: {parameters: [{parameterId: 'demoDiameter', expression: '5 mm'}]}},
  ...extra,
});
export const status = {code: 'connected', connections: ['owner-rest'], mcp: {discovery: {status: 'UNKNOWN'}}};
export const data = {
  status: 'ok',
  target,
  proposals: [
    proposal(),
    proposal('UNKNOWN', {approvedAt: '2026-10-20T10:01:00Z', expiresAt: 1}),
    proposal('VERIFIED', {approvedAt: '2026-10-20T10:01:00Z', resultMicroversion: '1'.repeat(24)}),
    proposal('REJECTED', {reason: 'approval_expired_not_dispatched'}),
  ],
};

// Current labels are independent of image/revision fixtures.
export const workspaceContext = {
  status: 'ok',
  connectionRef: 'owner-rest',
  target,
  documentName: 'DEMO Document',
  workspaceName: 'DEMO Candidate',
  primaryWorkspaceName: 'DEMO Primary',
  elementName: 'DEMO current studio',
  observedAt: new Date().toISOString(),
};

// GoalView-shaped synthetic data. No CAD execution or human acceptance is implied.
export function goalFixture(state = 'AWAITING_CONFIRMATION', extra = {}) {
  const now = Date.now();
  const completed = state === 'COMPLETED';
  const candidate = state === 'AWAITING_CONFIRMATION' ? null : target.workspaceId;
  const verification = completed
    ? {
        verifiedAt: now,
        microversionId: '1'.repeat(24),
        passed: true,
        checks: [
          {conditionId: 'diameter', kind: 'parameterEquals', result: 'pass', observed: '5 mm'},
          {conditionId: 'preserve', kind: 'featureUnchanged', result: 'pass'},
        ],
        openLimits: ['Mechanische Eignung muss fachlich beurteilt werden.'],
      }
    : null;
  return {
    goalId: '12345678-1234-4234-8234-123456789abc',
    scopeRevision: 1,
    state,
    goalText: 'DEMONSTRATION · Vier Montagebohrungen auf Ø 5 mm ändern',
    goalConditions: [
      {
        id: 'diameter',
        kind: 'parameterEquals',
        featureId: 'hole_feature',
        parameterId: 'diameter',
        expression: '5 mm',
        text: 'Vier Montagebohrungen auf 5 mm ändern.',
      },
    ],
    preservationConditions: [
      {id: 'preserve', kind: 'featureUnchanged', featureId: 'base_feature', text: 'Grundkörper unverändert erhalten.'},
      {id: 'quality', kind: 'note', text: 'Mechanische Eignung muss fachlich beurteilt werden.'},
    ],
    goalHash: 'a'.repeat(64),
    confirmationRequired: state === 'AWAITING_CONFIRMATION',
    target: {
      documentId: target.documentId,
      elementId: target.elementId,
      primaryWorkspaceId: target.primaryWorkspaceId,
      candidateWorkspaceId: candidate,
      baseMicroversion: 'f'.repeat(24),
    },
    scope: {
      featureIds: ['hole_feature'],
      operations: ['updatePartStudioFeature'],
      maxDispatches: 10,
      lifetimeMs: 7200000,
    },
    progress: {
      dispatches: state === 'AWAITING_CONFIRMATION' ? 0 : 2,
      remaining: state === 'AWAITING_CONFIRMATION' ? 10 : 8,
      unreconciledSequence: state === 'RECONCILING' ? 2 : null,
      lastOutcome: state === 'AWAITING_CONFIRMATION' ? null : 'OK',
      lastVerification: verification,
    },
    grant: ['ACTIVE', 'RECONCILING'].includes(state) ? {revision: 1, state: 'ACTIVE', expiresAt: now + 7200000} : null,
    confirmation: {
      expiresAt: now + 300000,
      confirmedAt: candidate ? now : null,
      confirmedBy: candidate ? {kind: 'dashboard-operator'} : null,
      nonce: state === 'AWAITING_CONFIRMATION' ? 'b'.repeat(32) : null,
    },
    result: ['COMPLETED', 'FAILED', 'CLOSED', 'BLOCKED', 'STOPPED', 'EXPIRED'].includes(state)
      ? {
          state,
          summary: completed
            ? 'Zielbedingungen geprüft; offene Grenzen beachten.'
            : 'Ziel beendet oder pausiert; weitere Entscheidung erforderlich.',
          openLimits: ['Mechanische Eignung muss fachlich beurteilt werden.'],
          revisionUrl: `https://cad.onshape.com/documents/${target.documentId}/w/${target.workspaceId}/m/${'1'.repeat(24)}/e/${target.elementId}`,
        }
      : null,
    capability: 'AVAILABLE',
    observedAt: now,
    ...extra,
  };
}
