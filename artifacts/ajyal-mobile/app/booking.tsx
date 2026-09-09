import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCreateBookingRequest, useCreateBookingRequestGroup } from '@workspace/api-client-react';
import { getListBookingRequestsQueryKey, getListTeachersQueryKey, useListTeachers } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Header, Icon, Screen } from '@/components/AjyalUI';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { dayIsAvailable, normalizeDays, parseClock } from '@/lib/teacherAvailability';
import { OptionDropdown } from '@/components/OptionDropdown';
import { TEACHING_STAGES } from '@/constants/education';

type BalanceBooking = {
  teacher_id: string;
  subject_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
};

type BalanceRequest = {
  accepted_by: string | null;
  subject_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
};

type SelectedBookingSlot = {
  dayOffset: number;
  hour: number;
};

type BookingSuccessSummary = {
  count: number;
  subject: string;
  durationMinutes: number;
  slots: Array<{ label: string; time: string }>;
};

const MAX_GROUP_SLOTS = 20;

function requestMatchesBooking(request: BalanceRequest, booking: BalanceBooking) {
  return request.status === 'accepted'
    && Boolean(request.accepted_by)
    && request.accepted_by === booking.teacher_id
    && request.subject_id === booking.subject_id
    && new Date(request.scheduled_at).getTime() === new Date(booking.scheduled_at).getTime()
    && request.duration_minutes === booking.duration_minutes;
}

function reservedMinutesForBooking(bookings: BalanceBooking[], requests: BalanceRequest[]) {
  const matchedBookingIndexes = new Set<number>();
  let unmatchedRequestMinutes = 0;
  for (const request of requests) {
    const bookingIndex = bookings.findIndex((booking, index) => !matchedBookingIndexes.has(index) && requestMatchesBooking(request, booking));
    if (bookingIndex >= 0) {
      matchedBookingIndexes.add(bookingIndex);
    } else {
      unmatchedRequestMinutes += Math.max(0, request.duration_minutes);
    }
  }
  return bookings.reduce((sum, booking) => sum + Math.max(0, booking.duration_minutes), 0) + unmatchedRequestMinutes;
}

