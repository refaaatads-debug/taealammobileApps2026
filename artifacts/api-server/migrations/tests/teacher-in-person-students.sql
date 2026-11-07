\set ON_ERROR_STOP on
-- Synthetic, isolated PostgreSQL smoke test; never run against production.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');
CREATE TABLE public.test_roles(user_id uuid, role public.app_role);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION public.is_in_person_test_user() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('test.in_person_pilot', true), 'true') = 'true' $$;
CREATE FUNCTION public.has_role(p_user uuid, p_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS(SELECT 1 FROM test_roles WHERE user_id = p_user AND role = p_role) $$;
CREATE TABLE public.in_person_request_groups(
  id uuid PRIMARY KEY, student_id uuid, status text, acceptance_deadline timestamptz
);
CREATE TABLE public.in_person_request_recipients(
  request_group_id uuid, teacher_id uuid, status text
);
CREATE TABLE public.public_profiles(user_id uuid, full_name text, avatar_url text);

\ir ../2026-10-28-teacher-in-person-students.sql

INSERT INTO public.test_roles VALUES
  ('00000000-0000-0000-0000-000000000101', 'teacher'),
  ('00000000-0000-0000-0000-000000000102', 'teacher'),
  ('00000000-0000-0000-0000-000000000201', 'student');
INSERT INTO public.public_profiles VALUES
  ('00000000-0000-0000-0000-000000000201', 'طالب أول', NULL),
  ('00000000-0000-0000-0000-000000000202', 'طالب ثان', NULL);
INSERT INTO public.in_person_request_groups VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'open', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', 'accepted', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000202', 'open', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000202', 'open', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000202', 'cancelled', now() + interval '1 day');
INSERT INTO public.in_person_request_recipients VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'pending'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000101', 'accepted'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000102', 'pending'),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000101', 'pending'),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000101', 'pending');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_my_teacher_in_person_students()) <> 1
    OR (SELECT student_id FROM public.get_my_teacher_in_person_students())
      <> '00000000-0000-0000-0000-000000000201'::uuid THEN
    RAISE EXCEPTION 'Teacher one scope, expired/cancelled filter or deduplication failed';
  END IF;
  IF has_table_privilege(current_user, 'public.in_person_request_groups', 'SELECT')
    OR has_table_privilege(current_user, 'public.in_person_request_recipients', 'SELECT') THEN
    RAISE EXCEPTION 'RPC must not grant direct table access';
  END IF;
END $$;
SET test.in_person_pilot = 'false';
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.get_my_teacher_in_person_students()) THEN
    RAISE EXCEPTION 'Non-pilot teacher must not gain in-person identities';
  END IF;
END $$;
SET test.in_person_pilot = 'true';
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000102';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.get_my_teacher_in_person_students()) <> 1
    OR (SELECT student_id FROM public.get_my_teacher_in_person_students())
      <> '00000000-0000-0000-0000-000000000202'::uuid THEN
    RAISE EXCEPTION 'Teacher two can see another teacher student';
  END IF;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000201';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_my_teacher_in_person_students();
    RAISE EXCEPTION 'Student must be rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET request.jwt.claim.sub = '';
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_my_teacher_in_person_students();
    RAISE EXCEPTION 'Missing identity must be rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_my_teacher_in_person_students();
    RAISE EXCEPTION 'Anonymous execution must be rejected';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: teacher identity, recipient ownership, deduplication and ACL checks'
