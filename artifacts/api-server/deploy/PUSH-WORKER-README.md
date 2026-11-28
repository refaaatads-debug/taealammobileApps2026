# Separate push worker (proposal, nothing installed)

Today the push worker runs inside `ajyal-api.service`. This adds an optional separate process.

Switch on (needs approval, each step):
1. Build the API (`dist/worker.mjs` is produced next to `dist/index.mjs`).
2. Copy `ajyal-push-worker.service` to `/etc/systemd/system/`, confirm the EnvironmentFile line matches the API unit.
3. Add `PUSH_OUTBOX_WORKER=external` to the API's environment and restart the API (short blip), then `systemctl enable --now ajyal-push-worker`.
   Order matters: start the worker right after the API restart so pushes are not delayed. Pending events wait safely in `push_delivery_outbox`.

Roll back: `systemctl disable --now ajyal-push-worker`, remove `PUSH_OUTBOX_WORKER`, restart the API. Behavior returns to today's.

Expected cost: no money. RAM about 100-150 MB (estimate, not measured), capped at 256 MB by the unit.
