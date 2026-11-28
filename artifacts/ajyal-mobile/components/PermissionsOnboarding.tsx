import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useColors } from '@/hooks/useColors';

type Props = { onDone: () => void };

async function openSystemSetting(action: string): Promise<void> {
  try {
    await Linking.sendIntent(action);
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

export default function PermissionsOnboarding({ onDone }: Props) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);

  const refreshNotifications = useCallback(async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      setNotificationsGranted(current.granted);
      setNotificationsBlocked(!current.granted && current.canAskAgain === false);
    } catch {
      // Keep the screen usable if the status cannot be read.
    }
  }, []);

  useEffect(() => {
    void refreshNotifications();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshNotifications();
    });
    return () => subscription.remove();
  }, [refreshNotifications]);

  const askNotifications = useCallback(async () => {
    if (notificationsBlocked) {
      await Linking.openSettings().catch(() => undefined);
      return;
    }
    try {
      const result = await Notifications.requestPermissionsAsync();
      setNotificationsGranted(result.granted);
      setNotificationsBlocked(!result.granted && result.canAskAgain === false);
    } catch {
      await Linking.openSettings().catch(() => undefined);
    }
  }, [notificationsBlocked]);

  const rows: Array<{
    key: string;
    icon: keyof typeof Feather.glyphMap;
    title: string;
    body: string;
    action: string;
    done?: boolean;
    onPress: () => void;
  }> = [
    {
      key: 'notifications',
      icon: 'bell',
      title: t('الإشعارات', 'Notifications'),
      body: t('لتصلك رسائل المعلمين وتنبيهات الحجوزات والمكالمات.', 'To receive messages, booking alerts and calls.'),
      action: notificationsGranted ? t('مفعّلة', 'Enabled') : notificationsBlocked ? t('فتح الإعدادات', 'Open settings') : t('تفعيل الإشعارات', 'Enable notifications'),
      done: notificationsGranted,
      onPress: () => void askNotifications(),
    },
    {
      key: 'calls',
      icon: 'phone-incoming',
      title: t('ظهور المكالمات على الشاشة', 'Calls on your screen'),
      body: t('اسمح بـ"العرض فوق التطبيقات الأخرى" و"الإشعارات بملء الشاشة" ليظهر اتصال المعلم حتى والهاتف مقفول.', 'Allow "Display over other apps" and "Full-screen notifications" so a teacher\'s call shows even when the phone is locked.'),
      action: t('فتح إعدادات المكالمات', 'Open call settings'),
      onPress: () => void openSystemSetting('android.settings.action.MANAGE_OVERLAY_PERMISSION'),
    },
    {
      key: 'battery',
      icon: 'battery-charging',
      title: t('البطارية بلا قيود', 'Unrestricted battery'),
      body: t('اختياري: اسمح للتطبيق بالعمل في الخلفية حتى لا تتأخر المكالمات والإشعارات.', 'Optional: let the app run in the background so calls and alerts are not delayed.'),
      action: t('فتح إعدادات البطارية', 'Open battery settings'),
      onPress: () => void openSystemSetting('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.navySoft }]}>
          <Feather name="shield" size={34} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground, writingDirection: direction }]}>
          {t('جهّز التطبيق للمكالمات والإشعارات', 'Set up calls and notifications')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, writingDirection: direction }]}>
          {t('خطوة واحدة تتم مرة واحدة فقط، ويمكنك تخطيها وتغييرها لاحقاً من إعدادات الهاتف.', 'A one-time step. You can skip it and change it later in phone settings.')}
        </Text>
        {rows.map((row) => (
          <View key={row.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.cardHeader, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
              <View style={[styles.iconWrap, { backgroundColor: row.done ? colors.tealSoft : colors.navySoft }]}>
                <Feather name={row.done ? 'check' : row.icon} size={20} color={row.done ? colors.teal : colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground, writingDirection: direction }]}>{row.title}</Text>
            </View>
            <Text style={[styles.cardBody, { color: colors.mutedForeground, writingDirection: direction }]}>{row.body}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={row.done}
              onPress={row.onPress}
              style={[styles.button, { backgroundColor: row.done ? colors.tealSoft : colors.primary, opacity: row.done ? 0.9 : 1 }]}
            >
              <Text style={[styles.buttonText, { color: row.done ? colors.teal : colors.primaryForeground }]}>{row.action}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={onDone} style={[styles.skip, { borderColor: colors.border }]}>
        <Text style={[styles.skipText, { color: colors.foreground }]}>{t('متابعة', 'Continue')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  content: { paddingBottom: 16, gap: 14 },
  hero: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  cardHeader: { alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  cardBody: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 21 },
  button: { height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  skip: { height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  skipText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