export default function BookingScreen() {
  const colors = useColors();
  const { profile } = useAjyal();
  const { user } = useAuth();
  const { t, locale, direction, formatNumber } = useAppPreferences();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams() as Record<string, string | string[]>;
  const paramString = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : value?.length === 1 ? value[0] : value?.length ? JSON.stringify(value) : '';
  };
  const [subject, setSubject] = useState('');
  const [teachingStage, setTeachingStage] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [selectedSlots, setSelectedSlots] = useState<SelectedBookingSlot[]>([]);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<BookingSuccessSummary | null>(null);
  const showCreateSuccess = (count: number) => {
    setCreateError(null);
    void queryClient.invalidateQueries({ queryKey: getListBookingRequestsQueryKey({ view: 'mine' }) });
    setCreateSuccess({
      count,
      subject: subject.trim(),
      durationMinutes: durationMinutes ?? 0,
      slots: selectedSlots.map((slot) => {
        const day = dayOptions.find((option) => option.offset === slot.dayOffset);
        return {
          label: `${day?.label ?? t('اليوم', 'Today')} ${day?.dateLabel ?? ''}`,
          time: new Date(2000, 0, 1, slot.hour).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }),
        };
      }),
    });
  };
  const showCreateError = (error: unknown) => {
    const responseData = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: unknown }).data
      : null;
    const platformMessage = responseData && typeof responseData === 'object' && 'error' in responseData && typeof responseData.error === 'string'
      ? responseData.error
      : null;
    const message = platformMessage || (error instanceof Error ? error.message : '');
    const visibleMessage = message || 'تحقق من البيانات والاشتراك والاتصال ثم حاول مرة أخرى.';
    setCreateError(visibleMessage);
    Alert.alert('تعذر إنشاء طلب الحجز', visibleMessage);
  };
  const createMutation = useCreateBookingRequest({
    mutation: {
      onSuccess: () => showCreateSuccess(1),
      onError: showCreateError,
    },
  });
  const groupMutation = useCreateBookingRequestGroup({
    mutation: {
      onSuccess: (requests) => showCreateSuccess(requests.length),
      onError: showCreateError,
    },
  });
  const teacherName = paramString('teacherName');
  const teacherId = paramString('teacherId');
  const teacherRate = paramString('teacherHourlyRate');
  const availableFrom = paramString('teacherAvailableFrom');
  const availableTo = paramString('teacherAvailableTo');
  const openTeachersQuery = useListTeachers(
    undefined,
    { query: { enabled: !teacherId, queryKey: getListTeachersQueryKey(undefined), staleTime: 30_000 } },
  );
  const openTeachers = openTeachersQuery.data ?? [];
  const openSubjectTeachers = useMemo(() => {
    const selectedSubject = subject.trim();
    if (!selectedSubject) return [];
    return openTeachers.filter((teacher) => (
      teacher.subjects?.includes(selectedSubject)
      && (!teachingStage || teacher.teachingStages?.includes(teachingStage))
    ));
  }, [openTeachers, subject, teachingStage]);
  const availableDays = useMemo(() => {
    return normalizeDays(paramString('teacherAvailableDays'));
  }, [params.teacherAvailableDays]);
  useEffect(() => {
    if (!teachingStage && profile?.teachingStage) setTeachingStage(profile.teachingStage);
  }, [profile?.teachingStage, teachingStage]);
  useEffect(() => {
    if (!createSuccess) return undefined;
    const timeout = setTimeout(() => router.replace('/(tabs)/bookings'), 4200);
    return () => clearTimeout(timeout);
  }, [createSuccess]);
  useEffect(() => {
    let mounted = true;
    const loadBalance = async () => {
      if (!supabase || !user) {
        if (mounted) setBalanceLoading(false);
        return;
      }
      setBalanceLoading(true);
      const now = new Date();
      const nowIso = now.toISOString();
      const [subscriptionsResult, bookingsResult, requestsResult] = await Promise.all([
        supabase
          .from('user_subscriptions')
          .select('remaining_minutes, session_duration_minutes, is_active, ends_at')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .gt('remaining_minutes', 0)
          .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
          .order('ends_at', { ascending: true }),
        supabase
          .from('bookings')
          .select('teacher_id, subject_id, scheduled_at, duration_minutes, status')
          .eq('student_id', user.id)
          .in('status', ['pending', 'confirmed'])
          .gte('scheduled_at', nowIso),
        supabase
          .from('booking_requests')
          .select('accepted_by, subject_id, scheduled_at, duration_minutes, status')
          .eq('student_id', user.id)
          .in('status', ['open', 'accepted'])
          .gte('scheduled_at', nowIso)
          .or(`expires_at.is.null,expires_at.gte.${nowIso}`),
      ]);
      if (!mounted) return;
      if (subscriptionsResult.error || bookingsResult.error || requestsResult.error) {
        setRemainingMinutes(null);
        setBalanceLoading(false);
        return;
      }
      const total = (subscriptionsResult.data ?? []).reduce((sum, row) => sum + (typeof row.remaining_minutes === 'number' ? row.remaining_minutes : 0), 0);
      const subscriptionDuration = subscriptionsResult.data?.find(
        (row) => typeof row.session_duration_minutes === 'number' && row.session_duration_minutes > 0,
      )?.session_duration_minutes;
      if (typeof subscriptionDuration === 'number') setDurationMinutes(subscriptionDuration);
      const reserved = reservedMinutesForBooking(
        (bookingsResult.data ?? []) as BalanceBooking[],
        (requestsResult.data ?? []) as BalanceRequest[],
      );
      setRemainingMinutes(Math.max(0, total - reserved));
      setBalanceLoading(false);
    };
    void loadBalance();
    return () => {
      mounted = false;
    };
  }, [user?.id]);
  useEffect(() => {
    let mounted = true;
    const loadSubjects = async () => {
      if (!supabase) {
        if (mounted) {
          setAvailableSubjects([]);
          setSubjectsError(true);
          setSubjectsLoading(false);
        }
        return;
      }
      setSubjectsLoading(true);
      setSubjectsError(false);
      if (!teacherId) {
        const subjectsResult = await supabase
          .from('subjects')
          .select('id, name')
          .order('name');
        if (!mounted) return;
        if (subjectsResult.error) {
          setAvailableSubjects([]);
          setSubjectsError(true);
          setSubjectsLoading(false);
          return;
        }
        setAvailableSubjects((subjectsResult.data ?? []).filter(
          (item): item is { id: string; name: string } => typeof item.id === 'string' && typeof item.name === 'string',
        ));
        setSubjectsLoading(false);
        return;
      }
      const profileResult = await supabase
        .from('public_teacher_profiles')
        .select('id')
        .eq('user_id', teacherId)
        .maybeSingle();
      if (profileResult.error || !profileResult.data?.id) {
        if (mounted) {
          setAvailableSubjects([]);
          setSubjectsError(true);
          setSubjectsLoading(false);
        }
        return;
      }
      const subjectsResult = await supabase
        .from('teacher_subjects')
        .select('subject_id, subjects(id, name)')
        .eq('teacher_id', profileResult.data.id);
      if (!mounted) return;
      if (subjectsResult.error) {
        setAvailableSubjects([]);
        setSubjectsError(true);
        setSubjectsLoading(false);
        return;
      }
      const subjects = (subjectsResult.data ?? []).flatMap((row) => {
        const subject = row.subjects;
        if (!subject || typeof subject !== 'object' || Array.isArray(subject)) return [];
        const value = subject as { id?: unknown; name?: unknown };
        return typeof value.id === 'string' && typeof value.name === 'string'
          ? [{ id: value.id, name: value.name }]
          : [];
      });
      setAvailableSubjects(subjects);
      setSubjectsLoading(false);
    };
    void loadSubjects();
    return () => {
      mounted = false;
    };
  }, [teacherId]);
  const subjectOptions = availableSubjects;
  const effectiveAvailableDays = useMemo(() => {
    if (teacherId) return availableDays;
    const days = new Set<string>();
    openSubjectTeachers.forEach((teacher) => normalizeDays(teacher.availableDays).forEach((day) => days.add(day)));
    return [...days];
  }, [availableDays, openSubjectTeachers, teacherId]);
  const dayOptions = useMemo(() => {
    const allDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + index);
      return {
        offset: index,
        date,
         label: index === 0 ? t('اليوم', 'Today') : date.toLocaleDateString(locale, { weekday: 'short' }),
         dateLabel: date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      };
    });
    const filteredDays = allDays.filter((option) => {
       return dayIsAvailable(effectiveAvailableDays, option.date);
    });
    return filteredDays;
  }, [effectiveAvailableDays, locale, t]);
  const timeOptions = useMemo(() => {
    const duration = durationMinutes ?? 60;
    const now = new Date();
    const activeDayOffset = dayOptions.some((option) => option.offset === selectedDayOffset)
      ? selectedDayOffset
      : dayOptions[0]?.offset ?? selectedDayOffset;
    const earliestToday = activeDayOffset === 0 ? (now.getHours() + 1) * 60 : 0;
    const selectedDay = dayOptions.find((option) => option.offset === activeDayOffset)?.date;
    if (!selectedDay) return [];
    const slots = new Set<number>();
    const addWindow = (fromValue: string | null | undefined, toValue: string | null | undefined, daysValue: unknown) => {
      if (!dayIsAvailable(normalizeDays(daysValue), selectedDay)) return;
      const from = parseClock(fromValue);
      const to = parseClock(toValue);
      if (from === null || to === null || to <= from) return;
      const firstStartHour = Math.ceil(Math.max(from, earliestToday) / 60);
      const lastStartHour = Math.floor((to - duration) / 60);
      for (let hour = firstStartHour; hour <= lastStartHour; hour += 1) slots.add(hour);
    };
    if (teacherId) {
      if (!availableFrom || !availableTo) return [];
      addWindow(availableFrom, availableTo, availableDays);
    } else {
      openSubjectTeachers.forEach((teacher) => addWindow(teacher.availableFrom, teacher.availableTo, teacher.availableDays));
    }
    return [...slots].sort((left, right) => left - right);
  }, [availableDays, availableFrom, availableTo, dayOptions, durationMinutes, openSubjectTeachers, selectedDayOffset, teacherId]);
  const activeDayOffset = dayOptions.some((option) => option.offset === selectedDayOffset)
    ? selectedDayOffset
    : dayOptions[0]?.offset ?? selectedDayOffset;
  const slotStartsAt = (slot: SelectedBookingSlot) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + slot.dayOffset);
    date.setHours(slot.hour, 0, 0, 0);
    return date.toISOString();
  };
  const hasSelectedAvailability = dayOptions.length > 0 && timeOptions.length > 0;
  const hasKnownTeacherSubject = teacherId
    ? subjectsLoading || subjectsError || availableSubjects.length === 0 || availableSubjects.some((item) => item.name === subject.trim())
    : !subjectsLoading && availableSubjects.some((item) => item.name === subject.trim());
  const isSubmitting = createMutation.isPending || groupMutation.isPending;
  const requestedMinutes = (durationMinutes ?? 0) * selectedSlots.length;
  const projectedRemainingMinutes = remainingMinutes === null
    ? null
    : Math.max(0, remainingMinutes - requestedMinutes);
  const canSubmit = Boolean(subject.trim() && (teacherId || teachingStage) && hasSelectedAvailability && hasKnownTeacherSubject && selectedSlots.length > 0 && durationMinutes !== null && !subjectsLoading)
    && remainingMinutes !== null
    && durationMinutes !== null
    && remainingMinutes >= requestedMinutes
    && !isSubmitting;

  const toggleSlot = (hour: number) => {
    const existing = selectedSlots.some((slot) => slot.dayOffset === activeDayOffset && slot.hour === hour);
    if (existing) {
      setSelectedSlots((current) => current.filter((slot) => !(slot.dayOffset === activeDayOffset && slot.hour === hour)));
      return;
    }
    if (selectedSlots.length >= MAX_GROUP_SLOTS) {
      Alert.alert('وصلت للحد الأقصى', `يمكن اختيار ${MAX_GROUP_SLOTS} موعداً في المجموعة الواحدة.`);
      return;
    }
    setSelectedSlots((current) => [...current, { dayOffset: activeDayOffset, hour }]);
  };
  const chooseSubject = (value: string) => {
    setSubject(value);
    setSelectedSlots([]);
  };
  const chooseTeachingStage = (value: string) => {
    setTeachingStage(value);
    setSelectedSlots([]);
  };

  const submit = () => {
    setCreateError(null);
    if (!subject.trim() || (!teacherId && !teachingStage)) {
      Alert.alert('أكمل البيانات', 'اختر المرحلة الدراسية والمادة أولاً.');
      return;
    }
    if (durationMinutes === null) {
      Alert.alert('جارٍ التحقق من الاشتراك', 'انتظر حتى تتم قراءة مدة الجلسة من الباقة الفعالة.');
      return;
    }
    if (!selectedSlots.length) {
      Alert.alert('اختر موعداً', 'اضغط على وقت واحد على الأقل. يمكنك اختيار عدة مواعيد لإرسالها كمجموعة واحدة.');
      return;
    }
    if (remainingMinutes === null || requestedMinutes > remainingMinutes) {
      Alert.alert('الرصيد غير كافٍ', `تحتاج المجموعة إلى ${requestedMinutes} دقيقة، والمتاح ${remainingMinutes ?? 0} دقيقة.`);
      return;
    }
    if (teacherId && availableSubjects.length && !availableSubjects.some((item) => item.name === subject.trim())) {
      Alert.alert('المادة غير متاحة لهذا المعلم', 'اختر مادة مرتبطة بالمعلم من القائمة.');
      return;
    }
    if (!teacherId && !openSubjectTeachers.length) {
      Alert.alert('لا توجد مواعيد منشورة', 'لا توجد Availability منشورة لمعلم مؤهل لهذه المادة والمرحلة. اختر مادة أو موعداً آخر.');
      return;
    }
    const common = {
      teacherId: teacherId || undefined,
      subject: subject.trim(),
      teachingStage: teachingStage || undefined,
    };
    if (selectedSlots.length === 1) {
      createMutation.mutate({
        data: {
          ...common,
          startsAt: slotStartsAt(selectedSlots[0]),
          durationMinutes,
        },
      });
    } else {
      groupMutation.mutate({
        data: {
          ...common,
          slots: selectedSlots.map((slot) => ({
            startsAt: slotStartsAt(slot),
            durationMinutes,
          })),
        },
      });
    }
  };

  if (createSuccess) {
    return (
      <Screen>
        <Header onBack={() => router.replace('/(tabs)/bookings')} avatarText={profile?.displayName?.slice(0, 1)} eyebrow={t('تم إرسال طلبك', 'Request sent')} title={t('تم الحجز بنجاح', 'Booking submitted')} onAvatar={() => router.push('/profile')} />
        <View style={[styles.successHero, { backgroundColor: colors.primary }]}>
          <View style={[styles.successIcon, { backgroundColor: colors.tealSoft }]}>
            <Icon name="check" size={27} color={colors.teal} />
          </View>
          <Text style={[styles.successTitle, { color: colors.primaryForeground }]}>{t('تم إرسال طلب الحجز', 'Booking request sent')}</Text>
          <Text style={[styles.successBody, { color: colors.tint }]}>{createSuccess.count > 1 ? `تم إرسال ${createSuccess.count} مواعيد في طلب واحد.` : 'تم إرسال موعدك إلى المعلمين المؤهلين.'}</Text>
        </View>
        <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.successStatusRow}>
            <View style={[styles.successStatus, { backgroundColor: colors.goldSoft }]}>
              <Text style={[styles.successStatusText, { color: colors.accentForeground }]}>{t('بانتظار الرد', 'Pending response')}</Text>
            </View>
            <Text style={[styles.successSubject, { color: colors.foreground }]}>{createSuccess.subject}</Text>
          </View>
          <Text style={[styles.successMeta, { color: colors.mutedForeground }]}>{createSuccess.durationMinutes} {t('دقيقة لكل موعد', 'minutes per appointment')} · {createSuccess.count} {t('موعد', 'appointment(s)')}</Text>
          <View style={styles.successSlots}>
            {createSuccess.slots.map((slot, index) => (
              <View key={`${slot.label}-${slot.time}-${index}`} style={[styles.successSlot, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Icon name="calendar" size={14} color={colors.teal} />
                <Text style={[styles.successSlotText, { color: colors.foreground }]}>{slot.label} · {slot.time}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.successNotice, { backgroundColor: colors.tealSoft }]}>
            <Icon name="clock" size={15} color={colors.teal} />
            <Text style={[styles.successNoticeText, { color: colors.teal }]}>{t('صلاحية الطلب ساعة واحدة. يمكنك إلغاء الطلب من قائمة الحجوزات قبل قبول المعلم.', 'The request is valid for one hour. You can cancel it from bookings before teacher acceptance.')}</Text>
          </View>
          <Text style={[styles.successRedirect, { color: colors.mutedForeground }]}>{t('سيتم نقلك إلى صفحة الجلسات خلال ثوانٍ…', 'You will return to sessions in a few seconds…')}</Text>
          <Pressable onPress={() => router.replace('/(tabs)/bookings')} style={[styles.successButton, { backgroundColor: colors.teal }]}>
            <Text style={[styles.successButtonText, { color: colors.primaryForeground }]}>{t('عرض الحجوزات الآن', 'View bookings now')}</Text>
            <Icon name="arrow-left" size={15} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} eyebrow="خطوتك التالية" title="حجز جلسة" onAvatar={() => router.push('/profile')} />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}><Icon name="calendar" size={23} color={colors.teal} /></View>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>احجز جلسة تعلم</Text>
          <Text style={[styles.heroBody, { color: colors.tint }]}>
            {teacherId
              ? 'اختر مادة وموعداً من التوفر المعلن للمعلم. مدة الجلسة يحددها اشتراكك الفعال.'
              : 'اختر المرحلة والمادة والموعد. سيصل الطلب إلى المعلمين المؤهلين لنفس المرحلة والمادة.'}
          </Text>
        </View>
      </View>
      <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {!teacherId ? (
          <View style={[styles.modeSwitch, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Pressable
              testID="booking-mode-open"
              onPress={() => undefined}
              style={[styles.modeOption, { backgroundColor: colors.card, borderColor: colors.teal }]}
            >
              <Text style={[styles.modeText, { color: colors.teal }]}>طلب مفتوح</Text>
              <Text style={[styles.modeHint, { color: colors.mutedForeground }]}>للمعلمين المؤهلين</Text>
            </Pressable>
            <Pressable
              testID="booking-mode-specific"
              onPress={() => router.push('/find-teacher')}
              style={styles.modeOption}
            >
              <Text style={[styles.modeText, { color: colors.mutedForeground }]}>معلم محدد</Text>
              <Text style={[styles.modeHint, { color: colors.mutedForeground }]}>اختر بطاقته أولاً</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.selectedTeacherCard, { backgroundColor: colors.tealSoft, borderColor: colors.teal }]}>
              <View style={styles.selectedTeacherCopy}>
                <Text style={[styles.selectedTeacherLabel, { color: colors.mutedForeground }]}>المعلم المحدد</Text>
                <Text style={[styles.selectedTeacherName, { color: colors.foreground }]}>{teacherName || 'معلم من المنصة'}</Text>
                {teacherRate ? <Text style={[styles.helper, { color: colors.mutedForeground }]}>{teacherRate} ر.س/ساعة</Text> : null}
              </View>
              <Icon name="user" size={21} color={colors.teal} />
            </View>
            <Pressable testID="booking-change-teacher" onPress={() => router.push('/find-teacher')} style={[styles.changeTeacher, { borderColor: colors.border }]}>
              <Text style={[styles.changeTeacherText, { color: colors.mutedForeground }]}>تغيير المعلم</Text>
              <Icon name="chevron-left" size={16} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
        {!teacherId && openTeachersQuery.isLoading ? <Text style={[styles.availabilityEmpty, { color: colors.mutedForeground }]}>جارٍ قراءة Availability المعلمين المؤهلين…</Text> : null}
        {!teacherId && openTeachersQuery.isError ? <Text style={[styles.availabilityEmpty, { color: colors.destructive }]}>تعذر قراءة المعلمين المؤهلين من المنصة.</Text> : null}
         {!balanceLoading && projectedRemainingMinutes !== null ? <View style={[styles.balanceCard, { backgroundColor: projectedRemainingMinutes > 0 ? colors.tealSoft : colors.accent, borderColor: projectedRemainingMinutes > 0 ? colors.teal : colors.border }]}>
           <View style={styles.balanceCopy}>
             <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{selectedSlots.length ? 'المتاح بعد الاختيار' : 'الرصيد المتاح للحجز'}</Text>
             {selectedSlots.length ? <Text style={[styles.balanceSubtext, { color: colors.mutedForeground }]}>قبل الاختيار: {remainingMinutes} دقيقة · محجوز مؤقتاً: {requestedMinutes} دقيقة</Text> : null}
           </View>
           <Text style={[styles.balanceValue, { color: projectedRemainingMinutes > 0 ? colors.teal : colors.destructive }]}>{projectedRemainingMinutes > 0 ? `${projectedRemainingMinutes} دقيقة` : 'لا يوجد رصيد'}</Text>
         </View> : null}
         {!teacherId ? <>
            <OptionDropdown
              label="المرحلة الدراسية"
              value={teachingStage}
              placeholder="اختر المرحلة الدراسية"
              options={[...TEACHING_STAGES]}
              onChange={chooseTeachingStage}
              testID="booking-stage-dropdown"
            />
         </> : null}
          <OptionDropdown
            label="المادة"
            value={subject}
            placeholder={teacherId ? "اختر مادة هذا المعلم" : "اختر المادة"}
            options={subjectOptions.map((item) => item.name)}
            onChange={chooseSubject}
            testID="booking-subject-dropdown"
            loading={subjectsLoading}
            disabled={subjectsError}
          />
         {!teacherId && subject && !openTeachersQuery.isLoading ? <Text style={[styles.matchingTeachers, { color: openSubjectTeachers.length ? colors.teal : colors.destructive }]}>{openSubjectTeachers.length ? `${openSubjectTeachers.length} معلم متخصص متاح لهذه المادة والمرحلة` : 'لا يوجد معلم مؤهل لهذه المادة والمرحلة حالياً'}</Text> : null}
        {subjectsLoading ? <Text style={[styles.availabilityEmpty, { color: colors.mutedForeground }]}>جارٍ قراءة مواد المعلم من المنصة…</Text> : null}
         {subjectsError ? <Text style={[styles.availabilityEmpty, { color: colors.destructive }]}>تعذر قراءة قائمة المواد من المنصة. أعد فتح الصفحة بعد التحقق من الاتصال.</Text> : null}
        <Text style={[styles.label, { color: colors.foreground }]}>اليوم</Text>
        {dayOptions.length ? (
          <View style={styles.optionRow}>
            {dayOptions.map((option) => (
              <Pressable
                key={option.offset}
                testID={`booking-day-${option.offset}`}
                onPress={() => setSelectedDayOffset(option.offset)}
                style={[styles.dayOption, { backgroundColor: activeDayOffset === option.offset ? colors.tealSoft : colors.card, borderColor: activeDayOffset === option.offset ? colors.teal : colors.border }]}
              >
                <Text style={[styles.dayLabel, { color: activeDayOffset === option.offset ? colors.teal : colors.mutedForeground }]}>{option.label}</Text>
                <Text style={[styles.dayDate, { color: activeDayOffset === option.offset ? colors.teal : colors.foreground }]}>{option.dateLabel}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[styles.availabilityEmpty, { color: colors.mutedForeground }]}>
            {teacherId && availableDays.length
              ? t('جدول المعلم لا يحتوي على يوم متاح خلال الأيام السبعة القادمة.', 'The teacher has no available day in the next seven days.')
              : teacherId
                ? t('لم تصل أيام توفر المعلم من المنصة.', 'The teacher availability days did not arrive from the platform.')
                : t('اختر مادة لعرض الأيام المنشورة للمعلمين المؤهلين.', 'Choose a subject to show days published by eligible teachers.')}
          </Text>
        )}
        <Text style={[styles.label, { color: colors.foreground }]}>الوقت</Text>
        {timeOptions.length ? (
          <View style={styles.timeRow}>
            {timeOptions.map((hour) => (
              <Pressable
                key={hour}
                testID={`booking-time-${hour}`}
                onPress={() => toggleSlot(hour)}
                style={[styles.timeOption, { backgroundColor: selectedSlots.some((slot) => slot.dayOffset === activeDayOffset && slot.hour === hour) ? colors.tealSoft : colors.card, borderColor: selectedSlots.some((slot) => slot.dayOffset === activeDayOffset && slot.hour === hour) ? colors.teal : colors.border }]}
              >
                <Text style={[styles.timeText, { color: selectedSlots.some((slot) => slot.dayOffset === activeDayOffset && slot.hour === hour) ? colors.teal : colors.mutedForeground }]}>{new Date(2000, 0, 1, hour).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' })}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[styles.availabilityEmpty, { color: colors.mutedForeground }]}>
            {dayOptions.length
              ? t('المعلم لم يحدد ساعات توفر بعد.', 'The teacher has not published available hours.')
              : t('اختر يوماً ومادة لهما Availability منشورة أولاً.', 'Choose a day and a subject with published availability first.')}
          </Text>
        )}
        <Text style={[styles.label, { color: colors.foreground }]}>مدة الجلسة</Text>
        <View style={[styles.durationRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
         <Text style={[styles.durationText, { color: colors.foreground }]}>{durationMinutes === null ? 'جارٍ قراءة مدة الجلسة من اشتراكك…' : `${durationMinutes} دقيقة لكل موعد · ${selectedSlots.length} محدد`}</Text>
        </View>
         {selectedSlots.length > 0 ? (
           <View style={[styles.selectedSlotsCard, { backgroundColor: colors.tealSoft, borderColor: colors.teal }]}>
             <Text style={[styles.selectedSlotsTitle, { color: colors.teal }]}>
               {selectedSlots.length} مواعيد محددة في طلب واحد
             </Text>
             <View style={styles.selectedSlotsList}>
               {selectedSlots.map((slot) => {
                 const day = dayOptions.find((option) => option.offset === slot.dayOffset);
                 return (
                   <Pressable
                     key={`${slot.dayOffset}-${slot.hour}`}
                     testID={`booking-selected-slot-${slot.dayOffset}-${slot.hour}`}
                     onPress={() => setSelectedSlots((current) => current.filter((candidate) => !(candidate.dayOffset === slot.dayOffset && candidate.hour === slot.hour)))}
                     style={[styles.selectedSlotChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                   >
                     <Text style={[styles.selectedSlotText, { color: colors.foreground }]}>
                       {day?.label ?? 'اليوم'} {day?.dateLabel ?? ''} · {new Date(2000, 0, 1, slot.hour).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' })}
                     </Text>
                     <Text style={[styles.selectedSlotRemove, { color: colors.destructive }]}>×</Text>
                   </Pressable>
                 );
               })}
             </View>
              <Text style={[styles.selectionSummary, { color: colors.mutedForeground }]}>
                إجمالي المجموعة: {requestedMinutes} دقيقة · المتبقي بعدها: {projectedRemainingMinutes ?? 0} دقيقة
              </Text>
              <Text style={[styles.selectionHint, { color: colors.teal }]}>اضغط على الموعد لإزالته. سيتم إرسالها كمجموعة حجز واحدة.</Text>
           </View>
         ) : null}
        {!balanceLoading && remainingMinutes !== null && durationMinutes !== null && remainingMinutes < requestedMinutes ? (
          <Text style={[styles.balanceWarning, { color: colors.destructive }]}>
             لا يمكن الحجز حالياً: تحتاج المجموعة إلى {requestedMinutes} دقيقة، والمتاح للحجز {remainingMinutes} دقيقة.
          </Text>
        ) : null}
         {createError ? <Text accessibilityRole="alert" style={[styles.submitError, { color: colors.destructive }]}>{createError}</Text> : null}
         {!canSubmit && !isSubmitting ? <Text style={[styles.submitHint, { color: colors.mutedForeground }]}>أكمل المرحلة والمادة والموعد، وتأكد من وجود رصيد واشتراك فعال وAvailability منشورة.</Text> : null}
         <Pressable testID="submit-booking" disabled={!canSubmit} onPress={submit} style={[styles.submit, { backgroundColor: canSubmit ? colors.teal : colors.muted }]}>
          <Icon name="check" size={18} color={colors.primaryForeground} />
           <Text style={[styles.submitText, { color: colors.primaryForeground }]}>{isSubmitting ? 'جارٍ إنشاء الحجز...' : selectedSlots.length > 1 ? `إرسال ${selectedSlots.length} مواعيد` : 'تأكيد الحجز'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 142, borderRadius: 23, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: 'flex-end', marginLeft: 14 },
  heroTitle: { width: '100%', fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  heroBody: { width: '100%', fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 7 },
  successHero: { borderRadius: 23, minHeight: 190, padding: 19, alignItems: 'flex-end', marginBottom: 14 },
  successIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  successTitle: { width: '100%', fontSize: 21, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  successBody: { width: '100%', fontSize: 11, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 7 },
  successCard: { borderRadius: 20, borderWidth: 1, padding: 15, gap: 11 },
  successStatusRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  successStatus: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  successStatusText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  successSubject: { flex: 1, fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  successMeta: { width: '100%', fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  successSlots: { gap: 7 },
  successSlot: { minHeight: 39, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  successSlotText: { flex: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl' },
  successNotice: { borderRadius: 11, padding: 10, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 7 },
  successNoticeText: { flex: 1, fontSize: 10, lineHeight: 16, fontFamily: 'Inter_500Medium', textAlign: 'right', writingDirection: 'rtl' },
  successRedirect: { width: '100%', fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'center', writingDirection: 'rtl' },
  successButton: { minHeight: 47, borderRadius: 13, width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  successButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  form: { borderRadius: 20, borderWidth: 1, padding: 15 },
  modeSwitch: { borderRadius: 15, borderWidth: 1, padding: 4, flexDirection: 'row-reverse', gap: 5, marginBottom: 15 },
  modeOption: { flex: 1, minHeight: 49, borderRadius: 11, borderWidth: 1, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  modeHint: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 3, writingDirection: 'rtl' },
  selectedTeacherCard: { minHeight: 66, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  selectedTeacherCopy: { flex: 1, alignItems: 'flex-end' },
  selectedTeacherLabel: { width: '100%', fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'right', writingDirection: 'rtl' },
  selectedTeacherName: { width: '100%', fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginTop: 3 },
  changeTeacher: { minHeight: 34, borderRadius: 10, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 7, marginBottom: 10 },
  changeTeacherText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  label: { width: '100%', fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginTop: 4, marginBottom: 8 },
  selector: { minHeight: 49, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  selectorText: { fontSize: 12, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  helper: { width: '100%', fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: -7, marginBottom: 10 },
  balanceCard: { minHeight: 48, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  balanceCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  balanceLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  balanceSubtext: { width: '100%', fontSize: 9, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  balanceValue: { fontSize: 12, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  input: { minHeight: 49, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 13 },
  optionRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  dayOption: { minWidth: 68, borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 7, alignItems: 'center' },
  dayLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dayDate: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 3 },
  timeRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  timeOption: { minWidth: 68, borderRadius: 11, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  timeText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  availabilityEmpty: { width: '100%', fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginBottom: 13 },
  durationRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 19 },
  duration: { flex: 1, minHeight: 43, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  durationText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  selectionSummary: { width: '100%', fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'right', writingDirection: 'rtl', marginTop: -10, marginBottom: 13 },
  selectionHint: { width: '100%', fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'right', writingDirection: 'rtl', marginTop: -7, marginBottom: 2 },
  balanceWarning: { width: '100%', fontSize: 11, lineHeight: 17, fontFamily: 'Inter_500Medium', textAlign: 'right', writingDirection: 'rtl', marginTop: -10, marginBottom: 13 },
  subjectOptions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginBottom: 8 },
  subjectOption: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  subjectOptionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  matchingTeachers: { width: '100%', fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl', marginTop: -4, marginBottom: 10 },
  selectedSlotsCard: { borderRadius: 13, borderWidth: 1, padding: 10, marginTop: -3, marginBottom: 13 },
  selectedSlotsTitle: { width: '100%', fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl', marginBottom: 7 },
  selectedSlotsList: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  selectedSlotChip: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  selectedSlotText: { fontSize: 9, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  selectedSlotRemove: { fontSize: 15, lineHeight: 14, fontFamily: 'Inter_700Bold' },
  submit: { minHeight: 51, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  submitHint: { width: '100%', fontSize: 10, lineHeight: 16, textAlign: 'right', writingDirection: 'rtl', marginBottom: 10 },
  submitError: { width: '100%', fontSize: 11, lineHeight: 18, textAlign: 'right', writingDirection: 'rtl', marginBottom: 10 },
});