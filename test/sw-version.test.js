import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVersion, swVersion, FIX_HINT } from '../scripts/sw-version.mjs';

test('public/sw.js VERSION matches the content hash of public/', () => {
  assert.equal(swVersion(), computeVersion(), `public/sw.js VERSION is stale; ${FIX_HINT}`);
});
