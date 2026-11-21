import { useMemo, useState, type ReactNode } from "react";
import "./_group.css";
import "./StepFlow.css";

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
    <div className="sf-dropdown">
      <div className="sf-dropdown-label">{label}</div>
      <button className={`sf-dropdown-trigger ${value ? "has-value" : ""}`} type="button" disabled={disabled} onClick={() => setOpen(!open)}>
        <Icon name="chevron-down" size={17} />
        <span>{value || placeholder}</span>
      </button>
      {open && <div className="sf-dropdown-options">
        {options.map((option) => <button type="button" key={option} onClick={() => { onChange(option); setOpen(false); }}>{option}</button>)}
      </div>}
    </div>
  );
}

export function StepFlow() {
  const [cityId, setCityId] = useState("dammam");
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [stage, setStage] = useState("المتوسطة");
  const [subject, setSubject] = useState("");
  const [searchPrepared, setSearchPrepared] = useState(false);
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

  return (
    <main className="ajyal-current sf-root">
      <div className="sf-screen">
        <header className="sf-header">
          <div className="sf-brand">
            <div className="sf-brand-copy">
              <div className="sf-brand-name">أجيال المعرفة</div>
              <div className="sf-brand-tagline">نتعلم اليوم، نصنع الغد</div>
            </div>
            <div className="sf-logo-frame"><img src="/__mockup/images/ajyal-icon.png" alt="" /></div>
          </div>
          <div className="sf-topline">
            <button className="sf-back" type="button" aria-label="رجوع"><Icon name="arrow-right" size={19} /></button>
            <div><span>حجز حصة حضورية</span><small>خطوتان بسيطتان لتجد معلمك</small></div>
          </div>
        </header>

        <section className="sf-progress" aria-label="تقدم الحجز">
          <div className="sf-progress-track"><span /></div>
          <div className="sf-progress-item is-done">
            <span className="sf-progress-dot"><Icon name="check" size={13} /></span>
            <span><b>المكان</b><small>تم التحديد</small></span>
          </div>
          <div className="sf-progress-item is-current">
            <span className="sf-progress-dot">٢</span>
            <span><b>المادة والموعد</b><small>الخطوة الحالية</small></span>
          </div>
        </section>

        <section className={`sf-location ${locationExpanded ? "is-editing" : "is-complete"}`}>
          <div className="sf-location-top">
            <div className="sf-location-mark"><Icon name={locationExpanded ? "map-pin" : "check"} size={17} /></div>
            <div className="sf-location-copy">
              <strong>{locationExpanded ? "مكان الحصة" : "المكان جاهز"}</strong>
              <small>{locationExpanded ? "اختر المدينة والعنوان المحفوظ" : "اكتمل الاختيار، يمكنك تعديله متى شئت"}</small>
            </div>
            {!locationExpanded && <button className="sf-edit" type="button" onClick={() => setLocationExpanded(true)}><Icon name="edit-2" size={14} />تعديل</button>}
          </div>
          {!locationExpanded ? (
            <button className="sf-address-summary" type="button" aria-label="تعديل مكان الحصة والعنوان" onClick={() => setLocationExpanded(true)}>
              <span className="sf-home-icon"><Icon name="home" size={16} /></span>
              <span className="sf-address-copy"><b>{city.name} · {savedAddress}</b><small>منزلي، الدور الثاني</small></span>
              <span className="sf-primary-tag">أساسي</span>
              <Icon name="chevron-left" size={16} />
            </button>
          ) : (
            <div className="sf-location-fields">
              <div className="sf-field-label">المدينة</div>
              <div className="sf-city-grid">
                {cities.map((item) => <button key={item.id} type="button" disabled={!item.available} onClick={() => setCityId(item.id)} className={`sf-city ${cityId === item.id ? "selected" : ""} ${!item.available ? "unavailable" : ""}`}>
                  <span className={`sf-radio ${cityId === item.id ? "selected" : ""}`}>{cityId === item.id && <Icon name="check" size={12} />}</span>
                  <span><b>{item.name}</b><small>{item.available ? "متاحة" : "غير متاحة حالياً"}</small></span>
                </button>)}
              </div>
              <div className="sf-address-heading"><span className="sf-field-label">العنوان المحفوظ</span><button type="button" className="sf-manage" onClick={() => undefined}><Icon name="edit-2" size={13} />إدارة العناوين</button></div>
              <Dropdown label="عنوان الحصة" value={savedAddress} placeholder="اختر عنوان الحصة" options={[savedAddress]} onChange={() => undefined} />
              <div className="sf-address-context">
                <span className="sf-home-icon"><Icon name="home" size={16} /></span>
                <span className="sf-address-copy"><b>{savedAddress}</b><small>{city.name} · منزلي، الدور الثاني</small></span>
                <span className="sf-primary-tag">أساسي</span>
              </div>
              <button type="button" className="sf-done-editing" onClick={() => setLocationExpanded(false)}><Icon name="check" size={15} />تم، متابعة</button>
            </div>
          )}
        </section>

        <section className="sf-lesson">
          <div className="sf-lesson-heading">
            <div className="sf-lesson-icon"><Icon name="book-open" size={18} /></div>
            <div><span className="sf-eyebrow">الخطوة ٢ من ٢</span><h1>تفاصيل الحصة</h1><p>اختر المادة والوقت المناسبين</p></div>
          </div>

          <div className="sf-selectors">
            <Dropdown label="المرحلة الدراسية" value={stage} placeholder="اختر المرحلة الدراسية" options={["الابتدائية", "المتوسطة", "الثانوية"]} onChange={(value) => { setStage(value); setSubject(""); setSearchPrepared(false); }} />
            <Dropdown label="المادة الدراسية" value={subject} placeholder="اختر المادة" options={["الرياضيات", "العلوم", "اللغة العربية", "اللغة الإنجليزية"]} disabled={!stage} onChange={(value) => { setSubject(value); setSearchPrepared(false); }} />
          </div>
          <p className="sf-helper">سيتم عرض المعلمين الذين يدرّسون المادة للمرحلة المختارة.</p>

          <div className="sf-section-divider"><span>موعد الحصة</span><i /></div>
          <div className="sf-schedule-label">اختر اليوم</div>
          <div className="sf-date-grid">{dates.map((date, index) => <button type="button" key={date.key} className={`sf-date ${selectedDate === index ? "selected" : ""}`} onClick={() => {
            const available = availableTimes(date.key, Date.now());
            if (!available.length) {
              const nextIndex = dates.findIndex((option, optionIndex) => optionIndex > index && availableTimes(option.key, Date.now()).length > 0);
              if (nextIndex >= 0) {
                setSelectedDate(nextIndex);
                setSelectedTime(defaultTimeFor(dates[nextIndex].key, Date.now()));
              }
              return;
            }
            setSelectedDate(index);
            setSelectedTime(available.includes(selectedTime) && selectedTime !== "08:00" ? selectedTime : defaultTimeFor(date.key, Date.now()));
          }}><span>{date.day}</span><b>{date.date}</b></button>)}</div>
          <div className="sf-schedule-label sf-time-title">اختر الوقت</div>
          <div className="sf-time-grid">{timeOptions.map((time) => <button type="button" key={time} className={`sf-time ${selectedTime === time ? "selected" : ""}`} onClick={() => setSelectedTime(time)}>{time}</button>)}</div>
          <p className="sf-time-helper"><Icon name="clock" size={14} />بالتوقيت المحلي. اختر موعداً بعد ساعتين على الأقل من الآن.</p>

          <div className="sf-summary">
            <div className="sf-summary-heading"><span className="sf-summary-icon"><Icon name="clipboard" size={15} /></span><b>ملخص طلبك</b><small>يتحدث تلقائياً</small></div>
            <div className="sf-summary-row"><span className="sf-summary-symbol"><Icon name="map-pin" size={15} /></span><span><b>المكان</b><small>{city.name} · {savedAddress}</small></span></div>
            <div className="sf-summary-row"><span className="sf-summary-symbol"><Icon name="book-open" size={15} /></span><span><b>الدراسة</b><small>{stage} · {subject || "المادة غير محددة"}</small></span></div>
            <div className="sf-summary-row"><span className="sf-summary-symbol"><Icon name="clock" size={15} /></span><span><b>الموعد</b><small>{scheduleLabel} · بالتوقيت المحلي</small></span></div>
          </div>

          <button className="sf-search" type="button" onClick={() => setSearchPrepared(true)}><Icon name="search" size={17} />ابحث عن المعلمين<Icon name="chevron-left" size={16} /></button>
          {searchPrepared && <p className="sf-search-note" role="status">{subject ? "تم تجهيز تفضيلات البحث حسب اختياراتك." : "اختر المادة الدراسية أولاً لإكمال البحث."}</p>}
          <div className="sf-privacy-note"><span />لن نعرض إلا خيارات توافق المادة والمرحلة المحددتين.</div>
        </section>
      </div>
    </main>
  );
}
