import React, { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { EmptyState, Header, Icon, Screen, SectionHeading, LoadingBlock } from '@/components/AjyalUI';
import { useListMyNotifications } from '@workspace/api-client-react';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export default function NotificationsScreen() {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const { profile, markAllRead, markRead } = useAjyal();
  const { user } = useAuth();
  const notificationsQuery = useListMyNotifications();
  const notifications = notificationsQuery.data ?? [];
  const unreadCount = useMemo(() => notifications.filter((item) => item.unread).length, [notifications]);

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
      <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={t('كل ما يهمك، في مكان واحد', 'Everything you need in one place')} title={t('التنبيهات', 'Notifications')} unread={unreadCount > 0} onBell={() => undefined} onAvatar={() => router.push('/profile')} />
      {notificationsQuery.isLoading ? <LoadingBlock /> : null}
      <View style={[styles.noticeHero, { backgroundColor: colors.tealSoft }]}>
        <View style={[styles.noticeIcon, { backgroundColor: colors.teal }]}><Icon name={unreadCount ? 'bell' : 'check'} size={19} color={colors.primaryForeground} /></View>
        <View style={[styles.noticeCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.noticeCount, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{unreadCount ? `${formatNumber(unreadCount)} ${t('تنبيهات جديدة', 'new notifications')}` : t('أنت على اطلاع', 'You’re all caught up')}</Text><Text style={[styles.noticeBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{unreadCount ? t('راجع آخر المستجدات قبل بدء يومك.', 'Review the latest updates before you start your day.') : t('لا توجد تنبيهات جديدة في الوقت الحالي.', 'There are no new notifications right now.')}</Text></View>
      </View>
      <SectionHeading title={t('آخر التحديثات', 'Latest updates')} action={unreadCount ? t('تحديد الكل كمقروء', 'Mark all as read') : undefined} onAction={markAllRead} />
      {notificationsQuery.isError ? <EmptyState icon="alert-circle" title={t('تعذر تحميل التنبيهات', 'Could not load notifications')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => void notificationsQuery.refetch()} /> : notifications.length ? notifications.map((item) => {
        const isRead = !item.unread;
        return (
          <Pressable key={item.id} testID={`notification-${item.id}`} onPress={() => markRead(item.id)} style={({ pressed }) => [styles.noticeRow, { backgroundColor: colors.card, borderColor: colors.border }, !isRead && { borderRightColor: colors.teal, borderRightWidth: 3 }, pressed && styles.pressed]}>
            <View style={[styles.rowIcon, { backgroundColor: item.id === 'n2' ? colors.goldSoft : colors.navySoft }]}><Icon name={item.icon as keyof typeof import('@expo/vector-icons').Feather.glyphMap} size={17} color={item.id === 'n2' ? colors.accent : colors.primary} /></View>
             <View style={[styles.rowCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
               <View style={[styles.rowTitleLine, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}><Text style={[styles.rowTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{item.title}</Text>{!isRead ? <View style={[styles.unreadDot, { backgroundColor: colors.teal }]} /> : null}</View>
               <Text style={[styles.rowBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{item.body}</Text>
              <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{item.time}</Text>
            </View>
          </Pressable>
        );
       }) : <EmptyState icon="bell" title={t('لا توجد تنبيهات', 'No notifications')} body={t('ستظهر هنا الإشعارات الجديدة من المنصة.', 'New platform notifications will appear here.')} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeHero: { borderRadius: 21, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 26 },
  noticeIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  noticeCount: { fontSize: 16, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  noticeBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 5, writingDirection: 'rtl' },
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