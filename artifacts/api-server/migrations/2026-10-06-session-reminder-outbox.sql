BEGIN;

ALTER TABLE public.push_delivery_outbox
  DROP CONSTRAINT IF EXISTS push_delivery_outbox_event_type_check;

ALTER TABLE public.push_delivery_outbox
  ADD CONSTRAINT push_delivery_outbox_event_type_check
  CHECK (event_type IN (
    'chat_message',
    'incoming_call',
    'call_accepted',
    'call_ended',
    'session_reminder'
  ));

COMMIT;
