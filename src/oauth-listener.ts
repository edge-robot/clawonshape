import {createServer} from 'node:http';
import type {Consent} from './oauth.ts';
export async function connect(
  consent: Consent,
  save: (tokens: Awaited<ReturnType<Consent['complete']>>) => Promise<void>,
  serverFactory: typeof createServer = createServer,
  publish: (url: string) => void = (url) => process.stdout.write(`Open this URL in your browser:\n${url}\n`),
): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  await new Promise<void>((resolve, reject) => {
    let finishing = false,
      settled = false,
      pending = 0;
    let failure: Error | undefined;
    const finish = (error?: Error) => {
      if (!finishing) {
        finishing = true;
        failure = error;
        clearTimeout(timer);
        consent.cancel();
        server.close();
      }
      // Keep the lifecycle lock until every admitted callback finishes. A timeout
      // must not release it while an atomic credential save can still complete.
      if (pending || settled) {
        return;
      }
      settled = true;
      if (failure) {
        reject(failure);
      } else {
        resolve();
      }
    };
    const server = serverFactory(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (req.method !== 'GET') {
        res.writeHead(405).end('GET required');
        return;
      }
      if (finishing) {
        res.writeHead(410).end('Reconnect from the CLI.');
        return;
      }
      pending++;
      try {
        const tokens = await consent.complete(req.url ?? '', req.headers.host ?? '');
        if (finishing) {
          throw new Error('oauth_connect_expired');
        }
        await save(tokens);
        res.end('Connected. Close this tab.');
        finish();
      } catch {
        res.writeHead(400).end('Connection failed. Reconnect from the CLI.');
        finish(new Error('oauth_reconnect_required'));
      } finally {
        pending--;
        if (finishing) {
          finish();
        }
      }
    });
    server.on('error', () => finish(new Error('oauth_listener_unavailable')));
    server.listen(8765, '127.0.0.1', () => publish(consent.authorizationUrl()));
    timer = setTimeout(() => finish(new Error('oauth_connect_expired')), 300000);
  });
}
