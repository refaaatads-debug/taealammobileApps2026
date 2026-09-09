# SESSIONS PARITY REPORT

**تاريخ التدقيق:** 2026-09-06  
**النطاق:** `sessions`, `bookings.session_status`, الجلسة الحية، WebRTC، المكالمات الداخلية، الحضور، heartbeat، إنهاء الجلسة، المدة، والصلاحيات.  
**قاعدة المرحلة:** تدقيق وإصلاح داخل Mobile/API الخاص بالتطبيق فقط، دون كتابة أو تعديل في Production.

## 1. Executive Summary

تمت مقارنة مواصفة المرحلة السادسة مع:

- `attached_assets/Pasted--6-SESSIONS-LIVE-SESSION-CALLS-ATTENDANCE--178866858960_1788668589610.txt`
- `attached_assets/student-dashboard-architecture_1788591912035.md`
- `attached_assets/student-dashboard-architecture_1788629894440.md`
- `attached_assets/platform-master-integrated-architecture_1788629894258.md`
- `attached_assets/teacher-dashboard-architecture_1788629894486.md`
- `attached_assets/full-session-booking-finance-assignments-architecture_1788629894391.md`
- `artifacts/ajyal-mobile/app/live-session.tsx`
- `artifacts/ajyal-mobile/hooks/useSessionWebRTC.ts`
- `artifacts/ajyal-mobile/hooks/useInternalCallWebRTC.ts`
- `artifacts/ajyal-mobile/contexts/InternalCallContext.tsx`
- `artifacts/api-server/src/routes/learning.ts`
- `artifacts/api-server/src/routes/push.ts`
- `lib/api-spec/openapi.yaml`

النتيجة:

- Mobile يقرأ lifecycle الجلسة من `sessions.started_at`, `sessions.ended_at` و`bookings.session_status`.
- الهاتف يمنع المعلم من بدء أو إنهاء lifecycle الجلسة، وهو متوافق مع سياسة أن دورة المعلم والخصم Desktop-owned.
- الطالب يستطيع محاولة الدخول فقط عندما توجد `started_at` ولا توجد `ended_at` ويكون `session_status=in_progress`.
- WebRTC يستخدم Supabase Realtime على `webrtc-${bookingId}` وTURN عبر `turn-credentials`، وهو مطابق لاتجاه النقل الأصلي، لكن الاتصال الحقيقي على جهاز لم يثبت.
- لا يوجد في Mobile/API تسجيل مثبت لـ`active_sessions`, attendance, heartbeat, أو session events.
- لا يوجد endpoint محلي لبدء الجلسة أو إنهائها أو حساب المدة؛ وهذا صحيح فقط بقدر بقاء lifecycle في Production/المنصة الأصلية.
- شاشة الجلسة تربط حالة مكالمة داخلية نشطة بإمكانية تشغيل WebRTC للجلسة من دون إثبات أن `call.roomId` يطابق `bookingId`.
- زر الهاتف يقول "إنهاء الجلسة"، لكنه يوقف WebRTC وينهي المكالمة الداخلية فقط ولا ينهي `sessions` أو `bookings` ولا يثبت الخصم.
- مسارات Push للمكالمات الداخلية لا تثبت في API علاقة caller/recipient بالحجز أو الجلسة، وتحتاج عقداً إنتاجياً واضحاً قبل إصلاحها بأمان.
- الخصم والأرباح والتسوية تبقى `UNVERIFIED/BLOCKED` من Mobile/API؛ لا توجد أي كتابة مالية في هذه المرحلة.

## 2. Source-of-Truth Architecture

| المجال | المصدر |
|---|---|
| الحجز الذي يقود الجلسة | `bookings` |
| الحالة التشغيلية للحجز | `bookings.status`, `bookings.session_status` |
| lifecycle الجلسة | `sessions` |
| قفل/حضور الطرف | `active_sessions` |
| الإشارات إن وجدت في المنصة | Supabase Realtime / `webrtc_signals` أو channel المعتمد |
| المكالمة الداخلية | `internal_calls` عبر RPCs الأصلية |
| حضور/أحداث الجلسة | `active_sessions`, `session_events` بحسب المصدر |
| الفوترة | `auto_complete_session` وTriggers/Functions الأصلية |
| WebRTC credentials | Edge Function `turn-credentials` |
| Push المكالمات | Push token + مسار المكالمة المعتمد |

قاعدة الفصل:

```text
booking
  -> session
  -> teacher starts from desktop
  -> student joins after authoritative start
  -> WebRTC media
  -> teacher ends through platform lifecycle
  -> session completion trigger/function
  -> downstream billing/reporting
```

