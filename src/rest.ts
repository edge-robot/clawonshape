import {id, validateTarget} from './config.ts';
import type {Binding} from './config.ts';
import {jsonRequest} from './http.ts';
export const REST_BASE = 'https://cad.onshape.com/api/v10/';
export class RestClient {
  private readonly accessToken: () => Promise<string>;
  private readonly fetcher: typeof fetch;
  constructor(accessToken: () => Promise<string>, fetcher: typeof fetch = fetch) {this.accessToken=accessToken;this.fetcher=fetcher;}
  private async get(path: string): Promise<unknown> {
    const token = await this.accessToken();
    if (!token || /\s/.test(token)) throw new Error('reconnect_required');
    return jsonRequest(this.fetcher,REST_BASE+path,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
  }
  async inspect(b: Binding): Promise<{documentId:string; workspaceId:string; elementIds:string[]}> {
    validateTarget(b,b.documentId,b.workspaceId);
    const doc = await this.get(`documents/${b.documentId}`) as {id?:unknown};
    if (!doc || doc.id !== b.documentId) throw new Error('provider_protocol_error');
    const workspaces = await this.get(`documents/d/${b.documentId}/workspaces`);
    if (!Array.isArray(workspaces) || ![b.workspaceId,b.primaryWorkspaceId].every(wid => workspaces.some(w => w?.id === wid))) throw new Error('workspace_not_in_document');
    const elements = await this.get(`documents/d/${b.documentId}/w/${b.workspaceId}/elements`);
    if (!Array.isArray(elements) || elements.length > 1000 || elements.some(e => !id(e?.id))) throw new Error('provider_protocol_error');
    // Return identifiers only: provider-controlled names/fields cannot echo credentials.
    return {documentId:b.documentId,workspaceId:b.workspaceId,elementIds:elements.map(e => e.id)};
  }
}
