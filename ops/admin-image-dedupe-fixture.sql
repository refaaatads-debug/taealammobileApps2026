BEGIN;
CREATE TEMP TABLE fixture_outbox(event_key text,event_type text,payload jsonb);
CREATE TEMP TABLE fixture_tokens(user_id text,token text);
INSERT INTO fixture_tokens VALUES ('u','ExponentPushToken[test]');
CREATE TEMP TABLE fixture_posts(body jsonb);
CREATE FUNCTION pg_temp.fixture_token(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
CREATE FUNCTION pg_temp.fixture_post(url text,headers jsonb,body jsonb) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fixture_posts VALUES(body); RETURN 1; END $$;
CREATE TEMP TABLE fixture_notifications(id text,user_id text,title text,body text,type text,file_url text,link text);
CREATE OR REPLACE FUNCTION pg_temp.dispatch_fixture()
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
     AND EXISTS (SELECT 1 FROM pg_temp.fixture_outbox
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
    SELECT DISTINCT pg_temp.fixture_token(token) AS expo_token
    FROM pg_temp.fixture_tokens
    WHERE user_id = NEW.user_id::text
      AND pg_temp.fixture_token(token) IS NOT NULL
  LOOP
    PERFORM pg_temp.fixture_post(
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

CREATE TRIGGER trg_direct_expo_push_notification AFTER INSERT ON fixture_notifications FOR EACH ROW EXECUTE FUNCTION pg_temp.dispatch_fixture();
DO $$
DECLARE url text := 'https://ajyalalmaerifa.com/storage/v1/object/public/site-assets/notifications/x.JPG?x=1';
BEGIN
INSERT INTO fixture_outbox VALUES ('platform-notification:owned','platform_notification','{"recipientId":"u"}');
INSERT INTO fixture_notifications VALUES ('owned','u','title','body','admin_broadcast',url,'');
IF (SELECT count(*) FROM fixture_posts) != 0 THEN RAISE EXCEPTION 'owned image duplicated'; END IF;
INSERT INTO fixture_notifications VALUES ('fallback','u','title','body','admin_broadcast',url,'');
IF (SELECT count(*) FROM fixture_posts) != 1 THEN RAISE EXCEPTION 'missing outbox lost fallback'; END IF;
INSERT INTO fixture_outbox VALUES ('platform-notification:pdf','platform_notification','{"recipientId":"u"}');
INSERT INTO fixture_notifications VALUES ('pdf','u','title','body','admin_broadcast',replace(url,'.JPG','.pdf'),'');
IF (SELECT count(*) FROM fixture_posts) != 2 THEN RAISE EXCEPTION 'PDF behavior changed'; END IF;
INSERT INTO fixture_notifications VALUES ('booking','u','title','body','booking_request',url,'');
IF (SELECT count(*) FROM fixture_posts) != 3 THEN RAISE EXCEPTION 'booking behavior changed'; END IF;
INSERT INTO fixture_outbox VALUES ('platform-notification:wrong-recipient','platform_notification','{"recipientId":"other"}');
INSERT INTO fixture_notifications VALUES ('wrong-recipient','u','title','body','admin_broadcast',url,'');
IF (SELECT count(*) FROM fixture_posts) != 4 THEN RAISE EXCEPTION 'wrong outbox captured'; END IF;
RAISE NOTICE 'PASS: owned image deduped, absent outbox fallback, PDF unchanged, booking unchanged, wrong-recipient fallback';
END $$;
ROLLBACK;
