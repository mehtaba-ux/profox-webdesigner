/// <reference types="@cloudflare/workers-types" />

import { createClient } from '@supabase/supabase-js';

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  MEDIA_BUCKET?: R2Bucket;
  ENVIRONMENT?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

export interface WorkerExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}

type StaffIdentity = {
  id: string;
  role: string;
};

const ACTIVE_STAFF_ROLES = new Set([
  'admin',
  'sales',
  'sales_rep',
  'sales_team',
  'project_manager',
  'uiux_designer',
  'content_writer',
  'developer',
  'web_developer',
  'developer_designer',
  'qa',
  'site_manager',
  'editor',
]);
const MEDIA_MANAGER_ROLES = new Set(['admin', 'site_manager', 'editor']);
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SAFE_UPLOAD_KEY = /^(media|documents|profiles)\/\d{4}\/(0[1-9]|1[0-2])\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com",
  "script-src 'self' https://checkout.razorpay.com https://www.paypal.com https://www.paypalobjects.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.razorpay.com https://*.paypal.com",
  "frame-src https://api.razorpay.com https://*.razorpay.com https://www.paypal.com https://www.sandbox.paypal.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('Cross-Origin-Resource-Policy', 'same-site');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      ...headers,
    },
  });
}

function configuredPublishableKey(env: Env) {
  return env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
}

function privateCors(request: Request, env: Env, url: URL) {
  const origin = request.headers.get('Origin');
  const configuredOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const normalizedOrigin = origin?.replace(/\/$/, '') || '';
  const allowed = !origin || normalizedOrigin === url.origin || configuredOrigins.includes(normalizedOrigin);
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed) headers['Access-Control-Allow-Origin'] = origin;
  return { allowed, headers };
}

function bearerToken(request: Request) {
  const value = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || '';
}

async function requireActiveStaff(request: Request, env: Env): Promise<StaffIdentity | Response> {
  const url = new URL(request.url);
  const cors = privateCors(request, env, url);
  if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'A signed-in staff session is required.' }, 401, cors.headers);

  const supabaseUrl = env.SUPABASE_URL || '';
  const publishableKey = configuredPublishableKey(env);
  if (!supabaseUrl || !publishableKey) {
    return jsonResponse({ error: 'Worker authentication is not configured.' }, 503, cors.headers);
  }

  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ error: 'The staff session is invalid or expired.' }, 401, cors.headers);
  }

  const { data: profile, error: profileError } = await client
    .from('user_profiles')
    .select('role,status')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== 'active' || !ACTIVE_STAFF_ROLES.has(String(profile?.role || ''))) {
    return jsonResponse({ error: 'Active staff access is required.' }, 403, cors.headers);
  }

  return { id: userData.user.id, role: String(profile.role) };
}

function safeObjectKey(rawPath: string) {
  try {
    const key = decodeURIComponent(rawPath).replace(/^\/+/, '');
    const segments = key.split('/');
    if (
      !key ||
      key.length > 512 ||
      key.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(key) ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return '';
    }
    return key;
  } catch {
    return '';
  }
}

function encodedObjectPath(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function generatedUploadKey(contentType: string, fileName?: string) {
  const now = new Date();
  const prefix = contentType.startsWith('image/') ? 'media' : 'documents';
  const safeName = (fileName || `asset-${crypto.randomUUID()}`)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-150) || 'asset.bin';
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
}

function uploadKeyMatchesType(key: string, contentType: string) {
  if (!SAFE_UPLOAD_KEY.test(key)) return false;
  if (key.startsWith('profiles/') || key.startsWith('media/')) return contentType.startsWith('image/');
  return key.startsWith('documents/') && !contentType.startsWith('image/');
}

