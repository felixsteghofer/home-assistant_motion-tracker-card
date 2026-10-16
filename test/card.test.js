import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
globalThis.HTMLElement=class{constructor(){this.style={setProperty(){}};}attachShadow(){this.shadowRoot={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};}dispatchEvent(){}};
globalThis.customElements={get:()=>false,define(){}};
globalThis.window={};
globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
const {MotionTrackerCard}=await import('../src/card.js');
const basic=JSON.parse(await readFile(new URL('../examples/basic.json',import.meta.url),'utf8'));
test('room status is rendered on a separate contrasting pill, inside viewbox bounds',()=>{
 const c=new MotionTrackerCard();c.setConfig(basic);c.hass={config:{time_zone:'UTC'},states:{}};
 c._seen.living={room:'living',time:Date.now()};
 const svg=c._svg(c._config.floors[0]);assert.match(svg,/class="status-pill"/);assert.match(c.shadowRoot.innerHTML,/fill:var\(--map-status-background\)/);
 c._config.floors[0].rooms[0].status_position=[165,300];
 const clamped=c._svg(c._config.floors[0]);assert.match(clamped,/y="270" width="108" height="22"/);
});
test('unrelated HA entity changes do not render the card again',()=>{
 const c=new MotionTrackerCard();c.setConfig(basic);let renders=0;c._render=()=>renders++;
 c.hass={states:{}};const first=renders;c.hass={states:{'sensor.unrelated':{state:'5'}}};assert.equal(renders,first);
});
test('history errors are visible, retries are throttled, and a successful retry recovers',async()=>{
 const c=new MotionTrackerCard();c.setConfig(basic);c.isConnected=true;let calls=0;
 c.hass={states:{},config:{time_zone:'UTC'},callApi:async()=>{calls++;throw Error('offline');}};
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(c._error,true);await c._load();assert.equal(calls,1);
 c._lastFetch=0;c._hass.callApi=async()=>[];await c._load();assert.equal(c._error,false);assert.equal(c._loaded,true);
});
