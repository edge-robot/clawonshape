import {randomBytes, timingSafeEqual} from 'node:crypto';
import {jsonRequest} from './http.ts';
export const AUTHORIZE_URL = 'https://oauth.onshape.com/oauth/authorize';
export const TOKEN_URL = 'https://oauth.onshape.com/oauth/token';
export const REDIRECT_URI = 'http://localhost:8765';
export type Tokens = {accessToken:string; refreshToken:string; expiresAt:number; resource:'https://cad.onshape.com/api/'};
const secret = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 8192 && !/\s/.test(x);
export function parseTokens(value: unknown, now = Date.now()): Tokens {
  const v = value as Record<string,unknown> | null;
  const expiry=typeof v?.expires_in==='string' && /^\d+$/.test(v.expires_in) ? Number(v.expires_in) : v?.expires_in;
  if (!v || !secret(v.access_token) || !secret(v.refresh_token) ||
    typeof expiry !== 'number' || !Number.isInteger(expiry) || expiry <= 0 || expiry > 86400 ||
    String(v.token_type).toLowerCase() !== 'bearer' ||
    (v.scope !== undefined && v.scope !== 'OAuth2Read')) throw new Error('oauth_response_invalid');
  return {accessToken:v.access_token,refreshToken:v.refresh_token,expiresAt:now+expiry*1000,resource:'https://cad.onshape.com/api/'};
}
export class Consent {
  private readonly state = randomBytes(32).toString('base64url');
  private readonly deadline: number;
  private used = false;
  private readonly clientId:string;
  private readonly clientSecret:string;
  private readonly fetcher:typeof fetch;
  private readonly clock:()=>number;
  constructor(clientId:string, clientSecret:string, fetcher:typeof fetch = fetch, clock:()=>number = Date.now) {
    this.clientId=clientId;this.clientSecret=clientSecret;this.fetcher=fetcher;this.clock=clock;this.deadline=clock()+300000;
  }
  authorizationUrl(): string {
    const u = new URL(AUTHORIZE_URL);
    u.search = new URLSearchParams({client_id:this.clientId,response_type:'code',redirect_uri:REDIRECT_URI,scope:'OAuth2Read',state:this.state}).toString();
    return u.toString();
  }
  cancel(): void {this.used=true;}
  async complete(path:string, host:string): Promise<Tokens> {
    if (this.used || this.clock() >= this.deadline || host !== 'localhost:8765' || path.length > 8192 || !path.startsWith('/?')) throw new Error('oauth_callback_invalid');
    const u = new URL(path,REDIRECT_URI); const p=u.searchParams;
    const received=Buffer.from(p.get('state') ?? ''); const expected=Buffer.from(this.state);
    if (u.origin !== REDIRECT_URI || u.pathname !== '/' || u.hash ||
      [...p.keys()].some(k => !['state','code','error','error_description','error_uri'].includes(k) || p.getAll(k).length !== 1) ||
      received.length !== expected.length || !timingSafeEqual(received,expected)) throw new Error('oauth_callback_invalid');
    this.used=true;
    if (p.has('error')) throw new Error('oauth_consent_denied');
    if (!secret(p.get('code'))) throw new Error('oauth_callback_invalid');
    try {
      const response = await jsonRequest(this.fetcher,TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
        body:new URLSearchParams({grant_type:'authorization_code',code:p.get('code')!,client_id:this.clientId,client_secret:this.clientSecret,redirect_uri:REDIRECT_URI})});
      return parseTokens(response,this.clock());
    } catch {throw new Error('oauth_reconnect_required');}
  }
}
