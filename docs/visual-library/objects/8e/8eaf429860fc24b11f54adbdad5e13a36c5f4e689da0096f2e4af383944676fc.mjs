import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {bossHp} from '../../../../game-opus/shared/fortwaves.ts';
test('R2 is self-contained with all six roles and exact current 1/2/4 boss-health baseline',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../data/roster-v2.json',import.meta.url))),html=fs.readFileSync(new URL('./report.html',import.meta.url),'utf8'),script=fs.readFileSync(new URL('./report.js',import.meta.url),'utf8');
 assert.deepEqual(r.roles.map(x=>x.id),['ropecrab','jampump','canopy','foreman','crabcrane','miller']);assert.deepEqual(r.teams.map(x=>x.n),[1,2,4]);assert.deepEqual(r.teams.map(x=>x.bodyCap),[60,85,135]);assert.deepEqual(r.teams.map(x=>x.urgent),[2,3,4]);
 for(const role of r.roles)for(const key of['first','hp','speed','gate','crystal','hit','slots','role','phases','counter','mix'])assert(role[key]!==undefined,'Missing role '+role.id+' '+key);
 for(const row of r.bossHealth)for(const h of row.health)assert.equal(h.hp,Math.round(bossHp(row.wave,h.n)));
 for(const id of['roster','roster-cards','team-roster-policy','boss-health-rows'])assert(html.includes('id="'+id+'"'));assert(script.includes('V2.roster'));assert(r.limits.includes('не победу'));assert(r.director.includes('60%'));
});
