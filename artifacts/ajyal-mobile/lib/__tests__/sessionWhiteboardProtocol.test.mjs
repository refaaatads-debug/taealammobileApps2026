import assert from "node:assert/strict";
import test from "node:test";
import {
  readPlatformWhiteboardPermission,
  readPlatformWhiteboardVisibility,
  resolveWhiteboardStateVisibility,
} from "../sessionWhiteboardProtocol.ts";

test("reads the platform's whiteboard-toggle open field for both directions", () => {
  assert.equal(readPlatformWhiteboardVisibility({ type: "whiteboard-toggle", open: true }), true);
  assert.equal(readPlatformWhiteboardVisibility({ type: "whiteboard-toggle", open: false }), false);
});

test("reads the platform's whiteboard-permission allow field for grant and revoke", () => {
  assert.equal(readPlatformWhiteboardPermission({ type: "whiteboard-permission", allow: true }), true);
  assert.equal(readPlatformWhiteboardPermission({ type: "whiteboard-permission", allow: false }), false);
});

test("accepts the same platform fields inside an event payload envelope", () => {
  assert.equal(
    readPlatformWhiteboardVisibility({ event: "whiteboard-toggle", payload: { open: true } }),
    true,
  );
  assert.equal(
    readPlatformWhiteboardPermission({ kind: "whiteboard-permission", data: { allow: false } }),
    false,
  );
});

test("reads visibility and drawing permission from a full board-state response", () => {
  const response = {
    type: "whiteboard-state",
    actions: [{ type: "path", points: [{ x: 0, y: 0 }, { x: 1920, y: 1080 }] }],
    open: false,
    allow: true,
  };
  assert.equal(readPlatformWhiteboardVisibility(response), false);
  assert.equal(resolveWhiteboardStateVisibility(readPlatformWhiteboardVisibility(response)), false);
  assert.equal(resolveWhiteboardStateVisibility(null), true);
  assert.equal(readPlatformWhiteboardPermission(response), true);
});

test("does not interpret unrelated session messages as board controls", () => {
  assert.equal(readPlatformWhiteboardVisibility({ type: "screen-share-status", active: true }), null);
  assert.equal(readPlatformWhiteboardPermission({ type: "whiteboard-action", points: [] }), null);
});