المكالمة الداخلية ليست بديلاً عن `sessions` ولا عن lifecycle الحجز. قناة الصوت الداخلية `internal-voice-<callId>` منفصلة عن قناة فيديو الجلسة `webrtc-<bookingId>`.

## 3. Session Lifecycle

| PHASE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| booking confirmed | `bookings.status=confirmed` | يقرأ الحجوزات فقط في الجلسات | `useListMySessions` يعرض الحجز | MATCHED | `learning.ts:listRemoteSessions` | متوسط | لا تغيير |
| session created | `auto_create_session` بعد booking | لا ينشئ session مباشرة | يقرأ `sessions` | MATCHED | architecture trigger matrix | عالٍ إذا لم يعمل Production trigger | Production verification |
| scheduled/not started | booking/session source | يعرض `not_started` عند وجودها | يخفي زر الدخول | PARTIAL | `mapRemoteSession`, `live-session.tsx` | متوسط: لا يوجد model مستقل للـsession status | لا نخترع status |
| teacher joins/starts | Desktop teacher flow | لا endpoint start | teacher phone read-only | MATCHED | `mobile-session-device-policy`, `live-session.tsx` | متوسط | لا تغيير |
| student joins | بعد `started_at` و`in_progress` | لا join endpoint | Realtime + RLS reads + WebRTC | PARTIAL | `live-session.tsx:33-57` | ownership/precheck غير مثبتين خادمياً | Production contract required |
| call starts | WebRTC/Reatime | لا يكتب call record للجلسة | creates peer connection | PARTIAL | `useSessionWebRTC.ts` | connection success لا يثبت attendance | لا تعديل مالي |
| active session | `active_sessions` + heartbeat | لا يديرها | لا يكتبها | MISMATCH | لا استدعاء `active_sessions` في Mobile/API | لا يعرف المصدر من دخل فعلاً | BLOCKED |
| call ends | peer leave / original lifecycle | لا endpoint session end | student stops peer/internal call | PARTIAL | `live-session.tsx:112-127` | لا يثبت نهاية جلسة أو مدة | teacher-owned Production flow |
| teacher ends session | platform desktop | غير موجود | teacher phone explicitly blocked | MATCHED | `live-session.tsx:161-165` | لا يمكن اختبار المسار من الهاتف | لا تغيير |
| session completed | Trigger/function | API يعرض حالة booking فقط | لا يكتب completed | MATCHED | `auto_complete_session` docs | Production trigger غير مختبر | Production verification |
| downstream settlement | DB trigger/function | لا يخصم | لا يخصم | MATCHED | session billing memory | لا دليل runtime | لا تغيير |

## 4. Session Status

القيم المثبتة في العقد المحلي وmapping:

```text
not_started
waiting_acceptance
in_progress
completed
cancelled
rejected
expired
```

العلاقة العملية:

- `bookings.session_status` هو القيمة التي يستخدمها Mobile للسماح بالدخول.
- `sessions.started_at` هو دليل أن الجلسة بدأت.
- `sessions.ended_at` هو دليل أن الجلسة انتهت.
- لا ينشئ Mobile حالة جديدة.
- `mapRemoteSession` يقبل فقط الحالات المعروفة ويحول القيم غير المعروفة إلى `null`.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| whitelist للحالات | حالات المصدر فقط | mapping يرفض القيم غير المعروفة | UI يعتمد status معروف | MATCHED | `learning.ts:249-252`, OpenAPI generated zod | منخفض | لا تغيير |
| `in_progress` gate | بدأ المعلم والجلسة فعالة | sessions list يشمل live booking | join يتطلب `session_status=in_progress` | MATCHED | `live-session.tsx:47` | متوسط | لا تغيير |
| `started_at` gate | الطالب لا يدخل قبل بدء المعلم | لا يقرر start | يتطلب `started_at` | MATCHED | `live-session.tsx:47` | منخفض | لا تغيير |
| session status مقابل booking status | يجب أن يبقيا متسقين عبر trigger | يقرأ الاثنين في مواضع مختلفة | لا يتحقق من `bookings.status=confirmed` قبل join | PARTIAL | `live-session.tsx:35-47` | عالٍ إذا كانت الحالة متناقضة | يحتاج مصدر/endpoint lifecycle |
| حالات غير مثبتة | لا يسمح بها | لا ينشئها | لا ينشئها | MATCHED | لا write lifecycle في Mobile | منخفض | لا تغيير |

## 5. Start Session

المصدر يثبت أن بدء جلسة المعلم يتم من مسار Desktop. الهاتف لا يبدأ session ولا يثبت `started_at`.