async function handleRequest(request: Request, env: Env, _ctx?: WorkerExecutionContext): Promise<Response> {
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
      return jsonResponse({
        status: 'ok',
        runtime: 'cloudflare-worker',
        timestamp: new Date().toISOString(),
        environment: env.ENVIRONMENT || 'production',
        r2StorageBound: Boolean(env.MEDIA_BUCKET),
        r2WriteAuthConfigured: Boolean(env.SUPABASE_URL && configuredPublishableKey(env)),
        freePlanTier: 'dynamic-worker-compatible',
      }, 200, { 'Access-Control-Allow-Origin': '*' });
    }

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      const cors = privateCors(request, env, url);
      if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);
      return new Response(null, {
        status: 204,
        headers: {
          ...cors.headers,
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/api/r2-upload' && request.method === 'POST') {
      const cors = privateCors(request, env, url);
      const identity = await requireActiveStaff(request, env);
      if (identity instanceof Response) return identity;
      if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);

      try {
        const declaredLength = Number(request.headers.get('Content-Length') || 0);
        if (declaredLength > MAX_UPLOAD_BYTES) {
          return jsonResponse({ error: 'The upload exceeds the 50 MB storage limit.' }, 413, cors.headers);
        }

        let contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        let fileData: ArrayBuffer;
        let fileName = '';
        let key = safeObjectKey(url.searchParams.get('path') || '');

        if ((request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
          const formData = await request.formData();
          const file = formData.get('file');
          if (!(file instanceof File)) return jsonResponse({ error: 'No file was provided.' }, 400, cors.headers);
          contentType = file.type.toLowerCase();
          fileName = file.name;
          fileData = await file.arrayBuffer();
        } else {
          fileData = await request.arrayBuffer();
        }

        if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
          return jsonResponse({ error: 'This file type is not allowed.' }, 415, cors.headers);
        }
        if (fileData.byteLength === 0) return jsonResponse({ error: 'The uploaded file is empty.' }, 400, cors.headers);
        if (fileData.byteLength > MAX_UPLOAD_BYTES) {
          return jsonResponse({ error: 'The upload exceeds the 50 MB storage limit.' }, 413, cors.headers);
        }

        if (!key) key = generatedUploadKey(contentType, fileName);
        if (!uploadKeyMatchesType(key, contentType)) {
          return jsonResponse({ error: 'The storage path is invalid for this file type.' }, 400, cors.headers);
        }
        if (await env.MEDIA_BUCKET.head(key)) {
          return jsonResponse({ error: 'An object already exists at this storage path.' }, 409, cors.headers);
        }

        const stored = await env.MEDIA_BUCKET.put(key, fileData, {
          httpMetadata: {
            contentType,
            contentDisposition: contentType.startsWith('image/') ? 'inline' : `attachment; filename="${key.split('/').pop()}"`,
          },
          customMetadata: {
            uploadedBy: identity.id,
            uploadedByRole: identity.role,
          },
          onlyIf: { etagDoesNotMatch: '*' },
        });
        if (!stored) return jsonResponse({ error: 'The object could not be stored because its path changed.' }, 409, cors.headers);

        return jsonResponse({
          success: true,
          url: `${url.origin}/api/r2-media/${encodedObjectPath(key)}`,
          path: key,
          size: fileData.byteLength,
          contentType,
        }, 201, cors.headers);
      } catch (error: unknown) {
        console.error('R2 upload error:', error);
        return jsonResponse({ error: 'The file could not be stored in R2.' }, 500, cors.headers);
      }
    }

    if (url.pathname.startsWith('/api/r2-media/') && (request.method === 'GET' || request.method === 'HEAD')) {
      const key = safeObjectKey(url.pathname.slice('/api/r2-media/'.length));
      if (!key) return new Response('Media key required', { status: 400 });
      if (!env.MEDIA_BUCKET) return new Response('R2 storage is not available', { status: 503 });

      const isPrivateDocument = key.startsWith('documents/');
      if (isPrivateDocument) {
        const identity = await requireActiveStaff(request, env);
        if (identity instanceof Response) return identity;
      }

      const object = request.method === 'HEAD' ? await env.MEDIA_BUCKET.head(key) : await env.MEDIA_BUCKET.get(key);
      if (!object) return new Response('Media not found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('ETag', object.httpEtag);
      headers.set('Cache-Control', isPrivateDocument ? 'private, no-store' : 'public, max-age=31536000, immutable');
      if (!isPrivateDocument) headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Content-Type-Options', 'nosniff');
      if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers });
      return new Response(request.method === 'HEAD' ? null : (object as R2ObjectBody).body, { headers });
    }

    if (url.pathname.startsWith('/api/r2-media/') && request.method === 'DELETE') {
      const cors = privateCors(request, env, url);
      const identity = await requireActiveStaff(request, env);
      if (identity instanceof Response) return identity;
      if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);

      const key = safeObjectKey(url.pathname.slice('/api/r2-media/'.length));
      if (!key) return jsonResponse({ error: 'A valid media key is required.' }, 400, cors.headers);
      const object = await env.MEDIA_BUCKET.head(key);
      if (!object) return jsonResponse({ error: 'Media was not found.' }, 404, cors.headers);

      const ownsProfileObject = key.startsWith('profiles/') && object.customMetadata?.uploadedBy === identity.id;
      if (!MEDIA_MANAGER_ROLES.has(identity.role) && !ownsProfileObject) {
        return jsonResponse({ error: 'Media Manager access is required to delete this object.' }, 403, cors.headers);
      }

      await env.MEDIA_BUCKET.delete(key);
      return jsonResponse({ success: true, deleted: key }, 200, cors.headers);
    }

    if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'API endpoint not found.' }, 404);

    try {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const response = await env.ASSETS.fetch(request);
        if (response.status !== 404) {
          const newHeaders = new Headers(response.headers);
          newHeaders.set('X-Content-Type-Options', 'nosniff');
          newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
          newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
          if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.svg')) {
            newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          }
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        }

        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      }
    } catch (error) {
      console.error('Worker asset fetch error:', error);
    }

    return fetch(request);
}

export default {
  async fetch(request: Request, env: Env, ctx?: WorkerExecutionContext): Promise<Response> {
    return withSecurityHeaders(await handleRequest(request, env, ctx));
  },
};
