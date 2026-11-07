-- PREPARED ONLY: apply to the platform's Supabase database before deploying
-- the API change. No financial rows or balances are read or modified.
CREATE OR REPLACE FUNCTION public.get_my_teacher_in_person_students()
RETURNS TABLE(student_id uuid, full_name text, avatar_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
BEGIN
  IF v_teacher_id IS NULL
     OR NOT public.has_role(v_teacher_id, 'teacher'::public.app_role) THEN
    RAISE EXCEPTION 'Teacher authentication is required' USING ERRCODE = '42501';
  END IF;

  -- Teachers outside the platform's in-person pilot still have their online
  -- directory; they must not gain access to restricted in-person identities.
  IF NOT public.is_in_person_test_user() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    request_group.student_id,
    profile.full_name::text,
    profile.avatar_url::text
  FROM public.in_person_request_recipients recipient
  JOIN public.in_person_request_groups request_group
    ON request_group.id = recipient.request_group_id
  LEFT JOIN public.public_profiles profile
    ON profile.user_id = request_group.student_id
  WHERE recipient.teacher_id = v_teacher_id
    AND (
      (recipient.status = 'pending'
        AND request_group.status = 'open'
        AND request_group.acceptance_deadline > now())
      OR
      (recipient.status = 'accepted' AND request_group.status = 'accepted')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_teacher_in_person_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_in_person_students() TO authenticated;
NOTIFY pgrst, 'reload schema';