| CHECK | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| من يبدأ | Teacher desktop | لا endpoint start | يمنع teacher start | MATCHED | `live-session.tsx:161-165` | منخفض | لا تغيير |
| student starts session | غير مثبت كصلاحية lifecycle | غير موجود | الطالب يبدأ join فقط بعد start | MATCHED | device policy + `canStudentJoin` | منخفض | لا تغيير |
| confirmed booking | يجب أن يقود الجلسة | list يعرض confirmed/pending | لا يتحقق مباشرة في `live-session` | PARTIAL | `listRemoteSessions` وdirect reads | عالٍ عند URL يدوي | RLS/Production validation required |
| time/grace period | غير مثبت في Mobile contract | غير موجود | لا يضيف window | UNVERIFIED | لا توجد قاعدة صريحة في الكود المقروء | متوسط | لا تخمين |
| participant identity | RLS طرفا الحجز هو المصدر المفترض | لا session authorization endpoint | يعتمد على Supabase client/RLS | PARTIAL | architecture RLS matrix | حرج إذا كانت policy غير كافية | Production read-only verification |
| active session lock | `active_sessions` في المنصة | غير موجود | لا يفحصه | MISMATCH | لا query/write لـ`active_sessions` | جلسة ثانية لا تظهر أو لا تمنع | BLOCKED — REQUIRES PRODUCTION SESSION PATH |

## 6. Join Session

التدفق الحالي في Mobile:

1. يفتح `/live-session?booking=<id>`.
2. يجلب `sessions.started_at/ended_at` و`bookings.session_status`.
3. لا يظهر زر الطالب إلا عند `started_at && !ended_at && in_progress`.
4. يضغط الطالب "الانضمام إلى الجلسة".
5. يحصل على audio/video عبر `getUserMedia`.
6. يطلب TURN من `turn-credentials`.
7. يشترك في `webrtc-${bookingId}`.
8. يرسل `join`.
9. يتفاوض WebRTC ويرسل ICE/offer/answer.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| prejoin lifecycle | session + booking + participant check | لا endpoint prejoin | lifecycle reads فقط | PARTIAL | architecture sequence مقابل `live-session.tsx` | لا precheck شامل للهوية/الميكروفون | إضافة endpoint يحتاج Production contract؛ BLOCKED |
| explicit student action | الطالب ينضم بعد ظهور الجلسة | لا join mutation | زر واضح | MATCHED | `testID=join-live-session` | منخفض | لا تغيير |
| student media permission | PreJoinCheck في المصدر | غير موجود | `getUserMedia` عند البدء | PARTIAL | `useSessionWebRTC.ts:406-413` | تجربة خطأ متأخرة | يمكن تحسين UI لكن permission contract غير مثبت |
| reconnect | Realtime/WebRTC reconnect | لا API | exponential retry + join retry | PARTIAL | `useSessionWebRTC.ts:370-454` | لا attendance re-registration | heartbeat/active_sessions BLOCKED |
| direct URL protection | source validates participant | لا route session access | `bookingId` من URL مع RLS reads | PARTIAL | `live-session.tsx:18-48` | IDOR يعتمد على RLS فقط | Production/RLS verification |

## 7. Calls

يجب فصل نوعين:

### 7.1 Session WebRTC

- Channel: `webrtc-${bookingId}`.
- Event: `signal`.
- Payload يحتوي `bookingId`, `senderId`, `signalType`, `payload`.
- Media: audio + video.
- TURN: `turn-credentials`.
- Data channel: `session-data`.

### 7.2 Internal Calls

- Lifecycle: `start_internal_call`, `respond_internal_call`, `mark_internal_call_connected`, `end_internal_call`.
- Persistence: `internal_calls`.
- Channel: `internal-voice-${callId}`.
- Push/background delivery: API Push routes and registered Expo tokens.
- Audio only.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| session channel separation | session channel مستقل عن internal call | لا يخلطهما API | قناتان منفصلتان | MATCHED | `useSessionWebRTC`, `useInternalCallWebRTC` | منخفض | لا تغيير |
| callId -> session/booking | يجب ربط الهوية بالمصدر | Push routes لا تثبت booking participant | `live-session` يستخدم active call boolean | MISMATCH | `live-session.tsx:23-48`, `push.ts:131-198` | مكالمة غير مرتبطة قد تفتح media | إصلاح gate محلي؛ تحقق API يحتاج Production relationship |
| participant IDs | teacher/student من المصدر | incoming route يثق recipient body | parse/filter محلي | PARTIAL | `push.ts:141-168` | push إلى مستخدم غير طرف | BLOCKED حتى يثبت عقد العلاقة |
| accept/reject internal call | RPC الأصلي | push notification فقط | `respond_internal_call` | MATCHED | `InternalCallContext.tsx:397-415` | Push ليس lifecycle | لا تغيير |
| connected state | mark after peer success | لا session state | internal WebRTC marks connected | MATCHED | `useInternalCallWebRTC.ts` | لا يساوي session attendance | لا تغيير |
| reconnect | retry channel/peer | لا call reconnect endpoint | retries peer | PARTIAL | hooks | stale call rows محتملة | Production lifecycle needed |
| call end | end RPC for internal calls | push end route lacks relationship validation | `endCall` ends internal call | PARTIAL | `InternalCallContext.tsx:642-652` | call end قد لا ينهي session | لا تجعلها session completion |

