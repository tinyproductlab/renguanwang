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
  try {cities=JSON.parse(localStorage.getItem(KEY)||'[]');cities=Array.isArray(cities)?cities.filter(valid).slice(0,5):[];const saved=localStorage.getItem(ACTIVE);if(cities.some(c=>c.id===saved))mode=saved;}catch{cities=[];}
  function status(message){$('weatherStatus').textContent=message;}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(cities));localStorage.setItem(ACTIVE,mode==='location'?'capital':mode);}catch{status(t('浏览器无法保存设置，当前会话仍可使用。','Storage unavailable; settings last for this session only.'));}}
  function paint(){bg.classList.remove(...Array.from(bg.classList).filter(c=>c.startsWith('wx-')));if(latest)bg.classList.add(...themeFor(latest));}
  function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;}
  function choose(id){mode=id;persist();render();status(t('正在更新天气…','Updating weather…'));refresh();}
  function render(){
    $('weatherCapital').setAttribute('aria-pressed',String(mode==='capital'));
    $('weatherLocate').setAttribute('aria-pressed',String(mode==='location'));
    $('weatherManage').textContent=t('管理城市','Cities')+' · '+cities.length+'/5';
    $('weatherCities').replaceChildren();$('weatherSavedCities').replaceChildren();
    for(const c of cities){
      const b=button(c.name,()=>choose(c.id));b.setAttribute('aria-pressed',String(mode===c.id));b.title=c.region||c.name;$('weatherCities').append(b);
      const row=document.createElement('div');row.className='weather-city-row';const label=document.createElement('span');label.textContent=[c.name,c.region].filter(Boolean).join(' · ');
      const remove=button(t('删除','Remove'),()=>{cities=cities.filter(x=>x.id!==c.id);if(mode===c.id){mode='capital';refresh();}persist();render();});remove.setAttribute('aria-label',t('删除城市 ','Remove city ')+c.name);row.append(label,remove);$('weatherSavedCities').append(row);
    }
    if(!cities.length)$('weatherSavedCities').textContent=t('尚未保存城市。','No saved cities.');
  }
  async function refresh(){
    const requestId=++seq;
    const city=cities.find(c=>c.id===mode),point=mode==='location'?locationPoint:city;
    const params=new URLSearchParams({lang,region:$('regionSel')?.value||''});
    if(point){params.set('lat',point.lat);params.set('lon',point.lon);params.set('name',city?.name||t('当前位置','Current location'));params.set('source',city?'city':'location');}
    try{
      const r=await fetch('/api/weather?'+params,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('weather');const data=await r.json();if(!data.ok||!Number.isFinite(data.temperature))throw new Error('weather');if(requestId!==seq)return;
      latest=data;const condition=zh?(CONDITIONS[data.conditionCode]||data.conditionCode):(data.conditionCode||'').replace(/([a-z])([A-Z])/g,'$1 $2');
      el.textContent=[data.name,data.temperature+'°C',condition].filter(Boolean).join(' · ');
      line.hidden=false;status('');paint();
    }catch{if(requestId!==seq)return;line.hidden=true;latest=undefined;paint();status(t('暂时无法获取天气，可重选城市或稍后再试。','Weather unavailable. Select a city or try again later.'));}
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
  $('weatherClose').onclick=()=>{$('weatherDialog').close();$('weatherManage').focus();};
  $('weatherDialogTitle').textContent=t('自定义天气城市','Weather cities');
  $('weatherDialogHint').textContent=t('最多保存 5 个城市，点击城市即可用它的天气作为背景。仅保存在当前浏览器。','Save up to 5 cities. Select one to use its weather as the background. Saved in this browser only.');
  $('weatherQueryLabel').textContent=t('搜索城市','Search cities');$('weatherSearchButton').textContent=t('搜索','Search');$('weatherSavedTitle').textContent=t('已保存的城市','Saved cities');
  $('weatherLocationHint').textContent=t('定位需要你的浏览器授权；精确位置只用于天气查询，不保存为城市记录。','Location requires browser permission and is used only for weather. Coordinates are not saved in your city list.');
  $('weatherCityForm').onsubmit=async e=>{
    e.preventDefault();const q=$('weatherCityQuery').value.trim();if(q.length<2)return;
    const id=++searchSeq;$('weatherSearchStatus').textContent=t('搜索中…','Searching…');$('weatherCityResults').replaceChildren();
    try{
      const r=await fetch('/api/cities?'+new URLSearchParams({q,lang:zh?'zh':'en'}),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('lookup');const data=await r.json();if(id!==searchSeq)return;
      const results=(data.cities||[]).filter(valid);$('weatherSearchStatus').textContent=results.length?t('请选择同名城市的正确地区。','Choose the correct region for the city.'):t('未找到城市，请尝试英文名称或更完整的名称。','No cities found. Try another spelling.');
      for(const c of results){
        const row=document.createElement('div');row.className='weather-city-row';const text=document.createElement('span');text.textContent=[c.name,c.region].filter(Boolean).join(' · ');
        const add=button(t('添加并使用','Add & use'),()=>{
          if(cities.some(x=>x.id===c.id)){choose(c.id);$('weatherDialog').close();return;}
          if(cities.length>=5){$('weatherSearchStatus').textContent=t('已保存 5 个城市，请先删除一个再添加。','Five cities saved. Remove one before adding another.');return;}
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
