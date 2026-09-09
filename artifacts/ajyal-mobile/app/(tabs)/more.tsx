import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useAiTutorAccess } from '@/hooks/useAiTutorAccess';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { Header, Icon, Screen, SectionHeading } from '@/components/AjyalUI';

type MenuItem = {
  icon: 'search' | 'zap' | 'message-circle' | 'book-open' | 'users' | 'briefcase' | 'credit-card' | 'help-circle' | 'settings' | 'calendar' | 'clipboard' | 'bell' | 'user' | 'star' | 'file-text' | 'award' | 'dollar-sign' | 'phone' | 'camera';
  title: string;
  body: string;
  route?: string;
  tone: 'navy' | 'teal' | 'gold';
};

const commonItems: MenuItem[] = [
  { icon: 'star', title: 'التقييمات', body: 'شارك رأيك وراجع ملاحظات الجلسات', route: '/rating', tone: 'gold' },
  { icon: 'bell', title: 'التنبيهات', body: 'كل جديد من المنصة في مكان واحد', route: '/notifications', tone: 'gold' },
  { icon: 'message-circle', title: 'تواصل مع الفريق', body: 'الدعم الفني والتذاكر', route: '/support', tone: 'navy' },
  { icon: 'settings', title: 'إعدادات التطبيق', body: 'اللغة والمظهر والوضع الليلي', route: '/settings', tone: 'navy' },
];

const studentItems: MenuItem[] = [
  { icon: 'credit-card', title: 'رصيد الباقة', body: 'تفاصيل الباقة والاستهلاك الفعلي', route: '/subscription', tone: 'teal' },
  { icon: 'help-circle', title: 'مركز المساعدة', body: 'المساعد الذكي والإرشاد أثناء التعلم', route: '/smart-teacher', tone: 'teal' },
  { icon: 'camera', title: 'مساعد الواجبات البصري', body: 'صوّر واجبك واحصل على شرح خطوة بخطوة', route: '/homework-solver', tone: 'teal' },
  { icon: 'book-open', title: 'المواد التعليمية', body: 'شاهد تسجيلات الجلسات والمواد المرتبطة بها', route: '/materials', tone: 'navy' },
  { icon: 'file-text', title: 'الفواتير', body: 'راجع سجل عمليات الدفع', route: '/invoices', tone: 'gold' },
];

const teacherItems: MenuItem[] = [
  { icon: 'book-open', title: 'المواد التعليمية', body: 'راجع تسجيلات الجلسات المرتبطة بطلابك', route: '/teacher-materials', tone: 'navy' },
  { icon: 'dollar-sign', title: 'سحب الأرباح', body: 'الرصيد المتاح وطلبات السحب السابقة', route: '/teacher-withdrawals', tone: 'teal' },
  { icon: 'phone', title: 'محفظة الاتصال', body: 'شحن الرصيد وسجل المكالمات الهاتفية', route: '/call-wallet', tone: 'navy' },
];

const menuTranslations: Record<string, string> = {
  'التقييمات': 'Ratings',
  'شارك رأيك وراجع ملاحظات الجلسات': 'Share feedback and review session notes',
  'التنبيهات': 'Notifications',
  'كل جديد من المنصة في مكان واحد': 'Everything new from the platform in one place',
  'مركز المساعدة': 'Help center',
  'المساعد الذكي والإرشاد أثناء التعلم': 'AI assistant and learning guidance',
  'تواصل مع الفريق': 'Contact the team',
  'الدعم الفني والتذاكر': 'Technical support and tickets',
  'إعدادات التطبيق': 'App settings',
  'اللغة والمظهر والوضع الليلي': 'Language, appearance, and dark mode',
  'رصيد الباقة': 'Plan balance',
  'تفاصيل الباقة والاستهلاك الفعلي': 'Plan details and actual usage',
  'المدرس المساعد AI': 'AI tutor',
  'اسأل المدرس الذكي المرتبط بحسابك': 'Ask the smart tutor linked to your account',
  'مساعد الواجبات البصري': 'Visual homework helper',
  'صوّر واجبك واحصل على شرح خطوة بخطوة': 'Take a photo of your homework and get a step-by-step explanation',
  'المواد التعليمية': 'Learning materials',
  'شاهد تسجيلات الجلسات والمواد المرتبطة بها': 'Watch session recordings and related materials',
  'راجع تسجيلات الجلسات المرتبطة بطلابك': 'Review session recordings linked to your students',
  'الفواتير': 'Invoices',
  'راجع سجل عمليات الدفع': 'Review your payment history',
  'سحب الأرباح': 'Withdraw earnings',
  'الرصيد المتاح وطلبات السحب السابقة': 'Available balance and past withdrawal requests',
  'محفظة الاتصال': 'Call wallet',
  'شحن الرصيد وسجل المكالمات الهاتفية': 'Top up your balance and review phone calls',
};

