// Bloom config checks — run with `npm test`. Covers the parts that can silently
// corrupt someone's setup: the starter templates, and the one-time Focus/Tasks backfill.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-test-'));
process.env.XDG_CONFIG_HOME = sandbox;
delete process.env.APPDATA;                   // force the linux path even on win boxes
const store = require('./config');

const ids = root => { const out = []; (function w(n) { out.push(n.id); (n.children || []).forEach(w); })(root); return out; };
const kids = root => (root.children || []).map(n => n.id);

// ---- defaults ----
{
  const d = store.defaults();
  assert.ok(ids(d.root).includes('focus'), 'default tree has the Focus folder');
  assert.ok(ids(d.root).includes('bloom-tasks'), 'default tree has the Tasks node');
  assert.ok(d.root.children.length <= 12, 'root ring stays under the 12-item hard cap');
  for (const id of d.pinnedIds) {
    assert.ok(!id || ids(d.root).includes(id), `default references a real node: ${id}`);
  }
  assert.deepStrictEqual(d.tasks, [], 'tasks start empty');
  assert.strictEqual(d.focus.showRing, true);
  assert.ok(d.focus.sounds.focusEnd && d.focus.sounds.breakEnd, 'both phase sounds have a default');
  assert.ok(d.focus.sounds.volume > 0 && d.focus.sounds.volume <= 1, 'volume is a 0–1 fraction');
  // The Focus folder must not pin a colour, or it would fight the global accent.
  assert.strictEqual(d.root.children.find(n => n.id === 'focus').color, undefined, 'Focus folder has no colour override');
}

// ---- templates ----
{
  const list = store.templateList();
  assert.strictEqual(list.length, 4, 'four starter templates');
  assert.ok(list.some(t => t.key === 'default'), 'the stock setup is offered as a template');
  for (const t of list) {
    const b = store.buildTemplate(t.key);
    const all = ids(b.root);
    assert.strictEqual(new Set(all).size, all.length, `${t.key}: no duplicate node ids`);
    assert.ok(b.root.children.length <= 12, `${t.key}: root ring under the cap`);
    for (const id of b.pinnedIds) {
      assert.ok(!id || all.includes(id), `${t.key}: references a real node (${id})`);
    }
    assert.ok(all.includes('focus'), `${t.key}: ships the Focus folder`);
    assert.ok(all.includes('bloom-tasks'), `${t.key}: ships the Tasks node`);
    // The accent is one global setting — a profile must never carry a look of its own,
    // or switching profiles would repaint the app and "change it once" would be a lie.
    assert.strictEqual(b.appearance, undefined, `${t.key}: carries no appearance`);
    assert.strictEqual(t.accent, undefined, `${t.key}: advertises no accent`);
  }
  assert.strictEqual(store.buildTemplate('nope'), null, 'unknown key returns null');
}

// ---- one-time Focus/Tasks backfill ----
{
  const dir = path.join(sandbox, 'bloom');
  fs.mkdirSync(dir, { recursive: true });
  const legacy = {
    version: 1, seenOnboarding: true,
    profiles: { active: 'Work', saved: { Work: { root: { id: 'root', type: 'folder', label: 'Bloom', children: [{ id: 'a', type: 'launch_app', label: 'A', params: {} }] } } } },
    root: { id: 'root', type: 'folder', label: 'Bloom', children: [{ id: 'x', type: 'launch_app', label: 'X', params: {} }] }
  };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(legacy));

  const cfg = store.load();
  assert.deepStrictEqual(kids(cfg.root), ['x', 'focus', 'bloom-tasks'], 'backfills the live tree');
  assert.deepStrictEqual(kids(cfg.profiles.saved.Work.root), ['a', 'focus', 'bloom-tasks'], 'backfills saved profiles too');
  assert.strictEqual(cfg.focusMigrated, true);

  // A second run must not append them again — and must respect a user who deleted them.
  const reread = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.strictEqual(reread.focusMigrated, true, 'the flag is persisted, not just in memory');
  reread.root.children = reread.root.children.filter(n => n.id === 'x');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(reread));
  delete require.cache[require.resolve('./config')];
  const again = require('./config').load();
  assert.deepStrictEqual(kids(again.root), ['x'], 'a deleted Focus folder stays deleted');
}

// ---- merge semantics the task board relies on ----
{
  const m = store.merge({ tasks: [1, 2, 3], focus: { autoStartBreak: true, showRing: true } }, { tasks: [], focus: { autoStartBreak: false } });
  assert.deepStrictEqual(m.tasks, [], 'arrays replace wholesale, so deleting the last task sticks');
  assert.strictEqual(m.focus.showRing, true, 'objects merge, so a partial focus patch keeps the rest');
  assert.strictEqual(m.focus.autoStartBreak, false);
}

fs.rmSync(sandbox, { recursive: true, force: true });
console.log('✓ all config checks passed');
