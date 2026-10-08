import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteTeacherCertificate,
  getCertificateOpenUrl,
  loadProfileData,
  restoreMissingTeacherCertificateFile,
  saveProfileData,
  uploadTeacherCertificate,
} from "../profilePersistence.ts";
import {
  createProfileTestSession,
  emptyStudentTables,
  emptyTeacherTables,
  IsolatedProfileClient,
} from "../profileTestSessions.ts";

test("isolated student session saves and reloads account, school stage, and notification settings", async () => {
  const session = createProfileTestSession("student");
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.onboardingCompleted, true, "verification sessions skip the welcome screen");
  const client = new IsolatedProfileClient(emptyStudentTables(session));

  const before = await loadProfileData(client, session.user.id, session.role);
  assert.equal(before.fullName, "طالبة تجريبية");
  assert.equal(before.phone, "0501111111");
  assert.equal(before.studentStage, "المتوسطة");
  assert.deepEqual(
    [before.notifyBefore, before.notifyAfter, before.notifyExpiry],
    [true, true, false],
  );

  await saveProfileData(client, session.user.id, session.role, null, {
    ...before,
    fullName: "طالبة بعد التعديل",
    phone: "0551234567",
    studentStage: "الثانوية",
    notifyBefore: false,
    notifyAfter: true,
    notifyExpiry: true,
  });

  const reloaded = await loadProfileData(client, session.user.id, session.role);
  assert.equal(reloaded.fullName, "طالبة بعد التعديل");
  assert.equal(reloaded.phone, "0551234567");
  assert.equal(reloaded.studentStage, "الثانوية");
  assert.deepEqual(
    [reloaded.notifyBefore, reloaded.notifyAfter, reloaded.notifyExpiry],
    [false, true, true],
  );
});

test("isolated teacher session saves and reloads professional, availability, bank, subject, stage, and notification data", async () => {
  const session = createProfileTestSession("teacher");
  assert.equal(session.isAuthenticated, true);
  assert.equal(session.onboardingCompleted, true, "verification sessions skip the welcome screen");
  const client = new IsolatedProfileClient(emptyTeacherTables(session));
  const before = await loadProfileData(client, session.user.id, session.role);
  assert.equal(before.bio, "نبذة قديمة");
  assert.equal(before.availableFrom, "08:00");
  assert.equal(before.availableTo, "16:00");
  assert.equal(before.bankName, "بنك الاختبار");
  assert.equal(before.iban, "SA0000000000000000000000");
  assert.equal(before.accountHolder, "معلم الاختبار");
  assert.equal(before.selectedSubject, "subject-math");

  await saveProfileData(client, session.user.id, session.role, before.teacherProfileId, {
    ...before,
    fullName: "معلم بعد التعديل",
    phone: "0559876543",
    bio: "خبرة جديدة في التعليم عن بعد",
    yearsExperience: "9",
    nationality: "أردنية",
    availableFrom: "09:30",
    availableTo: "18:00",
    bankName: "بنك جديد",
    iban: "SA1111111111111111111111",
    accountHolder: "اسم صاحب الحساب الجديد",
    teachingStages: ["المتوسطة", "الثانوية"],
    selectedSubject: "subject-science",
    notifyBefore: false,
    notifyAfter: true,
    notifyExpiry: false,
  });

  const reloaded = await loadProfileData(client, session.user.id, session.role);
  assert.equal(reloaded.fullName, "معلم بعد التعديل");
  assert.equal(reloaded.phone, "0559876543");
  assert.equal(reloaded.bio, "خبرة جديدة في التعليم عن بعد");
  assert.equal(reloaded.yearsExperience, "9");
  assert.equal(reloaded.nationality, "أردنية");
  assert.equal(reloaded.availableFrom, "09:30");
  assert.equal(reloaded.availableTo, "18:00");
  assert.equal(reloaded.bankName, "بنك جديد");
  assert.equal(reloaded.iban, "SA1111111111111111111111");
  assert.equal(reloaded.accountHolder, "اسم صاحب الحساب الجديد");
  assert.deepEqual(reloaded.teachingStages, ["المتوسطة", "الثانوية"]);
  assert.equal(reloaded.selectedSubject, "subject-science");
  assert.deepEqual(
    [reloaded.notifyBefore, reloaded.notifyAfter, reloaded.notifyExpiry],
    [false, true, false],
  );
});

