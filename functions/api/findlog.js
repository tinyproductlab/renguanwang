// GET /api/findlog?key=<FINDLOG_KEY> —— 站长拉取搜索缺口记录，按次数倒序。
// 需要在 Cloudflare Pages 环境变量里配置 FINDLOG_KEY（站长筛选补库时用）；
// 未配置时返回 not_configured，不影响 /api/find 的记录与前台。
export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    if (!env || !env.FINDLOG_KEY) return json({ ok: false, msg: "not_configured" }, 503);
    const url = new URL(request.url);
    if (url.searchParams.get("key") !== env.FINDLOG_KEY) return json({ ok: false, msg: "forbidden" }, 403);
    const kv = env.RGW_KV || env.RGW_kv;
    if (!kv) return json({ ok: false, msg: "no_kv" }, 503);
    const list = await kv.list({ prefix: "find:", limit: 500 });
    const records = [];
    for (const k of list.keys || []) {
      try {
        const rec = JSON.parse((await kv.get(k.name)) || "null");
        if (rec) records.push(rec);
      } catch (e) { /* 跳过坏记录 */ }
    }
    records.sort((a, b) => (b.count || 0) - (a.count || 0));
    return json({ ok: true, total: records.length, records });
  } catch (e) {
    return json({ ok: false, msg: "error" }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
