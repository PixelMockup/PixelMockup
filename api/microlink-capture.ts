export const config = { maxDuration: 30 };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return new Response(JSON.stringify({ error: 'url is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const width = searchParams.get('screenshot.width') ?? '1440';
  const height = searchParams.get('screenshot.height') ?? '900';
  const embed = searchParams.get('embed') ?? 'screenshot.url';

  const apiKey = req.headers.get('x-api-key') ?? process.env.MICROLINK_API_KEY ?? '';

  const params = new URLSearchParams({
    url,
    screenshot: 'true',
    meta: 'false',
    'screenshot.width': width,
    'screenshot.height': height,
    embed,
  });

  const upstream = `https://api.microlink.io?${params}`;

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(upstream, {
      headers,
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return new Response(JSON.stringify(body ?? { error: `Microlink ${res.status}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = res.headers.get('content-type') ?? '';
    const remaining = res.headers.get('x-rate-limit-remaining');

    if (contentType.includes('application/json')) {
      const data = await res.json() as {
        data?: { screenshot?: { url?: string } };
      };
      const screenshotUrl = data?.data?.screenshot?.url;
      if (!screenshotUrl) {
        return new Response(
          JSON.stringify({ error: 'No screenshot URL in Microlink response' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const imgRes = await fetch(screenshotUrl, { signal: AbortSignal.timeout(15_000) });
      if (!imgRes.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch Microlink screenshot: ${imgRes.status}` }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const imgBytes = await imgRes.arrayBuffer();
      return new Response(imgBytes, {
        status: 200,
        headers: {
          'Content-Type': imgRes.headers.get('content-type') ?? 'image/png',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800',
          'Access-Control-Allow-Origin': '*',
          ...(remaining ? { 'x-rate-limit-remaining': remaining } : {}),
        },
      });
    }

    const imageBytes = await res.arrayBuffer();
    return new Response(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'Access-Control-Allow-Origin': '*',
        ...(remaining ? { 'x-rate-limit-remaining': remaining } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
