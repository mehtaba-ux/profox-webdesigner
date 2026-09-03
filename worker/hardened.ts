/// <reference types="@cloudflare/workers-types" />

import baseWorker, { type Env, type WorkerExecutionContext } from './index';
import { ATTACHMENT_SCAN_ENGINE, scanMultipartUpload } from './attachmentScanner';

const SCANNED_UPLOAD_PATHS = new Set([
  '/api/communication-attachments/upload',
  '/api/communication-attachments/service-email-ingest',
]);

function blockedResponse(reason: string, signals: string[]) {
  return new Response(JSON.stringify({
    error: reason,
    scan: { status: 'blocked', engine: ATTACHMENT_SCAN_ENGINE, signals },
  }), {
    status: 422,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-ProFox-Attachment-Scan': `blocked; engine=${ATTACHMENT_SCAN_ENGINE}`,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx?: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let scanPassed = false;

    if (request.method === 'POST' && SCANNED_UPLOAD_PATHS.has(url.pathname)) {
      try {
        const scan = await scanMultipartUpload(request);
        if (!scan) return blockedResponse('Attachment security scan could not inspect the uploaded file.', ['scan-unavailable']);
        if (!scan.safe) return blockedResponse(scan.reason || 'The attachment was blocked by the security scanner.', scan.signals);
        scanPassed = true;
      } catch (error) {
        console.error('Attachment security scan failed:', error);
        return blockedResponse('Attachment security scan failed closed. Please try again with a different file.', ['scan-error']);
      }
    }

    const response = await baseWorker.fetch(request, env, ctx);
    if (!scanPassed) return response;

    const headers = new Headers(response.headers);
    headers.set('X-ProFox-Attachment-Scan', `clean; engine=${ATTACHMENT_SCAN_ENGINE}`);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
