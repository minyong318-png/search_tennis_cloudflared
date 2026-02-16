// Workers/src/api_push_debug_gif.js

export async function handlePushDebugGif(req, env) {
  const url = new URL(req.url);

  // no-cors GET이라 바디를 못 보내는 환경에서도,
  // query string은 거의 항상 넘어온다.
  const t = url.searchParams.get("t");
  const from = url.searchParams.get("from");
  const note = url.searchParams.get("note");

  console.log("[PUSH_DEBUG_GIF] arrived", {
    t,
    from,
    note,
    ua: req.headers.get("user-agent") || null,
    cfRay: req.headers.get("cf-ray") || null,
  });

  // 204 No Content: 가장 단순하고, fetch(..., {mode:"no-cors"})에서도 잘 돌아감
  return new Response(null, { status: 204 });
}
