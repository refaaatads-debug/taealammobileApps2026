import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { useColors } from '@/hooks/useColors';
import { useAjyal } from '@/hooks/useAjyal';
import { isAssignmentComplete } from '@/constants/localData';
import { AssignmentRow, EmptyState, Header, Icon, LoadingBlock, Screen, SectionHeading } from '@/components/AjyalUI';
import { getListMyAssignmentsQueryKey, customFetch, useListMyAssignments } from '@workspace/api-client-react';
import type { Assignment } from '@workspace/api-client-react';
import { supabase } from '@/lib/supabase';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useQueryClient } from '@tanstack/react-query';

type SubmissionRow = Record<string, unknown>;
type Question = {
  text: string;
  type: string;
  options: string[];
  points: number;
};
type AssignmentDetail = Record<string, unknown> & {
  id: string;
  title: string;
  description: string | null;
  total_points: number;
  due_date: string | null;
  questions: Question[];
  attachments: Record<string, unknown>[];
  allow_text: boolean;
  allow_image: boolean;
  allow_audio: boolean;
};

function rowText(row: SubmissionRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function rowNumber(row: SubmissionRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function assignmentQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const options = Array.isArray(row.options) ? row.options.filter((option): option is string => typeof option === 'string') : [];
    return {
      text: typeof row.text === 'string' ? row.text : typeof row.question === 'string' ? row.question : 'سؤال',
      type: typeof row.type === 'string' ? row.type : 'short_answer',
      options,
      points: typeof row.points === 'number' ? row.points : 0,
    };
  });
}

function submissionAnswers(value: unknown, count: number): string[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  const answers = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.entries(parsed as Record<string, unknown>)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([, answer]) => answer)
      : [];
  return Array.from({ length: count }, (_, index) => displayAnswer(answers[index]));
}

function displayAnswer(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(displayAnswer).filter(Boolean).join('، ');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    for (const key of ['answer', 'text', 'value', 'response', 'content']) {
      const text = displayAnswer(item[key]);
      if (text) return text;
    }
    return '';
  }
  return '';
}

