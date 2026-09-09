import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Header, Icon, Screen } from '@/components/AjyalUI';

type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
  lists?: { label: string; items: string[] }[];
};

type LegalDocument = {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

const documents: Record<'privacy' | 'terms', LegalDocument> = {
  privacy: {
    eyebrow: 'حماية معلوماتك',
    title: 'سياسة الخصوصية',
    updated: 'آخر تحديث: أبريل 2026',
    intro: 'نلتزم بحماية خصوصية المستخدمين وضمان سرية البيانات وفق أفضل الممارسات التقنية والقانونية.',
    sections: [
      {
        title: 'البيانات التي نقوم بجمعها',
        lists: [
          { label: 'بيانات التسجيل', items: ['الاسم', 'البريد الإلكتروني', 'رقم الهاتف (إن وجد)'] },
          { label: 'بيانات الاستخدام', items: ['سجل الجلسات', 'مدة الاتصال', 'التفاعل داخل المنصة'] },
          { label: 'بيانات تقنية', items: ['عنوان IP', 'نوع الجهاز والمتصفح', 'ملفات تعريف الارتباط (Cookies)'] },
        ],
      },
      {
        title: 'كيف نستخدم المعلومات',
        items: ['تشغيل المنصة بكفاءة', 'تحسين تجربة المستخدم', 'تحليل الأداء', 'إرسال إشعارات وتنبيهات'],
      },
      {
        title: 'مشاركة البيانات',
        paragraphs: ['لا نقوم ببيع بيانات المستخدمين، وقد نشارك البيانات فقط في الحالات التالية:'],
        items: ['الامتثال للقوانين', 'حماية حقوق المنصة', 'مزودي خدمات (مثل الاستضافة والدفع)'],
      },
      {
        title: 'حماية البيانات',
        items: ['تشفير البيانات', 'أنظمة حماية متقدمة', 'سياسات وصول محدودة'],
      },
      {
        title: 'حقوق المستخدم',
        items: ['طلب تعديل بياناتك', 'طلب حذف الحساب', 'طلب نسخة من بياناتك'],
      },
      {
        title: 'ملفات تعريف الارتباط (Cookies)',
        paragraphs: ['نستخدم الكوكيز لتحسين:'],
        items: ['الأداء', 'التصفح', 'تخصيص التجربة'],
      },
    ],
  },
  terms: {
    eyebrow: 'استخدام مسؤول',
    title: 'الشروط والأحكام',
    updated: 'آخر تحديث: أبريل 2026',
    intro: 'باستخدام منصة أجيال المعرفة، توافق على الالتزام بهذه الشروط واستخدام الخدمة بطريقة تحافظ على سلامة المجتمع التعليمي.',
    sections: [
      {
        title: 'التعريفات',
        items: ['"المنصة": النظام الإلكتروني', '"المستخدم": الطالب أو المعلم', '"الجلسة": درس مباشر بين الطرفين'],
      },
      {
        title: 'أهلية الاستخدام',
        paragraphs: ['يجب أن يكون المستخدم بعمر قانوني أو تحت إشراف ولي الأمر.'],
      },
      {
        title: 'الحسابات',
        items: ['المستخدم مسؤول عن بياناته', 'يمنع مشاركة الحساب', 'يحق للمنصة تعليق الحساب عند الاشتباه'],
      },
      {
        title: 'استخدام الخدمة',
        paragraphs: ['يُمنع:'],
        items: ['إساءة استخدام المنصة', 'إرسال محتوى غير لائق', 'التحايل على نظام الدفع'],
      },
      {
        title: 'الجلسات التعليمية',
        items: ['تعتمد على الاتصال المباشر', 'يتم احتساب الوقت بالدقيقة', 'الجودة تعتمد على الإنترنت لدى المستخدم'],
      },
      {
        title: 'المدفوعات',
        items: ['جميع المدفوعات تتم عبر المنصة', 'الأسعار تخضع لإدارة المنصة', 'لا يُسمح بالدفع خارج المنصة'],
      },
      {
        title: 'المسؤولية',
        paragraphs: ['المنصة:'],
        items: ['لا تتحمل مسؤولية سوء استخدام الخدمة', 'لا تضمن نتائج تعليمية محددة'],
      },
      {
        title: 'التعديلات',
        paragraphs: ['يحق للمنصة:'],
        items: ['تعديل الشروط في أي وقت', 'تحديث السياسات'],
      },
    ],
  },
} as const;

export function LegalDocumentScreen({ type }: { type: keyof typeof documents }) {
  const colors = useColors();
  const document = documents[type];

  return (
    <Screen>
      <Header onBack={() => router.back()} eyebrow={document.eyebrow} title={document.title} />
      <View style={[styles.notice, { backgroundColor: colors.navySoft, borderColor: colors.border }]}>
        <View style={[styles.noticeIcon, { backgroundColor: colors.primary }]}>
          <Icon name={type === 'privacy' ? 'shield' : 'file-text'} size={18} color={colors.primaryForeground} />
        </View>
        <View style={styles.noticeCopy}>
          <Text style={[styles.updated, { color: colors.teal }]}>{document.updated}</Text>
          <Text style={[styles.intro, { color: colors.foreground }]}>{document.intro}</Text>
        </View>
      </View>

      {document.sections.map((section) => (
        <View key={section.title} style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeading}>
            <View style={[styles.sectionMark, { backgroundColor: colors.accent }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
          </View>
          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={[styles.paragraph, { color: colors.mutedForeground }]}>{paragraph}</Text>
          ))}
          {section.lists?.map((list) => (
            <View key={list.label} style={styles.listGroup}>
              <Text style={[styles.listLabel, { color: colors.foreground }]}>{list.label}:</Text>
              {list.items.map((item) => (
                <View key={item} style={styles.listItem}>
                  <Text style={[styles.listBullet, { color: colors.teal }]}>•</Text>
                  <Text style={[styles.listText, { color: colors.mutedForeground }]}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
          {section.items?.map((item) => (
            <View key={item} style={styles.listItem}>
              <Text style={[styles.listBullet, { color: colors.teal }]}>•</Text>
              <Text style={[styles.listText, { color: colors.mutedForeground }]}>{item}</Text>
            </View>
          ))}
        </View>
      ))}

      <Pressable testID="legal-support-link" onPress={() => router.push('/support')} style={({ pressed }) => [styles.support, { backgroundColor: colors.tealSoft, borderColor: colors.border }, pressed && styles.pressed]}>
        <Icon name="help-circle" size={17} color={colors.teal} />
        <Text style={[styles.supportText, { color: colors.foreground }]}>لديك سؤال؟ افتح مركز الدعم</Text>
        <Icon name="arrow-left" size={15} color={colors.teal} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { borderRadius: 20, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 17 },
  noticeIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1, alignItems: 'flex-end' },
  updated: { width: '100%', fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl' },
  intro: { width: '100%', fontSize: 12, lineHeight: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl', marginTop: 6 },
  section: { borderRadius: 19, borderWidth: 1, padding: 15, marginBottom: 11 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 9 },
  sectionMark: { width: 5, height: 18, borderRadius: 3 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'right', writingDirection: 'rtl' },
  paragraph: { width: '100%', fontSize: 12, lineHeight: 21, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl', marginTop: 7 },
  listGroup: { width: '100%', marginTop: 8, alignItems: 'flex-end' },
  listLabel: { width: '100%', fontSize: 12, lineHeight: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl' },
  listItem: { width: '100%', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 7, marginTop: 5 },
  listBullet: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  listText: { flex: 1, fontSize: 12, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'right', writingDirection: 'rtl' },
  support: { minHeight: 54, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 2 },
  supportText: { flex: 1, fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'right', writingDirection: 'rtl' },
  pressed: { opacity: 0.72 },
});