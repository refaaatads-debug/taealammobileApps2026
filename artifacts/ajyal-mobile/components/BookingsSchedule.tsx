import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Icon, SectionHeading } from '@/components/AjyalUI';
import type { Session } from '@/constants/localData';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';

type ScheduleMode = 'week' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameDay(left: Date, right: Date) {
  return dateKey(left) === dateKey(right);
}

function formatPeriod(date: Date, mode: ScheduleMode, locale: string) {
  const month = (value: Date) => value.toLocaleDateString(locale, { month: 'long' });
  const year = (value: Date) => value.toLocaleDateString(locale, { year: 'numeric' });
  const day = (value: Date) => value.toLocaleDateString(locale, { day: 'numeric' });
  if (mode === 'month') return `${month(date)} ${year(date)}`;
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  if (start.getMonth() === end.getMonth()) return `${day(start)}–${day(end)} ${month(start)}`;
  return `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

function formatEventTime(session: Session, locale: string) {
  const date = new Date(session.scheduledAt);
  return Number.isNaN(date.getTime())
    ? `${session.date} · ${session.time}`
    : date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

function sessionStatusLabel(session: Session, t: (arabic: string, english: string) => string) {
  if (session.status === 'expired') return t('منتهى', 'Expired');
  if (session.status === 'done') return t('مكتمل', 'Completed');
  if (session.status === 'cancelled') return t('ملغى', 'Cancelled');
  return t('قادمة', 'Upcoming');
}

export default function BookingsSchedule({ sessions, role, onSessionPress }: { sessions: Session[]; role: 'student' | 'teacher'; onSessionPress?: (session: Session) => void }) {
  const colors = useColors();
  const { t, locale, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const [mode, setMode] = useState<ScheduleMode>('week');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));

  const parsedSessions = useMemo(
    () => sessions
      .map((session) => ({ session, date: new Date(session.scheduledAt) }))
      .filter((item) => !Number.isNaN(item.date.getTime()))
      .sort((left, right) => left.date.getTime() - right.date.getTime()),
    [sessions],
  );
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session[]>();
    for (const item of parsedSessions) {
      const key = dateKey(item.date);
      map.set(key, [...(map.get(key) ?? []), item.session]);
    }
    return map;
  }, [parsedSessions]);

  const weekDays = useMemo(() => {
    const start = new Date(cursor);
    start.setDate(cursor.getDate() - cursor.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [cursor]);

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [cursor]);

  const selectedSessions = sessionsByDay.get(dateKey(selectedDay)) ?? [];
  const periodSessions = useMemo(() => {
    if (mode === 'week') {
      const keys = new Set(weekDays.map(dateKey));
      return parsedSessions.filter((item) => keys.has(dateKey(item.date))).map((item) => item.session);
    }
    return parsedSessions
      .filter((item) => item.date.getFullYear() === cursor.getFullYear() && item.date.getMonth() === cursor.getMonth())
      .map((item) => item.session);
  }, [cursor, mode, parsedSessions, weekDays]);

  const movePeriod = (direction: number) => {
    const next = new Date(cursor);
    if (mode === 'week') next.setDate(cursor.getDate() + direction * 7);
    else next.setMonth(cursor.getMonth() + direction);
    setCursor(startOfDay(next));
    setSelectedDay(startOfDay(next));
  };

  const selectDay = (day: Date) => {
    setSelectedDay(startOfDay(day));
    if (mode === 'month' && (day.getMonth() !== cursor.getMonth())) {
      setCursor(startOfDay(day));
    }
  };

  const dayButton = (day: Date, compact = false) => {
    const daySessions = sessionsByDay.get(dateKey(day)) ?? [];
    const selected = isSameDay(day, selectedDay);
    const today = isSameDay(day, new Date());
    return (
      <Pressable
        key={dateKey(day)}
        onPress={() => selectDay(day)}
        style={[
          compact ? styles.monthDay : styles.weekDay,
          { borderColor: selected ? colors.primary : 'transparent', backgroundColor: selected ? colors.navySoft : colors.card },
          compact && day.getMonth() !== cursor.getMonth() && { opacity: 0.35 },
          today && !selected && { backgroundColor: colors.tealSoft },
        ]}
      >
         <Text style={[compact ? styles.monthWeekday : styles.weekday, { color: colors.mutedForeground, writingDirection: direction }]}>{compact ? day.toLocaleDateString(locale, { day: 'numeric' }) : day.toLocaleDateString(locale, { weekday: 'short' })}</Text>
         {!compact ? <Text style={[styles.weekDate, { color: colors.foreground }]}>{day.toLocaleDateString(locale, { day: 'numeric' })}</Text> : null}
        {daySessions.length ? (
          <View style={[styles.eventDot, { backgroundColor: colors.teal }]}>
             <Text style={[styles.eventCount, { color: colors.primaryForeground }]}>{daySessions.length > 9 ? `${formatNumber(9)}+` : formatNumber(daySessions.length)}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
         <View style={[styles.headingCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
           <SectionHeading title={t('جدول الحجوزات', 'Booking schedule')} />
           <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('كل مواعيد', 'All')} {role === 'teacher' ? t('طلابك', 'your students') : t('حصصك', 'your sessions')} {t('من الحجوزات المؤكدة', 'from confirmed bookings')}</Text>
        </View>
        <View style={[styles.modeSwitch, { backgroundColor: colors.muted }]}>
          {(['week', 'month'] as const).map((item) => (
            <Pressable key={item} onPress={() => setMode(item)} style={[styles.modeButton, mode === item && { backgroundColor: colors.card }]}>
               <Text style={[styles.modeText, { color: mode === item ? colors.primary : colors.mutedForeground, writingDirection: direction }]}>{item === 'week' ? t('أسبوع', 'Week') : t('شهر', 'Month')}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.periodNav}>
        <Pressable onPress={() => movePeriod(-1)} style={[styles.navButton, { borderColor: colors.border }]}><Icon name="chevron-right" size={17} color={colors.primary} /></Pressable>
         <Text style={[styles.periodTitle, { color: colors.foreground, writingDirection: direction }]}>{formatPeriod(cursor, mode, locale)}</Text>
        <Pressable onPress={() => movePeriod(1)} style={[styles.navButton, { borderColor: colors.border }]}><Icon name="chevron-left" size={17} color={colors.primary} /></Pressable>
      </View>

      {mode === 'week' ? (
         <View style={[styles.weekRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{weekDays.map((day) => dayButton(day))}</View>
      ) : (
         <View style={[styles.monthGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{monthDays.map((day) => dayButton(day, true))}</View>
      )}

      <View style={[styles.selectedHeader, { borderTopColor: colors.border }]}>
         <Text style={[styles.selectedTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
         <Text style={[styles.selectedCount, { color: colors.teal, writingDirection: direction }]}>{selectedSessions.length ? `${formatNumber(selectedSessions.length)} ${t('حجز', 'booking')}` : t('لا حجوزات', 'No bookings')}</Text>
      </View>

      {selectedSessions.length ? (
        <View style={styles.events}>
          {selectedSessions.map((session) => (
            <Pressable key={session.id} onPress={() => onSessionPress?.(session)} style={[styles.eventRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={[styles.eventTime, { backgroundColor: colors.navySoft }]}>
                 <Text style={[styles.eventTimeText, { color: colors.primary, writingDirection: direction }]}>{formatEventTime(session, locale)}</Text>
                 <Text style={[styles.eventDuration, { color: colors.mutedForeground, writingDirection: direction }]}>{session.duration}</Text>
              </View>
              <View style={styles.eventCopy}>
                 <Text style={[styles.eventTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{session.subject || session.title}</Text>
                 <Text style={[styles.eventPerson, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{session.person}</Text>
              </View>
               <View style={styles.eventStatus}>
                 <Text style={[styles.eventStatusText, { color: session.status === 'cancelled' || session.status === 'expired' ? colors.destructive : session.status === 'done' ? colors.primary : colors.teal, writingDirection: direction }]}>{sessionStatusLabel(session, t)}</Text>
                 <View style={[styles.statusDot, { backgroundColor: session.status === 'cancelled' || session.status === 'expired' ? colors.destructive : session.status === 'done' ? colors.primary : colors.teal }]} />
               </View>
            </Pressable>
          ))}
        </View>
      ) : periodSessions.length ? (
         <Text style={[styles.periodHint, { color: colors.mutedForeground, writingDirection: direction }]}>{t('اختر يوماً لعرض الحجوزات المسجلة فيه.', 'Choose a day to view its bookings.')}</Text>
      ) : (
         <Text style={[styles.periodHint, { color: colors.mutedForeground, writingDirection: direction }]}>{t('لا توجد حجوزات في هذه الفترة.', 'No bookings in this period.')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 19, borderWidth: 1, padding: 13, marginBottom: 22 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headingCopy: { flex: 1, alignItems: 'flex-end' },
  helper: { width: '100%', fontSize: 10, lineHeight: 16, textAlign: 'right', writingDirection: 'rtl', marginTop: -8 },
  modeSwitch: { flexDirection: 'row', borderRadius: 10, padding: 3, marginTop: 3 },
  modeButton: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  modeText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  periodNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 10 },
  periodTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  navButton: { width: 29, height: 29, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row-reverse', gap: 5 },
  weekDay: { flex: 1, minHeight: 61, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  weekday: { fontSize: 9, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  weekDate: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  monthGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'space-between' },
  monthDay: { width: '13.4%', minHeight: 39, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 1, marginBottom: 4 },
  monthWeekday: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  eventDot: { minWidth: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  eventCount: { fontSize: 7, lineHeight: 10, fontFamily: 'Inter_700Bold' },
  selectedHeader: { borderTopWidth: 1, marginTop: 13, paddingTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectedTitle: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  selectedCount: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  events: { gap: 7, marginTop: 9 },
  eventRow: { minHeight: 59, borderRadius: 13, borderWidth: 1, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTime: { minWidth: 64, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 5, alignItems: 'center' },
  eventTimeText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  eventDuration: { fontSize: 8, marginTop: 2, fontFamily: 'Inter_400Regular', writingDirection: 'rtl' },
  eventCopy: { flex: 1, alignItems: 'flex-end' },
  eventTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  eventPerson: { fontSize: 9, marginTop: 3, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  eventStatus: { alignItems: 'center', gap: 4 },
  eventStatusText: { fontSize: 8, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  periodHint: { fontSize: 10, textAlign: 'center', writingDirection: 'rtl', paddingVertical: 12 },
});