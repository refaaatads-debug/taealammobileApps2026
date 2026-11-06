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
