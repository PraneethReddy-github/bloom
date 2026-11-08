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
  assert.deepStrictEqual(kids(cfg.root), ['x', 'focus', 'bloom-tasks', 'bloom-studio'], 'backfills the live tree');
  assert.deepStrictEqual(kids(cfg.profiles.saved.Work.root), ['a', 'focus', 'bloom-tasks', 'bloom-studio'], 'backfills saved profiles too');
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

console.log('✓ config checks passed');

// ---- file conversion and tools (every engine is bundled, so this runs offline) ----
const converters = require('./converters');
const labels = m => m.flatMap(n => n.children ? labels(n.children) : [n.label]);
{
  assert.ok(['PNG', 'JPG', 'TXT', 'DOCX', 'Compress'].every(l => labels(converters.menuFor('application/pdf')).includes(l)), 'mime types resolve while dragging');
  assert.ok(!labels(converters.menuFor('photo.JPEG')).includes('JPG'), 'never offer a no-op conversion');
  assert.ok(labels(converters.menuFor('image/png')).includes('Remove BG'), 'images get background removal');
  assert.ok(labels(converters.menuFor('notes.md')).includes('DOCX'), 'text documents convert to docx');
  assert.deepStrictEqual(converters.menuFor('application/zip'), [], 'unknown types offer nothing');
}
(async () => {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloom-conv-'));
  const png = path.join(dir, 'a.png');
  const cv = createCanvas(80, 60); const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 60); g.fillStyle = '#e00'; g.fillRect(25, 15, 30, 30);
  fs.writeFileSync(png, cv.toBuffer('image/png'));
  const dims = async f => { const i = await loadImage(fs.readFileSync(f)); return [i.width, i.height]; };

  const jpg = await converters.convert(png, 'jpg');
  assert.strictEqual(path.basename(jpg), 'a.jpg');
  assert.strictEqual(fs.readFileSync(jpg).subarray(0, 2).toString('hex'), 'ffd8', 'real jpeg bytes');
  assert.strictEqual(path.basename(await converters.convert(png, 'jpg')), 'a (1).jpg', 'never overwrites');
  const pdf = await converters.convert(png, 'pdf');
  assert.strictEqual(fs.readFileSync(pdf).subarray(0, 4).toString(), '%PDF', 'image -> pdf');
  const page = await converters.convert(pdf, 'png');
  assert.ok((await dims(page))[0] > 0, 'pdf page rendered');
  assert.strictEqual(fs.readFileSync(await converters.convert(png, 'ico')).readUInt16LE(2), 1, 'ico header');
  await assert.rejects(() => converters.convert(png, 'mp3'), /cannot convert/);
  await assert.rejects(() => converters.run(png, 'rm', '-rf'), /cannot rm/, 'ops outside the menu are refused');

  assert.deepStrictEqual(await dims(await converters.run(png, 'crop', '1:1')), [60, 60], 'centre square crop');
  assert.deepStrictEqual(await dims(await converters.run(png, 'resize', 'scale:0.5')), [40, 30]);
  assert.deepStrictEqual(await dims(await converters.run(png, 'rotate', 'cw')), [60, 80]);
  const px = async f => { const i = await loadImage(fs.readFileSync(f)); const c = createCanvas(i.width, i.height).getContext('2d'); c.drawImage(i, 0, 0); return c.getImageData(0, 0, 1, 1).data; };
  const bw = await px(await converters.run(png, 'gray'));
  assert.ok(bw[0] === bw[1] && bw[1] === bw[2], 'black & white');

  // background removal: the model is real, so just check it ran and produced transparency info
  const nobg = await converters.run(png, 'bgremove');
  assert.strictEqual(path.basename(nobg), 'a-no-bg.png');
  assert.deepStrictEqual(await dims(nobg), [80, 60], 'background removal keeps the size');

  const md = path.join(dir, 'n.md');
  fs.writeFileSync(md, '# Title\n\nHello **world**\n\n- one\n- two\n');
  const docx = await converters.convert(md, 'docx');
  assert.strictEqual(fs.readFileSync(docx).subarray(0, 2).toString(), 'PK', 'docx is a zip');
  const back = (await require('mammoth').extractRawText({ path: docx })).value;
  assert.ok(back.includes('Title') && back.includes('Hello world') && back.includes('two'), 'docx round-trips its text');

  // ---- more formats, PDF tools, metadata, batches ----
  for (const [to, magic] of [['tiff', '4d4d'], ['bmp', '424d'], ['gif', '4749']]) {
    const f = await converters.convert(png, to);
    assert.strictEqual(fs.readFileSync(f).subarray(0, 2).toString('hex'), magic, `png -> ${to}`);
  }
  assert.deepStrictEqual(await dims(await converters.convert(path.join(dir, 'a.tiff'), 'png')), [80, 60], 'tiff decodes');
  const csv = path.join(dir, 'd.csv');
  fs.writeFileSync(csv, 'name,qty\n"Widget, large",3\n');
  const csvDocx = await converters.convert(csv, 'docx');
  assert.ok((await require('mammoth').extractRawText({ path: csvDocx })).value.includes('Widget, large'), 'csv keeps quoted commas');

  const two = path.join(dir, 'two.pdf');
  { const { PDFDocument } = require('pdf-lib'); const d = await PDFDocument.create(); d.addPage([200, 200]); d.addPage([200, 200]); fs.writeFileSync(two, await d.save()); }
  assert.strictEqual(fs.readdirSync(await converters.run(two, 'split')).length, 2, 'split makes one pdf per page');
  const merged = (await converters.runMany([two, two], 'merge'))[0];
  assert.strictEqual((await require('pdf-lib').PDFDocument.load(fs.readFileSync(merged))).getPageCount(), 4, 'merge adds the pages up');
  const combined = (await converters.runMany([png, png], 'combine'))[0];
  assert.strictEqual((await require('pdf-lib').PDFDocument.load(fs.readFileSync(combined))).getPageCount(), 2, 'images combine into one pdf');
  const locked = await converters.run(two, 'protect', undefined, { password: 'pw1' });
  await assert.rejects(() => converters.run(locked, 'rotate', 'cw'), undefined, 'a protected pdf is not readable without the password');
  assert.ok(fs.readFileSync(locked).includes('/Encrypt'), 'pdf is encrypted');
  await assert.rejects(() => converters.run(two, 'protect'), /no password/);
  assert.deepStrictEqual(converters.menuForMany(['a.png', 'b.jpg']).map(n => n.label).slice(0, 2), ['One PDF', 'JPG']);
  assert.deepStrictEqual(converters.menuForMany(['a.png', 'b.pdf']), [], 'mixed batches offer nothing');

  // page editor: reorder, drop, rotate, and pull pages from a second source
  const four = path.join(dir, 'four.pdf');
  { const { PDFDocument } = require('pdf-lib'); const d = await PDFDocument.create(); for (let i = 1; i <= 4; i++) d.addPage([100 * i, 100]); fs.writeFileSync(four, await d.save()); }
  assert.strictEqual(await converters.pdfPageCount(four), 4);
  const srcs = [{ path: four, kind: 'pdf', pages: 4 }, { path: png, kind: 'image', pages: 1 }];
  const built = await require('pdf-lib').PDFDocument.load(await converters.buildPdf([{ src: 0, idx: 3, rot: 0 }, { src: 0, idx: 0, rot: 90 }, { src: 1, idx: 0, rot: 0 }, { src: 0, idx: 0, rot: 0 }], srcs));
  assert.deepStrictEqual(built.getPages().map(p => p.getWidth()), [400, 100, 80, 100], 'pages come out in the chosen order, images become pages');
  assert.strictEqual(built.getPage(1).getRotation().angle, 90, 'a page keeps its extra turn');
  assert.ok((await converters.pageThumb(four, 'pdf', 2, 200)).subarray(0, 2).toString('hex') === 'ffd8', 'page thumbnails are JPEGs');
  await converters.releasePdf(four);

  const piexif = require('piexifjs');
  const withGps = path.join(dir, 'gps.jpg');
  fs.writeFileSync(withGps, Buffer.from(piexif.insert(piexif.dump({ GPS: { [piexif.GPSIFD.GPSLatitudeRef]: 'N', [piexif.GPSIFD.GPSLatitude]: [[12, 1], [58, 1], [0, 1]], [piexif.GPSIFD.GPSLongitudeRef]: 'E', [piexif.GPSIFD.GPSLongitude]: [[77, 1], [35, 1], [0, 1]] } }), jpg.length ? fs.readFileSync(jpg).toString('binary') : ''), 'binary'));
  assert.ok((await converters.imageMeta(withGps)).gps, 'gps is read');
  assert.strictEqual((await converters.imageMeta(await converters.run(withGps, 'strip-gps'))).gps, null, 'strip-gps removes the location');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log('✓ conversion checks passed');
})().catch(e => { console.error(e); process.exit(1); });
