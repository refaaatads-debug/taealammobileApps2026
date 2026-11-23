import assert from 'node:assert/strict';
import test from 'node:test';
import {savedAddressSummary,savedAddressCountText} from '../savedAddressSummary.ts';
import {readFileSync} from 'node:fs';
test('summary counts saved addresses without leaking street or coordinates',()=>{
 const result=savedAddressSummary([{city_id:'d',street_address:'PRIVATE STREET',latitude:26,is_primary:true},{city_id:'d'}],[{id:'d',name_ar:'الدمام'}]);
 assert.deepEqual(result,{count:2,cityNames:'الدمام'});assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('multiple cities are unique, primary first; missing city is not invented',()=>{
 assert.deepEqual(savedAddressSummary([{city_id:'x'},{city_id:'d',is_primary:true},{city_id:'d'}],[{id:'d',name_ar:'الدمام'}]),{count:3,cityNames:'الدمام'});
 assert.deepEqual(savedAddressSummary([],[]),{count:0,cityNames:''});
});
test('count text Arabic and English',()=>{
 assert.equal(savedAddressCountText(2,'ar'),'لديك عنوانان محفوظان');assert.equal(savedAddressCountText(1,'en'),'1 saved address');assert.equal(savedAddressCountText(2,'en'),'2 saved addresses');
});
test('own summary loads while editor stays collapsed, cancels stale response and supports retry',()=>{
 const source=readFileSync(new URL('../../components/ProfileInPersonSection.tsx',import.meta.url),'utf8');
 assert.match(source,/useState\(false\)/);assert.match(source,/select\("city_id,is_primary"\)\.eq\("owner_id",userId\)/);assert.match(source,/cancelled = true/);assert.match(source,/\[userId, role, summaryAttempt\]/);assert.match(source,/setSummaryAttempt\(value=>value\+1\)/);assert.match(source,/sectionDataLoaded, addresses, cities/);
 const profile=readFileSync(new URL('../../app/(tabs)/profile.tsx',import.meta.url),'utf8');assert.match(profile,/key=\{`student-address-\$\{user.id\}`\}/);
});
