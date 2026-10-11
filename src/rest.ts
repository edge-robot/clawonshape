import {id, validateTarget} from './config.ts';
import type {Binding} from './config.ts';
import {jsonRequest} from './http.ts';
import {decodePng,VIEW_MATRIX,IMAGE_SIZE} from './render.ts';
export const REST_BASE = 'https://cad.onshape.com/api/v10/';
export class RestClient {
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: typeof fetch;
  constructor(accessToken: () => Promise<string>, fetcher: typeof fetch = fetch) {this.accessToken=accessToken;this.fetcher=fetcher;}
  private async get(path: string,maxBytes=1024*1024): Promise<unknown> {
    const token = await this.accessToken();
    if (!token || /\s/.test(token)) throw new Error('reconnect_required');
    return jsonRequest(this.fetcher,REST_BASE+path,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}},maxBytes);
  }
  private async inspectSnapshot(b: Binding) {
    validateTarget(b,b.documentId,b.workspaceId);
    const doc = await this.get(`documents/${b.documentId}`) as {id?:unknown};
    if (!doc || doc.id !== b.documentId) throw new Error('provider_protocol_error');
    const workspaces = await this.get(`documents/d/${b.documentId}/workspaces`);
    if (!Array.isArray(workspaces) || ![b.workspaceId,b.primaryWorkspaceId].every(wid => workspaces.some(w => w?.id === wid))) throw new Error('workspace_not_in_document');
    const elements = await this.get(`documents/d/${b.documentId}/w/${b.workspaceId}/elements`);
    if (!Array.isArray(elements) || elements.length > 1000 || elements.some(e => !id(e?.id))) throw new Error('provider_protocol_error');
    // Return identifiers only: provider-controlled names/fields cannot echo credentials.
    return {summary:{documentId:b.documentId,workspaceId:b.workspaceId,elementIds:elements.map(e => e.id)},elements};
  }
  async inspect(b:Binding){return (await this.inspectSnapshot(b)).summary;}
  async render(b:Binding){
    if(!b.elementId)throw new Error('target_missing');
    const {summary:inspected,elements}=await this.inspectSnapshot(b);
    if(!inspected.elementIds.includes(b.elementId))throw new Error('target_not_part_studio');
    // Resolve exact configured element; never choose by a provider-controlled name.
    if(!Array.isArray(elements)||!elements.some(e=>e?.id===b.elementId && e.elementType==='PARTSTUDIO'))throw new Error('target_not_part_studio');
    const features=await this.get(`partstudios/d/${b.documentId}/w/${b.workspaceId}/e/${b.elementId}/features`) as {sourceMicroversion?:unknown;features?:unknown};
    if(!id(features?.sourceMicroversion)||!Array.isArray(features.features)||features.features.length>1000)throw new Error('source_revision_missing');
    const microversionId=features.sourceMicroversion;
    // Verify membership/type at the same immutable reference that supplies the image.
    const pinned=await this.get(`documents/d/${b.documentId}/m/${microversionId}/elements`);
    if(!Array.isArray(pinned)||!pinned.some(e=>e?.id===b.elementId&&e.elementType==='PARTSTUDIO'))throw new Error('target_not_part_studio');
    const query=new URLSearchParams({viewMatrix:VIEW_MATRIX,outputWidth:String(IMAGE_SIZE),outputHeight:String(IMAGE_SIZE),pixelSize:'0',edges:'show',useAntiAliasing:'false'});
    const bytes=decodePng(await this.get(`partstudios/d/${b.documentId}/m/${microversionId}/e/${b.elementId}/shadedviews?${query}`,8_000_000));
    return {bytes,metadata:{status:'ok',code:'ready',message:'Onshape is connected and the Camera Mount Plate is available.',documentId:b.documentId,workspaceId:b.workspaceId,elementId:b.elementId,microversionId,
      view:'isometric',size:IMAGE_SIZE,featureCount:features.features.length,
      onshapeUrl:`https://cad.onshape.com/documents/${b.documentId}/w/${b.workspaceId}/e/${b.elementId}`,
      revisionUrl:`https://cad.onshape.com/documents/${b.documentId}/m/${microversionId}/e/${b.elementId}`}};
  }
}
