export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  ENVIRONMENT?: string;
}

export interface WorkerExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}

export default {
  async fetch(request: Request, env: Env, ctx?: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Dynamic API Endpoints handled directly on Cloudflare Edge Worker
    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          runtime: 'cloudflare-worker',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT || 'production',
          freePlanTier: 'dynamic-worker-compatible',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 2. Dynamic CORS Preflight Handling for any API extensions
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 3. Delegate to static assets binding with single-page-application fallback
    try {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const response = await env.ASSETS.fetch(request);
        
        // If the asset exists, attach security and caching headers
        if (response.status !== 404) {
          const newHeaders = new Headers(response.headers);
          newHeaders.set('X-Content-Type-Options', 'nosniff');
          newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
          newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          
          // Long-term immutable caching for hashed static assets
          if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.svg')) {
            newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          }

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        }

        // SPA Fallback: Serve index.html for unknown HTML navigation routes
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      }
    } catch (err) {
      console.error('Worker asset fetch error:', err);
    }

    // Fallback response if no assets binding is found
    return fetch(request);
  },
};
