export type Turn = { key: string; role: 'user' | 'agent'; text: string; complete: boolean; interrupted?: boolean; eventId: number };
export type Transcript = { turns: Turn[]; blocked: string[]; through: number };
export type TranscriptEvent =
 | { kind: 'part'; eventId: number; responseId?: string; type: 'start' | 'delta' | 'stop'; text: string }
 | { kind: 'message'; eventId: number; responseId?: string; role: 'user' | 'agent'; text: string }
 | { kind: 'correction'; eventId: number; responseId?: string; text: string }
 | { kind: 'interrupt'; eventId: number }
 | { kind: 'reset' };
export const emptyTranscript = (): Transcript => ({ turns: [], blocked: [], through: -1 });
export function reduceTranscript(state: Transcript, action: TranscriptEvent): Transcript {
 if (action.kind === 'reset') return emptyTranscript();
 if (action.kind === 'interrupt') {
  const active = state.turns.filter(t => t.role === 'agent' && !t.complete);
  return { turns: state.turns.map(t => active.includes(t) ? { ...t, complete: true, interrupted: true } : t), blocked: [...new Set([...state.blocked, ...active.map(t => t.key)])], through: Math.max(state.through, action.eventId) };
 }
 const role = action.kind === 'message' ? action.role : 'agent';
 const key = role + ':' + (action.responseId || String(action.eventId));
 const index = state.turns.findIndex(t => t.key === key || (action.kind === 'correction' && t.role === 'agent' && t.eventId === action.eventId));
 if (role === 'agent' && action.kind !== 'correction' && (state.blocked.includes(key) || action.eventId <= state.through)) return state;
 const existing = state.turns[index];
 if (action.kind === 'part' && existing?.complete) return state;
 if (action.kind === 'correction' && index < 0) return state;
 let text = action.text;
 if (action.kind === 'part') {
  if (action.type === 'start' && existing) return state;
  text = action.type === 'stop' ? (existing?.text || text) : (existing?.text || '') + text;
 }
 const turn: Turn = { key, role, text, eventId: action.eventId, complete: action.kind !== 'part' || action.type === 'stop', ...(existing?.interrupted ? { interrupted: true } : {}) };
 const turns = [...state.turns];
 if (index < 0) turns.push(turn); else turns[index] = turn;
 return { ...state, turns: turns.slice(-200) };
}
