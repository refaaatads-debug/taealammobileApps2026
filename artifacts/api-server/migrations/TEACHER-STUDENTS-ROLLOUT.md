# Teacher student list: staged server update

These files are prepared in the **mobile application repository only**.
They have **not** been applied to the live platform or VPS.

## Required order when server deployment is authorized

1. Back up the platform database and current API release.
2. Apply `2026-10-28-teacher-in-person-students.sql` to the platform Supabase
   database as its migration owner. It creates a read-only, teacher-scoped RPC;
   it does not grant table reads or touch balances, ledgers or financial rows.
3. Confirm PostgREST reloads and the authenticated teacher can call
   `get_my_teacher_in_person_students`.
4. Build and deploy the updated API from this repository, preserving the VPS
   environment configuration. The `/api/students` endpoint requires the new RPC.
   Deploying API without the SQL must return an error, not a false empty list.
5. Test a teacher with online and in-person requests and a second teacher with
   unrelated students. Confirm names appear once and accounts remain isolated.
   Verify student and anonymous callers cannot execute the teacher RPC.

Existing online request visibility follows the incoming-request endpoint and
Supabase RLS. In-person membership is based on this teacher's pending, unexpired
requests or accepted recipients; cancelled/expired requests do not add new links.
Existing bookings and assignments remain sources of student membership.

## Local verification

Run the SQL test only in a fresh, isolated PostgreSQL database:

```sh
psql -v ON_ERROR_STOP=1 -f artifacts/api-server/migrations/tests/teacher-in-person-students.sql
```

This test creates a minimal synthetic schema inside a transaction and rolls it
back. It is not a full production-schema clone or a signed-in production test.
The JavaScript tests are:

```sh
cd artifacts/api-server
node --import tsx --test src/lib/__tests__/teacherStudentDirectory.test.mjs
```

The mobile app uses the external production API even in Preview. A GitHub-only
push does not activate the server-side student-list fix. No app-store release,
EAS update, VPS deployment or database operation is triggered by these files.
