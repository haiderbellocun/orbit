import assert from "node:assert/strict";
import {
  isOrbitSessionActive,
  ORBIT_JWT_EXPIRES_IN,
  ORBIT_SESSION_TTL_SECONDS,
} from "./sessionPolicy";

const now = 1_800_000_000;

assert.equal(ORBIT_JWT_EXPIRES_IN, "2h");
assert.equal(ORBIT_SESSION_TTL_SECONDS, 7_200);
assert.equal(isOrbitSessionActive({ iat: now }, now), true);
assert.equal(isOrbitSessionActive({ iat: now - 7_199 }, now), true);
assert.equal(isOrbitSessionActive({ iat: now - 7_200 }, now), false);
assert.equal(isOrbitSessionActive({ iat: now + 61 }, now), false);
assert.equal(isOrbitSessionActive({}, now), false);

console.log("sessionPolicy tests passed");
