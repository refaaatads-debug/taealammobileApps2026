import assert from 'node:assert/strict';
import test from 'node:test';
import { livePromotedIds, promotedFirst } from '../teacherPromotionsCore.ts';

test('promoted teachers come first in promotion order', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(promotedFirst(list, (x) => x.id, ['c', 'a']).map((x) => x.id), ['c', 'a', 'b', 'd']);
  assert.equal(promotedFirst(list, (x) => x.id, []), list);
  assert.deepEqual(promotedFirst(list, (x) => x.id, ['zzz', 'd']).map((x) => x.id), ['d', 'a', 'b', 'c']);
});

test('expired and future promotions are ignored', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const rows = [
    { teacher_id: 'live', starts_at: '2026-11-01T00:00:00Z', ends_at: null },
    { teacher_id: 'ends-later', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' },
    { teacher_id: 'expired', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-10T00:00:00Z' },
    { teacher_id: 'future', starts_at: '2026-12-01T00:00:00Z', ends_at: null },
  ];
  assert.deepEqual(livePromotedIds(rows, now), ['live', 'ends-later']);
});
