/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  MEDIA_BUCKET?: R2Bucket;
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
    if (url.pathname === '/robots.txt') {
      const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /client-portal/
Disallow: /api/

# Sitemap location
Sitemap: ${url.origin}/sitemap.xml`;
      return new Response(robotsTxt, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          runtime: 'cloudflare-worker',
          timestamp: new Date().toISOString(),
          environment: env.ENVIRONMENT || 'production',
          r2StorageBound: Boolean(env.MEDIA_BUCKET),
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

    // 2. Cloudflare R2 Image Upload Handler
    if (url.pathname === '/api/r2-upload' && request.method === 'POST') {
      try {
        if (!env.MEDIA_BUCKET) {
          return new Response(
            JSON.stringify({
              error: 'Cloudflare R2 Bucket binding (MEDIA_BUCKET) is not configured in wrangler.toml or Cloudflare dashboard.',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        const queryPath = url.searchParams.get('path');
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        
        let key = queryPath;
        let fileData: ArrayBuffer | Blob;

        if (contentType.includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file') as File | null;
          if (!file) {
            return new Response(JSON.stringify({ error: 'No file uploaded in form data' }), { status: 400 });
          }
          if (!key) {
            const ext = file.name.split('.').pop() || 'webp';
            key = `${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          }
          fileData = await file.arrayBuffer();
        } else {
          fileData = await request.arrayBuffer();
          if (!key) {
            const ext = contentType.split('/')[1] || 'webp';
            key = `${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}/${Date.now()}.${ext}`;
          }
        }

        await env.MEDIA_BUCKET.put(key, fileData, {
          httpMetadata: { contentType },
        });

        const publicUrl = `${url.origin}/api/r2-media/${key}`;

        return new Response(
          JSON.stringify({
            success: true,
            url: publicUrl,
            path: key,
            size: fileData.byteLength,
            contentType,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      } catch (err: any) {
        console.error('R2 upload error:', err);
        return new Response(
          JSON.stringify({ error: err?.message || 'Failed to store image in R2 storage' }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }
    }

    // 3. Serve stored images directly from R2 Bucket
    if (url.pathname.startsWith('/api/r2-media/') && request.method === 'GET') {
      const key = url.pathname.replace('/api/r2-media/', '');
      if (!key) {
        return new Response('Image key required', { status: 400 });
      }

      if (!env.MEDIA_BUCKET) {
        return new Response('R2 bucket not available', { status: 500 });
      }

      const object = await env.MEDIA_BUCKET.get(key);
      if (!object) {
        return new Response('Image not found in R2 storage', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(object.body, { headers });
    }

    // 4. Delete image from R2 Storage Bucket
    if (url.pathname.startsWith('/api/r2-media/') && request.method === 'DELETE') {
      const key = url.pathname.replace('/api/r2-media/', '');
      if (env.MEDIA_BUCKET && key) {
        await env.MEDIA_BUCKET.delete(key);
        return new Response(JSON.stringify({ success: true, deleted: key }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to delete' }), { status: 400 });
    }

    // 5. Dynamic CORS Preflight Handling
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

    // 6. Delegate to static assets binding with single-page-application fallback
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
