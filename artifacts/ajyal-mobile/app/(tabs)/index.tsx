import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useAuth } from '@/lib/auth';
import { getReadChatMessageIds } from '@/lib/localChatReadState';
import { getStudentUnreadChatMessageCount } from '@/lib/studentUnreadMessages';
import { getAvailableTeacherBalance } from '@/lib/teacherFinance';
import {
  countOpenBookingRequestGroups,
  getTeacherInPersonRequestCountQueryKey,
  isTeacherBookingNotification,
  refetchTeacherBookingTaskQueries,
} from '@/lib/teacherBookingTaskSync';
import { supabase } from '@/lib/supabase';
import { isAssignmentComplete } from '@/constants/localData';
import { summarizePendingTeacherSubmissions } from '@/lib/teacherAssignmentTasks';
import { DashboardActions, EmptyState, Header, Icon, IconName, LoadingBlock, Screen, SectionHeading, SessionCard, WelcomeBanner } from '@/components/AjyalUI';
import { getListBookingRequestsQueryKey, getListMyAssignmentsQueryKey, useGetStudentDashboard, useGetTeacherDashboard, useListBookingRequests, useListMyAssignments } from '@workspace/api-client-react';

type TodayTask = {
  id: string;
  icon: IconName;
  tone: 'navy' | 'teal' | 'gold';
  title: string;
  body: string;
  onPress: () => void;
};

