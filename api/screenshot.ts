// api/screenshot.ts
export const config = {
    maxDuration: 10, // Safely fits inside Vercel Hobby 10s limit
};

export default async function handler(req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return new Response(JSON.stringify({ error: 'URL is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // Google Lighthouse API (Free, bypasses all WAFs)
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&category=performance`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            return new Response(JSON.stringify({ error: 'Google API failed' }), { status: 500 });
        }

        const data = await response.json();
        const screenshotData = data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;

        if (!screenshotData || !screenshotData.startsWith('data:image')) {
            return new Response(JSON.stringify({ error: 'Screenshot could not be generated' }), { status: 404 });
        }

        const base64Data = screenshotData.replace(/^data:image\/jpeg;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        return new Response(imageBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to capture website' }), { status: 500 });
    }
}