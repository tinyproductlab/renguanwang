// POST /api/find —— 搜索缺口兜底：用户搜的词在站库里没有结果时调用。
// 流程（用户 2026-11-07 拍板）：①先在库里做简称/子序列匹配（在库只是简称没对上）
// ②不在库就让 AI 给出最可能的官网候选，并抓页面验信号（可达＋标题对得上）
// ③无论哪种结果都记进 KV（find:<词>，带计数），供站长定期拉出来筛选、
// 核验通过后正式补进站库。前台只展示提示，不把未核验候选当正式结果。
import { HOSTS, NAMES } from "../_db.js";
import { matchByDesc, regDomain } from "./verify.js";

const cache = new Map(); // core → {t, data}，同 isolate 内短时缓存，防 AI 被刷
const CACHE_TTL = 10 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const data = await request.json().catch(() => ({}));
    const rawQ = String(data.q || "").slice(0, 80).trim();
    if (!rawQ) return json({ ok: false, msg: "empty_q" }, 400);
    const core = rawQ
      .replace(/[\s　]+/g, "")
      .replace(/(官方网站|官网|官方|网站|主页|首页|下载)$/g, "")
      .trim() || rawQ;

    let result = null;
    const hitCache = cache.get(core);
    if (hitCache && Date.now() - hitCache.t < CACHE_TTL) {
      result = hitCache.data;
    } else {
      result = await compute(core, env);
      if (cache.size > 300) cache.clear();
      cache.set(core, { t: Date.now(), data: result });
    }

    // 记录到 KV：站长筛选补库的原料。KV 没绑也不影响前台返回。
    const kv = env && (env.RGW_KV || env.RGW_kv);
    let count = 0;
    if (kv) {
      try {
        count = await logFind(kv, core, rawQ, result);
      } catch (e) { /* 记录失败不拦前台 */ }
    }
    // 第一次出现的新缺口 → 转发到 Telegram 群提醒（与反馈同一通道）
    if (count === 1 && env && env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      const text =
        "🔎 认官网-搜索缺口\n" +
        "搜索词：" + core + "\n" +
        "状态：" + (result.status === "in_library" ? "在库（简称没对上）" : result.status === "candidate" ? "AI 找到候选" : "未找到候选") + "\n" +
        (result.candidate ? "候选：" + result.candidate.name + "（" + result.candidate.host + "）\n" : "") +
        "信号：" + ((result.signals || []).join("；") || "无");
      const p = fetch("https://api.telegram.org/bot" + env.TG_BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text }),
      }).catch(() => {});
      if (context.waitUntil) context.waitUntil(p);
    }

    return json({ ok: true, status: result.status, candidate: result.candidate || null, tried: result.tried || null, signals: result.signals || [] });
  } catch (e) {
    return json({ ok: false, msg: "error" }, 500);
  }
}

