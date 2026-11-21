import assert from "node:assert/strict";
import test from "node:test";
import { filterClearedWhiteboardActions, sampleWhiteboardPath, whiteboardActionSignature } from "../sessionWhiteboardState.ts";

test("whiteboard snapshots do not restore actions from before a clear", () => {
  const studentAction = {
    type: "path",
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    color: "#178F74",
    coordinateSpace: "virtual",
  };
  const teacherAction = {
    type: "path",
    points: [{ x: 100, y: 120 }, { x: 130, y: 140 }],
    color: "#123456",
    coordinateSpace: "virtual",
  };
  const clearedSignatures = new Set([
    whiteboardActionSignature(studentAction),
    whiteboardActionSignature(teacherAction),
  ]);

  assert.deepEqual(
    filterClearedWhiteboardActions([studentAction, teacherAction], clearedSignatures),
    [],
  );
});

test("new whiteboard actions remain visible after a prior clear", () => {
  const oldAction = { type: "path", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
  const newAction = { type: "path", points: [{ x: 5, y: 6 }, { x: 7, y: 8 }] };
  const clearedSignatures = new Set([whiteboardActionSignature(oldAction)]);

  assert.deepEqual(
    filterClearedWhiteboardActions([oldAction, newAction], clearedSignatures),
    [newAction],
  );
});

test("whiteboard paths keep endpoints while sampling intermediate points every 120ms", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 4 },
  ];

  assert.deepEqual(
    sampleWhiteboardPath(points, [0, 40, 120, 180, 260]),
    [points[0], points[2], points[4]],
  );
});
