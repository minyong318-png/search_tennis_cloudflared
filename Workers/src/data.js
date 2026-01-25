export async function handleData(env) {
  const cached = await env.CACHE.get("DATA", { type: "json" });
  if (cached) {
    return Response.json(cached);
  }

  const data = await fetch(env.CRAWLER_URL).then(r => r.json());

  await env.CACHE.put("DATA", JSON.stringify(data), {
    expirationTtl: 60
  });

  return Response.json(data);
}