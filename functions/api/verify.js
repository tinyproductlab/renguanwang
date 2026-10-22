// POST /api/verify —— 智能验真预检：用户输入网址 + 一句描述（它应该是什么网站），
// 多信号打分判断是不是官网：①站库比对 ②RDAP 域名年龄 ③抓页面对主体 ④仿冒特征。
// 可选 AI 层：在 Cloudflare Pages 环境变量配置 NVIDIA_API_KEY 后自动启用
// （可选 NVIDIA_MODEL，默认 meta/llama-3.3-70b-instruct）。未配置时只走规则版。
import { HOSTS, NAMES } from "../_db.js";

const SLD3 = new Set(["com","co","net","org","or","ne","gov","go","gob","gouv","edu","ac","mil","gen","info"]);
export function regDomain(host) {
  const parts = String(host || "").toLowerCase().split(".");
  if (parts.length <= 2) return String(host || "").toLowerCase();
  const tld = parts[parts.length - 1], sld = parts[parts.length - 2];
  if (tld.length === 2 && SLD3.has(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

// 注册域名 → 已收录站点（懒构建）
let REGMAP = null;
function regMap() {
  if (REGMAP) return REGMAP;
  REGMAP = {};
  for (const [host, v] of Object.entries(HOSTS)) {
    const reg = regDomain(host);
    if (!REGMAP[reg]) REGMAP[reg] = { name: v[0], url: v[1], host };
  }
  return REGMAP;
}

// 描述 → 库内品牌匹配（返回最可能的已收录站点）
export function matchByDesc(desc) {
  const core = String(desc || "")
    .replace(/官方网站|官网|官方|网站|主页|首页/g, "")
    .trim();
  if (core.length < 2) return null;
  const coreLow = core.toLowerCase();
  let best = null;
  for (const [name, host, latin] of NAMES) {
    const nameLow = name.toLowerCase();
    let hit = 0;
    if (nameLow === coreLow) hit = 3;
    else if (nameLow.includes(coreLow) || coreLow.includes(nameLow)) hit = 2;
    else if (latin && latin.split(" ").some((w) => w === coreLow || (coreLow.length >= 3 && w.includes(coreLow)))) hit = 1;
    if (hit && (!best || hit > best.hit)) best = { name, host, url: HOSTS[host] ? HOSTS[host][1] : "https://" + host, hit };
  }
  return best;
}

const cache = new Map(); // reg|core → {t, data}，同 isolate 内短时缓存
const CACHE_TTL = 10 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json().catch(() => ({}));
    const rawUrl = String(data.url || "").slice(0, 300).trim();
    const desc = String(data.desc || "").slice(0, 100).trim();
    if (!rawUrl) return json({ ok: false, msg: "empty_url" }, 400);

    let u;
    try {
      u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : "https://" + rawUrl);
    } catch (e) {
      return json({ ok: false, msg: "bad_url" }, 400);
    }
    if (!/^https?:$/.test(u.protocol)) return json({ ok: false, msg: "bad_url" }, 400);
    const host = u.hostname.toLowerCase();
    // SSRF 防护：不查本机/内网地址
    if (host === "localhost" || host.endsWith(".local") ||
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|\[)/.test(host))
      return json({ ok: false, msg: "blocked_host" }, 400);
    const reg = regDomain(host);

    const cacheKey = reg + "|" + desc;
    const hitCache = cache.get(cacheKey);
    if (hitCache && Date.now() - hitCache.t < CACHE_TTL) return json(hitCache.data);

    const result = await verify(u, host, reg, desc, env);
    if (cache.size > 300) cache.clear();
    cache.set(cacheKey, { t: Date.now(), data: result });
    return json(result);
  } catch (e) {
    return json({ ok: false, msg: "error" }, 500);
  }
}

