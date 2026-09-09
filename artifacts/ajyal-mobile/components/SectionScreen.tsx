import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { EmptyState, Header, Icon, Screen, SectionHeading, type IconName } from '@/components/AjyalUI';

export type SectionKey =
  | 'find-teacher'
  | 'subscriptions'
  | 'smart-teacher'
  | 'materials'
  | 'teacher-materials'
  | 'students'
  | 'wallet'
  | 'chat'
  | 'support'
  | 'rating'
  | 'invoices'
  | 'subscription'
  | 'booking'
  | 'live-session';

type SectionAction = {
  icon: IconName;
  title: string;
  body: string;
  route?: string;
};

type SectionSpec = {
  eyebrow: string;
  title: string;
  intro: string;
  icon: IconName;
  tone: 'navy' | 'teal' | 'gold';
  listTitle: string;
  emptyTitle: string;
  emptyBody: string;
  actions: SectionAction[];
};

const specs: Record<SectionKey, SectionSpec> = {
  'find-teacher': {
    eyebrow: 'تعلّم بالطريقة التي تناسبك',
    title: 'ابحث عن معلم',
    intro: 'اكتشف المعلم المناسب لمادتك وهدفك الدراسي.',
    icon: 'search',
    tone: 'teal',
    listTitle: 'خيارات البحث',
    emptyTitle: 'قائمة المعلمين غير متاحة بعد',
    emptyBody: 'سيتم عرض المعلمين المتاحين من حسابك بعد ربط نقطة البحث في المنصة.',
    actions: [
      { icon: 'book-open', title: 'حسب المادة', body: 'ابدأ من المادة التي تحتاج إلى دعم فيها.' },
      { icon: 'target', title: 'حسب هدفك', body: 'اختر دعم الواجب أو الاستعداد للاختبار.' },
      { icon: 'calendar', title: 'احجز بعد الاختيار', body: 'انتقل إلى الحجوزات عند اختيار المعلم.', route: '/booking' },
    ],
  },
  subscriptions: {
    eyebrow: 'خطتك التعليمية',
    title: 'الباقات والاشتراكات',
    intro: 'تابع باقتك الحالية ورصيد جلساتك وفواتيرك.',
    icon: 'star',
    tone: 'gold',
    listTitle: 'إدارة الاشتراك',
    emptyTitle: 'لا توجد باقة متزامنة',
    emptyBody: 'ستظهر تفاصيل باقتك ورصيدك فور مزامنتها من المنصة.',
    actions: [
      { icon: 'award', title: 'الباقة الحالية', body: 'تفاصيل الخطة والجلسات المتبقية.', route: '/subscription' },
      { icon: 'file-text', title: 'الفواتير', body: 'راجع سجل عمليات الدفع.', route: '/invoices' },
      { icon: 'calendar', title: 'استخدم رصيدك', body: 'احجز جلسة جديدة من الحجوزات.', route: '/booking' },
    ],
  },
  'smart-teacher': {
    eyebrow: 'مساعدة فورية أثناء التعلم',
    title: 'المدرس الذكي',
    intro: 'اسأل، راجع، واستعد للاختبار من مساحة واحدة.',
    icon: 'message-circle',
    tone: 'navy',
    listTitle: 'ابدأ من هنا',
    emptyTitle: 'ابدأ أول محادثة تعليمية',
    emptyBody: 'ستظهر محادثاتك السابقة هنا عند تفعيل خدمة المدرس الذكي في حسابك.',
    actions: [
      { icon: 'help-circle', title: 'اسأل عن درس', body: 'اطلب شرحاً مبسطاً لمفهوم صعب.', route: '/chat' },
      { icon: 'clipboard', title: 'حل واجب', body: 'راجع خطوات الحل وتحقق من فهمك.', route: '/assignments' },
      { icon: 'edit-3', title: 'استعد للاختبار', body: 'نظّم مراجعتك قبل موعد الاختبار.', route: '/assignments' },
    ],
  },
  materials: {
    eyebrow: 'مصادر التعلم الخاصة بك',
    title: 'المواد التعليمية',
    intro: 'ملفات ودروس مرتبطة بجلساتك ومهامك.',
    icon: 'book-open',
    tone: 'teal',
    listTitle: 'مركز المواد',
    emptyTitle: 'لا توجد مواد متاحة',
    emptyBody: 'ستظهر المواد التي يشاركها المعلمون معك هنا بعد مزامنتها.',
    actions: [
      { icon: 'calendar', title: 'مواد الجلسات', body: 'ارجع إلى الجلسات المرتبطة بموادك.', route: '/bookings' },
      { icon: 'clipboard', title: 'مواد المهام', body: 'افتح الواجبات والاختبارات ذات الصلة.', route: '/assignments' },
      { icon: 'message-circle', title: 'اطلب مادة', body: 'تواصل مع فريق الدعم عند الحاجة.', route: '/support' },
    ],
  },
  'teacher-materials': {
    eyebrow: 'مصادر طلابك التعليمية',
    title: 'مواد طلابي',
    intro: 'أضف وراجع المواد المرتبطة بجلسات طلابك.',
    icon: 'book-open',
    tone: 'teal',
    listTitle: 'مركز مواد المعلم',
    emptyTitle: 'لا توجد مواد متزامنة',
    emptyBody: 'ستظهر المواد التي شاركتها مع الطلاب بعد مزامنتها من المنصة.',
    actions: [
      { icon: 'calendar', title: 'مواد الجلسات', body: 'راجع جلساتك والمواد المرتبطة بها.', route: '/bookings' },
      { icon: 'clipboard', title: 'مهام الطلاب', body: 'انتقل إلى الواجبات والتسليمات.', route: '/assignments' },
      { icon: 'users', title: 'اختر طالباً', body: 'افتح قائمة الطلاب لإدارة تقدمهم.', route: '/students' },
    ],
  },
  students: {
    eyebrow: 'صورة طلابك التعليمية',
    title: 'طلابي',
    intro: 'تابع الطلاب المرتبطين بك وتقدمهم الدراسي.',
    icon: 'users',
    tone: 'navy',
    listTitle: 'قائمة الطلاب',
    emptyTitle: 'لا يوجد طلاب متزامنون',
    emptyBody: 'ستظهر قائمة الطلاب وملخص تقدمهم من حساب المعلم المتصل.',
    actions: [
      { icon: 'calendar', title: 'جلسات الطلاب', body: 'راجع المواعيد القادمة والسابقة.', route: '/bookings' },
      { icon: 'clipboard', title: 'مراجعة المهام', body: 'انتقل إلى تسليمات الطلاب.', route: '/assignments' },
      { icon: 'message-circle', title: 'محادثات الطلاب', body: 'افتح المحادثات التعليمية.', route: '/chat' },
    ],
  },
  wallet: {
    eyebrow: 'إدارة دخلك التعليمي',
    title: 'المحفظة والأرباح',
    intro: 'راجع رصيدك وطلبات السحب وحركة الأرباح.',
    icon: 'credit-card',
    tone: 'gold',
    listTitle: 'ملخص المحفظة',
    emptyTitle: 'لا توجد حركة مالية متاحة',
    emptyBody: 'ستظهر الأرباح وطلبات السحب عندما تتم مزامنة المحفظة مع حساب المعلم.',
    actions: [
      { icon: 'trending-up', title: 'الأرباح', body: 'تابع الدخل الناتج عن جلساتك.' },
      { icon: 'download', title: 'طلبات السحب', body: 'راجع حالة طلبات السحب السابقة.' },
      { icon: 'help-circle', title: 'مساعدة مالية', body: 'تواصل مع الدعم حول المحفظة.', route: '/support' },
    ],
  },
  chat: {
    eyebrow: 'تواصل داخل أجيال المعرفة',
    title: 'المحادثات',
    intro: 'رسائلك التعليمية مع المعلمين والطلاب وفريق الدعم.',
    icon: 'message-circle',
    tone: 'teal',
    listTitle: 'آخر المحادثات',
    emptyTitle: 'لا توجد محادثات بعد',
    emptyBody: 'ستظهر المحادثات المرتبطة بحجوزاتك وحسابك هنا.',
    actions: [
      { icon: 'calendar', title: 'من الجلسات', body: 'افتح جلسة مرتبطة بمحادثة.', route: '/bookings' },
      { icon: 'help-circle', title: 'الدعم الفني', body: 'انتقل إلى مركز الدعم.', route: '/support' },
    ],
  },
  support: {
    eyebrow: 'نحن هنا لمساعدتك',
    title: 'مركز الدعم',
    intro: 'إجابات ومساعدة حول الحساب والجلسات والتعلم.',
    icon: 'help-circle',
    tone: 'teal',
    listTitle: 'مواضيع شائعة',
    emptyTitle: 'لم تبدأ طلب دعم',
    emptyBody: 'عند ربط مركز الدعم بالمنصة ستظهر طلباتك وحالاتها هنا.',
    actions: [
      { icon: 'calendar', title: 'الجلسات والحجوزات', body: 'مساعدة في الموعد أو الإلغاء.', route: '/bookings' },
      { icon: 'credit-card', title: 'الدفع والاشتراك', body: 'مساعدة في الباقات والفواتير.', route: '/subscriptions' },
      { icon: 'user', title: 'الحساب', body: 'راجع بيانات الملف والإعدادات.', route: '/profile' },
    ],
  },
  rating: {
    eyebrow: 'صوتك يصنع فرقاً',
    title: 'التقييمات',
    intro: 'قيّم جلساتك واطّلع على الملاحظات التعليمية.',
    icon: 'star',
    tone: 'gold',
    listTitle: 'سجل التقييمات',
    emptyTitle: 'لا توجد تقييمات بعد',
    emptyBody: 'ستظهر التقييمات بعد إكمال جلسة ومشاركة رأيك.',
    actions: [
      { icon: 'calendar', title: 'جلساتك السابقة', body: 'اختر جلسة مكتملة للمراجعة.', route: '/bookings' },
      { icon: 'message-circle', title: 'ملاحظة للفريق', body: 'تواصل مع الدعم حول تجربة التعلم.', route: '/support' },
    ],
  },
  invoices: {
    eyebrow: 'سجل معاملاتك',
    title: 'الفواتير',
    intro: 'احتفظ بسجل واضح لعمليات الدفع والاشتراكات.',
    icon: 'file-text',
    tone: 'gold',
    listTitle: 'آخر الفواتير',
    emptyTitle: 'لا توجد فواتير متاحة',
    emptyBody: 'ستظهر الفواتير بعد مزامنة عمليات الدفع من المنصة.',
    actions: [
      { icon: 'award', title: 'تفاصيل الاشتراك', body: 'راجع الخطة المرتبطة بالفاتورة.', route: '/subscription' },
      { icon: 'help-circle', title: 'مشكلة في فاتورة', body: 'افتح مركز الدعم للمساعدة.', route: '/support' },
    ],
  },
  subscription: {
    eyebrow: 'تفاصيل خطتك',
    title: 'تفاصيل الاشتراك',
    intro: 'اعرف حالة باقتك وما يتبقى لك من الرصيد.',
    icon: 'award',
    tone: 'gold',
    listTitle: 'معلومات الخطة',
    emptyTitle: 'لا توجد تفاصيل اشتراك',
    emptyBody: 'ستظهر الخطة والرصيد والتجديد من حساب المنصة المتصل.',
    actions: [
      { icon: 'file-text', title: 'الفواتير', body: 'راجع سجل المدفوعات.', route: '/invoices' },
      { icon: 'calendar', title: 'حجز جلسة', body: 'استخدم رصيدك في جلسة جديدة.', route: '/booking' },
    ],
  },
  booking: {
    eyebrow: 'خطوتك التالية',
    title: 'حجز جلسة',
    intro: 'اختر الموعد المناسب بعد تحديد المادة والمعلم.',
    icon: 'calendar',
    tone: 'navy',
    listTitle: 'الحجز من المنصة',
    emptyTitle: 'مساحة الحجز جاهزة',
    emptyBody: 'سيتم عرض المعلمين والأوقات المتاحة من نقطة الحجز المشتركة مع المنصة.',
    actions: [
      { icon: 'search', title: 'اختر معلماً', body: 'ابدأ بالبحث عن المعلم المناسب.', route: '/find-teacher' },
      { icon: 'calendar', title: 'راجع حجوزاتك', body: 'تابع الجلسات التي تم حجزها.', route: '/bookings' },
    ],
  },
  'live-session': {
    eyebrow: 'تعلم مباشر',
    title: 'الجلسة المباشرة',
    intro: 'ادخل جلستك في الوقت المحدد وتابع تجربة التعلم.',
    icon: 'video',
    tone: 'teal',
    listTitle: 'الجلسة الحالية',
    emptyTitle: 'لا توجد جلسة مباشرة الآن',
    emptyBody: 'سيظهر زر الدخول عندما يحين موعد إحدى جلساتك المتزامنة.',
    actions: [
      { icon: 'calendar', title: 'الجلسات القادمة', body: 'راجع موعد الجلسة التالية.', route: '/bookings' },
      { icon: 'message-circle', title: 'المحادثات', body: 'تواصل مع الطرف الآخر قبل الجلسة.', route: '/chat' },
    ],
  },
};

