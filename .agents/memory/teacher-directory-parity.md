---
name: Teacher directory parity
description: Verified rules from the published platform bundle for teacher, subject, stage, and availability display.
---

The published platform's read flow treats `public_teacher_profiles.is_approved = true` as the teacher-directory gate, joins `public_profiles` by `user_id`, and joins `teacher_subjects` to `subjects` by the teacher-profile id. Search matches teacher name or subject; subject and teaching-stage filters are applied to the joined data; the default order is descending rating, with an explicit price sort option. Teacher availability is read from `available_days`, `available_from`, and `available_to`; an empty availability set means the teacher has not published a schedule and must not be shown as available.

**Why:** The mobile app previously omitted subject joins and converted missing availability into generated days and hours, which could show teachers or slots that the platform would not show.

**How to apply:** When extending the mobile directory or booking preview, preserve these read-only joins and filters. Directory API paths must remain Supabase-Bearer/student-only with no local DB fallback. Do not infer availability or start booking work until authenticated parity is proven with the same account.

The legacy web booking page contains a direct-teacher fallback to fixed days/hours when Availability is empty, while the teacher directory treats empty Availability as unpublished. Treat the fallback as legacy UI behavior, not as an Availability contract to copy into Mobile/API.

**Why:** Copying the old fallback would make a teacher with no published schedule appear bookable and would contradict the directory/source parity rule.

**How to apply:** Preserve empty-Availability blocking in current Mobile/API work; classify the source fallback as a source inconsistency until the platform owner confirms it.

When consuming availability through PostgREST, accept native text-array values and serialized postgres-array/JSON representations, including comma-delimited strings, before matching day names; otherwise a published schedule can look empty only in the mobile client.

**Why:** The same read-only availability field can be serialized differently by a view/client boundary, while the platform still considers the schedule present.

**How to apply:** Normalize the transport representation without inventing days or hours, then apply the existing day and time bounds unchanged.

Booking stage comparisons must use the same canonical stage labels for the student's `teaching_stage`, the teacher's `teaching_stages`, and the directory response. Trim whitespace, remove invisible formatting marks, parse serialized arrays including comma-delimited PostgreSQL values, and map known Arabic/English aliases before comparing.

**Why:** Supabase/PostgREST can expose the same visible stage through different array/string encodings or legacy spellings, causing a valid teacher/student pair to be rejected by a literal comparison.

**How to apply:** Keep the canonicalization in the API boundary and reuse it for teacher-directory output and booking validation; do not bypass the eligibility check in the mobile client.