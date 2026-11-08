import { useState } from "react";
import { CalendarDays, Check, CheckCircle2, Clock3, MapPin, Search, Star, UserRound, X } from "lucide-react";
import "./_group.css";

const teachers = [
  { name: "محمد رفعت إبراهيم", rating: "4.88", distance: "3.6", radius: "50", note: "متاح في موعدك" },
  { name: "أحمد حسن", rating: "5.00", distance: "8.2", radius: "30", note: "متاح في موعدك" },
];

export function TeacherPickerSheet() {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const toggle = (name: string) => setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);

  return (
    <main className="screen" dir="rtl">
      <header className="brand"><span className="brand-mark">✳</span><strong>أجيال المعرفة</strong><small>التعلّم اليوم، نصنع الغد</small></header>
      <div className="back">‹</div>
      <section className="hero"><span className="hero-icon"><CalendarDays size={22} /></span><div><b>احجز جلسة تعلم</b><small>اختر المرحلة والمادة والموعد المناسب</small></div></section>
      <section className="form-card">
        <div className="field"><label>المرحلة الدراسية</label><div className="select">المتوسطة <span>⌄</span></div></div>
        <div className="field"><label>المادة</label><div className="select">الرياضيات <span>⌄</span></div></div>
        <div className="field"><label>موعد الحصة</label><div className="date-grid"><button className="chosen">الأحد<br /><b>٨ نوفمبر</b></button><button>الاثنين<br /><b>٩ نوفمبر</b></button><button>الثلاثاء<br /><b>١٠ نوفمبر</b></button></div></div>
        <div className="time-grid"><button className="chosen"><Clock3 size={12} /> 13:00</button><button><Clock3 size={12} /> 14:00</button><button><Clock3 size={12} /> 15:00</button><button><Clock3 size={12} /> 16:00</button></div>
        <button className="search" onClick={() => { setOpen(true); setSent(false); }}><Search size={15} /> {open ? "تحديث البحث عن المعلمين" : "ابحث عن المعلمين"}</button>
        {!open && <button className="results-link" onClick={() => setOpen(true)}>{selected.length ? `عرض المعلمين · ${selected.length} محدد` : "عرض المعلمين المتاحين"}</button>}
      </section>
      {open && <div className="scrim" role="presentation" onClick={() => setOpen(false)}>
        <section className="sheet" role="dialog" aria-modal="true" aria-label="المعلمون المتاحون" onClick={(event) => event.stopPropagation()}>
          <div className="handle" />
          <header className="sheet-heading">
            <div><div className="eyebrow">نتائج البحث</div><h1>المعلمون المتاحون</h1><p>اختر معلماً أو أكثر لإرسال طلب الحجز</p></div>
            <button className="close" aria-label="إغلاق" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <div className="search-summary"><span>الرياضيات</span><span>الأحد، ٨ نوفمبر</span><span>١:٠٠ م</span></div>
          <div className="list-heading"><b>أفضل المعلمين لموعدك</b><span>{teachers.length} معلمين</span></div>
          <div className="teacher-list">
            {teachers.map((teacher) => {
              const active = selected.includes(teacher.name);
              return <button className={`teacher ${active ? "selected" : ""}`} key={teacher.name} onClick={() => toggle(teacher.name)} aria-pressed={active}>
                <span className="teacher-icon"><UserRound size={19} /></span>
                <span className="teacher-info"><b>{teacher.name}</b><small><MapPin size={12} /> {teacher.distance} كم منك <i /> نطاق {teacher.radius} كم</small><em><CheckCircle2 size={12} /> {teacher.note}</em></span>
                <span className="rating"><Star size={12} fill="currentColor" /> {teacher.rating}</span>
                <span className={`select-mark ${active ? "active" : ""}`}>{active && <Check size={13} />}</span>
              </button>;
            })}
          </div>
          <div className="trust-note"><CheckCircle2 size={14} /> المعلمون المعروضون يطابقون المادة والمرحلة والموعد</div>
          <footer className="sheet-footer">
            <div className="selection-count">{selected.length ? <><b>{selected.length}</b><span>معلم محدد</span></> : <span>حدد المعلمين المناسبين</span>}</div>
            <button className={`send ${selected.length ? "" : "disabled"}`} disabled={!selected.length} onClick={() => setSent(true)}>
              {sent ? <><Check size={16} /> تم تجهيز طلب الحجز</> : <>إرسال طلب الحجز <span>{selected.length || ""}</span></>}
            </button>
          </footer>
        </section>
      </div>}
      <nav><span>⌂</span><span>▦</span><span>▣</span><span>♙</span></nav>
      <style>{`
        .screen { position:relative; width:100%; height:844px; overflow:hidden; padding:14px 18px 62px; background:#fbfcfd; color:var(--ajyal-foreground); }
        .brand { height:44px; display:flex; align-items:center; gap:8px; padding:0 12px; border:1px solid var(--ajyal-border); border-radius:18px; background:#fff; box-shadow:0 3px 10px rgba(20,36,55,.04); }
        .brand strong { margin-right:auto; font-size:12px; } .brand small { position:absolute; right:55px; top:39px; color:var(--ajyal-muted); font-size:7px; }
        .brand-mark { display:grid; place-items:center; width:26px; height:26px; border-radius:9px; background:var(--ajyal-primary); color:#5ac39b; font-size:17px; }
        .back { display:grid; place-items:center; width:34px; height:34px; margin:12px 0; border:1px solid var(--ajyal-border); border-radius:12px; background:#fff; color:var(--ajyal-primary); font-size:24px; }
        .hero { min-height:92px; display:flex; align-items:center; gap:14px; padding:16px; border-radius:20px; background:var(--ajyal-primary); color:white; }
        .hero-icon { display:grid; place-items:center; width:44px; height:44px; border-radius:14px; background:#e8f6f0; color:var(--ajyal-teal); }
        .hero div { display:grid; gap:6px; } .hero b { font-size:17px; } .hero small { color:#a9d6c9; font-size:9px; }
        .form-card { margin-top:14px; padding:13px; border:1px solid var(--ajyal-border); border-radius:20px; background:#fff; display:grid; gap:10px; }
        .field { display:grid; gap:6px; } .field label { font-size:10px; font-weight:700; }
        .select { display:flex; justify-content:space-between; align-items:center; min-height:40px; padding:0 12px; border:1px solid var(--ajyal-border); border-radius:12px; color:#475569; font-size:11px; }
        .date-grid,.time-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
        .date-grid button,.time-grid button { min-height:42px; border:1px solid var(--ajyal-border); border-radius:12px; background:#fff; color:var(--ajyal-muted); font-size:9px; line-height:1.7; }
        .date-grid b { color:var(--ajyal-foreground); font-size:10px; } .date-grid .chosen,.time-grid .chosen { border-color:var(--ajyal-teal); background:var(--ajyal-teal-soft); color:var(--ajyal-teal); }
        .time-grid { grid-template-columns:repeat(4,1fr); } .time-grid button { min-height:34px; display:flex; align-items:center; justify-content:center; gap:4px; font-size:10px; }
        .search,.send { min-height:44px; border:0; border-radius:13px; background:var(--ajyal-teal); color:white; font-weight:800; font-size:11px; display:flex; justify-content:center; align-items:center; gap:7px; }
        .results-link { min-height:38px; border:1px solid var(--ajyal-border); border-radius:12px; background:#fff; color:var(--ajyal-teal); font-weight:700; }
        .scrim { position:absolute; inset:0; z-index:5; display:flex; align-items:flex-end; background:rgba(11,23,42,.52); backdrop-filter:blur(3px); }
        .sheet { width:100%; max-height:76%; padding:8px 18px 12px; border-radius:26px 26px 0 0; background:#fff; box-shadow:0 -12px 40px rgba(10,26,48,.18); display:flex; flex-direction:column; }
        .handle { align-self:center; width:38px; height:4px; margin:0 0 13px; border-radius:4px; background:#d9e0e7; }
        .sheet-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
        .eyebrow { color:var(--ajyal-teal); font-size:9px; font-weight:800; }
        .sheet-heading h1 { margin:3px 0; font-size:18px; letter-spacing:-.3px; }
        .sheet-heading p { margin:0; color:var(--ajyal-muted); font-size:10px; }
        .close { width:34px; height:34px; border:1px solid var(--ajyal-border); border-radius:11px; background:#fff; color:#68788a; display:grid; place-items:center; }
        .search-summary { display:flex; gap:6px; margin:13px 0; overflow:hidden; }
        .search-summary span { white-space:nowrap; padding:7px 9px; border-radius:9px; background:#f3f6f8; color:#536276; font-size:9px; font-weight:600; }
        .list-heading { display:flex; justify-content:space-between; align-items:center; margin:0 0 8px; font-size:10px; }
        .list-heading span { color:var(--ajyal-muted); font-size:9px; }
        .teacher-list { display:grid; gap:8px; overflow:auto; padding:1px 1px 5px; }
        .teacher { min-height:70px; display:flex; align-items:center; gap:9px; width:100%; padding:10px; border:1px solid var(--ajyal-border); border-radius:16px; background:#fff; text-align:right; color:var(--ajyal-foreground); }
        .teacher.selected { border:1.5px solid var(--ajyal-teal); background:linear-gradient(110deg,#f7fcfa,#eef9f4); box-shadow:0 4px 12px rgba(46,158,121,.08); }
        .teacher-icon { flex:0 0 38px; width:38px; height:38px; display:grid; place-items:center; border-radius:13px; background:var(--ajyal-teal-soft); color:var(--ajyal-teal); }
        .teacher-info { flex:1; min-width:0; display:grid; gap:4px; } .teacher-info b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
        .teacher-info small,.teacher-info em { display:flex; align-items:center; gap:4px; color:var(--ajyal-muted); font-size:8px; font-style:normal; white-space:nowrap; }
        .teacher-info small i { width:3px; height:3px; border-radius:50%; background:#aab5c0; margin:0 2px; }
        .teacher-info em { color:var(--ajyal-teal); font-size:8px; }
        .rating { display:flex; align-items:center; gap:3px; color:#b27b17; font-size:9px; font-weight:800; white-space:nowrap; }
        .select-mark { width:20px; height:20px; display:grid; place-items:center; border:1px solid #ccd6df; border-radius:50%; color:#fff; }
        .select-mark.active { border-color:var(--ajyal-teal); background:var(--ajyal-teal); }
        .trust-note { display:flex; align-items:center; gap:6px; margin:8px 1px 9px; color:var(--ajyal-muted); font-size:8px; }
        .trust-note svg { color:var(--ajyal-teal); }
        .sheet-footer { display:flex; align-items:center; gap:10px; padding-top:10px; border-top:1px solid #edf0f3; }
        .selection-count { min-width:92px; display:flex; align-items:center; gap:5px; color:var(--ajyal-muted); font-size:9px; }
        .selection-count b { display:grid; place-items:center; min-width:23px; height:23px; padding:0 5px; border-radius:8px; color:var(--ajyal-teal); background:var(--ajyal-teal-soft); font-size:11px; }
        .send { flex:1; min-height:46px; box-shadow:0 6px 14px rgba(46,158,121,.18); }
        .send span { min-width:18px; padding:2px 5px; border-radius:8px; background:rgba(255,255,255,.22); }
        .send.disabled { background:#b8c8c2; box-shadow:none; }
        nav { position:absolute; z-index:1; bottom:0; left:0; right:0; height:54px; display:flex; justify-content:space-around; align-items:center; border-top:1px solid var(--ajyal-border); background:white; color:#718093; font-size:18px; }
      `}</style>
    </main>
  );
}
