import "./_group.css";
import { CalendarDays, Clock3, MapPin, Search, Star, UserRound } from "lucide-react";

const teachers = [
  { name: "محمد رفعت إبراهيم", rating: "4.88", distance: "3.6", radius: "50" },
  { name: "أحمد حسن", rating: "5.00", distance: "8.2", radius: "30" },
];

export function Current() {
  return (
    <main className="screen" dir="rtl">
      <header className="brand"><span className="brand-mark">✳</span><strong>أجيال المعرفة</strong><small>التعلّم اليوم، نصنع الغد</small></header>
      <div className="back">‹</div>
      <section className="hero"><span className="hero-icon"><CalendarDays size={22} /></span><div><b>احجز جلسة تعلم</b><small>اختر المرحلة والمادة والموعد المناسب</small></div></section>
      <section className="form-card">
        <div className="field"><label>المرحلة الدراسية</label><div className="select">المتوسطة <span>⌄</span></div></div>
        <div className="field"><label>المادة</label><div className="select">الرياضيات <span>⌄</span></div></div>
        <div className="field"><label>موعد الحصة</label><div className="date-grid"><button>الأحد<br /><b>٨ نوفمبر</b></button><button>الاثنين<br /><b>٩ نوفمبر</b></button><button>الثلاثاء<br /><b>١٠ نوفمبر</b></button></div></div>
        <div className="time-grid"><button className="chosen"><Clock3 size={12} /> 13:00</button><button><Clock3 size={12} /> 14:00</button><button><Clock3 size={12} /> 15:00</button><button><Clock3 size={12} /> 16:00</button></div>
        <button className="search"><Search size={15} /> ابحث عن المعلمين</button>
        <div className="inline-results">
          <small className="result-caption">المعلمون المتاحون · ٢</small>
          {teachers.map((teacher) => <div className="teacher" key={teacher.name}>
            <span className="teacher-icon"><UserRound size={18} /></span>
            <div className="teacher-info"><b>{teacher.name}</b><small><MapPin size={11} /> {teacher.distance} كم · نطاق {teacher.radius} كم</small></div>
            <span className="rating"><Star size={11} fill="currentColor" /> {teacher.rating}</span>
          </div>)}
          <button className="send disabled">حدد معلماً أولاً</button>
        </div>
      </section>
      <nav><span>⌂</span><span>▦</span><span>▣</span><span>♙</span></nav>
    </main>
  );
}
