import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteTeacherCertificate,
  getCertificateOpenUrl,
  loadProfileData,
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