export default function HomeScreen() {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const { role, profile, isLoading, isAuthenticated, roleResolved } = useAjyal();
  const { user } = useAuth();
  const isTeacher = role === 'teacher';
  const canLoadRoleData = isAuthenticated && roleResolved;
  const earningsMonth = new Date().toISOString().slice(0, 7);
  const teacherDashboardQuery = useGetTeacherDashboard({
    query: {
      queryKey: ['teacher-dashboard'],
      enabled: canLoadRoleData && isTeacher,
      staleTime: 60_000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
  const teacherNetSummaryQuery = useQuery({
    queryKey: ['teacher-net-summary', user?.id, earningsMonth],
    enabled: canLoadRoleData && isTeacher && Boolean(user?.id) && Boolean(supabase),
    queryFn: async () => {
      const client = supabase;
      const teacherId = user?.id;
      if (!client || !teacherId) throw new Error('Teacher earnings are unavailable.');
      const { data, error } = await client.rpc('get_teacher_net_summary', {
        _teacher_id: teacherId,
        _month: earningsMonth,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { net_total?: unknown } | null;
      if (!row) throw new Error('The platform returned no teacher earnings summary.');
      const netTotal = Number(row.net_total);
      if (!Number.isFinite(netTotal)) throw new Error('The platform returned an invalid teacher earnings total.');
      return netTotal;
    },
    staleTime: 30_000,
    refetchInterval: canLoadRoleData && isTeacher ? 60_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const teacherAvailableBalanceQuery = useQuery({
    queryKey: ['teacher-available-balance', user?.id],
    enabled: canLoadRoleData && isTeacher && Boolean(user?.id) && Boolean(supabase),
    queryFn: async () => {
      const client = supabase;
      const teacherId = user?.id;
      if (!client || !teacherId) throw new Error('Teacher earnings are unavailable.');
      const { data, error } = await client.rpc('get_teacher_withdrawal_summary' as any, {
        _teacher_id: teacherId,
      });
      if (error) throw error;
      const summary = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!summary) throw new Error('The platform returned no teacher balance summary.');
      return getAvailableTeacherBalance({ available_balance: summary.online_available });
    },
    staleTime: 30_000,
    refetchInterval: canLoadRoleData && isTeacher ? 60_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const incomingRequestsQuery = useListBookingRequests(
    { view: 'incoming' },
    {
      query: {
        enabled: canLoadRoleData && isTeacher,
        queryKey: getListBookingRequestsQueryKey({ view: 'incoming' }),
        staleTime: 15_000,
        refetchInterval: canLoadRoleData && isTeacher ? 15_000 : false,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  );
  const teacherInPersonRequestsQuery = useQuery({
    queryKey: getTeacherInPersonRequestCountQueryKey(user?.id),
    enabled: canLoadRoleData && isTeacher && Boolean(user?.id) && Boolean(supabase),
    queryFn: async () => {
      if (!supabase) throw new Error('In-person requests are unavailable.');
      const { data, error } = await supabase.rpc('list_teacher_in_person_requests_priced');
      if (error) throw error;
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const row = item as Record<string, unknown>;
        return String(row.status ?? row.request_status ?? '') === 'open';
      }).length;
    },
    staleTime: 15_000,
    refetchInterval: canLoadRoleData && isTeacher ? 15_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const studentDashboardQuery = useGetStudentDashboard({
    query: {
      queryKey: ['student-dashboard'],
      enabled: canLoadRoleData && !isTeacher,
      staleTime: 60_000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
  const assignmentsQuery = useListMyAssignments({
    query: {
      queryKey: getListMyAssignmentsQueryKey(),
      enabled: canLoadRoleData,
      staleTime: 60_000,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });
  const teacherAssignmentIds = (assignmentsQuery.data ?? []).map((assignment) => assignment.id).filter(Boolean);
  const teacherSubmissionsQuery = useQuery({
    queryKey: ['teacher-assignment-submissions', user?.id, teacherAssignmentIds.join(',')],
    enabled: canLoadRoleData && isTeacher && teacherAssignmentIds.length > 0 && Boolean(supabase),
    queryFn: async () => {
      const client = supabase;
      if (!client || !teacherAssignmentIds.length) return [];
      const { data, error } = await client
        .from('assignment_submissions')
        .select('assignment_id,status')
        .in('assignment_id', teacherAssignmentIds);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const unreadChatQuery = useQuery({
    queryKey: ['student-unread-chat-count', profile?.id],
    enabled: canLoadRoleData && !isTeacher && Boolean(profile?.id) && Boolean(supabase),
    queryFn: async () => {
      if (!profile?.id || !supabase) throw new Error('Student chat is unavailable.');
      const readMessageIds = await getReadChatMessageIds(profile.id);
      return getStudentUnreadChatMessageCount(supabase, profile.id, readMessageIds);
    },
    staleTime: 30_000,
    refetchInterval: canLoadRoleData && !isTeacher ? 60_000 : false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useFocusEffect(useCallback(() => {
    if (canLoadRoleData && !isTeacher && profile?.id && supabase) {
      void unreadChatQuery.refetch();
    }
  }, [canLoadRoleData, isTeacher, profile?.id, unreadChatQuery.refetch]));
  useFocusEffect(useCallback(() => {
    const client = supabase;
    if (!client || !canLoadRoleData || !isTeacher || !profile?.id) return undefined;
    const refreshTeacherBookings = () => {
      void refetchTeacherBookingTaskQueries(
        () => incomingRequestsQuery.refetch(),
        () => teacherInPersonRequestsQuery.refetch(),
        () => teacherDashboardQuery.refetch(),
      ).catch((error) => {
        console.warn('[teacher-home] Could not refresh booking task counts:', error);
      });
    };
    const topic = `teacher-home-bookings-${profile.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = client
      .channel(topic)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'booking_requests',
      }, refreshTeacherBookings)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        const notification = payload.new as Record<string, unknown>;
        if (isTeacherBookingNotification(notification.type)) refreshTeacherBookings();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'assignment_submissions',
      }, () => {
        void assignmentsQuery.refetch();
        void teacherSubmissionsQuery.refetch();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[teacher-home] Realtime channel ${status.toLowerCase()}; using query refreshes instead.`);
        }
      });
    return () => {
      void client.removeChannel(channel).catch((error) => {
        console.warn('[teacher-home] Could not remove realtime channel:', error);
      });
    };
  }, [assignmentsQuery.refetch, canLoadRoleData, incomingRequestsQuery.refetch, isTeacher, profile?.id, teacherDashboardQuery.refetch, teacherInPersonRequestsQuery.refetch, teacherSubmissionsQuery.refetch]));
  const assignments = assignmentsQuery.data ?? [];
  const pendingAssignments = assignments.filter((assignment) => !isAssignmentComplete(assignment));
  const teacherTaskSummary = summarizePendingTeacherSubmissions(
    teacherSubmissionsQuery.data ?? [],
    new Map(assignments.map((assignment) => [assignment.id, assignment.kind])),
  );
  const teacherDashboard = teacherDashboardQuery.data;
  const studentDashboard = studentDashboardQuery.data;
  const incomingOpenRequests = incomingRequestsQuery.data
    ? countOpenBookingRequestGroups(incomingRequestsQuery.data)
    : 0;
  const inPersonOpenRequests = teacherInPersonRequestsQuery.data ?? 0;
  const openRequestCount = incomingOpenRequests + inPersonOpenRequests;
  const dashboardSessions = isTeacher ? (teacherDashboard?.upcomingSessions ?? []) : (studentDashboard?.upcomingSessions ?? []);
  const firstSession = dashboardSessions[0];
  const unread = isTeacher ? (teacherDashboard?.unreadNotifications ?? 0) : (studentDashboard?.unreadNotifications ?? 0);
  const dashboardDegradedSections = isTeacher ? (teacherDashboard?.degradedSections ?? []) : (studentDashboard?.degradedSections ?? []);
  const degradedSections = !isTeacher && unreadChatQuery.isError
    ? [...dashboardDegradedSections, 'messages']
    : dashboardDegradedSections;
  const hasError = isTeacher
    ? teacherDashboardQuery.isError || assignmentsQuery.isError || teacherSubmissionsQuery.isError
    : studentDashboardQuery.isError || assignmentsQuery.isError;
  const hasDashboardData = isTeacher
    ? Boolean(teacherDashboard || assignmentsQuery.data)
    : Boolean(studentDashboard || assignmentsQuery.data);
  const dashboardInitialLoading = !hasDashboardData && (
    isLoading ||
    (isTeacher
      ? teacherDashboardQuery.isLoading || assignmentsQuery.isLoading || teacherSubmissionsQuery.isLoading
      : studentDashboardQuery.isLoading || assignmentsQuery.isLoading)
  );
  const dashboardRefreshing = hasDashboardData && (
    isTeacher
      ? teacherDashboardQuery.isFetching || assignmentsQuery.isFetching || teacherSubmissionsQuery.isFetching
      : studentDashboardQuery.isFetching || assignmentsQuery.isFetching
  );
  const todayTasks: TodayTask[] = [];
  if (!isTeacher && firstSession) {
    todayTasks.push({
      id: `session-${firstSession.id}`,
      icon: 'clock',
      tone: 'teal',
      title: firstSession.title,
      body: `${firstSession.subject} · ${firstSession.time}`,
      onPress: () => router.push('/bookings'),
    });
  }
  const nextAssignment = pendingAssignments[0];
  if (!isTeacher && nextAssignment) {
    todayTasks.push({
      id: `assignment-${nextAssignment.id}`,
      icon: nextAssignment.kind === 'اختبار' ? 'edit-3' : 'clipboard',
      tone: 'navy',
      title: nextAssignment.title,
      body: `${nextAssignment.subject} · ${nextAssignment.due}`,
      onPress: () => router.push('/assignments'),
    });
  }
  if (!isTeacher && (unreadChatQuery.data ?? 0) > 0) {
    todayTasks.push({
      id: 'unread-chat-messages',
      icon: 'message-circle',
      tone: 'teal',
      title: `${formatNumber(unreadChatQuery.data ?? 0)} ${t('رسائل غير مقروءة', 'unread messages')}`,
      body: t('افتح محادثاتك لمراجعتها', 'Open your conversations to review them'),
      onPress: () => router.push('/messages'),
    });
  }
  if (!isTeacher && (studentDashboard?.unreadNotifications ?? 0) > 0) {
    todayTasks.push({
      id: 'unread-notifications',
      icon: 'bell',
      tone: 'gold',
      title: `${formatNumber(studentDashboard?.unreadNotifications ?? 0)} ${t('تنبيهات غير مقروءة', 'unread notifications')}`,
      body: t('افتحها لمراجعة أي تحديث يحتاج انتباهك', 'Open them to review updates that need your attention'),
      onPress: () => router.push('/notifications'),
    });
  }
  if (!isTeacher && studentDashboard?.openBookingRequests) {
    todayTasks.push({
      id: 'open-bookings',
      icon: 'calendar',
      tone: 'gold',
      title: `${formatNumber(studentDashboard.openBookingRequests)} ${t('طلبات حجز مفتوحة', 'open booking requests')}`,
      body: t('تابع حالتها من الحجوزات', 'Track their status in bookings'),
      onPress: () => router.push('/bookings'),
    });
  }
  if (isTeacher && teacherTaskSummary.total > 0) {
    todayTasks.push({
      id: 'teacher-assignment-submissions',
      icon: 'clipboard',
      tone: 'gold',
      title: `${formatNumber(teacherTaskSummary.total)} ${t('حلول بانتظار المراجعة', 'submissions to review')}`,
      body: [
        teacherTaskSummary.assignments ? `${formatNumber(teacherTaskSummary.assignments)} ${t('واجب', 'homework')}` : '',
        teacherTaskSummary.quizzes ? `${formatNumber(teacherTaskSummary.quizzes)} ${t('اختبار', 'quizzes')}` : '',
      ].filter(Boolean).join(' · '),
      onPress: () => router.push('/assignments'),
    });
  }
  if (isTeacher && openRequestCount > 0) {
    todayTasks.unshift({
      id: 'teacher-pending-booking-decisions',
      icon: 'calendar',
      tone: 'teal',
      title: `${formatNumber(openRequestCount)} ${t('طلبات حصص بانتظار قرارك', 'lesson requests need your decision')}`,
      body: `${formatNumber(incomingOpenRequests)} ${t('عن بُعد', 'online')} · ${formatNumber(inPersonOpenRequests)} ${t('حضوري', 'in person')}`,
      onPress: () => router.push('/bookings'),
    });
  }
  const openDashboardAction = (id: string) => {
    if (id === 'bookings' || id === 'teacher-schedule' || id === 'teacher-sessions') {
      router.push('/bookings');
      return;
    }
    if (id === 'assignments' || id === 'review') {
      router.push('/assignments');
      return;
    }
    const routes: Record<string, string> = {
      'find-teacher': '/find-teacher',
      subscriptions: '/subscriptions',
      'smart-teacher': '/smart-teacher',
      materials: '/materials',
      students: '/students',
      wallet: '/wallet',
      'teacher-materials': '/teacher-materials',
    };
    router.push((routes[id] ?? '/more') as never);
  };

  return (
    <Screen>
      <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={`${t('مرحباً، ', 'Hello, ')}${profile?.displayName ?? ''}`} title={role === 'student' ? t('مساحتك للتعلّم', 'Your learning space') : t('لوحة المعلّم', 'Teacher dashboard')} unread={unread > 0} onBell={() => router.push('/notifications')} onAvatar={() => router.push('/profile')} />
      <WelcomeBanner role={role} onAction={() => router.push('/bookings')} />
      {isTeacher && openRequestCount > 0 ? (
        <Pressable testID="new-lesson-requests" onPress={() => router.push('/bookings')} style={({ pressed }) => [styles.requestNotice, { backgroundColor: colors.goldSoft, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={[styles.requestBadge, { backgroundColor: colors.accent }]}><Text style={[styles.requestBadgeText, { color: colors.primary }]}>{openRequestCount}</Text></View>
          <View style={[styles.requestCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.requestTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('طلبات الحصص الجديدة', 'New lesson requests')}</Text>
            <Text style={[styles.requestBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('راجع الطلبات المفتوحة واتخذ قرارك', 'Review open requests and decide')}</Text>
          </View>
          <Icon name="arrow-left" size={17} color={colors.accentForeground} />
        </Pressable>
      ) : null}
      <DashboardActions
        role={role}
        onAction={openDashboardAction}
        studentBalance={studentDashboard?.balance}
        nextAssignment={pendingAssignments[0] ? { title: pendingAssignments[0].title, due: pendingAssignments[0].due } : null}
      />

      {dashboardInitialLoading ? <LoadingBlock /> : null}
      {dashboardRefreshing ? (
        <View style={[styles.refreshingNotice, { backgroundColor: colors.tealSoft }]}>
          <Icon name="refresh-cw" size={14} color={colors.teal} />
          <Text style={[styles.refreshingText, { color: colors.teal, writingDirection: direction }]}>
            {t('يتم تحديث البيانات في الخلفية', 'Updating your data in the background')}
          </Text>
        </View>
      ) : null}
      {hasError ? <EmptyState icon="alert-circle" title={t('تعذر تحميل بياناتك', 'Could not load your data')} body={t('تحقق من اتصالك ثم حاول المزامنة مرة أخرى.', 'Check your connection and try syncing again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { if (isTeacher) { void teacherDashboardQuery.refetch(); void assignmentsQuery.refetch(); void teacherSubmissionsQuery.refetch(); } else { void studentDashboardQuery.refetch(); void assignmentsQuery.refetch(); } }} /> : null}
      {degradedSections.length ? (
        <View style={[styles.degradedNotice, { backgroundColor: colors.goldSoft, borderColor: colors.border }]}>
          <View style={[styles.requestBadge, { backgroundColor: colors.accent }]}><Icon name="alert-circle" size={16} color={colors.primary} /></View>
          <View style={[styles.requestCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.requestTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('بعض البيانات قيد المزامنة', 'Some data is still syncing')}</Text>
            <Text style={[styles.requestBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('ظهرت الأقسام المتاحة، وسنحاول تحديث البيانات الناقصة تلقائيًا.', 'Available sections are shown while the missing data is retried automatically.')}</Text>
          </View>
        </View>
      ) : null}

      {!isTeacher && studentDashboard && !studentDashboard.profileComplete ? (
        <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => [styles.profileNotice, { backgroundColor: colors.goldSoft, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={[styles.requestBadge, { backgroundColor: colors.accent }]}><Icon name="user" size={16} color={colors.primary} /></View>
          <View style={styles.requestCopy}>
             <Text style={[styles.requestTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('أكمل ملفك الشخصي', 'Complete your profile')}</Text>
             <Text style={[styles.requestBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('أضف الاسم ورقم الهاتف والمرحلة لتسهيل الحجز.', 'Add your name, phone number, and school stage to make booking easier.')}</Text>
          </View>
          <Icon name="arrow-left" size={17} color={colors.accentForeground} />
        </Pressable>
      ) : null}

       <View style={[styles.todayPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.todayHeader, { borderBottomColor: colors.border }]}>
           <View style={[styles.todaySignal, { backgroundColor: colors.tealSoft }]}><View style={[styles.signalDot, { backgroundColor: colors.teal }]} /><Text style={[styles.todaySignalText, { color: colors.teal, writingDirection: direction }]}>{t('محدث الآن', 'Updated now')}</Text></View>
           <View style={[styles.todayHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start', backgroundColor: colors.navySoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }]}><Text style={[styles.todayEyebrow, { color: colors.primary, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('نظرة سريعة', 'Quick overview')}</Text><Text style={[styles.todayTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{role === 'student' ? t('ما ينتظرك اليوم', 'What awaits you today') : t('صورة يومك التعليمية', 'Your teaching day')}</Text></View>
        </View>
          {isTeacher ? (
            <View style={styles.teacherQuickOverview}>
              <View style={styles.metrics}>
                <Metric value={formatNumber(teacherDashboard?.stats.students ?? 0)} label={t('طلاب نشطون', 'Active students')} icon="users" color={colors.teal} />
                <Metric value={formatNumber(teacherDashboard?.stats.sessions ?? 0)} label={t('إجمالي الجلسات', 'Total sessions')} icon="activity" color={colors.accent} />
                <Metric value={`${teacherDashboard?.stats.rating?.toFixed(1) ?? '0.0'}`} label={t('التقييم العام', 'Overall rating')} icon="star" color={colors.primary} />
              </View>
              {todayTasks.length ? (
                <View style={styles.todayTasks}>
                  {todayTasks.slice(0, 4).map((task) => <TodayTaskRow key={task.id} {...task} />)}
                </View>
              ) : !assignmentsQuery.isLoading && !assignmentsQuery.isError && !teacherSubmissionsQuery.isLoading && !teacherSubmissionsQuery.isError ? (
                <Text style={[styles.teacherTasksEmpty, { color: colors.mutedForeground, writingDirection: direction }]}>
                  {t('لا توجد حلول جديدة للمراجعة الآن', 'No new submissions to review right now')}
                </Text>
              ) : null}
            </View>
         ) : (
           <View style={styles.todayTasks}>
              {todayTasks.slice(0, 4).map((task) => <TodayTaskRow key={task.id} {...task} />)}
              {!todayTasks.length && !studentDashboardQuery.isLoading && !assignmentsQuery.isLoading && !unreadChatQuery.isLoading && !unreadChatQuery.isError ? (
               <View style={[styles.todayEmpty, { backgroundColor: colors.tealSoft }]}>
                 <View style={[styles.todayEmptyIcon, { backgroundColor: colors.card }]}><Icon name="check-circle" size={16} color={colors.teal} /></View>
                  <Text style={[styles.todayEmptyText, { color: colors.accentForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('لا توجد مهام معلقة الآن', 'Nothing is waiting for you right now')}</Text>
               </View>
             ) : null}
           </View>
         )}
      </View>

       {!isTeacher && studentDashboard ? (
         <Pressable onPress={() => router.push('/subscription')} style={({ pressed }) => [styles.balanceCard, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed]}>
           <View style={[styles.balanceIcon, { backgroundColor: colors.teal }]}><Icon name="clock" size={18} color={colors.primaryForeground} /></View>
           <View style={[styles.balanceCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <View style={styles.balanceTopline}>
                <Text style={[styles.balanceLabel, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('رصيدك التعليمي', 'Learning balance')}</Text>
                <View style={[styles.balanceBadge, { backgroundColor: colors.primaryForeground }]}>
                  <View style={[styles.balanceBadgeDot, { backgroundColor: colors.teal }]} />
                  <Text style={[styles.balanceBadgeText, { color: colors.primary }]}>{studentDashboard.balance ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}</Text>
                </View>
              </View>
              <Text style={[styles.balanceValue, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{studentDashboard.balance ? `${formatNumber(studentDashboard.balance.remainingMinutes)} ${t('دقيقة متاحة', 'minutes available')}` : t('لا يوجد اشتراك نشط', 'No active plan')}</Text>
              <Text style={[styles.balanceMeta, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{studentDashboard.balance ? `${formatNumber(studentDashboard.balance.sessionsRemaining)} ${t('جلسة متبقية', 'sessions left')}${studentDashboard.balance.planName ? ` · ${studentDashboard.balance.planName}` : ''}` : t('استعرض الباقات المتاحة', 'View available plans')}</Text>
           </View>
           <View style={styles.balanceArrow}><Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={17} color={colors.tint} /></View>
        </Pressable>
      ) : null}

       {isTeacher ? (
          <View style={[styles.earningsCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <View style={[styles.earningsTopRow, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
              <View style={[styles.earningsIcon, { backgroundColor: colors.accent }]}><Icon name="trending-up" size={21} color={colors.accentForeground} /></View>
              <View style={[styles.earningsCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
               <Text style={[styles.earningsLabel, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('أرباح هذا الشهر', 'This month’s earnings')}</Text>
                <View style={[styles.earningsValueRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                 <Text style={[styles.earningsValue, { color: colors.primaryForeground, writingDirection: direction }]}>
                   {teacherNetSummaryQuery.isLoading
                     ? '…'
                     : teacherNetSummaryQuery.isError || teacherNetSummaryQuery.data === undefined
                       ? '—'
                       : formatNumber(teacherNetSummaryQuery.data)}
                 </Text>
                 <Text style={[styles.earningsCurrency, { color: colors.tint, writingDirection: direction }]}>{t('ر.س', 'SAR')}</Text>
                </View>
                {teacherNetSummaryQuery.isError ? <Text style={[styles.earningsError, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('تعذر تحميل الأرباح من المنصة', 'Could not load earnings from the platform')}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('سحب الأرباح', 'Withdraw earnings')} onPress={() => router.push('/teacher-withdrawals')} style={({ pressed }) => [styles.earningsAction, { backgroundColor: colors.primaryForeground }, pressed && styles.pressed]}>
                <Text style={[styles.earningsActionText, { color: colors.primary, writingDirection: direction }]}>{t('سحب الأرباح', 'Withdraw earnings')}</Text>
                <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={15} color={colors.primary} />
              </Pressable>
            </View>
            <View style={[styles.withdrawableRow, { flexDirection: isRTL ? 'row' : 'row-reverse', borderTopColor: colors.tint }]}>
              <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                <Text style={[styles.withdrawableLabel, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('الأرباح القابلة للسحب', 'Available to withdraw')}</Text>
                <Text style={[styles.withdrawableHint, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
                  {teacherAvailableBalanceQuery.isError
                    ? t('تعذر تحميل الرصيد', 'Could not load balance')
                    : t('الرصيد المتاح الآن', 'Available now')}
                </Text>
              </View>
              <View style={[styles.withdrawableValueRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={[styles.withdrawableValue, { color: colors.primaryForeground, writingDirection: direction }]}>
                  {teacherAvailableBalanceQuery.isLoading
                    ? '…'
                    : teacherAvailableBalanceQuery.isError || teacherAvailableBalanceQuery.data === undefined
                      ? '—'
                      : formatNumber(teacherAvailableBalanceQuery.data)}
                </Text>
                <Text style={[styles.withdrawableCurrency, { color: colors.tint, writingDirection: direction }]}>{t('ر.س', 'SAR')}</Text>
              </View>
            </View>
        </View>
      ) : null}

       {isTeacher ? <>
         <SectionHeading title={t('أقرب جلساتك', 'Upcoming sessions')} action={t('عرض الكل', 'View all')} onAction={() => router.push('/bookings')} />
         {firstSession ? <SessionCard session={firstSession} role={role} onPress={() => router.push('/bookings')} onJoin={() => router.push({ pathname: '/live-session', params: { booking: firstSession.id } })} /> : <EmptyState icon="calendar" title={t('لا توجد جلسات قادمة', 'No upcoming sessions')} body={t('ستظهر حجوزاتك هنا بعد مزامنتها مع المنصة.', 'Your bookings will appear here after syncing with the platform.')} action={t('عرض الجلسات', 'View sessions')} onAction={() => router.push('/bookings')} />}
         <View style={styles.teacherSummary}>
         <SectionHeading title={t('تنبيهات المعلّم', 'Teacher alerts')} action={t('كل التنبيهات', 'All alerts')} onAction={() => router.push('/notifications')} />
         {teacherDashboard?.warningCount ? <SummaryRow icon="alert-circle" title={t('تحتاج إلى مراجعة التحذيرات', 'Warnings need review')} body={`${formatNumber(teacherDashboard.warningCount)} ${t('تنبيه مرتبط بحسابك', 'alert linked to your account')}`} onPress={() => router.push('/profile')} /> : null}
         {teacherDashboard?.unreadNotifications ? <SummaryRow icon="bell" title={t('لديك تنبيهات جديدة', 'You have new alerts')} body={`${formatNumber(teacherDashboard.unreadNotifications)} ${t('تنبيه غير مقروء', 'unread alert')}`} onPress={() => router.push('/notifications')} /> : null}
         {!teacherDashboard?.warningCount && !teacherDashboard?.unreadNotifications ? <EmptyState icon="check-circle" title={t('لا توجد تنبيهات جديدة', 'No new alerts')} body={t('كل شيء محدث في لوحة المعلّم.', 'Everything is up to date on your dashboard.')} action={t('فتح التنبيهات', 'Open alerts')} onAction={() => router.push('/notifications')} /> : null}
         </View>
       </> : null}

      <Pressable testID="quick-help" onPress={() => router.push('/support')} style={({ pressed }) => [styles.helpStrip, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}>
        <View style={[styles.helpIcon, { backgroundColor: colors.teal }]}><Icon name="help-circle" size={17} color={colors.primaryForeground} /></View>
         <View style={[styles.helpCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.helpTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('تحتاج إلى مساعدة؟', 'Need help?')}</Text><Text style={[styles.helpBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('نحن هنا لنرافقك في كل خطوة', 'We are here to support you every step of the way')}</Text></View>
         <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={17} color={colors.teal} />
      </Pressable>
    </Screen>
  );
}

function Metric({ value, label, icon, color }: { value: string; label: string; icon: 'trending-up' | 'users' | 'activity' | 'check-circle' | 'star'; color: string }) {
  const colors = useColors();
  const metricBackground = color === colors.primary ? colors.navySoft : color === colors.accent ? colors.goldSoft : colors.tealSoft;
  return (
    <View style={[styles.metric, { backgroundColor: metricBackground }]}>
      <View style={[styles.metricIcon, { backgroundColor: colors.card }]}><Icon name={icon} size={12} color={color} /></View>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function TodayTaskRow({ icon, tone, title, body, onPress }: Omit<TodayTask, 'id'>) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const iconColor = tone === 'gold' ? colors.accentForeground : tone === 'teal' ? colors.teal : colors.primary;
  const iconBackground = tone === 'gold' ? colors.goldSoft : tone === 'teal' ? colors.tealSoft : colors.navySoft;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.todayTask, { backgroundColor: colors.background }, pressed && styles.pressed]}>
      <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={14} color={colors.mutedForeground} />
      <View style={[styles.todayTaskCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text numberOfLines={1} style={[styles.todayTaskTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.todayTaskBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{body}</Text>
      </View>
      <View style={[styles.todayTaskIcon, { backgroundColor: iconBackground }]}><Icon name={icon} size={15} color={iconColor} /></View>
    </Pressable>
  );
}

function SummaryRow({ icon, title, body, onPress }: { icon: 'alert-circle' | 'bell'; title: string; body: string; onPress: () => void }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.summaryRow, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
       <Icon name={isRTL ? "arrow-left" : "arrow-right"} size={15} color={colors.mutedForeground} />
       <View style={[styles.summaryCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.summaryTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text><Text style={[styles.summaryBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{body}</Text></View>
      <View style={[styles.summaryIcon, { backgroundColor: colors.tealSoft }]}><Icon name={icon} size={16} color={colors.teal} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  todayPanel: { borderRadius: 22, borderWidth: 1, padding: 12, marginBottom: 18 },
  profileNotice: { minHeight: 68, borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  degradedNotice: { minHeight: 68, borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  balanceCard: { minHeight: 86, borderRadius: 20, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  todayHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 9, borderBottomWidth: 1 },
  todayHeaderCopy: { alignItems: 'flex-end' },
  todayEyebrow: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  todayTitle: { fontSize: 18, lineHeight: 25, fontFamily: 'Inter_700Bold', marginTop: 3, writingDirection: 'rtl' },
  todaySignal: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  todaySignalText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  metrics: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  teacherQuickOverview: { gap: 10 },
  teacherTasksEmpty: { paddingHorizontal: 5, fontSize: 10, lineHeight: 16, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  metric: { flex: 1, minHeight: 78, borderRadius: 15, paddingVertical: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  metricIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  metricValue: { fontSize: 19, lineHeight: 24, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 10, lineHeight: 14, marginTop: 4, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  todayTasks: { gap: 7 },
  todayTask: { minHeight: 48, borderRadius: 13, paddingVertical: 8, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayTaskCopy: { flex: 1, minWidth: 0 },
  todayTaskTitle: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_700Bold' },
  todayTaskBody: { fontSize: 9, lineHeight: 13, marginTop: 1, fontFamily: 'Inter_400Regular' },
  todayTaskIcon: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  todayEmpty: { minHeight: 48, borderRadius: 13, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayEmptyIcon: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  todayEmptyText: { flex: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  helpStrip: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  refreshingNotice: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 },
  refreshingText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  helpIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  helpCopy: { flex: 1, marginHorizontal: 10, alignItems: 'flex-end' },
  helpTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  helpBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2, writingDirection: 'rtl' },
  requestNotice: { minHeight: 68, borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  requestBadge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  requestBadgeText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  requestCopy: { flex: 1, alignItems: 'flex-end' },
  requestTitle: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  requestBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  earningsCard: { minHeight: 158, borderRadius: 22, borderWidth: 1, padding: 14, flexDirection: 'column', justifyContent: 'center', gap: 9, marginBottom: 24 },
  balanceIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  balanceCopy: { flex: 1, minWidth: 0 },
  balanceTopline: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  balanceLabel: { flex: 1, fontSize: 10, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  balanceValue: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 4, writingDirection: 'rtl' },
  balanceMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  balanceBadge: { minHeight: 22, borderRadius: 8, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  balanceBadgeText: { fontSize: 8, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  balanceArrow: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  earningsIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  earningsTopRow: { minHeight: 52, alignItems: 'center', gap: 10 },
  earningsCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  earningsLabel: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  earningsValueRow: { alignItems: 'baseline', gap: 7, marginTop: 2 },
  earningsValue: { fontSize: 28, lineHeight: 35, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  earningsCurrency: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  earningsError: { fontSize: 9, lineHeight: 13, marginTop: 2, fontFamily: 'Inter_500Medium' },
  withdrawableRow: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  withdrawableLabel: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  withdrawableHint: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_500Medium', marginTop: 1, writingDirection: 'rtl' },
  withdrawableValueRow: { alignItems: 'baseline', gap: 5 },
  withdrawableValue: { fontSize: 18, lineHeight: 23, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  withdrawableCurrency: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  earningsAction: { minHeight: 48, minWidth: 116, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  earningsActionText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  teacherSummary: { marginTop: 4 },
  summaryRow: { minHeight: 62, borderRadius: 16, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  summaryCopy: { flex: 1, alignItems: 'flex-end' },
  summaryTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  summaryBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  summaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});