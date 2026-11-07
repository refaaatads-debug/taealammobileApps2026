-- PREPARED ONLY — do not apply to Production without explicit review and approval.
-- Scope is limited to direct client writes on two tables. No rows are changed.

BEGIN;

-- Subscription rows are read by the app, but only the trusted Stripe webhook
-- (using service_role) should create or change subscription balances.
REVOKE INSERT, UPDATE ON TABLE public.user_subscriptions
  FROM PUBLIC, anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.user_subscriptions
  TO service_role;

-- Students submit work and read their own submissions. They must not edit or
-- delete an existing submission or set grading results/status themselves.
-- Teacher/admin policies and service-role grading remain unchanged.
DROP POLICY IF EXISTS "Students manage own submissions"
  ON public.assignment_submissions;

CREATE POLICY "Students read own assignment submissions"
  ON public.assignment_submissions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students submit ungraded own work"
  ON public.assignment_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'submitted'
    AND ai_score IS NULL
    AND ai_feedback IS NULL
    AND ai_breakdown IS NULL
    AND teacher_score IS NULL
    AND teacher_feedback IS NULL
    AND final_score IS NULL
    AND graded_at IS NULL
    AND reviewed_at IS NULL
  );

COMMIT;
