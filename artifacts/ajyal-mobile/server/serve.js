/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const LEGAL_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'legal-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const BUILD_SCRIPT = path.resolve(__dirname, '..', 'scripts', 'build.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return typeof appJson.expo?.name === 'string'
      ? appJson.expo.name
      : 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

const LEGAL_DOCUMENTS = {
  privacy: {
    eyebrow: 'حماية معلوماتك',
    title: 'سياسة الخصوصية',
    updated: 'آخر تحديث: 12 سبتمبر 2026',
    description: 'سياسة الخصوصية لتطبيق أجيال المعرفة وخدمات الحسابات والحجوزات والجلسات والتواصل الداخلي.',
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
    description: 'شروط استخدام تطبيق أجيال المعرفة للطلاب والمعلمين وخدمات الحجز والجلسات والتواصل الداخلي.',
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
};

function legalUrl(baseUrl, route) {
  return `${baseUrl}${basePath}${route}`;
}

function renderLegalContent(document) {
  return document.sections.map((section) => {
    const paragraphs = (section.paragraphs || [])
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join('');
    const lists = (section.lists || [])
      .map((list) => `<p class="section-label">${escapeHtml(list.label)}:</p><ul>${list.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
      .join('');
    const items = section.items
      ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
    return `<section class="section"><h2>${escapeHtml(section.title)}</h2>${paragraphs}${lists}${items}</section>`;
  }).join('');
}

function serveLegalPage(req, res, legalTemplate, appName, type) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const baseUrl = `${protocol}://${host}`;
  const document = LEGAL_DOCUMENTS[type];
  const route = type === 'privacy' ? '/privacy' : '/terms';
  const html = legalTemplate
    .replace(/CANONICAL_URL_PLACEHOLDER/g, escapeHtml(legalUrl(baseUrl, route)))
    .replace(/PRIVACY_URL_PLACEHOLDER/g, escapeHtml(legalUrl(baseUrl, '/privacy')))
    .replace(/TERMS_URL_PLACEHOLDER/g, escapeHtml(legalUrl(baseUrl, '/terms')))
    .replace(/SUPPORT_URL_PLACEHOLDER/g, escapeHtml('/support'))
    .replace(/PRIVACY_CURRENT_PLACEHOLDER/g, type === 'privacy' ? 'aria-current="page"' : '')
    .replace(/TERMS_CURRENT_PLACEHOLDER/g, type === 'terms' ? 'aria-current="page"' : '')
    .replace(/LEGAL_DESCRIPTION_PLACEHOLDER/g, escapeHtml(document.description))
    .replace(/LEGAL_EYEBROW_PLACEHOLDER/g, escapeHtml(document.eyebrow))
    .replace(/LEGAL_TITLE_PLACEHOLDER/g, escapeHtml(document.title))
    .replace(/LEGAL_UPDATED_PLACEHOLDER/g, escapeHtml(document.updated))
    .replace(/LEGAL_INTRO_PLACEHOLDER/g, escapeHtml(document.intro))
    .replace(/LEGAL_CONTENT_PLACEHOLDER/g, renderLegalContent(document))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=300',
  });
  res.end(html);
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(503, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'retry-after': '2',
    });
    res.end(
      JSON.stringify({
        error: `Static build is still being prepared for platform: ${platform}`,
      }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest);
}

function getNativePlatform(req, requestUrl) {
  const headerPlatform = req.headers['expo-platform'];
  if (headerPlatform === 'ios' || headerPlatform === 'android') return headerPlatform;

  const queryPlatform = requestUrl.searchParams.get('platform');
  if (queryPlatform === 'ios' || queryPlatform === 'android') return queryPlatform;

  const userAgent = String(req.headers['user-agent'] || '');
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod|ios|cfnetwork|darwin/i.test(userAgent)) return 'ios';
  return 'ios';
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `exps://${host}${basePath}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/PUBLIC_BASE_PATH_PLACEHOLDER/g, escapeHtml(basePath))
    .replace(/EXPS_URL_ATTRIBUTE_PLACEHOLDER/g, escapeHtml(expsUrl))
    .replace(/EXPS_URL_JSON_PLACEHOLDER/g, toScriptString(expsUrl))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'content-type': contentType });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const legalPageTemplate = fs.readFileSync(LEGAL_TEMPLATE_PATH, 'utf-8');
const appName = getAppName();

function hasStaticManifests() {
  return (
    fs.existsSync(path.join(STATIC_ROOT, 'ios', 'manifest.json')) &&
    fs.existsSync(path.join(STATIC_ROOT, 'android', 'manifest.json'))
  );
}

function startBuildIfNeeded() {
  if (hasStaticManifests()) {
    return;
  }

  console.log('Static Expo build is missing; starting background build...');
  const build = spawn(process.execPath, [BUILD_SCRIPT], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      EXPO_UNSTABLE_HEADLESS: '1',
      EXPO_NO_DEPENDENCY_VALIDATION: '1',
      EXPO_BUILD_PORT: process.env.EXPO_BUILD_PORT || '22130',
    },
    stdio: 'inherit',
  });

  build.on('exit', (code, signal) => {
    if (code === 0) {
      console.log('Background static Expo build completed');
    } else {
      console.error(
        `Background static Expo build stopped (code=${code ?? 'none'}, signal=${signal ?? 'none'})`,
      );
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }
  pathname = pathname.replace(/\/+$/, '') || '/';

  if (pathname === '/status') {
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end('packager-status:running');
    return;
  }

  if (pathname === '/privacy' || pathname === '/terms') {
    return serveLegalPage(req, res, legalPageTemplate, appName, pathname.slice(1));
  }

  if (pathname === '/' || pathname === '/manifest') {
    const platform = getNativePlatform(req, url);
    if (platform && (pathname === '/manifest' || req.headers.accept?.includes('application/json'))) {
      return serveManifest(platform, res);
    }

    if (pathname === '/') {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res);
});

// The artifact service injects PORT=22030. Keep the artifact's assigned
// Preview port as a safe fallback if a standalone workflow omits the env.
const port = parseInt(process.env.PORT || '22030', 10);
startBuildIfNeeded();
server.listen(port, '0.0.0.0', () => {
  console.log(`Serving static Expo build on port ${port}`);
});
