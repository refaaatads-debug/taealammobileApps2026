import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layoutSource = readFileSync(path.join(projectRoot, "app/_layout.tsx"), "utf8");
const inPersonSource = readFileSync(path.join(projectRoot, "app/in-person.tsx"), "utf8");

test("the in-person route hides the technical route header and uses the localized screen title", () => {
  assert.match(layoutSource, /<Stack\.Screen name="in-person" options=\{\{ headerShown: false \}\} \/>/);
  assert.match(inPersonSource, /<Header title=\{t\("التدريس الحضوري", "In-person teaching"\)\}/);
});

test("the subject picker opens after a stage is selected and subjects have loaded", () => {
  assert.match(inPersonSource, /options=\{\[\.\.\.TEACHING_STAGES\]\}/);
  assert.match(inPersonSource, /setTeachingStage\(stage\); setSubjectId\(""\)/);
  assert.match(inPersonSource, /options=\{subjects\.map\(\(subject\) => subject\.name\)\}/);
  assert.match(inPersonSource, /disabled=\{!teachingStage \|\| loading \|\| !subjects\.length\}/);
});

test("teacher search applies both selected subject and teaching stage through the platform RPC", () => {
  assert.match(
    inPersonSource,
    /p_subject_id: subjectId,[\s\S]*?p_teaching_stage: teachingStage/,
  );
});
test("the student booking form shows a live review from the selected booking data", () => {
  assert.match(inPersonSource, /styles\.addressContext/);
  assert.match(inPersonSource, /selectedAddress\.is_primary/);
  assert.match(inPersonSource, /ملخص حصتك/);
  assert.match(inPersonSource, /selectedScheduleLabel/);
  assert.match(inPersonSource, /teachers\.length/);
  assert.match(inPersonSource, /selectedTeachers\.length/);
});

test("the student booking screen uses compact location, paired study fields, and a schedule card", () => {
  assert.match(inPersonSource, /studentIntroTitle/);
  assert.match(inPersonSource, /testID="in-person-edit-city"/);
  assert.match(inPersonSource, /testID="in-person-edit-address"/);
  assert.match(inPersonSource, /styles\.subjectSelectionRow/);
  assert.match(inPersonSource, /styles\.schedulePanel/);
  assert.match(inPersonSource, /getInPersonAppointmentTimes\(option\.key\)/);
  assert.match(inPersonSource, /dateOption: \{[^}]*flexBasis: "31%"/);
  assert.doesNotMatch(inPersonSource, /dateAvailabilityDot/);
  assert.match(inPersonSource, /testID="in-person-empty-schedule"/);
  assert.match(inPersonSource, /لا توجد حصص متاحة اليوم/);
});

test("the completed location step collapses while remaining editable", () => {
  assert.match(inPersonSource, /if \(!loading && role === "student" && locationReady\) setLocationExpanded\(false\)/);
  assert.match(inPersonSource, /\{locationExpanded \|\| !locationReady \?/);
  assert.match(inPersonSource, /accessibilityLabel=\{t\("تعديل مكان الحصة والعنوان"/);
  assert.match(inPersonSource, /onPress=\{\(\) => setLocationExpanded\(true\)\}/);
});
