const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const REQUEST_TIMEOUT_MS = 12000;

async function fetchOverpass(query: string) {
  let lastError: { status: number; details: string; endpoint: string } | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          "user-agent": "emergency-services-flame/1.0 (https://emergency-services-flame.vercel.app)",
        },
        body: query,
        signal: controller.signal,
      });

      const text = await response.text();
      if (response.ok) {
        return { ok: true as const, text };
      }

      lastError = {
        endpoint,
        status: response.status,
        details: text.slice(0, 500),
      };

      if (response.status !== 429 && response.status < 500) {
        return { ok: false as const, ...lastError };
      }
    } catch (error) {
      lastError = {
        endpoint,
        status: 502,
        details: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false as const, ...(lastError ?? { endpoint: "unknown", status: 502, details: "Unknown Overpass failure" }) };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const query = typeof req.body === "string" ? req.body : req.body?.query;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing Overpass query body" });
    return;
  }

  const result = await fetchOverpass(query);
  if (!result.ok) {
    res.status(result.status).json({
      error: "Overpass request failed",
      status: result.status,
      endpoint: result.endpoint,
      details: result.details,
    });
    return;
  }

  res.setHeader("content-type", "application/json");
  res.status(200).send(result.text);
}
