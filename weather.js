/* Weather presentation only: search and filters remain independent. */
(function () {
  const CONDITIONS = { Clear:'晴朗', MostlyClear:'晴间多云', PartlyCloudy:'多云', MostlyCloudy:'多云', Cloudy:'阴天', Fog:'雾', Foggy:'雾', Haze:'霾', Rain:'雨', Drizzle:'小雨', HeavyRain:'大雨', Thunderstorms:'雷雨', Snow:'雪', Windy:'有风' };
  function themeFor(data, now = Date.now()) {
    const c = data.conditionCode || '';
    const rise = Date.parse(data.sunrise), set = Date.parse(data.sunset);
    let condition = /Thunderstorm/.test(c) ? 'storm' : /Rain|Drizzle/.test(c) ? 'rain' : /Snow|Blizzard|Hail|Sleet|Flurr|Wintry/.test(c) ? 'snow' : /Fog|Haze|Smoky/.test(c) ? 'fog' : /Cloud/.test(c) ? 'cloud' : 'clear';
    const phase = Number.isFinite(rise) && Math.abs(now - rise) < 35 * 60000 ? 'dawn' : Number.isFinite(set) && Math.abs(now - set) < 35 * 60000 ? 'dusk' : data.isDaylight === false ? 'night' : 'day';
    // Severe weather keeps its own palette; dawn and dusk soften clear/cloudy skies.
    return ['wx-' + condition, ...(['night'].includes(phase) || (['dawn','dusk'].includes(phase) && ['clear','cloud'].includes(condition)) ? ['wx-' + phase] : [])];
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { themeFor }; return; }
  const bg = document.getElementById('wxBg'), line = document.getElementById('weatherLine'), el = document.getElementById('wx');
  if (!bg || !line || !el) return;
  let latest;
  const lang = typeof currentLang === 'function' ? currentLang() : 'zh';
  const chinese = lang === 'zh' || lang === 'zht';
  function paint() {
    bg.classList.remove(...Array.from(bg.classList).filter(c => c.startsWith('wx-')));
    bg.classList.add(...themeFor(latest));
  }
  async function refresh() {
    try {
      const region = document.getElementById('regionSel')?.value || '';
      const response = await fetch('/api/weather?region=' + encodeURIComponent(region) + '&lang=' + encodeURIComponent(lang), { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('weather');
      const data = await response.json();
      if (!data.ok || !Number.isFinite(data.temperature)) throw new Error('weather');
      latest = data;
      const condition = chinese ? (CONDITIONS[data.conditionCode] || data.conditionCode) : data.conditionCode.replace(/([a-z])([A-Z])/g, '$1 $2');
      el.textContent = [data.name, data.temperature + '°C', condition].filter(Boolean).join(' · ');
      document.getElementById('weatherSource').textContent = data.source === 'capital' ? (chinese ? '所选地区代表城市天气' : 'Selected region’s representative city') : (chinese ? 'IP 估算位置天气' : 'Approximate IP location');
      line.hidden = false;
      paint();
    } catch (_) {
      line.hidden = true;
      latest = undefined;
      bg.classList.remove(...Array.from(bg.classList).filter(c => c.startsWith('wx-')));
    }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 15 * 60000);
  setInterval(() => { if (latest && !document.hidden) paint(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
