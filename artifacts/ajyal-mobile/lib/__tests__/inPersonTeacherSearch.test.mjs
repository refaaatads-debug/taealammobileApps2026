import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isCurrentInPersonTeacherSearch } from "../inPersonTeacherSearch.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inPersonSource = readFileSync(path.join(projectRoot, "app/in-person.tsx"), "utf8");
const teacherResultsSheetSource = readFileSync(path.join(projectRoot, "components/InPersonTeacherResultsSheet.tsx"), "utf8");

test("a result from an older teacher search cannot replace newer criteria results", () => {
  assert.equal(isCurrentInPersonTeacherSearch(3, 3), true);
  assert.equal(isCurrentInPersonTeacherSearch(3, 4), false);
});

test("changing any booking search criterion clears results and cancels an in-flight search", () => {
  const invalidation = inPersonSource.match(/const invalidateTeacherSearch = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(invalidation, "the screen should centralize search invalidation");
  assert.match(invalidation, /searchRequestIdRef\.current \+= 1/);
  assert.match(invalidation, /searchInFlightRef\.current = false/);
  assert.match(invalidation, /setTeachers\(\[\]\)/);
  assert.match(invalidation, /setSelectedTeachers\(\[\]\)/);
  assert.match(invalidation, /setSearchPerformed\(false\)/);
  assert.match(invalidation, /setTeacherResultsVisible\(false\)/);

  const calls = inPersonSource.match(/invalidateTeacherSearch\(\)/g) ?? [];
  assert.ok(calls.length >= 6, "city, address, stage, subject, date, and time changes should invalidate results");
});

test("the mobile call sends the same subject, stage, location, and time inputs as the platform", () => {
  assert.match(
    inPersonSource,
    /p_city_id: cityId,\s*p_subject_id: subjectId,\s*p_address_id: addressId,\s*p_scheduled_at: date\.toISOString\(\),\s*p_teaching_stage: teachingStage/,
  );
});

test("RPC failures are shown and stale success or failure responses are ignored", () => {
  assert.match(inPersonSource, /try \{\s*const result = await supabase\.rpc\("search_in_person_teachers"/);
  assert.match(inPersonSource, /isCurrentInPersonTeacherSearch\(searchRequestId, searchRequestIdRef\.current\)/);
  assert.match(inPersonSource, /setError\(errorText\(cause, t\("تعذر البحث عن المعلمين\."/);
});

test("teacher results open in a selectable sheet and preserve the existing group-request flow", () => {
  assert.match(inPersonSource, /<InPersonTeacherResultsSheet/);
  assert.match(inPersonSource, /setTeacherResultsVisible\(true\)/);
  assert.match(inPersonSource, /onToggleTeacher=\{\(teacherId\) => setSelectedTeachers/);
  assert.match(inPersonSource, /p_teacher_ids: selectedTeachers/);
  assert.match(teacherResultsSheetSource, /<Modal visible=\{visible\} transparent animationType="slide"/);
  assert.match(teacherResultsSheetSource, /selectedTeacherIds\.includes\(teacher\.teacher_id\)/);
  assert.match(teacherResultsSheetSource, /disabled=\{!selectedCount \|\| sending \|\| searching\}/);
  assert.match(teacherResultsSheetSource, /onPress=\{onSearchAgain\}/);
  assert.doesNotMatch(inPersonSource, /teachers\.map\(\(teacher\)/);
});
