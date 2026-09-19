---
name: Assignment review status parity
description: Assignment cards and submission review have separate state machines and must not derive teacher review from the assignment's active status.
---

Teacher assignment lists must derive review labels from submission statuses (`submitted`, `ai_graded`, `reviewed`), while the assignment's own lifecycle remains separate. Show a reviewed label only when the relevant submissions are reviewed; mixed submissions remain awaiting review.

**Why:** The platform stores the teacher's decision on `assignment_submissions`, so mapping the assignment's active status directly to the review state leaves a graded submission visually stuck in «قيد التقدم».

**How to apply:** When changing assignment cards, load submission status summaries for teacher-owned assignments, update them from Realtime and after grading, and keep the student's completion calculation independent.