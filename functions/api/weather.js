// GET /api/weather —— 顶栏天气 + 搜索区天气背景，数据走 Apple WeatherKit（开发者账号附送额度）。
// 定位规则：①带 ?region=XX 参数时，用该国首都天气；②否则用访客 IP 定位（request.cf）
// 的城市；③IP 定位拿不到时，用 IP 所属国家的首都兜底。
// 需在 Cloudflare Pages 环境变量配置：APPLE_TEAM_ID、APPLE_KEY_ID、APPLE_SERVICE_ID、
// APPLE_WK_PRIVATE_KEY（.p8 私钥全文）。未配置时返回 { ok:false, reason:"not_configured" }。

// 国家/地区代码 → [首都中文名, 首都英文名, 纬度, 经度]
const CAPITALS = {
  AE:["阿布扎比","Abu Dhabi",24.4539,54.3773], AR:["布宜诺斯艾利斯","Buenos Aires",-34.6037,-58.3816],
  AT:["维也纳","Vienna",48.2082,16.3738], AU:["堪培拉","Canberra",-35.2809,149.1300],
  BE:["布鲁塞尔","Brussels",50.8503,4.3517], BR:["巴西利亚","Brasília",-15.7939,-47.8828],
  CA:["渥太华","Ottawa",45.4215,-75.6972], CH:["伯尔尼","Bern",46.9480,7.4474],
  CN:["北京","Beijing",39.9042,116.4074], CZ:["布拉格","Prague",50.0755,14.4378],
  DE:["柏林","Berlin",52.5200,13.4050], DK:["哥本哈根","Copenhagen",55.6761,12.5683],
  EG:["开罗","Cairo",30.0444,31.2357], ES:["马德里","Madrid",40.4168,-3.7038],
  FI:["赫尔辛基","Helsinki",60.1699,24.9384], FR:["巴黎","Paris",48.8566,2.3522],
  GB:["伦敦","London",51.5074,-0.1278], GR:["雅典","Athens",37.9838,23.7275],
  HK:["香港","Hong Kong",22.3193,114.1694], ID:["雅加达","Jakarta",-6.2088,106.8456],
  IE:["都柏林","Dublin",53.3498,-6.2603], IL:["耶路撒冷","Jerusalem",31.7683,35.2137],
  IN:["新德里","New Delhi",28.6139,77.2090], IT:["罗马","Rome",41.9028,12.4964],
  JP:["东京","Tokyo",35.6762,139.6503], KR:["首尔","Seoul",37.5665,126.9780],
  MX:["墨西哥城","Mexico City",19.4326,-99.1332], MY:["吉隆坡","Kuala Lumpur",3.1390,101.6869],
  NL:["阿姆斯特丹","Amsterdam",52.3676,4.9041], NO:["奥斯陆","Oslo",59.9139,10.7522],
  NZ:["惠灵顿","Wellington",-41.2865,174.7762], PH:["马尼拉","Manila",14.5995,120.9842],
  PL:["华沙","Warsaw",52.2297,21.0122], PT:["里斯本","Lisbon",38.7223,-9.1393],
  RU:["莫斯科","Moscow",55.7558,37.6173], SA:["利雅得","Riyadh",24.7136,46.6753],
  SE:["斯德哥尔摩","Stockholm",59.3293,18.0686], SG:["新加坡","Singapore",1.3521,103.8198],
  TH:["曼谷","Bangkok",13.7563,100.5018], TR:["安卡拉","Ankara",39.9334,32.8597],
  TW:["台北","Taipei",25.0330,121.5654], US:["华盛顿","Washington, D.C.",38.9072,-77.0369],
  VN:["河内","Hanoi",21.0278,105.8342], ZA:["比勒陀利亚","Pretoria",-25.7479,28.2293],
};
const WK_LANG = { zh:"zh_CN", zht:"zh_TW", en:"en_US", ja:"ja_JP", ko:"ko_KR", de:"de_DE", fr:"fr_FR", es:"es_ES", pt:"pt_PT" };

function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlText(t) { return b64url(new TextEncoder().encode(t)); }
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
  const header = { alg: "ES256", kid: env.APPLE_KEY_ID, id: `${env.APPLE_TEAM_ID}.${env.APPLE_SERVICE_ID}` };
  const payload = { iss: env.APPLE_TEAM_ID, iat: now, exp: now + 3600, sub: env.APPLE_SERVICE_ID };
  const unsigned = b64urlText(JSON.stringify(header)) + "." + b64urlText(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(env.APPLE_WK_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)
  );
  return unsigned + "." + b64url(sig);
}

export async function onRequestGet({ request, env }) {
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  if (!env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_SERVICE_ID || !env.APPLE_WK_PRIVATE_KEY) {
    return json({ ok: false, reason: "not_configured" });
  }
  const u = new URL(request.url);
  const region = (u.searchParams.get("region") || "").toUpperCase();
  const lang = u.searchParams.get("lang") || "zh";
  const zhName = lang === "zh" || lang === "zht";
  const cf = request.cf || {};
  let lat, lon, name, source;
  if (region && CAPITALS[region]) {
    const c = CAPITALS[region];
    lat = c[2]; lon = c[3]; name = zhName ? c[0] : c[1]; source = "capital";
  } else if (isFinite(parseFloat(cf.latitude)) && isFinite(parseFloat(cf.longitude))) {
    lat = parseFloat(cf.latitude); lon = parseFloat(cf.longitude);
    name = cf.city || ""; source = "ip";
  } else if (cf.country && CAPITALS[cf.country]) {
    const c = CAPITALS[cf.country];
    lat = c[2]; lon = c[3]; name = zhName ? c[0] : c[1]; source = "capital";
  } else {
    return json({ ok: false, reason: "no_geo" });
  }
  try {
    const token = await makeToken(env);
    const wkLang = WK_LANG[lang] || "en_US";
    const r = await fetch(
      `https://weatherkit.apple.com/api/v1/weather/${wkLang}/${lat}/${lon}?dataSets=currentWeather,forecastDaily`,
      { headers: { Authorization: "Bearer " + token } }
    );
    if (!r.ok) return json({ ok: false, reason: "weatherkit_" + r.status });
    const data = await r.json();
    const cur = data && data.currentWeather;
    if (!cur) return json({ ok: false, reason: "no_data" });
    const days = data.forecastDaily?.days || [];
    const today = days.find(day => Date.parse(day.forecastStart) <= Date.now() && Date.parse(day.forecastEnd) > Date.now()) || days[0];
    return json({
      ok: true,
      name,
      source,
      temperature: Math.round(cur.temperature),
      conditionCode: cur.conditionCode || "",
      isDaylight: today && Number.isFinite(Date.parse(today.sunrise || today.sunRise)) && Number.isFinite(Date.parse(today.sunset || today.sunSet))
        ? Date.now() >= Date.parse(today.sunrise || today.sunRise) && Date.now() < Date.parse(today.sunset || today.sunSet)
        : cur.isDaylight !== false,
      sunrise: today?.sunrise || today?.sunRise || null,
      sunset: today?.sunset || today?.sunSet || null,
      asOf: cur.asOf || null,
      attributionUrl: "https://weatherkit.apple.com/legal-attribution.html",
      humidity: typeof cur.humidity === "number" ? Math.round(cur.humidity * 100) : null,
    });
  } catch (e) {
    return json({ ok: false, reason: "error" });
  }
}
