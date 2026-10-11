export async function jsonRequest(fetcher: typeof fetch, url: string, init: RequestInit, maxBytes=1024*1024): Promise<unknown> {
  try {
    const r = await fetcher(url, {...init,redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error(r.status === 401 ? 'reconnect_required' : r.status === 403 ? 'provider_forbidden' : r.status === 404 ? 'provider_not_found' : r.status === 429 ? 'provider_rate_limited' : 'provider_unavailable');
    if (!r.headers.get('content-type')?.includes('application/json')) throw new Error('provider_protocol_error');
    // Bound streaming reads; do not buffer an arbitrary provider body.
    const reader = r.body?.getReader();
    if (!reader) throw new Error('provider_protocol_error');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const {value,done} = await reader.read(); if (done) break;
        size += value.length;
        if (size > maxBytes) {await reader.cancel(); throw new Error('provider_protocol_error');}
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    const allowed = ['reconnect_required','provider_forbidden','provider_not_found','provider_rate_limited','provider_unavailable','provider_protocol_error'];
    throw new Error(e instanceof Error && allowed.includes(e.message) ? e.message : 'provider_transport_error');
  }
}