async function verify(u, host, reg, desc, env) {
  const reasons = [];
  let score = 50;
  let suggestion = null;

  // ① 站库精确命中 → 直接定级
  const hostNoWww = host.replace(/^www\./, "");
  const dbHit = HOSTS[hostNoWww] || HOSTS[host];
  const brand = desc ? matchByDesc(desc) : null;
  if (dbHit) {
    reasons.push("该域名已在认官网库中收录（" + dbHit[0] + "），由人工核验过。");
    if (brand && regDomain(brand.host) !== reg)
      reasons.push("提醒：你描述的「" + brand.name + "」在库中的官网是 " + brand.host + "，与这个域名不是同一个站。");
    return finish({ ok: true, level: "verified", score: 100, host, reg, reasons,
      site: { name: dbHit[0], url: dbHit[1] }, suggestion: brand && regDomain(brand.host) !== reg ? brand : null });
  }

  // ①b 同注册域名下有已收录站点
  const regHit = regMap()[reg];
  if (regHit) {
    score += 35;
    reasons.push("该域名与已收录官网「" + regHit.name + "」（" + regHit.host + "）同属一个注册域名 " + reg + "，大概率是官方域名体系内的页面。");
  }

  // 描述品牌与输入域名对质
  if (brand) {
    if (regDomain(brand.host) === reg) {
      score += 15;
      reasons.push("与描述的「" + brand.name + "」在库中记录一致。");
    } else {
      score -= 25;
      suggestion = brand;
      reasons.push("⚠️ 你描述的「" + brand.name + "」，库中记录的官网是 " + brand.host + "，你输入的 " + reg + " 不是它，请谨慎。");
      // 仿冒特征：域名里含品牌英文名却不是官网
      const brandWord = (brand.host.split(".")[0] || "").toLowerCase();
      if (brandWord.length >= 4 && reg.includes(brandWord))
        { score -= 20; reasons.push("⚠️ 该域名包含品牌名 " + brandWord + " 却是另一个注册域名，是仿冒站的典型套路。"); }
    }
  }
  if (host.includes("xn--")) { score -= 15; reasons.push("⚠️ 域名含有 punycode 编码（xn--），常被用来伪装相似域名。"); }

  // ② RDAP 域名年龄
  let ageYears = null;
  try {
    const r = await fetch("https://rdap.org/domain/" + reg, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const j = await r.json();
      const ev = (j.events || []).find((e) => e.eventAction === "registration");
      if (ev && ev.eventDate) {
        ageYears = (Date.now() - new Date(ev.eventDate).getTime()) / 31557600000;
        if (ageYears >= 5) { score += 15; reasons.push("域名已注册 " + Math.floor(ageYears) + " 年，老域名是官网的重要特征。"); }
        else if (ageYears >= 1) { score += 8; reasons.push("域名注册于 " + Math.floor(ageYears) + " 年前。"); }
        else if (ageYears < 0.1) { score -= 25; reasons.push("⚠️ 域名是最近 1 个月内刚注册的，仿冒/钓鱼站常用新域名，高度警惕。"); }
        else { score -= 12; reasons.push("⚠️ 域名注册不到 1 年（" + Math.max(1, Math.floor(ageYears * 12)) + " 个月），新站需多留个心眼。"); }
      }
    }
  } catch (e) { /* 查不到不扣分 */ }

  // ③ 抓页面对主体
  let pageTitle = "";
  try {
    const r = await fetch(u.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const finalHost = new URL(r.url).hostname.toLowerCase();
    if (regDomain(finalHost) !== reg) { score -= 20; reasons.push("⚠️ 打开后跳转到了另一个域名 " + finalHost + "，正规官网很少这样跳。"); }
    const html = (await r.text()).slice(0, 200000);
    const tm = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    pageTitle = tm ? tm[1].trim() : "";
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 6000);
    const core = desc.replace(/官方网站|官网|官方|网站|主页|首页/g, "").trim();
    if (core.length >= 2 && (pageTitle.includes(core) || text.includes(core))) { score += 15; reasons.push("页面标题/内容与描述的「" + core + "」一致。"); }
    if (/©|版权所有|copyright/i.test(text)) { score += 6; reasons.push("页面有明确的版权主体信息。"); }
    if (/ICP备|icp备/.test(html)) { score += 6; reasons.push("页面公示了 ICP 备案号，有正规运营主体。"); }
    if (/高速下载|立即下载.*官方版|下载器/.test(text) && /下载/.test(core)) { score -= 8; reasons.push("页面主打「高速下载/下载器」，是下载站的常见话术，注意甄别。"); }
  } catch (e) {
    reasons.push("未能打开该网址核实页面内容（可能屏蔽了自动访问），结论仅基于域名信息。");
  }

  score = Math.max(0, Math.min(100, score));
  let level = "uncertain";
  if (score >= 75) level = "likely";
  else if (score < 50) level = "risky";
  const out = { ok: true, level, score, host, reg, reasons, suggestion, page: { title: pageTitle, ageYears: ageYears ? Math.round(ageYears * 10) / 10 : null } };

  // ④ AI 补充判断（配置了 key 才走）
  if (env && env.NVIDIA_API_KEY) {
    try {
      out.ai = await aiJudge(env, { url: u.toString(), desc, pageTitle, score });
    } catch (e) { /* AI 失败不影响规则结论 */ }
  }
  return finish(out);
}

async function aiJudge(env, ctx) {
  const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.NVIDIA_API_KEY },
    body: JSON.stringify({
      model: env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        { role: "system", content: "你是网站真伪鉴定专家。用户给你一个网址和它声称的身份，你结合常识（品牌官方域名习惯）判断该网址是不是真正的官网。只输出 JSON：{\"verdict\":\"likely_official|likely_fake|unsure\",\"reason\":\"一句话中文理由\"}" },
        { role: "user", content: "网址：" + ctx.url + "\n声称是：" + (ctx.desc || "（未填）") + "\n网页标题：" + (ctx.pageTitle || "（无）") },
      ],
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  if (!parsed.verdict) return null;
  return { verdict: parsed.verdict, reason: String(parsed.reason || "").slice(0, 120) };
}

function finish(obj) { return obj; }

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
