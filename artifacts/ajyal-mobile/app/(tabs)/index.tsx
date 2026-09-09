import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useAiTutorAccess } from '@/hooks/useAiTutorAccess';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { isAssignmentComplete } from '@/constants/localData';
import { AssignmentRow, DashboardActions, EmptyState, Header, Icon, LoadingBlock, Screen, SectionHeading, SessionCard, WelcomeBanner } from '@/components/AjyalUI';
import { getListMyAssignmentsQueryKey, useGetStudentDashboard, useGetTeacherDashboard, useListMyAssignments } from '@workspace/api-client-react';

export default function HomeScreen() {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const { role, profile, isLoading } = useAjyal();
  const { hasAccess: hasAiTutorAccess } = useAiTutorAccess(role === 'student');
  const isTeacher = role === 'teacher';
  const teacherDashboardQuery = useGetTeacherDashboard({ query: { queryKey: ['teacher-dashboard'], enabled: isTeacher } });
  const studentDashboardQuery = useGetStudentDashboard({ query: { queryKey: ['student-dashboard'], enabled: !isTeacher } });
  const assignmentsQuery = useListMyAssignments({ query: { queryKey: getListMyAssignmentsQueryKey(), enabled: !isTeacher } });
  const assignments = assignmentsQuery.data ?? [];
  const pendingAssignments = assignments.filter((assignment) => !isAssignmentComplete(assignment));
  const teacherDashboard = teacherDashboardQuery.data;
  const studentDashboard = studentDashboardQuery.data;
  const dashboardSessions = isTeacher ? (teacherDashboard?.upcomingSessions ?? []) : (studentDashboard?.upcomingSessions ?? []);
  const firstSession = dashboardSessions[0];
  const unread = isTeacher ? (teacherDashboard?.unreadNotifications ?? 0) : (studentDashboard?.unreadNotifications ?? 0);
  const hasError = isTeacher ? teacherDashboardQuery.isError : studentDashboardQuery.isError || assignmentsQuery.isError;
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
      <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={`${t('مرحباً، ', 'Hello, ')}${profile?.displayName ?? ''}`} title={role === 'student' ? t('مساحتك للتعلّم', 'Your learning space') : t('لوحة معلّمك', 'Your teacher dashboard')} unread={unread > 0} onBell={() => router.push('/notifications')} onAvatar={() => router.push('/profile')} />
      <WelcomeBanner role={role} onAction={() => router.push('/bookings')} />
      {isTeacher ? <TeacherIdentityCard profile={profile} approved={teacherDashboard?.teacherApproved ?? profile?.teacherApproved === true} /> : null}
       <DashboardActions role={role} onAction={openDashboardAction} showSmartTeacher={hasAiTutorAccess} />

      {isLoading || (isTeacher ? teacherDashboardQuery.isLoading : studentDashboardQuery.isLoading || assignmentsQuery.isLoading) ? <LoadingBlock /> : null}
      {hasError ? <EmptyState icon="alert-circle" title={t('تعذر تحميل بياناتك', 'Could not load your data')} body={t('تحقق من اتصالك ثم حاول المزامنة مرة أخرى.', 'Check your connection and try syncing again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => { if (isTeacher) void teacherDashboardQuery.refetch(); else { void studentDashboardQuery.refetch(); void assignmentsQuery.refetch(); } }} /> : null}

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
        <View style={styles.todayHeader}>
           <View style={[styles.todaySignal, { backgroundColor: colors.tealSoft }]}><View style={[styles.signalDot, { backgroundColor: colors.teal }]} /><Text style={[styles.todaySignalText, { color: colors.secondaryForeground, writingDirection: direction }]}>{t('محدث الآن', 'Updated now')}</Text></View>
           <View style={[styles.todayHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.todayEyebrow, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('نظرة سريعة', 'Quick overview')}</Text><Text style={[styles.todayTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{role === 'student' ? t('ما ينتظرك اليوم', 'What awaits you today') : t('صورة يومك التعليمية', 'Your teaching day')}</Text></View>
        </View>
        <View style={styles.metrics}>
            <Metric value={role === 'student' ? `${formatNumber(studentDashboard?.stats.progress ?? 0)}%` : formatNumber(teacherDashboard?.stats.students ?? 0)} label={role === 'student' ? t('تقدم الجلسات', 'Session progress') : t('طلاب نشطون', 'Active students')} icon={role === 'student' ? 'trending-up' : 'users'} color={colors.teal} />
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
            <Metric value={role === 'teacher' ? formatNumber(teacherDashboard?.stats.sessions ?? 0) : formatNumber(studentDashboard?.stats.completedSessions ?? 0)} label={role === 'teacher' ? t('إجمالي الجلسات', 'Total sessions') : t('جلسات مكتملة', 'Completed sessions')} icon="activity" color={colors.accent} />
          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
            <Metric value={role === 'teacher' ? `${teacherDashboard?.stats.rating?.toFixed(1) ?? '0.0'}` : formatNumber(studentDashboard?.stats.points ?? 0)} label={role === 'teacher' ? t('التقييم العام', 'Overall rating') : t('النقاط', 'Points')} icon="star" color={colors.primary} />
        </View>
      </View>

      {!isTeacher && studentDashboard?.openBookingRequests ? (
        <Pressable onPress={() => router.push('/bookings')} style={({ pressed }) => [styles.requestNotice, { backgroundColor: colors.goldSoft, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={[styles.requestBadge, { backgroundColor: colors.accent }]}><Text style={[styles.requestBadgeText, { color: colors.primary }]}>{studentDashboard.openBookingRequests}</Text></View>
           <View style={[styles.requestCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.requestTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('طلبات حجز مفتوحة', 'Open booking requests')}</Text><Text style={[styles.requestBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('تابع حالة طلباتك من الحجوزات', 'Track your booking requests')}</Text></View>
          <Icon name="arrow-left" size={17} color={colors.accentForeground} />
        </Pressable>
      ) : null}

      {!isTeacher && studentDashboard ? (
        <Pressable onPress={() => router.push('/subscriptions')} style={({ pressed }) => [styles.balanceCard, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed]}>
          <View style={[styles.earningsIcon, { backgroundColor: colors.teal }]}><Icon name="clock" size={17} color={colors.primaryForeground} /></View>
          <View style={styles.earningsCopy}>
             <Text style={[styles.earningsLabel, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('رصيدك التعليمي', 'Learning balance')}</Text>
             <Text style={[styles.earningsValue, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{studentDashboard.balance ? `${formatNumber(studentDashboard.balance.remainingMinutes)} ${t('دقيقة', 'minutes')}` : t('لا يوجد اشتراك نشط', 'No active plan')}</Text>
             <Text style={[styles.balanceMeta, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{studentDashboard.balance ? `${formatNumber(studentDashboard.balance.sessionsRemaining)} ${t('جلسة متبقية', 'sessions left')}${studentDashboard.balance.planName ? ` · ${studentDashboard.balance.planName}` : ''}` : t('استعرض الباقات المتاحة', 'View available plans')}</Text>
          </View>
          <Icon name="arrow-left" size={17} color={colors.tint} />
        </Pressable>
      ) : null}

      {isTeacher && teacherDashboard && teacherDashboard.openRequests > 0 ? (
        <Pressable onPress={() => router.push('/bookings')} style={({ pressed }) => [styles.requestNotice, { backgroundColor: colors.goldSoft, borderColor: colors.border }, pressed && styles.pressed]}>
          <View style={[styles.requestBadge, { backgroundColor: colors.accent }]}><Text style={[styles.requestBadgeText, { color: colors.primary }]}>{teacherDashboard.openRequests}</Text></View>
           <View style={[styles.requestCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.requestTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('طلبات حجز جديدة', 'New booking requests')}</Text><Text style={[styles.requestBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('راجع الطلبات المفتوحة واتخذ قرارك', 'Review open requests and decide')}</Text></View>
          <Icon name="arrow-left" size={17} color={colors.accentForeground} />
        </Pressable>
      ) : null}

      {isTeacher ? (
        <View style={[styles.earningsCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <View style={[styles.earningsIcon, { backgroundColor: colors.teal }]}><Icon name="trending-up" size={17} color={colors.primaryForeground} /></View>
           <View style={[styles.earningsCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.earningsLabel, { color: colors.tint, writingDirection: direction }]}>{t('أرباح هذا الشهر', 'This month’s earnings')}</Text><Text style={[styles.earningsValue, { color: colors.primaryForeground, writingDirection: direction }]}>{`${formatNumber(teacherDashboard?.stats.earnings ?? 0)} SAR`}</Text></View>
           <Pressable onPress={() => router.push('/wallet')} style={({ pressed }) => [styles.earningsAction, { backgroundColor: colors.tint }, pressed && styles.pressed]}><Text style={[styles.earningsActionText, { color: colors.primary }]}>{t('المحفظة', 'Wallet')}</Text><Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={13} color={colors.primary} /></Pressable>
        </View>
      ) : null}

       <SectionHeading title={role === 'student' ? t('خطوتك التالية', 'Your next step') : t('أقرب جلساتك', 'Upcoming sessions')} action={t('عرض الكل', 'View all')} onAction={() => router.push('/bookings')} />
       {firstSession ? <SessionCard session={firstSession} role={role} onPress={() => router.push('/bookings')} onJoin={() => router.push({ pathname: '/live-session', params: { booking: firstSession.id } })} /> : <EmptyState icon="calendar" title={t('لا توجد جلسات قادمة', 'No upcoming sessions')} body={t('ستظهر حجوزاتك هنا بعد مزامنتها مع المنصة.', 'Your bookings will appear here after syncing with the platform.')} action={t('عرض الجلسات', 'View sessions')} onAction={() => router.push('/bookings')} />}

      {role === 'student' ? <>
         <SectionHeading title={t('ما يحتاج انتباهك', 'Needs your attention')} action={t('كل المهام', 'All tasks')} onAction={() => router.push('/assignments')} />
        {pendingAssignments.slice(0, 2).map((assignment) => <AssignmentRow key={assignment.id} assignment={assignment} completed={false} onPress={() => router.push('/assignments')} />)}
         {!pendingAssignments.length && !assignmentsQuery.isLoading && !assignmentsQuery.isError ? <EmptyState icon="clipboard" title={t('لا توجد مهام الآن', 'No tasks right now')} body={t('كل جديد من المنصة سيظهر هنا.', 'New items from the platform will appear here.')} action={t('فتح المهام', 'Open tasks')} onAction={() => router.push('/assignments')} /> : null}
      </> : <View style={styles.teacherSummary}>
         <SectionHeading title={t('تنبيهات لوحة المعلم', 'Teacher dashboard alerts')} action={t('كل التنبيهات', 'All alerts')} onAction={() => router.push('/notifications')} />
         {teacherDashboard?.warningCount ? <SummaryRow icon="alert-circle" title={t('تحتاج إلى مراجعة التحذيرات', 'Warnings need review')} body={`${formatNumber(teacherDashboard.warningCount)} ${t('تنبيه مرتبط بحسابك', 'alert linked to your account')}`} onPress={() => router.push('/profile')} /> : null}
         {teacherDashboard?.unreadNotifications ? <SummaryRow icon="bell" title={t('لديك تنبيهات جديدة', 'You have new alerts')} body={`${formatNumber(teacherDashboard.unreadNotifications)} ${t('تنبيه غير مقروء', 'unread alert')}`} onPress={() => router.push('/notifications')} /> : null}
         {!teacherDashboard?.warningCount && !teacherDashboard?.unreadNotifications ? <EmptyState icon="check-circle" title={t('لا توجد تنبيهات جديدة', 'No new alerts')} body={t('كل شيء محدث في لوحة المعلم.', 'Everything is up to date on your dashboard.')} action={t('فتح التنبيهات', 'Open alerts')} onAction={() => router.push('/notifications')} /> : null}
      </View>}

      <Pressable testID="quick-help" onPress={() => router.push('/support')} style={({ pressed }) => [styles.helpStrip, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}>
        <View style={[styles.helpIcon, { backgroundColor: colors.teal }]}><Icon name="help-circle" size={17} color={colors.primaryForeground} /></View>
         <View style={[styles.helpCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.helpTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('تحتاج إلى مساعدة؟', 'Need help?')}</Text><Text style={[styles.helpBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('نحن هنا لنرافقك في كل خطوة', 'We are here to support you every step of the way')}</Text></View>
         <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={17} color={colors.teal} />
      </Pressable>
    </Screen>
  );
}

function TeacherIdentityCard({ profile, approved }: { profile: ReturnType<typeof useAjyal>['profile']; approved: boolean }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  return (
    <View style={[styles.teacherIdentity, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.approvalMark, { backgroundColor: approved ? colors.tealSoft : colors.goldSoft }]}>
        <Icon name={approved ? 'check-circle' : 'clock'} size={18} color={approved ? colors.teal : colors.accentForeground} />
      </View>
       <View style={[styles.teacherIdentityCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
         <Text style={[styles.teacherIdentityLabel, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('حساب المعلم', 'Teacher account')}</Text>
         <Text style={[styles.teacherIdentityName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{profile?.displayName ?? t('المعلم', 'Teacher')}</Text>
         <Text style={[styles.teacherIdentityEmail, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{profile?.email ?? t('البريد غير متاح', 'Email unavailable')}</Text>
      </View>
      <View style={[styles.approvalBadge, { backgroundColor: approved ? colors.tealSoft : colors.goldSoft }]}>
         <Text style={[styles.approvalBadgeText, { color: approved ? colors.teal : colors.accentForeground, writingDirection: direction }]}>{approved ? t('معتمد', 'Approved') : t('قيد المراجعة', 'Under review')}</Text>
      </View>
    </View>
  );
}

function Metric({ value, label, icon, color }: { value: string; label: string; icon: 'trending-up' | 'users' | 'activity' | 'check-circle' | 'star'; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: color === colors.primary ? colors.navySoft : color === colors.accent ? colors.goldSoft : colors.tealSoft }]}><Icon name={icon} size={12} color={color} /></View>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
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
  todayPanel: { borderRadius: 21, borderWidth: 1, padding: 15, marginBottom: 28 },
  profileNotice: { minHeight: 68, borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  balanceCard: { minHeight: 86, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  teacherIdentity: { minHeight: 78, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  approvalMark: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  teacherIdentityCopy: { flex: 1, alignItems: 'flex-end' },
  teacherIdentityLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  teacherIdentityName: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 2, writingDirection: 'rtl' },
  teacherIdentityEmail: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 2, writingDirection: 'rtl' },
  approvalBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  approvalBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  todayHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  todayHeaderCopy: { alignItems: 'flex-end' },
  todayEyebrow: { fontSize: 10, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  todayTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginTop: 3, writingDirection: 'rtl' },
  todaySignal: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 9 },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  todaySignalText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  metrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 35 },
  metricIcon: { width: 21, height: 21, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  metricValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 9, marginTop: 3, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  helpStrip: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  helpIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  helpCopy: { flex: 1, marginHorizontal: 10, alignItems: 'flex-end' },
  helpTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  helpBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2, writingDirection: 'rtl' },
  requestNotice: { minHeight: 68, borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  requestBadge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  requestBadgeText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  requestCopy: { flex: 1, alignItems: 'flex-end' },
  requestTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  requestBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  earningsCard: { minHeight: 73, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  earningsIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  earningsCopy: { flex: 1, alignItems: 'flex-end' },
  earningsLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  earningsValue: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 2, writingDirection: 'rtl' },
  balanceMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  earningsAction: { minHeight: 34, borderRadius: 10, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  earningsActionText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  teacherSummary: { marginTop: 4 },
  summaryRow: { minHeight: 62, borderRadius: 16, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  summaryCopy: { flex: 1, alignItems: 'flex-end' },
  summaryTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  summaryBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  summaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});