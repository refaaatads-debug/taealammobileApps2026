import { useMemo, useState, type ReactNode } from "react";
import "./_group.css";
import "./UnifiedSummary.css";

type IconName = "arrow-right" | "map-pin" | "check" | "edit-2" | "home" | "chevron-left" | "chevron-down" | "book-open" | "clipboard" | "clock" | "search";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    "arrow-right": <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    "map-pin": <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    "edit-2": <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "book-open": <><path d="M12 7v14" /><path d="M3 18V5a1 1 0 0 1 1-1c4 0 7 1 8 3 1-2 4-3 8-3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1c-4 0-7 1-8 3-1-2-4-3-8-3a1 1 0 0 1-1-1Z" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6a1.5 1.5 0 0 0-3-1 1.5 1.5 0 0 0-3 1ZM9 11h6M9 15h6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const cities = [
  { id: "khobar", name: "الخبر", available: false },
  { id: "dammam", name: "الدمام", available: true },
  { id: "riyadh", name: "الرياض", available: false },
];
const times = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);

function availableTimes(dateKey: string, nowMs: number) {
  return times.filter((time) => new Date(`${dateKey}T${time}`).getTime() >= nowMs + 2 * 60 * 60 * 1000);
}

function defaultTimeFor(dateKey: string, nowMs: number) {
  const available = availableTimes(dateKey, nowMs);
  return available.includes("16:00")
    ? "16:00"
    : available.find((time) => time !== "08:00") ?? available[0] ?? "09:00";
}

