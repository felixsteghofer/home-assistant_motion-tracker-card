export const DEFAULTS = {
 title:'Where was the last movement?',subtitle:'Recent detections around your home.',eyebrow:'Motion tracker',
 minutes:30,fresh_minutes:5,refresh_seconds:30,history_refresh_seconds:60,history:true,
 columns:2,stack_below:640,time_zone:null,locale:'en',floors:[],sources:[],
 appearance:{room_font_size:15,status_font_size:12,wall_width:4,outline_width:8,status_width:108,status_height:22,furniture_color:'#a5ab9a',furniture_opacity:0.58,floor_radius:18},
 colors:{background:'#f8f7f3',room:'#f0eee7',untracked:'#f6f4ef',wall:'#697262',text:'#4b554b',muted:'#738173',latest:'#84b8a6',fresh:'#c9e3d7',recent:'#eee0b9',selected:'#285f50',status_background:'#ffffff',status_text:'#294b3d'},
 labels:{latest:'Latest',fresh:'Under {minutes} min',recent:'{fresh}–{minutes} min',untracked:'No detection source',quiet:'No detection in the last {minutes} minutes.',loading:'Loading history…',history_error:'History unavailable. Showing observations received by this card.',history_button:'History',now:'Just now',minutes_ago:'{count} min ago',hours_ago:'{count} hr ago',room_count:'{count} rooms with detections',no_events:'No detections yet',no_detail:'No detector details available.',no_channel:'No detection source configured for this room.'},
 show_legend:true,show_count:true,show_details:true,show_status:true,show_furniture:true,show_windows:true,show_untracked:true,note:'',history_entity:null
};
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function text(template,values={}){return String(template).replace(/\{(\w+)\}/g,(_,key)=>values[key]??`{${key}}`);}
function finite(n,name){if(!Number.isFinite(n))throw Error(`${name} must be a finite number`);return n;}
function position(p,name){if(!Array.isArray(p)||p.length!==2)throw Error(`${name} must be [x, y]`);return p.map(n=>finite(n,name));}
function path(p){if(typeof p!=='string'||!p.trim()||!/^[\s\d.,eE+\-MmZzLlHhVvCcSsQqTtAa]+$/.test(p))throw Error('Invalid SVG path');return p;}
const SHAPE_ATTRIBUTES = {
 path:['d'],rect:['x','y','width','height','rx','ry'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points']
};
const PAINT_ATTRIBUTES=['fill','stroke','stroke-width','opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','transform'];
function validateShape(shape){
 if(!SHAPE_ATTRIBUTES[shape.type])throw Error(`Unsupported decoration shape: ${shape.type}`);
 for(const [key,value]of Object.entries(shape)){
  if(key==='type')continue;
  if(![...SHAPE_ATTRIBUTES[shape.type],...PAINT_ATTRIBUTES].includes(key))throw Error(`Unsupported SVG attribute: ${key}`);
  if(key==='d')path(value);
  if(key==='points'&&!/^[\d\s.,eE+\-]+$/.test(value))throw Error('Invalid SVG points');
  if(key==='transform'&&!/^[\d\s.,eE+\-()a-zA-Z]+$/.test(value))throw Error('Invalid SVG transform');
  if(['fill','stroke'].includes(key))color(value);
  if(typeof value!=='number'&&typeof value!=='string')throw Error(`Invalid SVG attribute: ${key}`);
 }
 return {...shape};
}
function color(v){if(typeof v!=='string'||v.length>100||/[;{}<>]|url\s*\(/i.test(v))throw Error('Invalid color');return v;}
export function normalizeConfig(input){
 const c={...DEFAULTS,...input,appearance:{...DEFAULTS.appearance,...input.appearance},colors:{...DEFAULTS.colors,...input.colors},labels:{...DEFAULTS.labels,...input.labels}};
 for(const key of ['minutes','fresh_minutes','refresh_seconds','history_refresh_seconds','stack_below'])finite(c[key],key);
 if(c.minutes<1||c.minutes>1440)throw Error('minutes must be 1–1440');
 if(c.fresh_minutes<0||c.fresh_minutes>c.minutes)throw Error('fresh_minutes must be within minutes');
 if(c.refresh_seconds<5||c.history_refresh_seconds<15)throw Error('Refresh intervals must be at least 5 seconds (render) / 15 seconds (history)');
 if(!Number.isInteger(c.columns)||c.columns<1||c.columns>4)throw Error('columns must be 1–4');
 if(c.stack_below<240||c.stack_below>1600)throw Error('stack_below must be 240–1600 pixels');
 Object.values(c.colors).forEach(color);
 color(c.appearance.furniture_color);
 for(const [key,value]of Object.entries(c.appearance))if(key!=='furniture_color'&&(finite(value,key)<0||value>200))throw Error(`Invalid appearance.${key}`);
 if(!Array.isArray(c.floors)||!c.floors.length)throw Error('Configure at least one floor');
 const ids=new Set(),floorIds=new Set();
 c.floors=c.floors.map((f,i)=>{
  if(!f.id||floorIds.has(f.id))throw Error('Floor ids must be unique');floorIds.add(f.id);
  const vb=Array.isArray(f.view_box)?f.view_box:String(f.view_box??'').split(/[ ,]+/).map(Number);
  if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)throw Error(`Invalid view_box for floor ${f.id}`);
  const floor={...f,view_box:vb,outline:f.outline?path(f.outline):null};
  for(const key of ['furniture','windows','decorations'])floor[key]=(f[key]??[]).map(validateShape);
  if(!Array.isArray(f.rooms)||!f.rooms.length)throw Error(`Floor ${f.id} has no rooms`);
  floor.rooms=f.rooms.map(r=>{
   if(!r.id||ids.has(r.id))throw Error('Room ids must be unique across all floors');ids.add(r.id);
   const labels=(r.labels??[{text:r.name??r.id,position:r.label_position}]).map(l=>({...l,position:position(l.position,'label position')}));
   if(!labels.length)throw Error(`Room ${r.id} requires a label`);
   for(const key of ['status_width','status_height','status_font_size'])if(r[key]!==undefined&&(finite(r[key],key)<=0||r[key]>500))throw Error(`Invalid room ${key}`);
   return {...r,path:path(r.path),labels,status_position:r.status_position?position(r.status_position,'status position'):null};
  });return floor;
 });
 const known=new Set(ids);
 if(!Array.isArray(c.sources)||!c.sources.length)throw Error('Configure at least one source');
 c.sources=c.sources.map(s=>{
  if(!s.entity||typeof s.entity!=='string')throw Error('Each source needs an entity');
  const source={type:'binary',states:['on'],priority:0,...s};
  if(!Array.isArray(source.states))throw Error('Source states must be an array');
  if(!['binary','timestamp','event'].includes(source.type))throw Error(`Unsupported source type ${source.type}`);
  if(source.type==='event'){
   if(!source.room_pattern||!source.room_map)throw Error('Event sources require room_pattern and room_map');
   new RegExp(source.room_pattern);
   for(const room of Object.values(source.room_map))if(!known.has(room))throw Error(`Unknown mapped room: ${room}`);
  }else if(!known.has(source.room))throw Error(`Unknown source room: ${source.room}`);
  if(source.timestamp?.pattern)new RegExp(source.timestamp.pattern);
  if(source.detail_pattern)new RegExp(source.detail_pattern);
  return source;
 });
 const tracked=new Set(c.sources.flatMap(s=>s.type==='event'?Object.values(s.room_map):[s.room]));
 for(const floor of c.floors)for(const room of floor.rooms)room.untracked=room.untracked??!tracked.has(room.id);
 if(c.time_zone)new Intl.DateTimeFormat(c.locale,{timeZone:c.time_zone});
 return c;
}
export function parseLocalTimestamp(value,pattern,timezone){
 const groups=String(value).match(new RegExp(pattern))?.groups;
 if(!groups)return NaN;
 const {year,month,day,hour='0',minute='0',second='0'}=groups;
 if(!year||!month||!day)return NaN;
 const parts=[+year,+month,+day,+hour,+minute,+second];
 if(parts.some(n=>!Number.isInteger(n))||+month<1||+month>12||+day<1||+day>31||+hour>23||+hour<0||+minute>59||+minute<0||+second>59||+second<0)return NaN;
 const target=Date.UTC(+year,+month-1,+day,+hour,+minute,+second);
 const calendar=new Date(target);
 if(calendar.getUTCFullYear()!==+year||calendar.getUTCMonth()!==+month-1||calendar.getUTCDate()!==+day)return NaN;
 let t=target;
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(t).map(x=>[x.type,x.value]));
  const difference=target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  if(!difference)return t;t+=difference;
 }return NaN;
}
function timestamp(row,source,timezone){
 const ts=source.timestamp??{from:source.type==='timestamp'?'state':'last_changed',format:'iso'};
 const value=ts.from==='attribute'?row.attributes?.[ts.attribute]:ts.from==='state'?row.state:row[ts.from??'last_changed'];
 if(ts.format==='local')return parseLocalTimestamp(value,ts.pattern,ts.time_zone??timezone);
 const match=ts.pattern?String(value).match(new RegExp(ts.pattern))?.[1]:value;
 // Numeric sensor states are not silently interpreted as dates.
 return typeof match==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(match)?Date.parse(match):NaN;
}
export function observation(row,source,timezone='UTC',now=Date.now()){
 if(!row||['unknown','unavailable','',null,undefined].includes(row.state))return null;
 let room=source.room;
 if(source.type==='binary'&&!source.states.includes(row.state))return null;
 if(source.type==='event')room=source.room_map[String(row.state).match(new RegExp(source.room_pattern))?.[source.room_group??1]];
 if(!room)return null;
 const time=timestamp(row,source,timezone);if(!Number.isFinite(time)||time>now+60000)return null;
 const detail=source.detail_pattern?String(row.state).match(new RegExp(source.detail_pattern))?.[1]:source.name??(source.type==='event'?row.state:row.attributes?.friendly_name??source.entity);
 return {room,time,entity:source.entity,detail:detail??source.name??source.entity,priority:source.priority??0};
}
export function ingest(seen,rows,sources,timezone,now=Date.now()){
 for(const row of rows){
  for(const source of sources.filter(s=>s.entity===row.entity_id)){
   const item=observation(row,source,timezone,now);if(!item)continue;
   const previous=seen[item.room];
   if(!previous||item.time>previous.time||(item.time===previous.time&&item.priority>=previous.priority))seen[item.room]=item;
  }
 }return seen;
}
export function latestRoom(seen){return Object.values(seen).sort((a,b)=>b.time-a.time)[0]?.room;}
export function roomStatus(room,seen,latest,c,now=Date.now()){
 if(room.untracked)return 'untracked';
 const minutes=seen?(now-seen.time)/60000:Infinity;
 if(minutes>=c.minutes)return 'quiet';
 return room.id===latest?'latest':minutes<c.fresh_minutes?'fresh':'recent';
}
export function ageLabel(time,labels,now=Date.now()){
 const s=Math.max(0,Math.floor((now-time)/1000));
 return s<60?labels.now:s<3600?text(labels.minutes_ago,{count:Math.floor(s/60)}):text(labels.hours_ago,{count:Math.floor(s/3600)});
}
export function renderShapes(shapes){return shapes.map(s=>`<${s.type} ${Object.entries(s).filter(([k])=>k!=='type').map(([k,v])=>`${k}="${escapeHtml(v)}"`).join(' ')}/>`).join('');}