async function compute(core, env) {
  // ① 库内匹配：先走 verify 同款描述匹配，再走中文子序列匹配（治简称）
  // 描述匹配要过一道 sanity：查询含中文时，命中名必须与查询有共同汉字，
  // 否则 latin 弱命中会把「某个不存在的词组xyz」误配到 X 这类单字母站。
  const byDesc = matchByDesc(core);
  if (byDesc) {
    const hasCJK = /[\u4e00-\u9fff]/.test(core);
    const sharedCJK = hasCJK && [...core].some((ch) => /[\u4e00-\u9fff]/.test(ch) && byDesc.name.includes(ch));
    if (!hasCJK || sharedCJK) {
      return { status: "in_library", candidate: { name: byDesc.name, url: byDesc.url, host: byDesc.host }, signals: ["库内名称匹配"] };
    }
  }
  if (/[\u4e00-\u9fff]/.test(core) && core.length >= 3) {
    // 简称变体：局/厅互换、去掉尾字（四川人社局→在库是…社保厅）
    const variants = [core];
    const last = core.slice(-1);
    if (last === "局") variants.push(core.slice(0, -1) + "厅");
    if (last === "厅") variants.push(core.slice(0, -1) + "局");
    if (last === "局" || last === "厅" || last === "部") variants.push(core.slice(0, -1));
    let best = null;
    for (const [name, host] of NAMES) {
      for (const v of variants) {
        if (name.length < v.length) continue;
        if (isSubseq(v, name) && (!best || name.length < best.name.length)) {
          best = { name, host, url: HOSTS[host] ? HOSTS[host][1] : "https://" + host };
        }
      }
    }
    if (best) {
      return { status: "in_library", candidate: best, signals: ["库内简称子序列匹配"] };
    }
  }

  // ② AI 给候选（没配 key 就到此为止，只记录）
  if (!env || !env.NVIDIA_API_KEY) {
    return { status: "none", candidate: null, signals: [] };
  }
  const cand = await aiCandidate(env, core);
  if (!cand || !cand.domain) {
    return { status: "none", candidate: null, signals: ["AI 未给出候选"] };
  }
  const domain = cand.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain) ||
      domain === "localhost" || domain.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(domain)) {
    return { status: "none", candidate: null, signals: ["AI 候选域名不合法"] };
  }
  const hostNoWww = domain.replace(/^www\./, "");
  if (HOSTS[hostNoWww] || HOSTS[domain]) {
    const v = HOSTS[hostNoWww] || HOSTS[domain];
    return { status: "in_library", candidate: { name: v[0], url: v[1], host: hostNoWww }, signals: ["AI 候选域名已在库"] };
  }

  // ③ 抓页面验信号：可达 + 标题与候选名对得上（或 .gov.cn 政府域名）
  const signals = [];
  let reachable = false, titleMatch = false, labelMatch = false, parked = false, pageTitle = "";
  try {
    const r = await fetch("https://" + domain + "/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (r.status < 400) reachable = true;
    const html = (await r.text()).slice(0, 120000);
    const tm = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    pageTitle = tm ? tm[1].trim() : "";
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 4000);
    titleMatch = nameMatchesText(cand.name, pageTitle) || nameMatchesText(cand.name, text) || nameMatchesText(core, pageTitle);
    if (pageTitle.includes(core)) titleMatch = true;
    // 英文站标题对不上中文名时，用域名主标签兜底：标题里含品牌词（如 unitree）说明是正经品牌站；
    // 但页面若是域名停放/出售页，直接否掉。
    const sld = domain.replace(/^www\./, "").split(".")[0];
    if (sld.length >= 4 && (pageTitle + " " + text).toLowerCase().includes(sld)) labelMatch = true;
    if (/domain (is )?for sale|buy this domain|域名出售|该域名可以转让|parked/i.test(pageTitle + " " + text)) parked = true;
  } catch (e) { /* 打不开 */ }
  if (reachable) signals.push("页面可达");
  if (pageTitle) signals.push("标题：" + pageTitle.slice(0, 60));
  if (titleMatch) signals.push("标题与名称对得上");
  if (labelMatch) signals.push("标题含域名品牌词");
  if (parked) signals.push("疑似域名停放页");
  const govCn = /\.gov\.cn$/.test(domain);
  if (govCn) signals.push("gov.cn 政府域名");

  if (reachable && !parked && (titleMatch || labelMatch || govCn)) {
    return { status: "candidate", candidate: { name: cand.name || core, url: "https://" + domain, host: domain }, signals };
  }
  // 没过信号也把 AI 给的域名留档（tried），筛选时优先复核这类，别白白丢掉
  return { status: "none", candidate: null, tried: { name: cand.name || core, host: domain }, signals: signals.length ? signals : ["候选未通过信号检验"] };
}

// 名称与页面文本对质：名称里任一 ≥3 字的连续片段出现在文本中即算对上
function nameMatchesText(name, text) {
  if (!name || !text) return false;
  if (text.includes(name)) return true;
  const clean = name.replace(/[（）()·・\s]/g, "");
  for (let len = Math.min(clean.length, 8); len >= 3; len--) {
    for (let i = 0; i + len <= clean.length; i++) {
      if (text.includes(clean.slice(i, i + len))) return true;
    }
    if (len <= 4) break;
  }
  return false;
}

function isSubseq(needle, hay) {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return false;
}

async function aiCandidate(env, core) {
  // 模型兜底链与 verify.js 保持一致（NVIDIA 托管模型下线快）
  const models = [];
  if (env.NVIDIA_MODEL) models.push(env.NVIDIA_MODEL);
  models.push("z-ai/glm-5.3-flash", "google/gemma-4-31b-it", "openai/gpt-oss-20b", "nvidia/nemotron-3-super-120b-a12b", "moonshotai/kimi-k2.6");
  const sys = "你是官网查找助手。用户给出一个机构或品牌名称，请给出它最可能的官方网站。只输出 JSON：{\"name\":\"官方全名\",\"domain\":\"官网域名（裸域名，不要带 http 和路径）\"}。不确定就把 domain 设为空字符串，绝不编造看起来像的域名。";
  const usr = "名称：" + core;
  let remembered = null;
  for (const model of models) {
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.NVIDIA_API_KEY },
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 300, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);
      if (typeof parsed.domain !== "string") continue;
      const out = { name: String(parsed.name || "").slice(0, 80), domain: parsed.domain.trim() };
      if (out.domain) return out; // 有候选就用；空候选继续问下一个模型，最后才认空
      remembered = out;
    } catch (e) { /* 换下一个模型 */ }
  }
  return remembered;
}

async function logFind(kv, core, rawQ, result) {
  const key = "find:" + core;
  let rec = null;
  try { rec = JSON.parse((await kv.get(key)) || "null"); } catch (e) { rec = null; }
  const now = Date.now();
  if (!rec || typeof rec !== "object") {
    rec = { q: core, raw: rawQ, status: result.status, name: result.candidate ? result.candidate.name : "", url: result.candidate ? result.candidate.url : "", host: result.candidate ? result.candidate.host : "", signals: result.signals || [], count: 0, first: now, last: now };
  }
  rec.count = (rec.count || 0) + 1;
  rec.last = now;
  rec.status = result.status;
  if (result.candidate) { rec.name = result.candidate.name; rec.url = result.candidate.url; rec.host = result.candidate.host; }
  if (result.tried) rec.tried = result.tried;
  rec.signals = result.signals || [];
  await kv.put(key, JSON.stringify(rec));
  return rec.count;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}