function mediaUrls(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = '';
    }
  }
  if (typeof parsed === 'string') return parsed ? [parsed] : [];
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export default function AssignmentsScreen() {
  const colors = useColors();
  const { t, direction, formatNumber } = useAppPreferences();
  const isRTL = direction === 'rtl';
  const { role, profile } = useAjyal();
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const reviewAudioPlayer = useAudioPlayer(null);
  const [filter, setFilter] = useState<'all' | 'assignments' | 'quizzes'>('all');
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewTotalPoints, setReviewTotalPoints] = useState(100);
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [gradeDraft, setGradeDraft] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [aiGradingSubmissionId, setAiGradingSubmissionId] = useState<string | null>(null);
  const [savingGradeSubmissionId, setSavingGradeSubmissionId] = useState<string | null>(null);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [studentSubmissions, setStudentSubmissions] = useState<SubmissionRow[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<AssignmentDetail | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<SubmissionRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const assignmentsQuery = useListMyAssignments();
  const assignments = assignmentsQuery.data ?? [];
  const userId = profile?.id;
  const assignmentIdsKey = useMemo(() => assignments.map((assignment) => assignment.id).join(','), [assignments]);
  const loadStudentSubmissions = useCallback(async () => {
    if (role !== 'student' || !userId || !supabase) return;
    const result = await supabase
      .from('assignment_submissions')
      .select('*')
      .eq('student_id', userId)
      .order('submitted_at', { ascending: false });
    if (!result.error) {
      const rows = (result.data ?? []) as SubmissionRow[];
      setStudentSubmissions(rows);
      setActiveSubmission((current) => {
        if (!current) return current;
        const assignmentId = rowText(current, 'assignment_id');
        return rows.find((submission) => rowText(submission, 'assignment_id') === assignmentId) ?? current;
      });
    }
  }, [role, userId]);
  useEffect(() => {
    void loadStudentSubmissions();
  }, [loadStudentSubmissions]);
  useEffect(() => {
    if (role !== 'teacher' || !supabase || !userId || !assignmentIdsKey) {
      setSubmissionCounts({});
      return;
    }
    const assignmentIds = assignmentIdsKey.split(',').filter(Boolean);
    const client = supabase;
    let active = true;
    const loadSubmissionCounts = async () => {
      const result = await client
        .from('assignment_submissions')
        .select('assignment_id')
        .in('assignment_id', assignmentIds);
      if (!active || result.error) return;
      const next: Record<string, number> = {};
      for (const row of (result.data ?? []) as Array<{ assignment_id?: string | null }>) {
        if (row.assignment_id) next[row.assignment_id] = (next[row.assignment_id] ?? 0) + 1;
      }
      setSubmissionCounts(next);
    };
    void loadSubmissionCounts();

    const channel = supabase.channel(`mobile-teacher-assignment-submissions-${userId}`);
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'assignment_submissions',
    }, (payload) => {
      const assignmentId = typeof payload.new?.assignment_id === 'string' ? payload.new.assignment_id : '';
      if (!assignmentId || !assignmentIds.includes(assignmentId)) return;
      setSubmissionCounts((current) => ({ ...current, [assignmentId]: (current[assignmentId] ?? 0) + 1 }));
      Alert.alert(t('تسليم جديد', 'New submission'), t('وصل حل جديد من أحد الطلاب. افتح المهمة لمراجعته.', 'A new student submission arrived. Open the assignment to review it.'));
    });
    channel.subscribe();
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, [assignmentIdsKey, role, t, userId]);
  useEffect(() => {
    if (role !== 'student' || !supabase || !userId) return;
    const channel = supabase.channel(`mobile-assignment-submissions-${userId}`);
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'assignment_submissions',
      filter: `student_id=eq.${userId}`,
    }, () => {
      void loadStudentSubmissions();
    });
    channel.subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [loadStudentSubmissions, role, userId]);
  const submittedIds = useMemo(() => new Set(studentSubmissions.map((submission) => rowText(submission, 'assignment_id'))), [studentSubmissions]);
  const visible = useMemo(() => assignments.filter((item) => filter === 'all' || (filter === 'quizzes' ? item.kind === 'اختبار' : item.kind === 'واجب')), [assignments, filter]);
  const finished = assignments.filter((item) => item.progress === 100 || item.status === 'مكتمل' || submittedIds.has(item.id)).length;
  const average = assignments.length ? Math.round(assignments.reduce((sum, item) => sum + (submittedIds.has(item.id) ? 100 : item.progress), 0) / assignments.length) : 0;

  const openTeacherReview = async (id: string, title: string) => {
    setReviewTarget({ id, title });
    setReviewLoading(true);
    setReviewError(null);
    setSubmissions([]);
    setReviewQuestions([]);
    setGradingSubmissionId(null);
    setGradeDraft('');
    setFeedbackDraft('');
    setReviewTotalPoints(100);
    if (!supabase) {
       setReviewError(t('لا يوجد اتصال بمنصة أجيال المعرفة.', 'No connection to Ajyal Knowledge.'));
      setReviewLoading(false);
      return;
    }
    const [assignmentResult, submissionsResult] = await Promise.all([
      supabase.from('assignments').select('total_points, questions').eq('id', id).maybeSingle(),
      supabase.from('assignment_submissions').select('*').eq('assignment_id', id).order('submitted_at', { ascending: false }),
    ]);
    if (assignmentResult.error || submissionsResult.error) {
      setReviewError(assignmentResult.error?.message ?? submissionsResult.error?.message ?? t('تعذر تحميل التسليمات.', 'Could not load submissions.'));
    } else {
      setReviewTotalPoints(typeof assignmentResult.data?.total_points === 'number' ? assignmentResult.data.total_points : 100);
      setReviewQuestions(assignmentQuestions(assignmentResult.data?.questions));
      setSubmissions((submissionsResult.data ?? []) as SubmissionRow[]);
    }
    setReviewLoading(false);
  };

  const notifyAssignmentEvent = async (assignmentId: string, submissionId: string, event: 'submitted' | 'graded') => {
    await customFetch<{ delivered: boolean }>('/api/push/assignment-submissions', {
      method: 'POST',
      body: JSON.stringify({ assignmentId, submissionId, event }),
    }).catch(() => undefined);
  };

  const startSubmissionGrading = (submission: SubmissionRow) => {
    const id = rowText(submission, 'id');
    if (!id) return;
    setGradingSubmissionId(id);
    setGradeDraft(rowNumber(submission, 'teacher_score', 'final_score', 'ai_score')?.toString() ?? '');
    setFeedbackDraft(rowText(submission, 'teacher_feedback', 'feedback'));
  };

  const runAiGrade = async (submission: SubmissionRow) => {
    const id = rowText(submission, 'id');
    if (!id || !supabase) return;
    setAiGradingSubmissionId(id);
    try {
      const result = await supabase.functions.invoke('grade-assignment', { body: { submission_id: id } });
      if (result.error || (result.data && typeof result.data === 'object' && 'error' in result.data)) {
        throw result.error ?? new Error(String((result.data as { error?: unknown }).error));
      }
      const refreshed = await supabase.from('assignment_submissions').select('*').eq('id', id).maybeSingle();
      if (refreshed.error || !refreshed.data) throw refreshed.error ?? new Error(t('تعذر تحديث نتيجة AI.', 'Could not refresh the AI result.'));
      setSubmissions((current) => current.map((item) => rowText(item, 'id') === id ? refreshed.data as SubmissionRow : item));
      setGradeDraft(rowNumber(refreshed.data, 'ai_score')?.toString() ?? '');
      setFeedbackDraft(rowText(refreshed.data, 'ai_feedback'));
      setGradingSubmissionId(id);
      Alert.alert(t('تم التصحيح المبدئي', 'AI review complete'), t('راجِع الدرجة والملاحظات ثم اعتمدها للطالب.', 'Review the score and feedback, then approve it for the student.'));
    } catch (error) {
      Alert.alert(t('تعذر التصحيح بالذكاء الصناعي', 'AI grading failed'), error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'));
    } finally {
      setAiGradingSubmissionId(null);
    }
  };

  const saveTeacherGrade = async (submission: SubmissionRow) => {
    const id = rowText(submission, 'id');
    const score = Number(gradeDraft);
    if (!id || !supabase || !Number.isFinite(score) || score < 0 || score > reviewTotalPoints) {
      Alert.alert(t('الدرجة غير صحيحة', 'Invalid grade'), t(`أدخل درجة بين 0 و${reviewTotalPoints}.`, `Enter a grade between 0 and ${reviewTotalPoints}.`));
      return;
    }
    setSavingGradeSubmissionId(id);
    try {
      const result = await supabase.from('assignment_submissions').update({
        teacher_score: score,
        teacher_feedback: feedbackDraft.trim() || null,
        final_score: score,
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
      }).eq('id', id).select('*').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        throw new Error(t(
          'لم يتم تحديث التسليم. قد لا يملك حساب المعلم صلاحية تعديل هذا التسليم.',
          'The submission was not updated. This teacher account may not have permission to edit it.',
        ));
      }
      setSubmissions((current) => current.map((item) => rowText(item, 'id') === id ? result.data as SubmissionRow : item));
      setGradingSubmissionId(null);
      if (reviewTarget?.id) await notifyAssignmentEvent(reviewTarget.id, id, 'graded');
      Alert.alert(t('تم حفظ التصحيح', 'Grade saved'), t('تم حفظ الدرجة وتحديث التسليم وإرسال تنبيه النتيجة إن كان متاحاً.', 'The grade was saved and the submission was refreshed. A result alert was sent when available.'));
    } catch (error) {
      Alert.alert(t('تعذر حفظ التصحيح', 'Could not save grade'), error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'));
    } finally {
      setSavingGradeSubmissionId(null);
    }
  };

  const playReviewAudio = (url: string) => {
    reviewAudioPlayer.replace(url);
    reviewAudioPlayer.play();
  };

  const openAssignment = async (id: string) => {
    const item = assignments.find((assignment) => assignment.id === id);
    if (!item) return;
    if (role === 'teacher') {
      await openTeacherReview(item.id, item.title);
      return;
    }
    if (!supabase || !userId) {
      Alert.alert(t('تعذر فتح المهمة', 'Unable to open assignment'), t('تحقق من اتصال المنصة ثم حاول مرة أخرى.', 'Check the platform connection and try again.'));
      return;
    }
    setDetailLoading(true);
    const [assignmentResult, submissionResult] = await Promise.all([
      supabase.from('assignments').select('*').eq('id', id).maybeSingle(),
      supabase.from('assignment_submissions').select('*').eq('assignment_id', id).eq('student_id', userId).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setDetailLoading(false);
    if (assignmentResult.error || !assignmentResult.data) {
      Alert.alert(t('تعذر تحميل المهمة', 'Unable to load assignment'), assignmentResult.error?.message ?? t('المهمة غير متاحة لهذا الحساب.', 'This assignment is not available for this account.'));
      return;
    }
    const raw = assignmentResult.data as Record<string, unknown>;
    const detail: AssignmentDetail = {
      ...raw,
      id: String(raw.id),
      title: typeof raw.title === 'string' ? raw.title : item.title,
      description: typeof raw.description === 'string' ? raw.description : null,
      total_points: typeof raw.total_points === 'number' ? raw.total_points : 100,
      due_date: typeof raw.due_date === 'string' ? raw.due_date : null,
      questions: assignmentQuestions(raw.questions),
      attachments: Array.isArray(raw.attachments) ? raw.attachments.filter((attachment): attachment is Record<string, unknown> => Boolean(attachment && typeof attachment === 'object')) : [],
      allow_text: raw.allow_text !== false,
      allow_image: raw.allow_image !== false,
      allow_audio: raw.allow_audio !== false,
    };
    const submission = (submissionResult.data ?? null) as SubmissionRow | null;
    setActiveAssignment(detail);
    setActiveSubmission(submission);
    setAnswers(submission ? submissionAnswers(submission.answers, detail.questions.length) : new Array(detail.questions.length).fill(''));
    setTextAnswer(submission ? rowText(submission, 'text_answer') : '');
    setSelectedImages([]);
    setAudioUri(null);
    setRecording(false);
  };

  const submitAssignment = async () => {
    if (!activeAssignment || !supabase || !userId) return;
    if (!textAnswer.trim() && answers.every((answer) => !answer.trim())) {
      Alert.alert(t('أكمل الحل أولاً', 'Complete your answer first'), t('أجب عن سؤال واحد على الأقل قبل التسليم.', 'Answer at least one question before submitting.'));
      return;
    }
    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      for (const [index, image] of selectedImages.entries()) {
        const blob = await (await fetch(image.uri)).blob();
        const path = `${userId}/${activeAssignment.id}/mobile-image-${Date.now()}-${index}`;
        const upload = await supabase.storage.from('assignment-files').upload(path, blob, {
          contentType: image.mimeType ?? 'image/jpeg',
          upsert: false,
        });
        if (upload.error) throw upload.error;
        const signed = await supabase.storage.from('assignment-files').createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed.error) throw signed.error;
        if (signed.data?.signedUrl) imageUrls.push(signed.data.signedUrl);
      }
      let audioUrl: string | null = null;
      if (audioUri) {
        const blob = await (await fetch(audioUri)).blob();
        const path = `${userId}/${activeAssignment.id}/mobile-audio-${Date.now()}.m4a`;
        const upload = await supabase.storage.from('assignment-files').upload(path, blob, {
          contentType: 'audio/m4a',
          upsert: false,
        });
        if (upload.error) throw upload.error;
        const signed = await supabase.storage.from('assignment-files').createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed.error) throw signed.error;
        audioUrl = signed.data?.signedUrl ?? null;
      }
      const result = await supabase.from('assignment_submissions').insert({
        assignment_id: activeAssignment.id,
        student_id: userId,
        text_answer: textAnswer.trim() || null,
        image_urls: imageUrls,
        audio_url: audioUrl,
        answers,
        status: 'submitted',
      }).select('*').single();
      if (result.error || !result.data) {
        throw result.error ?? new Error(t('تعذر إنشاء سجل التسليم.', 'Could not create the submission.'));
      }
      void supabase.functions.invoke('grade-assignment', { body: { submission_id: result.data.id } });
      await notifyAssignmentEvent(activeAssignment.id, String(result.data.id), 'submitted');
      setStudentSubmissions((current) => [result.data as SubmissionRow, ...current.filter((submission) => rowText(submission, 'assignment_id') !== activeAssignment.id)]);
      setActiveSubmission(result.data as SubmissionRow);
      queryClient.setQueryData<Assignment[]>(getListMyAssignmentsQueryKey(), (current) => current?.map((assignment) => (
        assignment.id === activeAssignment.id
          ? { ...assignment, progress: 100, status: 'مكتمل' }
          : assignment
      )));
      void queryClient.invalidateQueries({ queryKey: getListMyAssignmentsQueryKey() });
      setSubmitting(false);
      Alert.alert(t('تم التسليم', 'Submitted'), t('تم إرسال الحل للمعلم وبدأ التصحيح الآلي.', 'Your answers were sent to the teacher and automatic grading has started.'));
    } catch (error) {
      setSubmitting(false);
      Alert.alert(t('تعذر تسليم الحل', 'Unable to submit'), error instanceof Error ? error.message : t('تحقق من اتصالك وحاول مرة أخرى.', 'Check your connection and try again.'));
    }
  };

  const pickImages = async () => {
    if (!activeAssignment?.allow_image) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('إذن الصور مطلوب', 'Photo permission required'), t('اسمح للتطبيق باختيار صور الحل.', 'Allow photo access to choose solution images.'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setSelectedImages(result.assets.slice(0, 5));
  };

  const toggleAudioRecording = async () => {
    if (!activeAssignment?.allow_audio || submitting) return;
    if (recording) {
      try {
        await recorder.stop();
        setRecording(false);
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) setAudioUri(recorder.uri);
      } catch (error) {
        setRecording(false);
        Alert.alert(t('تعذر حفظ التسجيل', 'Could not save recording'), error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'));
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('إذن الميكروفون مطلوب', 'Microphone permission required'), t('اسمح للتطبيق بتسجيل إجابة صوتية.', 'Allow microphone access to record an audio answer.'));
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      Alert.alert(t('تعذر بدء التسجيل', 'Could not start recording'), error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'));
    }
  };

  return (
    <Screen>
       <Header avatarText={profile?.displayName?.slice(0, 1)} eyebrow={role === 'student' ? t('تقدمك الدراسي', 'Your learning progress') : t('مركز المتابعة', 'Review center')} title={role === 'student' ? t('المهام والاختبارات', 'Assignments and quizzes') : t('المهام والتقييم', 'Assignments and grading')} onBell={() => router.push('/notifications')} onAvatar={() => router.push('/profile')} />
      {assignmentsQuery.isLoading ? <LoadingBlock /> : null}
      <View style={[styles.summary, { backgroundColor: colors.primary }]}>
        <View style={styles.summaryText}>
           <View style={styles.summaryKicker}><View style={[styles.summaryDot, { backgroundColor: colors.accent }]} /><Text style={[styles.summaryEyebrow, { color: colors.tint, writingDirection: direction }]}>{role === 'student' ? t('إيقاع هذا الأسبوع', 'This week’s rhythm') : t('صورة سريعة', 'Quick view')}</Text></View>
           <Text style={[styles.summaryTitle, { color: colors.primaryForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{`${formatNumber(finished)} ${t('من', 'of')} ${formatNumber(assignments.length)} ${t('مهام مكتملة', 'completed')}`}</Text>
           <Text style={[styles.summaryBody, { color: colors.tint, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{role === 'student' ? t('تقدّم ثابت يصنع فرقاً.', 'Steady progress makes a difference.') : t('تابع تقدم طلابك من بيانات المنصة.', 'Track your students’ progress from platform data.')}</Text>
        </View>
        <View style={[styles.ring, { borderColor: colors.accent }]}>
           <Text style={[styles.ringValue, { color: colors.primaryForeground }]}>{assignments.length ? `${formatNumber(average)}%` : '—'}</Text>
           <Text style={[styles.ringLabel, { color: colors.tint }]}>{t('متوسط', 'Average')}</Text>
        </View>
      </View>
      <View style={styles.headingRow}>
         <SectionHeading title={t('قائمة التعلّم', 'Learning list')} />
        <Pressable testID="refresh-assignments" onPress={() => void assignmentsQuery.refetch()} hitSlop={8} style={({ pressed }) => [styles.newButton, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}>
           <Icon name="refresh-cw" size={13} color={colors.secondaryForeground} /><Text style={[styles.newButtonText, { color: colors.secondaryForeground }]}>{t('تحديث', 'Refresh')}</Text>
        </Pressable>
      </View>
      <View style={[styles.filters, { borderBottomColor: colors.border }]}>
         {(['all', 'assignments', 'quizzes'] as const).map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={({ pressed }) => [styles.filter, filter === item && { borderBottomColor: colors.teal, borderBottomWidth: 2 }, pressed && styles.pressed]}><Text style={[styles.filterText, { color: filter === item ? colors.teal : colors.mutedForeground, writingDirection: direction }]}>{item === 'all' ? t('الكل', 'All') : item === 'assignments' ? t('واجبات', 'Assignments') : t('اختبارات', 'Quizzes')}</Text></Pressable>)}
      </View>
         {assignmentsQuery.isError ? <EmptyState icon="alert-circle" title={t('تعذر تحميل المهام', 'Unable to load assignments')} body={t('تحقق من اتصالك ثم أعد المحاولة.', 'Check your connection and try again.')} action={t('إعادة المحاولة', 'Try again')} onAction={() => void assignmentsQuery.refetch()} /> : visible.length ? visible.map((item) => <AssignmentRow key={item.id} assignment={item} completed={isAssignmentComplete(item, submittedIds.has(item.id))} submissionCount={role === 'teacher' ? submissionCounts[item.id] ?? 0 : 0} onPress={() => void openAssignment(item.id)} />) : <EmptyState icon="clipboard" title={t('لا توجد مهام', 'No assignments')} body={t('ستظهر المهام المتزامنة من المنصة هنا.', 'Assignments synced from the platform will appear here.')} />}
       <Modal visible={Boolean(reviewTarget)} transparent animationType="fade" onRequestClose={() => setReviewTarget(null)}>
         <View style={styles.modalBackdrop}>
           <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <View style={styles.reviewHeader}>
               <Pressable testID="close-assignment-review" onPress={() => setReviewTarget(null)} hitSlop={8}>
                 <Icon name="x" size={20} color={colors.mutedForeground} />
               </Pressable>
               <View style={styles.reviewCopy}>
                  <Text style={[styles.reviewTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{reviewTarget?.title ?? t('مراجعة التسليمات', 'Review submissions')}</Text>
                  <Text style={[styles.reviewBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('التسليمات المرسلة من الطلاب في منصة أجيال المعرفة.', 'Submissions sent by students on Ajyal Knowledge.')}</Text>
               </View>
             </View>
               {reviewLoading ? <View style={styles.reviewState}><ActivityIndicator color={colors.teal} /><Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{t('جارٍ تحميل التسليمات…', 'Loading submissions…')}</Text></View> : reviewError ? <Text style={[styles.reviewError, { color: colors.destructive }]}>{reviewError}</Text> : submissions.length ? (
                 <ScrollView showsVerticalScrollIndicator={false}>
                   {submissions.map((submission, index) => {
                     const submissionId = rowText(submission, 'id');
                     const editing = gradingSubmissionId === submissionId;
                      const answerValues = submissionAnswers(submission.answers, reviewQuestions.length);
                      const imageUrls = mediaUrls(submission.image_urls);
                      const audioUrl = rowText(submission, 'audio_url');
                     return (
                       <View key={String(submission.id ?? `${submission.student_id ?? 'student'}-${index}`)} style={[styles.submission, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                         <View style={styles.submissionTop}>
                           <Text style={[styles.submissionStatus, { color: colors.teal, writingDirection: direction }]}>{rowText(submission, 'status') || t('مرسل', 'Submitted')}</Text>
                           <Text style={[styles.submissionStudent, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{rowText(submission, 'student_name', 'student_email', 'student_id') || t('طالب مرتبط بالمهمة', 'Student linked to this assignment')}</Text>
                         </View>
                         <Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{rowText(submission, 'submitted_at', 'created_at') || t('وقت الإرسال غير متوفر', 'Submission time unavailable')}</Text>
                         {rowText(submission, 'text_answer') ? <Text style={[styles.submissionAnswer, { color: colors.foreground }]}>{rowText(submission, 'text_answer')}</Text> : null}
                          {reviewQuestions.length ? (
                            <View style={styles.submissionQuestions}>
                              {reviewQuestions.map((question, questionIndex) => {
                                const answer = answerValues[questionIndex];
                                return (
                                  <View key={`${submissionId}-answer-${questionIndex}`} style={[styles.submissionQuestion, { borderColor: colors.border, backgroundColor: colors.card }]}>
                                    <Text style={[styles.submissionQuestionText, { color: colors.foreground }]}>{questionIndex + 1}. {question.text}</Text>
                                    <Text style={[styles.submissionAnswer, { color: answer ? colors.foreground : colors.mutedForeground }]}>
                                      {answer || t('لم يجب الطالب عن هذا السؤال.', 'The student did not answer this question.')}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                          {answerValues.length === 0 && !reviewQuestions.length && submission.answers ? (
                            <Text style={[styles.submissionAnswer, { color: colors.foreground }]}>{t('إجابات الأسئلة:', 'Answers:')} {displayAnswer(submission.answers)}</Text>
                          ) : null}
                          {imageUrls.length ? (
                            <View style={styles.submissionMedia}>
                              <Text style={[styles.reviewBody, { color: colors.foreground }]}>{t('صور مرفقة:', 'Attached images:')}</Text>
                              <View style={styles.submissionImageGrid}>
                                {imageUrls.map((url, imageIndex) => (
                                  <Pressable key={`${submissionId}-image-${imageIndex}`} onPress={() => void Linking.openURL(url)}>
                                    <Image source={{ uri: url }} style={styles.submissionImage} resizeMode="cover" />
                                  </Pressable>
                                ))}
                              </View>
                            </View>
                          ) : null}
                          {audioUrl ? (
                            <Pressable onPress={() => playReviewAudio(audioUrl)} style={[styles.mediaButton, { backgroundColor: colors.tealSoft }]}>
                              <Icon name="volume-2" size={14} color={colors.teal} />
                              <Text style={[styles.submissionActionText, { color: colors.teal }]}>{t('تشغيل الإجابة الصوتية', 'Play audio answer')}</Text>
                            </Pressable>
                          ) : null}
                         {rowNumber(submission, 'final_score', 'teacher_score', 'ai_score') !== null ? <Text style={[styles.reviewBody, { color: colors.foreground }]}>{t('الدرجة:', 'Grade:')} {rowNumber(submission, 'final_score', 'teacher_score', 'ai_score')} / {reviewTotalPoints}</Text> : null}
                         {rowText(submission, 'ai_feedback') ? <Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{t('مساعدة AI:', 'AI guidance:')} {rowText(submission, 'ai_feedback')}</Text> : null}
                         {rowText(submission, 'teacher_feedback') ? <Text style={[styles.reviewBody, { color: colors.foreground }]}>{t('ملاحظات المعلم:', 'Teacher feedback:')} {rowText(submission, 'teacher_feedback')}</Text> : null}
                         <View style={styles.submissionActions}>
                           <Pressable onPress={() => void runAiGrade(submission)} disabled={!submissionId || Boolean(aiGradingSubmissionId)} style={({ pressed }) => [styles.submissionAction, { backgroundColor: colors.tealSoft }, pressed && styles.pressed]}>
                             {aiGradingSubmissionId === submissionId ? <ActivityIndicator size="small" color={colors.teal} /> : <Icon name="zap" size={14} color={colors.teal} />}
                             <Text style={[styles.submissionActionText, { color: colors.teal }]}>{t('مساعدة AI', 'AI assist')}</Text>
                           </Pressable>
                           <Pressable onPress={() => startSubmissionGrading(submission)} disabled={!submissionId} style={({ pressed }) => [styles.submissionAction, { backgroundColor: colors.navySoft }, pressed && styles.pressed]}>
                             <Icon name="edit-3" size={14} color={colors.primary} />
                             <Text style={[styles.submissionActionText, { color: colors.primary }]}>{t('تصحيح', 'Grade')}</Text>
                           </Pressable>
                         </View>
                         {editing ? (
                           <View style={[styles.gradePanel, { borderTopColor: colors.border }]}>
                             <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t(`الدرجة من ${reviewTotalPoints}`, `Grade out of ${reviewTotalPoints}`)}</Text>
                             <TextInput value={gradeDraft} onChangeText={setGradeDraft} keyboardType="decimal-pad" placeholder={t('أدخل الدرجة', 'Enter grade')} placeholderTextColor={colors.mutedForeground} style={[styles.gradeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
                             <TextInput value={feedbackDraft} onChangeText={setFeedbackDraft} multiline placeholder={t('ملاحظات للطالب', 'Feedback for the student')} placeholderTextColor={colors.mutedForeground} style={[styles.answerInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]} />
                              <Pressable onPress={() => void saveTeacherGrade(submission)} disabled={savingGradeSubmissionId === submissionId} style={({ pressed }) => [styles.saveGradeButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                                {savingGradeSubmissionId === submissionId ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>{t('حفظ التصحيح وإرسال النتيجة', 'Save grade and send result')}</Text>}
                             </Pressable>
                           </View>
                         ) : null}
                       </View>
                     );
                   })}
                 </ScrollView>
               ) : <Text style={[styles.reviewEmpty, { color: colors.mutedForeground, writingDirection: direction }]}>{t('لا توجد تسليمات مرسلة لهذه المهمة حتى الآن.', 'No submissions have been sent for this assignment yet.')}</Text>}
           </View>
         </View>
       </Modal>
        <Modal visible={Boolean(activeAssignment) || detailLoading} transparent animationType="slide" onRequestClose={() => setActiveAssignment(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.reviewCard, styles.assignmentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {detailLoading ? (
                <View style={styles.reviewState}>
                  <ActivityIndicator color={colors.teal} />
                  <Text style={[styles.reviewBody, { color: colors.mutedForeground }]}>{t('جارٍ تحميل المهمة…', 'Loading assignment…')}</Text>
                </View>
              ) : activeAssignment ? (
                <>
                  <View style={styles.reviewHeader}>
                    <Pressable testID="close-assignment-detail" onPress={() => setActiveAssignment(null)} hitSlop={8}>
                      <Icon name="x" size={20} color={colors.mutedForeground} />
                    </Pressable>
                    <View style={styles.reviewCopy}>
                      <Text style={[styles.reviewTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{activeAssignment.title}</Text>
                      <Text style={[styles.reviewBody, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>
                        {activeAssignment.questions.length} {t('أسئلة', 'questions')} · {activeAssignment.total_points} {t('درجة', 'points')}
                      </Text>
                    </View>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {activeAssignment.description ? <Text style={[styles.detailDescription, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{activeAssignment.description}</Text> : null}
                    {activeSubmission ? (
                      <View style={[styles.resultBanner, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}>
                        <Text style={[styles.resultTitle, { color: colors.foreground, writingDirection: direction }]}>{t('تم تسليم الحل', 'Submission received')}</Text>
                        {rowNumber(activeSubmission, 'final_score', 'ai_score') !== null ? (
                          <Text style={[styles.resultScore, { color: colors.teal }]}>{rowNumber(activeSubmission, 'final_score', 'ai_score')} / {activeAssignment.total_points}</Text>
                        ) : (
                          <Text style={[styles.reviewBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t('قيد التصحيح — ستظهر النتيجة هنا بعد اعتمادها.', 'Awaiting grading — the result will appear here when it is ready.')}</Text>
                        )}
                        {rowText(activeSubmission, 'teacher_feedback') ? <Text style={[styles.reviewBody, { color: colors.foreground, writingDirection: direction }]}>{t('ملاحظات المعلم:', 'Teacher feedback:')} {rowText(activeSubmission, 'teacher_feedback')}</Text> : null}
                        {!rowText(activeSubmission, 'teacher_feedback') && rowText(activeSubmission, 'ai_feedback') ? <Text style={[styles.reviewBody, { color: colors.mutedForeground, writingDirection: direction }]}>{t('التقييم الأولي من AI:', 'Initial AI feedback:')} {rowText(activeSubmission, 'ai_feedback')}</Text> : null}
                      </View>
                    ) : null}
                    {activeAssignment.questions.map((question, index) => (
                      <View key={`${activeAssignment.id}-question-${index}`} style={[styles.questionCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                        <View style={styles.questionHeader}>
                          <Text style={[styles.questionText, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{index + 1}. {question.text}</Text>
                          {question.points ? <Text style={[styles.questionPoints, { color: colors.mutedForeground }]}>{question.points}</Text> : null}
                        </View>
                        {question.type === 'multiple_choice' && question.options.length ? (
                          <View style={styles.options}>
                            {question.options.map((option) => {
                              const selected = answers[index] === option;
                              return (
                                <Pressable key={option} disabled={Boolean(activeSubmission)} onPress={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? option : answer))} style={[styles.option, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card }]}>
                                  <View style={[styles.optionDot, { borderColor: selected ? colors.teal : colors.mutedForeground, backgroundColor: selected ? colors.teal : 'transparent' }]} />
                                  <Text style={[styles.optionText, { color: colors.foreground, writingDirection: direction }]}>{option}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : question.type === 'true_false' ? (
                          <View style={styles.options}>
                            {['صح', 'خطأ'].map((option) => {
                              const selected = answers[index] === option;
                              return <Pressable key={option} disabled={Boolean(activeSubmission)} onPress={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? option : answer))} style={[styles.option, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card }]}><Text style={[styles.optionText, { color: colors.foreground, writingDirection: direction }]}>{option}</Text></Pressable>;
                            })}
                          </View>
                        ) : (
                          <TextInput
                            editable={!activeSubmission}
                            value={answers[index] ?? ''}
                            onChangeText={(value) => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer))}
                            multiline
                            placeholder={t('اكتب إجابتك هنا', 'Write your answer here')}
                            placeholderTextColor={colors.mutedForeground}
                            style={[styles.answerInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
                          />
                        )}
                      </View>
                    ))}
                    {activeAssignment.allow_text ? (
                      <View style={styles.extraAnswer}>
                        <Text style={[styles.fieldLabel, { color: colors.foreground, writingDirection: direction }]}>{t('إجابة نصية إضافية', 'Additional written answer')}</Text>
                        <TextInput
                          editable={!activeSubmission}
                          value={textAnswer}
                          onChangeText={setTextAnswer}
                          multiline
                          placeholder={t('اكتب حلاً أو ملاحظة إضافية…', 'Write an additional answer or note…')}
                          placeholderTextColor={colors.mutedForeground}
                          style={[styles.answerInput, { minHeight: 92, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
                        />
                      </View>
                    ) : null}
                    {!activeSubmission && activeAssignment.allow_image ? (
                      <View style={styles.extraAnswer}>
                        <Text style={[styles.fieldLabel, { color: colors.foreground, writingDirection: direction }]}>{t('صور الحل', 'Solution images')}</Text>
                        <Pressable onPress={() => void pickImages()} style={({ pressed }) => [styles.attachmentButton, { borderColor: colors.border, backgroundColor: colors.muted }, pressed && styles.pressed]}>
                          <Icon name="image" size={16} color={colors.teal} />
                          <Text style={[styles.attachmentText, { color: colors.foreground, writingDirection: direction }]}>{selectedImages.length ? `${selectedImages.length} ${t('صور محددة', 'images selected')}` : t('اختيار صور من المعرض', 'Choose images from gallery')}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {!activeSubmission && activeAssignment.allow_audio ? (
                      <View style={styles.extraAnswer}>
                        <Text style={[styles.fieldLabel, { color: colors.foreground, writingDirection: direction }]}>{t('إجابة صوتية', 'Audio answer')}</Text>
                        <Pressable onPress={() => void toggleAudioRecording()} style={({ pressed }) => [styles.attachmentButton, { borderColor: recording ? colors.destructive : colors.border, backgroundColor: recording ? colors.destructive + '12' : colors.muted }, pressed && styles.pressed]}>
                          <Icon name={recording ? 'square' : audioUri ? 'check-circle' : 'mic'} size={16} color={recording ? colors.destructive : colors.teal} />
                          <Text style={[styles.attachmentText, { color: colors.foreground, writingDirection: direction }]}>{recording ? t('إيقاف التسجيل', 'Stop recording') : audioUri ? t('تم تسجيل إجابة صوتية', 'Audio answer recorded') : t('ابدأ تسجيل الإجابة', 'Record an audio answer')}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {activeSubmission && Array.isArray(activeSubmission.ai_breakdown) && activeSubmission.ai_breakdown.length ? (
                      <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
                        <Text style={[styles.fieldLabel, { color: colors.foreground, writingDirection: direction }]}>{t('تفاصيل التصحيح', 'Grading details')}</Text>
                        {activeSubmission.ai_breakdown.map((entry, index) => {
                          const breakdown = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
                          return <View key={`breakdown-${index}`} style={[styles.breakdownRow, { borderColor: colors.border }]}><Text style={[styles.reviewBody, { color: colors.foreground, writingDirection: direction }]}>{rowText(breakdown, 'question') || `${index + 1}`}</Text><Text style={[styles.reviewBody, { color: colors.mutedForeground, writingDirection: direction }]}>{rowText(breakdown, 'points')} {t('درجة', 'points')} — {rowText(breakdown, 'comment')}</Text></View>;
                        })}
                      </View>
                    ) : null}
                    {!activeSubmission ? <Pressable testID="submit-assignment" onPress={() => void submitAssignment()} disabled={submitting} style={({ pressed }) => [styles.submitButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>{submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>{t('تسليم الحل للمعلم', 'Submit to teacher')}</Text>}</Pressable> : null}
                  </ScrollView>
                </>
              ) : null}
            </View>
          </View>
        </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { minHeight: 151, borderRadius: 22, padding: 17, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  summaryText: { flex: 1, alignItems: 'flex-end' },
  summaryKicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDot: { width: 6, height: 6, borderRadius: 3 },
  summaryEyebrow: { fontSize: 10, fontFamily: 'Inter_500Medium', writingDirection: 'rtl' },
  summaryTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 10, textAlign: 'right', writingDirection: 'rtl' },
  summaryBody: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 5, writingDirection: 'rtl' },
  ring: { width: 79, height: 79, borderRadius: 40, borderWidth: 5, alignItems: 'center', justifyContent: 'center', marginLeft: 3 },
  ringValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  ringLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  newButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, marginBottom: 11, flexDirection: 'row', alignItems: 'center', gap: 5 },
  newButtonText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  filters: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 15, gap: 24 },
  filter: { paddingBottom: 9 },
  filterText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  pressed: { opacity: 0.72 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(6, 24, 44, 0.55)', justifyContent: 'center', padding: 18 },
  reviewCard: { borderRadius: 20, borderWidth: 1, padding: 16, maxHeight: '82%' },
  assignmentCard: { maxHeight: '92%' },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  reviewCopy: { flex: 1, alignItems: 'flex-end' },
  reviewTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  reviewBody: { fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 5 },
  detailDescription: { fontSize: 12, lineHeight: 20, marginBottom: 12, fontFamily: 'Inter_400Regular' },
  resultBanner: { borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 12 },
  resultTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  resultScore: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 7, textAlign: 'right' },
  questionCard: { borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 10 },
  questionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 9 },
  questionText: { flex: 1, fontSize: 12, lineHeight: 19, fontFamily: 'Inter_600SemiBold' },
  questionPoints: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  options: { gap: 7 },
  option: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  optionText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  answerInput: { minHeight: 62, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  extraAnswer: { marginTop: 3, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'right', marginBottom: 7 },
  attachmentButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'right' },
  submitButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 4 },
  submitButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  breakdown: { borderTopWidth: 1, paddingTop: 13, marginTop: 3, marginBottom: 13 },
  breakdownRow: { borderWidth: 1, borderRadius: 10, padding: 9, marginTop: 7 },
  reviewState: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  reviewError: { fontSize: 11, lineHeight: 18, textAlign: 'right', writingDirection: 'rtl', paddingVertical: 18 },
  reviewEmpty: { textAlign: 'center', paddingVertical: 24, fontSize: 11, fontFamily: 'Inter_400Regular' },
  submission: { borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 8 },
  submissionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  submissionStudent: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  submissionStatus: { fontSize: 10, fontFamily: 'Inter_600SemiBold', writingDirection: 'rtl' },
  submissionAnswer: { fontSize: 11, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 6 },
  submissionQuestions: { marginTop: 8, gap: 7 },
  submissionQuestion: { borderWidth: 1, borderRadius: 10, padding: 9 },
  submissionQuestionText: { fontSize: 11, lineHeight: 17, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  submissionMedia: { marginTop: 8 },
  submissionImageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  submissionImage: { width: 78, height: 78, borderRadius: 9 },
  mediaButton: { alignSelf: 'flex-end', minHeight: 35, borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  submissionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7, marginTop: 10 },
  submissionAction: { minHeight: 34, borderRadius: 9, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  submissionActionText: { fontSize: 10, fontFamily: 'Inter_700Bold', writingDirection: 'rtl' },
  gradePanel: { borderTopWidth: 1, marginTop: 11, paddingTop: 11, gap: 8 },
  gradeInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  saveGradeButton: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
});