import assert from "node:assert/strict";
import test from "node:test";
import { createInitialAuthBootstrapGate } from "../authBootstrap.ts";

function makeState() {
  let state = { user: null, isLoading: true };
  const gate = createInitialAuthBootstrapGate((user) => {
    state = { user, isLoading: false };
  });
  return {
    gate,
    getState: () => state,
  };
}

test("a null session query keeps loading until the delayed restored INITIAL_SESSION arrives", () => {
  const { gate, getState } = makeState();
  const restoredUser = {
    id: "student-1",
    email: "student@example.test",
    firstName: "طالبة",
    lastName: null,
    profileImageUrl: null,
  };

  gate.resolveFromSessionQuery(null, false);
  assert.deepEqual(getState(), { user: null, isLoading: true });

  gate.resolveFromInitialEvent(restoredUser);
  assert.deepEqual(getState(), { user: restoredUser, isLoading: false });
});

test("INITIAL_SESSION with no session resolves a genuinely signed-out state", () => {
  const { gate, getState } = makeState();

  gate.resolveFromSessionQuery(null, false);
  assert.deepEqual(getState(), { user: null, isLoading: true });

  gate.resolveFromInitialEvent(null);
  assert.deepEqual(getState(), { user: null, isLoading: false });
});

test("an empty INITIAL_SESSION waits for a delayed session query before showing sign-in", () => {
  const { gate, getState } = makeState();
  const restoredUser = {
    id: "restored-user",
    email: "student@example.test",
    firstName: "طالبة",
    lastName: null,
    profileImageUrl: null,
  };

  gate.resolveFromInitialEvent(null);
  assert.deepEqual(getState(), { user: null, isLoading: true });

  gate.resolveFromSessionQuery(restoredUser, false);
  assert.deepEqual(getState(), { user: restoredUser, isLoading: false });
});

test("a restored session query that finishes first is not cleared by an empty INITIAL_SESSION", () => {
  const { gate, getState } = makeState();
  const restoredUser = {
    id: "restored-user",
    email: null,
    firstName: "مستخدم مستعاد",
    lastName: null,
    profileImageUrl: null,
  };

  gate.resolveFromSessionQuery(restoredUser, false);
  gate.resolveFromInitialEvent(null);

  assert.deepEqual(getState(), { user: restoredUser, isLoading: false });
});

test("a stale session query cannot replace the state resolved by an auth event", () => {
  const { gate, getState } = makeState();
  const eventUser = {
    id: "restored-user",
    email: null,
    firstName: "مستخدم مستعاد",
    lastName: null,
    profileImageUrl: null,
  };

  gate.resolveFromInitialEvent(eventUser);
  gate.resolveFromSessionQuery({
    id: "stale-user",
    email: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
  }, true);

  assert.deepEqual(getState(), { user: eventUser, isLoading: false });
});