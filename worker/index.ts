/// <reference types="@cloudflare/workers-types" />

import { createClient } from '@supabase/supabase-js';

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  MEDIA_BUCKET?: R2Bucket;
  ENVIRONMENT?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

export interface WorkerExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}

type StaffIdentity = { id: string; role: string };

const ACTIVE_STAFF_ROLES = new Set([
  'admin','sales','sales_rep','sales_team','project_manager','uiux_designer','content_writer',
  'developer','web_developer','developer_designer','qa','site_manager','editor',
]);
const MEDIA_MANAGER_ROLES = new Set(['admin', 'site_manager', 'editor']);
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime','video/mpeg',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv',
]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SAFE_UPLOAD_KEY = /^(media|documents|profiles)\/\d{4}\/(0[1-9]|1[0-2])\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;
const SAFE_ATTACHMENT_KEY = /^attachments\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f-]{36}-[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'self'",
  "form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com",
  "script-src 'self' https://checkout.razorpay.com https://www.paypal.com https://www.paypalobjects.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com","font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.razorpay.com https://*.paypal.com",
  "frame-src https://api.razorpay.com https://*.razorpay.com https://www.paypal.com https://www.sandbox.paypal.com",
  "worker-src 'self' blob:","manifest-src 'self'",'upgrade-insecure-requests',
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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate', ...headers },
  });
}

function configuredPublishableKey(env: Env) { return env.SUPABASE_PUBLISHABLE_KEY || ''; }

function privateCors(request: Request, env: Env, url: URL) {
  const origin = request.headers.get('Origin');
  const configuredOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);
  const normalizedOrigin = origin?.replace(/\/$/, '') || '';
  const allowed = !origin || normalizedOrigin === url.origin || configuredOrigins.includes(normalizedOrigin);
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed) headers['Access-Control-Allow-Origin'] = origin;
  return { allowed, headers };
}

function bearerToken(request: Request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  return match?.[1]?.trim() || '';
}

function publicChatToken(request: Request) {
  const token = (request.headers.get('X-ProFox-Chat-Token') || '').trim();
  return UUID_RE.test(token) ? token : '';
}

function attachmentServiceToken(request: Request) {
  return (request.headers.get('X-ProFox-Attachment-Ingest-Token') || '').trim();
}

function supabaseClientForRequest(request: Request, env: Env) {
  const supabaseUrl = env.SUPABASE_URL || '';
  const publishableKey = configuredPublishableKey(env);
  if (!supabaseUrl || !publishableKey) return null;
  const token = bearerToken(request);
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

function supabasePublicClient(env: Env) {
  const supabaseUrl = env.SUPABASE_URL || '';
  const publishableKey = configuredPublishableKey(env);
  if (!supabaseUrl || !publishableKey) return null;
  return createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAttachmentService(request: Request, env: Env) {
  const token = attachmentServiceToken(request);
  const client = supabasePublicClient(env);
  if (!token || !client) return { ok: false, token: '', client, response: jsonResponse({ error: 'Attachment service authentication is unavailable.' }, 401) };
  const { data, error } = await client.rpc('communication_attachment_validate_ingest_token', { p_token: token });
  if (error || data !== true) return { ok: false, token: '', client, response: jsonResponse({ error: 'Attachment service authentication failed.' }, 403) };
  return { ok: true, token, client, response: null as Response | null };
}

async function requireActiveStaff(request: Request, env: Env): Promise<StaffIdentity | Response> {
  const url = new URL(request.url);
  const cors = privateCors(request, env, url);
  if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);
  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'A signed-in staff session is required.' }, 401, cors.headers);
  const client = supabaseClientForRequest(request, env);
  if (!client) return jsonResponse({ error: 'Worker authentication is not configured.' }, 503, cors.headers);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: 'The staff session is invalid or expired.' }, 401, cors.headers);
  const { data: profile, error: profileError } = await client.from('user_profiles').select('role,status').eq('id', userData.user.id).maybeSingle();
  if (profileError || profile?.status !== 'active' || !ACTIVE_STAFF_ROLES.has(String(profile?.role || ''))) {
    return jsonResponse({ error: 'Active staff access is required.' }, 403, cors.headers);
  }
  return { id: userData.user.id, role: String(profile.role) };
}

