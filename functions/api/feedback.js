// POST /api/feedback —— 接收反馈，转发到 Telegram 群
// type: 'fake' 举报假网站（默认） / 'new' 推荐新网站
// 需要在 Cloudflare Pages 环境变量里配置：TG_BOT_TOKEN、TG_CHAT_ID
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json().catch(() => ({}));
    if (data.website) return json({ ok: false, msg: "spam" }, 400); // 蜜罐
    if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID)
      return json({ ok: false, msg: "not_configured" }, 503);

    let text;
    if (data.type === "new") {
      const name = String(data.name || "").slice(0, 100).trim();
      const url = String(data.url || "").slice(0, 200).trim();
      const desc = String(data.desc || "").slice(0, 500).trim();
      if (!name) return json({ ok: false, msg: "empty" }, 400);
      text =
        "✨ 认官网-新网站推荐\n" +
        "名称：" + name + "\n" +
        "官网：" + (url || "未填") + "\n" +
        "介绍：" + (desc || "无");
    } else {
      const fake = String(data.fake || "").slice(0, 200).trim();
      const real = String(data.real || "").slice(0, 100).trim();
      const note = String(data.note || "").slice(0, 500).trim();
      if (!fake && !real) return json({ ok: false, msg: "empty" }, 400);
      text =
        "🙋 认官网-假网站反馈\n" +
        "假网站：" + (fake || "未填") + "\n" +
        "冒充对象：" + (real || "未填") + "\n" +
        "补充说明：" + (note || "无");
    }
    return await sendTG(env, text);
  } catch (e) {
    return json({ ok: false, msg: "error" }, 500);
  }
}

async function sendTG(env, text) {
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
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
