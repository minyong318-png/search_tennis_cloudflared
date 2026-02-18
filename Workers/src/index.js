export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/whoami") {
      const r = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `token ${env.GITHUB_PAT}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "yongin-tennis-trigger"
        }
      });
      return new Response(await r.text(), { status: r.status });
    }

    if (url.pathname !== "/trigger") return new Response("not found", { status: 404 });

    const token = url.searchParams.get("token");
    if (!token || token !== env.TRIGGER_TOKEN) return new Response("forbidden", { status: 403 });

    const api = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW_ID}/dispatches`;

    const body = { ref: "main", inputs: { mode: "refresh" } };

    const res = await fetch(api, {
      method: "POST",
      headers: {
        "Authorization": `token ${env.GITHUB_PAT}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "yongin-tennis-trigger"
      },
      body: JSON.stringify(body),
    });

    if (res.status === 204) return new Response("ok");
    return new Response(`github error ${res.status}: ${await res.text()}`, { status: 500 });
  }
};
