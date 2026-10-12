import {id, validateTarget} from './config.ts';
import type {Binding} from './config.ts';
import {jsonRequest} from './http.ts';
import {decodePng, IMAGE_SIZE, VIEW_MATRIX} from './render.ts';

export const REST_BASE = 'https://cad.onshape.com/api/v10/';

type WorkspaceInfo = {id?: unknown; documentId?: unknown; microversion?: unknown};
type ElementInfo = {id?: unknown; elementType?: unknown};
type SourceFeatures = {sourceMicroversion?: unknown; features?: unknown};

export type CandidateFeatureMetadata = Readonly<{
  featureCount: number;
  featureIds: readonly string[];
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
      references: CandidateReferences;
      featureMetadata: CandidateFeatureMetadata;
      sourceWorkspaceUrl: string;
      candidateWorkspaceUrl: string;
    }>
  | Readonly<{
      status: 'unknown';
      code: 'candidate_creation_unknown';
      references: Omit<CandidateReferences, 'candidateWorkspaceId' | 'candidateBaselineMicroversionId'>;
      featureMetadata: CandidateFeatureMetadata;
      reconciliationRequired: true;
    }>
  | Readonly<{
      status: 'unavailable';
      operation: 'create_candidate_workspace';
      availability: 'UNAVAILABLE';
      reason: 'oauth_write_scope_missing' | 'app_permission_write_disabled' | 'app_permission_write_unknown' | 'agent_policy_denied';
      requiredAction: string;
    }>;

export type PrepareCandidateWorkspaceInput = Readonly<{
  sourceMicroversionId: string;
  candidateWorkspaceId?: string;
  candidateWorkspaceName?: string;
  authorization?: Readonly<{
    oauthWriteScope: boolean;
    applicationWritePermission: 'enabled' | 'disabled' | 'unknown';
    internalAuthorization: boolean;
  }>;
  restWriteAuthorized: boolean;
}>;

export class RestClient {
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: typeof fetch;

