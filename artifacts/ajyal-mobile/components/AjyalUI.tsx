import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Role, Session, Assignment } from '@/constants/localData';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';

export type IconName = keyof typeof Feather.glyphMap;

export const BRAND_ICON = require('@/assets/images/ajyal-icon.png');

export function goBackOrHome(fallback: string = '/(tabs)') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
}

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: object }) {
  const colors = useColors();
  return <Feather name={name} size={size} color={color ?? colors.foreground} style={style} />;
}

export function Screen({ children, scroll = true, contentStyle }: { children: React.ReactNode; scroll?: boolean; contentStyle?: object }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = insets.top + 10;
  const bottomInset = insets.bottom + 112;
  if (!scroll) {
    return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: topInset, paddingBottom: bottomInset }, contentStyle]}><Reveal style={styles.revealFill}>{children}</Reveal></View>;
  }
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingTop: topInset, paddingBottom: bottomInset }, contentStyle]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
    >
      <Reveal>{children}</Reveal>
    </ScrollView>
  );
}

export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Header({ onBack, hideHeaderRow = false }: { title: string; eyebrow?: string; onBell?: () => void; onBack?: () => void; unread?: boolean; onAvatar?: () => void; avatarText?: string; hideHeaderRow?: boolean }) {
  const colors = useColors();
  const { direction, t } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const handleBack = () => {
    if (router.canGoBack()) {
      onBack?.();
      return;
    }
    router.replace('/(tabs)');
  };
  return (
    <View style={styles.headerShell}>
      <View style={[styles.brandBar, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
        <View style={[styles.brandCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.brandName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('أجيال المعرفة', 'Ajyal Knowledge')}</Text>
          <Text style={[styles.brandTagline, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('نتعلم اليوم، نصنع الغد', 'Learn today, shape tomorrow')}</Text>
        </View>
        <View style={[styles.brandLogoFrame, { backgroundColor: colors.primary }]}>
          <Image source={BRAND_ICON} style={styles.brandLogo} />
        </View>
      </View>
      {!hideHeaderRow && onBack ? (
        <View style={styles.header}>
          <Pressable testID="back-button" onPress={handleBack} hitSlop={8} style={({ pressed }) => [styles.bell, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}>
            <Icon name="arrow-right" size={19} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function RoleSwitcher({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  const colors = useColors();
  const { t } = useAppPreferences();
  return (
    <View style={[styles.roleSwitcher, { backgroundColor: colors.muted }]}>
      {(['teacher', 'student'] as Role[]).map((item) => {
        const active = role === item;
        return (
          <Pressable
            key={item}
            testID={`role-${item}`}
            onPress={() => onChange(item)}
            style={({ pressed }) => [styles.roleItem, active && { backgroundColor: colors.card, elevation: 2 }, pressed && styles.pressed]}
          >
            <Icon name={item === 'student' ? 'book-open' : 'briefcase'} size={14} color={active ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.roleText, { color: active ? colors.primary : colors.mutedForeground }]}>{item === 'student' ? t('طالب', 'Student') : t('معلم', 'Teacher')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  const { direction } = useAppPreferences();
  const isRTL = direction === 'rtl';
  return (
    <View style={[styles.sectionHeading, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
      {action && onAction ? (
        <Pressable testID="section-action" onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.sectionActionWrap, pressed && styles.pressed]}>
          <Text style={[styles.sectionAction, { color: colors.teal }]}>{action}</Text>
          <Icon name="arrow-left" size={13} color={colors.teal} />
        </Pressable>
      ) : <View />}
      <View style={[styles.sectionTitleWrap, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
        <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
        <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
      </View>
    </View>
  );
}

export function ProgressBar({ progress, color }: { progress: number; color?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
      <View style={[styles.progressFill, { width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: color ?? colors.teal }]} />
    </View>
  );
}

export function SessionCard({ session, role, cancelled, onPress, onJoin, onCancel }: { session: Session; role: Role; cancelled?: boolean; onPress: () => void; onJoin?: () => void; onCancel?: () => void }) {
  const colors = useColors();
  const { t, locale, direction } = useAppPreferences();
  const tone = session.tone === 'teal' ? colors.teal : session.tone === 'gold' ? colors.accentForeground : colors.primary;
  const sessionDate = new Date(session.scheduledAt);
  const hasDate = !Number.isNaN(sessionDate.getTime());
  const dateDay = hasDate ? sessionDate.toLocaleDateString(locale, { day: 'numeric' }) : session.date.split(/[،,]/)[0];
  const dateMonth = hasDate ? sessionDate.toLocaleDateString(locale, { month: 'short' }) : session.date.split(/[،,]/)[1]?.trim() ?? t('أكتوبر', 'Oct');
  const sessionTime = hasDate ? sessionDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : session.time;
  const isWaitingAcceptance = session.sessionStatus === 'waiting_acceptance';
  const isInProgress = session.sessionStatus === 'in_progress';
  const isConfirmedUpcoming = session.status === 'upcoming' && !isWaitingAcceptance;
  const canJoin = role !== 'teacher' && isConfirmedUpcoming && isInProgress;
  const showJoinControl = !cancelled && session.status === 'upcoming' && (role === 'student' || isConfirmedUpcoming);
  const statusColor = cancelled || session.status === 'expired'
    ? colors.destructive
    : session.status === 'done'
      ? colors.primary
      : isInProgress
        ? colors.teal
        : isWaitingAcceptance
          ? colors.accentForeground
          : colors.accentForeground;
  const statusBackground = cancelled || session.status === 'expired'
    ? colors.accent
    : session.status === 'done'
      ? colors.navySoft
      : isInProgress
        ? colors.tealSoft
        : colors.goldSoft;
  const statusLabel = cancelled
    ? t('ملغاة', 'Cancelled')
    : session.status === 'expired'
      ? t('منتهية', 'Ended')
      : session.status === 'done'
        ? t('مكتملة', 'Completed')
        : isInProgress
        ? role === 'teacher'
          ? t('جارية من الكمبيوتر', 'Running from computer')
          : t('مقبولة وجارية الآن', 'Accepted / In progress')
        : isWaitingAcceptance
          ? role === 'teacher'
            ? t('بانتظار بدء الحصة من الكمبيوتر', 'Waiting to start from computer')
            : t('بانتظار دخول المعلم', 'Waiting for teacher to join')
          : t('قادمة', 'Upcoming');
  return (
    <Pressable testID={`session-${session.id}`} onPress={onPress} style={({ pressed }) => [styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.cardPressed]}>
      <View style={[styles.sessionDate, { backgroundColor: session.tone === 'gold' ? colors.goldSoft : session.tone === 'teal' ? colors.tealSoft : colors.navySoft }]}>
        <Text style={[styles.sessionDateDay, { color: tone }]}>{dateDay}</Text>
        <Text style={[styles.sessionDateMonth, { color: colors.mutedForeground }]}>{dateMonth}</Text>
      </View>
      <View style={styles.sessionBody}>
        <View style={styles.sessionTopline}>
          <Text style={[styles.sessionSubject, { color: tone }]}>{session.subject}</Text>
          <View style={[styles.sessionStatusBadge, { backgroundColor: statusBackground }]}>
            <View style={[styles.sessionStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.sessionStatusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={[styles.sessionTitle, { color: colors.foreground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]} numberOfLines={2}>{session.title}</Text>
        <View style={styles.sessionMeta}>
          <View style={[styles.sessionInfoPill, { backgroundColor: colors.muted }]}>
            <Icon name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{sessionTime} · {session.duration}</Text>
          </View>
          <View style={[styles.sessionInfoPill, { backgroundColor: colors.muted, flex: 1 }]}>
            <Icon name={role === 'teacher' ? 'book-open' : 'user'} size={12} color={colors.mutedForeground} />
            <Text numberOfLines={1} style={[styles.sessionPerson, { color: colors.mutedForeground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{session.person}</Text>
          </View>
        </View>
        {showJoinControl ? (
          <Pressable
            testID={`join-session-${session.id}`}
            disabled={!canJoin}
            onPress={(event) => {
              event.stopPropagation();
              if (canJoin) onJoin?.();
            }}
            style={({ pressed }) => [
              styles.joinSessionButton,
              { backgroundColor: canJoin ? colors.teal : colors.muted, borderColor: canJoin ? colors.teal : colors.border },
              pressed && canJoin && styles.pressed,
            ]}
          >
            <Icon name={canJoin ? 'video' : 'clock'} size={13} color={canJoin ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[styles.joinSessionText, { color: canJoin ? colors.primaryForeground : colors.mutedForeground }]}>
              {canJoin
                ? t('الانضمام إلى الجلسة', 'Join session')
                : role === 'teacher'
                  ? isWaitingAcceptance
                    ? t('بانتظار بدء الحصة من الكمبيوتر', 'Waiting to start from computer')
                    : isInProgress
                      ? t('الحصة جارية من الكمبيوتر', 'Running from computer')
                      : t('ابدأ الجلسة من الكمبيوتر', 'Start from computer')
                  : t('بانتظار بدء المعلم', 'Waiting for teacher')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {!cancelled && onCancel ? (
        <Pressable testID={`cancel-${session.id}`} onPress={onCancel} hitSlop={10} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
          <Icon name="x-circle" size={17} color={colors.destructive} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function AssignmentRow({ assignment, completed, submissionCount = 0, teacherReviewStatus, onPress }: { assignment: Assignment; completed?: boolean; submissionCount?: number; teacherReviewStatus?: 'submitted' | 'ai_graded' | 'reviewed' | 'mixed'; onPress: () => void }) {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isDone = completed || assignment.status === 'مكتمل';
  const isReviewed = teacherReviewStatus === 'reviewed';
  const statusColor = isReviewed || isDone ? colors.success : teacherReviewStatus === 'ai_graded' || assignment.status === 'قيد التقدم' ? colors.teal : colors.mutedForeground;
  const statusLabel = isReviewed
    ? t('تم التصحيح', 'Reviewed')
    : teacherReviewStatus === 'ai_graded'
      ? t('تصحيح آلي', 'AI graded')
      : teacherReviewStatus === 'submitted' || teacherReviewStatus === 'mixed'
        ? t('قيد المراجعة', 'Awaiting review')
        : isDone
          ? t('مكتمل', 'Completed')
          : assignment.status === 'قيد التقدم'
            ? t('قيد التقدم', 'In progress')
            : assignment.kind === 'اختبار'
              ? t('اختبار', 'Quiz')
              : t('واجب', 'Assignment');
  return (
    <Pressable testID={`assignment-${assignment.id}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.assignmentRow, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.cardPressed]}>
      <View style={[styles.assignmentAccent, { backgroundColor: statusColor }]} />
      <View style={[styles.assignmentIcon, { backgroundColor: isDone ? colors.tealSoft : assignment.kind === 'اختبار' ? colors.goldSoft : colors.navySoft }]}>
        <Icon name={assignment.kind === 'اختبار' ? 'edit-3' : 'file-text'} size={18} color={isDone ? colors.teal : colors.primary} />
      </View>
      <View style={styles.assignmentMain}>
        <View style={styles.assignmentTitleLine}>
          <Text style={[styles.assignmentTitle, { color: colors.foreground, writingDirection: direction }]} numberOfLines={2}>{assignment.title}</Text>
          <View style={[styles.badge, { backgroundColor: isReviewed || isDone ? colors.tealSoft : teacherReviewStatus === 'ai_graded' || assignment.status === 'قيد التقدم' ? colors.navySoft : colors.goldSoft }]}>
            <Text style={[styles.badgeText, { color: isReviewed || isDone ? colors.success : teacherReviewStatus === 'ai_graded' || assignment.status === 'قيد التقدم' ? colors.primary : colors.accentForeground }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.assignmentMeta}>
          <Icon name="book-open" size={11} color={colors.mutedForeground} />
          <Text style={[styles.assignmentSubject, { color: colors.mutedForeground, writingDirection: direction }]} numberOfLines={1}>{assignment.subject}</Text>
          <View style={[styles.assignmentMetaDot, { backgroundColor: colors.border }]} />
          <Icon name="calendar" size={11} color={colors.mutedForeground} />
          <Text style={[styles.assignmentDue, { color: colors.mutedForeground, writingDirection: direction }]} numberOfLines={1}>{assignment.due}</Text>
          {submissionCount ? <Text style={[styles.assignmentSubmission, { color: colors.teal, writingDirection: direction }]}>{` · ${formatNumber(submissionCount)} ${t('تسليم', 'submissions')}`}</Text> : null}
        </View>
        <View style={styles.assignmentProgressHeader}>
          <Text style={[styles.assignmentProgressLabel, { color: colors.mutedForeground, writingDirection: direction }]}>{t('نسبة الإنجاز', 'Progress')}</Text>
          <Text style={[styles.percent, { color: statusColor }]}>{isDone ? '100%' : `${formatNumber(assignment.progress)}%`}</Text>
        </View>
        <View style={[styles.assignmentProgressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.assignmentProgressFill, { width: `${Math.min(Math.max(isDone ? 100 : assignment.progress, 0), 100)}%`, backgroundColor: statusColor }]} />
        </View>
      </View>
      <View style={[styles.assignmentArrow, { backgroundColor: isDone ? colors.tealSoft : colors.navySoft }]}>
        <Icon name="arrow-left" size={14} color={isDone ? colors.teal : colors.primary} />
      </View>
    </Pressable>
  );
}

export function EmptyState({ icon = 'inbox', title, body, action, onAction }: { icon?: IconName; title: string; body: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyGlow, { backgroundColor: colors.navySoft }]} />
      <View style={[styles.emptyIcon, { backgroundColor: colors.navySoft }]}><Icon name={icon} size={22} color={colors.primary} /></View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
      {action && onAction ? <Pressable testID="empty-action" onPress={onAction} style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.smallButtonText, { color: colors.primaryForeground }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function LoadingBlock() {
  const colors = useColors();
  return (
    <View style={[styles.loadingBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.loadingDot, { backgroundColor: colors.muted }]} />
      <View style={[styles.loadingLine, { backgroundColor: colors.muted }]} />
      <View style={[styles.loadingLine, styles.loadingShort, { backgroundColor: colors.muted }]} />
      <View style={[styles.loadingBox, { backgroundColor: colors.muted }]} />
    </View>
  );
}

export function WelcomeBanner({ role, onAction }: { role: Role; onAction: () => void }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  return (
    <LinearGradient colors={[colors.primary, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
      <View style={[styles.bannerDecorOne, { backgroundColor: colors.teal }]} />
      <View style={[styles.bannerDecorTwo, { backgroundColor: colors.accent }]} />
      <View style={styles.bannerCopy}>
          <View style={styles.bannerKicker}><View style={[styles.liveDot, { backgroundColor: colors.accent }]} /><Text style={[styles.bannerEyebrow, { color: colors.tint, writingDirection: direction }]}> {t('مساحتك اليومية', 'Your daily space')}</Text></View>
        <Text style={[styles.bannerTitle, { color: colors.primaryForeground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{role === 'student' ? t('خطوتك التالية\nواضحة الآن.', 'Your next step\nstarts here.') : t('يومك التعليمي\nفي متناولك.', 'Your teaching day\nat a glance.')}</Text>
        <Text style={[styles.bannerBody, { color: colors.tint, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{role === 'student' ? t('رتّب وقتك، ثم ابدأ من جلسة واحدة.', 'Plan your time, then start with one session.') : t('افتح جلساتك ومهام طلابك دون تشتّت.', 'Open your sessions and student tasks without the clutter.')}</Text>
        <Pressable testID="banner-action" onPress={onAction} style={({ pressed }) => [styles.bannerButton, { backgroundColor: colors.tint }, pressed && styles.pressed]}>
          <Text style={[styles.bannerButtonText, { color: colors.primary }]}>{role === 'student' ? t('فتح الجلسات', 'Open sessions') : t('جدول اليوم', 'Today’s schedule')}</Text>
          <Icon name={direction === 'rtl' ? 'arrow-left' : 'arrow-right'} size={15} color={colors.primary} />
        </Pressable>
      </View>
      <Image source={BRAND_ICON} style={styles.bannerIcon} />
      <View style={[styles.bannerRule, { backgroundColor: colors.tint }]} />
    </LinearGradient>
  );
}

type DashboardAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  tone: 'navy' | 'teal' | 'gold';
};

const studentDashboardActions: DashboardAction[] = [
  { id: 'find-teacher', title: 'ابحث عن معلم', subtitle: 'معلمون مناسبون لك', icon: 'user-plus', tone: 'teal' },
  { id: 'subscriptions', title: 'الباقات والاشتراكات', subtitle: 'خطتك ورصيدك', icon: 'award', tone: 'gold' },
  { id: 'smart-teacher', title: 'المدرس الذكي', subtitle: 'مساعدة أثناء التعلم', icon: 'zap', tone: 'navy' },
  { id: 'materials', title: 'المواد التعليمية', subtitle: 'دروسك وملفاتك', icon: 'book-open', tone: 'teal' },
  { id: 'bookings', title: 'الجلسات والحجوزات', subtitle: 'مواعيدك القادمة', icon: 'video', tone: 'navy' },
  { id: 'assignments', title: 'الواجبات والاختبارات', subtitle: 'تابع إنجازك', icon: 'check-square', tone: 'gold' },
];

const teacherDashboardActions: DashboardAction[] = [
  { id: 'teacher-schedule', title: 'جدول المعلّم', subtitle: 'حصصك وتوفرك', icon: 'calendar', tone: 'navy' },
  { id: 'students', title: 'قائمة الطلاب', subtitle: 'طلابك وتقدمهم', icon: 'users', tone: 'teal' },
  { id: 'review', title: 'مراجعة الواجبات', subtitle: 'تسليمات تحتاج مراجعة', icon: 'check-square', tone: 'gold' },
  { id: 'teacher-materials', title: 'المواد التعليمية', subtitle: 'مواد جلساتك', icon: 'book-open', tone: 'teal' },
  { id: 'wallet', title: 'المحفظة والأرباح', subtitle: 'رصيدك وطلبات السحب', icon: 'credit-card', tone: 'gold' },
  { id: 'teacher-sessions', title: 'الجلسات والحجوزات', subtitle: 'نظرة على مواعيدك', icon: 'clock', tone: 'navy' },
];

export function DashboardActions({ role, onAction, showSmartTeacher = true }: { role: Role; onAction: (id: string) => void; showSmartTeacher?: boolean }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const actions = (role === 'student' ? studentDashboardActions : teacherDashboardActions)
    .filter((action) => action.id !== 'smart-teacher' || showSmartTeacher);
  const translations: Record<string, string> = {
    'ابحث عن معلم': 'Find a teacher',
    'معلمون مناسبون لك': 'Teachers matched to you',
    'الباقات والاشتراكات': 'Plans and subscriptions',
    'خطتك ورصيدك': 'Your plan and balance',
    'المدرس الذكي': 'AI tutor',
    'مساعدة أثناء التعلم': 'Learning support',
    'المواد التعليمية': 'Learning materials',
    'دروسك وملفاتك': 'Your lessons and files',
    'الجلسات والحجوزات': 'Sessions and bookings',
    'مواعيدك القادمة': 'Your upcoming schedule',
    'الواجبات والاختبارات': 'Assignments and quizzes',
    'تابع إنجازك': 'Track your progress',
    'جدول المعلّم': 'Teacher schedule',
    'حصصك وتوفرك': 'Your sessions and availability',
    'قائمة الطلاب': 'Students',
    'طلابك وتقدمهم': 'Your students and their progress',
    'مراجعة الواجبات': 'Review assignments',
    'تسليمات تحتاج مراجعة': 'Submissions to review',
    'مواد جلساتك': 'Your session materials',
    'المحفظة والأرباح': 'Wallet and earnings',
    'رصيدك وطلبات السحب': 'Balance and withdrawals',
    'نظرة على مواعيدك': 'Your schedule at a glance',
  };
  return (
      <View style={[
        styles.dashboardActions,
        role === 'student'
          ? [styles.studentToolsSurface, { backgroundColor: colors.card, borderColor: colors.border }]
          : [styles.teacherToolsSurface, { backgroundColor: colors.card, borderColor: colors.border }],
      ]}>
      <SectionHeading title={role === 'student' ? t('أدوات الطالب', 'Student tools') : t('أدوات المعلّم', 'Teacher tools')} />
      <View style={[styles.dashboardActionGrid, role === 'student' && styles.studentToolsGrid]}>
        {actions.map((action) => {
          const isSubscriptionsCard = action.id === 'subscriptions';
          const iconColor = action.tone === 'navy' ? colors.primary : action.tone === 'gold' ? colors.accentForeground : colors.teal;
          const iconBackground = action.tone === 'navy' ? colors.navySoft : action.tone === 'gold' ? colors.goldSoft : colors.tealSoft;
          const depthColor = action.tone === 'navy' ? colors.navySoft : action.tone === 'gold' ? colors.goldSoft : colors.tealSoft;
          return (
            <View key={action.id} style={[styles.dashboardActionWrap, isSubscriptionsCard && styles.dashboardSubscriptionsAction]}>
              <View style={[styles.dashboardActionBackplate, { backgroundColor: depthColor, borderColor: colors.border }]} />
              <Pressable
                testID={`dashboard-action-${action.id}`}
                accessibilityRole="button"
                accessibilityLabel={t(action.title, translations[action.title] ?? action.title)}
                onPress={() => onAction(action.id)}
                style={({ pressed }) => [styles.dashboardAction, { borderColor: colors.border }, pressed && styles.cardPressed]}
              >
                <LinearGradient
                  colors={isSubscriptionsCard ? [colors.card, colors.goldSoft] : [colors.card, depthColor]}
                  start={{ x: 0.05, y: 0 }}
                  end={{ x: 0.95, y: 1 }}
                  style={styles.dashboardActionGradient}
                >
                  <View style={[styles.dashboardActionGlow, { backgroundColor: iconBackground }]} />
                  <View style={[styles.dashboardActionAccent, { backgroundColor: iconColor }]} />
                  <View style={[styles.dashboardActionIcon, { backgroundColor: iconBackground, borderColor: colors.card }]}>
                    <Icon name={action.icon} size={20} color={iconColor} />
                    <View style={[styles.dashboardActionIconDot, { backgroundColor: iconColor }]} />
                  </View>
                  <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.dashboardActionTitle, { color: colors.foreground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{t(action.title, translations[action.title] ?? action.title)}</Text>
                  <Text style={[styles.dashboardActionSubtitle, { color: colors.mutedForeground, writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{t(action.subtitle, translations[action.subtitle] ?? action.subtitle)}</Text>
                  <View style={[styles.dashboardActionArrow, { backgroundColor: colors.card }]}>
                    <Icon name={direction === 'rtl' ? 'arrow-left' : 'arrow-right'} size={13} color={iconColor} />
                  </View>
                </LinearGradient>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  revealFill: { flex: 1 },
  scrollContent: { paddingHorizontal: 18 },
  headerShell: { marginBottom: 14 },
  brandBar: { minHeight: 50, borderRadius: 19, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7, alignItems: 'center', gap: 9, marginBottom: 10, shadowColor: '#173E8C', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  brandCopy: { flex: 1 },
  brandName: { fontSize: 13, lineHeight: 17, fontFamily: 'Inter_700Bold' },
  brandTagline: { fontSize: 8, lineHeight: 12, marginTop: 1, fontFamily: 'Inter_500Medium' },
  brandLogoFrame: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brandLogo: { width: 25, height: 25, borderRadius: 8 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  headerSpacer: { width: 42 },
  eyebrow: { maxWidth: '100%', fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium', marginTop: 2, writingDirection: 'rtl' },
  headerTitle: { fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontFamily: 'Inter_700Bold', writingDirection: 'rtl', flexShrink: 1 },
  avatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#173E8C', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  avatarText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  bell: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', shadowColor: '#173E8C', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 5, top: 8, right: 8, borderWidth: 2 },
  roleSwitcher: { flexDirection: 'row', padding: 4, borderRadius: 15, alignSelf: 'flex-end', marginBottom: 17, gap: 2, borderWidth: 1, borderColor: 'rgba(23,62,140,0.06)' },
  roleItem: { minWidth: 91, height: 35, paddingHorizontal: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  roleText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pressed: { opacity: 0.72 },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  banner: { minHeight: 224, borderRadius: 25, padding: 21, overflow: 'hidden', marginBottom: 28, position: 'relative', shadowColor: '#173E8C', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  bannerCopy: { alignItems: 'flex-end', zIndex: 2 },
  bannerKicker: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-end' },
  liveDot: { width: 6, height: 6, borderRadius: 4 },
  bannerEyebrow: { fontSize: 11, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  bannerTitle: { fontSize: 29, lineHeight: 36, letterSpacing: -0.6, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginTop: 11 },
  bannerBody: { fontSize: 12, marginTop: 8, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  bannerButton: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, alignSelf: 'flex-end' },
  bannerButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  bannerIcon: { position: 'absolute', width: 152, height: 152, left: -31, bottom: -42, opacity: 0.16, borderRadius: 42 },
  bannerDecorOne: { position: 'absolute', width: 215, height: 215, borderRadius: 108, opacity: 0.08, left: -99, top: -68 },
  bannerDecorTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, opacity: 0.12, right: -45, bottom: -39 },
  bannerRule: { position: 'absolute', width: 52, height: 3, borderRadius: 2, left: 21, top: 22, opacity: 0.6 },
  dashboardActions: { marginBottom: 10 },
  studentToolsSurface: { borderRadius: 24, borderWidth: 1, padding: 14, marginBottom: 16, shadowColor: '#173E8C', shadowOpacity: 0.045, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  teacherToolsSurface: { borderRadius: 24, borderWidth: 1, padding: 14, marginBottom: 16, shadowColor: '#173E8C', shadowOpacity: 0.055, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  dashboardActionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 18 },
  studentToolsGrid: { marginBottom: 0 },
  dashboardActionWrap: { width: '48.5%', minHeight: 140, position: 'relative', overflow: 'visible' },
  dashboardActionBackplate: { position: 'absolute', left: 3, right: -3, top: 5, bottom: -5, borderRadius: 23, borderWidth: 1, opacity: 0.52 },
  dashboardAction: { width: '100%', minHeight: 140, borderRadius: 23, borderWidth: 1, overflow: 'hidden', shadowColor: '#173E8C', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  dashboardSubscriptionsAction: { shadowColor: '#B87916', shadowOpacity: 0.08 },
  dashboardActionGradient: { flex: 1, minHeight: 138, padding: 14, alignItems: 'flex-end', position: 'relative', overflow: 'hidden' },
  dashboardActionGlow: { position: 'absolute', width: 132, height: 132, borderRadius: 66, top: -66, left: -50, opacity: 0.2 },
  dashboardActionAccent: { position: 'absolute', width: 30, height: 4, borderRadius: 4, top: 13, left: 13, opacity: 0.7 },
  dashboardActionIcon: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 9, position: 'relative', shadowColor: '#173E8C', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  dashboardActionIconDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, top: 6, right: 6 },
  dashboardActionTitle: { width: '100%', flexShrink: 1, fontSize: 13.5, lineHeight: 19, minHeight: 38, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  dashboardActionSubtitle: { width: '100%', fontSize: 10, lineHeight: 15, minHeight: 15, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  dashboardActionArrow: { position: 'absolute', bottom: 13, left: 13, width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', shadowColor: '#173E8C', shadowOpacity: 0.08, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 1 },
  sectionTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionMark: { width: 4, height: 16, borderRadius: 3 },
  sectionTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, letterSpacing: -0.15, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  sectionActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionAction: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  sessionCard: { minHeight: 108, borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 9, shadowColor: '#173E8C', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  sessionDate: { width: 58, height: 74, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sessionDateDay: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  sessionDateMonth: { fontSize: 9, marginTop: 3, fontFamily: 'Inter_600SemiBold' },
  sessionBody: { flex: 1, alignItems: 'flex-end' },
  sessionTopline: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionSubject: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  sessionStatusBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  sessionStatusDot: { width: 5, height: 5, borderRadius: 3 },
  sessionStatusText: { fontSize: 8, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  sessionTitle: { width: '100%', fontSize: 14, lineHeight: 18, fontFamily: 'Inter_700Bold', marginTop: 5, textAlign: 'right', writingDirection: 'rtl' },
  sessionMeta: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 7 },
  sessionInfoPill: { minHeight: 24, borderRadius: 7, paddingHorizontal: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  sessionPerson: { flex: 1, fontSize: 9, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  joinSessionButton: { minHeight: 28, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-end' },
  joinSessionText: { fontSize: 8, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  cancelled: { fontSize: 10, marginTop: 5, fontFamily: 'Inter_600SemiBold' },
  cancelButton: { padding: 5 },
  assignmentRow: { minHeight: 112, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', padding: 13, gap: 11, marginBottom: 10, shadowColor: '#173E8C', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3, position: 'relative', overflow: 'hidden' },
  assignmentAccent: { position: 'absolute', top: 14, bottom: 14, left: 0, width: 4, borderRadius: 3 },
  assignmentIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  assignmentMain: { flex: 1, alignItems: 'flex-end' },
  assignmentTitleLine: { flexDirection: 'row', width: '100%', alignItems: 'flex-start', gap: 7 },
  assignmentTitle: { flex: 1, textAlign: 'right', fontSize: 13, lineHeight: 18, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, marginTop: 1 },
  badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  assignmentMeta: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 7 },
  assignmentSubject: { maxWidth: '42%', textAlign: 'right', fontSize: 10, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  assignmentDue: { flexShrink: 1, textAlign: 'right', fontSize: 10, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  assignmentMetaDot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 2 },
  assignmentSubmission: { flexShrink: 1, fontSize: 9, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  assignmentProgressHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  assignmentProgressLabel: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  percent: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  assignmentProgressTrack: { width: '100%', height: 6, borderRadius: 4, overflow: 'hidden', marginTop: 5 },
  assignmentProgressFill: { height: '100%', borderRadius: 4 },
  assignmentArrow: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  emptyState: { borderRadius: 18, borderWidth: 1, alignItems: 'center', padding: 18, marginTop: 4, position: 'relative', overflow: 'hidden', shadowColor: '#173E8C', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  emptyGlow: { position: 'absolute', width: 170, height: 170, borderRadius: 85, top: -112, right: -66, opacity: 0.72 },
  emptyIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 9, shadowColor: '#173E8C', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center', writingDirection: 'rtl' },
  emptyBody: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 4, maxWidth: 270, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  smallButton: { borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8, marginTop: 12 },
  smallButtonText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  loadingBlock: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12, minHeight: 112, shadowColor: '#173E8C', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  loadingDot: { width: 32, height: 32, borderRadius: 12, alignSelf: 'flex-end', marginBottom: 12 },
  loadingLine: { height: 12, width: '64%', borderRadius: 6, alignSelf: 'flex-end' },
  loadingShort: { width: '36%', marginTop: 10 },
  loadingBox: { height: 6, width: '100%', borderRadius: 4, marginTop: 18 },
});