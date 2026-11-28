import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(sourceDir, "../..");
const outputDir = path.join(rootDir, "generated-artifacts/store-assets");
const assetsDir = path.join(outputDir, "assets");
const pageDir = path.join(outputDir, "source-pages");
const markPath = path.join(sourceDir, "brand-mark.png");
const designs = JSON.parse(fs.readFileSync(path.join(sourceDir, "designs.json"), "utf8"));
const storeCopy = JSON.parse(fs.readFileSync(path.join(sourceDir, "store-copy.json"), "utf8"));
const roleTitle = (role) => role === "teacher" ? "تطبيق المعلم" : "تطبيق الطالب";
let css = fs.readFileSync(path.join(sourceDir, "style.css"), "utf8");
for (const font of ["Cairo_400Regular", "Cairo_500Medium", "Cairo_600SemiBold", "Cairo_700Bold"]) {
  const fontData = fs.readFileSync(path.join(sourceDir, "fonts", `${font}.ttf`)).toString("base64");
  css = css.replaceAll(
    `url("./fonts/${font}.ttf")`,
    `url("data:font/ttf;base64,${fontData}")`
  );
}
const markData = fs.readFileSync(markPath).toString("base64");
const mark = `data:image/png;base64,${markData}`;
const chromium = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";

if (!fs.existsSync(chromium)) {
  throw new Error(`Chromium was not found at ${chromium}; set CHROMIUM_PATH to its executable.`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(pageDir, { recursive: true });

const ui = {
  home: `
    <section class="screen-content">
      <span class="eyebrow">مساحة الطالب</span>
      <h2 class="screen-heading">مرحباً بك</h2>
      <p class="screen-subheading">تابع خطوتك التعليمية القادمة</p>
      <article class="ui-card">
        <div class="row">
          <div>
            <span class="eyebrow">الحصة القادمة</span>
            <div class="ui-card-title">رياضيات</div>
            <div class="ui-card-copy">طلب حصة · عن بُعد</div>
          </div>
          <div class="round-icon green">◷</div>
        </div>
        <div class="divider"></div>
        <div class="row">
          <span class="ui-card-copy">حالة الطلب</span>
          <span class="pill">قيد المتابعة</span>
        </div>
        <div class="soft-button">عرض تفاصيل الطلب</div>
      </article>
      <article class="ui-card">
        <div class="row">
          <div class="row-start">
            <div class="round-icon">▤</div>
            <div>
              <div class="ui-card-title">مهامي التعليمية</div>
              <div class="ui-card-copy">راجع المهام والتسليمات</div>
            </div>
          </div>
          <span class="pill blue">المهام</span>
        </div>
        <div class="progress-track"><span></span></div>
      </article>
      <article class="ui-card">
        <div class="row">
          <div>
            <div class="ui-card-title">مواعيدك</div>
            <div class="ui-card-copy">طلباتك وحصصك في شاشة واحدة</div>
          </div>
          <div class="round-icon green">✓</div>
        </div>
      </article>
    </section>`,

  search: `
    <section class="screen-content">
      <span class="eyebrow">اكتشف المعلمين</span>
      <h2 class="screen-heading">ابحث عن معلم</h2>
      <p class="screen-subheading">اختر المادة والمرحلة التعليمية</p>
      <div class="field">
        <span class="field-label">المادة التعليمية</span>
        <div class="field-value">اختر المادة <span class="ui-muted">⌄</span></div>
      </div>
      <div class="field">
        <span class="field-label">المرحلة الدراسية</span>
        <div class="field-value">اختر المرحلة <span class="ui-muted">⌄</span></div>
      </div>
      <div class="chips">
        <span class="chip active">رياضيات</span><span class="chip">علوم</span><span class="chip">لغة عربية</span>
      </div>
      <article class="ui-card teacher-card">
        <div class="teacher-avatar">م</div>
        <div class="teacher-copy"><strong>معلم رياضيات</strong><span>معلم معتمد · المرحلة المتوسطة</span></div>
        <span class="ui-action">←</span>
      </article>
      <article class="ui-card teacher-card">
        <div class="teacher-avatar" style="background:#e9f6f1;color:#24795f">ع</div>
        <div class="teacher-copy"><strong>معلم علوم</strong><span>معلم معتمد · المرحلة الثانوية</span></div>
        <span class="ui-action">←</span>
      </article>
      <div class="primary-button">متابعة طلب الحصة</div>
    </section>`,

  lesson: `
    <section class="screen-content">
      <span class="eyebrow">جلسة تعليمية</span>
      <div class="row">
        <h2 class="screen-heading">حصة رياضيات</h2>
        <span class="pill">مباشرة</span>
      </div>
      <p class="screen-subheading">أدوات الجلسة المتاحة</p>
      <div class="lesson-board">
        <small>السبورة التعليمية</small>
        <div class="equation">x + 4 = 10</div>
        <div class="board-note">اكتب الحل خطوة بخطوة</div>
        <div class="call-tile"><div class="call-avatar">م</div><span>المعلم</span></div>
      </div>
      <div class="ui-card" style="padding:3%">
        <div class="row">
          <span class="ui-card-title">أدوات الحصة</span>
          <span class="ui-muted">الصوت والفيديو والسبورة</span>
        </div>
        <div class="divider"></div>
        <div class="call-controls">
          <div class="call-control"><span class="control-dot">♫</span><span>الصوت</span></div>
          <div class="call-control"><span class="control-dot">◉</span><span>الفيديو</span></div>
          <div class="call-control"><span class="control-dot">▤</span><span>السبورة</span></div>
          <div class="call-control"><span class="control-dot end">■</span><span>مغادرة</span></div>
        </div>
      </div>
      <div class="ui-card">
        <div class="row"><span class="ui-card-title">المشاركة في الدرس</span><span class="pill blue">الجلسة</span></div>
        <div class="ui-card-copy">تابع الشرح واستخدم أدوات الجلسة.</div>
      </div>
    </section>`,

  inPerson: `
    <section class="screen-content">
      <span class="eyebrow">طلب حصة حضورية</span>
      <h2 class="screen-heading">حدد تفاصيل طلبك</h2>
      <p class="screen-subheading">أدخل المادة والموقع المناسبين</p>
      <div class="field">
        <span class="field-label">المادة التعليمية</span>
        <div class="field-value">رياضيات <span class="ui-muted">⌄</span></div>
      </div>
      <div class="field">
        <span class="field-label">المرحلة الدراسية</span>
        <div class="field-value">اختر المرحلة <span class="ui-muted">⌄</span></div>
      </div>
      <div class="map-card" style="height:18%"><div class="map-pin"><span>•</span></div></div>
      <div class="field">
        <span class="field-label">موقع الحصة</span>
        <div class="row"><span class="field-value">عنوان محفوظ أو موقع جديد</span><span class="ui-action">⌖</span></div>
      </div>
      <div class="field">
        <span class="field-label">موعد الحصة</span>
        <div class="row"><span class="field-value">اختر الوقت المناسب</span><span class="ui-action">◷</span></div>
      </div>
      <div class="primary-button">متابعة الطلب</div>
    </section>`,

  bookings: `
    <section class="screen-content">
      <span class="eyebrow">متابعة الطلبات</span>
      <h2 class="screen-heading">الحجوزات والحصص</h2>
      <p class="screen-subheading">راجع حالة الطلب والمواعيد المرتبطة به</p>
      <div class="chips"><span class="chip active">القادمة</span><span class="chip">السابقة</span><span class="chip">الطلبات</span></div>
      <article class="ui-card booking-card">
        <div class="row">
          <div class="row-start"><div class="round-icon green">◷</div><div><div class="ui-card-title">حصة رياضيات</div><div class="ui-card-copy">عن بُعد</div></div></div>
          <span class="pill">مؤكدة</span>
        </div>
        <div class="divider"></div>
        <div class="booking-meta"><span>الأحد · ٤:٣٠ م</span><span>تفاصيل الحجز ←</span></div>
      </article>
      <article class="ui-card booking-card">
        <div class="row">
          <div class="row-start"><div class="round-icon">⌖</div><div><div class="ui-card-title">حصة لغة عربية</div><div class="ui-card-copy">حضوري</div></div></div>
          <span class="pill blue">بانتظار الرد</span>
        </div>
        <div class="divider"></div>
        <div class="booking-meta"><span>طلب حصة</span><span>عرض الطلب ←</span></div>
      </article>
      <article class="ui-card">
        <div class="row"><span class="ui-card-title">سجل الحصص</span><span class="ui-action">→</span></div>
        <div class="ui-card-copy">تابع الطلبات والحصص السابقة من هنا.</div>
      </article>
      <div class="soft-button">عرض كل الطلبات</div>
    </section>`,

  assignments: `
    <section class="screen-content">
      <span class="eyebrow">مساحة المعلم</span>
      <h2 class="screen-heading">المهام والتسليمات</h2>
      <p class="screen-subheading">راجع حالة المهام وإجابات الطلاب</p>
      <div class="chips"><span class="chip active">الكل</span><span class="chip">نشطة</span><span class="chip">مكتملة</span></div>
      <article class="ui-card">
        <div class="row">
          <div><span class="eyebrow">واجب</span><div class="ui-card-title">تدريبات الرياضيات</div><div class="ui-card-copy">المرحلة المتوسطة</div></div>
          <div class="round-icon">▤</div>
        </div>
        <div class="divider"></div>
        <div class="row"><span class="ui-card-copy">حالة المراجعة</span><span class="pill">بانتظار المراجعة</span></div>
        <div class="primary-button">مراجعة التسليمات</div>
      </article>
      <article class="ui-card">
        <div class="row">
          <div><span class="eyebrow">اختبار</span><div class="ui-card-title">مراجعة الدرس</div><div class="ui-card-copy">إجابات مرتبطة بالمهمة</div></div>
          <div class="round-icon green">✓</div>
        </div>
        <div class="divider"></div>
        <div class="task-status">متابعة حالة التسليم</div>
        <div class="progress-track"><span></span></div>
      </article>
      <div class="soft-button">فتح قائمة المهام</div>
    </section>`
};

ui.teacherHome = `
  <section class="screen-content">
    <span class="eyebrow">لوحة المعلم</span>
    <h2 class="screen-heading">صورة يومك التعليمية</h2>
    <p class="screen-subheading">الحصص والطلاب والمهام في مساحة المعلم</p>
    <article class="ui-card">
      <div class="row">
        <div>
          <span class="eyebrow">الحصة القادمة</span>
          <div class="ui-card-title">حصة رياضيات</div>
          <div class="ui-card-copy">جلسة مرتبطة بحجز طالب</div>
        </div>
        <span class="pill">عن بُعد</span>
      </div>
      <div class="divider"></div>
      <div class="row"><span class="ui-card-copy">تفاصيل الحصة</span><span class="ui-action">←</span></div>
    </article>
    <article class="ui-card">
      <div class="row">
        <div class="row-start"><div class="round-icon green">♧</div><div><div class="ui-card-title">قائمة الطلاب</div><div class="ui-card-copy">الطلاب المرتبطون بحجوزاتك</div></div></div>
      </div>
      <div class="soft-button">عرض الطلاب</div>
    </article>
    <article class="ui-card">
      <div class="row">
        <div class="row-start"><div class="round-icon">▤</div><div><div class="ui-card-title">مراجعة المهام</div><div class="ui-card-copy">تابع التسليمات المرتبطة بك</div></div></div>
        <span class="pill blue">للمراجعة</span>
      </div>
    </article>
  </section>`;

ui.teacherStudents = `
  <section class="screen-content">
    <span class="eyebrow">مساحة المعلم</span>
    <h2 class="screen-heading">قائمة الطلاب</h2>
    <p class="screen-subheading">طلاب الحجوزات وطلبات الحجز والمهام المرتبطة بحسابك</p>
    <article class="ui-card teacher-card">
      <div class="teacher-avatar">ط</div>
      <div class="teacher-copy"><strong>طالب مرتبط بحجز</strong><span>جلسة ومحادثة متاحة</span></div>
      <span class="ui-action">←</span>
    </article>
    <article class="ui-card teacher-card">
      <div class="teacher-avatar" style="background:#e9f6f1;color:#24795f">ط</div>
      <div class="teacher-copy"><strong>طالب مرتبط بمهمة</strong><span>متابعة تعليمية من المنصة</span></div>
      <span class="ui-action">←</span>
    </article>
    <article class="ui-card">
      <div class="row"><span class="ui-card-title">تواصل مع طلابك</span><span class="pill">مرتبطة بالخدمة</span></div>
      <div class="ui-card-copy">افتح المحادثة المرتبطة بالحجز عند الحاجة.</div>
      <div class="soft-button">فتح المحادثات</div>
    </article>
  </section>`;

function nav(active) {
  const items = [
    ["⌂", "الرئيسية"],
    ["◷", "الحجوزات"],
    ["▤", "المهام"],
    ["◌", "حسابي"]
  ];
  return `<nav class="bottom-nav">${items.map(([icon, label]) => `<div class="nav-item ${label === active ? "active" : ""}"><span class="nav-icon">${icon}</span><span>${label}</span></div>`).join("")}</nav>`;
}

function appScreen(design) {
  const active = design.screen === "bookings" ? "الحجوزات" :
    design.screen === "assignments" ? "المهام" :
      design.screen === "teacherStudents" ? "حسابي" : "الرئيسية";
  return `
    <div class="screen" dir="rtl">
      <div class="screen-status"><span>٩:٤١</span><span>●●● ◖ ▰</span></div>
      <div class="dynamic-island"></div>
      <header class="ui-header">
        <div class="ui-brand">
          <span class="ui-brand-mark"><img src="${mark}" alt="" /></span>
          <span class="ui-brand-copy"><strong>أجيال المعرفة</strong><span>${roleTitle(design.role)}</span></span>
        </div>
        <span class="ui-action">${design.screen === "search" ? "⌕" : "⌑"}</span>
      </header>
      ${ui[design.screen]}
      ${nav(active)}
    </div>`;
}

function htmlPage(content, kind = "ad") {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>أجيال المعرفة</title>
  <style>${css}</style>
</head>
<body><main class="${kind}">${content}</main></body>
</html>`;
}

function adPage(design, number) {
  return htmlPage(`
    <div class="brand-row">
      <div class="brand-lockup"><span class="brand-mark"><img src="${mark}" alt="" /></span><span>أجيال المعرفة</span></div>
      <span class="frame-label">${roleTitle(design.role)}</span>
    </div>
    <header class="hero-copy">
      <p class="hero-eyebrow">التعلّم يبدأ بخطوة</p>
      <h1 class="hero-title">${design.headline}</h1>
      <p class="hero-subtitle">${design.subtitle}</p>
    </header>
    <section class="phone" aria-label="${design.headline}">
      ${appScreen(design)}
    </section>
    <div class="page-count">${number.toString().padStart(2, "0")} / 06</div>
  `);
}

function featurePage() {
  return htmlPage(`
    <div class="feature-copy">
      <div class="feature-brand"><span>أجيال المعرفة</span></div>
      <h1 class="feature-title">تعلّم، تواصل، وتابع</h1>
      <p class="feature-subtitle">مساحة تعليمية للطالب والمعلم</p>
    </div>
    <div class="feature-phone">
      <div class="feature-phone-inner">
        <div class="feature-mini-status"><span>٩:٤١</span><span>●●● ◖</span></div>
        <div class="feature-mini-title">لوحة الطالب</div>
        <div class="feature-mini-card"><small>الحصة القادمة</small><strong>حصة رياضيات</strong><span>عن بُعد · عرض تفاصيل الطلب</span></div>
        <div class="feature-mini-card"><small>المهام التعليمية</small><strong>تابع تسليماتك</strong><span>المهام وملاحظات المعلم</span></div>
        <div class="feature-mini-button">عرض المواعيد</div>
      </div>
    </div>
  `, "feature");
}

function iconPage() {
  return htmlPage(`<div class="icon-shape"><img src="${mark}" alt="" /></div>`, "icon-canvas");
}

function capture(html, pngPath, width, height, label) {
  const htmlPath = path.join(pageDir, `${label}.html`);
  fs.writeFileSync(htmlPath, html);
  const args = [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=1000",
    `--window-size=${width},${height}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href
  ];
  const result = spawnSync(chromium, args, { encoding: "utf8", stdio: "ignore" });
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(pngPath)) {
    throw new Error(`Chromium failed to render ${label} (exit ${result.status}).`);
  }
}