export function SectionScreen({ section }: { section: SectionKey }) {
  const colors = useColors();
  const { role, profile } = useAjyal();
  const spec = specs[section];
  const tone = spec.tone === 'navy' ? colors.primary : spec.tone === 'gold' ? colors.accentForeground : colors.teal;
  const softTone = spec.tone === 'navy' ? colors.navySoft : spec.tone === 'gold' ? colors.goldSoft : colors.tealSoft;
  const open = (route?: string) => {
    if (route) router.push(route as never);
  };

  return (
    <Screen>
      <Header
        onBack={() => router.back()}
        avatarText={profile?.displayName?.slice(0, 1)}
        eyebrow={spec.eyebrow}
        title={spec.title}
        onAvatar={() => router.push('/profile')}
      />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: softTone }]}><Icon name={spec.icon} size={22} color={tone} /></View>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroRole, { color: colors.tint }]}>{role === 'student' ? 'مساحة الطالب' : 'مساحة المعلم'}</Text>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>{spec.title}</Text>
          <Text style={[styles.heroBody, { color: colors.tint }]}>{spec.intro}</Text>
        </View>
      </View>
      <SectionHeading title={spec.listTitle} />
      <View style={styles.actionGrid}>
        {spec.actions.map((action) => (
          <Pressable key={action.title} testID={`section-action-${section}-${action.title}`} onPress={() => open(action.route)} disabled={!action.route} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }, !action.route && styles.disabledCard, pressed && styles.pressed]}>
            <View style={[styles.actionIcon, { backgroundColor: softTone }]}><Icon name={action.icon} size={17} color={tone} /></View>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>{action.title}</Text>
            <Text style={[styles.actionBody, { color: colors.mutedForeground }]}>{action.body}</Text>
            {action.route ? <Icon name="arrow-left" size={14} color={colors.mutedForeground} style={styles.actionArrow} /> : null}
          </Pressable>
        ))}
      </View>
      <EmptyState icon={spec.icon} title={spec.emptyTitle} body={spec.emptyBody} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 158, borderRadius: 23, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: 'flex-end', marginLeft: 14 },
  heroRole: { width: '100%', fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'right', writingDirection: 'rtl' },
  heroTitle: { width: '100%', fontSize: 23, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginTop: 6 },
  heroBody: { width: '100%', fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 6 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 13 },
  actionCard: { width: '48%', minHeight: 132, borderRadius: 18, borderWidth: 1, padding: 13, alignItems: 'flex-end', position: 'relative' },
  disabledCard: { opacity: 0.86 },
  actionIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  actionTitle: { width: '100%', fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  actionBody: { width: '100%', fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 5 },
  actionArrow: { position: 'absolute', bottom: 13, left: 13 },
  pressed: { opacity: 0.72 },
});