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

  const width = searchParams.get('width') ?? '1440';
  const height = searchParams.get('height') ?? '900';
  const type = searchParams.get('type') ?? 'png';

  const apiKey = req.headers.get('x-api-key') ?? process.env.SCREENSHOTAPI_KEY ?? '';
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'No API key configured. Add a ScreenshotAPI key in Settings or set SCREENSHOTAPI_KEY.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const params = new URLSearchParams({
    url,
    width,
    height,
    type,
  });

  const upstream = `https://screenshotapi.to/api/v1/screenshot?${params}`;

  try {
    const res = await fetch(upstream, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return new Response(JSON.stringify(body ?? { error: `ScreenshotAPI ${res.status}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const imageBytes = await res.arrayBuffer();
    const remaining = res.headers.get('x-credits-remaining');

    return new Response(imageBytes, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'Access-Control-Allow-Origin': '*',
        ...(remaining ? { 'x-credits-remaining': remaining } : {}),
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
