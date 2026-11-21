import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Icon } from '@/components/AjyalUI';
import { useAppPreferences } from '@/contexts/AppPreferencesContext';
import { useColors } from '@/hooks/useColors';
import { extractEdgeFunctionError } from '@/lib/edgeFunctionError';
import {
  AssignmentAttachment,
  AssignmentContentType,
  AssignmentQuestionDraft,
  AssignmentQuestionType,
  buildAssignmentPayload,
  parseAssignmentDueDate,
  validateAssignmentDraft,
} from '@/lib/assignmentAuthoring';
import { supabase } from '@/lib/supabase';

type TeacherAssignmentComposerProps = {
  visible: boolean;
  teacherId: string;
  onClose: () => void;
  onCreated: () => void;
};

type TeacherStudent = { id: string; name: string };
type SubjectRow = { id: string; name: string };
type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  options: unknown;
  correct_answer: string | null;
  explanation: string | null;
  teaching_stage: string | null;
  subject_id: string | null;
  points: number | null;
};

const QUESTION_TYPES: Array<{ value: AssignmentQuestionType; label: string }> = [
  { value: 'text', label: 'نص حر' },
  { value: 'multiple_choice', label: 'اختيار واحد' },
  { value: 'multiple_select', label: 'متعدد' },
  { value: 'true_false', label: 'صح / خطأ' },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const IMPORT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
];
type NotificationDelivery = 'sent' | 'partial' | 'no_recipients' | 'failed';
const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function newQuestion(): AssignmentQuestionDraft {
  return {
    id: Crypto.randomUUID(),
    text: '',
    type: 'text',
    options: [],
    correct: '',
    explanation: '',
    points: 10,
  };
}

function fileExtension(name: string): string {
  return name.split('.').pop()?.trim().toLowerCase() ?? '';
}

function normalizeMimeType(value: string | null | undefined): string {
  return value === 'image/jpg' ? 'image/jpeg' : value ?? '';
}

function normalizeBankQuestion(question: BankQuestion): AssignmentQuestionDraft {
  const type = ['text', 'multiple_choice', 'multiple_select', 'true_false'].includes(question.question_type)
    ? question.question_type as AssignmentQuestionType
    : 'text';
  return {
    id: Crypto.randomUUID(),
    text: question.question_text ?? '',
    type,
    options: Array.isArray(question.options) ? question.options.filter((item): item is string => typeof item === 'string') : [],
    correct: question.correct_answer ?? '',
    correct_answer: question.correct_answer,
    explanation: question.explanation ?? '',
    points: Number(question.points) > 0 ? Number(question.points) : 10,
  };
}

