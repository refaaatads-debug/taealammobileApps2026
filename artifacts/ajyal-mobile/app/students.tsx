import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getListMyStudentsQueryKey, useListMyStudents } from '@workspace/api-client-react';
import { EmptyState, Header, Icon, LoadingBlock, ProgressBar, Screen, SectionHeading } from '@/components/AjyalUI';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { useInternalCall } from '@/contexts/InternalCallContext';
import { supabase } from '@/lib/supabase';

export default function StudentsScreen() {
  const colors = useColors();
  const { profile } = useAjyal();
  const { startOutgoingCall } = useInternalCall();
  const query = useListMyStudents({ query: { queryKey: getListMyStudentsQueryKey(), staleTime: 30_000 } });
  const students = query.data ?? [];
  const [callingStudentId, setCallingStudentId] = useState<string | null>(null);
  const [phoneCallingStudentId, setPhoneCallingStudentId] = useState<string | null>(null);

  const startInternalCall = async (studentId: string, displayName: string) => {
    if (callingStudentId) return;
    setCallingStudentId(studentId);
    try {
      await startOutgoingCall(studentId);
      Alert.alert('تم بدء الاتصال الداخلي', `يرن الآن عند ${displayName}.`);
    } catch (error) {
      Alert.alert('تعذر بدء الاتصال الداخلي', error instanceof Error ? error.message : 'تحقق من اتصال الطالب ثم حاول مرة أخرى.');
    } finally {
      setCallingStudentId(null);
    }
  };

  const startPhoneCall = async (studentId: string, displayName: string) => {
    if (!supabase || phoneCallingStudentId) return;
    setPhoneCallingStudentId(studentId);
    try {
      const { error } = await supabase.functions.invoke('make-phone-call', {
        body: { student_id: studentId },
      });
      if (error) throw error;
      Alert.alert('تم طلب الاتصال الهاتفي', `سيتم تنفيذ الاتصال عبر نظام المنصة إلى ${displayName}.`);
    } catch (error) {
      Alert.alert('تعذر الاتصال الهاتفي', error instanceof Error ? error.message : 'تحقق من رصيد الاتصال وإعدادات الهاتف في المنصة.');
    } finally {
      setPhoneCallingStudentId(null);
    }
  };

  return (
    <Screen>
      <Header onBack={() => router.back()} avatarText={profile?.displayName?.slice(0, 1)} eyebrow="صورة طلابك التعليمية" title="طلابي" onAvatar={() => router.push('/profile')} />
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.navySoft }]}><Icon name="users" size={23} color={colors.primary} /></View>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>تابع تقدم طلابك</Text>
          <Text style={[styles.heroBody, { color: colors.tint }]}>البيانات هنا محسوبة من الحجوزات والمهام المرتبطة بحسابك.</Text>
        </View>
      </View>
      <SectionHeading title={students.length ? `${students.length} طلاب مرتبطين` : 'قائمة الطلاب'} />
      {query.isLoading ? <LoadingBlock /> : null}
      {query.isError ? <EmptyState icon="alert-circle" title="تعذر تحميل الطلاب" body="تأكد من أن الحساب الحالي حساب معلم ثم أعد المحاولة." action="إعادة المحاولة" onAction={() => void query.refetch()} /> : students.length ? (
        <View style={styles.list}>
           {students.map((student) => (
               <View key={student.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.navySoft }]}><Text style={[styles.initial, { color: colors.primary }]}>{student.displayName.slice(0, 1)}</Text></View>
               <Pressable testID={`student-${student.id}`} onPress={() => router.push({ pathname: '/chat', params: { student: student.id } })} style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
                <Text style={[styles.name, { color: colors.foreground }]}>{student.displayName}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>{student.email || 'طالب مرتبط بحسابك'}</Text>
                <View style={styles.progressRow}><ProgressBar progress={student.progress} color={colors.teal} /><Text style={[styles.progressText, { color: colors.teal }]}>{student.progress}٪</Text></View>
               </Pressable>
               <View style={styles.actions}>
                 <Pressable
                   testID={`internal-call-${student.id}`}
                   disabled={Boolean(callingStudentId)}
                   onPress={() => void startInternalCall(student.id, student.displayName)}
                   style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}
                 >
                   <Icon name="phone" size={15} color={colors.teal} />
                   <Text style={[styles.actionText, { color: colors.teal }]}>{callingStudentId === student.id ? 'جارٍ' : 'داخلي'}</Text>
                 </Pressable>
                 <Pressable
                   testID={`phone-call-${student.id}`}
                   disabled={Boolean(phoneCallingStudentId)}
                   onPress={() => void startPhoneCall(student.id, student.displayName)}
                   style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.navySoft }, pressed && styles.pressed]}
                 >
                   <Icon name="phone-call" size={15} color={colors.primary} />
                   <Text style={[styles.actionText, { color: colors.primary }]}>{phoneCallingStudentId === student.id ? 'جارٍ' : 'هاتف'}</Text>
                 </Pressable>
               </View>
             </View>
          ))}
        </View>
      ) : <EmptyState icon="users" title="لا يوجد طلاب متزامنون" body="ستظهر قائمة الطلاب بعد إنشاء حجز أو مهمة مرتبطة بحسابك." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 142, borderRadius: 23, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  heroCopy: { flex: 1, alignItems: 'flex-end', marginLeft: 14 },
  heroTitle: { width: '100%', fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  heroBody: { width: '100%', fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 7 },
  list: { gap: 10 },
  card: { minHeight: 108, borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  avatar: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  copy: { flex: 1, alignItems: 'flex-end' },
  name: { width: '100%', fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  meta: { width: '100%', fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 3 },
  progressRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 9 },
  progressText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  actions: { gap: 6, alignItems: 'stretch' },
  actionButton: { minWidth: 54, minHeight: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 6 },
  actionText: { fontSize: 8, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  pressed: { opacity: 0.72 },
});