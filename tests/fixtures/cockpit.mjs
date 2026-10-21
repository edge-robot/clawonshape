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
