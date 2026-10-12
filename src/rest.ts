import {createHash,randomUUID} from 'node:crypto';
import {id, validateTarget,connectionOwner} from './config.ts';
import type {Binding} from './config.ts';
import {jsonRequest,ProviderHttpError} from './http.ts';
import {candidateAttempts,warnCandidate,CANDIDATE_MAX_BYTES} from './candidate-attempts.ts';
import type {CandidateAttempt,CandidateAttemptWarning} from './candidate-attempts.ts';
import {decodePng, IMAGE_SIZE, VIEW_MATRIX} from './render.ts';

export const REST_BASE = 'https://cad.onshape.com/api/v10/';

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
      availability: 'UNAVAILABLE';
      reason: 'oauth_write_scope_missing' | 'app_permission_write_disabled' | 'app_permission_write_unknown' | 'agent_policy_denied' | 'candidate_previous_attempt';
      attemptId?: string;
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
  // Explicit acknowledgement by the trusted caller, never an automatic retry.
  replaceCompletedAttemptId?: string;
}>;

type Receipt=Parameters<Parameters<Awaited<ReturnType<typeof candidateAttempts>>['exclusive']>[0]>[0];
type PreparationOptions=Readonly<{stateDir:string;warn?:CandidateAttemptWarning}>;

export class RestClient {
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: typeof fetch;
  private readonly preparation?: PreparationOptions;

