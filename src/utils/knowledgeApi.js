const KNOWLEDGE_API_URLS = [
  'http://localhost:3001/api/knowledge/extract',
  'http://127.0.0.1:8001/extract',
];

export async function extractKnowledge(text, graph) {
  for (const url of KNOWLEDGE_API_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, graph }),
        signal: controller.signal,
      });
      if (response.ok) return await response.json();
    } catch {
      // Try the next endpoint.
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}