test("profile loading retries a transient Supabase HTTP/2 stream reset", async () => {
  let attempts = 0;
  const client = {
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() { return this; },
        eq() { return this; },
        async single() {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("fetch failed: okhttp3 StreamResetException: stream was reset: CANCEL");
          }
          return {
            data: {
              full_name: "طالبة استعيدت بياناتها",
              phone: "0500000000",
              teaching_stage: "الثانوية",
              notify_before_session: true,
              notify_after_session: true,
              notify_subscription_expiry: false,
            },
            error: null,
          };
        },
      };
    },
  };

  const data = await loadProfileData(client, "student-test", "student");
  assert.equal(attempts, 2);
  assert.equal(data.fullName, "طالبة استعيدت بياناتها");
  assert.equal(data.studentStage, "الثانوية");
});

test("certificate upload, secure open, reload, and deletion use isolated storage and rows", async () => {
  const session = createProfileTestSession("teacher");
  const files = new Map();
  const client = new IsolatedProfileClient(emptyTeacherTables(session), files);
  const bytes = new TextEncoder().encode("%PDF isolated certificate").buffer;
  const certificates = await uploadTeacherCertificate(
    client,
    session.user.id,
    "شهادة اختبار",
    "certificate.pdf",
    "application/pdf",
    bytes,
    12345,
  );

  assert.equal(certificates.length, 1);
  assert.equal(certificates[0].name, "شهادة اختبار");
  assert.equal(files.size, 1);
  const retriedCertificates = await uploadTeacherCertificate(
    client,
    session.user.id,
    "شهادة بعد إعادة المحاولة",
    "certificate.pdf",
    "application/pdf",
    bytes,
    12345,
  );
  assert.equal(retriedCertificates.length, 1, "retrying one operation must not add a duplicate certificate");
  assert.equal(retriedCertificates[0].name, "شهادة بعد إعادة المحاولة");
  assert.equal(files.size, 1);
  const persisted = await loadProfileData(client, session.user.id, session.role);
  assert.equal(persisted.certificates[0].file_name, "certificate.pdf");
  assert.equal(persisted.certificates[0].name, "شهادة بعد إعادة المحاولة");

  const openedUrls = [];
  const signedUrl = await getCertificateOpenUrl(client, persisted.certificates[0].file_url);
  openedUrls.push(signedUrl);
  assert.match(openedUrls[0], /^https:\/\/isolated-storage\.test\//);

  await deleteTeacherCertificate(client, String(persisted.certificates[0].id), persisted.certificates[0].file_url);
  await deleteTeacherCertificate(client, String(persisted.certificates[0].id), persisted.certificates[0].file_url);
  assert.equal(files.size, 0);
  const afterDelete = await loadProfileData(client, session.user.id, session.role);
  assert.deepEqual(afterDelete.certificates, []);
});

test("certificate upload retries a transient HTTP/2 reset without duplicating the certificate", async () => {
  const session = createProfileTestSession("teacher");
  const files = new Map();
  const backingClient = new IsolatedProfileClient(emptyTeacherTables(session), files);
  let attempts = 0;
  const client = {
    from: backingClient.from.bind(backingClient),
    storage: {
      from(bucket) {
        const storage = backingClient.storage.from(bucket);
        return {
          ...storage,
          async upload(...args) {
            attempts += 1;
            if (attempts === 1) {
              return {
                data: null,
                error: new Error("fetch failed: okhttp3 StreamResetException: stream was reset: CANCEL"),
              };
            }
            return storage.upload(...args);
          },
        };
      },
    },
  };

  const result = await uploadTeacherCertificate(
    client,
    session.user.id,
    "شهادة اتصال",
    "certificate.pdf",
    "application/pdf",
    new TextEncoder().encode("%PDF retry test").buffer,
    34567,
  );

  assert.equal(attempts, 2);
  assert.equal(result.length, 1);
  assert.equal(files.size, 1);
});

test("a missing certificate image can be restored only to its existing owner-scoped path", async () => {
  const session = createProfileTestSession("teacher");
  const path = `certificates/${session.user.id}/123.png`;
  const fileUrl = `https://storage-isolated.test/storage/v1/object/sign/support-files/${path}?token=expired`;
  const tables = emptyTeacherTables(session);
  tables.teacher_certificates.push({
    id: "certificate-to-restore",
    teacher_id: session.user.id,
    name: "شهادة اختبار",
    file_name: "certificate.png",
    file_url: fileUrl,
  });
  const files = new Map();
  const client = new IsolatedProfileClient(tables, files);

  await assert.rejects(getCertificateOpenUrl(client, fileUrl), /File not found in isolated storage/);
  await restoreMissingTeacherCertificateFile(
    client,
    session.user.id,
    fileUrl,
    "certificate.png",
    "image/png",
    new TextEncoder().encode("isolated image bytes").buffer,
  );

  assert.equal(files.has(path), true);
  assert.match(await getCertificateOpenUrl(client, fileUrl), /^https:\/\/isolated-storage\.test\//);
  await assert.rejects(
    restoreMissingTeacherCertificateFile(
      client,
      "another-teacher",
      fileUrl,
      "certificate.png",
      "image/png",
      new TextEncoder().encode("isolated image bytes").buffer,
    ),
    /cannot be restored to its saved storage path/i,
  );
  assert.equal(files.size, 1);
});

test("certificate opening retries a transient HTTP/2 storage reset", async () => {
  let attempts = 0;
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              data: null,
              error: new Error("fetch failed: okhttp3 StreamResetException: stream was reset: REFUSED_STREAM"),
            };
          }
          return {
            data: { signedUrl: "https://isolated-storage.test/signed/certificate.pdf" },
            error: null,
          };
        },
      }),
    },
  };

  const url = await getCertificateOpenUrl(client, "certificates/teacher-1/certificate.pdf");
  assert.equal(attempts, 2);
  assert.match(url, /signed\/certificate\.pdf$/);
});

