import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { getListTeachersQueryKey, useListTeachers } from '@workspace/api-client-react';
import { EmptyState, Header, Icon, LoadingBlock, Screen, SectionHeading } from '@/components/AjyalUI';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { dayIsAvailable, normalizeDays, parseClock } from '@/lib/teacherAvailability';
import { supabase } from '@/lib/supabase';
import { OptionDropdown } from '@/components/OptionDropdown';
import { TEACHING_STAGES } from '@/constants/education';

type TeacherAvailability = {
  availableDays?: string[];
  availableFrom?: string | null;
  availableTo?: string | null;
};

function isAvailableNow(teacher: TeacherAvailability): boolean {
  const days = normalizeDays(teacher.availableDays);
  const from = parseClock(teacher.availableFrom);
  const to = parseClock(teacher.availableTo);
  if (!days.length || from === null || to === null || to <= from) return false;

  const now = new Date();
  if (!dayIsAvailable(days, now)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= from && currentMinutes < to;
}

function availabilityLabel(teacher: TeacherAvailability): string {
  const hasDays = Boolean(normalizeDays(teacher.availableDays).length);
  const hasHours = parseClock(teacher.availableFrom) !== null && parseClock(teacher.availableTo) !== null;
  if (!hasDays) return 'لا يوجد جدول توفر منشور';
  if (!hasHours) return 'الأيام معلنة والوقت غير مكتمل';
  return isAvailableNow(teacher) ? 'متاح الآن' : 'جدول التوفر منشور';
}

export default function FindTeacherScreen() {
  const colors = useColors();
  const { profile } = useAjyal();
  const { t, locale, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('الكل');
  const [sortBy, setSortBy] = useState<'rating' | 'price'>('rating');
  const [platformSubjects, setPlatformSubjects] = useState<string[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState(false);
  const query = useListTeachers(
    search.trim() ? { search: search.trim() } : undefined,
    { query: { queryKey: getListTeachersQueryKey(search.trim() ? { search: search.trim() } : undefined), staleTime: 30_000 } },
  );
  const teachers = query.data ?? [];
  useEffect(() => {
    let active = true;
    const loadSubjects = async () => {
      if (!supabase) {
        if (active) {
          setPlatformSubjects([]);
          setSubjectsError(true);
          setSubjectsLoading(false);
        }
        return;
      }
      const result = await supabase.from('subjects').select('name').order('name');
      if (!active) return;
      if (result.error) {
        setPlatformSubjects([]);
        setSubjectsError(true);
      } else {
        setPlatformSubjects(
          (result.data ?? [])
            .map((row) => row.name)
            .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
        );
      }
      setSubjectsLoading(false);
    };
    void loadSubjects();
    return () => {
      active = false;
    };
  }, []);
  const stageOptions = useMemo(() => ['الكل', ...TEACHING_STAGES], []);
  const subjectOptions = useMemo(() => ['الكل', ...platformSubjects], [platformSubjects]);
  const [stage, setStage] = useState('الكل');
  const visibleTeachers = useMemo(() => {
    const filtered = teachers.filter((teacher) => (
      (stage === 'الكل' || teacher.teachingStages?.includes(stage))
      && (subject === 'الكل' || teacher.subjects?.includes(subject))
    ));
    return [...filtered].sort((left, right) => {
      if (sortBy === 'price') return (left.hourlyRate ?? Number.POSITIVE_INFINITY) - (right.hourlyRate ?? Number.POSITIVE_INFINITY);
      return (right.rating ?? 0) - (left.rating ?? 0);
    });
  }, [sortBy, stage, subject, teachers]);

  return (
    <Screen>
      <Header
        onBack={() => router.back()}
        avatarText={profile?.displayName?.slice(0, 1)}
        eyebrow={t('تعلّم بالطريقة التي تناسبك', 'Learn in a way that fits you')}
        title={t('ابحث عن معلم', 'Find a teacher')}
        onAvatar={() => router.push('/profile')}
      />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.tealSoft }]}>
          <Icon name="search" size={24} color={colors.teal} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground, writingDirection: direction }]}>
            {t('المعلم المناسب يبدأ من هنا', 'The right teacher starts here')}
          </Text>
          <Text style={[styles.heroBody, { color: colors.tint, writingDirection: direction }]}>
            {t('ابحث باسم المعلم أو المادة من قائمة المعلمين المعتمدين في المنصة.', 'Search by teacher or subject across the platform’s approved teachers.')}
          </Text>
        </View>
      </View>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          testID="teacher-search-input"
          value={search}
          onChangeText={setSearch}
          placeholder={t('ابحث عن معلم', 'Search for a teacher')}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
           textAlign={isRTL ? 'right' : 'left'}
          returnKeyType="search"
        />
        {search ? (
          <Pressable testID="clear-teacher-search" onPress={() => setSearch('')} hitSlop={8}>
            <Icon name="x" size={17} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <SectionHeading title={visibleTeachers.length ? t(`${formatNumber(visibleTeachers.length)} معلمين متاحين`, `${formatNumber(visibleTeachers.length)} teachers available`) : t('المعلمون المتاحون', 'Available teachers')} />
      <View style={styles.dropdownGroup}>
        <OptionDropdown
          label={t('المرحلة التعليمية', 'Education stage')}
          value={stage === 'الكل' ? '' : stage}
          placeholder={t('كل المراحل التعليمية', 'All education stages')}
          options={stageOptions}
          onChange={(value) => setStage(value)}
          testID="teacher-stage-dropdown"
        />
        <OptionDropdown
          label={t('المادة', 'Subject')}
          value={subject === 'الكل' ? '' : subject}
          placeholder={t('كل المواد التعليمية', 'All platform subjects')}
          options={subjectOptions}
          onChange={(value) => setSubject(value)}
          testID="teacher-subject-dropdown"
          loading={subjectsLoading}
          disabled={subjectsError}
        />
      </View>
      {subjectsError ? (
        <Text style={[styles.filterNote, { color: colors.destructive, writingDirection: direction }]}>
          {t('تعذر تحميل المواد من المنصة. تحقق من الاتصال ثم أعد المحاولة.', 'Platform subjects could not be loaded. Check the connection and try again.')}
        </Text>
      ) : null}
      <View style={styles.filters}>
        {(['rating', 'price'] as const).map((option) => (
          <Pressable
            key={option}
            testID={`teacher-sort-${option}`}
            onPress={() => setSortBy(option)}
            style={[styles.filter, { backgroundColor: sortBy === option ? colors.tealSoft : colors.card, borderColor: sortBy === option ? colors.teal : colors.border }]}
          >
            <Text style={[styles.filterText, { color: sortBy === option ? colors.teal : colors.mutedForeground }]}>
              {option === 'rating' ? t('الأعلى تقييماً', 'Top rated') : t('الأقل سعراً', 'Lowest price')}
            </Text>
          </Pressable>
        ))}
      </View>
      {query.isLoading ? <LoadingBlock /> : null}
      {query.isError ? (
        <EmptyState
          icon="alert-circle"
           title={t('تعذر تحميل المعلمين', 'Unable to load teachers')}
           body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')}
           action={t('إعادة المحاولة', 'Try again')}
          onAction={() => void query.refetch()}
        />
      ) : visibleTeachers.length ? (
        <View style={styles.list}>
          {visibleTeachers.map((teacher) => (
            <Pressable
              key={teacher.id}
              testID={`teacher-${teacher.id}`}
              onPress={() => router.push({
                pathname: '/booking',
                params: {
                  teacherId: teacher.id,
                  teacherName: teacher.displayName,
                  teacherHourlyRate: teacher.hourlyRate == null ? '' : String(teacher.hourlyRate),
                  teacherAvailableDays: JSON.stringify(teacher.availableDays ?? []),
                  teacherAvailableFrom: teacher.availableFrom ?? '',
                  teacherAvailableTo: teacher.availableTo ?? '',
                },
              } as never)}
              style={({ pressed }) => [styles.teacherCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
            >
              <View style={[styles.teacherAvatar, { backgroundColor: colors.tealSoft }]}>
                <Text style={[styles.teacherInitial, { color: colors.teal }]}>{teacher.displayName.slice(0, 1)}</Text>
              </View>
              <View style={styles.teacherCopy}>
                 <Text style={[styles.teacherName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{teacher.displayName}</Text>
                 <Text style={[styles.teacherMeta, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
                   {teacher.rating == null ? t('معلم معتمد', 'Approved teacher') : `★ ${teacher.rating.toFixed(1)}`}
                   {teacher.hourlyRate == null ? '' : ` · ${formatNumber(teacher.hourlyRate)} SAR/${t('ساعة', 'hr')}`}
                   {teacher.totalSessions == null ? '' : ` · ${formatNumber(teacher.totalSessions)} ${t('حصة', 'sessions')}`}
                </Text>
                 <Text style={[styles.teacherMeta, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
                   {teacher.subjects?.slice(0, 3).join(' · ') || t('تخصصات المنصة', 'Platform subjects')}
                </Text>
                 <Text style={[styles.teacherMeta, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
                   {teacher.teachingStages?.slice(0, 3).join(' · ') || teacher.email || t('معلم من شبكة أجيال المعرفة', 'Teacher from the Ajyal Knowledge network')}
                </Text>
                <Text
                  style={[
                    styles.availabilityMeta,
                     { color: availabilityLabel(teacher) === 'متاح الآن' ? colors.teal : colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' },
                  ]}
                >
                   {availabilityLabel(teacher) === 'متاح الآن'
                     ? t('متاح الآن', 'Available now')
                     : availabilityLabel(teacher) === 'جدول التوفر منشور'
                       ? t('جدول التوفر منشور', 'Availability published')
                       : availabilityLabel(teacher) === 'الأيام معلنة والوقت غير مكتمل'
                         ? t('الأيام معلنة والوقت غير مكتمل', 'Days published, hours incomplete')
                         : t('لا يوجد جدول توفر منشور', 'No availability schedule published')}
                </Text>
              </View>
               <Icon name={isRTL ? 'arrow-left' : 'arrow-right'} size={17} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="search"
           title={search || stage !== 'الكل' || subject !== 'الكل' ? t('لا توجد نتائج مطابقة', 'No matching results') : t('لا يوجد معلمون متاحون بعد', 'No teachers available yet')}
           body={search || stage !== 'الكل' || subject !== 'الكل'
             ? t('جرّب اسماً أو مادة أو مرحلة مختلفة.', 'Try another name, subject, or stage.')
             : t('ستظهر حسابات المعلمين بعد اعتمادها وربط تخصصاتها بالمنصة.', 'Approved teachers will appear after their subjects are connected.')}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 142, borderRadius: 23, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: 'flex-end', marginLeft: 14 },
  heroTitle: { width: '100%', fontSize: 19, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  heroBody: { width: '100%', fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 7 },
  searchBox: { minHeight: 53, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  input: { flex: 1, minHeight: 50, fontSize: 13, fontFamily: 'Inter_400Regular' },
  list: { gap: 10 },
  dropdownGroup: { gap: 1, marginBottom: 2 },
  filterNote: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginBottom: 12 },
  filters: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filter: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  teacherCard: { minHeight: 78, borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  teacherAvatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  teacherInitial: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  teacherCopy: { flex: 1, alignItems: 'flex-end' },
  teacherName: { width: '100%', fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  teacherMeta: { width: '100%', fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 4 },
  availabilityMeta: { width: '100%', fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl', marginTop: 4 },
  pressed: { opacity: 0.72 },
});