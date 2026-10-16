import {createHash, randomUUID} from 'node:crypto';
import {id, validateTarget, connectionOwner} from './config.ts';
import type {Binding} from './config.ts';
import {jsonRequest, ProviderHttpError} from './http.ts';
import {candidateAttempts, warnCandidate, CANDIDATE_MAX_BYTES} from './candidate-attempts.ts';
import type {CandidateAttempt, CandidateAttemptWarning} from './candidate-attempts.ts';
import {checkCandidateAuthorization, candidateDispatchAuthorization} from './candidate-authorization.ts';
import type {CandidateAuthorization, CandidateAuthorizationCheck} from './candidate-authorization.ts';
import {decodePng, IMAGE_SIZE, VIEW_MATRIX} from './render.ts';

export const REST_BASE = 'https://cad.onshape.com/api/v10/';

export type FeatureObservation = {microversionId: string; featureId: string; plateWidth: string; featureStatus: string};
export function validateFeatureObservation(value: unknown): asserts value is FeatureObservation {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'featureId,featureStatus,microversionId,plateWidth'
  ) {
    throw new Error('invalid_arguments');
  }
  const v = value as FeatureObservation;
  if (
    !id(v.microversionId) ||
    typeof v.featureId !== 'string' ||
    !/^[A-Za-z0-9_]{1,100}$/.test(v.featureId) ||
    typeof v.plateWidth !== 'string' ||
    v.plateWidth.length < 1 ||
    v.plateWidth.length > 120 ||
    typeof v.featureStatus !== 'string' ||
    !/^[A-Z_]{1,40}$/.test(v.featureStatus)
  ) {
    throw new Error('invalid_arguments');
  }
}

type WorkspaceInfo = {id?: unknown; documentId?: unknown; microversion?: unknown};
type ElementInfo = {id?: unknown; elementType?: unknown};
type SourceFeatures = {sourceMicroversion?: unknown; features?: unknown};

export type CandidateFeatureMetadata = Readonly<{
  featureCount: number;
}>;

export type CandidateReferences = Readonly<{
  documentId: string;
  primaryWorkspaceId: string;
  sourceWorkspaceId: string;
  sourceElementId: string;
  sourceMicroversionId: string;
  candidateWorkspaceId: string;
  candidateBaselineMicroversionId: string;
}>;

export type PrepareCandidateWorkspaceResult =
  | Readonly<{
      status: 'ok';
      created: boolean;
      attemptId?: string;
      attemptStatus?: 'VERIFIED';
      references: CandidateReferences;
      featureMetadata: CandidateFeatureMetadata;
      sourceWorkspaceUrl: string;
      candidateWorkspaceUrl: string;
    }>
  | Readonly<{
      status: 'unknown' | 'created_unverified';
      code: 'candidate_creation_unknown' | 'candidate_verification_pending';
      attemptId: string;
      attemptStatus: 'UNKNOWN' | 'CREATED_UNVERIFIED';
      candidateWorkspaceId?: string;
      reconciliationRequired: true;
      requiredAction: string;
    }>
  | Readonly<{
      status: 'unavailable';
      operation: 'create_candidate_workspace';
      availability: 'UNAVAILABLE' | 'UNKNOWN';
      reason: Exclude<CandidateAuthorizationCheck['reason'], 'authorized'> | 'candidate_previous_attempt';
      attemptId?: string;
      requiredAction: string;
    }>;

export type PrepareCandidateWorkspaceInput = Readonly<{
  sourceMicroversionId: string;
  candidateWorkspaceId?: string;
  candidateWorkspaceName?: string;
  // Explicit acknowledgement by the trusted caller, never an automatic retry.
  replaceCompletedAttemptId?: string;
}>;

type Receipt = Parameters<Parameters<Awaited<ReturnType<typeof candidateAttempts>>['exclusive']>[0]>[0];
type PreparationOptions = Readonly<{
  stateDir: string;
  warn?: CandidateAttemptWarning;
  authorization?: CandidateAuthorization;
}>;

export class RestClient {
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: typeof fetch;
  private readonly preparation?: PreparationOptions;

