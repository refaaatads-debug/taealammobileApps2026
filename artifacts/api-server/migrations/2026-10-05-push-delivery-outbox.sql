CREATE TABLE IF NOT EXISTS public.push_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('chat_message', 'incoming_call', 'call_accepted', 'call_ended')),
  payload jsonb NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_delivery_outbox_ready_idx
  ON public.push_delivery_outbox (available_at, created_at)
  WHERE processed_at IS NULL AND failed_at IS NULL;

ALTER TABLE public.push_delivery_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_delivery_outbox FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_delivery_outbox TO supabase_admin, postgres;

CREATE OR REPLACE FUNCTION public.enqueue_mobile_push_event(
  p_event_key text,
  p_event_type text,
  p_payload jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
  INSERT INTO public.push_delivery_outbox (event_key, event_type, payload)
  VALUES (p_event_key, p_event_type, p_payload)
  ON CONFLICT (event_key) DO NOTHING;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_mobile_push_event(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_chat_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  v_student_id uuid;
  v_teacher_id uuid;
  v_recipient_id uuid;
  v_kind text;
BEGIN
  IF COALESCE(NEW.is_filtered, false) THEN
    RETURN NEW;
  END IF;

  SELECT b.student_id, b.teacher_id
    INTO v_student_id, v_teacher_id
  FROM public.bookings AS b
  WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id = v_student_id THEN
    v_recipient_id := v_teacher_id;
  ELSIF NEW.sender_id = v_teacher_id THEN
    v_recipient_id := v_student_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_kind := CASE
    WHEN NULLIF(btrim(COALESCE(NEW.file_type, '')), '') IS NULL THEN 'text'
    WHEN lower(NEW.file_type) = 'voice' OR lower(NEW.file_type) LIKE 'audio/%' THEN 'voice'
    ELSE 'file'
  END;

  PERFORM public.enqueue_mobile_push_event(
    'chat-message:' || NEW.id::text,
    'chat_message',
    jsonb_build_object(
      'messageId', NEW.id::text,
      'bookingId', NEW.booking_id::text,
      'senderId', NEW.sender_id::text,
      'recipientId', v_recipient_id::text,
      'kind', v_kind
    )
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_chat_message_push()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS push_chat_message_notification ON public.chat_messages;
CREATE TRIGGER push_chat_message_notification
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_chat_message_push();

CREATE OR REPLACE FUNCTION public.queue_internal_call_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
DECLARE
  v_old_status text;
  v_status text;
  v_recipient_id uuid;
BEGIN
  v_status := lower(COALESCE(NEW.status, ''));

  IF TG_OP = 'INSERT' THEN
    IF v_status = 'ringing' AND NEW.caller_id IS NOT NULL AND NEW.callee_id IS NOT NULL THEN
      PERFORM public.enqueue_mobile_push_event(
        'internal-call:' || NEW.id::text || ':incoming',
        'incoming_call',
        jsonb_build_object(
          'callId', NEW.id::text,
          'callerId', NEW.caller_id::text,
          'recipientId', NEW.callee_id::text,
          'bookingId', NEW.booking_id::text,
          'roomId', COALESCE(NEW.booking_id::text, 'call:' || NEW.id::text)
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  v_old_status := lower(COALESCE(OLD.status, ''));
  IF v_old_status = v_status THEN
    RETURN NEW;
  END IF;

  IF v_old_status = 'ringing'
    AND v_status IN ('connecting', 'connected', 'active')
    AND NEW.caller_id IS NOT NULL
  THEN
    PERFORM public.enqueue_mobile_push_event(
      'internal-call:' || NEW.id::text || ':accepted',
      'call_accepted',
      jsonb_build_object(
        'callId', NEW.id::text,
        'recipientId', NEW.caller_id::text
      )
    );
  END IF;

  IF v_status IN ('ended', 'cancelled', 'canceled', 'missed', 'rejected', 'declined', 'busy', 'failed', 'expired') THEN
    FOREACH v_recipient_id IN ARRAY ARRAY[NEW.caller_id, NEW.callee_id]
    LOOP
      IF v_recipient_id IS NOT NULL THEN
        PERFORM public.enqueue_mobile_push_event(
          'internal-call:' || NEW.id::text || ':ended:' || v_recipient_id::text,
          'call_ended',
          jsonb_build_object(
            'callId', NEW.id::text,
            'recipientId', v_recipient_id::text
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_internal_call_push()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS push_internal_call_insert_notification ON public.internal_calls;
CREATE TRIGGER push_internal_call_insert_notification
  AFTER INSERT ON public.internal_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_internal_call_push();

DROP TRIGGER IF EXISTS push_internal_call_status_notification ON public.internal_calls;
CREATE TRIGGER push_internal_call_status_notification
  AFTER UPDATE OF status ON public.internal_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_internal_call_push();
