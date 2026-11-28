import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receiptMessageIds, receiptChunks } from '../chatReceiptIds.ts';

test('ignores invalid/optimistic IDs, missing senders and duplicates',()=>{
 assert.deepEqual(receiptMessageIds('me',[{id:undefined,sender_id:'peer'},{id:'x'}, {id:'a',sender_id:'me'},{id:'a',sender_id:'me'},{id:'b',sender_id:'peer'}]),{own:['a'],incoming:['b']});
});
test('no user does not mark anything',()=>assert.deepEqual(receiptMessageIds('',[{id:'a',sender_id:'peer'}]),{own:[],incoming:[]}));
test('batches long conversations without losing IDs',()=>{
 const ids=Array.from({length:251},(_,i)=>String(i));
 assert.deepEqual(receiptChunks(ids).map(x=>x.length),[100,100,51]);
 assert.deepEqual(receiptChunks(ids).flat(),ids);
 assert.throws(()=>receiptChunks(ids,0));
});