## 8. Participants

المرجع يفرض:

```text
authenticated user
 -> booking/session ownership
 -> participant role
```

الحالة:

- `live-session` يعرف الدور من `useAjyal`.
- `useSessionWebRTC` يرسل `userId` في signaling.
- لا يوجد API endpoint يثبت أن sender موجود في طرفي booking قبل Realtime subscription.
- RLS يفترض حماية `sessions`, `bookings`, وRealtime.
- Push `/calls/incoming` يأخذ `recipientId` من body ولا يقرأ booking/session relationship.

| SCENARIO | STATUS | REASON |
|---|---|---|
| Teacher A opens Teacher B session | PARTIAL | يعتمد على RLS/قراءة فارغة، لا فحص API مستقل |
| Student A opens Student B session | PARTIAL | نفس الاعتماد على RLS |
| student starts teacher lifecycle | MATCHED | لا يوجد mobile start |
| student ends teacher session | MATCHED | لا يوجد session-end؛ زر الهاتف يوقف الاتصال فقط بعد الإصلاح المقرر |
| arbitrary internal call recipient | MISMATCH | Push route لا يثبت العلاقة |

## 9. Attendance

المصدر يذكر حضور الطرفين عبر:

- دخول الطرف.
- `active_sessions`.
- `last_heartbeat`.
- `disconnected_at`.
- `session_events`.
- مراقبة visibility/focus.
- لا تنتهي الجلسة تلقائياً لمجرد heartbeat قديم.

الحالة الحالية:

- Mobile لا يكتب `active_sessions`.
- Mobile لا يرسل heartbeat كل 15 ثانية.
- Mobile لا يسجل `session_events`.
- Mobile يعرف `rtc.connectionState` محلياً فقط.
- WebRTC `connected` لا ينشئ record حضور.
- لا توجد شاشة تعرض حضور الطالب/المعلم.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| teacher attendance | desktop/session protection | غير موجود | غير موجود | BLOCKED | architecture مقابل code | لا يمكن إثبات حضور المعلم من الهاتف | Production session engine |
| student attendance | active_sessions | غير موجود | WebRTC local state فقط | MISMATCH | لا `active_sessions` call | الجلسة قد تبدأ دون حضور مسجل | BLOCKED |
| join time | active session/session event | غير موجود | لا persistence | MISMATCH | no attendance writes | تقارير غير مكتملة | BLOCKED |
| leave time | active session/session event | غير موجود | peer stop فقط | MISMATCH | `useSessionWebRTC.stop` | لا يثبت الخروج | BLOCKED |
| disconnect | heartbeat + disconnected_at | غير موجود | reconnect local | PARTIAL | `restartConnection` | لا record للانقطاع | BLOCKED |
| visibility/focus | protection hook | غير موجود | لا hook session protection | PARTIAL | no AppState/visibility attendance | heartbeat stale | BLOCKED |

## 10. Heartbeat

| CHECK | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| 15-second heartbeat | موثق في `useSessionProtection` | لا endpoint | غير موجود | MISMATCH | architecture lines 859-871 | لا active session freshness | BLOCKED |
| resume heartbeat | عند عودة التبويب | لا endpoint | WebRTC reconnect فقط | PARTIAL | `useSessionWebRTC` | لا attendance renewal | BLOCKED |
| stale heartbeat | informational, لا auto-end | غير موجود | لا يعرض الحالة | UNVERIFIED | source says no auto-end | لا تخمين | لا تعديل |
| duplicate heartbeat idempotency | source/DB/session path | غير موجود | غير موجود | BLOCKED | production-owned | retries قد تكرر records | Production verify |

## 11. End Session

المسار المثبت من المصدر:

```text
Teacher ends call
 -> session end
 -> duration calculation
 -> session status
 -> booking status
 -> auto_complete_session
 -> billing/reporting/points/materials
```