function safeObjectKey(rawPath: string) {
  try {
    const key = decodeURIComponent(rawPath).replace(/^\/+/, '');
    const segments = key.split('/');
    if (!key || key.length > 512 || key.includes('\\') || /[\u0000-\u001f\u007f]/.test(key) || segments.some(s => !s || s === '.' || s === '..')) return '';
    return key;
  } catch { return ''; }
}

function encodedObjectPath(key: string) { return key.split('/').map(encodeURIComponent).join('/'); }

function generatedUploadKey(contentType: string, fileName?: string) {
  const now = new Date();
  const prefix = contentType.startsWith('image/') ? 'media' : 'documents';
  const safeName = (fileName || `asset-${crypto.randomUUID()}`).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '').slice(-150) || 'asset.bin';
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
}

function uploadKeyMatchesType(key: string, contentType: string) {
  if (!SAFE_UPLOAD_KEY.test(key)) return false;
  if (key.startsWith('profiles/') || key.startsWith('media/')) return contentType.startsWith('image/');
  return key.startsWith('documents/') && !contentType.startsWith('image/');
}

function cleanDownloadName(value: unknown) {
  const name = String(value || 'attachment').replace(/[\r\n"\\/]/g, '-').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name.slice(0, 180) || 'attachment';
}

async function handleAttachmentUpload(request: Request, env: Env, url: URL) {
  const cors = privateCors(request, env, url);
  if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);
  const client = supabaseClientForRequest(request, env);
  if (!client) return jsonResponse({ error: 'Attachment authorization is not configured.' }, 503, cors.headers);

  try {
    if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      return jsonResponse({ error: 'Attachment uploads must use multipart form data.' }, 415, cors.headers);
    }
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) return jsonResponse({ error: 'The upload exceeds the 50 MB storage limit.' }, 413, cors.headers);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return jsonResponse({ error: 'No file was provided.' }, 400, cors.headers);
    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) return jsonResponse({ error: 'This file type is not allowed.' }, 415, cors.headers);
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) return jsonResponse({ error: 'File size must be between 1 byte and 50 MB.' }, 413, cors.headers);

    const scope = String(form.get('scope') || '');
    const channel = String(form.get('channel') || '');
    const chatToken = publicChatToken(request) || null;
    let prepared: any = null;
    let rpcError: any = null;

    if (scope === 'sales') {
      const conversationId = String(form.get('conversationId') || '');
      if (!UUID_RE.test(conversationId)) return jsonResponse({ error: 'A valid conversation is required.' }, 400, cors.headers);
      const result = await client.rpc('communication_attachment_prepare_sales_upload', {
        p_conversation_id: conversationId,
        p_channel: channel,
        p_original_name: file.name,
        p_content_type: contentType,
        p_size_bytes: file.size,
        p_public_access_token: chatToken,
        p_internal_note: String(form.get('internalNote') || 'false') === 'true',
      });
      prepared = result.data; rpcError = result.error;
    } else if (scope === 'client_relationship') {
      const conversationId = String(form.get('conversationId') || '');
      if (!UUID_RE.test(conversationId)) return jsonResponse({ error: 'A valid client conversation is required.' }, 400, cors.headers);
      const result = await client.rpc('communication_attachment_prepare_client_portal_upload', {
        p_conversation_id: conversationId,
        p_original_name: file.name,
        p_content_type: contentType,
        p_size_bytes: file.size,
      });
      prepared = result.data; rpcError = result.error;
    } else if (scope === 'internal') {
      const threadId = String(form.get('threadId') || '');
      if (!UUID_RE.test(threadId)) return jsonResponse({ error: 'A valid project conversation is required.' }, 400, cors.headers);
      const result = await client.rpc('communication_attachment_prepare_internal_upload', {
        p_thread_id: threadId,
        p_original_name: file.name,
        p_content_type: contentType,
        p_size_bytes: file.size,
      });
      prepared = result.data; rpcError = result.error;
    } else {
      return jsonResponse({ error: 'Unsupported attachment scope.' }, 400, cors.headers);
    }

    if (rpcError || !prepared) return jsonResponse({ error: rpcError?.message || 'Attachment upload was not authorized.' }, 403, cors.headers);
    const attachmentId = String(prepared.attachmentId || '');
    const key = safeObjectKey(String(prepared.storageKey || ''));
    if (!UUID_RE.test(attachmentId) || !SAFE_ATTACHMENT_KEY.test(key)) return jsonResponse({ error: 'The authorized storage path is invalid.' }, 500, cors.headers);
    if (await env.MEDIA_BUCKET.head(key)) return jsonResponse({ error: 'An attachment already exists at this storage path.' }, 409, cors.headers);

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size) return jsonResponse({ error: 'The uploaded file size changed during transfer.' }, 400, cors.headers);
    const stored = await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType, contentDisposition: `attachment; filename="${cleanDownloadName(file.name)}"` },
      customMetadata: { attachmentId, communicationScope: scope },
      onlyIf: { etagDoesNotMatch: '*' },
    });
    if (!stored) return jsonResponse({ error: 'The attachment could not be stored because its path changed.' }, 409, cors.headers);

    const finalized = await client.rpc('communication_attachment_finalize_upload', {
      p_attachment_id: attachmentId,
      p_actual_size_bytes: bytes.byteLength,
      p_public_access_token: chatToken,
    });
    if (finalized.error) {
      await env.MEDIA_BUCKET.delete(key);
      return jsonResponse({ error: finalized.error.message || 'The stored attachment could not be finalized.' }, 403, cors.headers);
    }
    return jsonResponse({ success: true, attachment: { id: attachmentId, name: prepared.name, contentType, sizeBytes: bytes.byteLength, channel } }, 201, cors.headers);
  } catch (error) {
    console.error('Communication attachment upload error:', error);
    return jsonResponse({ error: 'The attachment could not be stored.' }, 500, cors.headers);
  }
}