const targets = [
  { folder: "google-play-phone", label: "Google Play phone", width: 1080, height: 1920 },
  { folder: "app-store-iphone-dynamic-island-medium", label: "iPhone Dynamic Island medium", width: 1206, height: 2622 },
  { folder: "app-store-iphone-dynamic-island-large", label: "iPhone Dynamic Island large", width: 1320, height: 2868 }
];

for (const target of targets) {
  const folder = path.join(assetsDir, target.folder);
  fs.mkdirSync(folder, { recursive: true });
  for (const [index, design] of designs.entries()) {
    const filename = `${design.id}.png`;
    capture(adPage(design, index + 1), path.join(folder, filename), target.width, target.height, `${target.folder}-${design.id}`);
  }
  console.log(`Rendered ${designs.length} ${target.label} images (${target.width}×${target.height}).`);
}

const featurePath = path.join(assetsDir, "google-play-feature-graphic-1024x500.png");
capture(featurePage(), featurePath, 1024, 500, "google-play-feature-graphic");
const googleIconPath = path.join(assetsDir, "google-play-icon-512.png");
capture(iconPage(), googleIconPath, 512, 512, "google-play-icon-512");
const appleIconPath = path.join(assetsDir, "app-store-icon-1024.png");
capture(iconPage(), appleIconPath, 1024, 1024, "app-store-icon-1024");
const googleIconTemp = `${googleIconPath}.rgba.png`;
const iconConversion = spawnSync("magick", [
  googleIconPath,
  "-alpha", "set",
  "-channel", "A",
  "-evaluate", "set", "100%",
  "+channel",
  `PNG32:${googleIconTemp}`
], { encoding: "utf8", stdio: "ignore" });
if (iconConversion.error || iconConversion.status !== 0 || !fs.existsSync(googleIconTemp)) {
  throw new Error("Could not create the required 32-bit Google Play icon. Install ImageMagick and retry.");
}
fs.renameSync(googleIconTemp, googleIconPath);

