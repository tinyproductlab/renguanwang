// City lookup only; weather still comes from Apple WeatherKit.
export async function onRequestGet({request}) {
  const url = new URL(request.url), name = (url.searchParams.get('q') || '').trim();
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'}});
  if(name.length < 2 || name.length > 80) return json({error:'invalid_query'},400);
  const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
  const country=(url.searchParams.get('country')||'').toUpperCase();
  if(country && !/^[A-Z]{2}$/.test(country))return json({error:'invalid_country'},400);
  const aliases={'伦敦':'London','東京':'Tokyo','东京':'Tokyo','紐約':'New York','纽约':'New York','巴黎':'Paris','首尔':'Seoul','首爾':'Seoul','新加坡':'Singapore','曼谷':'Bangkok','悉尼':'Sydney','雪梨':'Sydney','墨尔本':'Melbourne','洛杉矶':'Los Angeles','洛杉磯':'Los Angeles','旧金山':'San Francisco','舊金山':'San Francisco','三藩市':'San Francisco','温哥华':'Vancouver','溫哥華':'Vancouver','多伦多':'Toronto','多倫多':'Toronto','柏林':'Berlin','慕尼黑':'Munich','罗马':'Rome','羅馬':'Rome','马德里':'Madrid','馬德里':'Madrid','迪拜':'Dubai','杜拜':'Dubai','莫斯科':'Moscow','大阪':'Osaka','京都':'Kyoto','横滨':'Yokohama','橫濱':'Yokohama','华盛顿':'Washington','華盛頓':'Washington','阿姆斯特丹':'Amsterdam','吉隆坡':'Kuala Lumpur','雅加达':'Jakarta','雅加達':'Jakarta','胡志明市':'Ho Chi Minh City','河内':'Hanoi','河內':'Hanoi','奥克兰':'Auckland','奧克蘭':'Auckland'};
  const lookup=aliases[name]||name;
  const target = new URL('https://geocoding-api.open-meteo.com/v1/search');
  target.search = new URLSearchParams({name:lookup,count:'30',language:lang,format:'json',...(country?{countryCode:country}:{})}).toString();
  try {
    const result = await fetch(target,{signal:AbortSignal.timeout(8000)});
    if(!result.ok) throw new Error('lookup');
    const data = await result.json();
    const cities = (data.results || []).sort((a,b)=>(b.population||0)-(a.population||0)).filter(c => Number.isFinite(c.latitude) && Number.isFinite(c.longitude)).map(c=>({id:String(c.id),name:c.name,region:[c.admin1,c.country].filter(Boolean).join(' · '),countryCode:c.country_code,lat:c.latitude,lon:c.longitude}));
    return json({cities:cities.slice(0,8)});
  } catch { return json({error:'lookup_unavailable'},502); }
}