export function TeacherAssignmentComposer({ visible, teacherId, onClose, onCreated }: TeacherAssignmentComposerProps) {
  const colors = useColors();
  const { t, direction } = useAppPreferences();
  const insets = useSafeAreaInsets();
  const isRTL = direction === 'rtl';

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [title, setTitle] = useState('');
  const [draftAssignmentId, setDraftAssignmentId] = useState(() => Crypto.randomUUID());
  const [description, setDescription] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [stage, setStage] = useState('');
  const [dueDateText, setDueDateText] = useState('');
  const [dueTimeText, setDueTimeText] = useState('');
  const [contentType, setContentType] = useState<AssignmentContentType>('assignment');
  const [questions, setQuestions] = useState<AssignmentQuestionDraft[]>([]);
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [errorText, setErrorText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingBankQuestionId, setSavingBankQuestionId] = useState<string | null>(null);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [showStudents, setShowStudents] = useState(false);
  const [showSubjects, setShowSubjects] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [bankSearch, setBankSearch] = useState('');

  const selectedStudent = students.find((student) => student.id === studentId);
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase();
    return query ? students.filter((student) => student.name.toLocaleLowerCase().includes(query)) : students;
  }, [studentSearch, students]);
  const filteredSubjects = useMemo(() => {
    const query = subjectSearch.trim().toLocaleLowerCase();
    return query ? subjects.filter((subject) => subject.name.toLocaleLowerCase().includes(query)) : subjects;
  }, [subjectSearch, subjects]);
  const filteredBank = useMemo(() => {
    const query = bankSearch.trim().toLocaleLowerCase();
    return query ? bank.filter((question) => question.question_text.toLocaleLowerCase().includes(query)) : bank;
  }, [bank, bankSearch]);
  const totalPoints = questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0) || 100;

  useEffect(() => {
    if (visible) void loadFormOptions();
  }, [visible, teacherId]);

  useEffect(() => {
    if (visible) return;
    resetDraft();
  }, [visible]);

  const resetDraft = () => {
    setTitle('');
    setDraftAssignmentId(Crypto.randomUUID());
    setDescription('');
    setStudentId(null);
    setSubjectId('');
    setStage('');
    setDueDateText('');
    setDueTimeText('');
    setContentType('assignment');
    setQuestions([]);
    setAttachments([]);
    setErrorText('');
    setShowStudents(false);
    setShowSubjects(false);
    setShowBank(false);
    setStudentSearch('');
    setSubjectSearch('');
    setBankSearch('');
  };

  const loadFormOptions = async () => {
    if (!supabase || !teacherId) {
      setOptionsError(t('تعذر الاتصال بمنصة أجيال المعرفة.', 'Could not connect to Ajyal Knowledge.'));
      return;
    }
    setLoadingOptions(true);
    setOptionsError('');
    try {
      const [subjectsResult, bookingsResult, bankResult] = await Promise.all([
        supabase.from('subjects').select('*').order('name', { ascending: true }),
        supabase.from('bookings').select('student_id').eq('teacher_id', teacherId).in('status', ['confirmed', 'completed']),
        supabase.from('question_bank' as any).select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false }).limit(150),
      ]);
      if (subjectsResult.error) throw subjectsResult.error;
      setSubjects(((subjectsResult.data ?? []) as Array<Record<string, unknown>>)
        .filter((subject) => typeof subject.id === 'string' && typeof subject.name === 'string')
        .map((subject) => ({ id: String(subject.id), name: String(subject.name) })));

      if (bookingsResult.error) throw bookingsResult.error;
      const studentIds = [...new Set((bookingsResult.data ?? []).map((booking) => booking.student_id).filter((id): id is string => typeof id === 'string' && Boolean(id)))];
      if (studentIds.length) {
        const profilesResult = await supabase.from('public_profiles').select('user_id, full_name').in('user_id', studentIds);
        if (profilesResult.error) throw profilesResult.error;
        setStudents((profilesResult.data ?? [])
          .filter((profile) => typeof profile.user_id === 'string')
          .map((profile) => ({ id: profile.user_id, name: profile.full_name?.trim() || t('طالب', 'Student') }))
          .sort((left, right) => left.name.localeCompare(right.name, 'ar')));
      } else {
        setStudents([]);
      }

      if (bankResult.error) throw bankResult.error;
      setBank((bankResult.data ?? []) as BankQuestion[]);
    } catch (error) {
      setOptionsError(error instanceof Error ? error.message : t('تعذر تحميل بيانات الإنشاء.', 'Could not load assignment options.'));
    } finally {
      setLoadingOptions(false);
    }
  };

  const updateQuestion = (id: string, patch: Partial<AssignmentQuestionDraft>) => {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question));
  };

  const removeQuestion = (id: string) => {
    setQuestions((current) => current.filter((question) => question.id !== id));
  };

  const addBankQuestion = (question: BankQuestion) => {
    setQuestions((current) => [...current, normalizeBankQuestion(question)]);
    setShowBank(false);
    setBankSearch('');
  };

  const uploadAssignmentAttachments = async () => {
    if (uploadingAttachments) return;
    if (!supabase) {
      Alert.alert(t('تعذر رفع الملف', 'Could not upload file'), t('اتصال المنصة غير متاح.', 'The platform connection is unavailable.'));
      return;
    }
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ATTACHMENT_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
    } catch (error) {
      Alert.alert(t('تعذر فتح الملفات', 'Could not open files'), error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'));
      return;
    }
    if (result.canceled || !result.assets.length) return;

    setUploadingAttachments(true);
    setErrorText('');
    const uploaded: AssignmentAttachment[] = [];
    const failed: string[] = [];
    try {
      for (const asset of result.assets) {
        if (typeof asset.size === 'number' && asset.size > MAX_FILE_BYTES) {
          failed.push(`${asset.name}: ${t('الحجم أكبر من 10MB.', 'exceeds 10 MB.')}`);
          continue;
        }
        const extension = fileExtension(asset.name);
        const type = normalizeMimeType(asset.mimeType) || EXTENSION_MIME[extension] || '';
        if (!ATTACHMENT_TYPES.includes(type)) {
          failed.push(`${asset.name}: ${t('نوع الملف غير مدعوم.', 'unsupported file type.')}`);
          continue;
        }
        const path = `${teacherId}/assignments/${Date.now()}-${Crypto.randomUUID()}.${extension || 'bin'}`;
        try {
          const file = new File(asset.uri);
          if (file.size > MAX_FILE_BYTES) {
            failed.push(`${asset.name}: ${t('الحجم أكبر من 10MB.', 'exceeds 10 MB.')}`);
            continue;
          }
          const upload = await supabase.storage.from('assignment-files').upload(path, file, {
            contentType: type,
            upsert: false,
          });
          if (upload.error) throw upload.error;
          const signed = await supabase.storage.from('assignment-files').createSignedUrl(path, 60 * 60 * 24 * 365);
          if (signed.error || !signed.data?.signedUrl) {
            await supabase.storage.from('assignment-files').remove([path]);
            throw signed.error ?? new Error(t('تعذر إنشاء رابط آمن للملف.', 'Could not create a secure file link.'));
          }
          uploaded.push({ name: asset.name, url: signed.data.signedUrl, type });
        } catch (error) {
          failed.push(`${asset.name}: ${error instanceof Error ? error.message : t('تعذر الرفع.', 'upload failed.')}`);
        }
      }
      if (uploaded.length) setAttachments((current) => [...current, ...uploaded]);
      if (failed.length) Alert.alert(t('بعض الملفات لم تُرفع', 'Some files could not be uploaded'), failed.join('\n'));
    } finally {
      setUploadingAttachments(false);
    }
  };

  const importQuestionsFromFile = async () => {
    if (importingQuestions) return;
    if (!supabase) {
      Alert.alert(t('تعذر استيراد الأسئلة', 'Question import failed'), t('اتصال المنصة غير متاح.', 'The platform connection is unavailable.'));
      return;
    }
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: IMPORT_TYPES,
        copyToCacheDirectory: true,
      });
    } catch (error) {
      Alert.alert(t('تعذر فتح الملفات', 'Could not open files'), error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'));
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const extension = fileExtension(asset.name);
    const type = normalizeMimeType(asset.mimeType) || EXTENSION_MIME[extension] || '';
    if (!['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp'].includes(extension) || !IMPORT_TYPES.includes(type)) {
      Alert.alert(t('نوع ملف غير مدعوم', 'Unsupported file type'), t('استخدم PDF أو DOCX أو JPG أو PNG أو WEBP.', 'Use PDF, DOCX, JPG, PNG, or WEBP.'));
      return;
    }
    if (typeof asset.size === 'number' && asset.size > MAX_FILE_BYTES) {
      Alert.alert(t('الملف كبير', 'File too large'), t('الحد الأقصى 10 ميجابايت.', 'The maximum file size is 10 MB.'));
      return;
    }

    setImportingQuestions(true);
    try {
      const file = new File(asset.uri);
      if (file.size === 0 || file.size > MAX_FILE_BYTES) {
        throw new Error(file.size === 0
          ? t('الملف فارغ أو تعذر قراءته.', 'The file is empty or could not be read.')
          : t('الحد الأقصى 10 ميجابايت.', 'The maximum file size is 10 MB.'));
      }
      const path = `${teacherId}/bank-imports/${Date.now()}-${Crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from('assignment-files').upload(path, file, { contentType: type, upsert: false });
      if (upload.error) throw upload.error;
      const response = await supabase.functions.invoke('extract-questions-from-file', {
        body: {
          file_path: path,
          file_type: type,
          file_name: asset.name,
          subject_id: subjectId || null,
          teaching_stage: stage.trim() || null,
        },
      });
      if (response.error) {
        const details = await extractEdgeFunctionError(response.error);
        throw new Error(details.message || response.error.message || t('تعذر الاتصال بخدمة استخراج الأسئلة.', 'Could not reach the question extraction service.'));
      }
      const data = response.data as { error?: string; count?: number; questions?: BankQuestion[] } | null;
      if (data?.error) throw new Error(data.error);
      const extractedQuestions = Array.isArray(data?.questions) ? data.questions : [];
      setBank((current) => {
        const existingIds = new Set(current.map((question) => question.id));
        return [...extractedQuestions.filter((question) => !existingIds.has(question.id)), ...current];
      });
      Alert.alert(
        t('تم استخراج الأسئلة', 'Questions extracted'),
        `${t('أُضيفت إلى بنك الأسئلة:', 'Added to the question bank:')} ${data?.count ?? extractedQuestions.length}`,
      );
    } catch (error) {
      Alert.alert(
        t('تعذر استيراد الأسئلة', 'Question import failed'),
        error instanceof Error ? error.message : t('تحقق من الملف والاتصال ثم حاول مرة أخرى.', 'Check the file and connection, then try again.'),
      );
    } finally {
      setImportingQuestions(false);
    }
  };

  const saveQuestionToBank = async (question: AssignmentQuestionDraft) => {
    if (!supabase || savingBankQuestionId === question.id) return;
    if (!question.text.trim()) {
      Alert.alert(t('نص السؤال مطلوب', 'Question text required'), t('أضف نص السؤال قبل حفظه في البنك.', 'Enter the question before saving it to the bank.'));
      return;
    }
    const invalidQuestion = validateAssignmentDraft({
      title: 'سؤال',
      contentType: 'assignment',
      questions: [question],
      dueDate: { kind: 'empty' },
    });
    if (invalidQuestion === 'invalid_question') {
      Alert.alert(t('راجع السؤال', 'Review the question'), t('أكمل الخيارات والإجابة الصحيحة والدرجة قبل حفظ السؤال.', 'Complete the options, correct answer, and points before saving.'));
      return;
    }
    setSavingBankQuestionId(question.id);
    try {
      const { data, error } = await supabase.from('question_bank' as any).insert({
        teacher_id: teacherId,
        question_text: question.text.trim(),
        question_type: question.type,
        options: question.options.map((option) => option.trim()).filter(Boolean),
        correct_answer: question.correct.trim() || null,
        explanation: question.explanation?.trim() || null,
        teaching_stage: stage.trim() || null,
        subject_id: subjectId || null,
        points: Number(question.points) || 10,
        is_public: false,
      }).select('*').single();
      if (error) throw error;
      setBank((current) => [data as BankQuestion, ...current.filter((item) => item.id !== (data as BankQuestion).id)]);
      Alert.alert(t('تم حفظ السؤال', 'Question saved'), t('أُضيف السؤال إلى بنك الأسئلة.', 'The question was added to your question bank.'));
    } catch (error) {
      Alert.alert(
        t('تعذر حفظ السؤال', 'Could not save question'),
        error instanceof Error ? error.message : t('حاول مرة أخرى.', 'Please try again.'),
      );
    } finally {
      setSavingBankQuestionId(null);
    }
  };

  const deleteBankQuestion = (question: BankQuestion) => {
    Alert.alert(
      t('حذف السؤال', 'Delete question'),
      t('سيُحذف السؤال من بنكك فقط، ولن تتأثر المهام المنشورة.', 'This removes the question from your bank only; published assignments remain unchanged.'),
      [
        { text: t('إلغاء', 'Cancel'), style: 'cancel' },
        {
          text: t('حذف', 'Delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!supabase) return;
              const result = await supabase.from('question_bank' as any).delete().eq('id', question.id);
              if (result.error) {
                Alert.alert(t('تعذر الحذف', 'Could not delete'), result.error.message);
                return;
              }
              setBank((current) => current.filter((item) => item.id !== question.id));
            })();
          },
        },
      ],
    );
  };

  const sendChatToStudent = async (student: string, assignmentTitle: string, assignmentDescription: string, questionCount: number, points: number, dueDate: string | null) => {
    if (!supabase) return false;
    const booking = await supabase.from('bookings')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('student_id', student)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (booking.error) return false;
    if (!booking.data?.id) return true;
    const dueText = dueDate ? ` • حتى ${new Date(dueDate).toLocaleDateString('ar')}` : '';
    const content = `[[ASSIGNMENT:/student/assignments]]\n📝 واجب جديد: ${assignmentTitle}${assignmentDescription ? `\n${assignmentDescription}` : ''}\n${questionCount} أسئلة • ${points} درجة${dueText}`;
    const message = await supabase.from('chat_messages').insert({
      booking_id: booking.data.id,
      sender_id: teacherId,
      content,
    });
    return !message.error;
  };

  const notifyStudents = async (input: {
    assignmentTitle: string;
    assignmentDescription: string;
    studentId: string | null;
    questionCount: number;
    points: number;
    dueDate: string | null;
  }): Promise<NotificationDelivery> => {
    if (!supabase) return 'failed';
    let recipientIds: string[] = [];
    if (input.studentId) {
      recipientIds = [input.studentId];
    } else {
      const bookings = await supabase.from('bookings')
        .select('student_id')
        .eq('teacher_id', teacherId)
        .in('status', ['confirmed', 'completed']);
      if (bookings.error) return 'failed';
      const candidates = [...new Set((bookings.data ?? []).map((booking) => booking.student_id).filter((id): id is string => typeof id === 'string' && Boolean(id)))];
      if (candidates.length) {
        const subscriptions = await supabase.from('user_subscriptions')
          .select('user_id')
          .in('user_id', candidates)
          .eq('is_active', true)
          .gt('remaining_minutes', 0);
        if (subscriptions.error) return 'failed';
        const activeIds = new Set((subscriptions.data ?? []).map((subscription) => subscription.user_id));
        recipientIds = candidates.filter((id) => activeIds.has(id));
      }
    }
    if (!recipientIds.length) return 'no_recipients';

    const link = '/student/assignments';
    const notifications = await supabase.from('notifications').insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        title: '📝 واجب جديد',
        body: `واجب جديد: ${input.assignmentTitle}`,
        type: 'assignment',
        link,
      })),
    );
    const chats = await Promise.allSettled(recipientIds.map((student) => sendChatToStudent(
      student,
      input.assignmentTitle,
      input.assignmentDescription,
      input.questionCount,
      input.points,
      input.dueDate,
    )));
    const chatSuccessCount = chats.filter((result) => result.status === 'fulfilled' && result.value).length;
    if (!notifications.error && chatSuccessCount === recipientIds.length) return 'sent';
    if (!notifications.error || chatSuccessCount > 0) return 'partial';
    return 'failed';
  };

  const saveAssignment = async () => {
    if (saving) return;
    if (!supabase || !teacherId) {
      Alert.alert(t('تعذر إنشاء المهمة', 'Could not create assignment'), t('اتصال المنصة أو حساب المعلم غير متاح.', 'The platform connection or teacher account is unavailable.'));
      return;
    }
    const dueDate = parseAssignmentDueDate(dueDateText, dueTimeText);
    const validation = validateAssignmentDraft({ title, contentType, questions, dueDate });
    if (validation) {
      const messages: Record<typeof validation, string> = {
        title_required: t('اكتب عنوان الواجب أو الاختبار.', 'Enter an assignment or quiz title.'),
        quiz_question_required: t('أضف سؤالًا واحدًا على الأقل للاختبار.', 'Add at least one question to the quiz.'),
        invalid_question: t('راجع الأسئلة: النص والدرجة والاختيارات والإجابة الصحيحة مطلوبة.', 'Review each question’s text, points, options, and correct answer.'),
        invalid_due_date: t('أدخل تاريخًا ووقتًا صحيحين، أو اترك الحقلين فارغين.', 'Enter a valid date and time, or leave both fields empty.'),
      };
      setErrorText(messages[validation]);
      return;
    }
    setErrorText('');
    setSaving(true);
    const payload = buildAssignmentPayload({
      assignmentId: draftAssignmentId,
      teacherId,
      studentId,
      contentType,
      title,
      description,
      subjectId,
      stage,
      dueDate,
      questions,
      attachments,
    });
    let createdId: string | null = null;
    try {
      const created = await supabase.from('assignments' as any).insert(payload).select('id').single();
      if (created.error || !created.data?.id) {
        const recovered = await supabase.from('assignments' as any)
          .select('id')
          .eq('id', draftAssignmentId)
          .eq('teacher_id', teacherId)
          .maybeSingle();
        if (recovered.error || !recovered.data?.id) {
          throw created.error ?? recovered.error ?? new Error(t('لم يتم إنشاء المهمة.', 'The assignment was not created.'));
        }
        createdId = String(recovered.data.id);
      } else {
        createdId = String(created.data.id);
      }
    } catch (error) {
      Alert.alert(
        t('تعذر إنشاء المهمة', 'Could not create assignment'),
        `${error instanceof Error ? error.message : t('تحقق من اتصالك ثم حاول مرة أخرى.', 'Check your connection and try again.')}\n${t('يمكنك إعادة المحاولة بأمان دون إنشاء مهمة مكررة.', 'You can safely retry without creating a duplicate assignment.')}`,
      );
      setSaving(false);
      return;
    }

    let delivery: NotificationDelivery = 'failed';
    try {
      delivery = await notifyStudents({
        assignmentTitle: payload.title,
        assignmentDescription: description.trim(),
        studentId,
        questionCount: questions.length,
        points: payload.total_points,
        dueDate: payload.due_date,
      });
    } catch (error) {
      console.warn('[assignments] Notification after assignment creation failed', error);
      delivery = 'failed';
    } finally {
      setSaving(false);
    }
    if (!createdId) return;
    onCreated();
    if (delivery === 'sent') {
      Alert.alert(t('تم إنشاء المهمة', 'Assignment created'), t('حُفظت المهمة وأُرسل تنبيه للطلاب المستهدفين.', 'The assignment was saved and the target students were notified.'));
    } else if (delivery === 'no_recipients') {
      Alert.alert(t('تم إنشاء المهمة', 'Assignment created'), t('حُفظت المهمة، لكن لا يوجد مستفيدون مؤهلون لإرسال تنبيه لهم حاليًا.', 'The assignment was saved, but there are no eligible students to notify right now.'));
    } else if (delivery === 'partial') {
      Alert.alert(t('تم إنشاء المهمة', 'Assignment created'), t('حُفظت المهمة، لكن تعذر إكمال كل التنبيهات ورسائل المحادثة.', 'The assignment was saved, but some notifications or chat messages could not be delivered.'));
    } else {
      Alert.alert(t('تم إنشاء المهمة', 'Assignment created'), t('حُفظت المهمة، لكن تعذر إرسال بعض التنبيهات. يمكنك تحديث قائمة المهام للتحقق.', 'The assignment was saved, but some notifications could not be sent. Refresh the assignment list to verify.'));
    }
  };

  const fieldStyle = [styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' as const : 'left' as const }];
  const labelStyle = [styles.label, { color: colors.foreground, textAlign: isRTL ? 'right' as const : 'left' as const }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!saving) onClose(); }}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable testID="close-assignment-composer" accessibilityRole="button" accessibilityLabel={t('إغلاق', 'Close')} disabled={saving} onPress={onClose} hitSlop={10} style={[styles.iconButton, { backgroundColor: colors.muted }, saving && styles.disabled]}>
            <Icon name="x" size={18} color={colors.mutedForeground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('إنشاء مهمة جديدة', 'Create a new assignment')}</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('ستظهر تلقائيًا للطالب في تطبيقه.', 'It will appear in the student’s app automatically.')}</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: colors.tealSoft }]}>
            <Icon name="clipboard" size={17} color={colors.teal} />
          </View>
        </View>

        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={styles.content}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {optionsError ? (
            <View style={[styles.notice, { backgroundColor: colors.goldSoft, borderColor: colors.border }]}>
              <Text style={[styles.noticeText, { color: colors.foreground, writingDirection: direction }]}>{optionsError}</Text>
              <Pressable onPress={() => void loadFormOptions()}><Text style={[styles.linkText, { color: colors.teal }]}>{t('إعادة التحميل', 'Retry')}</Text></Pressable>
            </View>
          ) : null}
          {loadingOptions ? <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>{t('جارٍ تحميل الطلاب والمواد…', 'Loading students and subjects…')}</Text></View> : null}

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sectionHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.tealSoft }]}><Icon name="file-text" size={16} color={colors.teal} /></View>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('بيانات المهمة', 'Assignment details')}</Text>
                <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('أدخل التفاصيل التي ستظهر للطالب.', 'Add the details students will see.')}</Text>
              </View>
            </View>

            <Text style={labelStyle}>{t('نوع المحتوى', 'Content type')}</Text>
            <View style={[styles.choiceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {([
                ['assignment', t('واجب', 'Assignment'), 'book-open'],
                ['quiz', t('اختبار', 'Quiz'), 'check-square'],
              ] as const).map(([value, label, icon]) => {
                const active = contentType === value;
                return (
                  <Pressable key={value} testID={`assignment-type-${value}`} onPress={() => setContentType(value)} style={[styles.choiceButton, { borderColor: active ? colors.teal : colors.border, backgroundColor: active ? colors.tealSoft : colors.muted }]}>
                    <Icon name={icon} size={15} color={active ? colors.teal : colors.mutedForeground} />
                    <Text style={[styles.choiceText, { color: active ? colors.teal : colors.foreground, writingDirection: direction }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={labelStyle}>{t('العنوان', 'Title')} *</Text>
            <TextInput testID="assignment-title" value={title} onChangeText={setTitle} placeholder={t('مثل: مراجعة الدرس الأول', 'e.g. Review lesson one')} placeholderTextColor={colors.mutedForeground} style={fieldStyle} />
            <Text style={labelStyle}>{t('الوصف', 'Description')}</Text>
            <TextInput value={description} onChangeText={setDescription} multiline placeholder={t('أضف تعليمات مختصرة للطالب', 'Add brief instructions for the student')} placeholderTextColor={colors.mutedForeground} style={[fieldStyle, styles.multiline]} />
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sectionHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.navySoft }]}><Icon name="users" size={16} color={colors.primary} /></View>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('المستفيد والمادة', 'Student and subject')}</Text>
                <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('مطابق لاختيارات المنصة: طالب محدد أو واجب عام.', 'Matches the platform: one student or a general assignment.')}</Text>
              </View>
            </View>

            <Text style={labelStyle}>{t('الطالب', 'Student')}</Text>
            <Pressable testID="assignment-student-select" onPress={() => setShowStudents((current) => !current)} style={[styles.selectButton, { borderColor: showStudents ? colors.teal : colors.border, backgroundColor: colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Icon name={showStudents ? 'chevron-up' : 'chevron-down'} size={16} color={colors.teal} />
              <Text style={[styles.selectText, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{selectedStudent?.name ?? t('عام — لجميع الطلاب', 'General — all students')}</Text>
              <Icon name="user" size={16} color={colors.teal} />
            </Pressable>
            {showStudents ? (
              <View style={[styles.optionPanel, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <TextInput value={studentSearch} onChangeText={setStudentSearch} placeholder={t('ابحث عن طالب', 'Search students')} placeholderTextColor={colors.mutedForeground} style={[fieldStyle, styles.searchInput]} />
                <Pressable onPress={() => { setStudentId(null); setShowStudents(false); }} style={[styles.optionRow, { borderColor: colors.border, backgroundColor: !studentId ? colors.tealSoft : colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.optionText, { color: !studentId ? colors.teal : colors.foreground, writingDirection: direction }]}>{t('عام — لجميع الطلاب', 'General — all students')}</Text>
                  {!studentId ? <Icon name="check" size={15} color={colors.teal} /> : null}
                </Pressable>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.pickerList}>
                  {filteredStudents.map((student) => {
                    const selected = student.id === studentId;
                    return (
                      <Pressable key={student.id} onPress={() => { setStudentId(student.id); setShowStudents(false); }} style={[styles.optionRow, { borderColor: colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        <Text style={[styles.optionText, { color: selected ? colors.teal : colors.foreground, writingDirection: direction }]}>{student.name}</Text>
                        {selected ? <Icon name="check" size={15} color={colors.teal} /> : null}
                      </Pressable>
                    );
                  })}
                  {!students.length ? <Text style={[styles.helper, { color: colors.mutedForeground, padding: 10, writingDirection: direction }]}>{t('لا يوجد طلاب لديهم حصص مؤكدة أو مكتملة معك.', 'No students with confirmed or completed lessons were found.')}</Text> : null}
                  {students.length > 0 && !filteredStudents.length ? <Text style={[styles.helper, { color: colors.mutedForeground, padding: 10, writingDirection: direction }]}>{t('لا توجد نتائج مطابقة.', 'No matching students.')}</Text> : null}
                </ScrollView>
              </View>
            ) : null}

            <Text style={labelStyle}>{t('المادة الدراسية', 'Subject')}</Text>
            <Pressable onPress={() => setShowSubjects((current) => !current)} style={[styles.selectButton, { borderColor: showSubjects ? colors.teal : colors.border, backgroundColor: colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Icon name={showSubjects ? 'chevron-up' : 'chevron-down'} size={16} color={colors.teal} />
              <Text style={[styles.selectText, { color: selectedSubject ? colors.foreground : colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{selectedSubject?.name ?? t('اختياري — اختر مادة', 'Optional — choose a subject')}</Text>
              <Icon name="book-open" size={16} color={colors.teal} />
            </Pressable>
            {showSubjects ? (
              <View style={[styles.optionPanel, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <TextInput value={subjectSearch} onChangeText={setSubjectSearch} placeholder={t('ابحث عن مادة', 'Search subjects')} placeholderTextColor={colors.mutedForeground} style={[fieldStyle, styles.searchInput]} />
                <Pressable onPress={() => { setSubjectId(''); setShowSubjects(false); }} style={[styles.optionRow, { borderColor: colors.border, backgroundColor: !subjectId ? colors.tealSoft : colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.optionText, { color: !subjectId ? colors.teal : colors.foreground }]}>{t('بدون مادة محددة', 'No specific subject')}</Text>
                  {!subjectId ? <Icon name="check" size={15} color={colors.teal} /> : null}
                </Pressable>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.pickerList}>
                  {filteredSubjects.map((subject) => {
                    const selected = subject.id === subjectId;
                    return (
                      <Pressable key={subject.id} onPress={() => { setSubjectId(subject.id); setShowSubjects(false); }} style={[styles.optionRow, { borderColor: colors.border, backgroundColor: selected ? colors.tealSoft : colors.card, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        <Text style={[styles.optionText, { color: selected ? colors.teal : colors.foreground, writingDirection: direction }]}>{subject.name}</Text>
                        {selected ? <Icon name="check" size={15} color={colors.teal} /> : null}
                      </Pressable>
                    );
                  })}
                  {!filteredSubjects.length ? <Text style={[styles.helper, { color: colors.mutedForeground, padding: 10, writingDirection: direction }]}>{t('لا توجد نتائج مطابقة.', 'No matching subjects.')}</Text> : null}
                </ScrollView>
              </View>
            ) : null}

            <Text style={labelStyle}>{t('المرحلة الدراسية', 'School stage')}</Text>
            <TextInput value={stage} onChangeText={setStage} placeholder={t('ابتدائي / متوسط / ثانوي', 'Primary / middle / secondary')} placeholderTextColor={colors.mutedForeground} style={fieldStyle} />
            <Text style={labelStyle}>{t('موعد التسليم (اختياري)', 'Due date (optional)')}</Text>
            <View style={[styles.dateRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TextInput value={dueDateText} onChangeText={setDueDateText} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" style={[fieldStyle, styles.dateInput]} accessibilityLabel={t('تاريخ التسليم بصيغة سنة شهر يوم', 'Due date in year-month-day format')} />
              <TextInput value={dueTimeText} onChangeText={setDueTimeText} placeholder="HH:MM" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" style={[fieldStyle, styles.timeInput]} accessibilityLabel={t('وقت التسليم بصيغة ساعة ودقيقة', 'Due time in hour-minute format')} />
            </View>
            <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('اكتب التاريخ والوقت المحليين، أو اترك الحقلين فارغين.', 'Enter local date and time, or leave both fields blank.')}</Text>
          </View>

          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sectionHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.goldSoft }]}><Icon name="help-circle" size={16} color={colors.gold} /></View>
              <View style={styles.sectionCopy}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('الأسئلة', 'Questions')}</Text>
                <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{questions.length} {t('أسئلة', 'questions')} · {totalPoints} {t('درجة', 'points')}</Text>
              </View>
            </View>

            <View style={[styles.actionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable testID="add-assignment-question" onPress={() => setQuestions((current) => [...current, newQuestion()])} style={[styles.smallAction, { backgroundColor: colors.tealSoft, borderColor: colors.border }]}>
                <Icon name="plus" size={15} color={colors.teal} />
                <Text style={[styles.smallActionText, { color: colors.teal, writingDirection: direction }]}>{t('سؤال يدوي', 'Add question')}</Text>
              </Pressable>
              <Pressable onPress={() => setShowBank((current) => !current)} style={[styles.smallAction, { backgroundColor: colors.navySoft, borderColor: colors.border }]}>
                <Icon name="book" size={15} color={colors.primary} />
                <Text style={[styles.smallActionText, { color: colors.primary, writingDirection: direction }]}>{t('بنك الأسئلة', 'Question bank')}</Text>
              </Pressable>
            </View>

            <Pressable testID="import-assignment-questions" disabled={importingQuestions} onPress={() => void importQuestionsFromFile()} style={[styles.importButton, { borderColor: colors.border, backgroundColor: colors.goldSoft }]}>
              {importingQuestions ? <ActivityIndicator size="small" color={colors.gold} /> : <Icon name="upload" size={15} color={colors.gold} />}
              <Text style={[styles.smallActionText, { color: colors.gold, writingDirection: direction }]}>{importingQuestions ? t('جارٍ استخراج الأسئلة…', 'Extracting questions…') : t('استيراد من PDF أو DOCX أو صورة', 'Import from PDF, DOCX, or image')}</Text>
            </Pressable>
            <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('الملف حتى 10 ميجابايت؛ تُضاف الأسئلة المستخرجة إلى بنكك.', 'Files up to 10 MB; extracted questions are added to your bank.')}</Text>

            {showBank ? (
              <View style={[styles.bankPanel, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <TextInput value={bankSearch} onChangeText={setBankSearch} placeholder={t('ابحث في بنك الأسئلة', 'Search question bank')} placeholderTextColor={colors.mutedForeground} style={[fieldStyle, styles.searchInput]} />
                {loadingOptions ? <ActivityIndicator color={colors.teal} /> : filteredBank.length ? filteredBank.map((question) => (
                  <View key={question.id} style={[styles.bankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text numberOfLines={3} style={[styles.bankQuestion, { color: colors.foreground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{question.question_text}</Text>
                    <View style={[styles.bankActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Pressable onPress={() => addBankQuestion(question)} style={[styles.bankAction, { backgroundColor: colors.tealSoft }]}>
                        <Icon name="plus" size={13} color={colors.teal} />
                        <Text style={[styles.bankActionText, { color: colors.teal }]}>{t('إضافة', 'Add')}</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteBankQuestion(question)} style={[styles.bankAction, { backgroundColor: colors.goldSoft }]}>
                        <Icon name="trash-2" size={13} color={colors.destructive} />
                        <Text style={[styles.bankActionText, { color: colors.destructive }]}>{t('حذف', 'Delete')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )) : <Text style={[styles.helper, { color: colors.mutedForeground, textAlign: 'center', paddingVertical: 12 }]}>{t('بنك الأسئلة فارغ أو لا توجد نتيجة.', 'The bank is empty or no questions match.')}</Text>}
              </View>
            ) : null}

            {questions.map((question, index) => (
              <View key={question.id} style={[styles.questionCard, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <View style={[styles.questionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.questionNumber, { color: colors.teal, writingDirection: direction }]}>{t('سؤال', 'Question')} {index + 1}</Text>
                  <View style={[styles.questionActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Pressable testID={`save-question-to-bank-${index}`} accessibilityRole="button" accessibilityLabel={t('حفظ السؤال في البنك', 'Save question to bank')} onPress={() => void saveQuestionToBank(question)} disabled={savingBankQuestionId === question.id} hitSlop={8}>
                      {savingBankQuestionId === question.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="bookmark" size={16} color={colors.primary} />}
                    </Pressable>
                    <Pressable testID={`remove-assignment-question-${index}`} onPress={() => removeQuestion(question.id)} hitSlop={8}>
                      <Icon name="trash-2" size={16} color={colors.destructive} />
                    </Pressable>
                  </View>
                </View>
                <TextInput value={question.text} onChangeText={(value) => updateQuestion(question.id, { text: value })} placeholder={t('اكتب نص السؤال', 'Write the question')} placeholderTextColor={colors.mutedForeground} multiline style={[fieldStyle, styles.questionInput]} />
                <View style={[styles.typeGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {QUESTION_TYPES.map((type) => {
                    const active = question.type === type.value;
                    return (
                      <Pressable key={type.value} onPress={() => updateQuestion(question.id, { type: type.value, correct: type.value === 'true_false' && !['صح', 'خطأ'].includes(question.correct) ? 'صح' : question.correct })} style={[styles.typeChip, { borderColor: active ? colors.teal : colors.border, backgroundColor: active ? colors.tealSoft : colors.card }]}>
                        <Text style={[styles.typeChipText, { color: active ? colors.teal : colors.mutedForeground, writingDirection: direction }]}>{type.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput value={String(question.points)} onChangeText={(value) => updateQuestion(question.id, { points: Number(value) })} placeholder={t('الدرجة', 'Points')} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" style={[fieldStyle, styles.pointsInput]} />
                {question.type === 'multiple_choice' || question.type === 'multiple_select' ? (
                  <>
                    <Text style={labelStyle}>{t('الخيارات — خيار في كل سطر', 'Options — one per line')}</Text>
                    <TextInput value={question.options.join('\n')} onChangeText={(value) => updateQuestion(question.id, { options: value.split('\n') })} placeholder={`${t('الخيار الأول', 'First option')}\n${t('الخيار الثاني', 'Second option')}`} placeholderTextColor={colors.mutedForeground} multiline style={[fieldStyle, styles.optionsInput]} />
                    <Text style={labelStyle}>{question.type === 'multiple_select' ? t('الإجابات الصحيحة — افصل بينها بفاصلة', 'Correct answers — separate with commas') : t('الإجابة الصحيحة', 'Correct answer')}</Text>
                    <TextInput value={question.correct} onChangeText={(value) => updateQuestion(question.id, { correct: value })} placeholder={question.type === 'multiple_select' ? 'الخيار الأول, الخيار الثالث' : t('اكتب الخيار كما هو', 'Enter the option text')} placeholderTextColor={colors.mutedForeground} style={fieldStyle} />
                  </>
                ) : question.type === 'true_false' ? (
                  <View style={[styles.choiceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {(['صح', 'خطأ'] as const).map((answer) => {
                      const selected = question.correct === answer;
                      return <Pressable key={answer} onPress={() => updateQuestion(question.id, { correct: answer })} style={[styles.choiceButton, { borderColor: selected ? colors.teal : colors.border, backgroundColor: selected ? colors.tealSoft : colors.card }]}><Text style={[styles.choiceText, { color: selected ? colors.teal : colors.foreground }]}>{answer}</Text></Pressable>;
                    })}
                  </View>
                ) : null}
                <Text style={labelStyle}>{t('شرح الإجابة (اختياري)', 'Answer explanation (optional)')}</Text>
                <TextInput value={question.explanation ?? ''} onChangeText={(value) => updateQuestion(question.id, { explanation: value })} placeholder={t('يُحفظ الشرح في بنك الأسئلة', 'Saved with this question in your bank')} placeholderTextColor={colors.mutedForeground} multiline style={[fieldStyle, styles.explanationInput]} />
              </View>
            ))}

            <View style={[styles.attachmentSection, { borderTopColor: colors.border }]}>
              <View style={[styles.attachmentHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.sectionCopy}>
                  <Text style={[styles.label, { color: colors.foreground, textAlign: isRTL ? 'right' : 'left' }]}>{t('مرفقات المهمة', 'Assignment attachments')}</Text>
                  <Text style={[styles.helper, { color: colors.mutedForeground, writingDirection: direction, textAlign: isRTL ? 'right' : 'left' }]}>{t('PDF أو صور JPG/PNG/WEBP — حتى 10MB لكل ملف.', 'PDF or JPG/PNG/WEBP images — up to 10 MB each.')}</Text>
                </View>
                <Pressable testID="add-assignment-attachment" disabled={uploadingAttachments} onPress={() => void uploadAssignmentAttachments()} style={[styles.attachmentButton, { backgroundColor: colors.navySoft, borderColor: colors.border }]}>
                  {uploadingAttachments ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="paperclip" size={15} color={colors.primary} />}
                  <Text style={[styles.bankActionText, { color: colors.primary }]}>{t('إضافة ملف', 'Add file')}</Text>
                </Pressable>
              </View>
              {attachments.map((attachment, index) => (
                <View key={`${attachment.name}-${index}`} style={[styles.attachmentRow, { backgroundColor: colors.muted, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Icon name={attachment.type.includes('pdf') ? 'file-text' : 'image'} size={15} color={colors.teal} />
                  <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.foreground, writingDirection: direction }]}>{attachment.name}</Text>
                  <Pressable onPress={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} hitSlop={8}>
                    <Icon name="x" size={15} color={colors.destructive} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {errorText ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.destructive, writingDirection: direction }]}>{errorText}</Text> : null}
          <Pressable testID="save-assignment" onPress={() => void saveAssignment()} disabled={saving || uploadingAttachments || importingQuestions} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed, (saving || uploadingAttachments || importingQuestions) && styles.disabled]}>
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Icon name="check" size={17} color={colors.primaryForeground} />}
            <Text style={[styles.saveButtonText, { color: colors.primaryForeground, writingDirection: direction }]}>{saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ وإرسال المهمة', 'Save and assign')}</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 17, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 11 },
  iconButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  headerTitle: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_700Bold' },
  headerSubtitle: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 2 },
  headerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 15, paddingBottom: 28, gap: 12 },
  loading: { minHeight: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  section: { borderWidth: 1, borderRadius: 18, padding: 13, gap: 9 },
  sectionHead: { alignItems: 'center', gap: 9, marginBottom: 4 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, alignItems: 'flex-end' },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  helper: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12, fontFamily: 'Inter_400Regular' },
  multiline: { minHeight: 74, textAlignVertical: 'top' },
  choiceRow: { gap: 8 },
  choiceButton: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  choiceText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  selectButton: { minHeight: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, alignItems: 'center', gap: 8 },
  selectText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  optionPanel: { borderWidth: 1, borderRadius: 12, padding: 7, gap: 5 },
  pickerList: { maxHeight: 190 },
  searchInput: { minHeight: 38, paddingVertical: 6 },
  optionRow: { minHeight: 38, paddingHorizontal: 9, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  optionText: { flex: 1, fontSize: 11, fontFamily: 'Inter_500Medium' },
  dateRow: { gap: 8 },
  dateInput: { flex: 1 },
  timeInput: { width: 105 },
  actionRow: { gap: 8 },
  smallAction: { minHeight: 39, flex: 1, paddingHorizontal: 9, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  smallActionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  importButton: { minHeight: 42, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 9 },
  bankPanel: { borderWidth: 1, borderRadius: 12, padding: 8, gap: 7 },
  bankRow: { borderWidth: 1, borderRadius: 10, padding: 9, gap: 8 },
  bankQuestion: { fontSize: 11, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  bankActions: { gap: 7, justifyContent: 'flex-start' },
  bankAction: { minHeight: 31, borderRadius: 8, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  bankActionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  questionCard: { borderWidth: 1, borderRadius: 13, padding: 10, gap: 8, marginTop: 5 },
  questionHeader: { minHeight: 24, alignItems: 'center', justifyContent: 'space-between' },
  questionNumber: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  questionActions: { gap: 14, alignItems: 'center' },
  questionInput: { minHeight: 65, textAlignVertical: 'top' },
  typeGrid: { flexWrap: 'wrap', gap: 6 },
  typeChip: { minHeight: 33, paddingHorizontal: 9, borderWidth: 1, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  typeChipText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  pointsInput: { minHeight: 38, maxWidth: 110 },
  optionsInput: { minHeight: 72, textAlignVertical: 'top' },
  explanationInput: { minHeight: 56, textAlignVertical: 'top' },
  attachmentSection: { borderTopWidth: 1, paddingTop: 12, marginTop: 5, gap: 7 },
  attachmentHeader: { gap: 8, alignItems: 'center' },
  attachmentButton: { minHeight: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  attachmentRow: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, gap: 7, alignItems: 'center' },
  attachmentName: { flex: 1, fontSize: 10, fontFamily: 'Inter_500Medium' },
  notice: { borderWidth: 1, borderRadius: 11, padding: 10, gap: 7 },
  noticeText: { fontSize: 10, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  linkText: { fontSize: 10, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  errorText: { fontSize: 11, lineHeight: 18, fontFamily: 'Inter_500Medium', textAlign: 'right', paddingHorizontal: 3 },
  saveButton: { minHeight: 49, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.6 },
});
