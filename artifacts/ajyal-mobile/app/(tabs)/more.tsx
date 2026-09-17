import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { Header, Icon, Screen } from '@/components/AjyalUI';

type MenuItem = {
  icon: 'search' | 'zap' | 'message-circle' | 'book-open' | 'users' | 'briefcase' | 'credit-card' | 'help-circle' | 'settings' | 'calendar' | 'clipboard' | 'bell' | 'user' | 'star' | 'file-text' | 'award' | 'dollar-sign' | 'phone' | 'camera';
  title: string;
  body: string;
  route?: string;
  tone: 'navy' | 'teal' | 'gold';
};

const commonItems: MenuItem[] = [
  { icon: 'star', title: 'التقييمات', body: 'شارك رأيك وراجع ملاحظات الجلسات', route: '/rating', tone: 'gold' },
  { icon: 'settings', title: 'إعدادات التطبيق', body: 'اللغة والمظهر والوضع الليلي', route: '/settings', tone: 'navy' },
];

const notificationItems: MenuItem[] = [
  { icon: 'bell', title: 'الإشعارات', body: 'كل إشعاراتك مرتبة حسب النوع', route: '/notifications', tone: 'gold' },
];

const studentItems: MenuItem[] = [
  { icon: 'credit-card', title: 'رصيد الباقة', body: 'تفاصيل الباقة والاستهلاك الفعلي', route: '/subscription', tone: 'teal' },
  { icon: 'file-text', title: 'الفواتير', body: 'راجع سجل عمليات الدفع', route: '/invoices', tone: 'gold' },
  { icon: 'camera', title: 'مساعد الواجبات البصري', body: 'صوّر واجبك واحصل على شرح خطوة بخطوة', route: '/homework-solver', tone: 'teal' },
  { icon: 'book-open', title: 'المواد التعليمية', body: 'شاهد تسجيلات الجلسات والمواد المرتبطة بها', route: '/materials', tone: 'navy' },
  { icon: 'help-circle', title: 'مركز المساعدة', body: 'اسأل عن دروسك وواجباتك وتقدمك', route: '/help-center', tone: 'teal' },
];

const teacherItems: MenuItem[] = [
  { icon: 'users', title: 'الطلاب', body: 'تابع طلابك وابدأ محادثة أو مكالمة', route: '/students', tone: 'teal' },
  { icon: 'clipboard', title: 'الواجبات والمراجعة', body: 'راجع تسليمات الطلاب واعتمد النتائج', route: '/assignments', tone: 'gold' },
  { icon: 'book-open', title: 'المواد التعليمية', body: 'راجع تسجيلات الجلسات المرتبطة بطلابك', route: '/teacher-materials', tone: 'navy' },
  { icon: 'dollar-sign', title: 'سحب الأرباح', body: 'الرصيد المتاح وطلبات السحب السابقة', route: '/teacher-withdrawals', tone: 'teal' },
  { icon: 'phone', title: 'محفظة الاتصال', body: 'شحن الرصيد وسجل المكالمات الهاتفية', route: '/call-wallet', tone: 'navy' },
];

const menuTranslations: Record<string, string> = {
  'التقييمات': 'Ratings',
  'شارك رأيك وراجع ملاحظات الجلسات': 'Share feedback and review session notes',
  'الإشعارات': 'Notifications',
  'كل إشعاراتك مرتبة حسب النوع': 'All your notifications, organized by type',
  'مركز المساعدة': 'Help center',
  'اسأل عن دروسك وواجباتك وتقدمك': 'Ask about your lessons, homework, and progress',
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
  'الطلاب': 'Students',
  'تابع طلابك وابدأ محادثة أو مكالمة': 'Track students and start a chat or call',
  'الواجبات والمراجعة': 'Assignments and review',
  'راجع تسليمات الطلاب واعتمد النتائج': 'Review student submissions and approve results',
};

