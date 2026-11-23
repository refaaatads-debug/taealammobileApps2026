# Live voice, isolated candidate

Status 2026-11-23: NOT ready for production, APK or OTA. No production route imports this component. Server and app config are unchanged. The false compile-time gate in LiveVoiceTutorPreview is deliberate.

## Implemented
- Genuine new feature/live-voice branch from replit-dev, separate from receipts.
- Interactive HTML UX simulation in this folder. It requests no microphone/backend. Optional speech is browser TTS only.
- Candidate native component using pinned @elevenlabs/react-native 1.2.42, LiveKit2.12.0/WebRTC144.1.2, plugin1.1.0. Plugin1.2.0 requires different LiveKit peers and was rejected.
- Partial/final transcript reducer, interruption stale-turn filtering and correction, bounded200-turn UI, reset; three unit tests.
- Cleanup hooks for app background/unmount, token-return generation check, mute/end UI, no raw provider secrets, no automatic legacy fallback/session.
- Typecheck: same3 baseline errors, no added diagnostics. This is not a green full typecheck or device verification.

## Required before enabling
1. Additive server transport switch, default signedUrl unchanged for web; body.transport=webrtc yields conversationToken from server-side ElevenLabs token request. Keep premium/minute/auth/rate checks and key fallback. No live deployment yet.
2. Verify minute accounting on the live backend. Current token function checks positive prepaid balance, but repo token/web client do not prove deductions or a session duration limit. Do not silently add a billing design or claim accounting parity.
3. Inspect configured agent read-only, including client_events agent_chat_response_part, agent_response_correction, user_transcript, interruption; voice streaming parts are opt-in. Blocking guardrails can withhold partial text. No agent change yet because web shares it. Clone/version separately if provider supports it and authority permits.
4. Add Expo plugins and ensure camera remains excluded. Vendor WebRTC config plugin unconditionally adds iOS camera description; an audio-only post-plugin may be needed. No camera feature or request should be added.
5. Dedicated new app version/runtime and nonproduction preview build/channel before any import/route activation. Do not OTA this native change onto runtime1.0.1.
6. Resolve remaining peer warnings (some baseline), review lockfile peer-suffix churn, run Expo config/prebuild/manifest checks and typecheck. No APK build or native render performed.
7. Device acceptance: real overlapping text/audio, Arabic, VAD interruption including after final transcript arrived, replay/corrections/order/duplicates, microphone deny/expiry/403, leave/background/start/end races, headphones/Bluetooth, Agora audio exclusivity, network failure and minutes. Bound token/start waits. Confirm native SDK audio stop on errors. Do not advertise simulation as proof.
8. Production release gate, parent GO and rollback to stable APK/feature off. No Play without user approval.

## Sources inspected
- https://elevenlabs.io/docs/eleven-agents/libraries/react-native
- https://elevenlabs.io/docs/eleven-agents/guides/integrations/expo-react-native
- https://elevenlabs.io/docs/eleven-agents/customization/events/client-events
- https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
- https://elevenlabs.io/docs/eleven-agents/libraries/react
- https://github.com/elevenlabs/packages/blob/f61e7282/packages/react-native/README.md (older API names differ)
- Actual npm1.2.42 package types and native setup inspected. Native only supports WebRTC, signedUrl rejected. onMessage is full response; onAgentChatResponsePart streams. Provider is ConversationProvider, not the older ElevenLabsProvider.

The UI simulation is intentionally not the native candidate. No speech latency benchmark has been measured. Earlier 2-3x estimates must not be repeated as results.