  constructor(accessToken: () => Promise<string>, fetcher: typeof fetch = fetch, preparation?: PreparationOptions) {
    this.accessToken = accessToken;
    this.fetcher = fetcher;
    this.preparation = preparation;
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown, maxBytes = 1024 * 1024, beforeDispatch?:()=>Promise<void>): Promise<unknown> {
    const token = await this.accessToken();
    if (!token || /\s/.test(token)) throw new Error('reconnect_required');
    if(beforeDispatch)await beforeDispatch();
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

  private async post(path: string, body: unknown, beforeDispatch:()=>Promise<void>): Promise<unknown> {
    return this.request(path, 'POST', body,1024*1024,beforeDispatch);
  }

  private sanitizeFeatureMetadata(features: SourceFeatures): CandidateFeatureMetadata {
    if (!Array.isArray(features.features) || features.features.length > 1000) throw new Error('source_revision_missing');
    return Object.freeze({featureCount: features.features.length});
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
    if(![binding.primaryWorkspaceId,binding.elementId].every(id))throw new Error('invalid_arguments');
    if(input.candidateWorkspaceId!==undefined){
      if(input.replaceCompletedAttemptId!==undefined)throw new Error('invalid_arguments');
      return this.boundedCandidateResult(await this.prepareCandidateChecked(binding,input));
    }
    if(!this.preparation)throw new Error('candidate_store_required');
    const store=await candidateAttempts(this.preparation.stateDir,binding);
    const result=await store.exclusive(async receipt=>{
      const previous=await receipt.read();
      if(previous?.status==='UNKNOWN'||previous?.status==='CREATED_UNVERIFIED'){
        warnCandidate(this.candidateWarning(),'repeat_blocked',previous);
        return this.unresolvedCandidate(previous);
      }
      if(previous&&!input.replaceCompletedAttemptId){
        if(previous.status==='VERIFIED'&&this.sameCandidateSource(previous,binding,input.sourceMicroversionId)){
          return this.prepareCandidateChecked(binding,{...input,candidateWorkspaceId:previous.candidateWorkspaceId},undefined,previous.attemptId);
        }
        warnCandidate(this.candidateWarning(),'repeat_blocked',previous);
        return {status:'unavailable',operation:'create_candidate_workspace',availability:'UNAVAILABLE',reason:'candidate_previous_attempt',attemptId:previous.attemptId,
          requiredAction:'Acknowledge the completed attempt ID explicitly before starting a new preparation.'} as const;
      }
      if(input.replaceCompletedAttemptId!==undefined&&input.replaceCompletedAttemptId!==previous?.attemptId)throw new Error('candidate_attempt_mismatch');
      return this.prepareCandidateChecked(binding,input,receipt);
    });
    return this.boundedCandidateResult(result);
  }

  private candidateWarning():CandidateAttemptWarning{return this.preparation?.warn??(message=>console.warn(message));}

  private boundedCandidateResult(result:PrepareCandidateWorkspaceResult):PrepareCandidateWorkspaceResult{
    if(Buffer.byteLength(JSON.stringify(result))>CANDIDATE_MAX_BYTES)throw new Error('candidate_result_too_large');
    return result;
  }

  private sameCandidateSource(record:CandidateAttempt,binding:Binding,microversionId:string):boolean{
    return record.primaryWorkspaceId===binding.primaryWorkspaceId&&record.sourceWorkspaceId===binding.workspaceId&&record.sourceElementId===binding.elementId&&record.sourceMicroversionId===microversionId;
  }

  private unresolvedCandidate(record:CandidateAttempt):PrepareCandidateWorkspaceResult{
    const known=record.status==='CREATED_UNVERIFIED';
    return {status:known?'created_unverified':'unknown',code:known?'candidate_verification_pending':'candidate_creation_unknown',
      attemptId:record.attemptId,attemptStatus:known?'CREATED_UNVERIFIED':'UNKNOWN',
      ...(record.candidateWorkspaceId?{candidateWorkspaceId:record.candidateWorkspaceId}:{}),reconciliationRequired:true,
      requiredAction:'Reconcile this attempt in Onshape before requesting another workspace. No automatic retry.'};
  }

  private candidateSuccess(binding:Binding,sourceMicroversionId:string,candidateWorkspaceId:string,candidateBaselineMicroversionId:string,featureCount:number,created:boolean,attemptId?:string):PrepareCandidateWorkspaceResult{
    return {status:'ok',created,...(attemptId?{attemptId,attemptStatus:'VERIFIED' as const}:{}),references:{
      documentId:binding.documentId,primaryWorkspaceId:binding.primaryWorkspaceId,sourceWorkspaceId:binding.workspaceId,
      sourceElementId:binding.elementId!,sourceMicroversionId,candidateWorkspaceId,candidateBaselineMicroversionId,
    },featureMetadata:{featureCount},
    sourceWorkspaceUrl:`https://cad.onshape.com/documents/${binding.documentId}/w/${binding.workspaceId}/e/${binding.elementId}`,
    candidateWorkspaceUrl:`https://cad.onshape.com/documents/${binding.documentId}/w/${candidateWorkspaceId}/e/${binding.elementId}`};
  }

  // Only bounded fixed diagnostic codes enter receipts, never provider messages.
  private candidateFailureCode(error:unknown):string{
    const code=error instanceof Error?error.message:'';
    return ['provider_protocol_error','provider_transport_error','provider_unavailable','provider_forbidden','provider_not_found','provider_rate_limited','provider_conflict','reconnect_required','protected_primary_workspace','candidate_not_isolated','workspace_not_in_document','candidate_revision_conflict','target_not_part_studio','candidate_store_unavailable'].includes(code)?code:'provider_transport_error';
  }

  private async prepareCandidateChecked(binding:Binding,input:PrepareCandidateWorkspaceInput,receipt?:Receipt,existingAttemptId?:string):Promise<PrepareCandidateWorkspaceResult>{

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
      return this.candidateSuccess(binding,input.sourceMicroversionId,input.candidateWorkspaceId,candidateBaselineMicroversionId,featureMetadata.featureCount,false,existingAttemptId);
    }

    if(!receipt)throw new Error('candidate_store_required');
    const attemptId=randomUUID(),now=new Date().toISOString();
    const body={name:input.candidateWorkspaceName??`candidate-${attemptId}`,microversionId:input.sourceMicroversionId};
    let record:CandidateAttempt={schemaVersion:1,attemptId,ownerHash:connectionOwner(binding),documentId:binding.documentId,
      primaryWorkspaceId:binding.primaryWorkspaceId,sourceWorkspaceId:binding.workspaceId,sourceElementId:binding.elementId!,sourceMicroversionId:input.sourceMicroversionId,
      requestDigest:createHash('sha256').update(JSON.stringify(body)).digest('hex'),featureCount:featureMetadata.featureCount,status:'UNKNOWN',createdAt:now,updatedAt:now};
    let dispatched=false;
    try {
      const createdWorkspace=await this.post(`documents/d/${binding.documentId}/workspaces`,body,async()=>{
        await receipt.save(record);dispatched=true;
      }) as WorkspaceInfo;
      if(id(createdWorkspace?.id)){
        const expectedIdentity=createdWorkspace.documentId===binding.documentId&&createdWorkspace.id!==binding.primaryWorkspaceId&&createdWorkspace.id!==binding.workspaceId;
        record={...record,status:expectedIdentity?'CREATED_UNVERIFIED':'UNKNOWN',candidateWorkspaceId:createdWorkspace.id,updatedAt:new Date().toISOString()};
        await receipt.save(record);
      }
      if(!id(createdWorkspace?.id)||createdWorkspace.documentId!==binding.documentId)throw new Error('provider_protocol_error');
      this.assertCandidateIsolation(binding,createdWorkspace.id);
      const updatedWorkspaces=this.assertWorkspaces(await this.get(`documents/d/${binding.documentId}/workspaces`),binding);
      const baseline=await this.verifyCandidateBaseline(binding,createdWorkspace.id,updatedWorkspaces,input.sourceMicroversionId);
      record={...record,status:'VERIFIED',updatedAt:new Date().toISOString()};await receipt.save(record);
      return this.candidateSuccess(binding,input.sourceMicroversionId,createdWorkspace.id,baseline,featureMetadata.featureCount,true,attemptId);
    }catch(error){
      if(!dispatched)throw error;
      if(record.status==='VERIFIED')record={...record,status:'CREATED_UNVERIFIED'};
      // A received HTTP rejection is distinct from a lost response, timeout or
      // server error. In particular 408 is still an uncertain dispatch outcome.
      const rejected=record.status==='UNKNOWN'&&error instanceof ProviderHttpError&&error.status>=400&&error.status<500&&error.status!==408;
      record={...record,...(rejected?{status:'REJECTED' as const}:{}),code:this.candidateFailureCode(error),updatedAt:new Date().toISOString()};
      try{await receipt.save(record);}catch{record={...record,code:'candidate_store_unavailable'};}
      if(rejected)throw error;
      warnCandidate(this.candidateWarning(),'outcome_unresolved',record);
      return this.unresolvedCandidate(record);
    }
  }