  constructor(accessToken: () => Promise<string>, fetcher: typeof fetch = fetch, preparation?: PreparationOptions) {
    this.accessToken = accessToken;
    this.fetcher = fetcher;
    this.preparation = preparation;
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    maxBytes = 1024 * 1024,
    beforeDispatch?: (token: string) => Promise<void>,
    atDispatch?: (token: string) => void,
  ): Promise<unknown> {
    const token = await this.accessToken();
    if (!token || /\s/.test(token)) {
      throw new Error('reconnect_required');
    }
    if (beforeDispatch) {
      await beforeDispatch(token);
    }
    if (atDispatch) {
      atDispatch(token);
    }
    return jsonRequest(
      this.fetcher,
      REST_BASE + path,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(method === 'POST' ? {'Content-Type': 'application/json'} : {}),
        },
        ...(method === 'POST' ? {body: JSON.stringify(body ?? {})} : {}),
      },
      maxBytes,
    );
  }

  private async get(path: string, maxBytes = 1024 * 1024): Promise<unknown> {
    return this.request(path, 'GET', undefined, maxBytes);
  }

  private async post(
    path: string,
    body: unknown,
    beforeDispatch: (token: string) => Promise<void>,
    atDispatch: (token: string) => void,
  ): Promise<unknown> {
    return this.request(path, 'POST', body, 1024 * 1024, beforeDispatch, atDispatch);
  }

  private sanitizeFeatureMetadata(features: SourceFeatures): CandidateFeatureMetadata {
    if (!Array.isArray(features.features) || features.features.length > 1000) {
      throw new Error('source_revision_missing');
    }
    return Object.freeze({featureCount: features.features.length});
  }

  private async currentMicroversion(binding: Binding, workspaceId: string): Promise<string> {
    const response = (await this.candidateGet(
      binding,
      `documents/d/${binding.documentId}/w/${workspaceId}/currentmicroversion`,
    )) as {microversion?: unknown};
    if (!id(response?.microversion)) {
      throw new Error('provider_protocol_error');
    }
    return response.microversion;
  }

  private assertCandidateIsolation(binding: Binding, workspaceId: string): void {
    if (workspaceId === binding.primaryWorkspaceId) {
      throw new Error('protected_primary_workspace');
    }
    if (workspaceId === binding.workspaceId) {
      throw new Error('candidate_not_isolated');
    }
  }

  private async verifySourcePartStudio(binding: Binding, microversionId: string): Promise<void> {
    const elements = await this.candidateGet(binding, `documents/d/${binding.documentId}/m/${microversionId}/elements`);
    if (!Array.isArray(elements) || elements.length > 1000 || elements.some((e) => !id(e?.id))) {
      throw new Error('provider_protocol_error');
    }
    if (!elements.some((e) => e.id === binding.elementId && e.elementType === 'PARTSTUDIO')) {
      throw new Error('target_not_part_studio');
    }
  }

  private async verifyCandidateBaseline(
    binding: Binding,
    workspaceId: string,
    workspaces: readonly WorkspaceInfo[],
    sourceMicroversionId: string,
  ): Promise<string> {
    this.assertCandidateIsolation(binding, workspaceId);
    const candidate = workspaces.find((w) => w?.id === workspaceId);
    if (!candidate || candidate.documentId !== binding.documentId) {
      throw new Error('workspace_not_in_document');
    }
    const baseline = await this.currentMicroversion(binding, workspaceId);
    if (baseline !== sourceMicroversionId) {
      throw new Error('candidate_revision_conflict');
    }
    // The source Part Studio was checked at this exact document microversion.
    // Equal immutable baselines establish the same element membership/type.
    return baseline;
  }

  private assertWorkspaces(workspaces: unknown, binding: Binding): readonly WorkspaceInfo[] {
    if (
      !Array.isArray(workspaces) ||
      ![binding.workspaceId, binding.primaryWorkspaceId].every((wid) => workspaces.some((w) => w?.id === wid))
    ) {
      throw new Error('workspace_not_in_document');
    }
    return workspaces as readonly WorkspaceInfo[];
  }

  private async inspectSnapshot(binding: Binding) {
    validateTarget(binding, binding.documentId, binding.workspaceId);
    const doc = (await this.get(`documents/${binding.documentId}`)) as {id?: unknown};
    if (!doc || doc.id !== binding.documentId) {
      throw new Error('provider_protocol_error');
    }
    const workspaces = this.assertWorkspaces(await this.get(`documents/d/${binding.documentId}/workspaces`), binding);
    const elements = await this.get(`documents/d/${binding.documentId}/w/${binding.workspaceId}/elements`);
    if (!Array.isArray(elements) || elements.length > 1000 || elements.some((e) => !id(e?.id))) {
      throw new Error('provider_protocol_error');
    }
    return {
      summary: {
        documentId: binding.documentId,
        workspaceId: binding.workspaceId,
        elementIds: elements.map((e) => e.id),
      },
      elements: elements as readonly ElementInfo[],
      workspaces,
    };
  }

  async inspect(binding: Binding) {
    return (await this.inspectSnapshot(binding)).summary;
  }

  // Independent control-plane verification of observations made by native MCP.
  // No MCP invocation or caller-selected provider target is accepted here.
  async verifyFeatureRead(binding: Binding, observation: FeatureObservation) {
    validateFeatureObservation(observation);
    const {elements} = await this.inspectSnapshot(binding);
    if (!binding.elementId || !elements.some((e) => e.id === binding.elementId && e.elementType === 'PARTSTUDIO')) {
      throw new Error('target_not_part_studio');
    }
    const response = (await this.get(
      `partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`,
    )) as {
      sourceMicroversion?: unknown;
      features?: {featureId?: unknown; parameters?: {parameterId?: unknown; expression?: unknown}[]}[];
      featureStates?: Record<string, {featureStatus?: unknown}>;
    };
    if (response.sourceMicroversion !== observation.microversionId) {
      throw new Error('source_revision_conflict');
    }
    if (!Array.isArray(response.features) || response.features.length > 1000) {
      throw new Error('provider_protocol_error');
    }
    const feature = response.features.find((f) => f.featureId === observation.featureId);
    const widths = feature?.parameters?.filter((p) => p.parameterId === 'plateWidth');
    if (
      widths?.length !== 1 ||
      widths[0].expression !== observation.plateWidth ||
      response.featureStates?.[observation.featureId]?.featureStatus !== observation.featureStatus
    ) {
      throw new Error('feature_observation_mismatch');
    }
    return {
      status: 'ok',
      code: 'ready',
      documentId: binding.documentId,
      workspaceId: binding.workspaceId,
      elementId: binding.elementId,
      ...observation,
      verification: 'independent_rest_match',
      observedAt: new Date().toISOString(),
      onshapeUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}`,
    };
  }

  async verifyFeatureEvidence(binding: Binding, evidence: FeatureReadEvidence) {
    validateFeatureReadEvidence(evidence);
    const {elements} = await this.inspectSnapshot(binding);
    if (!binding.elementId || !elements.some((e) => e.id === binding.elementId && e.elementType === 'PARTSTUDIO')) {
      throw new Error('target_not_part_studio');
    }
    const response = (await this.get(
      `partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`,
    )) as {
      sourceMicroversion?: unknown;
      features?: {featureId?: unknown; parameters?: {parameterId?: unknown; expression?: unknown}[]}[];
      featureStates?: Record<string, {featureStatus?: unknown}>;
    };
    if (response.sourceMicroversion !== evidence.microversionId) {
      throw new Error('source_revision_conflict');
    }
    if (!Array.isArray(response.features) || response.features.length > 1000) {
      throw new Error('provider_protocol_error');
    }
    for (const observed of evidence.observations) {
      const features = response.features.filter((f) => f.featureId === observed.featureId);
      if (
        features.length !== 1 ||
        response.featureStates?.[observed.featureId]?.featureStatus !== observed.featureStatus
      ) {
        throw new Error('feature_observation_mismatch');
      }
      if (observed.parameterId !== undefined) {
        const parameters = features[0].parameters?.filter((p) => p.parameterId === observed.parameterId);
        if (parameters?.length !== 1 || parameters[0].expression !== observed.expression) {
          throw new Error('feature_observation_mismatch');
        }
      }
    }
    return {...evidence, verification: 'independent_rest_match' as const, observedAt: new Date().toISOString()};
  }

  async featureUpdateBaseline(binding: Binding, featureId: string) {
    if (binding.workspaceId === binding.primaryWorkspaceId) {
      throw new Error('protected_primary_workspace');
    }
    const {elements, workspaces} = await this.inspectSnapshot(binding);
    if (
      !binding.elementId ||
      !elements.some((e) => e.id === binding.elementId && e.elementType === 'PARTSTUDIO') ||
      !workspaces.some((w) => w.id === binding.primaryWorkspaceId)
    ) {
      throw new Error('target_not_part_studio');
    }
    const token = await this.accessToken();
    const response = (await jsonRequest(
      this.fetcher,
      `https://cad.onshape.com/api/v16/partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`,
      {method: 'GET', headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}},
    )) as {
      sourceMicroversion?: unknown;
      features?: Record<string, unknown>[];
      serializationVersion?: unknown;
      libraryVersion?: unknown;
      featureStates?: Record<string, {featureStatus?: unknown}>;
    };
    if (!id(response.sourceMicroversion) || !Array.isArray(response.features)) {
      throw new Error('provider_protocol_error');
    }
    const matches = response.features.filter((f) => f.featureId === featureId);
    if (matches.length !== 1) {
      throw new Error('feature_observation_mismatch');
    }
    const primary = (await this.get(
      `documents/d/${binding.documentId}/w/${binding.primaryWorkspaceId}/currentmicroversion`,
    )) as {microversion?: unknown};
    if (!id(primary.microversion)) {
      throw new Error('provider_protocol_error');
    }
    return {
      sourceMicroversion: response.sourceMicroversion,
      primaryMicroversionId: primary.microversion,
      feature: matches[0],
      featureStatus: response.featureStates?.[featureId]?.featureStatus,
      body: {
        feature: matches[0],
        serializationVersion: response.serializationVersion,
        libraryVersion: response.libraryVersion,
        sourceMicroversion: response.sourceMicroversion,
        rejectMicroversionSkew: true,
      },
    };
  }

  async sourceRevision(binding: Binding) {
    await this.inspectSnapshot(binding);
    const response = (await this.get(
      `partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`,
    )) as {sourceMicroversion?: unknown};
    if (!id(response.sourceMicroversion)) {
      throw new Error('source_revision_missing');
    }
    return response.sourceMicroversion;
  }

  async render(binding: Binding) {
    if (!binding.elementId) {
      throw new Error('target_missing');
    }
    const {summary: inspected, elements} = await this.inspectSnapshot(binding);
    if (!inspected.elementIds.includes(binding.elementId)) {
      throw new Error('target_not_part_studio');
    }
    if (!elements.some((e) => e.id === binding.elementId && e.elementType === 'PARTSTUDIO')) {
      throw new Error('target_not_part_studio');
    }
    const features = (await this.get(
      `partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`,
    )) as SourceFeatures;
    if (!id(features?.sourceMicroversion) || !Array.isArray(features.features) || features.features.length > 1000) {
      throw new Error('source_revision_missing');
    }
    const microversionId = features.sourceMicroversion;
    const pinned = await this.get(`documents/d/${binding.documentId}/m/${microversionId}/elements`);
    if (!Array.isArray(pinned) || !pinned.some((e) => e?.id === binding.elementId && e.elementType === 'PARTSTUDIO')) {
      throw new Error('target_not_part_studio');
    }
    const query = new URLSearchParams({
      viewMatrix: VIEW_MATRIX,
      outputWidth: String(IMAGE_SIZE),
      outputHeight: String(IMAGE_SIZE),
      pixelSize: '0',
      edges: 'show',
      useAntiAliasing: 'false',
    });
    const bytes = decodePng(
      await this.get(
        `partstudios/d/${binding.documentId}/m/${microversionId}/e/${binding.elementId}/shadedviews?${query}`,
        8_000_000,
      ),
    );
    return {
      bytes,
      metadata: {
        status: 'ok',
        code: 'ready',
        message: 'Onshape is connected and the Camera Mount Plate is available.',
        documentId: binding.documentId,
        workspaceId: binding.workspaceId,
        elementId: binding.elementId,
        microversionId,
        view: 'isometric',
        size: IMAGE_SIZE,
        featureCount: features.features.length,
        onshapeUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}`,
        revisionUrl: `https://cad.onshape.com/documents/${binding.documentId}/m/${microversionId}/e/${binding.elementId}`,
      },
    };
  }

  async prepareCandidateWorkspace(
    binding: Binding,
    input: PrepareCandidateWorkspaceInput,
  ): Promise<PrepareCandidateWorkspaceResult> {
    validateTarget(binding, binding.documentId, binding.workspaceId);
    if (!binding.elementId) {
      throw new Error('target_missing');
    }
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (k) =>
          ![
            'sourceMicroversionId',
            'candidateWorkspaceId',
            'candidateWorkspaceName',
            'replaceCompletedAttemptId',
          ].includes(k),
      )
    ) {
      this.warnAuthorization(binding, 'invalid_arguments');
      throw new Error('invalid_arguments');
    }
    const permission = await checkCandidateAuthorization(
      this.preparation?.authorization,
      binding,
      input.candidateWorkspaceId === undefined,
    );
    if (permission.availability !== 'AVAILABLE') {
      return this.deniedCandidate(binding, permission);
    }
    if (!id(input.sourceMicroversionId)) {
      throw new Error('invalid_arguments');
    }
    if (input.candidateWorkspaceId !== undefined && !id(input.candidateWorkspaceId)) {
      throw new Error('invalid_arguments');
    }
    if (input.candidateWorkspaceId !== undefined) {
      this.assertCandidateIsolation(binding, input.candidateWorkspaceId);
    }
    if (
      input.candidateWorkspaceName !== undefined &&
      (typeof input.candidateWorkspaceName !== 'string' ||
        input.candidateWorkspaceName.length < 1 ||
        input.candidateWorkspaceName.length > 120)
    ) {
      throw new Error('invalid_arguments');
    }
    if (![binding.primaryWorkspaceId, binding.elementId].every(id)) {
      throw new Error('invalid_arguments');
    }
    if (input.candidateWorkspaceId !== undefined) {
      if (input.replaceCompletedAttemptId !== undefined) {
        throw new Error('invalid_arguments');
      }
      return this.boundedCandidateResult(await this.prepareCandidateChecked(binding, input));
    }
    if (!this.preparation) {
      throw new Error('candidate_store_required');
    }
    const store = await candidateAttempts(this.preparation.stateDir, binding);
    const result = await store.exclusive(async (receipt) => {
      const previous = await receipt.read();
      if (previous?.status === 'UNKNOWN' || previous?.status === 'CREATED_UNVERIFIED') {
        warnCandidate(this.candidateWarning(), 'repeat_blocked', previous);
        return this.unresolvedCandidate(previous);
      }
      if (previous && !input.replaceCompletedAttemptId) {
        if (previous.status === 'VERIFIED' && this.sameCandidateSource(previous, binding, input.sourceMicroversionId)) {
          return this.prepareCandidateChecked(
            binding,
            {...input, candidateWorkspaceId: previous.candidateWorkspaceId},
            undefined,
            previous.attemptId,
          );
        }
        warnCandidate(this.candidateWarning(), 'repeat_blocked', previous);
        return {
          status: 'unavailable',
          operation: 'create_candidate_workspace',
          availability: 'UNAVAILABLE',
          reason: 'candidate_previous_attempt',
          attemptId: previous.attemptId,
          requiredAction: 'Acknowledge the completed attempt ID explicitly before starting a new preparation.',
        } as const;
      }
      if (input.replaceCompletedAttemptId !== undefined && input.replaceCompletedAttemptId !== previous?.attemptId) {
        throw new Error('candidate_attempt_mismatch');
      }
      return this.prepareCandidateChecked(binding, input, receipt);
    });
    return this.boundedCandidateResult(result);
  }

  private candidateWarning(): CandidateAttemptWarning {
    // biome-ignore lint/suspicious/noConsole: TODO(#9): route through the OpenClaw plugin logger instead of console (behaviour change)
    return this.preparation?.warn ?? ((message) => console.warn(message));
  }

  private warnAuthorization(binding: Binding, reason: string): void {
    const message =
      'WARNING: Claw-Onshape candidate authorization rejected. ' +
      JSON.stringify({
        event: 'claw_onshape.candidate_authorization_rejected',
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        severity: 'WARNING',
        ownerHash: connectionOwner(binding),
        documentId: binding.documentId,
        reason,
      });
    try {
      this.candidateWarning()(message);
    } catch {
      // biome-ignore lint/suspicious/noConsole: TODO(#9): route through the OpenClaw plugin logger instead of console (behaviour change)
      console.warn(message);
    }
  }

  private deniedCandidate(binding: Binding, check: CandidateAuthorizationCheck): PrepareCandidateWorkspaceResult {
    this.warnAuthorization(binding, check.reason);
    const actions: Partial<Record<CandidateAuthorizationCheck['reason'], string>> = {
      oauth_write_scope_missing: 'Reconnect Onshape with explicit REST write consent.',
      oauth_read_scope_missing: 'Reconnect Onshape with REST read consent.',
      app_permission_write_unknown: 'Ask the operator to verify application write permission.',
      app_permission_write_disabled:
        'Application write permission is disabled. Ask the operator to review the requirement.',
      reconnect_required: 'Reconnect Onshape through the configured dashboard.',
    };
    if (check.reason === 'authorized') {
      throw new Error('agent_policy_denied');
    }
    return {
      status: 'unavailable',
      operation: 'create_candidate_workspace',
      availability: check.availability === 'UNKNOWN' ? 'UNKNOWN' : 'UNAVAILABLE',
      reason: check.reason,
      requiredAction: actions[check.reason] ?? 'Ask the operator to review the trusted binding and operation policy.',
    };
  }

  private candidateGet(binding: Binding, path: string): Promise<unknown> {
    return this.request(
      path,
      'GET',
      undefined,
      1024 * 1024,
      (token) => this.requireCandidateAuthorization(binding, false, token),
      (token) => this.checkCandidateDispatch(binding, false, token),
    );
  }

  private checkCandidateDispatch(binding: Binding, write: boolean, token: string): void {
    const check = candidateDispatchAuthorization(this.preparation?.authorization, binding, write, token);
    if (check.availability !== 'AVAILABLE') {
      this.warnAuthorization(binding, check.reason);
      throw new Error(check.reason);
    }
  }

  private async requireCandidateAuthorization(binding: Binding, write: boolean, token?: string): Promise<void> {
    const check = await checkCandidateAuthorization(this.preparation?.authorization, binding, write, token);
    if (check.availability !== 'AVAILABLE') {
      this.warnAuthorization(binding, check.reason);
      throw new Error(check.reason);
    }
  }

  private boundedCandidateResult(result: PrepareCandidateWorkspaceResult): PrepareCandidateWorkspaceResult {
    if (Buffer.byteLength(JSON.stringify(result)) > CANDIDATE_MAX_BYTES) {
      throw new Error('candidate_result_too_large');
    }
    return result;
  }

  private sameCandidateSource(record: CandidateAttempt, binding: Binding, microversionId: string): boolean {
    return (
      record.primaryWorkspaceId === binding.primaryWorkspaceId &&
      record.sourceWorkspaceId === binding.workspaceId &&
      record.sourceElementId === binding.elementId &&
      record.sourceMicroversionId === microversionId
    );
  }

  private unresolvedCandidate(record: CandidateAttempt): PrepareCandidateWorkspaceResult {
    const known = record.status === 'CREATED_UNVERIFIED';
    return {
      status: known ? 'created_unverified' : 'unknown',
      code: known ? 'candidate_verification_pending' : 'candidate_creation_unknown',
      attemptId: record.attemptId,
      attemptStatus: known ? 'CREATED_UNVERIFIED' : 'UNKNOWN',
      ...(record.candidateWorkspaceId ? {candidateWorkspaceId: record.candidateWorkspaceId} : {}),
      reconciliationRequired: true,
      requiredAction: 'Reconcile this attempt in Onshape before requesting another workspace. No automatic retry.',
    };
  }

  private candidateSuccess(
    binding: Binding,
    sourceMicroversionId: string,
    candidateWorkspaceId: string,
    candidateBaselineMicroversionId: string,
    featureCount: number,
    created: boolean,
    attemptId?: string,
  ): PrepareCandidateWorkspaceResult {
    return {
      status: 'ok',
      created,
      ...(attemptId ? {attemptId, attemptStatus: 'VERIFIED' as const} : {}),
      references: {
        documentId: binding.documentId,
        primaryWorkspaceId: binding.primaryWorkspaceId,
        sourceWorkspaceId: binding.workspaceId,
        // biome-ignore lint/style/noNonNullAssertion: TODO(#9): invariant not provable locally; replace with an explicit fail-closed check
        sourceElementId: binding.elementId!,
        sourceMicroversionId,
        candidateWorkspaceId,
        candidateBaselineMicroversionId,
      },
      featureMetadata: {featureCount},
      sourceWorkspaceUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}`,
      candidateWorkspaceUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${candidateWorkspaceId}/e/${binding.elementId}`,
    };
  }

  // Only bounded fixed diagnostic codes enter receipts, never provider messages.
  private candidateFailureCode(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    return [
      'provider_protocol_error',
      'provider_transport_error',
      'provider_unavailable',
      'provider_forbidden',
      'provider_not_found',
      'provider_rate_limited',
      'provider_conflict',
      'reconnect_required',
      'protected_primary_workspace',
      'candidate_not_isolated',
      'workspace_not_in_document',
      'candidate_revision_conflict',
      'target_not_part_studio',
      'candidate_store_unavailable',
      'authorization_changed',
      'agent_policy_denied',
      'oauth_read_scope_missing',
      'oauth_write_scope_missing',
      'app_permission_read_disabled',
      'app_permission_write_disabled',
      'app_permission_write_unknown',
    ].includes(code)
      ? code
      : 'provider_transport_error';
  }

  private async prepareCandidateChecked(
    binding: Binding,
    input: PrepareCandidateWorkspaceInput,
    receipt?: Receipt,
    existingAttemptId?: string,
  ): Promise<PrepareCandidateWorkspaceResult> {
    const doc = (await this.candidateGet(binding, `documents/${binding.documentId}`)) as {id?: unknown};
    if (!doc || doc.id !== binding.documentId) {
      throw new Error('provider_protocol_error');
    }
    const workspaces = this.assertWorkspaces(
      await this.candidateGet(binding, `documents/d/${binding.documentId}/workspaces`),
      binding,
    );
    const features = (await this.candidateGet(
      binding,
      `partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`,
    )) as SourceFeatures;
    if (!id(features?.sourceMicroversion)) {
      throw new Error('source_revision_missing');
    }
    if (features.sourceMicroversion !== input.sourceMicroversionId) {
      throw new Error('source_revision_conflict');
    }
    const featureMetadata = this.sanitizeFeatureMetadata(features);

    await this.verifySourcePartStudio(binding, input.sourceMicroversionId);

    const latestSourceRevision = await this.currentMicroversion(binding, binding.workspaceId);
    if (latestSourceRevision !== input.sourceMicroversionId) {
      throw new Error('source_revision_conflict');
    }

    if (input.candidateWorkspaceId !== undefined) {
      const candidateBaselineMicroversionId = await this.verifyCandidateBaseline(
        binding,
        input.candidateWorkspaceId,
        workspaces,
        input.sourceMicroversionId,
      );
      return this.candidateSuccess(
        binding,
        input.sourceMicroversionId,
        input.candidateWorkspaceId,
        candidateBaselineMicroversionId,
        featureMetadata.featureCount,
        false,
        existingAttemptId,
      );
    }

    if (!receipt) {
      throw new Error('candidate_store_required');
    }
    const attemptId = randomUUID(),
      now = new Date().toISOString();
    const body = {
      name: input.candidateWorkspaceName ?? `candidate-${attemptId}`,
      microversionId: input.sourceMicroversionId,
    };
    let record: CandidateAttempt = {
      schemaVersion: 1,
      attemptId,
      ownerHash: connectionOwner(binding),
      documentId: binding.documentId,
      primaryWorkspaceId: binding.primaryWorkspaceId,
      sourceWorkspaceId: binding.workspaceId,
      // biome-ignore lint/style/noNonNullAssertion: TODO(#9): invariant not provable locally; replace with an explicit fail-closed check
      sourceElementId: binding.elementId!,
      sourceMicroversionId: input.sourceMicroversionId,
      requestDigest: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      featureCount: featureMetadata.featureCount,
      status: 'UNKNOWN',
      createdAt: now,
      updatedAt: now,
    };
    let dispatched = false;
    try {
      const createdWorkspace = (await this.post(
        `documents/d/${binding.documentId}/workspaces`,
        body,
        async (token) => {
          await this.requireCandidateAuthorization(binding, true, token);
          await receipt.save(record);
          await this.requireCandidateAuthorization(binding, true, token);
        },
        (token) => {
          this.checkCandidateDispatch(binding, true, token);
          dispatched = true;
        },
      )) as WorkspaceInfo;
      if (id(createdWorkspace?.id)) {
        const expectedIdentity =
          createdWorkspace.documentId === binding.documentId &&
          createdWorkspace.id !== binding.primaryWorkspaceId &&
          createdWorkspace.id !== binding.workspaceId;
        record = {
          ...record,
          status: expectedIdentity ? 'CREATED_UNVERIFIED' : 'UNKNOWN',
          candidateWorkspaceId: createdWorkspace.id,
          updatedAt: new Date().toISOString(),
        };
        await receipt.save(record);
      }
      if (!id(createdWorkspace?.id) || createdWorkspace.documentId !== binding.documentId) {
        throw new Error('provider_protocol_error');
      }
      this.assertCandidateIsolation(binding, createdWorkspace.id);
      const updatedWorkspaces = this.assertWorkspaces(
        await this.candidateGet(binding, `documents/d/${binding.documentId}/workspaces`),
        binding,
      );
      const baseline = await this.verifyCandidateBaseline(
        binding,
        createdWorkspace.id,
        updatedWorkspaces,
        input.sourceMicroversionId,
      );
      record = {...record, status: 'VERIFIED', updatedAt: new Date().toISOString()};
      await receipt.save(record);
      return this.candidateSuccess(
        binding,
        input.sourceMicroversionId,
        createdWorkspace.id,
        baseline,
        featureMetadata.featureCount,
        true,
        attemptId,
      );
    } catch (error) {
      if (!dispatched) {
        throw error;
      }
      if (record.status === 'VERIFIED') {
        record = {...record, status: 'CREATED_UNVERIFIED'};
      }
      // A received HTTP rejection is distinct from a lost response, timeout or
      // server error. In particular 408 is still an uncertain dispatch outcome.
      const rejected =
        record.status === 'UNKNOWN' &&
        error instanceof ProviderHttpError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      record = {
        ...record,
        ...(rejected ? {status: 'REJECTED' as const} : {}),
        code: this.candidateFailureCode(error),
        updatedAt: new Date().toISOString(),
      };
      try {
        await receipt.save(record);
      } catch {
        record = {...record, code: 'candidate_store_unavailable'};
      }
      if (rejected) {
        throw error;
      }
      warnCandidate(this.candidateWarning(), 'outcome_unresolved', record);
      return this.unresolvedCandidate(record);
    }
  }

  // Read-only reconciliation of a candidate ID actually returned by the POST.
  // A matching name or a vacant list is never treated as proof of its outcome.
  async reconcileCandidateWorkspace(binding: Binding, attemptId: string): Promise<PrepareCandidateWorkspaceResult> {
    validateTarget(binding, binding.documentId, binding.workspaceId);
    const permission = await checkCandidateAuthorization(this.preparation?.authorization, binding, false);
    if (permission.availability !== 'AVAILABLE') {
      return this.deniedCandidate(binding, permission);
    }
    if (!this.preparation) {
      throw new Error('candidate_store_required');
    }
    const store = await candidateAttempts(this.preparation.stateDir, binding);
    const result = await store.exclusive(async (receipt) => {
      let record = await receipt.read();
      if (
        !record ||
        record.attemptId !== attemptId ||
        !this.sameCandidateSource(record, binding, record.sourceMicroversionId)
      ) {
        throw new Error('candidate_attempt_mismatch');
      }
      if (record.status === 'REJECTED') {
        throw new Error('candidate_attempt_mismatch');
      }
      if (record.status === 'UNKNOWN' || !record.candidateWorkspaceId) {
        warnCandidate(this.candidateWarning(), 'repeat_blocked', record);
        return this.unresolvedCandidate(record);
      }
      try {
        const doc = (await this.candidateGet(binding, `documents/${binding.documentId}`)) as {id?: unknown};
        if (doc?.id !== binding.documentId) {
          throw new Error('provider_protocol_error');
        }
        const workspaces = this.assertWorkspaces(
          await this.candidateGet(binding, `documents/d/${binding.documentId}/workspaces`),
          binding,
        );
        await this.verifySourcePartStudio(binding, record.sourceMicroversionId);
        const baseline = await this.verifyCandidateBaseline(
          binding,
          record.candidateWorkspaceId,
          workspaces,
          record.sourceMicroversionId,
        );
        const {code: _, ...clean} = record;
        record = {...clean, status: 'VERIFIED', updatedAt: new Date().toISOString()};
        await receipt.save(record);
        return this.candidateSuccess(
          binding,
          record.sourceMicroversionId,
          // biome-ignore lint/style/noNonNullAssertion: TODO(#9): invariant not provable locally; replace with an explicit fail-closed check
          record.candidateWorkspaceId!,
          baseline,
          record.featureCount,
          false,
          record.attemptId,
        );
      } catch (error) {
        record = {
          ...record,
          status: 'CREATED_UNVERIFIED',
          code: this.candidateFailureCode(error),
          updatedAt: new Date().toISOString(),
        };
        try {
          await receipt.save(record);
        } catch {
          record = {...record, code: 'candidate_store_unavailable'};
        }
        warnCandidate(this.candidateWarning(), 'outcome_unresolved', record);
        return this.unresolvedCandidate(record);
      }
    });
    return this.boundedCandidateResult(result);
  }
}

