import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Header, Icon, Screen, SectionHeading } from '@/components/AjyalUI';
import { useColors } from '@/hooks/useColors';
import { useAppPreferences, type AppLanguage, type ThemeMode } from '@/contexts/AppPreferencesContext';

const languageOptions: Array<{ value: AppLanguage; label: string; description: string }> = [
  { value: 'ar', label: 'العربية', description: 'واجهة عربية واتجاه من اليمين إلى اليسار' },
  { value: 'en', label: 'English', description: 'English interface and left-to-right layout' },
];

const themeOptions: Array<{ value: ThemeMode; label: string; description: string; icon: 'sun' | 'moon' | 'smartphone' }> = [
  { value: 'system', label: 'حسب الجهاز', description: 'يتبع إعداد مظهر الهاتف', icon: 'smartphone' },
  { value: 'light', label: 'الوضع النهاري', description: 'ألوان فاتحة دائماً', icon: 'sun' },
  { value: 'dark', label: 'الوضع الليلي', description: 'ألوان داكنة مريحة للعين', icon: 'moon' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const { language, themeMode, setLanguage, setThemeMode, t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';

  return (
    <Screen>
      <Header
        onBack={() => router.back()}
        eyebrow={t('تخصيص التطبيق', 'App preferences')}
        title={t('الإعدادات', 'Settings')}
      />

      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="sliders" size={22} color={colors.teal} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('اجعل أجيال المعرفة مناسبة لك', 'Make Ajyal Knowledge feel like yours')}
        </Text>
        <Text style={[styles.heroBody, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('احفظ اللغة والمظهر على هذا الجهاز، ويمكنك تغييرهما في أي وقت.', 'Your language and appearance are saved on this device and can be changed anytime.')}
        </Text>
      </View>

      <SectionHeading title={t('لغة التطبيق', 'App language')} />
      <View style={[styles.optionGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {languageOptions.map((option) => (
          <OptionRow
            key={option.value}
            selected={language === option.value}
            label={option.label}
            description={option.description}
            onPress={() => void setLanguage(option.value)}
             colors={colors}
             direction={direction}
          />
        ))}
      </View>

      <SectionHeading title={t('المظهر', 'Appearance')} />
      <View style={[styles.optionGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {themeOptions.map((option) => (
          <OptionRow
            key={option.value}
            selected={themeMode === option.value}
            label={t(option.label, option.value === 'system' ? 'System default' : option.value === 'light' ? 'Light mode' : 'Dark mode')}
            description={t(option.description, option.value === 'system' ? 'Follow your device setting' : option.value === 'light' ? 'Always use light colors' : 'Comfortable dark colors')}
            icon={option.icon}
            onPress={() => void setThemeMode(option.value)}
             colors={colors}
             direction={direction}
          />
        ))}
      </View>

      <View style={[styles.note, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}>
        <Icon name="info" size={17} color={colors.teal} />
        <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
          {t('سيتم تطبيق الوضع الليلي مباشرة على جميع شاشات التطبيق. بعض النصوص ستظهر باللغة الجديدة تدريجياً مع تحديث الشاشات.', 'Dark mode applies immediately across the app. Translated labels will expand across screens as they are updated.')}
        </Text>
      </View>
    </Screen>
  );
}

function OptionRow({
  selected,
  label,
  description,
  icon,
  onPress,
  colors,
  direction,
}: {
  selected: boolean;
  label: string;
  description: string;
  icon?: 'sun' | 'moon' | 'smartphone';
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  direction: 'rtl' | 'ltr';
}) {
  const isRTL = direction === 'rtl';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.option, { flexDirection: isRTL ? 'row' : 'row-reverse' }, pressed && styles.pressed]}>
      <View style={[styles.radio, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.teal : 'transparent' }]}>
        {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primaryForeground }]} /> : null}
      </View>
       <View style={[styles.optionCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
         <Text style={[styles.optionLabel, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
         <Text style={[styles.optionDescription, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{description}</Text>
      </View>
      {icon ? <View style={[styles.optionIcon, { backgroundColor: colors.navySoft }]}><Icon name={icon} size={17} color={colors.primary} /></View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, padding: 20, marginBottom: 22, minHeight: 172 },
  heroIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', marginBottom: 17 },
  heroTitle: { fontSize: 20, lineHeight: 28, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  heroBody: { fontSize: 11, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 8 },
  optionGroup: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, marginBottom: 20 },
  option: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11 },
  optionCopy: { flex: 1, alignItems: 'flex-end' },
  optionLabel: { width: '100%', fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  optionDescription: { width: '100%', fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 3 },
  optionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  note: { borderRadius: 15, borderWidth: 1, padding: 14, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 9 },
  noteText: { flex: 1, textAlign: 'right', writingDirection: 'rtl', fontSize: 10, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  pressed: { opacity: 0.72 },
});