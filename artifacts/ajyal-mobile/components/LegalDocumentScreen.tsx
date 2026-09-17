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
    updated: 'آخر تحديث: 12 سبتمبر 2026',
    intro: 'تشرح هذه السياسة كيف تجمع أجيال المعرفة بياناتك وتستخدمها وتحميها عند استخدام التطبيق وخدمات التعلم والتواصل الداخلي.',
    sections: [
      {
        title: 'نطاق السياسة',
        paragraphs: ['تنطبق هذه السياسة على تطبيق أجيال المعرفة وخدماته المرتبطة، بما فيها الحسابات الطلابية وحسابات المعلمين والحجوزات والجلسات والرسائل والمكالمات الداخلية.'],
      },
      {
        title: 'البيانات التي نعالجها',
        lists: [
          { label: 'بيانات الحساب والملف', items: ['الاسم والبريد الإلكتروني ورقم الهاتف عند تقديمه', 'نوع الحساب والدور (طالب أو معلم)', 'بيانات الملف التعليمي، مثل المرحلة والمواد والخبرة، وبيانات الدفع أو السحب التي يضيفها المعلم عند الحاجة'] },
          { label: 'بيانات الحجوزات والجلسات', items: ['المواعيد وحالة الحجز والحضور ومدة الجلسة', 'التقييمات والمحتوى التعليمي الذي يرسله المستخدم داخل الجلسة'] },
          { label: 'بيانات التواصل', items: ['الرسائل والمرفقات التي ترسلها في المحادثات', 'بيانات تشغيل المكالمات الداخلية، مثل أطراف المكالمة ووقتها وحالتها، لتمكين الاتصال وحل المشكلات'] },
          { label: 'بيانات تقنية', items: ['نوع الجهاز ونظام التشغيل وإصدار التطبيق وسجلات الأعطال', 'عنوان IP ومعرّفات الجلسة اللازمة للأمان وتشغيل الخدمة'] },
        ],
      },
      {
        title: 'كيف نستخدم البيانات',
        items: ['إنشاء الحساب والتحقق من الهوية والدور وإدارة الوصول', 'عرض المعلمين والمواد والمواعيد ومعالجة الحجوزات والجلسات', 'تشغيل الرسائل والمرفقات والمكالمات الداخلية وربط أطراف الاتصال', 'تحسين الأداء والأمان واكتشاف إساءة الاستخدام والأعطال', 'معالجة المدفوعات والاشتراكات والسحوبات وفق حالة العملية', 'إرسال إشعارات الخدمة المتعلقة بالحجوزات والجلسات والرسائل والحساب'],
      },
      {
        title: 'الإشعارات',
        paragraphs: ['قد نستخدم معرّف الإشعارات الخاص بجهازك لإرسال تنبيهات الجلسات والحجوزات والرسائل والمكالمات الداخلية، وفق إعداداتك داخل التطبيق. يمكنك تعديل التنبيهات الاختيارية من شاشة الحساب، لكن قد نرسل إشعارات تشغيلية ضرورية لإتمام الخدمة أو حماية الحساب.'],
      },
      {
        title: 'الجلسات والمكالمات الداخلية',
        paragraphs: ['تُستخدم بيانات الحجز والجلسة لتوصيل الطالب بالمعلم وإظهار حالة الجلسة ومدتها. وتستخدم المكالمات الداخلية بيانات الاتصال اللازمة لبدء المكالمة وإشعار الطرف الآخر وتسجيل حالتها. لا نطلب الوصول إلى الكاميرا أو الميكروفون إلا عند بدء ميزة تحتاجهما وبموافقة نظام التشغيل، ولا يجوز تسجيل أو مشاركة المكالمة دون موافقة المشاركين والالتزام بالأنظمة المعمول بها.'],
      },
      {
        title: 'مشاركة البيانات',
        paragraphs: ['لا نبيع بياناتك الشخصية. قد نشارك الحد الأدنى اللازم من البيانات في الحالات التالية:'],
        items: ['مع الطرف الآخر في الحجز أو الجلسة بالقدر اللازم للتعلم والتواصل', 'مع مزودي الاستضافة والمصادقة والتخزين والإشعارات والدفع لتشغيل الخدمة', 'عند طلبك أو بموافقتك، أو للامتثال لالتزام نظامي أو حماية حقوق المستخدمين والمنصة'],
      },
      {
        title: 'الاحتفاظ والحماية',
        paragraphs: ['نحتفظ بالبيانات ما دام الحساب أو الغرض التشغيلي قائماً، ثم نحذفها أو نجهل هويتها عندما لا تعود لازمة، ما لم يتطلب النظام الاحتفاظ بها مدة أطول. نستخدم ضوابط وصول وتدابير تقنية وتنظيمية مناسبة، مع أن أي خدمة عبر الإنترنت لا يمكن ضمان أمانها بشكل مطلق.'],
      },
      {
        title: 'حقوقك وطلباتك',
        items: ['طلب الاطلاع على بياناتك أو تصحيحها', 'طلب حذف الحساب أو البيانات التي لا يلزم الاحتفاظ بها', 'إيقاف الإشعارات الاختيارية وتعديل تفضيلات الحساب', 'التواصل مع مركز الدعم للاستفسار عن معالجة بياناتك أو تقديم شكوى'],
      },
      {
        title: 'القاصرون وولي الأمر',
        paragraphs: ['إذا كان المستخدم قاصراً، فيجب استخدام الخدمة بموافقة ولي الأمر وإشرافه وفق الأنظمة المعمول بها. يحق لولي الأمر التواصل مع مركز الدعم بشأن بيانات القاصر أو طلب مراجعتها أو حذفها عندما يسمح النظام بذلك.'],
      },
      {
        title: 'التحديثات والتواصل',
        paragraphs: ['قد نحدّث هذه السياسة عند تغيير الخدمة أو المتطلبات النظامية، وسنظهر تاريخ التحديث في أعلى الصفحة. لاستخدام أي استفسار أو طلب، افتح مركز الدعم من التطبيق واذكر نوع الطلب بوضوح.'],
      },
    ],
  },
  terms: {
    eyebrow: 'استخدام مسؤول',
    title: 'شروط الاستخدام',
    updated: 'آخر تحديث: 12 سبتمبر 2026',
    intro: 'باستخدام أجيال المعرفة، توافق على هذه الشروط وتتعهد باستخدام الخدمة بطريقة آمنة ومحترمة وتحافظ على سلامة المجتمع التعليمي.',
    sections: [
      {
        title: 'التعريفات ونطاق الخدمة',
        items: ['المنصة: تطبيق أجيال المعرفة وخدماته المرتبطة', 'المستخدم: الطالب أو المعلم أو ولي الأمر المصرح له', 'الجلسة: لقاء تعليمي مباشر بين أطراف الحجز', 'المكالمة الداخلية: اتصال صوتي أو مرئي يبدأ من أدوات التواصل داخل المنصة'],
      },
      {
        title: 'أهلية الاستخدام',
        paragraphs: ['يجب أن يكون المستخدم مؤهلاً نظامياً لاستخدام الخدمة، أو يستخدمها بموافقة وإشراف ولي الأمر إذا كان قاصراً. يجب تقديم معلومات صحيحة ومحدثة وعدم إنشاء حساب باسم شخص آخر.'],
      },
      {
        title: 'الحسابات والأمان',
        items: ['المستخدم مسؤول عن سرية بيانات الدخول وعن الأنشطة التي تتم من حسابه', 'يمنع مشاركة الحساب أو نقل ملكيته أو إنشاء حسابات متعددة للتحايل على القيود', 'يجب إبلاغ مركز الدعم فور الاشتباه في دخول غير مصرح به', 'يحق للمنصة تقييد الحساب أو تعليقه عند وجود مخالفة أو خطر أمني، مع مراجعة الحالة عبر الدعم عند الإمكان'],
      },
      {
        title: 'الحجوزات والجلسات التعليمية',
        items: ['تخضع المواعيد وتوافر المعلم وحالة الحجز لما يظهر في المنصة وقت الإجراء', 'يلتزم الطرفان بالحضور والتواصل في الموعد واحترام سياسة الإلغاء أو إعادة الجدولة المعروضة', 'قد يتأثر الصوت أو الفيديو بجودة اتصال الإنترنت والأجهزة لدى الطرفين', 'لا تضمن المنصة نتيجة تعليمية محددة، لكنها تعمل على توفير أدوات تنظيم وتواصل مناسبة'],
      },
      {
        title: 'الرسائل والمكالمات الداخلية',
        items: ['تستخدم الرسائل والمرفقات والمكالمات الداخلية للتنسيق والتعلم المتعلق بالخدمة فقط', 'يمنع تسجيل المكالمات أو تصويرها أو إعادة نشرها دون موافقة المشاركين والالتزام بالأنظمة', 'يمنع إرسال محتوى مسيء أو مخالف أو ينتهك خصوصية الآخرين، ويجب الإبلاغ عن أي إساءة عبر الدعم'],
      },
      {
        title: 'المدفوعات والاشتراكات',
        items: ['تتم المدفوعات والاشتراكات والسحوبات عبر القنوات التي تعتمدها المنصة فقط', 'تظهر الأسعار والرصيد وحالة العملية قبل تأكيد الإجراء متى كان ذلك متاحاً', 'يمنع طلب أو إرسال مبالغ خارج المنصة مقابل خدمة مرتبطة بها', 'أي استرداد أو نزاع مالي يخضع لحالة العملية والسياسات المعلنة، ويمكن رفعه إلى مركز الدعم'],
      },
      {
        title: 'الاستخدام المقبول',
        paragraphs: ['يُمنع استخدام المنصة في:'],
        items: ['انتهاك القانون أو حقوق الملكية الفكرية أو الخصوصية', 'التحرش أو التمييز أو التهديد أو انتحال الشخصية', 'إرسال برمجيات ضارة أو محاولة الوصول غير المصرح به أو تعطيل الخدمة', 'التحايل على الرصيد أو الدفع أو التقييمات أو أنظمة الحجز'],
      },
      {
        title: 'محتوى المستخدم وحقوق المنصة',
        paragraphs: ['تحتفظ بملكية المحتوى الذي تنشئه، وتمنح المنصة ترخيصاً محدوداً لمعالجته وعرضه بالقدر اللازم لتقديم الخدمة. لا يجوز نسخ مواد المنصة أو إعادة بيعها أو استخدامها خارج الغرض المصرح به.'],
      },
      {
        title: 'المسؤولية واستمرارية الخدمة',
        paragraphs: ['تبذل المنصة جهداً معقولاً لتوفير الخدمة، لكن قد يحدث انقطاع بسبب الصيانة أو الشبكات أو مزودي الخدمات أو ظروف خارجة عن السيطرة. لا تتحمل المنصة مسؤولية الأضرار الناتجة عن مخالفة المستخدم لهذه الشروط أو عن استخدام أجهزة أو اتصالات غير مناسبة.'],
      },
      {
        title: 'التعديلات وإنهاء الاستخدام',
        paragraphs: ['قد نحدّث هذه الشروط عند تغيير الخدمة أو المتطلبات النظامية، وسنظهر تاريخ التحديث. استمرارك في استخدام المنصة بعد نشر التحديث يعني قبولك للشروط المعدلة. يمكنك التوقف عن استخدام الخدمة وطلب المساعدة بشأن الحساب من مركز الدعم، وقد ننهي الوصول عند المخالفة أو وجود خطر على المستخدمين.'],
      },
      {
        title: 'التواصل',
        paragraphs: ['للاستفسارات أو البلاغات أو الاعتراضات المتعلقة بهذه الشروط، افتح مركز الدعم من داخل التطبيق وقدّم تفاصيل كافية عن الطلب.'],
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