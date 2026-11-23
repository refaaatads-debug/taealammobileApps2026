-- No historical rows changed. Apply after API resolver deployment.
CREATE OR REPLACE FUNCTION public.dispatch_expo_push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r_tok record;
  v_channel text := 'app-notifications-v2';
  v_sound text := 'default';
BEGIN
  -- Preserve all other direct push behavior. The earlier queue trigger owns this row.
  IF NEW.type = 'admin_broadcast'
     AND length(btrim(COALESCE(NEW.file_url, ''))) <= 4096
     AND btrim(COALESCE(NEW.file_url, '')) ~* '^https://ajyalalmaerifa[.]com/storage/v1/object/public/site-assets/notifications/[a-z0-9_.-]+[.](png|jpe?g|webp)([?][^#]*)?(#.*)?$'
     AND NULLIF(btrim(COALESCE(NEW.body, '')), '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.push_delivery_outbox
       WHERE event_key = 'platform-notification:' || NEW.id::text
         AND event_type = 'platform_notification'
         AND payload ->> 'recipientId' = NEW.user_id::text)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL OR NULLIF(btrim(COALESCE(NEW.title, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.type, '') ILIKE '%session%' OR COALESCE(NEW.type, '') ILIKE '%booking%' THEN
    v_channel := 'session-notifications-v2';
  ELSIF COALESCE(NEW.type, '') ILIKE '%approv%' THEN
    v_channel := 'approval-notifications-v2';
  END IF;

  FOR r_tok IN
    SELECT DISTINCT public.extract_expo_push_token(token) AS expo_token
    FROM public.push_tokens
    WHERE user_id = NEW.user_id::text
      AND public.extract_expo_push_token(token) IS NOT NULL
  LOOP
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', r_tok.expo_token,
        'title', NEW.title,
        'body', COALESCE(NEW.body, ''),
        'sound', v_sound,
        'priority', 'high',
        'channelId', v_channel,
        'data', jsonb_build_object(
          'notificationId', NEW.id::text,
          'type', COALESCE(NEW.type, 'notification'),
          'link', COALESCE(NEW.link, '')
        )
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;
