// City lookup only; weather still comes from Apple WeatherKit.
export async function onRequestGet({request}) {
  const url = new URL(request.url), name = (url.searchParams.get('q') || '').trim();
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'}});
  if(name.length < 2 || name.length > 80) return json({error:'invalid_query'},400);
  const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
  const target = new URL('https://geocoding-api.open-meteo.com/v1/search');
  target.search = new URLSearchParams({name,count:'8',language:lang,format:'json'}).toString();
  try {
    const result = await fetch(target,{signal:AbortSignal.timeout(8000)});
    if(!result.ok) throw new Error('lookup');
    const data = await result.json();
    const cities = (data.results || []).filter(c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude)).map(c=>({id:String(c.id),name:c.name,region:[c.admin1,c.country].filter(Boolean).join(' · '),lat:c.latitude,lon:c.longitude}));
    return json({cities});
  } catch { return json({error:'lookup_unavailable'},502); }
}
