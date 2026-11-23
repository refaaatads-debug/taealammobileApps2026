import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../components/SmartTeacherScreen.tsx', import.meta.url), 'utf8');
test('keyboard avoidance wraps the entire tutor screen, not only the panel', () => {
  assert.match(source, /<KeyboardAvoidingView style=\{styles.keyboardRoot\}[^>]*enabled=\{isTextChat\}>\s*<Screen/);
  assert.match(source, /<View style=\{\[styles.panel, isTextChat && styles.textPanel\]\}>/);
  assert.match(source, /keyboardRoot: \{ flex: 1, minHeight: 0 \}/);
});
test('typing hides large fixed chrome and restores it on keyboard hide', () => {
  assert.match(source, /keyboardDidShow.*setKeyboardVisible\(true\)/);
  assert.match(source, /keyboardDidHide.*setKeyboardVisible\(false\)/);
  assert.match(source, /show.remove\(\); hide.remove\(\)/);
  assert.match(source, /!\(isTextChat && keyboardVisible\).*styles.hero/);
  assert.match(source, /animateContent=\{!isTextChat\}/);
});
test('live voice stays off and text plus speech is not replaced', () => {
  assert.match(source, /const LIVE_VOICE_ENABLED = false/);
  assert.match(source, /invoke\("ai-tutor-chat"/);
  assert.match(source, /speak: true/);
  assert.match(source, /replayAssistantAnswer\(message\)/);
});