function Dropdown({ label, value, placeholder, options, disabled = false, onChange }: {
  label: string; value: string; placeholder: string; options: string[]; disabled?: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ip-dropdown">
      <div className="ip-dropdown-label">{label}</div>
      <button className={`ip-dropdown-trigger ${value ? "has-value" : ""}`} type="button" disabled={disabled} onClick={() => setOpen(!open)}>
        <Icon name="chevron-down" size={17} />
        <span>{value || placeholder}</span>
      </button>
      {open && <div className="ip-dropdown-options">
        {options.map((option) => <button type="button" key={option} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}
      </div>}
    </div>
  );
}

export function UnifiedSummary() {
  const [cityId, setCityId] = useState("dammam");
  const [activeEdit, setActiveEdit] = useState<"location" | "lesson" | "schedule" | null>(null);
  const [stage, setStage] = useState("المتوسطة");
  const [subject, setSubject] = useState("");
  const [searchNotice, setSearchNotice] = useState(false);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return {
      day: date.toLocaleDateString("ar-SA", { weekday: "short" }),
      date: date.toLocaleDateString("ar-SA", { day: "numeric", month: "short" }),
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    };
  }), []);
  const nowMs = Date.now();
  const firstAvailableDay = Math.max(0, dates.findIndex((date) => availableTimes(date.key, nowMs).length > 0));
  const [selectedDate, setSelectedDate] = useState(firstAvailableDay);
  const [selectedTime, setSelectedTime] = useState(() => defaultTimeFor(dates[firstAvailableDay].key, nowMs));
  const timeOptions = availableTimes(dates[selectedDate].key, nowMs);
  const city = cities.find((item) => item.id === cityId) ?? cities[1];
  const scheduleLabel = new Date(`${dates[selectedDate].key}T${selectedTime}`).toLocaleString("ar-SA", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
  const savedAddress = "شارع الثامن عشر · حي النزهة";
  const toggleEdit = (section: "location" | "lesson" | "schedule") => {
    setActiveEdit((current) => current === section ? null : section);
  };
  const selectDate = (index: number) => {
    const available = availableTimes(dates[index].key, Date.now());
    if (!available.length) {
      const nextIndex = dates.findIndex((option, optionIndex) => optionIndex > index && availableTimes(option.key, Date.now()).length > 0);
      if (nextIndex >= 0) {
        setSelectedDate(nextIndex);
        setSelectedTime(defaultTimeFor(dates[nextIndex].key, Date.now()));
      }
      return;
    }
    setSelectedDate(index);
    setSelectedTime(available.includes(selectedTime) && selectedTime !== "08:00" ? selectedTime : defaultTimeFor(dates[index].key, Date.now()));
  };

  return (
    <main className="ajyal-current unified-summary">
      <div className="ip-screen">
        <header className="ip-header">
          <div className="ip-brand">
            <div className="ip-brand-copy"><div className="ip-brand-name">أجيال المعرفة</div><div className="ip-brand-tagline">نتعلم اليوم، نصنع الغد</div></div>
            <div className="ip-logo-frame"><img src="/__mockup/images/ajyal-icon.png" alt="" /></div>
          </div>
          <div className="ip-page-header">
            <button className="ip-back" type="button" aria-label="رجوع"><Icon name="arrow-right" size={19} /></button>
            <div className="us-title"><small>حجز جديد · حضوري</small><h1>خطّط لحصتك</h1></div>
          </div>
        </header>

        <section className="us-plan">
          <div className="us-plan-top">
            <div><span className="us-kicker">طلبك في لمحة</span><h2>خطة الحصة</h2></div>
            <span className="us-plan-mark"><Icon name="clipboard" size={17} /></span>
          </div>
          <div className="us-summary-list">
            <section className={`us-edit-section ${activeEdit === "location" ? "is-editing" : ""}`}>
              {activeEdit !== "location" ? <button type="button" className="us-summary-row" onClick={() => toggleEdit("location")}>
                <span className="us-row-icon"><Icon name="map-pin" size={17} /></span>
                <span className="us-row-copy"><small>مكان الحصة</small><strong>{city.name} · {savedAddress}</strong><em>منزلي، الدور الثاني · أساسي</em></span>
                <span className="us-row-action"><Icon name="edit-2" size={15} />تعديل</span>
              </button> : <div className="us-editor">
                <div className="us-editor-heading"><strong>مكان الحصة</strong><button type="button" onClick={() => toggleEdit("location")}>تم</button></div>
                <div className="ip-field-label">المدينة</div>
                <div className="ip-city-grid">{cities.map((item) => <button key={item.id} type="button" disabled={!item.available} onClick={() => setCityId(item.id)} className={`ip-city-option ${cityId === item.id ? "selected" : ""} ${!item.available ? "unavailable" : ""}`}>
                  <span className={`ip-radio ${cityId === item.id ? "selected" : ""}`}>{cityId === item.id && <Icon name="check" size={12} />}</span>
                  <span className="ip-city-copy"><strong>{item.name}</strong><small>{item.available ? "متاحة" : "غير متاحة حالياً"}</small></span>
                </button>)}</div>
                <Dropdown label="العنوان المحفوظ · عنوان الحصة" value={savedAddress} placeholder="اختر عنوان الحصة" options={[savedAddress]} onChange={() => undefined} />
                <div className="us-address-detail"><span className="ip-context-icon"><Icon name="home" size={15} /></span><span><strong>منزلي · الدور الثاني</strong><small>عنوان أساسي · ١ عنوان محفوظ</small></span></div>
              </div>}
            </section>
            <section className={`us-edit-section ${activeEdit === "lesson" ? "is-editing" : ""}`}>
              {activeEdit !== "lesson" ? <button type="button" className="us-summary-row" onClick={() => toggleEdit("lesson")}>
                <span className="us-row-icon"><Icon name="book-open" size={17} /></span>
                <span className="us-row-copy"><small>المادة والمرحلة</small><strong>{stage} · {subject || "المادة غير محددة"}</strong><em>اختر المرحلة أولاً لتحديد المادة</em></span>
                <span className="us-row-action"><Icon name="edit-2" size={15} />تعديل</span>
              </button> : <div className="us-editor">
                <div className="us-editor-heading"><strong>المادة والمرحلة</strong><button type="button" onClick={() => toggleEdit("lesson")}>تم</button></div>
                <Dropdown label="المرحلة الدراسية" value={stage} placeholder="اختر المرحلة الدراسية" options={["الابتدائية", "المتوسطة", "الثانوية"]} onChange={setStage} />
                <Dropdown label="المادة الدراسية" value={subject} placeholder="اختر المادة" options={["الرياضيات", "العلوم", "اللغة العربية", "اللغة الإنجليزية"]} disabled={!stage} onChange={setSubject} />
                <p className="ip-helper">سيتم عرض المعلمين الذين يدرّسون المادة للمرحلة المختارة.</p>
              </div>}
            </section>
            <section className={`us-edit-section ${activeEdit === "schedule" ? "is-editing" : ""}`}>
              {activeEdit !== "schedule" ? <button type="button" className="us-summary-row" onClick={() => toggleEdit("schedule")}>
                <span className="us-row-icon"><Icon name="clock" size={17} /></span>
                <span className="us-row-copy"><small>موعد الحصة</small><strong>{scheduleLabel}</strong><em>بالتوقيت المحلي</em></span>
                <span className="us-row-action"><Icon name="edit-2" size={15} />تعديل</span>
              </button> : <div className="us-editor us-schedule-editor">
                <div className="us-editor-heading"><strong>موعد الحصة</strong><button type="button" onClick={() => toggleEdit("schedule")}>تم</button></div>
                <div className="us-schedule-heading"><div><span className="us-kicker">التوقيت المحلي</span><h3>اختر اليوم والوقت</h3></div></div>
                <div className="ip-schedule-label">اختر اليوم</div>
                <div className="ip-date-grid">{dates.map((date, index) => <button type="button" key={date.key} className={`ip-date-option ${selectedDate === index ? "selected" : ""}`} onClick={() => selectDate(index)}><span>{date.day}</span><strong>{date.date}</strong></button>)}</div>
                <div className="ip-schedule-label">اختر الوقت</div>
                <div className="ip-time-grid">{timeOptions.map((time) => <button type="button" key={time} className={`ip-time-option ${selectedTime === time ? "selected" : ""}`} onClick={() => setSelectedTime(time)}>{time}</button>)}</div>
                <p className="ip-helper ip-time-helper">بالتوقيت المحلي. اختر موعداً بعد ساعتين على الأقل من الآن.</p>
              </div>}
            </section>
          </div>
          <footer className="us-footer">
            <button className="ip-search-button" type="button" onClick={() => setSearchNotice(true)}><Icon name="search" size={16} />ابحث عن المعلمين</button>
            {searchNotice && <p className="us-notice" role="status">تم تجهيز تفاصيل طلبك للبحث عن المعلمين.</p>}
          </footer>
        </section>
      </div>
    </main>
  );
}
