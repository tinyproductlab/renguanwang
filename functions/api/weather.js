// GET /api/weather —— 顶栏天气：按访客 IP 定位（Cloudflare request.cf 自带经纬度/城市），
// 数据走 Apple WeatherKit（开发者账号附送额度）。需在 Cloudflare Pages 环境变量配置：
// APPLE_TEAM_ID、APPLE_KEY_ID、APPLE_SERVICE_ID、APPLE_WK_PRIVATE_KEY（.p8 私钥全文）。
// 未配置时返回 { ok:false, reason:"not_configured" }，前端静默不显示。

function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlText(t) {
  return b64url(new TextEncoder().encode(t));
}
function pemToDer(pem) {
  const body = String(pem)
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function makeToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: env.APPLE_KEY_ID, id: env.APPLE_TEAM_ID };
  const payload = { iss: env.APPLE_TEAM_ID, iat: now, exp: now + 3600, sub: env.APPLE_SERVICE_ID };
  const unsigned = b64urlText(JSON.stringify(header)) + "." + b64urlText(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(env.APPLE_WK_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return unsigned + "." + b64url(sig);
}

export async function onRequestGet({ request, env }) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" },
    });
  if (!env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_SERVICE_ID || !env.APPLE_WK_PRIVATE_KEY) {
    return json({ ok: false, reason: "not_configured" });
  }
  const cf = request.cf || {};
  const lat = parseFloat(cf.latitude), lon = parseFloat(cf.longitude);
  if (!isFinite(lat) || !isFinite(lon)) return json({ ok: false, reason: "no_geo" });
  try {
    const token = await makeToken(env);
    const url = `https://weatherkit.apple.com/api/v1/weather/zh_CN/${lat}/${lon}?dataSets=currentWeather`;
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return json({ ok: false, reason: "weatherkit_" + r.status });
    const data = await r.json();
    const cur = data && data.currentWeather;
    if (!cur) return json({ ok: false, reason: "no_data" });
    return json({
      ok: true,
      city: cf.city || "",
      country: cf.country || "",
      temperature: Math.round(cur.temperature),
      conditionCode: cur.conditionCode || "",
      humidity: typeof cur.humidity === "number" ? Math.round(cur.humidity * 100) : null,
    });
  } catch (e) {
    return json({ ok: false, reason: "error", message: String(e && e.message || e) });
  }
}
