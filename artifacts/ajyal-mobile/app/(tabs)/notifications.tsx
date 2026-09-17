import React, { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { EmptyState, Header, Icon, Screen, LoadingBlock, type IconName } from '@/components/AjyalUI';
import { getListMyNotificationsQueryKey, useListMyNotifications, type Notification as ApiNotification } from '@workspace/api-client-react';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

const notificationIconNames = new Set<IconName>([
  'bell',
  'calendar',
  'check-circle',
  'check',
  'message-circle',
  'alert-circle',
  'credit-card',
  'star',
  'user',
]);

function safeNotificationIcon(value: string): IconName {
  return notificationIconNames.has(value as IconName)
    ? value as IconName
    : 'bell';
}

type NotificationGroupKey = 'sessions' | 'messages' | 'payments' | 'account' | 'general';

const notificationGroupMeta: Record<NotificationGroupKey, { title: string; englishTitle: string; icon: IconName; tone: 'teal' | 'gold' | 'navy' }> = {
  sessions: { title: 'الجلسات والحجوزات', englishTitle: 'Sessions & bookings', icon: 'calendar', tone: 'teal' },
  messages: { title: 'الرسائل والتواصل', englishTitle: 'Messages & communication', icon: 'message-circle', tone: 'navy' },
  payments: { title: 'الاشتراكات والمدفوعات', englishTitle: 'Subscriptions & payments', icon: 'credit-card', tone: 'gold' },
  account: { title: 'الحساب والتقييمات', englishTitle: 'Account & ratings', icon: 'user', tone: 'navy' },
  general: { title: 'تنبيهات عامة', englishTitle: 'General updates', icon: 'bell', tone: 'gold' },
};

const notificationGroupOrder: NotificationGroupKey[] = ['sessions', 'messages', 'payments', 'account', 'general'];

function getNotificationGroup(item: ApiNotification): NotificationGroupKey {
  switch (safeNotificationIcon(item.icon)) {
    case 'calendar':
    case 'check-circle':
      return 'sessions';
    case 'message-circle':
      return 'messages';
    case 'credit-card':
      return 'payments';
    case 'star':
    case 'user':
      return 'account';
    default:
      return 'general';
  }
}

type NotificationRoute = '/bookings' | '/messages' | '/assignments' | '/support' | '/subscription' | '/invoices' | '/profile' | '/notifications';

function getNotificationRoute(item: ApiNotification): NotificationRoute | null {
  const explicitRoute = item.route;
  if (
    explicitRoute === '/bookings'
    || explicitRoute === '/messages'
    || explicitRoute === '/assignments'
    || explicitRoute === '/support'
    || explicitRoute === '/subscription'
    || explicitRoute === '/invoices'
    || explicitRoute === '/profile'
    || explicitRoute === '/notifications'
  ) {
    return explicitRoute;
  }

  const type = item.type?.toLowerCase();
  if (
    type === 'support_reply'
    || type === 'support_message'
    || type === 'support_ticket'
    || type === 'support_response'
    || type === 'support_ticket_reply'
    || type === 'ticket_reply'
  ) return '/support';
  if (type === 'assignment_submission' || type === 'assignment_graded') return '/assignments';
  if (type === 'chat_message' || type === 'message' || type === 'new_message') return '/messages';
  if (type === 'payment' || type === 'subscription' || type === 'subscription_updated') return '/subscription';
  if (type === 'invoice') return '/invoices';
  if (
    type === 'booking_request'
    || type === 'booking_confirmed'
    || type === 'booking_accepted'
    || type === 'booking_rejected'
    || type === 'booking_cancelled'
    || type === 'session_reminder'
    || type === 'session_starting'
    || type === 'session_started'
    || type === 'session_ended'
    || type === 'instant_session'
    || type === 'first_impression'
    || type === 'expired_no_show'
    || type === 'no_show'
    || type === 'booking_expired'
    || type === 'session_auto_cancelled'
    || type === 'automatic_cancellation'
    || type === 'session_cancelled'
  ) return '/bookings';

  const searchableText = `${item.title} ${item.body}`.toLowerCase();
  if (searchableText.includes('خدمة العملاء') || searchableText.includes('الدعم الفني') || searchableText.includes('support')) {
    return '/support';
  }
  switch (safeNotificationIcon(item.icon)) {
    case 'calendar':
    case 'check-circle':
      return '/bookings';
    case 'message-circle':
      return '/messages';
    case 'credit-card':
      return '/subscription';
    case 'user':
    case 'star':
      return '/profile';
    default:
      return null;
  }
}

export default function NotificationsScreen() {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const { profile, roleResolved, markAllRead, markRead } = useAjyal();
  const { user } = useAuth();
  const notificationsQuery = useListMyNotifications({
    query: { queryKey: getListMyNotificationsQueryKey(), enabled: Boolean(user?.id && roleResolved) },
  });
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = useMemo(() => notifications.filter((item) => item.unread).length, [notifications]);
  const notificationGroups = useMemo(() => {
    const groups = new Map<NotificationGroupKey, ApiNotification[]>();
    notifications.forEach((item) => {
      const key = getNotificationGroup(item);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    });
    return notificationGroupOrder
      .map((key) => ({ key, meta: notificationGroupMeta[key], items: groups.get(key) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [notifications]);
  const openNotification = (item: ApiNotification) => {
    markRead(item.id);
    const destination = getNotificationRoute(item);
    if (destination && destination !== '/notifications') {
      router.push(destination);
    }
  };

  useEffect(() => {
    const client = supabase;
    if (!client || !user?.id) return;
    const channel = client
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { void notificationsQuery.refetch(); },
      )
      .subscribe();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void notificationsQuery.refetch();
    });
    return () => {
      appStateSubscription.remove();
      void client.removeChannel(channel);
    };
  }, [notificationsQuery.refetch, user?.id]);

  return (
    <Screen>
      <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={t('كل ما يهمك، في مكان واحد', 'Everything you need in one place')} title={t('الإشعارات', 'Notifications')} unread={unreadCount > 0} onBell={() => undefined} onAvatar={() => router.push('/profile')} />
      {notificationsQuery.isLoading ? <LoadingBlock /> : null}
      <View style={[styles.noticeHero, { backgroundColor: colors.tealSoft }]}>
        <View style={[styles.noticeIcon, { backgroundColor: colors.teal }]}><Icon name={unreadCount ? 'bell' : 'check'} size={19} color={colors.primaryForeground} /></View>
        <View style={[styles.noticeCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.noticeCount, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{unreadCount ? `${formatNumber(unreadCount)} ${t('تنبيهات جديدة', 'new notifications')}` : t('أنت على اطلاع', 'You’re all caught up')}</Text><Text style={[styles.noticeBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{unreadCount ? t('راجع آخر المستجدات قبل بدء يومك.', 'Review the latest updates before you start your day.') : t('لا توجد تنبيهات جديدة في الوقت الحالي.', 'There are no new notifications right now.')}</Text></View>
      </View>
      {notificationsQuery.isError ? <EmptyState icon="alert-circle" title={t('تعذر تحميل الإشعارات', 'Could not load notifications')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => void notificationsQuery.refetch()} /> : notifications.length ? (
        <View>
          <View style={[styles.listHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.listHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.listHeaderTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('الإشعارات حسب النوع', 'Notifications by type')}</Text>
              <Text style={[styles.listHeaderBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{formatNumber(notifications.length)} {t('إشعارًا في حسابك', 'notifications in your account')}</Text>
            </View>
            {unreadCount ? <Pressable testID="mark-all-notifications-read" onPress={markAllRead} hitSlop={8} style={({ pressed }) => [styles.markAll, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}><Text style={[styles.markAllText, { color: colors.teal, writingDirection: direction }]}>{t('قراءة الكل', 'Mark all read')}</Text></Pressable> : null}
          </View>
          {notificationGroups.map((group) => {
            const tone = group.meta.tone === 'teal' ? colors.teal : group.meta.tone === 'gold' ? colors.accentForeground : colors.primary;
            const background = group.meta.tone === 'teal' ? colors.tealSoft : group.meta.tone === 'gold' ? colors.goldSoft : colors.navySoft;
            return (
              <View key={group.key} style={styles.group}>
                <View style={[styles.groupHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.groupIcon, { backgroundColor: background }]}><Icon name={group.meta.icon} size={15} color={tone} /></View>
                  <View style={[styles.groupHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <Text style={[styles.groupTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t(group.meta.title, group.meta.englishTitle)}</Text>
                    <Text style={[styles.groupCount, { color: colors.mutedForeground, writingDirection: direction }]}>{formatNumber(group.items.length)} {t('إشعارات', 'notifications')}</Text>
                  </View>
                </View>
                {group.items.map((item) => {
                  const isRead = !item.unread;
                  return (
                    <Pressable key={item.id} testID={`notification-${item.id}`} onPress={() => openNotification(item)} accessibilityRole="button" style={({ pressed }) => [styles.noticeRow, { backgroundColor: colors.card, borderColor: colors.border }, !isRead && { borderRightColor: colors.teal, borderRightWidth: 3 }, pressed && styles.pressed]}>
                      <View style={[styles.rowIcon, { backgroundColor: background }]}><Icon name={safeNotificationIcon(item.icon)} size={17} color={tone} /></View>
                      <View style={[styles.rowCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                        <View style={[styles.rowTitleLine, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}><Text style={[styles.rowTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{item.title}</Text>{!isRead ? <View style={[styles.unreadDot, { backgroundColor: colors.teal }]} /> : null}</View>
                        <Text style={[styles.rowBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{item.body}</Text>
                        <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{item.time}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : <EmptyState icon="bell" title={t('لا توجد إشعارات', 'No notifications')} body={t('ستظهر هنا الإشعارات الجديدة من المنصة.', 'New platform notifications will appear here.')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeHero: { borderRadius: 21, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  noticeIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  noticeCount: { fontSize: 16, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  noticeBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 5, writingDirection: 'rtl' },
  listHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 },
  listHeaderCopy: { flex: 1 },
  listHeaderTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  listHeaderBody: { fontSize: 10, marginTop: 3, fontFamily: 'Inter_400Regular' },
  markAll: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  markAllText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  group: { marginBottom: 18 },
  groupHeader: { alignItems: 'center', gap: 9, marginBottom: 9 },
  groupIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  groupHeaderCopy: { flex: 1 },
  groupTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  groupCount: { fontSize: 9, marginTop: 2, fontFamily: 'Inter_400Regular' },
  noticeRow: { minHeight: 103, borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 10 },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, alignItems: 'flex-end' },
  rowTitleLine: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  rowTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  rowBody: { width: '100%', textAlign: 'right', fontSize: 10, lineHeight: 17, marginTop: 5, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  rowTime: { width: '100%', textAlign: 'right', fontSize: 9, marginTop: 7, fontFamily: 'Inter_500Medium' },
  pressed: { opacity: 0.72 },
});