const ALLOWED_ORIGINS = new Set([
  "https://search-tennis-court.pages.dev",
  // 필요하면 프리뷰/커스텀 도메인 추가:
  // "https://<your-custom-domain>",
  // "https://<your-preview>.pages.dev",
]);

function corsHeaders(origin) {
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
  }

  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(resp, origin) {
  const h = new Headers(resp.headers);
  const ch = corsHeaders(origin);
  for (const k in ch) h.set(k, ch[k]);
  return new Response(resp.body, { status: resp.status, headers: h });
}

function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function pickWorkflowId(target) {
  // ✅ 네가 분리해둔 파일명 그대로 사용
  if (target === "yongin") return "crawl.yml";
  if (target === "goyang") return "crawl_goyang.yml";
  return "crawl_all.yml";
}

function normalizeTarget(v) {
  v = String(v || "").toLowerCase().trim();
  if (v === "yongin" || v === "goyang" || v === "all") return v;
  return "all";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // ✅ Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ---------------------------
    // /whoami (디버그용)
    // ---------------------------
    if (url.pathname === "/whoami") {
      try {
        const r = await fetch("https://api.github.com/user", {
          headers: {
            "Authorization": `token ${env.GITHUB_PAT}`,
            "Accept": "application/vnd.github+json",
            "User-Agent": "tennis-trigger",
          },
        });
        const body = await r.text();
        return withCors(
          new Response(body, { status: r.status, headers: { "Content-Type": "application/json" } }),
          origin
        );
      } catch (e) {
        return withCors(jsonResponse({ ok: false, error: e?.message || String(e) }, 500), origin);
      }
    }

    // ---------------------------
    // /trigger
    // ---------------------------
    if (url.pathname !== "/trigger") {
      return withCors(jsonResponse({ ok: false, error: "not found" }, 404), origin);
    }

    // token 체크
    const token = url.searchParams.get("token");
    if (!token || token !== env.TRIGGER_TOKEN) {
      return withCors(jsonResponse({ ok: false, error: "forbidden" }, 403), origin);
    }

    // ✅ target 파라미터
    const target = normalizeTarget(url.searchParams.get("target") || "all");
    const workflowId = pickWorkflowId(target);

    // GitHub workflow dispatch API
    const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${workflowId}/dispatches`;

    // inputs: workflow에서 안 받아도 dispatch는 성공(204) 가능
    const body = { ref: "main", inputs: { mode: "refresh", target } };

    try {
      const res = await fetch(api, {
        method: "POST",
        headers: {
          "Authorization": `token ${env.GITHUB_PAT}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "tennis-trigger",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 204) {
        return withCors(jsonResponse({ ok: true, target, workflowId }, 200), origin);
      }

      const errText = await res.text().catch(() => "");
      return withCors(
        jsonResponse({ ok: false, target, workflowId, status: res.status, error: errText }, 500),
        origin
      );
    } catch (e) {
      return withCors(
        jsonResponse({ ok: false, target, workflowId, error: e?.message || String(e) }, 500),
        origin
      );
    }
  },
};