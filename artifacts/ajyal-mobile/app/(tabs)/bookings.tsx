import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { EmptyState, Header, Icon, Screen, SessionCard, LoadingBlock } from '@/components/AjyalUI';
import BookingsSchedule from '@/components/BookingsSchedule';
import { getListBookingRequestsQueryKey, getListMySessionsQueryKey, useCancelBookingRequest, useDecideBookingRequest, useDeleteBookingRequest, useListBookingRequests, useListMySessions } from '@workspace/api-client-react';
import type { BookingRequest } from '@workspace/api-client-react';
import type { Session } from '@/constants/localData';
import { supabase } from '@/lib/supabase';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';

type StudentRequestSection = 'pending' | 'accepted' | 'completed';

function localDayKey(value: Date): string {
  if (Number.isNaN(value.getTime())) return 'invalid';
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

export default function BookingsScreen() {
  const colors = useColors();
  const { t, locale, direction, formatNumber } = useAppPreferences();
  const { role, roleResolved, profile, cancelSession } = useAjyal();
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; title: string } | null>(null);
  const [cancelRequestTarget, setCancelRequestTarget] = useState<BookingRequest | null>(null);
  const [deleteRequestTarget, setDeleteRequestTarget] = useState<BookingRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [studentRequestSection, setStudentRequestSection] = useState<StudentRequestSection>('pending');
  const requestView = role === 'teacher' ? 'incoming' : 'mine';
  const sessionView = 'upcoming';
  const sessionsQuery = useListMySessions({ view: sessionView }, { query: { enabled: roleResolved, queryKey: getListMySessionsQueryKey({ view: sessionView }), refetchInterval: roleResolved ? 5000 : false, refetchOnWindowFocus: true, refetchOnReconnect: true } });
  const historyQuery = useListMySessions({ view: 'past' }, { query: { enabled: roleResolved, queryKey: getListMySessionsQueryKey({ view: 'past' }), refetchInterval: roleResolved ? 10000 : false, refetchOnWindowFocus: true, refetchOnReconnect: true } });
  const requestQuery = useListBookingRequests(
    { view: requestView },
    { query: { enabled: roleResolved, queryKey: getListBookingRequestsQueryKey({ view: requestView }), refetchInterval: roleResolved ? 5000 : false, refetchOnWindowFocus: true, refetchOnReconnect: true } },
  );
  const decisionMutation = useDecideBookingRequest({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          requestQuery.refetch(),
          sessionsQuery.refetch(),
          historyQuery.refetch(),
        ]);
      },
      onError: (error) => {
         const message = error instanceof Error ? error.message : t('تحقق من الاتصال ثم حاول مرة أخرى.', 'Check your connection and try again.');
         Alert.alert(t('تعذر تحديث الطلب', 'Could not update request'), message);
      },
    },
  });
  const cancelRequestMutation = useCancelBookingRequest({
    mutation: {
      onSuccess: async () => {
        setCancelRequestTarget(null);
        await Promise.all([requestQuery.refetch(), sessionsQuery.refetch(), historyQuery.refetch()]);
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : t('تعذر إلغاء طلب الحجز.', 'Could not cancel the booking request.');
        Alert.alert(t('تعذر إلغاء الطلب', 'Could not cancel request'), message);
      },
    },
  });
  const deleteRequestMutation = useDeleteBookingRequest({
    mutation: {
      onSuccess: async () => {
        setDeleteRequestTarget(null);
        await Promise.all([requestQuery.refetch(), sessionsQuery.refetch(), historyQuery.refetch()]);
      },
      onError: (error) => {
        setDeleteRequestTarget(null);
        const message = error instanceof Error ? error.message : t('تعذر حذف طلب الحجز.', 'Could not delete the booking request.');
        Alert.alert(t('تعذر حذف الطلب', 'Could not delete request'), message);
      },
    },
  });
  const visibleSessions = sessionsQuery.data ?? [];
  const scheduleSessions = useMemo(() => {
    const allSessions = [...visibleSessions, ...(historyQuery.data ?? [])];
    return [...new Map(allSessions.map((session) => [session.id, session])).values()]
      .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime());
  }, [historyQuery.data, role, visibleSessions]);
  const historyGroups = useMemo(() => {
    if (view !== 'past' || role !== 'teacher') return [];
    const groups = new Map<string, { studentName: string; sessions: typeof visibleSessions }>();
    visibleSessions.forEach((session) => {
      const studentName = session.person.replace(/^مع\s+/u, '').trim() || t('طالب غير معروف', 'Unknown student');
      const existing = groups.get(studentName);
      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.set(studentName, { studentName, sessions: [session] });
      }
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        sessions: [...group.sessions].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime()),
      }))
      .sort((left, right) => left.studentName.localeCompare(right.studentName, locale));
  }, [locale, role, t, view, visibleSessions]);
  const isHistoryView = view === 'past';
  const sessionListExpanded = !isHistoryView || historyExpanded;
  const requests = requestQuery.data ?? [];
  const displayedRequests = useMemo(() => {
    const groups = new Map<string, { request: BookingRequest; count: number; items: BookingRequest[] }>();
    requests.forEach((request) => {
      const key = request.groupId || request.id;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.items.push(request);
      } else {
        groups.set(key, { request, count: 1, items: [request] });
      }
    });
    return [...groups.values()];
  }, [requests]);
  const incomingRequestRows = useMemo(
    () => displayedRequests.filter(({ request }) => request.status === 'open'),
    [displayedRequests],
  );
  const acceptedRequestRows = useMemo(
    () => displayedRequests.filter(({ request }) => request.status === 'accepted'),
    [displayedRequests],
  );
  const completedSessions = (historyQuery.data ?? []).filter((session) => session.status === 'done');
  const [todayKey, setTodayKey] = useState(() => localDayKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setTodayKey(localDayKey(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);
  const availableTodaySessions = useMemo(
    () => visibleSessions.filter((session) => localDayKey(new Date(session.scheduledAt)) === todayKey && session.status === 'upcoming'),
    [todayKey, visibleSessions],
  );
  const bookingChannelSequence = useRef(0);
  const pendingRequestCount = role === 'teacher' ? incomingRequestRows.length : displayedRequests.filter(({ request }) => request.status === 'open').length;
  const activeSessionCount = visibleSessions.filter((session) => session.status === 'upcoming' || session.sessionStatus === 'in_progress').length;

  useEffect(() => {
    const client = supabase;
    if (!client || !profile?.id) return undefined;
    const topic = `mobile-bookings-${role}-${profile.id}-${bookingChannelSequence.current += 1}`;
    let channel: ReturnType<typeof client.channel> | null = null;
    try {
      channel = client
        .channel(topic)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'booking_requests',
          ...(role === 'student' ? { filter: `student_id=eq.${profile.id}` } : {}),
        }, () => {
          void requestQuery.refetch();
          void sessionsQuery.refetch();
          void historyQuery.refetch();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `${role === 'student' ? 'student_id' : 'teacher_id'}=eq.${profile.id}`,
        }, () => {
          void sessionsQuery.refetch();
          void historyQuery.refetch();
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'sessions',
        }, () => {
          // sessions.ended_at is the authoritative signal that moves a lesson
          // out of upcoming and into the historical schedule.
          void sessionsQuery.refetch();
          void historyQuery.refetch();
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[bookings] Realtime channel ${status.toLowerCase()}; using query refreshes instead.`);
          }
        });
    } catch (error) {
      console.warn('[bookings] Could not start realtime updates:', error);
    }
    return () => {
      if (channel) void client.removeChannel(channel).catch((error) => {
        console.warn('[bookings] Could not remove realtime channel:', error);
      });
    };
  }, [bookingChannelSequence, historyQuery.refetch, role, profile?.id, requestQuery.refetch, sessionsQuery.refetch]);

  const openSession = (id: string) => {
    const session = scheduleSessions.find((item) => item.id === id);
    if (!session) return;
    if (role === 'student' && session.sessionStatus === 'waiting_acceptance') {
      Alert.alert(
        t('دعوة لجلسة فورية', 'Instant session invitation'),
        `${session.person}\n${t('بانتظار دخول المعلم من الكمبيوتر. سيتفعّل زر الانضمام عند بدء الجلسة.', 'Waiting for the teacher to join from the computer. The join button will activate when the session starts.')}`,
        [{ text: t('حسناً', 'Okay'), style: 'cancel' }],
      );
      return;
    }
    const isClosed = session.status === 'expired' || session.status === 'done' || session.status === 'cancelled';
     const actions = [
       { text: t('إغلاق', 'Close'), style: 'cancel' as const },
        ...(role !== 'teacher' && !isClosed ? [{ text: t('فتح غرفة الجلسة', 'Open session room'), onPress: () => router.push({ pathname: '/live-session', params: { booking: session.id } }) }] : []),
       ...(session.status !== 'cancelled' ? [{ text: t('فتح المحادثة', 'Open chat'), onPress: () => router.push({ pathname: '/chat', params: { booking: session.id } }) }] : []),
    ];
     Alert.alert(session.title, `${session.person}\n${session.date} · ${session.time}\n${t('مدة الجلسة:', 'Duration:')} ${session.duration}${session.status === 'expired' ? `\n${t('الحجز منتهى، ولا يمكن بدء الجلسة أو الانضمام إليها.', 'This booking has ended. You cannot start or join the session.')}` : ''}`, actions);
  };

  const addSession = () => router.push('/booking');
  const requestSessionCancel = (session: { id: string; title: string }) => {
    if (role === 'teacher') {
      setCancelTarget({ id: session.id, title: session.title });
      setCancelReason('');
      return;
    }
     Alert.alert(t('إلغاء الجلسة؟', 'Cancel session?'), t('سيتم إشعار الطرف الآخر بهذا التغيير.', 'The other participant will be notified.'), [
       { text: t('تراجع', 'Go back'), style: 'cancel' },
       { text: t('إلغاء الجلسة', 'Cancel session'), style: 'destructive', onPress: () => cancelSession(session.id) },
    ]);
  };
  const confirmTeacherCancel = () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (reason.length < 10) {
       Alert.alert(t('أدخل سبب الإلغاء', 'Enter a cancellation reason'), t('يجب أن يكون السبب 10 أحرف على الأقل.', 'The reason must be at least 10 characters.'));
      return;
    }
    cancelSession(cancelTarget.id, reason);
    setCancelTarget(null);
    setCancelReason('');
  };
  const requestBookingCancel = (request: BookingRequest) => {
    setCancelRequestTarget(request);
  };
  const confirmRequestCancel = () => {
    if (!cancelRequestTarget) return;
    cancelRequestMutation.mutate({ id: cancelRequestTarget.id });
  };
  const requestBookingDelete = (request: BookingRequest) => {
    setDeleteRequestTarget(request);
  };
  const confirmRequestDelete = () => {
    if (!deleteRequestTarget) return;
    deleteRequestMutation.mutate({ id: deleteRequestTarget.id });
  };
  const renderSessionCard = (session: typeof visibleSessions[number]) => (
    <SessionCard
      key={session.id}
      session={session}
      role={role}
      cancelled={session.status === 'cancelled'}
      onPress={() => openSession(session.id)}
      onJoin={() => router.push({ pathname: '/live-session', params: { booking: session.id } })}
      onCancel={session.status === 'upcoming' ? () => requestSessionCancel(session) : undefined}
    />
  );
  const sessionListSection = (
    <>
      <Pressable
        accessibilityRole={isHistoryView ? 'button' : undefined}
        accessibilityState={isHistoryView ? { expanded: historyExpanded } : undefined}
        disabled={!isHistoryView}
        onPress={() => {
          if (isHistoryView) setHistoryExpanded((expanded) => !expanded);
        }}
        style={({ pressed }) => [styles.sectionLead, { backgroundColor: colors.card, borderColor: colors.border }, isHistoryView && pressed && styles.pressed]}
      >
        <View style={[styles.sectionLeadIcon, { backgroundColor: colors.tealSoft }]}><Icon name="clock" size={19} color={colors.teal} /></View>
        <View style={styles.sectionLeadCopy}><Text style={[styles.sectionLeadTitle, { color: colors.foreground, writingDirection: direction }]}>{view === 'upcoming' ? t('الجلسات القادمة', 'Upcoming sessions') : t('سجل الجلسات', 'Session history')}</Text><Text style={[styles.sectionLeadBody, { color: colors.mutedForeground, writingDirection: direction }]}>{view === 'upcoming' ? t('مواعيدك المؤكدة والجاهزة للمتابعة.', 'Confirmed sessions ready for you.') : t('الجلسات المكتملة والمنتهية سابقاً.', 'Completed and previous sessions.')}</Text></View>
        <View style={[styles.sectionLeadCount, { backgroundColor: colors.navySoft }]}><Text style={[styles.sectionLeadCountText, { color: colors.primary }]}>{formatNumber(visibleSessions.length)}</Text><Text style={[styles.sectionLeadCountLabel, { color: colors.primary }]}>{t('جلسة', 'sessions')}</Text></View>
        {isHistoryView ? <Icon name={historyExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} /> : null}
        </Pressable>
      {sessionListExpanded ? (sessionsQuery.isError || historyQuery.isError || requestQuery.isError ? <EmptyState icon="alert-circle" title={t('تعذر تحميل الحجوزات', 'Unable to load bookings')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { void sessionsQuery.refetch(); void historyQuery.refetch(); void requestQuery.refetch(); }} /> : visibleSessions.length ? role === 'teacher' && isHistoryView ? <View style={styles.studentGroups}>{historyGroups.map((group) => <StudentSessionGroup key={group.studentName} studentName={group.studentName} sessions={group.sessions} role={role} onOpenSession={openSession} onJoinSession={(id) => router.push({ pathname: '/live-session', params: { booking: id } })} />)}</View> : visibleSessions.map(renderSessionCard) : <EmptyState icon="calendar" title={t('لا توجد جلسات هنا', 'No sessions here')} body={view === 'past' ? t('ستظهر الجلسات المكتملة أو المنتهية بعد موعدها.', 'Completed and ended sessions will appear here.') : role === 'teacher' ? t('ستظهر الجلسات بعد قبول طلبات الطلاب.', 'Sessions appear after accepting student requests.') : t('ستظهر الجلسات المؤكدة بعد قبول المعلم لطلبك.', 'Confirmed sessions appear after your teacher accepts.')} />) : null}
    </>
  );
  const requestSection = (
    <View style={styles.requestSections} testID="upcoming-booking-requests">
      <View style={[styles.sectionLead, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.sectionLeadIcon, { backgroundColor: colors.navySoft }]}><Icon name="inbox" size={19} color={colors.primary} /></View>
        <View style={styles.sectionLeadCopy}>
          <Text style={[styles.sectionLeadTitle, { color: colors.foreground, writingDirection: direction }]}>{t('طلبات الحصص القادمة', 'Upcoming lesson requests')}</Text>
          <Text style={[styles.sectionLeadBody, { color: colors.mutedForeground, writingDirection: direction }]}>{role === 'teacher' ? t('طلبات الطلاب الواردة بانتظار قرارك.', 'Incoming student requests waiting for your decision.') : t('طلباتك التي تنتظر قبول المعلم.', 'Your requests waiting for teacher acceptance.')}</Text>
        </View>
        <View style={[styles.sectionLeadCount, { backgroundColor: colors.tealSoft }]}>
          <Text style={[styles.sectionLeadCountText, { color: colors.teal }]}>{formatNumber(incomingRequestRows.length)}</Text>
          <Text style={[styles.sectionLeadCountLabel, { color: colors.teal }]}>{t('طلب', 'requests')}</Text>
        </View>
      </View>
      {requestQuery.isError ? (
        <EmptyState icon="alert-circle" title={t('تعذر تحميل طلبات الحصص', 'Unable to load lesson requests')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { void requestQuery.refetch(); }} />
      ) : incomingRequestRows.length ? (
        <View style={styles.requests}>
          {incomingRequestRows.map(({ request, count, items }, index) => (
            <BookingRequestCard
              key={`upcoming-request-${request.groupId || request.id}-${request.id}-${index}`}
              request={request}
              groupCount={count}
              groupItems={items}
              busy={decisionMutation.isPending}
              cancelling={cancelRequestMutation.isPending && cancelRequestTarget?.id === request.id}
              deleting={deleteRequestMutation.isPending && deleteRequestTarget?.id === request.id}
              onExpired={() => { void requestQuery.refetch(); }}
              onCancel={role === 'student' && request.status === 'open' ? () => requestBookingCancel(request) : undefined}
              onDelete={role === 'student' && ['rejected', 'cancelled', 'expired'].includes(request.status) ? () => requestBookingDelete(request) : undefined}
              onDecision={role === 'teacher' ? (status) => decisionMutation.mutate({ id: request.id, data: { status, groupId: request.groupId ?? undefined } }) : undefined}
            />
          ))}
        </View>
      ) : (
        <EmptyState icon="inbox" title={t('لا توجد طلبات حصص قادمة', 'No upcoming lesson requests')} body={role === 'teacher' ? t('ستظهر هنا طلبات الطلاب الجديدة عند وصولها.', 'New student requests will appear here when they arrive.') : t('ستظهر هنا طلباتك الجديدة حتى يقبلها المعلم.', 'Your new requests will appear here until the teacher accepts them.')} />
      )}
    </View>
  );
  const teacherUpcomingSection = (
    <View style={styles.requestSections} testID="upcoming-lessons">
      <View style={[styles.sectionLead, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.sectionLeadIcon, { backgroundColor: colors.tealSoft }]}><Icon name="calendar" size={19} color={colors.teal} /></View>
        <View style={styles.sectionLeadCopy}>
          <Text style={[styles.sectionLeadTitle, { color: colors.foreground, writingDirection: direction }]}>{t('الحصص القادمة', 'Upcoming lessons')}</Text>
          <Text style={[styles.sectionLeadBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t('تنتقل الحصص المقبولة إلى هنا حتى موعدها.', 'Accepted lessons appear here until their scheduled time.')}</Text>
        </View>
        <View style={[styles.sectionLeadCount, { backgroundColor: colors.navySoft }]}>
          <Text style={[styles.sectionLeadCountText, { color: colors.primary }]}>{formatNumber(visibleSessions.length)}</Text>
          <Text style={[styles.sectionLeadCountLabel, { color: colors.primary }]}>{t('حصة', 'lessons')}</Text>
        </View>
      </View>
      {sessionsQuery.isError || historyQuery.isError ? (
        <EmptyState icon="alert-circle" title={t('تعذر تحميل الحصص', 'Unable to load lessons')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { void sessionsQuery.refetch(); void historyQuery.refetch(); }} />
      ) : visibleSessions.length ? (
        <View style={styles.requests}>{visibleSessions.map(renderSessionCard)}</View>
      ) : (
        <EmptyState icon="calendar" title={t('لا توجد حصص قادمة', 'No upcoming lessons')} body={t('ستظهر الحصة هنا بعد قبول طلب الطالب.', 'A lesson will appear here after accepting a student request.')} />
      )}
    </View>
  );
  const studentAvailableSection = (
    <View style={styles.requestSections} testID="available-today">
      <View style={[styles.sectionLead, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.sectionLeadIcon, { backgroundColor: colors.tealSoft }]}><Icon name="video" size={19} color={colors.teal} /></View>
        <View style={styles.sectionLeadCopy}>
          <Text style={[styles.sectionLeadTitle, { color: colors.foreground, writingDirection: direction }]}>{t('الحصص المتاحة اليوم', 'Available lessons today')}</Text>
          <Text style={[styles.sectionLeadBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t('تظهر هنا حصص اليوم، ويتفعّل الانضمام بعد دخول المعلم.', 'Today’s lessons appear here; joining activates after the teacher enters.')}</Text>
        </View>
        <View style={[styles.sectionLeadCount, { backgroundColor: colors.tealSoft }]}>
          <Text style={[styles.sectionLeadCountText, { color: colors.teal }]}>{formatNumber(availableTodaySessions.length)}</Text>
          <Text style={[styles.sectionLeadCountLabel, { color: colors.teal }]}>{t('حصة', 'lessons')}</Text>
        </View>
      </View>
      {sessionsQuery.isError ? (
        <EmptyState icon="alert-circle" title={t('تعذر تحميل الحصص المتاحة', 'Unable to load available lessons')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { void sessionsQuery.refetch(); }} />
      ) : availableTodaySessions.length ? (
        <View style={styles.requests}>{availableTodaySessions.map(renderSessionCard)}</View>
      ) : (
        <EmptyState icon="calendar" title={t('لا توجد حصص متاحة اليوم', 'No lessons available today')} body={t('ستظهر حصة اليوم هنا بعد تأكيدها أو عند بدء المعلم للجلسة.', 'Today’s lesson will appear here once confirmed or when the teacher starts it.')} />
      )}
    </View>
  );
  const studentRequestOptions = [
    {
      key: 'pending' as const,
      title: t('بانتظار القبول', 'Waiting'),
      body: t('طلباتك التي لم يقرر المعلم بشأنها بعد.', 'Requests still waiting for the teacher.'),
      icon: 'clock' as const,
      activeColor: colors.accentForeground,
      activeBackground: colors.goldSoft,
    },
    {
      key: 'accepted' as const,
      title: t('المقبولة', 'Accepted'),
      body: t('طلبات الحصص التي وافق عليها المعلم.', 'Requests accepted by the teacher.'),
      icon: 'check-circle' as const,
      activeColor: colors.teal,
      activeBackground: colors.tealSoft,
    },
    {
      key: 'completed' as const,
      title: t('المكتملة', 'Completed'),
      body: t('حصصك التي انتهت ويمكنك الرجوع إلى تفاصيلها.', 'Lessons that have ended and remain in your history.'),
      icon: 'calendar' as const,
      activeColor: colors.primary,
      activeBackground: colors.navySoft,
    },
  ];
  const selectedStudentRequest = studentRequestOptions.find((option) => option.key === studentRequestSection) ?? studentRequestOptions[0];
  const selectedStudentRequestRows = selectedStudentRequest.key === 'pending'
    ? displayedRequests.filter(({ request }) => request.status === 'open')
    : acceptedRequestRows;
  const selectedStudentRequestCount = selectedStudentRequest.key === 'completed'
    ? completedSessions.length
    : selectedStudentRequestRows.length;
  const studentRequestSections = (
    <View style={[styles.studentRequestCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="student-request-sections">
      <View style={styles.studentRequestHeader}>
        <View style={[styles.studentRequestHeaderIcon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="inbox" size={18} color={colors.teal} />
        </View>
        <View style={styles.studentRequestHeaderCopy}>
          <Text style={[styles.studentRequestHeaderTitle, { color: colors.foreground, writingDirection: direction }]}>{t('طلبات الحصص', 'Lesson requests')}</Text>
          <Text style={[styles.studentRequestHeaderBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t('اختر القسم لعرض تفاصيله دون شغل مساحة إضافية.', 'Choose a section to view its details without taking extra space.')}</Text>
        </View>
        <View style={[styles.studentRequestTotal, { backgroundColor: colors.navySoft }]}>
          <Text style={[styles.studentRequestTotalValue, { color: colors.primary }]}>{formatNumber(displayedRequests.length + completedSessions.length)}</Text>
          <Text style={[styles.studentRequestTotalLabel, { color: colors.primary }]}>{t('الإجمالي', 'Total')}</Text>
        </View>
      </View>
      <View style={[styles.studentRequestTabs, { backgroundColor: colors.muted }]}>
        {studentRequestOptions.map((option) => {
          const selected = option.key === studentRequestSection;
          const count = option.key === 'completed'
            ? completedSessions.length
            : option.key === 'pending'
              ? displayedRequests.filter(({ request }) => request.status === 'open').length
              : acceptedRequestRows.length;
          return (
            <Pressable
              key={option.key}
              testID={`student-request-${option.key}`}
              onPress={() => setStudentRequestSection(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.studentRequestTab,
                selected && { backgroundColor: colors.card, borderColor: option.activeColor },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.studentRequestTabText, { color: selected ? option.activeColor : colors.mutedForeground }]}>{option.title}</Text>
              <View style={[styles.studentRequestTabCount, { backgroundColor: selected ? option.activeBackground : colors.card }]}>
                <Text style={[styles.studentRequestTabCountText, { color: selected ? option.activeColor : colors.mutedForeground }]}>{formatNumber(count)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.studentRequestPanel, { borderColor: selectedStudentRequest.activeColor }]}>
        <View style={styles.studentRequestPanelHeader}>
          <View style={[styles.studentRequestPanelIcon, { backgroundColor: selectedStudentRequest.activeBackground }]}>
            <Icon name={selectedStudentRequest.icon} size={16} color={selectedStudentRequest.activeColor} />
          </View>
          <View style={styles.studentRequestPanelCopy}>
            <Text style={[styles.studentRequestPanelTitle, { color: colors.foreground, writingDirection: direction }]}>{selectedStudentRequest.title}</Text>
            <Text style={[styles.studentRequestPanelBody, { color: colors.mutedForeground, writingDirection: direction }]}>{selectedStudentRequest.body}</Text>
          </View>
          <Icon name="chevron-down" size={17} color={selectedStudentRequest.activeColor} />
          <View style={[styles.studentRequestPanelCount, { backgroundColor: selectedStudentRequest.activeBackground }]}>
            <Text style={[styles.studentRequestPanelCountText, { color: selectedStudentRequest.activeColor }]}>{formatNumber(selectedStudentRequestCount)}</Text>
          </View>
        </View>
        {selectedStudentRequest.key === 'completed' ? (
          historyQuery.isError ? (
            <EmptyState icon="alert-circle" title={t('تعذر تحميل الحصص المكتملة', 'Unable to load completed lessons')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { void historyQuery.refetch(); }} />
          ) : completedSessions.length ? (
            <View style={styles.requests}>{completedSessions.map(renderSessionCard)}</View>
          ) : (
            <EmptyState icon="check-circle" title={t('لا توجد حصص مكتملة', 'No completed lessons')} body={t('ستظهر الحصص هنا بعد انتهائها.', 'Lessons will appear here after they end.')} />
          )
        ) : requestQuery.isError ? (
          <EmptyState icon="alert-circle" title={t('تعذر تحميل الطلبات', 'Unable to load requests')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { void requestQuery.refetch(); }} />
        ) : selectedStudentRequestRows.length ? (
          <View style={styles.requests}>
            {selectedStudentRequestRows.map(({ request, count, items }) => (
              <BookingRequestCard
                key={`${selectedStudentRequest.key}-${request.groupId || request.id}-${request.id}`}
                request={request}
                groupCount={count}
                groupItems={items}
                deleting={deleteRequestMutation.isPending && deleteRequestTarget?.id === request.id}
                onCancel={selectedStudentRequest.key === 'pending' ? () => requestBookingCancel(request) : undefined}
                onDelete={request.status === 'accepted' ? () => requestBookingDelete(request) : undefined}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            icon={selectedStudentRequest.key === 'accepted' ? 'check-circle' : 'inbox'}
            title={selectedStudentRequest.key === 'pending' ? t('لا توجد طلبات بانتظار القبول', 'No requests waiting') : t('لا توجد طلبات مقبولة', 'No accepted requests')}
            body={selectedStudentRequest.key === 'pending' ? t('ستظهر طلباتك الجديدة هنا حتى يقبلها المعلم.', 'New requests will appear here until the teacher accepts them.') : t('ستظهر هنا الطلبات بعد موافقة المعلم.', 'Requests will appear here after the teacher accepts them.')}
          />
        )}
      </View>
    </View>
  );

  return (
    <Screen>
      <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={t('إيقاع أسبوعك', 'Your weekly rhythm')} title={t('الجلسات', 'Sessions')} onBell={() => router.push('/notifications')} onAvatar={() => router.push('/profile')} />
       <View testID="book-session-hero" style={[styles.intro, { backgroundColor: colors.primary }]}>
         <View style={[styles.heroOrb, { backgroundColor: colors.tint }]} />
         <View style={styles.introTop}>
           <View style={styles.introCopy}>
             <View style={styles.introKicker}><View style={[styles.kickerDot, { backgroundColor: colors.accent }]} /><Text style={[styles.introLabel, { color: colors.tint }]}>{t('مساحتك التعليمية', 'Your learning space')}</Text></View>
             <Text numberOfLines={1} style={[styles.introTitle, { color: colors.primaryForeground, writingDirection: direction }]}>{role === 'student' ? t('رتّب جلستك القادمة', 'Plan your next session') : t('كل جلساتك في مكان واحد', 'Your sessions, in one place')}</Text>
             <Text numberOfLines={2} style={[styles.introBody, { color: colors.tint, writingDirection: direction }]}>{role === 'student' ? t('تابع طلباتك ومواعيدك المؤكدة بسهولة.', 'Track requests and confirmed sessions with ease.') : t('تابع طلبات الطلاب ومواعيدك القادمة بوضوح.', 'Track student requests and upcoming sessions with clarity.')}</Text>
           </View>
           <View style={[styles.heroAside, { backgroundColor: colors.primaryForeground + '16', borderColor: colors.primaryForeground + '22' }]}>
             <View style={[styles.heroAsideIcon, { backgroundColor: colors.teal }]}>
               <Icon name="calendar" size={17} color={colors.primaryForeground} />
             </View>
             <Text style={[styles.heroAsideValue, { color: colors.primaryForeground }]}>{formatNumber(activeSessionCount)}</Text>
             <Text style={[styles.heroAsideLabel, { color: colors.tint }]}>{t('جلسات قادمة', 'Upcoming')}</Text>
           </View>
         </View>
          <View style={styles.introBottom}>
           <View style={styles.heroStats}>
             <View style={styles.heroStat}>
               <Text style={[styles.heroStatValue, { color: colors.primaryForeground }]}>{formatNumber(pendingRequestCount)}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.tint }]}>{t('طلبات قادمة', 'Upcoming requests')}</Text>
             </View>
             <View style={styles.heroStatDivider} />
             <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: colors.primaryForeground }]}>{formatNumber(activeSessionCount)}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.tint }]}>{t('حصص قادمة', 'Upcoming lessons')}</Text>
             </View>
             <View style={styles.heroStatDivider} />
             <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: colors.primaryForeground }]}>{formatNumber(scheduleSessions.length)}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.tint }]}>{t('جدول الحصص', 'Lesson schedule')}</Text>
             </View>
           </View>
         </View>
          {role === 'student' ? (
            <Pressable
              testID="new-booking-button"
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                addSession();
              }}
              style={({ pressed }) => [
                styles.introAction,
                { backgroundColor: colors.teal },
                pressed && styles.pressed,
              ]}
            >
              <Icon name="plus" size={18} color={colors.primaryForeground} />
              <Text style={[styles.introActionText, { color: colors.primaryForeground }]}>{t('حجز جديد', 'New booking')}</Text>
              <Icon name="chevron-left" size={17} color={colors.primaryForeground} />
            </Pressable>
          ) : null}
          <View style={[styles.heroOrbSmall, { backgroundColor: colors.teal }]} />
        </View>
        {sessionsQuery.isLoading || historyQuery.isLoading || requestQuery.isLoading ? <LoadingBlock /> : null}
          {role === 'teacher' ? <>{requestSection}{teacherUpcomingSection}</> : <>{studentAvailableSection}{studentRequestSections}</>}
        {!sessionsQuery.isLoading && !historyQuery.isLoading ? <BookingsSchedule sessions={scheduleSessions} role={role === 'teacher' ? 'teacher' : 'student'} onSessionPress={(session) => openSession(session.id)} /> : null}
        <Modal visible={Boolean(cancelTarget)} transparent animationType="fade" onRequestClose={() => setCancelTarget(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
               <Text style={[styles.modalTitle, { color: colors.foreground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{t('سبب إلغاء الجلسة', 'Cancel session')}</Text>
               <Text style={[styles.modalBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{cancelTarget?.title ?? t('الجلسة', 'Session')} · {t('لا يمكن التراجع بعد التأكيد.', 'This cannot be undone.')}</Text>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                maxLength={500}
                 placeholder={t('اكتب سبباً واضحاً للإلغاء (10 أحرف على الأقل)', 'Write a clear reason (at least 10 characters)')}
                placeholderTextColor={colors.mutedForeground}
                 textAlign={direction === 'rtl' ? 'right' : 'left'}
                 style={[styles.reasonInput, { color: colors.foreground, borderColor: colors.border, writingDirection: direction }]}
              />
              <View style={styles.modalActions}>
                 <Pressable onPress={() => setCancelTarget(null)} style={[styles.modalButton, { borderColor: colors.border }]}><Text style={[styles.modalButtonText, { color: colors.mutedForeground }]}>{t('تراجع', 'Go back')}</Text></Pressable>
                 <Pressable disabled={cancelReason.trim().length < 10} onPress={confirmTeacherCancel} style={[styles.modalButton, { backgroundColor: cancelReason.trim().length >= 10 ? colors.destructive : colors.muted }]}><Text style={[styles.modalButtonText, { color: colors.destructiveForeground }]}>{t('تأكيد الإلغاء', 'Confirm cancellation')}</Text></Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal visible={Boolean(cancelRequestTarget)} transparent animationType="fade" onRequestClose={() => setCancelRequestTarget(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, writingDirection: direction }]}>{t('إلغاء طلب الحجز؟', 'Cancel booking request?')}</Text>
              <Text style={[styles.modalBody, { color: colors.mutedForeground, writingDirection: direction }]}>{cancelRequestTarget?.subject ?? t('هذا الطلب', 'This request')} · {t('سيتم إلغاء جميع مواعيد المجموعة وإعادة الرصيد المحجوز إلى المتاح.', 'All appointments in this group will be cancelled and reserved minutes will become available again.')}</Text>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setCancelRequestTarget(null)} style={[styles.modalButton, { borderColor: colors.border }]}><Text style={[styles.modalButtonText, { color: colors.mutedForeground }]}>{t('تراجع', 'Go back')}</Text></Pressable>
                <Pressable disabled={cancelRequestMutation.isPending} onPress={confirmRequestCancel} style={[styles.modalButton, { backgroundColor: cancelRequestMutation.isPending ? colors.muted : colors.destructive }]}><Text style={[styles.modalButtonText, { color: colors.destructiveForeground }]}>{cancelRequestMutation.isPending ? t('جارٍ الإلغاء…', 'Cancelling…') : t('إلغاء الطلب', 'Cancel request')}</Text></Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal visible={Boolean(deleteRequestTarget)} transparent animationType="fade" onRequestClose={() => setDeleteRequestTarget(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground, writingDirection: direction }]}>{t('حذف طلب الحجز؟', 'Delete booking request?')}</Text>
              <Text style={[styles.modalBody, { color: colors.mutedForeground, writingDirection: direction }]}>{deleteRequestTarget?.subject ?? t('هذا الطلب', 'This request')} · {t('سيتم حذف الطلب من قائمتك نهائياً، ولن يتأثر الحجز المؤكد أو الجلسة.', 'The request will be permanently removed from your list. A confirmed booking or session will not be affected.')}</Text>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setDeleteRequestTarget(null)} style={[styles.modalButton, { borderColor: colors.border }]}><Text style={[styles.modalButtonText, { color: colors.mutedForeground }]}>{t('تراجع', 'Go back')}</Text></Pressable>
                <Pressable disabled={deleteRequestMutation.isPending} onPress={confirmRequestDelete} style={[styles.modalButton, { backgroundColor: deleteRequestMutation.isPending ? colors.muted : colors.destructive }]}><Text style={[styles.modalButtonText, { color: colors.destructiveForeground }]}>{deleteRequestMutation.isPending ? t('جارٍ الحذف…', 'Deleting…') : t('حذف الطلب', 'Delete request')}</Text></Pressable>
              </View>
            </View>
          </View>
        </Modal>
    </Screen>
  );
}

function StudentSessionGroup({ studentName, sessions, role, onOpenSession, onJoinSession }: { studentName: string; sessions: Session[]; role: 'teacher'; onOpenSession: (id: string) => void; onJoinSession: (id: string) => void }) {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={[styles.studentGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.studentGroupHeader, pressed && styles.pressed]}
      >
        <View style={[styles.studentGroupAvatar, { backgroundColor: colors.tealSoft }]}>
          <Icon name="user" size={17} color={colors.teal} />
        </View>
        <View style={styles.studentGroupCopy}>
          <Text style={[styles.studentGroupTitle, { color: colors.foreground, writingDirection: direction }]}>{studentName}</Text>
          <Text style={[styles.studentGroupMeta, { color: colors.mutedForeground, writingDirection: direction }]}>
            {formatNumber(sessions.length)} {t('جلسات سابقة', 'past sessions')}
          </Text>
        </View>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>
      {expanded ? (
        <View style={styles.studentGroupSessions}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              role={role}
              cancelled={session.status === 'cancelled'}
              onPress={() => onOpenSession(session.id)}
              onJoin={() => onJoinSession(session.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BookingRequestCard({ request, groupCount = 1, groupItems = [request], busy, cancelling, deleting, onExpired, onCancel, onDelete, onDecision }: { request: BookingRequest; groupCount?: number; groupItems?: BookingRequest[]; busy?: boolean; cancelling?: boolean; deleting?: boolean; onExpired?: () => void; onCancel?: () => void; onDelete?: () => void; onDecision?: (status: 'accepted' | 'rejected') => void }) {
  const colors = useColors();
  const { t, locale, direction } = useAppPreferences();
  const [expanded, setExpanded] = useState(request.status === 'open');
  const [now, setNow] = useState(Date.now());
  const expiryNotified = useRef(false);
  const status = request.status === 'open' ? t('طلب جديد', 'New request') : request.status === 'accepted' ? t('مقبول', 'Accepted') : request.status === 'rejected' ? t('مرفوض', 'Rejected') : request.status === 'cancelled' ? t('ملغى', 'Cancelled') : request.status === 'expired' ? t('منتهي', 'Ended') : request.status;
  const statusColor = request.status === 'accepted' ? colors.teal : request.status === 'open' ? colors.accentForeground : request.status === 'rejected' || request.status === 'cancelled' || request.status === 'expired' ? colors.destructive : colors.primary;
  const statusBackground = request.status === 'accepted' ? colors.tealSoft : request.status === 'open' ? colors.goldSoft : request.status === 'rejected' || request.status === 'cancelled' || request.status === 'expired' ? colors.accent : colors.navySoft;
  const date = new Date(request.scheduledAt);
  const dateLabel = Number.isNaN(date.getTime()) ? t('موعد غير محدد', 'Time not specified') : `${date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
  const expiryDate = request.expiresAt ? new Date(request.expiresAt) : null;
  const expiryLabel = expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : null;
  const remainingMs = expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate.getTime() - now : null;
  const remainingMinutes = remainingMs === null ? null : Math.max(0, Math.ceil(remainingMs / 60_000));
  const remainingLabel = remainingMinutes === null ? null : remainingMinutes >= 60
    ? `${Math.floor(remainingMinutes / 60)} ${t('ساعة', 'h')} ${remainingMinutes % 60 ? `${remainingMinutes % 60} ${t('دقيقة', 'min')}` : ''}`.trim()
    : `${remainingMinutes} ${t('دقيقة', 'min')}`;
  useEffect(() => {
    if (request.status !== 'open' || !expiryDate || remainingMs === null || remainingMs <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request.status, request.expiresAt, remainingMs]);
  useEffect(() => {
    if (remainingMs === null || remainingMs > 0) {
      expiryNotified.current = false;
      return;
    }
    if (request.status === 'open' && !expiryNotified.current) {
      expiryNotified.current = true;
      onExpired?.();
    }
  }, [request.status, remainingMs, onExpired]);
  return (
    <View style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border, borderRightColor: statusColor }]}>
      <View style={styles.requestTop}>
        <Pressable onPress={() => setExpanded((value) => !value)} style={styles.requestTopToggle}>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
          <View style={[styles.requestStatus, { backgroundColor: statusBackground }]}><Text style={[styles.requestStatusText, { color: statusColor }]}>{status}</Text></View>
           <Text style={[styles.requestSubject, { color: colors.foreground, writingDirection: direction }]}>{request.subject}</Text>
        </Pressable>
        {onDelete ? <Pressable
          testID={`delete-booking-request-${request.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('حذف طلب الحجز', 'Delete booking request')}
          disabled={deleting}
          hitSlop={8}
          onPress={onDelete}
          style={({ pressed }) => [styles.requestDeleteButton, { borderColor: colors.destructive, opacity: deleting ? 0.45 : 1 }, pressed && styles.pressed]}
        >
          <Icon name="trash-2" size={15} color={colors.destructive} />
        </Pressable> : null}
      </View>
       {expanded ? <><Text style={[styles.requestMeta, { color: colors.mutedForeground, writingDirection: direction }]}>{request.studentName ? `${t('الطالب', 'Student')}: ${request.studentName} · ` : ''}{dateLabel} · {request.durationMinutes} {t('دقيقة', 'min')}{groupCount > 1 ? ` · ${groupCount} ${t('حصص في طلب واحد', 'sessions in one request')}` : ''}</Text>
       {groupCount > 1 ? <View style={styles.requestSlotList}>{groupItems.map((item) => {
         const itemDate = new Date(item.scheduledAt);
         return <Text key={item.id} style={[styles.requestSlot, { color: colors.foreground, backgroundColor: colors.muted }]}>{itemDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} · {itemDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</Text>;
       })}</View> : null}
        {request.status === 'open' && remainingLabel && remainingMs !== null && remainingMs > 0 ? <Text style={[styles.requestMeta, { color: colors.mutedForeground, writingDirection: direction }]}>{t('متبقي على الطلب', 'Request time remaining')}: {remainingLabel} · {t('ينتهي الساعة', 'ends at')} {expiryLabel}</Text> : null}
       {request.status === 'open' && !onDecision ? <Text style={[styles.requestReserveNote, { color: colors.teal }]}>{t('الرصيد محجوز مؤقتاً فقط، ويعود متاحاً بعد رفض الطلب أو انتهائه.', 'Minutes are reserved temporarily and become available after rejection or expiry.')}</Text> : null}
       {request.status === 'rejected' || request.status === 'expired' ? <Text style={[styles.requestReserveNote, { color: colors.teal }]}>{t('عاد رصيد هذه المواعيد إلى المتاح للحجز.', 'The minutes for these times are available again.')}</Text> : null}
      {request.acceptedBy ? <Text style={[styles.requestMeta, { color: colors.mutedForeground, writingDirection: direction }]}>{t('تم القبول بواسطة المعلم', 'Accepted by the teacher')}</Text> : null}
        {onCancel && request.status === 'open' ? <Pressable disabled={cancelling} onPress={onCancel} style={[styles.requestCancelButton, { borderColor: colors.destructive }]}><Icon name="x-circle" size={14} color={colors.destructive} /><Text style={[styles.requestCancelText, { color: colors.destructive }]}>{cancelling ? t('جارٍ الإلغاء…', 'Cancelling…') : t('إلغاء الطلب', 'Cancel request')}</Text></Pressable> : null}
         {onDelete && (request.status === 'accepted' || ['rejected', 'cancelled', 'expired'].includes(request.status)) ? <Pressable disabled={deleting} onPress={onDelete} style={[styles.requestCancelButton, { borderColor: colors.destructive }]}><Icon name="trash-2" size={14} color={colors.destructive} /><Text style={[styles.requestCancelText, { color: colors.destructive }]}>{deleting ? t('جارٍ الحذف…', 'Deleting…') : t('حذف الطلب', 'Delete request')}</Text></Pressable> : null}
      {onDecision && request.status === 'open' ? <View style={styles.requestActions}><Pressable disabled={busy} onPress={() => onDecision('rejected')} style={[styles.requestButton, { borderColor: colors.border }]}><Text style={[styles.requestButtonText, { color: colors.destructive }]}>{t('رفض', 'Reject')}</Text></Pressable><Pressable disabled={busy} onPress={() => onDecision('accepted')} style={[styles.requestButton, { backgroundColor: busy ? colors.muted : colors.teal }]}><Text style={[styles.requestButtonText, { color: colors.primaryForeground }]}>{busy ? t('جارٍ التحديث…', 'Updating…') : t('قبول الطلب', 'Accept request')}</Text></Pressable></View> : null}</> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { borderRadius: 20, minHeight: 158, padding: 16, flexDirection: 'column', alignItems: 'stretch', marginBottom: 14, overflow: 'hidden', position: 'relative' },
  heroOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, opacity: 0.08, left: -100, top: -86 },
  heroOrbSmall: { position: 'absolute', width: 94, height: 94, borderRadius: 47, opacity: 0.12, right: -35, bottom: -42 },
  introTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, zIndex: 1 },
  introCopy: { flex: 1, alignItems: 'flex-end', zIndex: 1 },
  introKicker: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' },
  kickerDot: { width: 6, height: 6, borderRadius: 3 },
  introLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  introTitle: { width: '100%', fontSize: 20, lineHeight: 26, letterSpacing: -0.3, fontFamily: 'Inter_700Bold', marginTop: 6, textAlign: 'right', writingDirection: 'rtl' },
  introBody: { width: '100%', fontSize: 10, lineHeight: 15, marginTop: 4, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  heroAside: { width: 72, minHeight: 88, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  heroAsideIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  heroAsideValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  heroAsideLabel: { fontSize: 8, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl', textAlign: 'center' },
  introBottom: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)', zIndex: 1 },
  heroStats: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  heroStatLabel: { fontSize: 7, fontFamily: 'Inter_500Medium', marginTop: 2, writingDirection: 'rtl', textAlign: 'center' },
  heroStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.18)' },
  introAction: { width: '100%', minHeight: 50, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, zIndex: 2 },
  introActionText: { fontSize: 14, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  segmented: { borderRadius: 15, padding: 4, flexDirection: 'row-reverse', marginBottom: 16, alignSelf: 'stretch' },
  segment: { flex: 1, minHeight: 44, paddingVertical: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 6 },
  segmentText: { fontSize: 11, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  addButton: { borderRadius: 15, minHeight: 50, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  addButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  sectionLead: { minHeight: 64, borderRadius: 16, borderWidth: 1, padding: 9, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginBottom: 8 },
  sectionLeadIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionLeadCopy: { flex: 1, alignItems: 'flex-end' },
  sectionLeadTitle: { width: '100%', fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  sectionLeadBody: { width: '100%', fontSize: 8, lineHeight: 13, marginTop: 2, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  sectionLeadCount: { minWidth: 38, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 6, alignItems: 'center' },
  sectionLeadCountText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  sectionLeadCountLabel: { fontSize: 7, fontFamily: 'Inter_600SemiBold', marginTop: 1, writingDirection: 'rtl' },
  studentRequestCard: { borderRadius: 20, borderWidth: 1, padding: 11, gap: 11, marginBottom: 18, shadowColor: '#08264A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  studentRequestHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  studentRequestHeaderIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  studentRequestHeaderCopy: { flex: 1, alignItems: 'flex-end' },
  studentRequestHeaderTitle: { width: '100%', fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  studentRequestHeaderBody: { width: '100%', fontSize: 9, lineHeight: 14, marginTop: 2, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  studentRequestTotal: { minWidth: 43, borderRadius: 11, paddingHorizontal: 6, paddingVertical: 6, alignItems: 'center' },
  studentRequestTotalValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  studentRequestTotalLabel: { fontSize: 7, fontFamily: 'Inter_600SemiBold', marginTop: 1, writingDirection: 'rtl' },
  studentRequestTabs: { borderRadius: 14, padding: 4, flexDirection: 'row-reverse', gap: 4 },
  studentRequestTab: { flex: 1, minHeight: 53, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3 },
  studentRequestTabText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl', textAlign: 'center' },
  studentRequestTabCount: { minWidth: 21, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  studentRequestTabCountText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  studentRequestPanel: { borderRadius: 15, borderWidth: 1, borderRightWidth: 3, padding: 10, gap: 10 },
  studentRequestPanelHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  studentRequestPanelIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  studentRequestPanelCopy: { flex: 1, alignItems: 'flex-end' },
  studentRequestPanelTitle: { width: '100%', fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  studentRequestPanelBody: { width: '100%', fontSize: 8, lineHeight: 12, marginTop: 2, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  studentRequestPanelCount: { minWidth: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  studentRequestPanelCountText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  studentGroups: { gap: 10, marginBottom: 16 },
  studentGroup: { borderRadius: 19, borderWidth: 1, overflow: 'hidden' },
  studentGroupHeader: { minHeight: 72, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  studentGroupAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  studentGroupCopy: { flex: 1, alignItems: 'flex-end' },
  studentGroupTitle: { width: '100%', fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  studentGroupMeta: { width: '100%', fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 3 },
  studentGroupSessions: { gap: 10, paddingHorizontal: 10, paddingBottom: 10 },
  requestTabs: { borderRadius: 16, borderWidth: 1, padding: 4, flexDirection: 'row-reverse', gap: 4, marginBottom: 12 },
  requestTab: { flex: 1, minHeight: 47, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 4, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', gap: 3 },
  requestTabText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl', textAlign: 'center' },
  requestTabCount: { minWidth: 19, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  requestTabCountText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  requests: { gap: 10, marginBottom: 16 },
  requestSections: { gap: 10, marginBottom: 18 },
  requestSection: { gap: 8 },
  requestSectionHeader: { minHeight: 50, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  requestSectionTitle: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  requestCard: { borderRadius: 19, borderWidth: 1, borderRightWidth: 3, padding: 14, gap: 9 },
  requestTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  requestTopToggle: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 40 },
  requestDeleteButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  requestSubject: { flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  requestStatus: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  requestStatusText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  requestMeta: { fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  requestSlotList: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  requestSlot: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  requestReserveNote: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl' },
  requestCancelButton: { minHeight: 41, borderRadius: 11, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 3 },
  requestCancelText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  requestActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 3 },
  requestButton: { flex: 1, minHeight: 43, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  requestButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(6, 24, 44, 0.55)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 17, gap: 10 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  modalBody: { fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  reasonInput: { minHeight: 105, borderRadius: 13, borderWidth: 1, padding: 12, fontSize: 12, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 4 },
  modalButton: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { fontSize: 11, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
});