import {randomBytes, timingSafeEqual} from 'node:crypto';
import {jsonRequest} from './http.ts';
export const AUTHORIZE_URL = 'https://oauth.onshape.com/oauth/authorize';
export const TOKEN_URL = 'https://oauth.onshape.com/oauth/token';
export const REDIRECT_URI = 'http://localhost:8765';
export const OAUTH_SCOPE_READ = 'OAuth2Read';
export const OAUTH_SCOPE_WRITE = 'OAuth2Write';
export type OAuthScope =
  | typeof OAUTH_SCOPE_READ
  | typeof OAUTH_SCOPE_WRITE
  | 'OAuth2Delete'
  | 'OAuth2Purchase'
  | 'OAuth2Share'
  | 'OAuth2ReadPII';
export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  resource: 'https://cad.onshape.com/api/';
  scopes: readonly OAuthScope[];
};
const secret = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 8192 && !/\s/.test(x);
export const scopeToken = (x: unknown): x is OAuthScope =>
  typeof x === 'string' && /^(OAuth2(Read|Write|Delete|Purchase|Share|ReadPII))$/.test(x);
export function parseScopeList(value: unknown): readonly OAuthScope[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > 4096) {
    throw new Error('oauth_response_invalid');
  }
  const scopes = value.trim() ? value.trim().split(/\s+/) : [];
  if (!scopes.length || scopes.length > 32 || scopes.some((s) => !scopeToken(s))) {
    throw new Error('oauth_response_invalid');
  }
  return Object.freeze([...new Set(scopes)]) as readonly OAuthScope[];
}
export function parseTokens(
  value: unknown,
  now = Date.now(),
  requiredScopes: readonly OAuthScope[] = [OAUTH_SCOPE_READ],
  context?: 'consent' | 'refresh',
): Tokens {
  if (!requiredScopes.length || requiredScopes.length > 32 || !requiredScopes.every(scopeToken)) {
    throw new Error('oauth_response_invalid');
  }
  const v = value as Record<string, unknown> | null;
  const expiry = typeof v?.expires_in === 'string' && /^\d+$/.test(v.expires_in) ? Number(v.expires_in) : v?.expires_in;
  const parsedScopes = parseScopeList(v?.scope);
  // RFC 6749 permits omission only when the grant is unchanged. Inheritance
  // requires a completed consent exchange or the previous private refresh grant.
  if (!parsedScopes && !context) {
    throw new Error('oauth_response_invalid');
  }
  const grantedScopes = parsedScopes ?? Object.freeze([...new Set(requiredScopes)]);
  if (
    !v ||
    !secret(v.access_token) ||
    !secret(v.refresh_token) ||
    typeof expiry !== 'number' ||
    !Number.isInteger(expiry) ||
    expiry <= 0 ||
    expiry > 86400 ||
    String(v.token_type).toLowerCase() !== 'bearer' ||
    !requiredScopes.every((scope) => grantedScopes.includes(scope)) ||
    grantedScopes.some((scope) => !requiredScopes.includes(scope))
  ) {
    throw new Error('oauth_response_invalid');
  }
  return {
    accessToken: v.access_token,
    refreshToken: v.refresh_token,
    expiresAt: now + expiry * 1000,
    resource: 'https://cad.onshape.com/api/',
    scopes: grantedScopes,
  };
}
export class Consent {
  private readonly state = randomBytes(32).toString('base64url');
  private readonly deadline: number;
  private used = false;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetcher: typeof fetch;
  private readonly clock: () => number;
  private readonly redirectUri: string;
  private readonly requestedScopes: readonly OAuthScope[];
  constructor(
    clientId: string,
    clientSecret: string,
    fetcher: typeof fetch = fetch,
    clock: () => number = Date.now,
    redirectUri = REDIRECT_URI,
    requestedScopes: readonly OAuthScope[] = [OAUTH_SCOPE_READ],
  ) {
    if (
      !requestedScopes.includes(OAUTH_SCOPE_READ) ||
      requestedScopes.some((s) => s !== OAUTH_SCOPE_READ && s !== OAUTH_SCOPE_WRITE)
    ) {
      throw new Error('oauth_scope_configuration_invalid');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetcher = fetcher;
    this.clock = clock;
    this.deadline = clock() + 300000;
    this.redirectUri = redirectUri;
    this.requestedScopes = Object.freeze([...new Set(requestedScopes)]);
  }
  authorizationUrl(): string {
    const u = new URL(AUTHORIZE_URL);
    u.search = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.requestedScopes.join(' '),
      state: this.state,
    }).toString();
    return u.toString();
  }
  cancel(): void {
    this.used = true;
  }
  async complete(path: string, host: string): Promise<Tokens> {
    const redirect = new URL(this.redirectUri);
    if (
      this.used ||
      this.clock() >= this.deadline ||
      host !== redirect.host ||
      path.length > 8192 ||
      !path.startsWith(redirect.pathname + '?')
    ) {
      throw new Error('oauth_callback_invalid');
    }
    const u = new URL(path, this.redirectUri);
    const p = u.searchParams;
    const received = Buffer.from(p.get('state') ?? '');
    const expected = Buffer.from(this.state);
    if (
      u.origin !== redirect.origin ||
      u.pathname !== redirect.pathname ||
      u.hash ||
      [...p.keys()].some(
        (k) => !['state', 'code', 'error', 'error_description', 'error_uri'].includes(k) || p.getAll(k).length !== 1,
      ) ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error('oauth_callback_invalid');
    }
    this.used = true;
    if (p.has('error')) {
      throw new Error('oauth_consent_denied');
    }
    if (!secret(p.get('code'))) {
      throw new Error('oauth_callback_invalid');
    }
    try {
      const response = await jsonRequest(this.fetcher, TOKEN_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'},
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: p.get('code')!,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
        }),
      });
      return parseTokens(response, this.clock(), this.requestedScopes, 'consent');
    } catch {
      throw new Error('oauth_reconnect_required');
    }
  }
}
