BEGIN;

ALTER TABLE public.push_delivery_outbox
  DROP CONSTRAINT IF EXISTS push_delivery_outbox_event_type_check;

ALTER TABLE public.push_delivery_outbox
  ADD CONSTRAINT push_delivery_outbox_event_type_check
  CHECK (event_type IN (
    'chat_message',
    'platform_notification',
    'incoming_call',
    'call_accepted',
    'call_ended',
    'session_reminder'
  ));

CREATE OR REPLACE FUNCTION public.queue_platform_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
BEGIN
  IF NEW.user_id IS NULL
    OR NULLIF(btrim(COALESCE(NEW.title, '')), '') IS NULL
    OR NULLIF(btrim(COALESCE(NEW.body, '')), '') IS NULL
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_mobile_push_event(
    'platform-notification:' || NEW.id::text,
    'platform_notification',
    jsonb_build_object(
      'notificationId', NEW.id::text,
      'recipientId', NEW.user_id::text
    )
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_platform_notification_push()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS push_platform_notification_insert ON public.notifications;
CREATE TRIGGER push_platform_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_platform_notification_push();

COMMIT;
