import {normalizeConfig,escapeHtml,text,ingest,latestRoom,roomStatus,ageLabel,renderShapes} from './core.js';

const ROOM_STYLE=`
 :host{display:block;container-type:inline-size}*{box-sizing:border-box}ha-card{display:block;overflow:hidden}
 .wrap{padding:24px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:1.8px;color:var(--secondary-text-color);text-transform:uppercase}
 h2{font-size:24px;font-weight:550;letter-spacing:-.7px;margin:6px 0 8px}.intro{font-size:13px;color:var(--secondary-text-color);line-height:1.55;margin:0}
 .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.count{white-space:nowrap;border-radius:20px;background:var(--map-fresh);color:var(--map-status-text);font-size:12px;padding:7px 11px;margin-top:3px}
 .plans{display:grid;grid-template-columns:repeat(var(--map-columns),minmax(0,1fr));gap:16px;margin-top:22px}.floor{background:var(--map-background);border:1px solid color-mix(in srgb,var(--map-wall) 15%,transparent);border-radius:var(--map-floor-radius);padding:16px 10px 7px;align-self:start;min-width:0}
 .floor-heading{display:flex;align-items:center;justify-content:space-between;padding:0 9px 7px;color:var(--map-text);font-size:14px;font-weight:600}.floor-heading small{font-size:11px;font-weight:400;color:var(--map-muted)}
 svg{width:100%;height:auto;display:block;overflow:visible}.base{fill:var(--map-room);stroke:var(--map-wall);stroke-width:var(--map-outline-width);stroke-linejoin:round}
 .room{cursor:pointer;outline:none}.room-fill{fill:var(--map-room);stroke:var(--map-wall);stroke-width:var(--map-wall-width);stroke-linejoin:round;transition:fill .4s}
 .untracked .room-fill{fill:var(--map-untracked)}.fresh .room-fill{fill:var(--map-fresh)}.recent .room-fill{fill:var(--map-recent)}.latest .room-fill{fill:var(--map-latest)}
 .room:hover .room-fill,.room:focus .room-fill,.selected .room-fill{stroke:var(--map-selected);stroke-width:calc(var(--map-wall-width) + 1px)}
 .room-name{fill:var(--map-text);font:500 var(--map-room-font-size) system-ui,sans-serif;text-anchor:middle;pointer-events:none}
 .status-pill{fill:var(--map-status-background);fill-opacity:.94;stroke:var(--map-background);stroke-width:1;pointer-events:none}
 .age{fill:var(--map-status-text);font:600 var(--map-status-font-size) system-ui,sans-serif;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
 .no-sensor{fill:none;stroke:var(--map-muted);stroke-width:1.3;stroke-dasharray:2 2;pointer-events:none}
 .furniture{fill:none;stroke:var(--map-furniture-color);stroke-width:1.5;opacity:var(--map-furniture-opacity);pointer-events:none}.windows{fill:none;stroke:var(--map-background);stroke-width:7;pointer-events:none}.decorations{fill:none;stroke:var(--map-muted);pointer-events:none}
 .legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--secondary-text-color);margin:18px 0 14px}.legend span{display:flex;align-items:center;gap:5px}.dot{width:9px;height:9px;border-radius:3px;display:inline-block}
 .detail{border-top:1px solid var(--divider-color,#eee);padding:15px 0 0;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}.detail strong{display:block;font-size:14px;font-weight:550}.detail small{display:block;margin-top:4px;font-size:12px;color:var(--secondary-text-color);line-height:1.5;overflow-wrap:anywhere}
 button{border:0;background:var(--secondary-background-color,#f2f3f0);color:var(--primary-text-color);border-radius:12px;padding:10px 13px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}button:hover{filter:brightness(.96)}button:disabled{opacity:.5;cursor:default}
 .note,.status{font-size:11px;color:var(--secondary-text-color);line-height:1.5;margin:14px 0 0}.status{color:var(--warning-color,#9b7041)}
`;
export class MotionTrackerCard extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});this._seen={};this._selected=null;this._loading=false;this._loaded=false;this._lastFetch=0;this._visible=true;this._onVisibility=()=>this._tick();}
 static getConfigElement(){return document.createElement('motion-tracker-card-editor');}
 static getStubConfig(){return {type:'custom:motion-tracker-card',title:'Motion tracker',minutes:30,floors:[{id:'floor',name:'Floor',view_box:[0,0,400,240],outline:'M20 20H380V220H20Z',rooms:[{id:'room',name:'Room',path:'M20 20H380V220H20Z',label_position:[200,110],status_position:[200,145]}]}],sources:[{entity:'binary_sensor.replace_me',room:'room'}]};}
 setConfig(input){
  this._config=normalizeConfig(input);this._seen={};this._selected=null;this._key=null;this._loaded=false;this._lastFetch=0;this._generation=(this._generation??0)+1;this._loading=false;
  this._consumeCurrent();this._render();if(this.isConnected){this._startTimer();this._tick();}
 }
 getCardSize(){return 9;}
 getGridOptions(){return {columns:'full',rows:'auto',min_columns:6};}
 set hass(hass){this._hass=hass;if(!this._config)return;if(this._consumeCurrent()&&this._visible)this._render();if(this.isConnected&&!this._loaded)this._load();}
 connectedCallback(){
  this._startTimer();document.addEventListener('visibilitychange',this._onVisibility);
  if(typeof IntersectionObserver!=='undefined'){
   this._observer=new IntersectionObserver(entries=>{this._visible=entries[0]?.isIntersecting??true;if(this._visible)this._tick();});this._observer.observe(this);
  }this._tick();
 }
 disconnectedCallback(){clearInterval(this._timer);this._observer?.disconnect();document.removeEventListener('visibilitychange',this._onVisibility);}
 _startTimer(){clearInterval(this._timer);if(this._config)this._timer=setInterval(()=>this._tick(),this._config.refresh_seconds*1000);}
 _consumeCurrent(){
  if(!this._hass||!this._config)return false;
  const entities=[...new Set(this._config.sources.map(s=>s.entity))];
  const key=JSON.stringify(entities.map(id=>{const s=this._hass.states[id];return [id,s?.state,s?.last_updated,s?.last_changed];}));
  if(key===this._key)return false;this._key=key;
  const rows=entities.map(entity_id=>{const state=this._hass.states[entity_id];return state?{...state,entity_id}:null;}).filter(Boolean);
  ingest(this._seen,rows,this._config.sources,this._timezone());return true;
 }
 _timezone(){return this._config.time_zone??this._hass?.config?.time_zone??'UTC';}
 _tick(){if(!this.isConnected||!this._visible||document.visibilityState==='hidden')return;this._render();if(!this._loaded||Date.now()-this._lastFetch>=this._config.history_refresh_seconds*1000)this._load();}
 async _load(){
  if(!this._config||!this._hass||this._loading||!this.isConnected||!this._visible||document.visibilityState==='hidden')return;
  if(!this._config.history){this._loaded=true;return;}
  // Throttle retry attempts too, rather than retrying on every unrelated HA state update.
  if(Date.now()-this._lastFetch<this._config.history_refresh_seconds*1000)return;
  this._lastFetch=Date.now();this._loading=true;const generation=this._generation;
  try{
   const start=new Date(Date.now()-this._config.minutes*60000).toISOString();
   const ids=[...new Set(this._config.sources.map(s=>s.entity))].join(',');
   const attributes=this._config.sources.some(s=>s.timestamp?.from==='attribute');
   const data=await this._hass.callApi('GET',`history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(ids)}${attributes?'':'&no_attributes'}`);
   if(generation!==this._generation)return;
   if(!Array.isArray(data)||data.some(group=>!Array.isArray(group)))throw Error('Invalid history response');
   ingest(this._seen,data.flat(),this._config.sources,this._timezone());this._loaded=true;this._error=false;
  }catch(error){if(generation===this._generation)this._error=true;}
  finally{if(generation===this._generation){this._loading=false;if(this.isConnected)this._render();}}
 }
 _roomName(room){return room?.name??room?.labels.map(l=>l.text).join(' / ')??this._config.labels.no_events;}
 _age(time){return ageLabel(time,this._config.labels);}
 _svg(floor){
  const c=this._config,latest=latestRoom(this._seen),[vx,vy,vw,vh]=floor.view_box;
  return `<svg viewBox="${floor.view_box.join(' ')}" role="group" aria-label="${escapeHtml(floor.name??floor.id)}">
   ${floor.outline?`<path class="base" d="${escapeHtml(floor.outline)}"/>`:''}
   ${floor.rooms.filter(r=>c.show_untracked||!r.untracked).map(r=>{
    const seen=this._seen[r.id],state=roomStatus(r,seen,latest,c);
    const status=seen&&state!=='quiet'?this._age(seen.time):'—';
    const label=c.labels[state==='untracked'?'untracked':'quiet'];
    // Leave room inside the outer wall even when the configured point is at its edge.
    const w=r.status_width??c.appearance.status_width,h=r.status_height??c.appearance.status_height;
    const raw=r.status_position??[r.labels[0].position[0],r.labels[0].position[1]+25];
    const x=Math.max(vx+w/2+8,Math.min(vx+vw-w/2-8,raw[0]));
    const y=Math.max(vy+h/2+8,Math.min(vy+vh-h/2-8,raw[1]));
    return `<g class="room ${state}${this._selected===r.id?' selected':''}" data-room="${escapeHtml(r.id)}" role="button" tabindex="0" aria-label="${escapeHtml(this._roomName(r)+', '+(seen?this._age(seen.time):text(label,{minutes:c.minutes})))}">
     <path class="room-fill" d="${escapeHtml(r.path)}"/>
     ${r.labels.map(l=>`<text class="room-name" x="${l.position[0]}" y="${l.position[1]}">${escapeHtml(l.text)}</text>`).join('')}
     ${r.untracked?`<circle class="no-sensor" cx="${raw[0]}" cy="${raw[1]}" r="3"/>`:c.show_status?`<g class="room-status">${state!=='quiet'?`<rect class="status-pill" x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="${h/2}"/>`:''}<text class="age" x="${x}" y="${y+1}"${r.status_font_size?` style="font-size:${r.status_font_size}px"`:''}>${escapeHtml(status)}</text></g>`:''}
    </g>`;
   }).join('')}
   ${c.show_furniture?`<g class="furniture">${renderShapes(floor.furniture)}</g>`:''}
   ${c.show_windows?`<g class="windows">${renderShapes(floor.windows)}</g>`:''}
   <g class="decorations">${renderShapes(floor.decorations)}</g>
  </svg>`;
 }
 _render(){
  if(!this._config||!this._hass)return;
  const c=this._config,latest=latestRoom(this._seen),selected=this._selected??latest,seen=this._seen[selected];
  const room=c.floors.flatMap(f=>f.rooms).find(r=>r.id===selected);
  const historyEntity=c.history_entity??seen?.entity??c.sources[0]?.entity;
  const count=Object.values(this._seen).filter(s=>Date.now()-s.time<c.minutes*60000).length;
  for(const [key,val]of Object.entries(c.colors))this.style.setProperty('--map-'+key.replaceAll('_','-'),val);
  for(const [key,val]of Object.entries(c.appearance))this.style.setProperty('--map-'+key.replaceAll('_','-'),typeof val==='number'&&key!=='furniture_opacity'?`${val}px`:val);
  this.style.setProperty('--map-columns',c.columns);
  const values={minutes:c.minutes,fresh:c.fresh_minutes,count};
  this.shadowRoot.innerHTML=`<style>${ROOM_STYLE}
   @container(max-width:${c.stack_below}px){.plans{grid-template-columns:1fr}.wrap{padding:18px}.count{display:none}.detail{align-items:flex-start}.floor{max-width:540px;width:100%;margin:auto}h2{font-size:22px}}
  </style><ha-card><div class="wrap">
   <div class="top"><div>${c.eyebrow?`<div class="eyebrow">${escapeHtml(c.eyebrow)}</div>`:''}${c.title?`<h2>${escapeHtml(c.title)}</h2>`:''}${c.subtitle?`<p class="intro">${escapeHtml(text(c.subtitle,values))}</p>`:''}</div>${c.show_count?`<span class="count">${escapeHtml(text(c.labels.room_count,values))}</span>`:''}</div>
   <div class="plans">${c.floors.map(f=>`<div class="floor"><div class="floor-heading">${escapeHtml(f.name??f.id)}<small>${escapeHtml(f.short_name??'')}</small></div>${this._svg(f)}</div>`).join('')}</div>
   ${c.show_legend?`<div class="legend">${['latest','fresh','recent','untracked'].map(key=>`<span><i class="dot" style="${key==='untracked'?'border:1px dashed var(--map-muted)':'background:var(--map-'+key+')'}"></i>${escapeHtml(text(c.labels[key],{...values,minutes:key==='fresh'?c.fresh_minutes:c.minutes}))}</span>`).join('')}</div>`:''}
   ${c.show_details?`<div class="detail"><div><strong>${escapeHtml(this._roomName(room))}${seen?' · '+escapeHtml(this._age(seen.time)):''}</strong><small>${escapeHtml(seen?.detail??(room?.untracked?c.labels.no_channel:text(c.labels.quiet,values)))}</small></div><button id="history" ${historyEntity?'':'disabled'}>${escapeHtml(c.labels.history_button)}</button></div>`:''}
   ${c.note?`<p class="note">${escapeHtml(c.note)}</p>`:''}
   ${this._error?`<p class="status" role="status">${escapeHtml(c.labels.history_error)}</p>`:c.history&&!this._loaded?`<p class="status" role="status">${escapeHtml(c.labels.loading)}</p>`:''}
  </div></ha-card>`;
  this.shadowRoot.querySelectorAll('[data-room]').forEach(el=>{
   const select=()=>{this._selected=el.dataset.room;this._render();};el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};
  });
  const button=this.shadowRoot.querySelector('#history');if(button)button.onclick=()=>{if(historyEntity)this.dispatchEvent(new CustomEvent('hass-more-info',{detail:{entityId:historyEntity},bubbles:true,composed:true}));};
 }
}

