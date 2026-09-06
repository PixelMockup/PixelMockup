type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

const FETCH_TIMEOUT_MS = 15_000;

function respondJson(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.json(body);
}

function headerStr(headers: Headers, name: string): string | undefined {
  const v = headers.get(name);
  return v != null ? v : undefined;
}

export async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    respondJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const sharedKey = process.env.MICROLINK_API_KEY;
  const baseUrl = 'https://api.microlink.io';
  const headers: Record<string, string> = {};
  if (sharedKey) headers['x-api-key'] = sharedKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}?url=https://example.com&screenshot=true&meta=false`,
      { headers, signal: controller.signal },
    );
  } catch (err) {
    clearTimeout(timer);
    respondJson(res, 500, {
      error: 'network_error',
      message: err instanceof Error ? err.message : 'Failed to reach Microlink',
    });
    return;
  } finally {
    clearTimeout(timer);
  }

  const rateLimitRemaining = headerStr(response.headers, 'x-rate-limit-remaining');
  const rateLimitLimit = headerStr(response.headers, 'x-rate-limit-limit');
  const rateLimitReset = headerStr(response.headers, 'x-rate-limit-reset');

  respondJson(res, 200, {
    provider: 'microlink',
    remaining: rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null,
    limit: rateLimitLimit ? parseInt(rateLimitLimit, 10) : null,
    resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : null,
  });
}

export const config = { maxDuration: 15 };
export default handler;