  // Read-only reconciliation of a candidate ID actually returned by the POST.
  // A matching name or a vacant list is never treated as proof of its outcome.
  async reconcileCandidateWorkspace(binding:Binding,attemptId:string):Promise<PrepareCandidateWorkspaceResult>{
    validateTarget(binding,binding.documentId,binding.workspaceId);
    if(!this.preparation)throw new Error('candidate_store_required');
    const store=await candidateAttempts(this.preparation.stateDir,binding);
    const result=await store.exclusive(async receipt=>{
      let record=await receipt.read();
      if(!record||record.attemptId!==attemptId||!this.sameCandidateSource(record,binding,record.sourceMicroversionId))throw new Error('candidate_attempt_mismatch');
      if(record.status==='REJECTED')throw new Error('candidate_attempt_mismatch');
      if(record.status==='UNKNOWN'||!record.candidateWorkspaceId){warnCandidate(this.candidateWarning(),'repeat_blocked',record);return this.unresolvedCandidate(record);}
      try{
        const doc=await this.get(`documents/${binding.documentId}`) as {id?:unknown};
        if(doc?.id!==binding.documentId)throw new Error('provider_protocol_error');
        const workspaces=this.assertWorkspaces(await this.get(`documents/d/${binding.documentId}/workspaces`),binding);
        await this.verifySourcePartStudio(binding,record.sourceMicroversionId);
        const baseline=await this.verifyCandidateBaseline(binding,record.candidateWorkspaceId,workspaces,record.sourceMicroversionId);
        const {code:_,...clean}=record;record={...clean,status:'VERIFIED',updatedAt:new Date().toISOString()};await receipt.save(record);
        return this.candidateSuccess(binding,record.sourceMicroversionId,record.candidateWorkspaceId!,baseline,record.featureCount,false,record.attemptId);
      }catch(error){
        record={...record,status:'CREATED_UNVERIFIED',code:this.candidateFailureCode(error),updatedAt:new Date().toISOString()};
        try{await receipt.save(record);}catch{record={...record,code:'candidate_store_unavailable'};}
        warnCandidate(this.candidateWarning(),'outcome_unresolved',record);return this.unresolvedCandidate(record);
      }
    });
    return this.boundedCandidateResult(result);
  }
}