test("certificate opening does not retry a permissions error", async () => {
  let attempts = 0;
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          attempts += 1;
          return { data: null, error: new Error("Object not found or access denied") };
        },
      }),
    },
  };

  await assert.rejects(
    getCertificateOpenUrl(client, "certificates/teacher-1/missing.pdf"),
    /Object not found or access denied/,
  );
  assert.equal(attempts, 1);
});

test("failed teacher data loads reject instead of returning blank fields that could overwrite saved details", async () => {
  const session = createProfileTestSession("teacher");
  const client = new IsolatedProfileClient(emptyTeacherTables(session));
  client.tables.teacher_profiles = [];
  await assert.rejects(
    loadProfileData(client, session.user.id, session.role),
    /No teacher_profiles fixture row/,
  );
});

test("missing teacher profile blocks all saves before changing personal profile data", async () => {
  const session = createProfileTestSession("teacher");
  const tables = emptyTeacherTables(session);
  const client = new IsolatedProfileClient(tables);
  const before = structuredClone(client.tables.profiles);
  const values = await loadProfileData(client, session.user.id, session.role);
  await assert.rejects(
    saveProfileData(client, session.user.id, session.role, null, values),
    /Teacher profile not found/,
  );
  assert.deepEqual(client.tables.profiles, before);
});

test("certificate metadata failure removes the uploaded object from isolated storage", async () => {
  const session = createProfileTestSession("teacher");
  const files = new Map();
  const client = new IsolatedProfileClient(emptyTeacherTables(session), files);
  client.failedInserts.add("teacher_certificates");

  await assert.rejects(
    uploadTeacherCertificate(
      client,
      session.user.id,
      "شهادة غير مكتملة",
      "certificate.pdf",
      "application/pdf",
      new TextEncoder().encode("%PDF").buffer,
      54321,
    ),
    /Rejected isolated teacher_certificates insert/,
  );
  assert.equal(files.size, 0);
  assert.deepEqual(client.tables.teacher_certificates, []);

  client.failedInserts.delete("teacher_certificates");
  const retried = await uploadTeacherCertificate(
    client,
    session.user.id,
    "شهادة بعد تعذر الحفظ",
    "certificate.pdf",
    "application/pdf",
    new TextEncoder().encode("%PDF").buffer,
    54321,
  );
  assert.equal(retried.length, 1);
  assert.equal(files.size, 1);
});