export type FeatureReadEvidence = {
  microversionId: string;
  observations: {featureId: string; featureStatus: string; parameterId?: string; expression?: string}[];
};
export function validateFeatureReadEvidence(value: unknown): asserts value is FeatureReadEvidence {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'microversionId,observations'
  ) {
    throw new Error('invalid_arguments');
  }
  const v = value as FeatureReadEvidence;
  if (!id(v.microversionId) || !Array.isArray(v.observations) || !v.observations.length || v.observations.length > 50) {
    throw new Error('invalid_arguments');
  }
  const seen = new Set<string>();
  for (const o of v.observations) {
    if (
      !o ||
      typeof o !== 'object' ||
      Array.isArray(o) ||
      Object.keys(o).some((k) => !['featureId', 'featureStatus', 'parameterId', 'expression'].includes(k)) ||
      typeof o.featureId !== 'string' ||
      !/^[A-Za-z0-9_]{1,100}$/.test(o.featureId) ||
      typeof o.featureStatus !== 'string' ||
      !/^[A-Z_]{1,40}$/.test(o.featureStatus) ||
      (o.parameterId === undefined) !== (o.expression === undefined) ||
      (o.parameterId !== undefined &&
        (typeof o.parameterId !== 'string' ||
          !/^[A-Za-z0-9_]{1,100}$/.test(o.parameterId) ||
          typeof o.expression !== 'string' ||
          !o.expression.length ||
          o.expression.length > 256))
    ) {
      throw new Error('invalid_arguments');
    }
    const key = `${o.featureId}\n${o.parameterId ?? ''}`;
    if (seen.has(key)) {
      throw new Error('invalid_arguments');
    }
    seen.add(key);
  }
}