export class MotionTrackerCardEditor extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'});}
 setConfig(config){this._config=config;this._render();}
 set hass(hass){this._hass=hass;if(!this.shadowRoot.querySelector('ha-form'))this._render();else this.shadowRoot.querySelector('ha-form').hass=hass;}
 _render(){
  if(!this._config||!this._hass)return;
  this.shadowRoot.innerHTML=`<style>textarea{width:100%;min-height:180px;font:12px monospace;box-sizing:border-box;background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);border-radius:8px;padding:10px}summary{cursor:pointer;padding:12px 0}.error{color:var(--error-color)}</style><ha-form></ha-form><details><summary>Full configuration (JSON)</summary><textarea aria-label="Full card configuration"></textarea><button id="apply">Apply configuration</button><p class="error" role="alert"></p></details>`;
  const form=this.shadowRoot.querySelector('ha-form');form.hass=this._hass;
  form.schema=[{name:'title',selector:{text:{}}},{name:'subtitle',selector:{text:{}}},{name:'minutes',selector:{number:{min:1,max:1440,mode:'box'}}},{name:'fresh_minutes',selector:{number:{min:0,max:1440,mode:'box'}}},{name:'columns',selector:{number:{min:1,max:4,mode:'box'}}},{name:'history',selector:{boolean:{}}}];
  const effective=normalizeConfig(this._config);form.data=Object.fromEntries(form.schema.map(s=>[s.name,effective[s.name]]));
  form.computeLabel=s=>s.name.replaceAll('_',' ');
  const area=this.shadowRoot.querySelector('textarea');area.value=JSON.stringify(this._config,null,2);
  const apply=config=>{try{normalizeConfig(config);this._config=config;this.dispatchEvent(new CustomEvent('config-changed',{detail:{config},bubbles:true,composed:true}));this.shadowRoot.querySelector('.error').textContent='';}catch(e){this.shadowRoot.querySelector('.error').textContent=e.message;}};
  form.addEventListener('value-changed',e=>{apply({...this._config,...e.detail.value});area.value=JSON.stringify(this._config,null,2);});
  this.shadowRoot.querySelector('#apply').onclick=()=>{try{apply(JSON.parse(area.value));}catch(e){this.shadowRoot.querySelector('.error').textContent=e.message;}};
 }
}
if(!customElements.get('motion-tracker-card'))customElements.define('motion-tracker-card',MotionTrackerCard);
if(!customElements.get('motion-tracker-card-editor'))customElements.define('motion-tracker-card-editor',MotionTrackerCardEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:'motion-tracker-card',name:'Motion Tracker Card',description:'Configurable floor plans with recent room and detector activity.'});