async function handleServiceEmailIngest(request: Request, env: Env) {
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503);
  const auth = await requireAttachmentService(request, env);
  if (!auth.ok || !auth.client) return auth.response || jsonResponse({ error: 'Attachment service authentication failed.' }, 403);
  if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) return jsonResponse({ error: 'Multipart form data is required.' }, 415);

  try {
    const form = await request.formData();
    const file = form.get('file');
    const conversationId = String(form.get('conversationId') || '');
    const emailMessageId = String(form.get('emailMessageId') || '');
    const providerAttachmentId = String(form.get('providerAttachmentId') || '').trim();
    if (!(file instanceof File)) return jsonResponse({ error: 'Attachment file is required.' }, 400);
    if (!UUID_RE.test(conversationId) || !UUID_RE.test(emailMessageId) || !providerAttachmentId) return jsonResponse({ error: 'Inbound email attachment identifiers are invalid.' }, 400);
    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_UPLOAD_TYPES.has(contentType)) return jsonResponse({ error: 'This inbound attachment type is not allowed.' }, 415);
    if (file.size < 1 || file.size > MAX_UPLOAD_BYTES) return jsonResponse({ error: 'Inbound attachment size is outside the allowed range.' }, 413);

    const prepared = await auth.client.rpc('communication_attachment_service_prepare_email_ingest', {
      p_token: auth.token,
      p_conversation_id: conversationId,
      p_email_message_id: emailMessageId,
      p_provider_attachment_id: providerAttachmentId,
      p_original_name: file.name,
      p_content_type: contentType,
      p_size_bytes: file.size,
    });
    if (prepared.error || !prepared.data?.attachmentId) return jsonResponse({ error: prepared.error?.message || 'Inbound attachment was not authorized.' }, 403);

    const attachmentId = String(prepared.data.attachmentId);
    const key = safeObjectKey(String(prepared.data.storageKey || ''));
    if (!UUID_RE.test(attachmentId) || !SAFE_ATTACHMENT_KEY.test(key)) return jsonResponse({ error: 'Inbound attachment storage path is invalid.' }, 500);
    if (prepared.data.existing && String(prepared.data.state) === 'linked') {
      return jsonResponse({ success: true, existing: true, attachment: { id: attachmentId, name: prepared.data.name, contentType: prepared.data.contentType, sizeBytes: Number(prepared.data.sizeBytes || file.size), channel: 'email' } });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size) return jsonResponse({ error: 'Inbound attachment size changed during transfer.' }, 400);
    const existingObject = await env.MEDIA_BUCKET.head(key);
    if (!existingObject) {
      const stored = await env.MEDIA_BUCKET.put(key, bytes, {
        httpMetadata: { contentType, contentDisposition: `attachment; filename="${cleanDownloadName(file.name)}"` },
        customMetadata: { attachmentId, communicationScope: 'inbound_email' },
        onlyIf: { etagDoesNotMatch: '*' },
      });
      if (!stored) return jsonResponse({ error: 'Inbound attachment could not be written to R2.' }, 409);
    }

    const finalized = await auth.client.rpc('communication_attachment_service_finalize_email_ingest', {
      p_token: auth.token,
      p_attachment_id: attachmentId,
      p_actual_size_bytes: bytes.byteLength,
    });
    if (finalized.error || !finalized.data?.id) {
      if (!existingObject) await env.MEDIA_BUCKET.delete(key);
      return jsonResponse({ error: finalized.error?.message || 'Inbound attachment metadata could not be finalized.' }, 500);
    }
    return jsonResponse({ success: true, existing: false, attachment: finalized.data }, 201);
  } catch (error) {
    console.error('Inbound email R2 ingest failed:', error);
    return jsonResponse({ error: 'Inbound email attachment could not be stored.' }, 500);
  }
}

