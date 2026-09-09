import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { getReadChatMessageIds, subscribeToChatReadState } from '@/lib/localChatReadState';

type BrandIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function TabLayout() {
  const { t } = useAppPreferences();
  return (
    <Tabs
      tabBar={(props) => <AjyalTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: t('حسابي', 'Profile'),
        }}
      />
      <Tabs.Screen name="messages" options={{ title: t('الرسائل', 'Messages') }} />
      <Tabs.Screen name="index" options={{ title: t('الرئيسية', 'Home') }} />
      <Tabs.Screen name="bookings" options={{ title: t('الحجوزات', 'Bookings') }} />
      <Tabs.Screen name="more" options={{ title: t('المزيد', 'More') }} />
      <Tabs.Screen name="assignments" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const visibleTabs: Array<{ name: string; label: string; icon: BrandIconName; center?: boolean }> = [
  { name: 'profile', label: 'حسابي', icon: 'account-circle-outline' },
  { name: 'messages', label: 'الرسائل', icon: 'message-text-outline' },
  { name: 'index', label: 'الرئيسية', icon: 'home-variant', center: true },
  { name: 'bookings', label: 'الحجوزات', icon: 'calendar-month-outline' },
  { name: 'more', label: 'المزيد', icon: 'view-grid-outline' },
];

function AjyalTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const { isDark, t, direction, formatNumber } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const unreadMessages = useUnreadMessageCount();
  const routes = visibleTabs
    .map((tab) => ({ tab, route: state.routes.find((item) => item.name === tab.name) }))
    .filter((item): item is { tab: (typeof visibleTabs)[number]; route: (typeof state.routes)[number] } => Boolean(item.route));

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: isWeb ? 84 : 76 + insets.bottom,
          paddingBottom: isWeb ? 34 : insets.bottom,
          borderTopColor: colors.border,
          backgroundColor: isIOS ? 'transparent' : colors.card,
        },
      ]}
    >
      {isIOS ? <BlurView intensity={100} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
      <View style={[styles.tabRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
        {routes.map(({ tab, route }) => {
          const focused = state.index === state.routes.findIndex((item) => item.key === route.key);
          const color = focused ? colors.teal : colors.mutedForeground;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
           const accessibilityLabel = descriptors[route.key]?.options.tabBarAccessibilityLabel ?? t(tab.label, ({
             'حسابي': 'Profile',
             'الرسائل': 'Messages',
             'الرئيسية': 'Home',
             'الحجوزات': 'Bookings',
             'المزيد': 'More',
           } as Record<string, string>)[tab.label] ?? tab.label);
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={accessibilityLabel}
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              style={({ pressed }) => [styles.tabItem, tab.center && styles.centerTabItem, pressed && styles.pressed]}
            >
              {tab.center ? (
                <View style={[styles.centerTabCircle, { backgroundColor: colors.primary, borderColor: colors.background }]}>
                  <MaterialCommunityIcons name={tab.icon} size={27} color={colors.primaryForeground} />
                </View>
              ) : (
                <View style={[styles.iconWrap, { backgroundColor: focused ? colors.tealSoft : 'transparent' }]}>
                  <MaterialCommunityIcons name={tab.icon} size={22} color={color} />
                  {tab.name === 'messages' && unreadMessages > 0 ? (
                    <View style={[styles.unreadBadge, { backgroundColor: colors.accent, borderColor: colors.card }]}>
                       <Text style={[styles.unreadBadgeText, { color: colors.primary }]}>{unreadMessages > 9 ? `${formatNumber(9)}+` : formatNumber(unreadMessages)}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <Text style={[styles.tabLabel, { color, writingDirection: direction }]}>{t(tab.label, ({
                'حسابي': 'Profile',
                'الرسائل': 'Messages',
                'الرئيسية': 'Home',
                'الحجوزات': 'Bookings',
                'المزيد': 'More',
              } as Record<string, string>)[tab.label] ?? tab.label)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useUnreadMessageCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!supabase || !user) {
      setCount(0);
      return;
    }
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('MESSAGES_BADGE_TIMEOUT')), 12_000);
      });
      const loadData = (async () => {
        const bookingsResult = await supabase
          .from('bookings')
          .select('id')
          .or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`);
        if (bookingsResult.error) throw bookingsResult.error;
        if (!bookingsResult.data?.length) return 0;

        const bookingIds = bookingsResult.data.map((row) => String(row.id));
        const [readMessageIds, messagesResult] = await Promise.all([
          getReadChatMessageIds(user.id),
          supabase
            .from('chat_messages')
            .select('id,sender_id')
            .in('booking_id', bookingIds)
            .neq('sender_id', user.id),
        ]);
        if (messagesResult.error) throw messagesResult.error;
        return (messagesResult.data ?? []).filter((message) => !readMessageIds.has(String(message.id))).length;
      })();
      const unreadCount = await Promise.race([loadData, timeout]);
      if (requestId === requestRef.current) setCount(unreadCount);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      console.warn(
        '[messages badge] load failed:',
        error instanceof Error ? error.message : error,
      );
      setCount(0);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const client = supabase;
    if (!client || !user) return undefined;
    const channel = client
      .channel(`mobile-unread-messages-${user.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => void load())
      .subscribe();
    const unsubscribeReadState = subscribeToChatReadState((changedUserId) => {
      if (changedUserId === user.id) void load();
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      unsubscribeReadState();
      appStateSubscription.remove();
      void client.removeChannel(channel);
    };
  }, [load, user]);

  return count;
}

const styles = StyleSheet.create({
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, elevation: 8, overflow: 'visible', shadowColor: '#082A50', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
  tabRow: { flex: 1, flexDirection: 'row-reverse', alignItems: 'stretch', justifyContent: 'space-around', paddingHorizontal: 8 },
  tabItem: { flex: 1, height: '100%', minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative', paddingTop: 7 },
  centerTabItem: { justifyContent: 'flex-start', paddingTop: 0, marginTop: -14, gap: 4 },
  iconWrap: { width: 40, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  centerTabCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 5, shadowColor: '#082A50', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  tabLabel: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_600SemiBold' },
  unreadBadge: { minWidth: 17, height: 17, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -6, right: -9, zIndex: 20, elevation: 20 },
  unreadBadgeText: { fontSize: 8, lineHeight: 11, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.72 },
});
