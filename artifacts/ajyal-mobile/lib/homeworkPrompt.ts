const ARABIC_DIGIT_INSTRUCTION =
  "عند قراءة المسألة من الصورة، تعامل مع الأرقام الغربية (0123456789) والعربية الهندية (٠١٢٣٤٥٦٧٨٩) والفارسية (۰۱۲۳۴۵۶۷۸۹) كأرقام صحيحة. طبّعها داخلياً قبل إجراء العمليات الحسابية، وتحقق من قيمة كل رقم وعلامة عشرية أو كسر قبل الحل.";

export function buildHomeworkQuestionPrompt(question: string): string {
  const trimmedQuestion = question.trim();
  return trimmedQuestion
    ? `${ARABIC_DIGIT_INSTRUCTION}\n\nسؤال الطالب الإضافي: ${trimmedQuestion}`
    : ARABIC_DIGIT_INSTRUCTION;
}