const previewThumbDir = path.join(outputDir, ".preview-thumbnails");
fs.mkdirSync(previewThumbDir, { recursive: true });
const galleryCards = designs.map((design) => {
  const imagePath = path.join(assetsDir, "google-play-phone", `${design.id}.png`);
  const thumbnailPath = path.join(previewThumbDir, `${design.id}.jpg`);
  const thumbnail = spawnSync("magick", [
    imagePath,
    "-resize", "540x960",
    "-strip",
    "-quality", "82",
    thumbnailPath
  ], { encoding: "utf8", stdio: "ignore" });
  if (thumbnail.error || thumbnail.status !== 0 || !fs.existsSync(thumbnailPath)) {
    throw new Error(`Could not create the preview thumbnail for ${design.id}.`);
  }
  const image = fs.readFileSync(thumbnailPath).toString("base64");
  return `<article><img src="data:image/jpeg;base64,${image}" alt="${design.headline}" /><span class="role-tag">${roleTitle(design.role)}</span><h2>${design.headline}</h2><p>${design.subtitle}</p></article>`;
}).join("\n");
const gallery = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة مواد متجر أجيال المعرفة</title><style>
body{margin:0;background:#f4f7fa;color:#172237;font-family:"DejaVu Sans",Arial,sans-serif}header{padding:28px 5vw;background:#173e8c;color:white}h1{margin:0 0 8px;font-size:24px}header p{margin:0;color:#dce7f7}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;padding:28px 5vw}article{overflow:hidden;border:1px solid #e0e7ef;border-radius:18px;background:white;box-shadow:0 8px 24px #173e8c12}article img{display:block;width:100%;height:auto}.role-tag{display:inline-flex;margin:14px 16px 0;padding:4px 10px;border-radius:999px;background:#e9f6f1;color:#24795f;font-size:12px;font-weight:700}article h2{margin:8px 16px 6px;color:#173e8c;font-size:17px}article p{margin:0 16px 18px;color:#66758a;font-size:13px}@media(max-width:850px){main{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){main{grid-template-columns:1fr}}
</style><header><h1>أجيال المعرفة — صور المتجر</h1><p>ثلاث صور للطالب وثلاث صور للمعلم · واجهات عرض ببيانات اصطناعية</p></header><main>${galleryCards}</main></html>`;
fs.writeFileSync(path.join(outputDir, "preview.html"), gallery);

const contactCards = designs.map((design) => {
  const imagePath = path.join(assetsDir, "google-play-phone", `${design.id}.png`);
  const image = fs.readFileSync(imagePath).toString("base64");
  return `<article><img src="data:image/png;base64,${image}" alt="${design.headline}" /><div><small class="role-label">${roleTitle(design.role)}</small><strong>${design.headline}</strong><span>${design.subtitle}</span></div></article>`;
}).join("\n");
const contactSheet = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f4f7fa;color:#172237;font-family:"DejaVu Sans",Arial,sans-serif}
main{width:100%;height:100%;padding:2.4% 3%;background:linear-gradient(140deg,#f7faf9,#f1f5fb)}
header{height:8%;display:flex;align-items:center;justify-content:space-between;color:#173e8c}
h1{margin:0;font-size:2.2vw}header span{color:#6b788b;font-size:1.05vw}
.grid{height:89%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:1.6%}
article{display:flex;min-height:0;flex-direction:column;overflow:hidden;border:1px solid #e0e7ef;border-radius:18px;background:#fff;box-shadow:0 8px 24px #173e8c12}
article img{display:block;width:100%;height:82%;object-fit:contain;background:#f7f9fc}
article div{display:flex;min-height:0;flex:1;flex-direction:column;justify-content:center;gap:4px;padding:0 4%;text-align:right}
article .role-label{color:#2e9e79;font-size:.75vw;font-weight:800}article strong{color:#173e8c;font-size:1.15vw}article span{color:#66758a;font-size:.85vw}
</style><main><header><h1>أجيال المعرفة · معاينة صور المتجر</h1><span>واجهات محلية ببيانات اصطناعية — لا اتصال بالإنتاج</span></header><section class="grid">${contactCards}</section></main></html>`;
capture(contactSheet, path.join(outputDir, "contact-sheet.png"), 1800, 2200, "contact-sheet");
fs.rmSync(pageDir, { recursive: true, force: true });
fs.rmSync(previewThumbDir, { recursive: true, force: true });

const limits = [];
for (const [locale, copy] of Object.entries(storeCopy.googlePlay)) {
  for (const [field, limit] of [["name", 30], ["shortDescription", 80], ["fullDescription", 4000]]) {
    const count = Array.from(copy[field]).length;
    limits.push({ store: "Google Play", locale, field, count, limit, pass: count <= limit });
  }
}
for (const [locale, copy] of Object.entries(storeCopy.appStore)) {
  for (const [field, limit] of [["name", 30], ["subtitle", 30], ["promotionalText", 170], ["keywords", 100], ["description", 4000], ["whatsNew", 4000]]) {
    const count = Array.from(copy[field]).length;
    limits.push({ store: "App Store", locale, field, count, limit, pass: count <= limit });
  }
}
if (limits.some((item) => !item.pass)) {
  throw new Error(`Store copy exceeds a field limit: ${JSON.stringify(limits.filter((item) => !item.pass))}`);
}
fs.writeFileSync(path.join(outputDir, "store-copy-character-counts.json"), JSON.stringify(limits, null, 2));

const manifest = {
  generatedAt: new Date().toISOString(),
  source: "Local-only synthetic showcase based on existing Ajyal Knowledge mobile screens",
  targets: targets.map(({ folder, width, height }) => ({
    folder,
    width,
    height,
    images: designs.map(({ id, headline, role }) => ({
      file: `assets/${folder}/${id}.png`,
      role,
      headline
    }))
  })),
  additionalAssets: [
    { file: "google-play-feature-graphic-1024x500.png", width: 1024, height: 500 },
    { file: "google-play-icon-512.png", width: 512, height: 512 },
    { file: "app-store-icon-1024.png", width: 1024, height: 1024 }
  ],
  excluded: ["iPad screenshots: app.json supportsTablet=false", "store publishing", "production data"]
};
fs.writeFileSync(path.join(outputDir, "asset-manifest.json"), JSON.stringify(manifest, null, 2));
fs.cpSync(sourceDir, path.join(outputDir, "source"), { recursive: true });
fs.copyFileSync(path.join(rootDir, "store-assets/README.md"), path.join(outputDir, "README.md"));
fs.cpSync(path.join(rootDir, "store-assets/metadata"), path.join(outputDir, "metadata"), { recursive: true });
console.log(`Preview and manifest written to ${outputDir}`);