الحالة الحالية:

- لا يوجد `POST/PATCH /sessions/:id/end` في API.
- لا يوجد Mobile write لـ`sessions.ended_at`.
- `finishCall` يستدعي `rtc.stop()` ثم `endCall()` للمكالمة الداخلية النشطة فقط.
- `endCall()` يستدعي `end_internal_call`, وليس `auto_complete_session`.
- الهاتف لا يستطيع إنهاء دورة المعلم، وهذا مطلوب.
- الطالب الذي يضغط زر الخروج لا يثبت session completion، وهذا يجب ألا يتغير إلى خصم محلي.

| FEATURE | PLATFORM | API | MOBILE | STATUS | EVIDENCE | RISK | FIX |
|---|---|---|---|---|---|---|---|
| teacher end | Desktop authoritative | غير موجود | ممنوع | MATCHED | device policy | لا يمكن اختباره من الهاتف | Production verification |
| student leaves media | source behavior غير مكتمل في العقد | غير موجود | `rtc.stop` | PARTIAL | `live-session.tsx:112-127` | label يوحي بإنهاء الجلسة | تغيير النص إلى مغادرة الاتصال فقط |
| ended_at | session path/trigger | غير موجود | لا يكتب | MATCHED | لا client write | منخفض إذا Production trigger يعمل | لا تغيير |
| completed booking | trigger/function | لا endpoint | لا يكتب | MATCHED | architecture | لا runtime proof | لا تغيير |
| double end | DB/RPC idempotency مطلوب | لا endpoint | local button disabled فقط | BLOCKED | `ending` UI guard | multi-device race | Production verify |
| student ends teacher session | ممنوع | غير موجود | لا يكتب booking/session | MATCHED | code | منخفض | لا تغيير |

## 12. Duration

المصدر يفرق بين:

- planned/package duration: `bookings.duration_minutes`, subscription plan duration.
- actual duration: `sessions` end/start and completion logic.
- session shorter than 5 minutes: architecture states no deduction/earnings/material in current logic.

الحالة الحالية:

- API maps and displays booking planned duration.
- Mobile renders `session.duration`.
- Mobile does not calculate actual duration.
- Mobile does not round or deduct.
- No client code writes `duration_seconds` or `duration_minutes` to sessions.
- Exact current rounding/minimum/max behavior is Production Function-owned.

| FEATURE | STATUS | REASON |
|---|---|---|
| planned duration displayed | MATCHED | derived from booking |
| actual duration calculated on mobile | MATCHED | intentionally absent; teacher/trigger owned |
| `duration_seconds` source | UNVERIFIED | not exposed in local session contract |
| under-five-minute rule | UNVERIFIED | documented architecture, not runtime-verified |
| rounding/minimum/maximum | UNVERIFIED | do not reproduce locally |
| package duration selection | PARTIAL | booking carries duration, but session source not re-read for policy |

## 13. Financial Boundary

لا يتم تنفيذ أي خصم أو تسوية في Mobile/API خلال هذه المرحلة.

المصدر المعماري يذكر أن `auto_complete_session`:

- يحسب مدة الجلسة.
- يتعامل مع الجلسة الأقل من 5 دقائق.
- يخصم `remaining_minutes`.
- يغير session/booking إلى completed.
- يحسب teacher earning/platform fee/net amount.
- يحدث نقاط الطالب ومواد الجلسة والتقرير.

| FEATURE | PLATFORM | API | MOBILE | STATUS |
|---|---|---|---|---|
| deduction at start | غير مثبت كمسار نهائي | لا يخصم | لا يخصم | UNVERIFIED |
| deduction at end/trigger | `auto_complete_session` موثق | لا يستدعيه | لا يستدعيه | MATCHED |
| teacher earnings | Function/financial tables | لا يكتب | لا يكتب | BLOCKED |
| platform commission | Function/financial tables | لا يكتب | لا يكتب | BLOCKED |
| remaining_minutes | Trigger/function | لا يغيره في lifecycle | لا يغيره | MATCHED |
| payment/financial operation | Production only | لم ينفذ | لم ينفذ | NOT_APPLICABLE |

## 14. Idempotency

| OPERATION | PLATFORM | API | MOBILE | STATUS | RISK |
|---|---|---|---|---|---|
| duplicate start | DB/RPC/teacher session path | لا endpoint | لا start | BLOCKED | multi-device race production-owned |
| duplicate end | trigger/function expected | لا endpoint | `ending` local فقط | BLOCKED | second device can race |
| heartbeat retry | active session path | غير موجود | غير موجود | BLOCKED | duplicate/stale presence |
| reconnect | source session protection | غير موجود | WebRTC retry/backoff | PARTIAL | no server presence re-registration |
| double press leave | UI disables while pending | no mutation | guarded by `ending` | PARTIAL | not cross-device |
| two devices same student | `active_sessions` lock | no check | no check | MISMATCH | simultaneous media possible |
| multiple call acceptance | `respond_internal_call` | notification endpoints separate | local setCall + RPC | PARTIAL | push and Realtime can race |