  constructor(accessToken: () => Promise<string>, fetcher: typeof fetch = fetch) {
    this.accessToken = accessToken;
    this.fetcher = fetcher;
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown, maxBytes = 1024 * 1024): Promise<unknown> {
    const token = await this.accessToken();
    if (!token || /\s/.test(token)) throw new Error('reconnect_required');
    return jsonRequest(this.fetcher, REST_BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(method === 'POST' ? {'Content-Type': 'application/json'} : {}),
      },
      ...(method === 'POST' ? {body: JSON.stringify(body ?? {})} : {}),
    }, maxBytes);
  }

  private async get(path: string, maxBytes = 1024 * 1024): Promise<unknown> {
    return this.request(path, 'GET', undefined, maxBytes);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, 'POST', body);
  }

  private sanitizeFeatureMetadata(features: SourceFeatures): CandidateFeatureMetadata {
    if (!Array.isArray(features.features) || features.features.length > 1000) throw new Error('source_revision_missing');
    const featureIds = features.features
      .map((f: unknown) => (id((f as {featureId?: unknown})?.featureId) ? (f as {featureId: string}).featureId : undefined))
      .filter((featureId): featureId is string => !!featureId);
    return Object.freeze({featureCount: features.features.length, featureIds: Object.freeze(featureIds)});
  }

  private async currentMicroversion(documentId: string, workspaceId: string): Promise<string> {
    const response = await this.get(`documents/d/${documentId}/w/${workspaceId}/currentmicroversion`) as {microversion?: unknown};
    if (!id(response?.microversion)) throw new Error('provider_protocol_error');
    return response.microversion;
  }

  private assertCandidateIsolation(binding: Binding, workspaceId: string): void {
    if (workspaceId === binding.primaryWorkspaceId) throw new Error('protected_primary_workspace');
    if (workspaceId === binding.workspaceId) throw new Error('candidate_not_isolated');
  }

  private async verifySourcePartStudio(binding: Binding, microversionId: string): Promise<void> {
    const elements = await this.get(`documents/d/${binding.documentId}/m/${microversionId}/elements`);
    if (!Array.isArray(elements) || elements.length > 1000 || elements.some(e => !id(e?.id))) throw new Error('provider_protocol_error');
    if (!elements.some(e => e.id === binding.elementId && e.elementType === 'PARTSTUDIO')) throw new Error('target_not_part_studio');
  }

  private async verifyCandidateBaseline(binding: Binding, workspaceId: string, workspaces: readonly WorkspaceInfo[], sourceMicroversionId: string): Promise<string> {
    this.assertCandidateIsolation(binding, workspaceId);
    const candidate = workspaces.find(w => w?.id === workspaceId);
    if (!candidate || candidate.documentId !== binding.documentId) throw new Error('workspace_not_in_document');
    const baseline = await this.currentMicroversion(binding.documentId, workspaceId);
    if (baseline !== sourceMicroversionId) throw new Error('candidate_revision_conflict');
    // The source Part Studio was checked at this exact document microversion.
    // Equal immutable baselines establish the same element membership/type.
    return baseline;
  }

  private assertWorkspaces(workspaces: unknown, binding: Binding): readonly WorkspaceInfo[] {
    if (!Array.isArray(workspaces) || ![binding.workspaceId, binding.primaryWorkspaceId].every(wid => workspaces.some(w => w?.id === wid))) {
      throw new Error('workspace_not_in_document');
    }
    return workspaces as readonly WorkspaceInfo[];
  }

  private async inspectSnapshot(binding: Binding) {
    validateTarget(binding, binding.documentId, binding.workspaceId);
    const doc = await this.get(`documents/${binding.documentId}`) as {id?: unknown};
    if (!doc || doc.id !== binding.documentId) throw new Error('provider_protocol_error');
    const workspaces = this.assertWorkspaces(await this.get(`documents/d/${binding.documentId}/workspaces`), binding);
    const elements = await this.get(`documents/d/${binding.documentId}/w/${binding.workspaceId}/elements`);
    if (!Array.isArray(elements) || elements.length > 1000 || elements.some(e => !id(e?.id))) throw new Error('provider_protocol_error');
    return {
      summary: {documentId: binding.documentId, workspaceId: binding.workspaceId, elementIds: elements.map(e => e.id)},
      elements: elements as readonly ElementInfo[],
      workspaces,
    };
  }

  async inspect(binding: Binding) {
    return (await this.inspectSnapshot(binding)).summary;
  }

  async render(binding: Binding) {
    if (!binding.elementId) throw new Error('target_missing');
    const {summary: inspected, elements} = await this.inspectSnapshot(binding);
    if (!inspected.elementIds.includes(binding.elementId)) throw new Error('target_not_part_studio');
    if (!elements.some(e => e.id === binding.elementId && e.elementType === 'PARTSTUDIO')) throw new Error('target_not_part_studio');
    const features = await this.get(`partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`) as SourceFeatures;
    if (!id(features?.sourceMicroversion) || !Array.isArray(features.features) || features.features.length > 1000) throw new Error('source_revision_missing');
    const microversionId = features.sourceMicroversion;
    const pinned = await this.get(`documents/d/${binding.documentId}/m/${microversionId}/elements`);
    if (!Array.isArray(pinned) || !pinned.some(e => e?.id === binding.elementId && e.elementType === 'PARTSTUDIO')) throw new Error('target_not_part_studio');
    const query = new URLSearchParams({
      viewMatrix: VIEW_MATRIX,
      outputWidth: String(IMAGE_SIZE),
      outputHeight: String(IMAGE_SIZE),
      pixelSize: '0',
      edges: 'show',
      useAntiAliasing: 'false',
    });
    const bytes = decodePng(await this.get(`partstudios/d/${binding.documentId}/m/${microversionId}/e/${binding.elementId}/shadedviews?${query}`, 8_000_000));
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

  async prepareCandidateWorkspace(binding: Binding, input: PrepareCandidateWorkspaceInput): Promise<PrepareCandidateWorkspaceResult> {
    validateTarget(binding, binding.documentId, binding.workspaceId);
    if (!binding.elementId) throw new Error('target_missing');
    const unavailable = (reason: 'oauth_write_scope_missing' | 'app_permission_write_disabled' | 'app_permission_write_unknown' | 'agent_policy_denied', requiredAction: string): PrepareCandidateWorkspaceResult => ({
      status:'unavailable',
      operation:'create_candidate_workspace',
      availability:'UNAVAILABLE',
      reason,
      requiredAction,
    });
    if (input.authorization) {
      if (!input.authorization.internalAuthorization) return unavailable('agent_policy_denied','This operation is intentionally blocked by current Claw-Onshape agent policy.');
      if (input.authorization.applicationWritePermission === 'disabled') return unavailable('app_permission_write_disabled','Ask the operator to enable document write permission for the Onshape OAuth application, then reconnect.');
      if (input.authorization.applicationWritePermission === 'unknown') return unavailable('app_permission_write_unknown','Ask the operator to confirm write permission state, then reconnect with explicit write consent.');
      if (!input.authorization.oauthWriteScope) return unavailable('oauth_write_scope_missing','Reconnect Onshape and explicitly authorize REST write access.');
    } else if (!input.restWriteAuthorized) return unavailable('oauth_write_scope_missing','Reconnect Onshape and explicitly authorize REST write access.');
    if (!id(input.sourceMicroversionId)) throw new Error('invalid_arguments');
    if (input.candidateWorkspaceId !== undefined && !id(input.candidateWorkspaceId)) throw new Error('invalid_arguments');
    if (input.candidateWorkspaceId !== undefined) this.assertCandidateIsolation(binding, input.candidateWorkspaceId);
    if (input.candidateWorkspaceName !== undefined && (typeof input.candidateWorkspaceName !== 'string' || input.candidateWorkspaceName.length < 1 || input.candidateWorkspaceName.length > 120)) {
      throw new Error('invalid_arguments');
    }

    const doc = await this.get(`documents/${binding.documentId}`) as {id?: unknown};
    if (!doc || doc.id !== binding.documentId) throw new Error('provider_protocol_error');
    const workspaces = this.assertWorkspaces(await this.get(`documents/d/${binding.documentId}/workspaces`), binding);
    const features = await this.get(`partstudios/d/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}/features`) as SourceFeatures;
    if (!id(features?.sourceMicroversion)) throw new Error('source_revision_missing');
    if (features.sourceMicroversion !== input.sourceMicroversionId) throw new Error('source_revision_conflict');
    const featureMetadata = this.sanitizeFeatureMetadata(features);

    await this.verifySourcePartStudio(binding, input.sourceMicroversionId);

    const latestSourceRevision = await this.currentMicroversion(binding.documentId, binding.workspaceId);
    if (latestSourceRevision !== input.sourceMicroversionId) throw new Error('source_revision_conflict');

    if (input.candidateWorkspaceId !== undefined) {
      const candidateBaselineMicroversionId = await this.verifyCandidateBaseline(binding, input.candidateWorkspaceId, workspaces, input.sourceMicroversionId);
      return {
        status: 'ok',
        created: false,
        references: {
          documentId: binding.documentId,
          primaryWorkspaceId: binding.primaryWorkspaceId,
          sourceWorkspaceId: binding.workspaceId,
          sourceElementId: binding.elementId,
          sourceMicroversionId: input.sourceMicroversionId,
          candidateWorkspaceId: input.candidateWorkspaceId,
          candidateBaselineMicroversionId,
        },
        featureMetadata,
        sourceWorkspaceUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}`,
        candidateWorkspaceUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${input.candidateWorkspaceId}/e/${binding.elementId}`,
      };
    }

    let createdWorkspace: WorkspaceInfo;
    try {
      createdWorkspace = await this.post(`documents/d/${binding.documentId}/workspaces`, {
        name: input.candidateWorkspaceName ?? `candidate-${input.sourceMicroversionId.slice(0, 12)}`,
        microversionId: input.sourceMicroversionId,
      }) as WorkspaceInfo;
    } catch (error) {
      if (error instanceof Error && error.message === 'provider_transport_error') {
        return {
          status: 'unknown',
          code: 'candidate_creation_unknown',
          references: {
            documentId: binding.documentId,
            primaryWorkspaceId: binding.primaryWorkspaceId,
            sourceWorkspaceId: binding.workspaceId,
            sourceElementId: binding.elementId,
            sourceMicroversionId: input.sourceMicroversionId,
          },
          featureMetadata,
          reconciliationRequired: true,
        };
      }
      throw error;
    }

    if (!id(createdWorkspace?.id) || createdWorkspace.documentId !== binding.documentId) throw new Error('provider_protocol_error');
    this.assertCandidateIsolation(binding, createdWorkspace.id);

    const updatedWorkspaces = this.assertWorkspaces(await this.get(`documents/d/${binding.documentId}/workspaces`), binding);
    const candidateBaselineMicroversionId = await this.verifyCandidateBaseline(binding, createdWorkspace.id, updatedWorkspaces, input.sourceMicroversionId);

    return {
      status: 'ok',
      created: true,
      references: {
        documentId: binding.documentId,
        primaryWorkspaceId: binding.primaryWorkspaceId,
        sourceWorkspaceId: binding.workspaceId,
        sourceElementId: binding.elementId,
        sourceMicroversionId: input.sourceMicroversionId,
        candidateWorkspaceId: createdWorkspace.id,
        candidateBaselineMicroversionId,
      },
      featureMetadata,
      sourceWorkspaceUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}`,
      candidateWorkspaceUrl: `https://cad.onshape.com/documents/${binding.documentId}/w/${createdWorkspace.id}/e/${binding.elementId}`,
    };
  }
}
