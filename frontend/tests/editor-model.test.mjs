import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const code = ts.transpileModule(fs.readFileSync(new URL('../lib/editor/model.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', code)(exported);
const { newClip, newProject, editProject, framesOf, totalFrames, locate, commit, undo, redo } = exported;
function fixture(speed = 1) {
  const asset = { id: 'source', name: 'source.mp4', kind: 'video', frames: 600, width: 1920, height: 1080 };
  const clip = { ...newClip(asset), sourceIn: 30, sourceOut: 330, speed };
  return { ...newProject(), clips: [clip, { ...newClip(asset), id: 'next' }] };
}
test('a split preserves the full sequence duration and continuous source content at every supported speed', () => {
  for (const speed of [0.25, 0.5, 0.75, 1, 1.5, 2, 4]) {
    const before = fixture(speed), cut = 11;
    const after = editProject(before, { type: 'split', id: before.clips[0].id, offset: cut, newId: 'right' });
    assert.equal(totalFrames(after), totalFrames(before));
    assert.equal(framesOf(after.clips[0]), cut);
    assert.equal(after.clips[0].sourceOut, after.clips[1].sourceIn);
    assert.equal(after.clips[1].sourceIn, before.clips[0].sourceIn + cut * speed);
    assert.equal(before.clips.length, 2, 'original stays untouched');
  }
});
test('boundary splits are no-ops and never create empty clips', () => {
  const p = fixture();
  for (const offset of [0, -1, framesOf(p.clips[0])]) assert.equal(editProject(p, { type: 'split', id: p.clips[0].id, offset, newId: 'right' }), p);
});
test('trims respect media handles and keep at least one timeline frame', () => {
  const p = fixture(2), id = p.clips[0].id;
  const head = editProject(p, { type: 'trim', id, edge: 'in', frame: 9999, maxFrames: 600 });
  assert.ok(framesOf(head.clips[0]) >= 1);
  assert.ok(head.clips[0].sourceIn < head.clips[0].sourceOut);
  const tail = editProject(p, { type: 'trim', id, edge: 'out', frame: 9999, maxFrames: 600 });
  assert.equal(tail.clips[0].sourceOut, 600);
  const early = editProject(p, { type: 'trim', id, edge: 'in', frame: -100, maxFrames: 600 });
  assert.equal(early.clips[0].sourceIn, 0);
});
test('ripple deletion closes the gap and keeps the next clip source intact', () => {
  const p = fixture(), next = p.clips[1];
  const after = editProject(p, { type: 'delete', id: p.clips[0].id });
  assert.equal(totalFrames(after), framesOf(next));
  assert.equal(locate(after, 0).clip.id, next.id);
  assert.equal(locate(after, 0).clip.sourceIn, next.sourceIn);
});
test('a continuous gesture is one undo step, redo restores it, and a new edit clears redo', () => {
  const p = fixture(); let h = { past: [], present: p, future: [] };
  for (const volume of [0.7, 0.4, 0.1]) h = commit(h, editProject(h.present, { type: 'update', id: p.clips[0].id, patch: { volume } }), 'fader-gesture');
  assert.equal(h.past.length, 1);
  const restored = undo(h); assert.equal(restored.present.clips[0].volume, 1);
  assert.equal(redo(restored).present.clips[0].volume, 0.1);
  const branched = commit(restored, editProject(restored.present, { type: 'delete', id: p.clips[0].id }));
  assert.equal(branched.future.length, 0);
});
test('reorder and duplicate preserve media references without changing the source', () => {
  const p = fixture();
  const dup = editProject(p, { type: 'duplicate', id: p.clips[0].id, newId: 'copy' });
  const moved = editProject(dup, { type: 'move', id: 'copy', index: 2 });
  assert.equal(moved.clips[2].id, 'copy');
  assert.equal(moved.clips[2].assetId, p.clips[0].assetId);
  assert.equal(moved.clips[2].sourceIn, p.clips[0].sourceIn);
  assert.equal(p.clips.length, 2);
});
