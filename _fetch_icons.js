const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = '/home/hatch/workspace/renguanwang-deploy';
const ICONDIR = path.join(DIR, 'icons');
fs.mkdirSync(ICONDIR, { recursive: true });

const src = fs.readFileSync(path.join(DIR, 'sites.js'), 'utf8');
const SITES = new Function(src + '; return SITES;')();

function host(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }

// 域名 -> 图标文件名
const seen = {};
const jobs = [];
SITES.forEach(s => {
  const d = host(s.url);
  if (!d || seen[d]) return;
  seen[d] = null;
  jobs.push({ domain: d, site: s });
});

async function fetchOne(domain) {
  const safe = domain.replace(/[^a-z0-9.-]/gi, '_');
  const tryUrls = [
    `https://${domain}/favicon.ico`,
    `http://${domain}/favicon.ico`,
  ];
  for (const u of tryUrls) {
    const ext = '.ico';
    const out = path.join(ICONDIR, safe + ext);
    try {
      const ct = execSync(`curl -sL --max-time 15 -o "${out}" -w "%{http_code} %{content_type} %{size_download}" "${u}"`, { encoding: 'utf8' }).trim();
      const [code, type, size] = ct.split(' ');
      if (code === '200' && /image|icon|octet/.test(type) && +size > 200 && +size < 200000) {
        // 拒绝 HTML 错误页
        const head = fs.readFileSync(out).slice(0, 200).toString();
        if (!/<!doctype|<html/i.test(head)) return safe + ext;
      }
      fs.rmSync(out, { force: true });
    } catch (e) { /* 下一个 */ }
  }
  // 解析首页 <link rel="icon">
  try {
    const html = execSync(`curl -sL --max-time 15 -A "Mozilla/5.0" "https://${domain}"`, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    const m = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/i);
    if (m) {
      const href = m[0].match(/href=["']([^"']+)["']/i);
      if (href) {
        let iu = href[1];
        if (iu.startsWith('//')) iu = 'https:' + iu;
        else if (iu.startsWith('/')) iu = `https://${domain}` + iu;
        else if (!/^https?:/.test(iu)) iu = `https://${domain}/` + iu;
        const ext = iu.match(/\.png/i) ? '.png' : iu.match(/\.svg/i) ? '.svg' : '.ico';
        const out = path.join(ICONDIR, safe + ext);
        const ct = execSync(`curl -sL --max-time 15 -o "${out}" -w "%{http_code} %{size_download}" "${iu}"`, { encoding: 'utf8' }).trim();
        const [code, size] = ct.split(' ');
        if (code === '200' && +size > 200 && +size < 200000) return safe + ext;
        fs.rmSync(out, { force: true });
      }
    }
  } catch (e) { /* 无 */ }
  return null;
}

(async () => {
  const CONC = 8;
  let ok = 0, fail = [];
  for (let i = 0; i < jobs.length; i += CONC) {
    const batch = jobs.slice(i, i + CONC);
    const res = await Promise.all(batch.map(j => fetchOne(j.domain).then(f => ({ j, f })).catch(() => ({ j, f: null }))));
    res.forEach(({ j, f }) => {
      seen[j.domain] = f;
      if (f) ok++; else fail.push(j.domain);
    });
    process.stdout.write(`\r${Math.min(i + CONC, jobs.length)}/${jobs.length} ok=${ok}`);
  }
  console.log('\n失败:', fail.length, fail.slice(0, 20).join(','));

  // 写回 sites.js：加 icon 字段
  const withIcon = SITES.map(s => ({ ...s, icon: seen[host(s.url)] || undefined }));
  const FIELDS = ["name", "url", "cat", "rating", "price", "kw", "desc", "official", "region", "dl", "sponsored", "plat", "icon"];
  const line = s => " {" + FIELDS.filter(f => s[f] !== undefined).map(f => `${f}:${JSON.stringify(s[f])}`).join(", ") + "},";
  fs.writeFileSync(path.join(DIR, 'sites.js'), "const SITES = [\n" + withIcon.map(line).join("\n") + "\n];\n", 'utf8');
  const withIconCount = withIcon.filter(s => s.icon).length;
  console.log(`站点 ${withIcon.length}，有图标 ${withIconCount}`);
})();
