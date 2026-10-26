// GET /api/visits —— 本站累计访问计数
// 存储用 Cloudflare KV：需在 Pages 项目后台绑定一个 KV 命名空间，变量名 RGW_KV。
// 未绑定时返回 enabled:false，前端自动把计数隐藏，页面不受影响。
// ?hit=1 计一次（前端每浏览器会话只发一次，刷新不重复计）；不带 hit 只读数。
// 注意：KV 是 read-modify-write，高并发下极小概率丢计次，展示用计数可接受。
export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    // 变量名 RGW_KV 与 RGW_kv 都认（后台绑定时大小写容易写岔）
    const kv = env && (env.RGW_KV || env.RGW_kv);
    if (!kv) return json({ ok: true, enabled: false, count: null });
    const url = new URL(request.url);
    let n = parseInt((await kv.get("total")) || "0", 10) || 0;
    if (url.searchParams.get("hit") === "1") {
      n += 1;
      await kv.put("total", String(n));
    }
    return json({ ok: true, enabled: true, count: n });
  } catch (e) {
    return json({ ok: true, enabled: false, count: null });
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
