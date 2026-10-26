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
  const $ = id => document.getElementById(id);
  const bg=$('wxBg'),line=$('weatherLine'),el=$('wx');
  if(!bg || !line || !el) return;
  const lang=typeof currentLang==='function'?currentLang():'zh', zh=lang==='zh'||lang==='zht';
  const t=(a,b)=>zh?a:b, KEY='rgw-weather-cities-v1', ACTIVE='rgw-weather-active-v1';
  const valid=c=>c && typeof c.id==='string' && typeof c.name==='string' && Number.isFinite(c.lat) && Number.isFinite(c.lon) && Math.abs(c.lat)<=90 && Math.abs(c.lon)<=180;
  let cities=[],mode='capital',locationPoint,latest,seq=0,searchSeq=0;
  const weatherData=new Map(), weatherErrors=new Set();
  try {cities=JSON.parse(localStorage.getItem(KEY)||'[]');cities=Array.isArray(cities)?cities.filter(valid).slice(0,5):[];const saved=localStorage.getItem(ACTIVE);if(cities.slice(0,4).some(c=>c.id===saved))mode=saved;}catch{cities=[];}
  function status(message){$('weatherStatus').textContent=message;}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(cities));localStorage.setItem(ACTIVE,mode==='location'?'capital':mode);}catch{status(t('浏览器无法保存设置，当前会话仍可使用。','Storage unavailable; settings last for this session only.'));}}
  function paint(){
    bg.classList.remove(...Array.from(bg.classList).filter(c=>c.startsWith('wx-')));
    if(!latest){if(window.RGWWeatherFx)window.RGWWeatherFx.stop();return;}
    const cls=themeFor(latest);
    bg.classList.add(...cls);
    if(window.RGWWeatherFx)window.RGWWeatherFx.set(cls[0].slice(3),(cls[1]||'wx-day').slice(3));
  }
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;}
  function choose(id){mode=id;persist();render();if(weatherData.has(id)){latest=weatherData.get(id);paint();status('');}else{status(t('正在更新天气…','Updating weather…'));}if(!weatherData.has(id))refresh(false);}
  function render(){
    $('weatherCapital').setAttribute('aria-pressed',String(mode==='capital'));
    $('weatherLocate').setAttribute('aria-pressed',String(mode==='location'));
    if(mode==='location'&&weatherData.has('location')){$('weatherLocate').textContent=t('当前位置','My location')+' · '+weatherData.get('location').temperature+'°C';}else{$('weatherLocate').textContent=t('使用定位','Use my location');}
    $('weatherManage').textContent=t('管理城市','Cities');
    $('weatherCities').replaceChildren();$('weatherSavedCities').replaceChildren();
    const entries=[{id:'capital',name:t('国家首都','Capital')},...cities.slice(0,4)];
    for(const c of entries){
      const data=weatherData.get(c.id);
      const condition=data?(zh?(CONDITIONS[data.conditionCode]||data.conditionCode):(data.conditionCode||'').replace(/([a-z])([A-Z])/g,'$1 $2')):'';
      const label=data?[data.name,data.temperature+'°C',condition].join(' · '):c.name+' · '+(weatherErrors.has(c.id)?t('暂不可用','Unavailable'):'…');
      const b=button(label,()=>choose(c.id));b.className='weather-city-summary';b.setAttribute('aria-pressed',String(mode===c.id));b.title=(c.region||c.name)+t(' · 点击设为背景',' · Use as background');$('weatherCities').append(b);
    }
    for(const c of cities){
      const row=document.createElement('div');row.className='weather-city-row';const label=document.createElement('span');label.textContent=[c.name,c.region].filter(Boolean).join(' · ');
      const remove=button(t('删除','Remove'),()=>{cities=cities.filter(x=>x.id!==c.id);if(mode===c.id){mode='capital';refresh();}persist();render();});remove.setAttribute('aria-label',t('删除城市 ','Remove city ')+c.name);row.append(label,remove);$('weatherSavedCities').append(row);
    }
    if(!cities.length)$('weatherSavedCities').textContent=t('尚未保存城市。','No saved cities.');
  }
  async function fetchWeather(city,source){
    const params=new URLSearchParams({lang,region:$('regionSel')?.value||''});
    if(city){params.set('lat',city.lat);params.set('lon',city.lon);params.set('name',city.name||t('当前位置','Current location'));params.set('source',source);}
    const r=await fetch('/api/weather?'+params,{signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('weather');const data=await r.json();if(!data.ok||!Number.isFinite(data.temperature))throw new Error('weather');return data;
  }
  async function refresh(force=true){
    const requestId=++seq;
    const entries=[{id:'capital'},...cities.slice(0,4)];
    if(mode==='location'&&locationPoint)entries.push({id:'location',...locationPoint});
    await Promise.all(entries.filter(c=>force||!weatherData.has(c.id)).map(async c=>{
      try{
        const data=await fetchWeather(c.id==='capital'?null:c,c.id==='location'?'location':'city');
        if(requestId!==seq)return;weatherData.set(c.id,data);weatherErrors.delete(c.id);
        if(c.id===mode){latest=data;paint();el.textContent=[data.name,data.temperature+'°C'].join(' · ');status('');}
      }catch{
        if(requestId!==seq)return;weatherErrors.add(c.id);weatherData.delete(c.id);
        if(c.id===mode){latest=undefined;paint();status(t('当前背景城市天气暂不可用，可选择其他城市。','Background weather unavailable. Select another city.'));}
      }
      if(requestId===seq)render();
    }));
    line.hidden=true;
  }
  $('weatherCapital').textContent=t('国家首都','Country capital');$('weatherCapital').onclick=()=>choose('capital');
  $('weatherLocate').textContent=t('使用定位','Use my location');
  $('weatherLocate').onclick=()=>{
    if(!navigator.geolocation){status(t('浏览器不支持定位，请选择城市。','Location is unavailable. Choose a city.'));return;}
    status(t('请允许浏览器定位；位置仅用于查询天气。','Allow location to fetch your local weather.'));
    $('weatherLocate').disabled=true;
    navigator.geolocation.getCurrentPosition(p=>{
      $('weatherLocate').disabled=false;locationPoint={lat:p.coords.latitude,lon:p.coords.longitude};choose('location');
    },()=>{$('weatherLocate').disabled=false;status(t('未获得定位，已保留原来的天气位置。你仍可选择首都或自定义城市。','Location unavailable. Your previous selection is unchanged.'));},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  };
  $('weatherManage').onclick=()=>{$('weatherDialog').showModal();$('weatherCityQuery').focus();};
  function condText(code){return zh?(CONDITIONS[code]||code):(code||'').replace(/([a-z])([A-Z])/g,'$1 $2');}
  // 城市当地时间：有 tzOffset（分钟）时把 UTC 时刻平移后按 UTC 读数；没有则回退到浏览者本地时间。
  function cityDate(iso,off){const d=new Date(iso);if(!Number.isFinite(+d))return null;return typeof off==='number'?new Date(+d+off*60000):d;}
  function fmtTime(iso,off){const d=cityDate(iso,off);if(!d)return '';const h=typeof off==='number'?d.getUTCHours():d.getHours(),m=typeof off==='number'?d.getUTCMinutes():d.getMinutes();return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
  function fmtDay(iso,off){const d=cityDate(iso,off);if(!d)return '';const day=typeof off==='number'?d.getUTCDay():d.getDay();return zh?['周日','周一','周二','周三','周四','周五','周六'][day]:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day];}
  function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function openDetail(){
    const d=latest,body=$('weatherDetailBody');
    if(!d){body.innerHTML='<p>'+t('当前城市天气暂不可用，请稍后再试。','Weather data is unavailable right now.')+'</p>';}
    else{
      const cond=condText(d.conditionCode);
      const hilo=[d.high!=null?t('最高 ','High ')+d.high+'°':'',d.low!=null?t('最低 ','Low ')+d.low+'°':''].filter(Boolean).join(' · ');
      const cards=[
        [t('体感温度','Feels like'),d.feelsLike!=null?d.feelsLike+'°C':'—'],
        [t('风速','Wind'),d.windSpeed!=null?d.windSpeed+' km/h':'—'],
        [t('湿度','Humidity'),d.humidity!=null?d.humidity+'%':'—'],
        [t('降水概率','Precipitation'),d.precipChance!=null?d.precipChance+'%':'—'],
        [t('日出','Sunrise'),d.sunrise?fmtTime(d.sunrise,d.tzOffset):'—'],
        [t('日落','Sunset'),d.sunset?fmtTime(d.sunset,d.tzOffset):'—'],
      ];
      const hours=(d.hourly||[]).map(h=>'<div class="wx-detail-hour">'+esc(fmtTime(h.t,d.tzOffset))+'<b>'+(h.temp!=null?h.temp+'°':'—')+'</b>'+esc(condText(h.code))+'</div>').join('');
      let curve='';
      const temps=(d.hourly||[]).map(h=>h.temp).filter(v=>typeof v==='number');
      if(temps.length>=2){
        const min=Math.min(...temps),max=Math.max(...temps),span=(max-min)||1;
        const pts=(d.hourly||[]).map((h,i)=>{const x=30+i*(500/Math.max(1,(d.hourly.length-1)));const y=70-((h.temp-min)/span)*50;return x.toFixed(1)+','+y.toFixed(1);}).join(' ');
        curve='<svg viewBox="0 0 560 90" width="100%" height="90" aria-hidden="true"><polyline points="'+pts+'" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      }
      const week=(d.week||[]).map(w=>'<div class="wx-detail-day"><span>'+esc(fmtDay(w.date,d.tzOffset))+'</span><span>'+esc(condText(w.code))+'</span><span><span class="lo">'+(w.low!=null?w.low+'°':'—')+'</span> / '+(w.high!=null?w.high+'°':'—')+'</span></div>').join('');
      body.innerHTML='<div class="wx-detail-hero"><div class="wx-detail-temp">'+d.temperature+'°</div><div class="wx-detail-cond">'+esc(cond)+' · '+esc(d.name)+'</div><div class="wx-detail-hilo">'+esc(hilo)+'</div></div>'
        +'<div class="wx-detail-cards">'+cards.map(c=>'<div class="wx-detail-card"><span>'+c[0]+'</span><strong>'+esc(c[1])+'</strong></div>').join('')+'</div>'
        +(hours?'<h3>'+t('逐小时预报','Hourly forecast')+'</h3>'+curve+'<div class="wx-detail-hourly">'+hours+'</div>':'')
        +(week?'<h3>'+t('未来 7 天','7-day forecast')+'</h3><div class="wx-detail-week">'+week+'</div>':'');
    }
    $('weatherDetailTitle').textContent=(d?d.name+' · ':'')+t('天气详情','Weather details');
    $('weatherDetailDialog').showModal();
  }
  $('weatherDetail').textContent=t('天气详情','Details');
  $('weatherDetail').onclick=openDetail;
  $('weatherDetailClose').onclick=()=>{$('weatherDetailDialog').close();$('weatherDetail').focus();};
  $('weatherClose').onclick=()=>{$('weatherDialog').close();$('weatherManage').focus();};
  $('weatherDialogTitle').textContent=t('自定义天气城市','Weather cities');
  $('weatherDialogHint').textContent=t('共显示 5 个城市：第一项固定为首都，另外可保存 4 个城市。点击天气可切换背景，城市仅保存在当前浏览器。','Five weather summaries: the capital first, plus up to four saved cities. Select any summary to change the background. Stored in this browser only.');
  $('weatherSearchCountryLabel').textContent=t('搜索范围（独立于首页国家）','Search country (independent of the homepage)');
  $('weatherSearchCountry').options[0].textContent=t('全球所有国家','All countries');
  for(const option of ($('regionSel')?.options||[])){if(/^[A-Z]{2}$/.test(option.value))$('weatherSearchCountry').append(option.cloneNode(true));}
  $('weatherSearchCountry').value='';
  $('weatherSearchCountry').onchange=()=>{searchSeq++;$('weatherCityResults').replaceChildren();$('weatherSearchStatus').textContent='';};
  $('weatherQueryLabel').textContent=t('搜索城市','Search cities');$('weatherSearchButton').textContent=t('搜索','Search');$('weatherSavedTitle').textContent=t('已保存的城市','Saved cities');
  $('weatherLocationHint').textContent=t('定位需要你的浏览器授权；精确位置只用于天气查询，不保存为城市记录。','Location requires browser permission and is used only for weather. Coordinates are not saved in your city list.');
  $('weatherCityForm').onsubmit=async e=>{
    e.preventDefault();const q=$('weatherCityQuery').value.trim();if(q.length<2)return;
    const id=++searchSeq;$('weatherSearchStatus').textContent=t('搜索中…','Searching…');$('weatherCityResults').replaceChildren();
    try{
      const r=await fetch('/api/cities?'+new URLSearchParams({q,lang:zh?'zh':'en',country:$('weatherSearchCountry').value}),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('lookup');const data=await r.json();if(id!==searchSeq)return;
      const results=(data.cities||[]).filter(valid);$('weatherSearchStatus').textContent=results.length?t('请选择同名城市的正确地区。','Choose the correct region for the city.'):t('未找到城市，请切换为全球范围，或尝试英文名称。','No cities found. Try another spelling.');
      for(const c of results){
        const row=document.createElement('div');row.className='weather-city-row';const text=document.createElement('span');text.textContent=[c.name,c.region].filter(Boolean).join(' · ');
        const add=button(t('添加并使用','Add & use'),()=>{
          if(cities.some(x=>x.id===c.id)){choose(c.id);$('weatherDialog').close();return;}
          if(cities.length>=4){$('weatherSearchStatus').textContent=t('首都之外最多保存 4 个城市，请先删除一个再添加。','Four custom cities saved. Remove one before adding another.');return;}
          cities.push(c);choose(c.id);$('weatherDialog').close();$('weatherManage').focus();
        });row.append(text,add);$('weatherCityResults').append(row);
      }
    }catch{if(id===searchSeq)$('weatherSearchStatus').textContent=t('城市搜索暂时不可用，请稍后重试。','City search unavailable. Please try again.');}
  };
  render();refresh();
  setInterval(()=>{if(!document.hidden)refresh();},15*60000);
  setInterval(()=>{if(latest&&!document.hidden)paint();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