export default function MoreScreen() {
  const colors = useColors();
  const { role, profile } = useAjyal();
  const { hasAccess: hasAiTutorAccess } = useAiTutorAccess(role === 'student');
  const { t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const items = role === 'student'
    ? studentItems.filter((item) => !['/smart-teacher', '/homework-solver'].includes(item.route ?? '') || hasAiTutorAccess)
    : teacherItems;

  const openItem = (item: MenuItem) => {
    if (item.route) {
      router.push(item.route as never);
    }
  };

  return (
    <Screen>
      <Header
        eyebrow={t('كل أدوات أجيال المعرفة', 'All Ajyal Knowledge tools')}
        title={t('المزيد', 'More')}
        avatarText={profile?.displayName?.slice(0, 1)}
        onBell={() => router.push('/notifications')}
        onAvatar={() => router.push('/profile')}
      />

      <View style={[styles.intro, { backgroundColor: colors.primary }]}>
        <View style={[styles.introMark, { backgroundColor: colors.teal }]} />
        <Text style={[styles.introEyebrow, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('مساحة', 'Your')} {role === 'student' ? t('الطالب', 'student') : t('المعلم', 'teacher')}</Text>
        <Text style={[styles.introTitle, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('كل أقسام المنصة،\nفي تجربة واحدة.', 'Everything in one\nsimple experience.')}</Text>
        <Text style={[styles.introBody, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('تنقل واضح يحافظ على هوية المنصة ويضع أهم أدواتك بالقرب منك.', 'Clear navigation keeps your most important tools close.')}</Text>
      </View>

      {role === 'student' && items.length ? (
        <>
          <SectionHeading title={t('تجربة الطالب', 'Student tools')} />
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {items.map((item, index) => (
              <React.Fragment key={item.title}>
                <MenuRow item={item} onPress={() => openItem(item)} />
                {index < items.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              </React.Fragment>
            ))}
          </View>
        </>
      ) : null}

      <SectionHeading title={t('أقسام إضافية', 'More sections')} />
      <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {commonItems.map((item, index) => (
          <React.Fragment key={item.title}>
            <MenuRow item={item} onPress={() => openItem(item)} />
            {index < commonItems.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          </React.Fragment>
        ))}
      </View>

      {role !== 'student' && items.length ? (
        <>
          <SectionHeading title={t('أدوات المعلم', 'Teacher tools')} />
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {items.map((item, index) => (
              <React.Fragment key={item.title}>
                <MenuRow item={item} onPress={() => openItem(item)} />
                {index < items.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              </React.Fragment>
            ))}
          </View>
        </>
      ) : null}

      <Pressable testID="support-link" onPress={() => router.push('/support')} style={({ pressed }) => [styles.support, { backgroundColor: colors.tealSoft, borderColor: colors.border }, pressed && styles.pressed]}>
        <View style={[styles.supportIcon, { backgroundColor: colors.teal }]}><Icon name="message-circle" size={18} color={colors.primaryForeground} /></View>
        <View style={styles.supportCopy}><Text style={[styles.supportTitle, { color: colors.foreground }]}>{t('تواصل مع الفريق', 'Contact the team')}</Text><Text style={[styles.supportBody, { color: colors.mutedForeground }]}>{t('الدعم الفني والتذاكر', 'Technical support and tickets')}</Text></View>
        <Icon name="arrow-left" size={17} color={colors.teal} />
      </Pressable>
    </Screen>
  );
}

function MenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const tone = item.tone === 'navy' ? colors.primary : item.tone === 'gold' ? colors.accentForeground : colors.teal;
  const background = item.tone === 'navy' ? colors.navySoft : item.tone === 'gold' ? colors.goldSoft : colors.tealSoft;
  return (
    <Pressable testID={`menu-${item.title}`} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={15} color={colors.mutedForeground} />
      <View style={[styles.menuCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={[styles.menuTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t(item.title, menuTranslations[item.title] ?? item.title)}</Text><Text style={[styles.menuBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t(item.body, menuTranslations[item.body] ?? item.body)}</Text></View>
      <View style={[styles.menuIcon, { backgroundColor: background }]}><Icon name={item.icon} size={17} color={tone} /></View>
    </Pressable>
  );
}

function GridItem({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const tone = item.tone === 'navy' ? colors.primary : item.tone === 'gold' ? colors.accentForeground : colors.teal;
  const background = item.tone === 'navy' ? colors.navySoft : item.tone === 'gold' ? colors.goldSoft : colors.tealSoft;
  return (
    <Pressable testID={`grid-${item.title}`} onPress={onPress} style={({ pressed }) => [styles.gridItem, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
      <View style={[styles.gridIcon, { backgroundColor: background }]}><Icon name={item.icon} size={19} color={tone} /></View>
      <Text style={[styles.gridTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t(item.title, menuTranslations[item.title] ?? item.title)}</Text>
      <Text style={[styles.gridBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>{t(item.body, menuTranslations[item.body] ?? item.body)}</Text>
      <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={14} color={colors.mutedForeground} style={[styles.gridArrow, isRTL ? { left: 13 } : { right: 13 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { borderRadius: 22, padding: 20, minHeight: 172, overflow: 'hidden', marginBottom: 25 },
  introMark: { width: 44, height: 3, borderRadius: 2, marginBottom: 17, alignSelf: 'flex-start' },
  introEyebrow: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl' },
  introTitle: { fontSize: 25, lineHeight: 32, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginTop: 9 },
  introBody: { fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 8 },
  menu: { borderWidth: 1, borderRadius: 19, paddingHorizontal: 14, marginBottom: 25 },
  menuRow: { minHeight: 75, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuCopy: { flex: 1, alignItems: 'flex-end' },
  menuTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  menuBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4, writingDirection: 'rtl' },
  menuIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  gridItem: { width: '48%', minHeight: 142, borderWidth: 1, borderRadius: 18, padding: 13, alignItems: 'flex-end' },
  gridIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', marginBottom: 13 },
  gridTitle: { width: '100%', fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  gridBody: { width: '100%', fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 5 },
  gridArrow: { position: 'absolute', bottom: 13, left: 13 },
  support: { minHeight: 67, borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  supportIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  supportCopy: { flex: 1, alignItems: 'flex-end' },
  supportTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  supportBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  pressed: { opacity: 0.72 },
});