async function handleServiceEmailExport(request: Request, env: Env, attachmentId: string) {
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503);
  if (!UUID_RE.test(attachmentId)) return jsonResponse({ error: 'A valid attachment is required.' }, 400);
  const auth = await requireAttachmentService(request, env);
  if (!auth.ok || !auth.client) return auth.response || jsonResponse({ error: 'Attachment service authentication failed.' }, 403);
  const requestId = new URL(request.url).searchParams.get('requestId') || '';
  if (!UUID_RE.test(requestId)) return jsonResponse({ error: 'A valid email request is required.' }, 400);

  const allowed = await auth.client.rpc('communication_attachment_service_email_export', {
    p_token: auth.token,
    p_attachment_id: attachmentId,
    p_request_id: requestId,
  });
  if (allowed.error || !allowed.data) return jsonResponse({ error: allowed.error?.message || 'Email attachment export denied.' }, 403);
  const key = safeObjectKey(String(allowed.data.storageKey || ''));
  if (!SAFE_ATTACHMENT_KEY.test(key)) return jsonResponse({ error: 'Email attachment storage path is invalid.' }, 500);
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return jsonResponse({ error: 'Email attachment file was not found in R2.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const name = cleanDownloadName(allowed.data.name);
  headers.set('Content-Type', String(allowed.data.contentType || object.httpMetadata?.contentType || 'application/octet-stream'));
  headers.set('Content-Disposition', `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set('Content-Length', String(allowed.data.sizeBytes || object.size));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { status: 200, headers });
}

async function attachmentAuthorization(request: Request, env: Env, attachmentId: string, rpcName: 'communication_attachment_get_download' | 'communication_attachment_delete_authorize') {
  const client = supabaseClientForRequest(request, env);
  if (!client) return { error: jsonResponse({ error: 'Attachment authorization is not configured.' }, 503), data: null as any };
  const result = await client.rpc(rpcName, { p_attachment_id: attachmentId, p_public_access_token: publicChatToken(request) || null });
  return { error: result.error ? jsonResponse({ error: result.error.message || 'Attachment access denied.' }, 403) : null, data: result.data };
}

async function handleAttachmentDownload(request: Request, env: Env, url: URL, attachmentId: string) {
  const cors = privateCors(request, env, url);
  if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);
  if (!UUID_RE.test(attachmentId)) return jsonResponse({ error: 'A valid attachment is required.' }, 400, cors.headers);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);

  const auth = await attachmentAuthorization(request, env, attachmentId, 'communication_attachment_get_download');
  if (auth.error || !auth.data) return auth.error || jsonResponse({ error: 'Attachment access denied.' }, 403, cors.headers);
  const key = safeObjectKey(String(auth.data.storageKey || ''));
  if (!SAFE_ATTACHMENT_KEY.test(key)) return jsonResponse({ error: 'Attachment storage path is invalid.' }, 500, cors.headers);
  const object = request.method === 'HEAD' ? await env.MEDIA_BUCKET.head(key) : await env.MEDIA_BUCKET.get(key);
  if (!object) return jsonResponse({ error: 'Attachment file was not found.' }, 404, cors.headers);

  const headers = new Headers(cors.headers);
  object.writeHttpMetadata(headers);
  const fileName = cleanDownloadName(auth.data.name);
  headers.set('Content-Type', String(auth.data.contentType || object.httpMetadata?.contentType || 'application/octet-stream'));
  headers.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('ETag', object.httpEtag);
  return new Response(request.method === 'HEAD' ? null : (object as R2ObjectBody).body, { status: 200, headers });
}

async function handleAttachmentDelete(request: Request, env: Env, url: URL, attachmentId: string) {
  const cors = privateCors(request, env, url);
  if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);
  if (!UUID_RE.test(attachmentId)) return jsonResponse({ error: 'A valid attachment is required.' }, 400, cors.headers);
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);
  const client = supabaseClientForRequest(request, env);
  if (!client) return jsonResponse({ error: 'Attachment authorization is not configured.' }, 503, cors.headers);

  const authorize = await client.rpc('communication_attachment_delete_authorize', { p_attachment_id: attachmentId, p_public_access_token: publicChatToken(request) || null });
  if (authorize.error || !authorize.data) return jsonResponse({ error: authorize.error?.message || 'Attachment access denied.' }, 403, cors.headers);
  const key = safeObjectKey(String(authorize.data.storageKey || ''));
  if (!SAFE_ATTACHMENT_KEY.test(key)) return jsonResponse({ error: 'Attachment storage path is invalid.' }, 500, cors.headers);

  await env.MEDIA_BUCKET.delete(key);
  const marked = await client.rpc('communication_attachment_mark_deleted', { p_attachment_id: attachmentId, p_public_access_token: publicChatToken(request) || null });
  if (marked.error || marked.data !== true) return jsonResponse({ error: marked.error?.message || 'Attachment cleanup could not be finalized.' }, 500, cors.headers);
  return jsonResponse({ success: true, attachmentId }, 200, cors.headers);
}

async function handleRequest(request: Request, env: Env, _ctx?: WorkerExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/robots.txt') {
    const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /client-portal/\nDisallow: /api/\n\n# Sitemap location\nSitemap: ${url.origin}/sitemap.xml`;
    return new Response(robotsTxt, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
  }

  if (url.pathname === '/api/health') {
    return jsonResponse({ status: 'ok', runtime: 'cloudflare-worker', timestamp: new Date().toISOString(), environment: env.ENVIRONMENT || 'production', r2StorageBound: Boolean(env.MEDIA_BUCKET), r2WriteAuthConfigured: Boolean(env.SUPABASE_URL && configuredPublishableKey(env)), freePlanTier: 'dynamic-worker-compatible' }, 200, { 'Access-Control-Allow-Origin': '*' });
  }

  if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    const cors = privateCors(request, env, url);
    if (!cors.allowed) return jsonResponse({ error: 'Origin is not allowed.' }, 403, cors.headers);
    return new Response(null, { status: 204, headers: { ...cors.headers, 'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ProFox-Chat-Token, X-ProFox-Attachment-Ingest-Token', 'Access-Control-Max-Age': '86400' } });
  }

  if (url.pathname === '/api/communication-attachments/service-email-ingest' && request.method === 'POST') return handleServiceEmailIngest(request, env);
  const serviceExportMatch = /^\/api\/communication-attachments\/service-email-export\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (serviceExportMatch && request.method === 'GET') return handleServiceEmailExport(request, env, serviceExportMatch[1]);

  if (url.pathname === '/api/communication-attachments/upload' && request.method === 'POST') return handleAttachmentUpload(request, env, url);
  const attachmentMatch = /^\/api\/communication-attachments\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (attachmentMatch && (request.method === 'GET' || request.method === 'HEAD')) return handleAttachmentDownload(request, env, url, attachmentMatch[1]);
  if (attachmentMatch && request.method === 'DELETE') return handleAttachmentDelete(request, env, url, attachmentMatch[1]);

  if (url.pathname === '/api/r2-upload' && request.method === 'POST') {
    const cors = privateCors(request, env, url);
    const identity = await requireActiveStaff(request, env);
    if (identity instanceof Response) return identity;
    if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);
    try {
      const declaredLength = Number(request.headers.get('Content-Length') || 0);
      if (declaredLength > MAX_UPLOAD_BYTES) return jsonResponse({ error: 'The upload exceeds the 50 MB storage limit.' }, 413, cors.headers);
      let contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      let fileData: ArrayBuffer; let fileName = ''; let key = safeObjectKey(url.searchParams.get('path') || '');
      if ((request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
        const formData = await request.formData(); const file = formData.get('file');
        if (!(file instanceof File)) return jsonResponse({ error: 'No file was provided.' }, 400, cors.headers);
        contentType = file.type.toLowerCase(); fileName = file.name; fileData = await file.arrayBuffer();
      } else fileData = await request.arrayBuffer();
      if (!ALLOWED_UPLOAD_TYPES.has(contentType)) return jsonResponse({ error: 'This file type is not allowed.' }, 415, cors.headers);
      if (fileData.byteLength === 0) return jsonResponse({ error: 'The uploaded file is empty.' }, 400, cors.headers);
      if (fileData.byteLength > MAX_UPLOAD_BYTES) return jsonResponse({ error: 'The upload exceeds the 50 MB storage limit.' }, 413, cors.headers);
      if (!key) key = generatedUploadKey(contentType, fileName);
      if (!uploadKeyMatchesType(key, contentType)) return jsonResponse({ error: 'The storage path is invalid for this file type.' }, 400, cors.headers);
      if (await env.MEDIA_BUCKET.head(key)) return jsonResponse({ error: 'An object already exists at this storage path.' }, 409, cors.headers);
      const stored = await env.MEDIA_BUCKET.put(key, fileData, { httpMetadata: { contentType, contentDisposition: contentType.startsWith('image/') ? 'inline' : `attachment; filename="${key.split('/').pop()}"` }, customMetadata: { uploadedBy: identity.id, uploadedByRole: identity.role }, onlyIf: { etagDoesNotMatch: '*' } });
      if (!stored) return jsonResponse({ error: 'The object could not be stored because its path changed.' }, 409, cors.headers);
      return jsonResponse({ success: true, url: `${url.origin}/api/r2-media/${encodedObjectPath(key)}`, path: key, size: fileData.byteLength, contentType }, 201, cors.headers);
    } catch (error) { console.error('R2 upload error:', error); return jsonResponse({ error: 'The file could not be stored in R2.' }, 500, cors.headers); }
  }

  if (url.pathname.startsWith('/api/r2-media/') && (request.method === 'GET' || request.method === 'HEAD')) {
    const key = safeObjectKey(url.pathname.slice('/api/r2-media/'.length));
    if (!key) return new Response('Media key required', { status: 400 });
    if (!env.MEDIA_BUCKET) return new Response('R2 storage is not available', { status: 503 });
    const isPrivateDocument = key.startsWith('documents/');
    if (isPrivateDocument) { const identity = await requireActiveStaff(request, env); if (identity instanceof Response) return identity; }
    const object = request.method === 'HEAD' ? await env.MEDIA_BUCKET.head(key) : await env.MEDIA_BUCKET.get(key);
    if (!object) return new Response('Media not found', { status: 404 });
    const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', isPrivateDocument ? 'private, no-store' : 'public, max-age=31536000, immutable');
    if (!isPrivateDocument) headers.set('Access-Control-Allow-Origin', '*'); headers.set('X-Content-Type-Options', 'nosniff');
    if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers });
    return new Response(request.method === 'HEAD' ? null : (object as R2ObjectBody).body, { headers });
  }

  if (url.pathname.startsWith('/api/r2-media/') && request.method === 'DELETE') {
    const cors = privateCors(request, env, url); const identity = await requireActiveStaff(request, env);
    if (identity instanceof Response) return identity;
    if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 storage is not configured.' }, 503, cors.headers);
    const key = safeObjectKey(url.pathname.slice('/api/r2-media/'.length));
    if (!key) return jsonResponse({ error: 'A valid media key is required.' }, 400, cors.headers);
    const object = await env.MEDIA_BUCKET.head(key);
    if (!object) return jsonResponse({ error: 'Media was not found.' }, 404, cors.headers);
    const ownsProfileObject = key.startsWith('profiles/') && object.customMetadata?.uploadedBy === identity.id;
    if (!MEDIA_MANAGER_ROLES.has(identity.role) && !ownsProfileObject) return jsonResponse({ error: 'Media Manager access is required to delete this object.' }, 403, cors.headers);
    await env.MEDIA_BUCKET.delete(key); return jsonResponse({ success: true, deleted: key }, 200, cors.headers);
  }

  if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'API endpoint not found.' }, 404);

  try {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('X-Content-Type-Options', 'nosniff'); newHeaders.set('X-Frame-Options', 'SAMEORIGIN'); newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.svg')) newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
      }
      const indexRequest = new Request(new URL('/index.html', request.url), request);
      return await env.ASSETS.fetch(indexRequest);
    }
  } catch (error) { console.error('Worker asset fetch error:', error); }
  return fetch(request);
}

export default {
  async fetch(request: Request, env: Env, ctx?: WorkerExecutionContext): Promise<Response> {
    return withSecurityHeaders(await handleRequest(request, env, ctx));
  },
};
