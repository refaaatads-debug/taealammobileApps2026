import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const screenSource = readFileSync(path.join(projectRoot, "components/AjyalUI.tsx"), "utf8");
const profileSource = readFileSync(path.join(projectRoot, "app/(tabs)/profile.tsx"), "utf8");

test("the long student and teacher profile scroll avoids a full-page native animation layer", () => {
  assert.match(screenSource, /animateContent\?: boolean/);
  assert.match(screenSource, /animateContent \? <Reveal>\{children\}<\/Reveal> : children/);
  assert.match(profileSource, /<Screen animateContent=\{false\}>/);
});

test("profile account reads are keyed by user ID instead of the user object", () => {
  assert.match(profileSource, /const userId = user\?\.id;/);
  assert.match(profileSource, /\[profileClient, role, userId\]/);
});

test("in-person profile data is loaded only after its section is opened", () => {
  const inPersonSource = readFileSync(
    path.join(projectRoot, "components/ProfileInPersonSection.tsx"),
    "utf8",
  );
  assert.match(inPersonSource, /const \[expanded, setExpanded\] = useState\(false\);/);
  assert.match(inPersonSource, /if \(expanded && enabled && eligibilityChecked && !sectionDataLoaded && !loading && !loadAttempted\)/);
});
