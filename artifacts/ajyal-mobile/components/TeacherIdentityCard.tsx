import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { UserProfile } from '@/constants/localData';
import { Icon } from '@/components/AjyalUI';

export function TeacherIdentityCard({ profile, approved }: { profile: UserProfile | undefined; approved: boolean }) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const isRTL = direction === 'rtl';

  return (
    <View
      testID="teacher-identity-card"
      style={[styles.teacherIdentity, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.approvalMark, { backgroundColor: approved ? colors.tealSoft : colors.goldSoft }]}>
        <Icon name={approved ? 'check-circle' : 'clock'} size={18} color={approved ? colors.teal : colors.accentForeground} />
      </View>
      <View style={[styles.teacherIdentityCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.teacherIdentityLabel, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('حساب المعلّم', 'Teacher account')}
        </Text>
        <Text style={[styles.teacherIdentityName, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
          {profile?.displayName ?? t('المعلم', 'Teacher')}
        </Text>
        <Text style={[styles.teacherIdentityEmail, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
          {profile?.email ?? t('البريد غير متاح', 'Email unavailable')}
        </Text>
      </View>
      <View style={[styles.approvalBadge, { backgroundColor: approved ? colors.tealSoft : colors.goldSoft }]}>
        <Text style={[styles.approvalBadgeText, { color: approved ? colors.teal : colors.accentForeground, writingDirection: direction }]}>
          {approved ? t('معتمد', 'Approved') : t('قيد المراجعة', 'Under review')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  teacherIdentity: { minHeight: 78, borderRadius: 19, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  approvalMark: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  teacherIdentityCopy: { flex: 1, alignItems: 'flex-end' },
  teacherIdentityLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  teacherIdentityName: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 2, writingDirection: 'rtl' },
  teacherIdentityEmail: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 2, writingDirection: 'rtl' },
  approvalBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  approvalBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
});