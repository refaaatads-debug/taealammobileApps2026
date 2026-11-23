import { test } from 'node:test';
import assert from 'node:assert/strict';
import {emptyTranscript,reduceTranscript as r} from '../liveVoiceTranscript.ts';
test('parts and final transcript reconcile into one turn',()=>{
 let s=r(emptyTranscript(),{kind:'part',eventId:1,responseId:'r',type:'start',text:''});
 s=r(s,{kind:'part',eventId:1,responseId:'r',type:'delta',text:'Hello'});
 s=r(s,{kind:'message',eventId:1,responseId:'r',role:'agent',text:'Hello world'});
 assert.equal(s.turns.length,1); assert.equal(s.turns[0].text,'Hello world');
 assert.equal(r(s,{kind:'part',eventId:1,responseId:'r',type:'delta',text:'late'}),s);
});
test('interruption rejects stale parts/final but allows a new turn and correction',()=>{
 let s=r(emptyTranscript(),{kind:'part',eventId:1,responseId:'r',type:'delta',text:'Partial'});
 s=r(s,{kind:'interrupt',eventId:1});
 assert.equal(s.turns[0].interrupted,true);
 assert.equal(r(s,{kind:'message',eventId:1,responseId:'r',role:'agent',text:'stale final'}),s);
 s=r(s,{kind:'correction',eventId:1,responseId:'r',text:'Heard fragment'});
 assert.equal(s.turns[0].text,'Heard fragment');
 s=r(s,{kind:'message',eventId:2,role:'user',text:'New question'});
 s=r(s,{kind:'message',eventId:3,role:'agent',text:'New answer'});
 assert.equal(s.turns.length,3); assert.equal(s.turns[2].text,'New answer');
 assert.deepEqual(r(s,{kind:'reset'}),emptyTranscript());
});
test('duplicate final response replaces rather than appends',()=>{
 let s=r(emptyTranscript(),{kind:'message',eventId:1,role:'agent',text:'a'});
 s=r(s,{kind:'message',eventId:1,role:'agent',text:'a'});
 assert.equal(s.turns.length,1);
});
