import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeConfig,parseLocalTimestamp,observation,ingest,roomStatus,latestRoom,escapeHtml,renderShapes} from '../src/core.js';
const basic=JSON.parse(await readFile(new URL('../examples/basic.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-16T10:00:00Z');
const pattern='(?<day>\\d{2})\\.(?<month>\\d{2})\\.(?<year>\\d{4}) (?<hour>\\d{2}):(?<minute>\\d{2}):(?<second>\\d{2})$';
test('configuration resolves rooms and supports several sensors per room',()=>{
 const c=normalizeConfig({...basic,sources:[...basic.sources,{entity:'binary_sensor.sofa',room:'living'}]});
 assert.equal(c.sources.length,3);assert.equal(c.floors[0].rooms[0].untracked,false);
 const absent=normalizeConfig({...basic,sources:[basic.sources[0]]});assert.equal(absent.floors[0].rooms[1].untracked,true);
});
test('bad mappings, duplicate rooms, SVG script attributes and paint URLs are rejected',()=>{
 assert.throws(()=>normalizeConfig({...basic,sources:[{entity:'binary_sensor.x',room:'missing'}]}),/Unknown/);
 const duplicate=structuredClone(basic);duplicate.floors[0].rooms[1].id='living';assert.throws(()=>normalizeConfig(duplicate),/unique/);
 const unsafe=structuredClone(basic);unsafe.floors[0].furniture=[{type:'script'}];assert.throws(()=>normalizeConfig(unsafe),/Unsupported/);
 unsafe.floors[0].furniture=[{type:'rect',onclick:'alert(1)'}];assert.throws(()=>normalizeConfig(unsafe),/Unsupported/);
 assert.throws(()=>normalizeConfig({...basic,colors:{room:'url(https://example.com)'}}),/color/);
 assert.throws(()=>normalizeConfig({...basic,minutes:0}),/minutes/);
});
test('Berlin local event timestamps use HA timezone and respect daylight saving',()=>{
 assert.equal(parseLocalTimestamp('16.10.2026 12:00:00',pattern,'Europe/Berlin'),now);
 assert.equal(parseLocalTimestamp('16.01.2026 12:00:00',pattern,'Europe/Berlin'),Date.parse('2026-01-16T11:00:00Z'));
 assert.ok(Number.isNaN(parseLocalTimestamp('not a date',pattern,'Europe/Berlin')));
 assert.ok(Number.isNaN(parseLocalTimestamp('31.02.2026 12:00:00',pattern,'Europe/Berlin')));
});
test('clear, unknown, missing and future states do not create detections',()=>{
 const source=normalizeConfig(basic).sources[0];
 for(const state of ['off','unknown','unavailable',''])assert.equal(observation({state,last_changed:new Date(now).toISOString()},source,'UTC',now),null);
 assert.equal(observation({state:'on',last_changed:'2026-10-16T12:00:00Z'},source,'UTC',now),null);
});
test('event helpers map room labels and detector keys without modifying entities',()=>{
 const source={type:'event',entity:'input_text.events',room_pattern:'GA (.+?) ·',room_map:{'1/2/3':'living'},timestamp:{from:'state',format:'local',pattern,time_zone:'Europe/Berlin'},detail_pattern:'^(.*?) · GA',priority:2};
 const row={entity_id:'input_text.events',state:'Sofa detector · GA 1/2/3 · 16.10.2026 12:00:00'};
 const result=observation(row,source,'UTC',now);assert.equal(result.room,'living');assert.equal(result.detail,'Sofa detector');assert.equal(result.time,now);
 assert.equal(observation({...row,state:row.state.replace('1/2/3','9/9/9')},source,'UTC',now),null);
});
test('latest timestamp wins, including out-of-order history; detail priority breaks ties',()=>{
 const sources=[{type:'binary',states:['on'],entity:'binary_sensor.a',room:'living',priority:0},{type:'binary',states:['on'],entity:'binary_sensor.b',room:'living',priority:1}];
 const seen={};ingest(seen,[{entity_id:'binary_sensor.b',state:'on',last_changed:'2026-10-16T09:59:00Z'},{entity_id:'binary_sensor.a',state:'on',last_changed:'2026-10-16T09:59:00Z'},{entity_id:'binary_sensor.a',state:'on',last_changed:'2026-10-16T09:58:00Z'}],sources,'UTC',now);
 assert.equal(seen.living.entity,'binary_sensor.b');assert.equal(latestRoom(seen),'living');
});
test('native ISO timestamps and timestamp attributes are accepted',()=>{
 assert.equal(observation({state:'2026-10-16T09:59:00Z'},{type:'timestamp',entity:'sensor.last',room:'hall'},'UTC',now).room,'hall');
 assert.equal(observation({state:'on',attributes:{detected:'2026-10-16T09:59:00Z'}},{type:'binary',states:['on'],room:'hall',timestamp:{from:'attribute',attribute:'detected',format:'iso'}},'UTC',now).time,now-60000);
});
test('recent colors expire at the configured cutoff, independently of the latest room',()=>{
 const c=normalizeConfig(basic),room={id:'hall'};
 assert.equal(roomStatus(room,{time:now-1000},'hall',c,now),'latest');
 assert.equal(roomStatus(room,{time:now-1000},'living',c,now),'fresh');
 assert.equal(roomStatus(room,{time:now-10*60000},'living',c,now),'recent');
 assert.equal(roomStatus(room,{time:now-30*60000},'hall',c,now),'quiet');
 assert.equal(roomStatus({...room,untracked:true},null,'hall',c,now),'untracked');
});
test('external state labels and SVG attribute values are escaped',()=>{
 assert.equal(escapeHtml('<img src=x>'),'&lt;img src=x&gt;');
 assert.match(renderShapes([{type:'rect',x:'1" onload="x'}]),/x="1&quot; onload=&quot;x"/);
});
