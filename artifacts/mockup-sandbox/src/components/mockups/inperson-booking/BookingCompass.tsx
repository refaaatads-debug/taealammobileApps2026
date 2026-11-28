import { useMemo, useState, type ReactNode } from "react";
import "./booking-compass.css";

type IconKey = "pin" | "book" | "clock" | "home" | "check" | "arrow" | "spark";

function Glyph({ name }: { name: IconKey }) {
  const paths: Record<IconKey, ReactNode> = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    book: <><path d="M12 7v14" /><path d="M3 18V5a1 1 0 0 1 1-1c4 0 7 1 8 3 1-2 4-3 8-3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1c-4 0-7 1-8 3-1-2-4-3-8-3a1 1 0 0 1-1-1Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const cities = [
  { name: "الخبر", available: false },
  { name: "الدمام", available: true },
  { name: "الرياض", available: false },
];
const stages = ["الابتدائية", "المتوسطة", "الثانوية"];
const subjects = ["الرياضيات", "العلوم", "اللغة العربية", "اللغة الإنجليزية"];

function makeDates() {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return {
      weekday: date.toLocaleDateString("ar-SA", { weekday: "short" }),
      label: date.toLocaleDateString("ar-SA", { day: "numeric", month: "short" }),
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    };
  });
}

function timesFor(dateKey: string) {
  const now = Date.now() + 2 * 60 * 60 * 1000;
  return Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`)
    .filter((time) => new Date(`${dateKey}T${time}`).getTime() >= now);
}

export function BookingCompass() {
  const dates = useMemo(makeDates, []);
  const [step, setStep] = useState(0);
  const [city, setCity] = useState("الدمام");
  const [stage, setStage] = useState("المتوسطة");
  const [subject, setSubject] = useState("");
  const [selectedDate, setSelectedDate] = useState(0);
  const [selectedTime, setSelectedTime] = useState("");
  const [notice, setNotice] = useState(false);
  const times = timesFor(dates[selectedDate].key);
  const activeTime = times.includes(selectedTime) ? selectedTime : (times.includes("16:00") ? "16:00" : times[0] ?? "09:00");
  const dateLabel = new Date(`${dates[selectedDate].key}T${activeTime}`).toLocaleString("ar-SA", {
    weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
  const stepInfo = [
    { icon: "pin" as const, eyebrow: "١ — أين ستُعقد؟", title: "مكان الحصة" },
    { icon: "book" as const, eyebrow: "٢ — ماذا ستتعلّم؟", title: "المادة والمرحلة" },
    { icon: "clock" as const, eyebrow: "٣ — متى يناسبك؟", title: "موعد الحصة" },
  ][step];

  const chooseDate = (index: number) => {
    setSelectedDate(index);
    const available = timesFor(dates[index].key);
    setSelectedTime(available.includes(activeTime) ? activeTime : (available.includes("16:00") ? "16:00" : available[0] ?? ""));
  };
  const advance = () => {
    setNotice(false);
    if (step < 2) setStep(step + 1);
    else setNotice(true);
  };

  return (
    <main className="bc-root">
      <div className="bc-shell">
        <header className="bc-header">
          <div className="bc-brand">
            <span className="bc-mark"><Glyph name="spark" /></span>
            <span><strong>أجيال المعرفة</strong><small>نتعلم اليوم، نصنع الغد</small></span>
          </div>
          <div className="bc-header-note"><i className="bc-live-dot" /> الحجز الحضوري · الدمام</div>
        </header>

        <section className="bc-intro">
          <div className="bc-intro-copy"><small>مساحة تخطيط الحصة</small><h1>لنرتّب حصتك، خطوة بخطوة.</h1></div>
          <p>ثلاثة اختيارات بسيطة، وستظهر تفاصيل طلبك مباشرة في بطاقة الحجز.</p>
        </section>

        <nav className="bc-progress" aria-label="خطوات الحجز">
          {["المكان", "التعلّم", "الموعد"].map((label, index) => (
            <button key={label} type="button" className={`${step === index ? "active" : ""} ${step > index ? "done" : ""}`} onClick={() => { setStep(index); setNotice(false); }}>
              <span className="bc-step-num">{step > index ? <Glyph name="check" /> : `0${index + 1}`}</span>
              <b>{label}</b>
            </button>
          ))}
        </nav>

        <div className="bc-layout">
          <section className="bc-workspace" aria-live="polite">
            <div className="bc-step-head">
              <div className="bc-step-title"><span className="bc-step-icon"><Glyph name={stepInfo.icon} /></span><div><small>{stepInfo.eyebrow}</small><h2>{stepInfo.title}</h2></div></div>
              <span dir="ltr">{String(step + 1).padStart(2, "0")} / 03</span>
            </div>

            {step === 0 && <>
              <p className="bc-field-label">اختر المدينة</p>
              <div className="bc-city-list">
                {cities.map((item) => <button key={item.name} type="button" disabled={!item.available} className={`bc-city ${city === item.name ? "selected" : ""}`} onClick={() => setCity(item.name)}>
                  <span className="bc-radio" /> <span><b>{item.name}</b><small>{item.available ? "متاحة للحجز" : "غير متاحة حالياً"}</small></span>
                </button>)}
              </div>
              <p className="bc-field-label">عنوان الحصة</p>
              <div className="bc-address">
                <div className="bc-address-main"><span className="bc-address-pin"><Glyph name="home" /></span><span><b>شارع الثامن عشر · حي النزهة</b><small>منزلي، الدور الثاني · العنوان الأساسي</small></span></div>
                <button type="button" className="bc-edit" onClick={() => setNotice(true)}>تغيير العنوان</button>
              </div>
              <p className="bc-helper">يمكنك تحديث عنوان الحصة من عناوينك المحفوظة.</p>
            </>}

            {step === 1 && <>
              <div className="bc-select-row">
                <div className="bc-select-wrap"><label htmlFor="bc-stage">المرحلة الدراسية</label><select id="bc-stage" value={stage} onChange={(event) => { setStage(event.target.value); setSubject(""); }}>
                  {stages.map((item) => <option key={item}>{item}</option>)}
                </select></div>
                <div className="bc-select-wrap"><label htmlFor="bc-subject">المادة الدراسية</label><select id="bc-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
                  <option value="">اختر المادة</option>{subjects.map((item) => <option key={item}>{item}</option>)}
                </select></div>
              </div>
              <p className="bc-helper">سيظهر لك معلمون يدرّسون هذه المادة للمرحلة المختارة.</p>
            </>}

            {step === 2 && <>
              <p className="bc-field-label">اختر يوماً خلال الأسبوع القادم</p>
              <div className="bc-date-list">{dates.map((date, index) => <button type="button" key={date.key} className={`bc-date ${selectedDate === index ? "selected" : ""}`} onClick={() => chooseDate(index)}><span>{date.weekday}</span><b>{date.label}</b></button>)}</div>
              <p className="bc-field-label">الأوقات المتاحة · توقيتك المحلي</p>
              <div className="bc-time-list">{times.map((time) => <button type="button" key={time} className={`bc-time ${activeTime === time ? "selected" : ""}`} onClick={() => setSelectedTime(time)}>{time}</button>)}</div>
              <p className="bc-helper">تبدأ المواعيد بعد ساعتين على الأقل من الآن.</p>
            </>}

            <div className="bc-actions">
              <button type="button" className="bc-back" onClick={() => { setStep(Math.max(0, step - 1)); setNotice(false); }}>{step === 0 ? "إلغاء" : "رجوع خطوة"}</button>
              <button type="button" className="bc-next" disabled={step === 1 && !subject} onClick={advance}>
                {step === 2 ? "ابحث عن المعلمين" : "التالي"} <Glyph name="arrow" />
              </button>
            </div>
            {notice && <div className="bc-toast" role="status">{step === 2 ? "اكتملت تفاصيل طلبك. يمكنك الآن متابعة البحث عن المعلمين." : "يمكنك إدارة عناوين الحصة من ملفك الشخصي."}</div>}
          </section>

          <aside className="bc-receipt" aria-label="ملخص الحجز">
            <div className="bc-receipt-top"><span className="bc-receipt-kicker">بطاقة الحجز · تتحدّث مباشرة</span><h3>طلب حصتك</h3>
              <div className="bc-receipt-date"><small>الموعد المقترح</small><strong>{dateLabel}</strong></div>
            </div>
            <div className="bc-receipt-lines">
              <div className="bc-receipt-line"><span className="bc-line-icon"><Glyph name="pin" /></span><span><small>مكان الحصة</small><b>{city} · حي النزهة</b></span></div>
              <div className="bc-receipt-line"><span className="bc-line-icon"><Glyph name="book" /></span><span><small>المادة والمرحلة</small><b>{stage} · {subject || "لم تُحدّد المادة بعد"}</b></span></div>
              <div className="bc-receipt-line"><span className="bc-line-icon"><Glyph name="clock" /></span><span><small>نوع الحصة</small><b>حضوري · في منزلك</b></span></div>
            </div>
            <div className="bc-receipt-foot"><Glyph name="check" /> لا يتم تأكيد الحجز قبل اختيار المعلم</div>
          </aside>
        </div>
      </div>
    </main>
  );
}