export default function MoreScreen() {
  const colors = useColors();
  const { role } = useAjyal();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const items = role === 'student'
    ? studentItems
    : teacherItems;

  const openItem = (item: MenuItem) => {
    if (item.route) {
      router.push(item.route as never);
    }
  };

  return (
    <Screen>
      <Header
        title=""
        hideHeaderRow
      />

      <View style={[styles.directoryHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.directoryGlow, { backgroundColor: colors.navySoft }]} />
        <View style={[styles.directoryGlowSecondary, { backgroundColor: colors.tealSoft }]} />
        <View style={[styles.directoryAccent, { backgroundColor: colors.primary }]} />
        <View style={[styles.directoryTopline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.directoryMark, { backgroundColor: colors.primary, borderColor: colors.card }]}>
            <Icon name="grid" size={18} color={colors.primaryForeground} />
          </View>
          <View style={[styles.directoryToplineCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.directoryEyebrow, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('دليل الوصول السريع', 'Quick access directory')}</Text>
            <Text style={[styles.directoryTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('كل شيء في مكانه', 'Everything in its place')}</Text>
          </View>
          <View style={[styles.roleBadge, { backgroundColor: colors.tealSoft }]}>
            <Icon name={role === 'student' ? 'book-open' : 'briefcase'} size={12} color={colors.teal} />
            <Text style={[styles.roleBadgeText, { color: colors.teal, writingDirection: direction }]}>{role === 'student' ? t('طالب', 'Student') : t('معلم', 'Teacher')}</Text>
          </View>
        </View>
        <Text style={[styles.directoryBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('أدواتك مرتبة حسب المهمة لتصل لما تحتاجه بسرعة وبدون تشتّت.', 'Your tools are grouped by purpose so you can reach what you need without the clutter.')}</Text>
        <View style={[styles.directoryFooter, { borderTopColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.directoryStat}>
            <Text style={[styles.directoryStatValue, { color: colors.primary }]}>{formatNumber(items.length + notificationItems.length + commonItems.length)}</Text>
            <Text style={[styles.directoryStatLabel, { color: colors.mutedForeground, writingDirection: direction }]}>{t('أداة متاحة', 'available tools')}</Text>
          </View>
          <View style={[styles.directoryLegend, { backgroundColor: colors.goldSoft }]}>
            <View style={[styles.directoryLegendDot, { backgroundColor: colors.accentForeground }]} />
            <Text style={[styles.directoryLegendText, { color: colors.accentForeground, writingDirection: direction }]}>{t('محدّثة لحسابك', 'Updated for you')}</Text>
          </View>
        </View>
      </View>

      {role !== 'student' && items.length ? (
        <ToolSection title={t('مساحة التدريس', 'Teaching space')} subtitle={t('أدواتك اليومية مع الطلاب والجلسات', 'Your daily tools for students and sessions')} icon="briefcase" items={items} onPress={openItem} />
      ) : null}

      {role === 'student' && items.length ? (
        <ToolSection title={t('مساحة التعلّم', 'Learning space')} subtitle={t('كل ما يساعدك على التقدم في دروسك', 'Everything that helps you move forward')} icon="book-open" items={items} onPress={openItem} />
      ) : null}

      <ToolSection title={t('الإشعارات', 'Notifications')} subtitle={t('تابع المستجدات مرتبة حسب نوعها', 'Stay up to date with organized notifications')} icon="bell" items={notificationItems} onPress={openItem} />

      <ToolSection title={t('الحساب والمنصة', 'Account & platform')} subtitle={t('إدارة حسابك ومتابعة كل جديد', 'Manage your account and stay up to date')} icon="settings" items={commonItems} onPress={openItem} />

      <Pressable testID="support-link" onPress={() => router.push('/support')} style={({ pressed }) => [styles.support, { backgroundColor: colors.tealSoft, borderColor: colors.border }, pressed && styles.pressed]}>
        <View style={[styles.supportIcon, { backgroundColor: colors.teal }]}><Icon name="message-circle" size={18} color={colors.primaryForeground} /></View>
        <View style={styles.supportCopy}><Text style={[styles.supportTitle, { color: colors.foreground }]}>{t('تواصل مع الفريق', 'Contact the team')}</Text><Text style={[styles.supportBody, { color: colors.mutedForeground }]}>{t('الدعم الفني والتذاكر', 'Technical support and tickets')}</Text></View>
        <Icon name="arrow-left" size={17} color={colors.teal} />
      </Pressable>
    </Screen>
  );
}

function ToolSection({ title, subtitle, icon, items, onPress }: { title: string; subtitle: string; icon: MenuItem['icon']; items: MenuItem[]; onPress: (item: MenuItem) => void }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  return (
    <View style={styles.sectionBlock}>
      <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.navySoft }]}><Icon name={icon} size={16} color={colors.primary} /></View>
        <View style={[styles.sectionHeaderCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{subtitle}</Text>
        </View>
        <View style={[styles.sectionCountPill, { backgroundColor: colors.navySoft }]}>
          <Text style={[styles.sectionCount, { color: colors.primary, writingDirection: direction }]}>{items.length}</Text>
        </View>
      </View>
      <View style={styles.listCard}>
        {items.map((item, index) => <ToolRow key={item.title} item={item} last={index === items.length - 1} onPress={() => onPress(item)} />)}
      </View>
    </View>
  );
}

function ToolRow({ item, last, onPress }: { item: MenuItem; last: boolean; onPress: () => void }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const tone = item.tone === 'navy' ? colors.primary : item.tone === 'gold' ? colors.accentForeground : colors.teal;
  const background = colors.card;
  return (
    <Pressable testID={`tool-${item.title}`} onPress={onPress} style={({ pressed }) => [styles.toolPressable, last && styles.toolRowLast, pressed && styles.pressed]}>
      <LinearGradient
        colors={[colors.card, colors.card]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[styles.toolRow, { borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      >
        <View style={[styles.toolGlow, { backgroundColor: colors.muted }]} />
        <View style={[styles.toolAccent, isRTL ? { right: 0 } : { left: 0 }, { backgroundColor: tone }]} />
        <View style={[styles.toolIcon, { backgroundColor: colors.card, borderColor: background }]}><Icon name={item.icon} size={17} color={tone} /></View>
        <View style={[styles.toolCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text numberOfLines={1} style={[styles.toolTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t(item.title, menuTranslations[item.title] ?? item.title)}</Text>
          <Text numberOfLines={2} style={[styles.toolBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t(item.body, menuTranslations[item.body] ?? item.body)}</Text>
        </View>
        <View style={[styles.toolArrow, { backgroundColor: colors.card, borderColor: background }]}>
          <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={14} color={tone} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  directoryHeader: { borderWidth: 1, borderRadius: 22, padding: 14, marginBottom: 22, position: 'relative', overflow: 'hidden', shadowColor: '#173E8C', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  directoryGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -116, left: -46, opacity: 0.72 },
  directoryGlowSecondary: { position: 'absolute', width: 112, height: 112, borderRadius: 56, bottom: -78, right: -30, opacity: 0.7 },
  directoryAccent: { position: 'absolute', height: 4, width: 64, borderRadius: 2, top: 0, left: 22, opacity: 0.9 },
  directoryTopline: { alignItems: 'center', gap: 10 },
  directoryMark: { width: 42, height: 42, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#173E8C', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  directoryToplineCopy: { flex: 1 },
  directoryEyebrow: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  directoryTitle: { fontSize: 18, lineHeight: 24, marginTop: 2, fontFamily: 'Inter_700Bold' },
  roleBadge: { minHeight: 26, borderRadius: 9, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  roleBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  directoryBody: { fontSize: 11, lineHeight: 17, marginTop: 12, fontFamily: 'Inter_400Regular' },
  directoryFooter: { borderTopWidth: 1, marginTop: 13, paddingTop: 10, alignItems: 'center', justifyContent: 'space-between' },
  directoryStat: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  directoryStatValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  directoryStatLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  directoryLegend: { minHeight: 24, borderRadius: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  directoryLegendDot: { width: 5, height: 5, borderRadius: 3 },
  directoryLegendText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  sectionBlock: { marginBottom: 24 },
  sectionHeader: { alignItems: 'center', gap: 10, marginBottom: 11 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_700Bold' },
  sectionSubtitle: { fontSize: 10, lineHeight: 15, marginTop: 2, fontFamily: 'Inter_400Regular' },
  sectionCountPill: { minWidth: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionCount: { fontSize: 11, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  listCard: { paddingHorizontal: 0 },
  toolPressable: { minHeight: 82, borderRadius: 17, marginBottom: 10, shadowColor: '#173E8C', shadowOpacity: 0.11, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  toolRowLast: { marginBottom: 0 },
  toolRow: { minHeight: 82, paddingVertical: 12, paddingHorizontal: 12, gap: 10, alignItems: 'center', borderWidth: 1, borderRadius: 17, position: 'relative', overflow: 'hidden' },
  toolGlow: { position: 'absolute', width: 132, height: 132, borderRadius: 66, top: -70, left: -46, opacity: 0.42 },
  toolAccent: { position: 'absolute', top: 13, bottom: 13, width: 4, borderRadius: 2, opacity: 0.82 },
  toolIcon: { width: 43, height: 43, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#173E8C', shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  toolCopy: { flex: 1, minWidth: 0 },
  toolTitle: { width: '100%', fontSize: 12.5, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  toolBody: { width: '100%', fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'Inter_400Regular' },
  toolArrow: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  support: { minHeight: 72, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  supportIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  supportCopy: { flex: 1, alignItems: 'flex-end' },
  supportTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  supportBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  pressed: { opacity: 0.72 },
});