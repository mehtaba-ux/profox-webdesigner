// Cloudflare Pages Functions - Dynamic Edge Handler (Free Tier compatible)
export async function onRequest(context: { request: Request; env: Record<string, unknown> }): Promise<Response> {
  const url = new URL(context.request.url);

  if (url.pathname === '/api/health') {
    return new Response(
      JSON.stringify({
        status: 'ok',
        runtime: 'cloudflare-pages-function',
        timestamp: new Date().toISOString(),
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

  return new Response(
    JSON.stringify({ message: 'Profox Dynamic API Endpoint', path: url.pathname }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
