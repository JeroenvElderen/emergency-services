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

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: query,
    });

    const text = await response.text();
    if (!response.ok) {
      res.status(response.status).json({
        error: "Overpass request failed",
        status: response.status,
        details: text.slice(0, 500),
      });
      return;
    }

    res.setHeader("content-type", "application/json");
    res.status(200).send(text);
  } catch (error) {
    res.status(502).json({
      error: "Failed to reach Overpass",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