## 15. Authorization

| SCENARIO | STATUS | EVIDENCE | FIX |
|---|---|---|---|
| unauthenticated session API | MATCHED | `/sessions` requires app auth + Supabase Bearer | no change |
| unauthenticated direct Supabase session read | UNVERIFIED | relies on Supabase client/RLS | read-only Production verification |
| teacher mobile start | MATCHED | explicitly blocked in UI and no endpoint | no change |
| student arbitrary booking URL | PARTIAL | direct reads are filtered by RLS, no API ownership gate | Production RLS verification |
| teacher A opens teacher B | PARTIAL | same | no guessed client-only gate |
| internal call recipient relationship | MISMATCH | `/calls/incoming` validates user/device, not booking/session participant | requires source relationship contract |
| internal call accept identity | MATCHED | `respond_internal_call` owns lifecycle | no change |
| session signaling participant | PARTIAL | `senderId` is client payload; channel access is Realtime/RLS | Production Realtime policy verification |

## 16. Notifications and Deep Links

- Internal call foreground delivery subscribes to `internal_calls` Realtime.
- Background delivery uses Expo push on supported Development/Production builds.
- `expo-notifications` is dynamically loaded and skipped in Expo Go.
- Incoming call notification stores `callId`, `callerId`, `callerRole`, and `roomId`.
- `live-session` is opened from bookings with `booking` query param.
- No verified notification currently starts or completes a session lifecycle.

| FEATURE | STATUS | NOTES |
|---|---|---|
| incoming internal call Realtime | MATCHED | `internal_calls` subscription |
| incoming internal call push | PARTIAL | native build only; route relationship not proven |
| call accept/decline actions | MATCHED | maps to `respond_internal_call` |
| call ended notification | PARTIAL | push route does not validate participant relationship |
| session start notification | UNVERIFIED | no specific authoritative event contract found |
| deep link booking -> live session | MATCHED | Expo route exists |
| expired/cancelled deep link | PARTIAL | bookings UI filters most closed states; URL screen still depends on reads |

## 17. Expo Go Limitations

| CAPABILITY | STATUS | EVIDENCE |
|---|---|---|
| TypeScript/bundle | BUILD VERIFIED | Expo bundles completed in previous phase |
| Web preview WebRTC | BUILD VERIFIED | browser path exists, real peer not tested |
| Expo Go native WebRTC | REAL DEVICE UNVERIFIED | `react-native-webrtc` native module unavailable in Expo Go |
| Development Build native WebRTC | BUILD VERIFIED / REAL DEVICE UNVERIFIED | plugin/package present; native call not executed |
| Push incoming call on Expo Go Android | NOT_APPLICABLE | app intentionally skips native notifications in Expo Go |
| Push incoming call on Development/Production | REAL DEVICE UNVERIFIED | requires device token and real provider delivery |
| audio/video permissions | REAL DEVICE UNVERIFIED | `getUserMedia` path exists, no physical device test |
| background call behavior | REAL DEVICE UNVERIFIED | native task/configuration exists, not executed |

نجاح bundle لا يثبت نجاح مكالمة أو حضور أو lifecycle.

## 18. API

العقود الحالية:

- `GET /sessions?view=upcoming|past`
- `POST /sessions` — إنشاء booking legacy/جلسة من منظور API، وليس session lifecycle start.
- `PATCH /sessions/:id/cancel`
- `/calls/incoming`
- `/calls/:callId/accept`
- `/calls/:callId/end`
- push token registration routes

لا توجد عقود API محلية لـ:

- start session
- join session authorization
- active session registration
- heartbeat
- attendance
- session end
- duration completion
- session report

عدم إضافة endpoints بديلة متعمد؛ إنشاء هذه العقود قد يتجاوز RPC/Function/Trigger المصدر.

## 19. Mobile

الحالي:

- `app/live-session.tsx` شاشة الطالب/المعلم read-only lifecycle.
- `useSessionWebRTC.ts` نقل WebRTC للجلسة.
- `useInternalCallWebRTC.ts` نقل صوت المكالمة الداخلية.
- `InternalCallContext.tsx` Realtime/push/RPC للمكالمات الداخلية.
- `SessionCollaboration.tsx` يستخدم DataChannel للسبورة.
- `SessionVideo.tsx` يعرض local/remote streams.

