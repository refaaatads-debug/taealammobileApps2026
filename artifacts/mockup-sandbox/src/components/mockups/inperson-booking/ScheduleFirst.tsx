import { useMemo, useState, type ReactNode } from "react";
import "./_group.css";
import "./ScheduleFirst.css";

type IconName = "arrow-right" | "map-pin" | "check" | "edit-2" | "home" | "chevron-left" | "chevron-down" | "book-open" | "clipboard" | "clock" | "search";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
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
  return <div className="sf-dropdown">
    <span className="sf-dropdown-label">{label}</span>
    <button className="sf-dropdown-trigger sf-button" type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="chevron-down" size={14} /><span>{value || placeholder}</span>
    </button>
    {open && <div className="sf-options">{options.map((option) => <button type="button" key={option} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}</div>}
  </div>;
}

export function ScheduleFirst() {
  const [cityId, setCityId] = useState("dammam");
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [stage, setStage] = useState("المتوسطة");
  const [subject, setSubject] = useState("");
  const [feedback, setFeedback] = useState("");
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

  const chooseDate = (index: number) => {
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
    setFeedback("");
  };

  return <main className="ajyal-current ajyal-schedule-first">
    <div className="sf-screen">
      <header className="sf-header">
        <div className="sf-brand">
          <div className="sf-brand-copy"><div className="sf-brand-name">أجيال المعرفة</div><div className="sf-brand-tagline">نتعلم اليوم، نصنع الغد</div></div>
          <div className="sf-logo"><img src="/__mockup/images/ajyal-icon.png" alt="" /></div>
        </div>
        <div className="sf-topline">
          <button className="sf-back sf-button" type="button" aria-label="رجوع" onClick={() => { setLocationExpanded(false); setFeedback(""); }}><Icon name="arrow-right" size={17} /></button>
          <div><p className="sf-eyebrow">حجز حضوري · ٠١</p><h1 className="sf-title">اختر موعدك المناسب</h1></div>
        </div>
      </header>

      <section className="sf-context" aria-label="تفاصيل الحصة">
        <div className="sf-context-head"><span className="sf-context-kicker">تفاصيل الحصة</span><span className="sf-context-count">الموعد هو الخطوة الأهم</span></div>
        <div className="sf-criteria">
          <div className="sf-criterion">
            <span className="sf-criterion-icon"><Icon name="map-pin" size={14} /></span>
            <span className="sf-criterion-copy"><small>المدينة والعنوان</small><strong>{city.name} · {savedAddress}</strong></span>
          </div>
          <div className="sf-criterion">
            <span className="sf-criterion-icon"><Icon name="home" size={14} /></span>
            <span className="sf-criterion-copy"><small>تفاصيل العنوان</small><strong>منزلي، الدور الثاني · أساسي</strong></span>
          </div>
        </div>
        <div className="sf-context-actions">
          <button className="sf-text-button sf-button" type="button" onClick={() => setLocationExpanded(!locationExpanded)}><Icon name="edit-2" size={13} />{locationExpanded ? "إخفاء تفاصيل الموقع" : "تعديل الموقع والعنوان"}</button>
        </div>
        {locationExpanded && <div className="sf-location-expand">
          <div className="sf-label">المدينة</div>
          <div className="sf-city-list">{cities.map((item) => <button key={item.id} type="button" disabled={!item.available} onClick={() => setCityId(item.id)} className={`sf-city sf-button ${cityId === item.id ? "selected" : ""}`}>
            <span className="sf-radio">{cityId === item.id && <Icon name="check" size={10} />}</span><span><strong className="sf-city-name">{item.name}</strong><small className="sf-city-status">{item.available ? "متاحة" : "غير متاحة حالياً"}</small></span>
          </button>)}</div>
          <div className="sf-address-row">
            <button className="sf-address-select sf-button" type="button" onClick={() => setFeedback("العنوان المحفوظ محدد للحصة")}><Icon name="home" size={14} /><strong>{savedAddress}</strong><Icon name="chevron-down" size={13} /></button>
            <span className="sf-primary">أساسي</span>
          </div>
          <button className="sf-text-button sf-button" type="button" onClick={() => setFeedback("العنوان المحفوظ: منزلي، الدور الثاني · ١ عنوان")}><Icon name="edit-2" size={12} />إدارة العناوين</button>
        </div>}
        <div className="sf-subjects">
          <Dropdown label="المرحلة الدراسية" value={stage} placeholder="اختر المرحلة" options={["الابتدائية", "المتوسطة", "الثانوية"]} onChange={(value) => { setStage(value); setSubject(""); }} />
          <Dropdown label="المادة الدراسية" value={subject} placeholder="اختر المادة" options={["الرياضيات", "العلوم", "اللغة العربية", "اللغة الإنجليزية"]} disabled={!stage} onChange={setSubject} />
        </div>
      </section>

      <section className="sf-schedule">
        <div className="sf-schedule-head">
          <div><h2 className="sf-schedule-title">متى يناسبك؟</h2><p className="sf-schedule-subtitle">اختر يوماً ثم وقتاً متاحاً للحصة</p></div>
          <span className="sf-focus-mark"><Icon name="clock" size={18} /></span>
        </div>
        <div className="sf-day-caption"><strong>الأيام القادمة</strong><span>خلال ٧ أيام</span></div>
        <div className="sf-date-grid">{dates.map((date, index) => {
          const hasTimes = availableTimes(date.key, Date.now()).length > 0;
          return <button type="button" key={date.key} aria-pressed={selectedDate === index} className={`sf-date sf-button ${selectedDate === index ? "selected" : ""}`} onClick={() => chooseDate(index)}>
            <span className="sf-date-day">{date.day}</span><strong className="sf-date-value">{date.date}</strong>{hasTimes && <i className="sf-date-indicator" />}
          </button>;
        })}</div>
        <div className="sf-time-heading"><strong>الأوقات المتاحة</strong><span>{timeOptions.length ? `${timeOptions.length} أوقات` : "لا توجد أوقات"}</span></div>
        <div className="sf-time-grid">{timeOptions.map((time) => <button type="button" key={time} aria-pressed={selectedTime === time} className={`sf-time sf-button ${selectedTime === time ? "selected" : ""}`} onClick={() => { setSelectedTime(time); setFeedback(""); }}>{time}</button>)}</div>
        <p className="sf-helper"><Icon name="clock" size={13} />بالتوقيت المحلي. اختر موعداً بعد ساعتين على الأقل من الآن.</p>
      </section>

      <section className="sf-summary">
        <div className="sf-summary-head"><span className="sf-summary-icon"><Icon name="clipboard" size={14} /></span><strong>ملخص طلبك</strong></div>
        <div className="sf-facts">
          <div className="sf-fact"><Icon name="map-pin" size={13} /><span className="sf-fact-copy"><strong>{city.name}</strong><small>{savedAddress}</small></span></div>
          <div className="sf-fact"><Icon name="book-open" size={13} /><span className="sf-fact-copy"><strong>{stage}</strong><small>{subject || "المادة غير محددة"}</small></span></div>
          <div className="sf-fact"><Icon name="clock" size={13} /><span className="sf-fact-copy"><strong>{scheduleLabel}</strong><small>بالتوقيت المحلي</small></span></div>
        </div>
      </section>
      <button className="sf-search sf-button" type="button" disabled={!subject || !timeOptions.length} onClick={() => setFeedback("تم تجهيز معايير البحث عن المعلمين")}>
        <Icon name="search" size={16} />ابحث عن المعلمين
      </button>
      {feedback && <p className="sf-feedback" role="status">{feedback}</p>}
    </div>
  </main>;
}
