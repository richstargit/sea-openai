import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../components/studio/live-script/reconnect.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', code)(exported);
const { backoffMs, nextRetry, expiresAtMs, secretExpired, switchDecision, ROTATE_AFTER_MS, FORCE_AFTER_MS, MAX_ATTEMPTS, BACKOFF_MAX_MS } = exported;

test('the wait before a retry grows, stays between half and all of its ceiling, and never passes the maximum', () => {
  assert.equal(backoffMs(0, () => 1), 500);
  assert.equal(backoffMs(0, () => 0), 250);
  assert.equal(backoffMs(1, () => 1), 1000);
  assert.equal(backoffMs(3, () => 1), 4000);
  assert.equal(backoffMs(20, () => 1), BACKOFF_MAX_MS);
  assert.equal(backoffMs(20, () => 0), BACKOFF_MAX_MS / 2);
  let last = 0;
  for (let attempt = 0; attempt < 6; attempt++) { const wait = backoffMs(attempt, () => 0.5); assert.ok(wait >= last); last = wait; }
});

test('after enough failed tries it gives up, and not before', () => {
  assert.equal(nextRetry(MAX_ATTEMPTS - 1, () => 1).giveUp, false);
  assert.equal(nextRetry(MAX_ATTEMPTS, () => 1).giveUp, true);
  assert.ok(nextRetry(0, () => 1).delayMs > 0);
});

test('an expiry time is understood in seconds, milliseconds or as a date', () => {
  assert.equal(expiresAtMs(1_800_000_000), 1_800_000_000_000);
  assert.equal(expiresAtMs(1_800_000_000_000), 1_800_000_000_000);
  assert.equal(expiresAtMs('1800000000'), 1_800_000_000_000);
  assert.equal(expiresAtMs('2026-11-21T10:00:00Z'), Date.parse('2026-11-21T10:00:00Z'));
  assert.equal(expiresAtMs('soon'), null);
  assert.equal(expiresAtMs(NaN), null);
});

test('a secret counts as expired a little before it really is', () => {
  const at = Date.parse('2026-11-21T10:00:00Z');
  assert.equal(secretExpired('2026-11-21T10:00:00Z', at - 60_000), false);
  assert.equal(secretExpired('2026-11-21T10:00:00Z', at - 10_000), true, 'inside the 30 second margin');
  assert.equal(secretExpired('2026-11-21T10:00:00Z', at + 1), true);
  assert.equal(secretExpired('unknown', at), false, 'an expiry that cannot be read does not force a new secret');
});

test('the socket is replaced only after 55 minutes, only between utterances, and always before the hard limit', () => {
  const opened = 1_000_000;
  const at = (ms) => opened + ms;
  const idle = { speaking: false, awaiting: 0 };
  assert.equal(switchDecision({ openedAt: opened, now: at(ROTATE_AFTER_MS - 1), ...idle }), 'none');
  assert.equal(switchDecision({ openedAt: opened, now: at(ROTATE_AFTER_MS), ...idle }), 'switch');
  assert.equal(switchDecision({ openedAt: opened, now: at(ROTATE_AFTER_MS + 1000), speaking: true, awaiting: 0 }), 'wait', 'never in the middle of speech');
  assert.equal(switchDecision({ openedAt: opened, now: at(ROTATE_AFTER_MS + 1000), speaking: false, awaiting: 2 }), 'wait', 'not while text is still coming back');
  assert.equal(switchDecision({ openedAt: opened, now: at(FORCE_AFTER_MS), speaking: true, awaiting: 3 }), 'switch', 'the hard limit wins');
});