الفجوات:

- لا active session/attendance/heartbeat.
- لا prejoin permission check مستقل.
- لا server-side session participant endpoint.
- active internal call لا يُطابق booking قبل تفعيل join.
- زر `إنهاء الجلسة` لا ينهي session فعلياً.
- لا session timer authoritative ولا actual duration.
- لا تسجيل أو رفع session recording في Mobile الحالية.

## 20. MATCHED

- Mobile لا يبدأ session للمعلم.
- Mobile لا ينفذ الخصم أو التسوية.
- الدخول مشروط بـ`started_at` و`in_progress`.
- lifecycle يقرأ من Supabase الحقيقي.
- session WebRTC منفصل عن internal voice call.
- channel المستخدم يطابق booking-based transport الموثق.
- TURN credentials تأتي من Edge Function.
- internal calls تستخدم RPCs الأصلية.
- notification module متوافق مع Expo Go boundary عبر dynamic import.
- الحالات غير المعروفة لا يسمح بها mapping.

## 21. PARTIAL

- join authorization تعتمد بدرجة كبيرة على RLS، دون endpoint session ownership.
- WebRTC reconnect موجود، لكن لا يعيد تسجيل active session أو heartbeat.
- lifecycle يقارن started/ended/session status، لكنه لا يتحقق من booking status في نفس القرار.
- media permission تؤخذ عند الانضمام، دون PreJoinCheck مستقل.
- push/call delivery فيها Realtime وPush، لكن العلاقة بالحجز غير كاملة.
- planned duration معروض، بينما actual duration غير متاح للهاتف.
- إغلاق الطالب للوسائط منفصل عن إنهاء session lifecycle، لكن النص الحالي يسبب التباساً.

## 22. MISMATCH

1. **تم إصلاحها محلياً:** كان `live-session.tsx` يفعّل session WebRTC عند وجود أي internal call نشطة دون اشتراط تطابق `call.roomId` مع `bookingId`. أصبح gate المحلي يطابق الحجز، بينما يبقى تحقق علاقة الطرفين في Push/API غير مثبت.
2. لا يوجد تسجيل Mobile/API لـ`active_sessions` أو heartbeat أو attendance رغم أن دورة المصدر تعتمد عليها.
3. مسارات Push للمكالمات الداخلية لا تتحقق من أن caller والrecipient طرفان صحيحان في booking/session قبل الإرسال.
4. زر الهاتف يسمي مغادرة الاتصال "إنهاء الجلسة"، مع أن الكود لا يحدث `sessions.ended_at` ولا `bookings.session_status` ولا يستدعي completion.
5. فتح session يعتمد على direct Supabase reads ولا يوجد prejoin authorization endpoint داخل API.

## 23. UNVERIFIED

- الحالة الفعلية والحقول الدقيقة لجداول `sessions`, `active_sessions`, `attendance`, `session_events`, `call_records`, و`call_participants` في Production.
- هل `auto_create_session` ينشئ session لكل booking confirmed في كل الحالات.
- grace period الفعلي لبدء الجلسة.
- هل join الطالب يكتب attendance عبر Trigger أو Function غير ظاهر في Mobile.
- rounding/minimum/maximum الفعلي للمدة.
- behavior عندما ينهي الطالب الاتصال قبل المعلم.
- recording permissions ومسار `session-recordings` في النسخة الحالية.
- علاقة كل `internal_call` بالحجز/الجلسة في المكالمات غير المرتبطة بحجز.
- RLS النهائي لقنوات Realtime وdirect Supabase reads.
- push delivery الفعلي على جهاز Android/iOS.

## 24. BLOCKED

- إضافة أو إصلاح active session/heartbeat/attendance يحتاج المسار الإنتاجي المعتمد أو RPC/Function.
- إصلاح session end والمدة والخصم يحتاج lifecycle Production.
- إنشاء authorization بديل للمكالمة دون معرفة contract العلاقات قد يقطع المكالمات الهاتفية أو المكالمات غير المرتبطة بالحجز.
- ضمان idempotency عبر جهازين يحتاج DB/RPC/Function/Trigger.
- إثبات الحضور أو الفوترة دون تنفيذ جلسة حقيقية ممنوع في هذه المرحلة.

## 25. Confirmed Local Fixes Allowed

بعد إنشاء هذا التقرير، الإصلاحات الآمنة داخل Mobile/API فقط هي:

- ربط session join بالمكالمة الداخلية إذا كان `call.roomId === bookingId` فقط؛ أو الاعتماد على زر الطالب الصريح دون أي internal call غير مرتبط.
- تغيير نص الزر من "إنهاء الجلسة" إلى "مغادرة الاتصال" وعدم الإيحاء بأن الهاتف أكمل الجلسة.
- منع `closeRoom` من إنهاء internal call لا تخص الحجز الحالي.
- إبقاء teacher lifecycle والخصم وattendance خارج الهاتف.

لن تتم إضافة:

- RPC جديد.
- Trigger جديد.
- DB constraint.
- session engine.
- financial engine.
- attendance fallback محلي.
- authorization بديل غير مثبت.

## 26. Files Changed

الملفات التي تغيرت في هذه المرحلة:

- `SESSIONS_PARITY_REPORT.md` — تقرير parity الكامل قبل وبعد الإصلاح المحلي.
- `artifacts/ajyal-mobile/app/live-session.tsx` — ربط تفعيل/إغلاق مكالمة الجلسة بتطابق `call.roomId === bookingId`، ومنع تنظيف مكالمة غير مرتبطة، وتغيير النص إلى مغادرة الاتصال بدلاً من إنهاء الجلسة.

لا توجد كتابة في Production أو تغيير في schema.

## 27. Tests

تم تنفيذها بعد الإصلاح المحلي:

- Mobile TypeScript: PASS.
- Android bundle: PASS.
- iOS bundle: PASS.
- Expo workflow: RUNNING.
- `git diff --check`: PASS.
- Mobile preview at 402x874: rendered without a crash.
- Expo browser logs: no new runtime error; only React DevTools, deprecated `shadow*`, and reduced-motion development warnings.
- API health/unauthorized checks: remained healthy from the previous phase; no API file changed here.

ملاحظة السجلات: ظهرت أخطاء موجودة مسبقاً في `/api/assignments` بسبب قيم مصدر (`assignment`, `active`) لا تطابق enum العربي الحالي، كما ظهر طلب booking أعاد `400`. هذه ليست من تعديل الجلسة ولم تُستخدم كدليل نجاح للمرحلة.

لا تشمل الاختبارات:

- session حقيقية.
- call حقيقية.
- device token أو password.
- RPC write.
- Trigger execution يدوي.
- deduction أو financial write.

## 28. Remaining Risks

- RLS/Realtime قد تكون الحماية الفعلية الوحيدة للوصول إلى session، ولم يتم تعديلها أو اختبارها كتابةً.
- لا يمكن اعتبار WebRTC connected دليلاً على attendance.
- أي accepted booking بلا session أو session بلا booking سيظهر كمشكلة Production consistency، وليس شيئاً يصلحه Mobile.
- internal call delivery وsession video نظامان مختلفان؛ الخلط بينهما قد ينشئ دخولاً غير مقصود.
- direct Supabase reads في شاشة الجلسة قد تخفي الفرق بين unauthorized وmissing data.
- real device support غير مثبت رغم نجاح TypeScript وbundles.

## 29. Production Verification Needed

بحسابات اختبار حقيقية وقراءة/اختبار معتمد فقط، دون تعديل المصدر:

- booking confirmed ينشئ session واحداً.
- `sessions.started_at` و`bookings.session_status` يتغيران مع بدء المعلم من Desktop.
- الطالب الصحيح فقط يرى زر الدخول.
- الطالب الخاطئ لا يقرأ session أو booking طرف آخر.
- `active_sessions` يسجل الطالب والمعلم ويجدد heartbeat.
- إعادة الاتصال لا تنشئ حضوراً مكرراً.
- teacher end يكتب ended/duration ويطلق completion مرة واحدة.
- student leave أولاً يتبع السلوك الأصلي دون إكمال مالي خاطئ.
- الجلسة الأقل من 5 دقائق تتبع قواعد المصدر.
- الخصم يتم مرة واحدة فقط من Trigger/Function.
- teacher earnings/platform commission لا تتكرر.
- internal call مربوط بالحجز الصحيح ولا يعبر إلى جلسة أخرى.
- push/Realtime يعملان على Development Build حقيقي.

## 30. Next Step

بعد تطبيق الإصلاحات المحلية والتحقق منها، تتوقف المرحلة السادسة. لا تبدأ:

- الخصم.
- التسوية المالية.
- المحفظة.
- السحب.
- الواجبات.
- الدرجات.

Database changed: NO
Schema changed: NO
RLS changed: NO
RPC changed: NO
Functions changed: NO
Triggers changed: NO
Auth changed: NO
VPS changed: NO
Main platform code changed: NO
Production writes: NO
Real session executed: NO
Real call executed: NO
Financial operation executed: NO