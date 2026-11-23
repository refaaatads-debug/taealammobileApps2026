import React, { useEffect, useReducer, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConversationProvider, useConversation } from '@elevenlabs/react-native';
import { supabase } from '@/lib/supabase';
import { emptyTranscript, reduceTranscript } from '@/lib/liveVoiceTranscript';

// Isolated build candidate. NOT imported by any production route.
// Keep false until native/audio, server authorization and minute accounting pass.
const LIVE_PREVIEW_ALLOWED = false;

function LiveVoiceInner() {
 const [transcript, dispatch] = useReducer(reduceTranscript, undefined, emptyTranscript);
 const [error, setError] = useState('');
 const [requesting, setRequesting] = useState(false);
 const alive = useRef(true);
 const generation = useRef(0);
 const controls = useRef<ReturnType<typeof useConversation> | null>(null);
 const acceptingEvents = useRef(false);
 const conversation = useConversation({
  onMessage: m => { if (acceptingEvents.current) dispatch({kind:'message',eventId:m.event_id,responseId:m.response_id,role:m.role,text:m.message}); },
  onAgentChatResponsePart: p => { if (acceptingEvents.current) dispatch({kind:'part',eventId:p.event_id,responseId:p.response_id,type:p.type,text:p.text}); },
  onAgentResponseCorrection: p => { if (acceptingEvents.current) dispatch({kind:'correction',eventId:p.event_id,responseId:p.response_id,text:p.corrected_agent_response}); },
  onInterruption: p => { if (acceptingEvents.current) dispatch({kind:'interrupt',eventId:p.event_id}); },
  onDisconnect: () => { acceptingEvents.current=false; },
  onError: () => { if (alive.current) setError('تعذر الاتصال. أنهِ الجلسة ثم حاول لاحقًا.'); },
 });
 controls.current=conversation;
 const end = () => {
  acceptingEvents.current=false;
  generation.current++;
  controls.current?.endSession();
  if (alive.current) setRequesting(false);
 };
 useEffect(()=>{
  alive.current=true;
  const listener=AppState.addEventListener('change',state=>{if(state!=='active')end();});
  return ()=>{alive.current=false;generation.current++;acceptingEvents.current=false;listener.remove();controls.current?.endSession();};
 },[]);
 const start=async()=>{
  if (!LIVE_PREVIEW_ALLOWED || requesting || conversation.status!=='disconnected' || !supabase) return;
  const run=++generation.current;
  setRequesting(true);setError('');dispatch({kind:'reset'});
  try {
   if(Platform.OS==='android') {
    const permission=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if(permission!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('microphone-denied');
   }
   if(!alive.current || run!==generation.current)return;
   // Existing endpoint requires an additive WebRTC response before this works.
   // No API/provider key is embedded in the app.
   const result=await supabase.functions.invoke('ai-tutor-token',{body:{transport:'webrtc'}});
   if(!alive.current || run!==generation.current)return;
   const token=result.data?.conversationToken;
   if(result.error || typeof token!=='string' || !token)throw new Error('token-unavailable');
   acceptingEvents.current=true;
   conversation.startSession({conversationToken:token,connectionType:'webrtc'});
  }catch{
   acceptingEvents.current=false;
   if(alive.current && run===generation.current)setError('تعذر بدء المحادثة. تحقق من الميكروفون وصلاحية الباقة والاتصال.');
  }finally{if(alive.current && run===generation.current)setRequesting(false);}
 };
 const connected=conversation.status==='connected';
 return <View style={styles.screen}>
  <Text style={styles.title}>المدرس المساعد، معاينة منفصلة</Text>
  <Text style={styles.notice}>الاتصال مقفول لحين اعتماد اختبار الصوت والصلاحيات والدقائق. هذه الشاشة غير منشورة.</Text>
  <Text style={styles.status}>{connected?(conversation.isSpeaking?'المساعد يرد':'أسمعك'):requesting?'جارٍ الاتصال':'غير متصل'}</Text>
  <ScrollView style={styles.transcript}>{transcript.turns.map(t=><View key={t.key} style={styles.turn}><Text style={styles.label}>{t.role==='user'?'أنت':'المساعد'}{t.interrupted?'، تمت المقاطعة':''}</Text><Text style={styles.body}>{t.text}</Text></View>)}</ScrollView>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  <View style={styles.buttons}>
   <Pressable accessibilityRole="button" disabled={!LIVE_PREVIEW_ALLOWED||requesting||conversation.status!=='disconnected'} onPress={start} style={styles.button}><Text>ابدأ</Text></Pressable>
   <Pressable accessibilityRole="button" disabled={!connected} onPress={()=>conversation.setMuted(!conversation.isMuted)} style={styles.button}><Text>{conversation.isMuted?'فتح الميكروفون':'كتم الميكروفون'}</Text></Pressable>
   <Pressable accessibilityRole="button" onPress={end} style={styles.button}><Text>إنهاء</Text></Pressable>
  </View>
 </View>;
}
export default function LiveVoiceTutorPreview(){return <ConversationProvider><LiveVoiceInner/></ConversationProvider>}
const styles=StyleSheet.create({screen:{flex:1,padding:24,backgroundColor:'#fff'},title:{fontSize:22,fontFamily:'Inter_700Bold',textAlign:'right',color:'#17364d'},notice:{fontSize:12,textAlign:'right',marginVertical:16,color:'#617782'},status:{textAlign:'center',color:'#10796f',fontSize:18},transcript:{flex:1,marginVertical:16},turn:{padding:16,borderRadius:16,backgroundColor:'#edf6f3',marginBottom:12},label:{fontSize:12,color:'#617782',textAlign:'right'},body:{fontSize:18,textAlign:'right',color:'#17364d'},error:{color:'#a33',textAlign:'right'},buttons:{flexDirection:'row-reverse',gap:8,flexWrap:'wrap'},button:{padding:14,borderRadius:12,backgroundColor:'#edf6f3'}});
