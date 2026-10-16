// POST /api/feedback —— 接收假网站举报，转发到 Telegram 群
// 需要在 Cloudflare Pages 环境变量里配置：TG_BOT_TOKEN、TG_CHAT_ID
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json().catch(() => ({}));
    if (data.website) return json({ ok: false, msg: "spam" }, 400); // 蜜罐
    const fake = String(data.fake || "").slice(0, 200).trim();
    const real = String(data.real || "").slice(0, 100).trim();
    const note = String(data.note || "").slice(0, 500).trim();
    if (!fake && !real) return json({ ok: false, msg: "empty" }, 400);
    if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID)
      return json({ ok: false, msg: "not_configured" }, 503);
    const text =
      "🙋 认官网-假网站反馈\n" +
      "假网站：" + (fake || "未填") + "\n" +
      "冒充对象：" + (real || "未填") + "\n" +
      "补充说明：" + (note || "无");
    const tg = await fetch(
      "https://api.telegram.org/bot" + env.TG_BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: text }),
      }
    );
    if (!tg.ok) return json({ ok: false, msg: "tg_fail" }, 502);
    return json({ ok: true });
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
