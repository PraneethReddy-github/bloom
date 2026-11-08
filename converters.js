// Bloom file tools: every engine ships inside the app, so it all works offline.
//   images  -> @napi-rs/canvas (sharp's libvips aborts under Electron)   background removal -> onnxruntime + U²-Net-p
//   audio/video -> ffmpeg-static     pdf -> pdfjs + pdf-lib     docx -> mammoth / docx     md -> marked
// `printPdf(html)` is injected by main (it needs a hidden BrowserWindow); everything else is plain Node.
//
// menuFor(file) returns the tree the ring shows: [{ label, icon, op, arg } | { label, icon, children }].
// run(file, op, arg) performs one of those entries; anything not in the menu is refused.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const IMG = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'bmp', 'ico', 'heic', 'heif', 'tif', 'tiff'];
const AUD = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'wma'];
const VID = ['mp4', 'mkv', 'mov', 'webm', 'avi', 'flv', 'wmv', 'm4v'];
const DOC = ['docx', 'md', 'markdown', 'txt', 'csv', 'html', 'htm'];

// Chromium reports a mime type while a file is still being dragged (the path only arrives on drop).
const MIME_EXT = {
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'image/svg+xml': 'svg', 'image/jpeg': 'jpg', 'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heic',
  'image/tiff': 'tiff', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'text/csv': 'csv',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/opus': 'opus',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/x-matroska': 'mkv', 'video/quicktime': 'mov',
  'video/x-msvideo': 'avi'
};

const ICON = {
  png: 'image', jpg: 'image', webp: 'image', avif: 'image', gif: 'image', ico: 'star', tiff: 'image', bmp: 'image', pdf: 'file', docx: 'book',
  txt: 'text', html: 'code', mp3: 'music', wav: 'music', flac: 'music', ogg: 'music', m4a: 'music',
  mp4: 'video', webm: 'video', mkv: 'video'
};
const conv = to => ({ label: to.toUpperCase(), icon: ICON[to] || 'file', op: 'convert', arg: to, group: 'convert' });   // group: lets the file ring tuck formats under one petal
const tool = (label, icon, op, arg) => ({ label, icon, op, arg });
const folder = (label, icon, children) => ({ label, icon, children });

const STUDIO = [['crop', 'Crop…', 'scissors'], ['edit', 'Edit…', 'sliders'], ['bg', 'Add BG…', 'palette'], ['annotate', 'Annotate…', 'pencil'],
  ['redact', 'Redact…', 'shield'], ['resize', 'Resize…', 'trending-up'], ['compress', 'Compress…', 'package'], ['info', 'Info…', 'tag']];

const imageQuick = ext => folder('Quick', 'wrench', [
  folder('Crop', 'scissors', ['1:1', '4:3', '16:9', '9:16'].map(r => tool(r === '1:1' ? 'Square' : r, 'square', 'crop', r))),
  folder('Resize', 'trending-up', [
    tool('50%', 'trending-up', 'resize', 'scale:0.5'), tool('25%', 'trending-up', 'resize', 'scale:0.25'),
    tool('Max 1920', 'trending-up', 'resize', 'max:1920'), tool('Max 1080', 'trending-up', 'resize', 'max:1080'),
    tool('Max 512', 'trending-up', 'resize', 'max:512')]),
  tool('Rotate right', 'refresh', 'rotate', 'cw'), tool('Rotate left', 'refresh', 'rotate', 'ccw'),
  tool('Flip', 'repeat', 'flip', 'h'), tool('Black & white', 'moon', 'gray'),
  ...(ext === 'jpg' || ext === 'jpeg' ? [tool('Strip location', 'shield', 'strip-gps')] : []),
  tool('Strip metadata', 'shield', 'strip-meta')
]);

const KINDS = [
  // First-layer order: the tools people reach for most, then the formats.
  { kind: 'image', exts: IMG, menu: ext => {
    const self = t => t === ext || (ext === 'jpeg' && t === 'jpg') || (ext === 'tif' && t === 'tiff') || (ext === 'heif' && t === 'heic');
    return [folder('Studio', 'palette', STUDIO.map(([id, label, icon]) => tool(label, icon, 'studio', id))), imageQuick(ext),
      tool('Remove BG', 'wand', 'bgremove'), tool('Compress', 'package', 'compress'),
      ...['png', 'jpg', 'webp', 'avif', 'pdf'].filter(t => !self(t)).map(conv),
      { ...folder('More formats', 'layers', ['ico', 'tiff', 'bmp', 'gif'].filter(t => !self(t)).map(conv)), group: 'convert' }];
  } },
  { kind: 'pdf', exts: ['pdf'], menu: () => [tool('Studio', 'palette', 'studio', 'pdf'), tool('Compress', 'package', 'compress'),
    folder('Tools', 'wrench', [tool('Split pages', 'scissors', 'split'), tool('Rotate right', 'refresh', 'rotate', 'cw'),
      tool('Password…', 'lock', 'protect'), tool('Extract images', 'image', 'extract-images'), tool('Strip metadata', 'shield', 'strip-meta')]),
    ...['png', 'jpg', 'txt', 'docx'].map(conv)] },
  { kind: 'doc', exts: DOC, menu: ext => ['pdf', 'docx', 'html', 'txt'].filter(t => t !== ext && !(ext === 'htm' && t === 'html')).map(conv) },
  { kind: 'audio', exts: AUD, menu: ext => ['mp3', 'wav', 'flac', 'ogg', 'm4a'].filter(t => t !== ext).map(conv) },
  { kind: 'video', exts: VID, menu: ext => [tool('Compress', 'package', 'compress'),
    folder('Tools', 'wrench', [tool('720p', 'trending-up', 'resize', '720'), tool('Mute', 'volume-x', 'mute')]),
    ...['mp4', 'webm', 'mkv', 'gif', 'mp3'].filter(t => t !== ext).map(conv)] }
];

const extOf = p => path.extname(p || '').slice(1).toLowerCase();
function normExt(input) {
  const x = String(input || '').toLowerCase();
  return MIME_EXT[x] || (/[./\\]/.test(x) ? extOf(x) : x);
}
const kindOf = ext => KINDS.find(k => k.exts.includes(ext));

// Accepts an extension, a file path or a mime type. Returns [] for a type Bloom can't handle.
function menuFor(input) {
  const ext = normExt(input);
  const k = kindOf(ext);
  return k ? k.menu(ext) : [];
}
// Several files dropped together: only a uniform batch of images or PDFs makes sense.
function menuForMany(inputs) {
  const kinds = new Set(inputs.map(i => kindOf(normExt(i))?.kind));
  if (kinds.size !== 1) return [];
  if (kinds.has('image')) return [tool('One PDF', 'file', 'combine'), ...['jpg', 'png', 'webp'].map(conv), tool('Compress', 'package', 'compress')];
  if (kinds.has('pdf')) return [tool('Merge', 'layers', 'merge'), tool('Compress', 'package', 'compress')];
  return [];
}
const flatten = (nodes, out = []) => { for (const n of nodes) { if (n.children) flatten(n.children, out); else out.push(n); } return out; };

// Never overwrite: photo.png, photo (1).png, photo (2).png ...
function uniquePath(dir, base, ext) {
  const at = n => path.join(dir, base + (n ? ` (${n})` : '') + (ext ? '.' + ext : ''));
  let n = 0;
  while (fs.existsSync(at(n))) n++;
  return at(n);
}

// Runs ffmpeg into `out`; a failed run never leaves a half-written file behind.
function ffmpeg(args, out) {
  return new Promise((resolve, reject) => {
    // Packaged builds unpack the binary out of app.asar.
    const bin = require('ffmpeg-static').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    const p = spawn(bin, ['-y', '-hide_banner', '-loglevel', 'error', ...args, out]);
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) return resolve();
      fs.rmSync(out, { force: true });
      reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited ${code}`));
    });
  });
}

// ---- images ----
const canvasLib = () => require('@napi-rs/canvas');

// HEIC and TIFF aren't decoded by Skia, so they go through pure-JS decoders; everything else is native.
async function loadCanvas(src) {
  const { createCanvas, loadImage, ImageData } = canvasLib();
  const ext = extOf(src), buf = fs.readFileSync(src);
  let c;
  if (ext === 'heic' || ext === 'heif') {
    const img = await require('heic-decode')({ buffer: buf });
    c = createCanvas(img.width, img.height);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  } else if (ext === 'tif' || ext === 'tiff') {
    const UTIF = require('utif2'), ifd = UTIF.decode(buf)[0];
    UTIF.decodeImage(buf, ifd);
    c = createCanvas(ifd.width, ifd.height);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(ifd)), ifd.width, ifd.height), 0, 0);
  } else {
    const img = await loadImage(buf);
    const w = img.width || 512, h = img.height || 512;   // an svg without a size still needs a canvas
    c = createCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
  }
  return c;
}

function cropTo(c, ratio) {
  const { createCanvas } = canvasLib();
  const [rw, rh] = ratio.split(':').map(Number);
  let w = c.width, h = Math.round(w * rh / rw);
  if (h > c.height) { h = c.height; w = Math.round(h * rw / rh); }
  const out = createCanvas(w, h);
  out.getContext('2d').drawImage(c, Math.round((c.width - w) / 2), Math.round((c.height - h) / 2), w, h, 0, 0, w, h);
  return out;
}

function resizeTo(c, arg) {
  const { createCanvas } = canvasLib();
  const [mode, v] = arg.split(':'), n = Number(v);
  const f = mode === 'scale' ? n : Math.min(1, n / Math.max(c.width, c.height));   // 'max' never enlarges
  const w = Math.max(1, Math.round(c.width * f)), h = Math.max(1, Math.round(c.height * f));
  const out = createCanvas(w, h);
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, w, h);
  return out;
}

function rotateBy(c, dir) {
  const { createCanvas } = canvasLib();
  const out = createCanvas(c.height, c.width), g = out.getContext('2d');
  g.translate(out.width / 2, out.height / 2);
  g.rotate((dir === 'cw' ? 1 : -1) * Math.PI / 2);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return out;
}

function flipH(c) {
  const { createCanvas } = canvasLib();
  const out = createCanvas(c.width, c.height), g = out.getContext('2d');
  g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  return out;
}

function grayscale(c) {
  const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  g.putImageData(img, 0, 0);
  return c;
}

// U²-Net-p (Apache-2.0, 4.5 MB) via onnxruntime. rembg's recipe: 320px, scale by max, ImageNet mean/std,
// then the saliency map becomes the alpha channel.
// shortcut: the small model is soft on hair and fine edges, swap in rembg's isnet-general-use (1024px, mean 0.5) if that matters.
const BG_SIZE = 320;
let bgSession = null;
async function removeBackground(c) {
  const ort = require('onnxruntime-node');
  if (!bgSession) {
    const model = path.join(__dirname, 'models', 'bg', 'u2netp.onnx').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    bgSession = await ort.InferenceSession.create(model);
  }
  const { createCanvas } = canvasLib();
  const small = createCanvas(BG_SIZE, BG_SIZE), sg = small.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(c, 0, 0, BG_SIZE, BG_SIZE);
  const px = sg.getImageData(0, 0, BG_SIZE, BG_SIZE).data, N = BG_SIZE * BG_SIZE;
  let max = 1;
  for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i], px[i + 1], px[i + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225], input = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) input[k * N + i] = (px[i * 4 + k] / max - mean[k]) / std[k];
  const res = await bgSession.run({ [bgSession.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, BG_SIZE, BG_SIZE]) });
  const m = res[bgSession.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, m[i]); hi = Math.max(hi, m[i]); }
  const maskSmall = createCanvas(BG_SIZE, BG_SIZE), mg = maskSmall.getContext('2d'), mi = mg.createImageData(BG_SIZE, BG_SIZE);
  for (let i = 0; i < N; i++) mi.data[i * 4 + 3] = Math.round(255 * (m[i] - lo) / ((hi - lo) || 1));
  mg.putImageData(mi, 0, 0);
  const maskBig = createCanvas(c.width, c.height), bg = maskBig.getContext('2d');
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(maskSmall, 0, 0, c.width, c.height);
  const alpha = bg.getImageData(0, 0, c.width, c.height).data;
  const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] * alpha[i] / 255);
  g.putImageData(img, 0, 0);
  return c;
}

// Windows icons may hold PNGs directly, so an .ico is a small header around PNG frames.
function encodeIco(c) {
  const { createCanvas } = canvasLib();
  const frames = [256, 128, 64, 48, 32, 16].map(s => {
    const f = createCanvas(s, s), k = Math.min(s / c.width, s / c.height);
    const w = Math.round(c.width * k), h = Math.round(c.height * k);
    f.getContext('2d').drawImage(c, (s - w) / 2, (s - h) / 2, w, h);
    return { s, png: f.toBuffer('image/png') };
  });
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
  let offset = head.length;
  frames.forEach(({ s, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = head[e + 1] = s === 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...frames.map(f => f.png)]);
}

async function encodeImage(c, fmt, quality = 90) {
  const { createCanvas } = canvasLib();
  if (fmt === 'ico') return encodeIco(c);
  const px = () => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  if (fmt === 'tiff') return Buffer.from(require('utif2').encodeImage(px(), c.width, c.height));
  if (fmt === 'gif') {
    const { GIFEncoder, quantize, applyPalette } = require('gifenc'), d = px(), pal = quantize(d, 256, { format: 'rgba4444', oneBitAlpha: true });
    const gif = GIFEncoder();
    gif.writeFrame(applyPalette(d, pal, 'rgba4444'), c.width, c.height, { palette: pal, transparent: true, transparentIndex: pal.findIndex(p => p[3] === 0) });
    gif.finish();
    return Buffer.from(gif.bytes());
  }
  if (fmt === 'bmp') {   // 32-bit BGRA, bottom-up
    const d = px(), row = c.width * 4, head = Buffer.alloc(54), body = Buffer.alloc(row * c.height);
    head.write('BM'); head.writeUInt32LE(54 + body.length, 2); head.writeUInt32LE(54, 10); head.writeUInt32LE(40, 14);
    head.writeInt32LE(c.width, 18); head.writeInt32LE(c.height, 22); head.writeUInt16LE(1, 26); head.writeUInt16LE(32, 28); head.writeUInt32LE(body.length, 34);
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, o = (c.height - 1 - y) * row + x * 4;
      body[o] = d[i + 2]; body[o + 1] = d[i + 1]; body[o + 2] = d[i]; body[o + 3] = d[i + 3];
    }
    return Buffer.concat([head, body]);
  }
  if (fmt === 'jpg' || fmt === 'pdf') {   // no alpha in jpeg, and a pdf page should be white
    const flat = createCanvas(c.width, c.height), g = flat.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0);
    c = flat;
  }
  if (fmt === 'pdf') {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([c.width, c.height]);
    page.drawImage(await doc.embedPng(c.toBuffer('image/png')), { x: 0, y: 0, width: c.width, height: c.height });
    return Buffer.from(await doc.save());
  }
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' }[fmt];
  return c.toBuffer(mime, fmt === 'png' ? undefined : quality);
}

// Image tools keep the picture's own format where a canvas can write it; otherwise png.
const sameFormat = ext => ['png', 'jpg', 'webp', 'avif'].includes(ext) ? ext : ext === 'jpeg' ? 'jpg' : 'png';

async function imageJob(src, op, arg, dir, base, ext, opts) {
  if (op === 'strip-gps') return stripGps(src, dir, base);
  let c = await loadCanvas(src), fmt = sameFormat(ext), tag = null, quality = opts.quality || 90;
  if (op === 'convert') fmt = arg;
  else if (op === 'bgremove') { c = await removeBackground(c); fmt = 'png'; tag = 'no-bg'; }
  else if (op === 'crop') { c = cropTo(c, arg); tag = 'crop-' + arg.replace(':', 'x'); }
  else if (op === 'resize') { c = resizeTo(c, arg); tag = arg.startsWith('scale') ? `${Math.round(Number(arg.slice(6)) * 100)}pct` : arg.slice(4) + 'px'; }
  else if (op === 'rotate') { c = rotateBy(c, arg); tag = 'rotated'; }
  else if (op === 'flip') { c = flipH(c); tag = 'flipped'; }
  else if (op === 'gray') { c = grayscale(c); tag = 'bw'; }
  else if (op === 'compress') { if (fmt === 'png') fmt = 'webp'; quality = 65; tag = 'compressed'; }
  else if (op === 'strip-meta') tag = 'clean';   // re-encoding from pixels drops every EXIF block
  const out = uniquePath(dir, tag ? `${base}-${tag}` : base, fmt);
  fs.writeFileSync(out, await encodeImage(c, fmt, quality));
  return out;
}

// Removes only the GPS block, leaving the rest of a JPEG's EXIF (and its pixels) untouched.
function stripGps(src, dir, base) {
  const piexif = require('piexifjs'), bin = fs.readFileSync(src).toString('binary');
  const exif = piexif.load(bin);
  exif.GPS = {};
  const out = uniquePath(dir, `${base}-no-location`, extOf(src) === 'jpeg' ? 'jpeg' : 'jpg');
  fs.writeFileSync(out, Buffer.from(piexif.insert(piexif.dump(exif), bin), 'binary'));
  return out;
}

// What Studio's Info tab shows: a few readable EXIF fields and, if present, the GPS position.
async function imageMeta(src) {
  const tags = await require('exifr').parse(fs.readFileSync(src), { gps: true, tiff: true, exif: true, translateValues: true }).catch(() => null) || {};
  const want = { Make: 'Camera', Model: 'Model', LensModel: 'Lens', DateTimeOriginal: 'Taken', ExposureTime: 'Exposure', FNumber: 'Aperture', ISO: 'ISO', FocalLength: 'Focal length', Software: 'Software' };
  const fields = {};
  for (const [k, label] of Object.entries(want)) {
    const v = tags[k];
    if (v != null && v !== '') fields[label] = v instanceof Date ? v.toLocaleString() : k === 'ExposureTime' && v < 1 ? `1/${Math.round(1 / v)} s` : k === 'FNumber' ? `f/${v}` : k === 'FocalLength' ? `${v} mm` : String(v);
  }
  const gps = typeof tags.latitude === 'number' && typeof tags.longitude === 'number' ? { lat: tags.latitude, lon: tags.longitude } : null;
  return { fields, gps };
}

// What the Studio window loads: the browser can't decode HEIC/TIFF, so those arrive as PNG.
async function studioBytes(src) {
  const ext = extOf(src), native = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg', 'ico'].includes(ext);
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon' }[ext];
  if (native) return { bytes: fs.readFileSync(src), mime };
  return { bytes: (await loadCanvas(src)).toBuffer('image/png'), mime: 'image/png' };
}

// ---- pdf ----
// pdfjs is ESM-only; load it lazily so Bloom's start-up never pays for it.
async function openPdf(src) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(src));
  const task = pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false });
  const pdf = await task.promise;
  pdf.cleanup = () => task.destroy();
  return pdf;
}

async function pdfLines(pdf) {
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    pages.push(c.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('').split('\n'));
  }
  return pages;
}

async function pdfJob(src, op, arg, dir, base, opts) {
  if (op === 'split') return pdfSplit(src, dir, base);
  if (op === 'protect') return pdfProtect(src, dir, base, opts.password);
  if (op === 'extract-images') return pdfExtractImages(src, dir, base);
  if (op === 'strip-meta') {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(fs.readFileSync(src), { updateMetadata: false });
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator('');
    const out = uniquePath(dir, base + '-clean', 'pdf');
    fs.writeFileSync(out, await doc.save());
    return out;
  }
  if (op === 'rotate') {
    const { PDFDocument, degrees } = require('pdf-lib');
    const doc = await PDFDocument.load(fs.readFileSync(src));
    for (const p of doc.getPages()) p.setRotation(degrees((p.getRotation().angle + 90) % 360));
    const out = uniquePath(dir, base + '-rotated', 'pdf');
    fs.writeFileSync(out, await doc.save());
    return out;
  }
  const pdf = await openPdf(src);
  try {
    if (op === 'compress') return await pdfCompress(pdf, dir, base);
    if (arg === 'txt') {
      const out = uniquePath(dir, base, 'txt');
      fs.writeFileSync(out, (await pdfLines(pdf)).map(p => p.join('\n')).join('\n\n').trim() + '\n');
      return out;
    }
    if (arg === 'docx') {
      // shortcut: text only. A PDF has no paragraphs to recover, so each line becomes one; images and layout are lost.
      const blocks = [];
      (await pdfLines(pdf)).forEach((lines, i) => {
        if (i) blocks.push({ type: 'break' });
        for (const l of lines) if (l.trim()) blocks.push({ type: 'p', text: l });
      });
      const out = uniquePath(dir, base, 'docx');
      fs.writeFileSync(out, await writeDocx(blocks));
      return out;
    }
    const { createCanvas } = canvasLib();
    const mime = arg === 'jpg' ? 'image/jpeg' : 'image/png';
    // One page -> one file. Several pages -> a folder, so the folder isn't flooded.
    const folderPath = pdf.numPages > 1 ? uniquePath(dir, `${base} pages`, '') : null;
    if (folderPath) fs.mkdirSync(folderPath);
    let first = null;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: (opts.pdfDpi || 144) / 72 });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      const out = folderPath ? path.join(folderPath, `page-${String(i).padStart(2, '0')}.${arg}`) : uniquePath(dir, base, arg);
      fs.writeFileSync(out, canvas.toBuffer(mime));
      first = first || out;
    }
    return folderPath || first;
  } finally { pdf.cleanup(); }
}

// shortcut: flattening. Each page is re-drawn as a 130-dpi JPEG, so the file shrinks a lot but text stops being selectable.
async function pdfCompress(pdf, dir, base) {
  const { PDFDocument } = require('pdf-lib'), { createCanvas } = canvasLib();
  const out = await PDFDocument.create();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), pt = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 130 / 72 });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const img = await out.embedJpg(canvas.toBuffer('image/jpeg', 70)), p = out.addPage([pt.width, pt.height]);
    p.drawImage(img, { x: 0, y: 0, width: pt.width, height: pt.height });
  }
  const file = uniquePath(dir, base + '-compressed', 'pdf');
  fs.writeFileSync(file, await out.save());
  return file;
}

async function pdfSplit(src, dir, base) {
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.load(fs.readFileSync(src)), n = doc.getPageCount();
  if (n < 2) throw new Error('only one page');
  const folderPath = uniquePath(dir, `${base} split`, '');
  fs.mkdirSync(folderPath);
  for (let i = 0; i < n; i++) {
    const one = await PDFDocument.create();
    one.addPage((await one.copyPages(doc, [i]))[0]);
    fs.writeFileSync(path.join(folderPath, `page-${String(i + 1).padStart(2, '0')}.pdf`), await one.save());
  }
  return folderPath;
}

// AES-256 via qpdf compiled to WebAssembly: the same engine the qpdf tool uses, no install needed.
async function pdfProtect(src, dir, base, password) {
  if (!password) throw new Error('no password given');
  const wasmDir = path.join(path.dirname(require.resolve('@neslinesli93/qpdf-wasm/package.json')), 'dist').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  const create = (await import('@neslinesli93/qpdf-wasm')).default;
  const qpdf = await create({ locateFile: f => path.join(wasmDir, f), noInitialRun: true, print: () => {}, printErr: () => {} });
  qpdf.FS.writeFile('/in.pdf', fs.readFileSync(src));
  const code = qpdf.callMain(['--encrypt', password, password, '256', '--', '/in.pdf', '/out.pdf']);
  if (code) throw new Error('could not encrypt this PDF');
  const out = uniquePath(dir, base + '-protected', 'pdf');
  fs.writeFileSync(out, qpdf.FS.readFile('/out.pdf'));
  return out;
}

// Pulls embedded pictures out as they are: JPEGs byte-for-byte, plain RGB/grey data re-wrapped as PNG.
async function pdfExtractImages(src, dir, base) {
  const { PDFDocument, PDFName, PDFRawStream, PDFArray } = require('pdf-lib'), { createCanvas, ImageData } = canvasLib();
  const doc = await PDFDocument.load(fs.readFileSync(src)), zlib = require('zlib'), found = [];
  const name = (d, k) => { const v = d.lookup(PDFName.of(k)); return v instanceof PDFArray ? v.lookup(0) : v; };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const f = String(name(obj.dict, 'Filter') || ''), w = obj.dict.lookup(PDFName.of('Width')).asNumber(), h = obj.dict.lookup(PDFName.of('Height')).asNumber();
    if (f === '/DCTDecode') found.push({ ext: 'jpg', data: Buffer.from(obj.contents) });
    else if (f === '/FlateDecode') {
      const cs = String(name(obj.dict, 'ColorSpace') || ''), ch = cs === '/DeviceRGB' ? 3 : cs === '/DeviceGray' ? 1 : 0;
      const bpc = obj.dict.lookup(PDFName.of('BitsPerComponent'));
      if (!ch || !bpc || bpc.asNumber() !== 8) continue;
      const raw = zlib.inflateSync(Buffer.from(obj.contents)), rgba = new Uint8ClampedArray(w * h * 4);
      if (raw.length < w * h * ch) continue;
      for (let i = 0; i < w * h; i++) {
        rgba[i * 4] = raw[i * ch]; rgba[i * 4 + 1] = raw[i * ch + (ch === 3 ? 1 : 0)]; rgba[i * 4 + 2] = raw[i * ch + (ch === 3 ? 2 : 0)]; rgba[i * 4 + 3] = 255;
      }
      const c = createCanvas(w, h); c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
      found.push({ ext: 'png', data: c.toBuffer('image/png') });
    }
  }
  if (!found.length) throw new Error('no extractable pictures in this PDF');
  const folderPath = uniquePath(dir, `${base} images`, '');
  fs.mkdirSync(folderPath);
  found.forEach((f, i) => fs.writeFileSync(path.join(folderPath, `image-${String(i + 1).padStart(2, '0')}.${f.ext}`), f.data));
  return folderPath;
}

// ---- page editor (Studio, PDF mode) ----
// A page is { src, idx, rot }: a source file (the PDF itself, or others added later), a page in it, and a turn.
const pdfCache = new Map();   // path -> Promise<pdfjs doc>, kept open while a Studio window uses it
const cachedPdf = src => { if (!pdfCache.has(src)) pdfCache.set(src, openPdf(src)); return pdfCache.get(src); };
async function releasePdf(src) {
  const p = pdfCache.get(src);
  pdfCache.delete(src);
  if (p) (await p.catch(() => null))?.cleanup();
}

async function pdfPageCount(src) {
  const { PDFDocument } = require('pdf-lib');
  try { return (await PDFDocument.load(fs.readFileSync(src))).getPageCount(); }
  catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'this PDF is password-protected' : e.message); }
}

// A small JPEG of one page (or of an image source), for the page grid.
async function pageThumb(src, kind, index, width) {
  const { createCanvas } = canvasLib();
  if (kind === 'image') {
    const c = await loadCanvas(src), f = Math.min(1, width / c.width), o = createCanvas(Math.max(1, Math.round(c.width * f)), Math.max(1, Math.round(c.height * f)));
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return flatWhite(o).toBuffer('image/jpeg', 80);
  }
  const page = await (await cachedPdf(src)).getPage(index + 1), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: width / v1.width });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  return canvas.toBuffer('image/jpeg', 80);
}

// Assemble the edited document: pages in order, from any source, each with its own extra turn.
async function buildPdf(pages, sources) {
  const { PDFDocument, degrees } = require('pdf-lib'), out = await PDFDocument.create(), docs = new Map();
  for (const p of pages) {
    const s = sources[p.src], turn = ((p.rot % 360) + 360) % 360;
    let page;
    if (s.kind === 'image') {
      const c = await loadCanvas(s.path);
      page = out.addPage([c.width, c.height]);
      page.drawImage(await out.embedPng(await encodeImage(flatWhite(c), 'png')), { x: 0, y: 0, width: c.width, height: c.height });
    } else {
      if (!docs.has(p.src)) docs.set(p.src, await PDFDocument.load(fs.readFileSync(s.path)));
      page = out.addPage((await out.copyPages(docs.get(p.src), [p.idx]))[0]);
    }
    if (turn) page.setRotation(degrees((page.getRotation().angle + turn) % 360));
  }
  return Buffer.from(await out.save());
}

// ---- documents ----
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHtml = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const stripTags = s => unescapeHtml(s.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ''));
const PAGE_CSS = '<style>body{font:14px/1.6 system-ui,sans-serif;max-width:46em;margin:2em auto;padding:0 1em;color:#111}' +
  'pre,code{font-family:ui-monospace,monospace;background:#f4f4f5}pre{padding:.8em;overflow:auto}' +
  'img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>';

// Minimal CSV: quoted fields, doubled quotes, commas or semicolons.
function parseCsv(text) {
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(Boolean) || row.length > 1) rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function docToHtml(src, ext) {
  if (ext === 'csv') return '<table>' + parseCsv(fs.readFileSync(src, 'utf8')).map((r, i) => '<tr>' + r.map(c => `<${i ? 'td' : 'th'}>${escapeHtml(c)}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
  if (ext === 'docx') return (await require('mammoth').convertToHtml({ path: src })).value;
  const raw = fs.readFileSync(src, 'utf8');
  if (ext === 'md' || ext === 'markdown') return (await import('marked')).marked.parse(raw);   // ESM-only; Electron's Node can't require() it
  if (ext === 'txt') return `<pre style="white-space:pre-wrap;background:none">${escapeHtml(raw)}</pre>`;
  return raw;   // html
}

// Blocks are the lowest common shape of a document: { type: 'h'|'p'|'li'|'code'|'break', text, level }.
async function docBlocks(src, ext) {
  const raw = ext === 'docx' ? null : fs.readFileSync(src, 'utf8');
  const paras = text => text.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean).map(t => ({ type: 'p', text: t }));
  if (ext === 'txt') return paras(raw);
  if (ext === 'csv') return parseCsv(raw).map(r => ({ type: 'p', text: r.join('  |  ') }));
  if (ext === 'md' || ext === 'markdown') {
    const plain = ts => (ts || []).map(t => t.tokens ? plain(t.tokens) : (t.text ?? t.raw ?? '')).join('');
    const out = [];
    for (const t of (await import('marked')).marked.lexer(raw)) {
      if (t.type === 'heading') out.push({ type: 'h', level: t.depth, text: plain(t.tokens) });
      else if (t.type === 'paragraph' || t.type === 'blockquote') out.push({ type: 'p', text: plain(t.tokens) || t.text });
      else if (t.type === 'list') for (const i of t.items) out.push({ type: 'li', text: plain(i.tokens) || i.text });
      else if (t.type === 'code') out.push({ type: 'code', text: t.text });
    }
    return out;
  }
  const html = await docToHtml(src, ext);
  const out = [];
  for (const m of html.matchAll(/<(h[1-6]|p|li|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]).trim();
    if (!text) continue;
    const tag = m[1].toLowerCase();
    out.push(tag[0] === 'h' ? { type: 'h', level: Number(tag[1]), text } : { type: tag === 'li' ? 'li' : tag === 'pre' ? 'code' : 'p', text });
  }
  return out.length ? out : paras(stripTags(html));
}

async function writeDocx(blocks) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = require('docx');
  const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  const children = blocks.map(b => {
    if (b.type === 'break') return new Paragraph({ children: [new PageBreak()] });
    if (b.type === 'h') return new Paragraph({ heading: H[b.level] || H[1], children: [new TextRun(b.text)] });
    if (b.type === 'li') return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] });
    if (b.type === 'code') return new Paragraph({ children: [new TextRun({ text: b.text, font: 'Courier New' })] });
    return new Paragraph({ children: [new TextRun(b.text)] });
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

async function docJob(src, ext, to, dir, base, printPdf) {
  const out = uniquePath(dir, base, to);
  if (to === 'txt') {
    if (ext === 'docx') fs.writeFileSync(out, (await require('mammoth').extractRawText({ path: src })).value);
    else {
      const raw = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(out, ext === 'html' || ext === 'htm' ? stripTags(raw) : raw);
    }
  } else if (to === 'docx') fs.writeFileSync(out, await writeDocx(await docBlocks(src, ext)));
  else {
    const html = await docToHtml(src, ext);
    const full = /<html[\s>]/i.test(html) ? html : `<!doctype html><meta charset="utf-8">${PAGE_CSS}${html}`;
    if (to === 'html') fs.writeFileSync(out, full);
    else {
      if (!printPdf) throw new Error('PDF printing is only available inside Bloom');
      fs.writeFileSync(out, await printPdf(full));
    }
  }
  return out;
}

// ---- audio / video ----
async function mediaJob(src, op, arg, kind, dir, base, ext) {
  if (op === 'convert') {
    const out = uniquePath(dir, base, arg);
    const a = arg === 'mp3' || kind === 'audio' ? ['-vn']
      : arg === 'gif' ? ['-vf', 'fps=12,scale=480:-1:flags=lanczos', '-t', '15'] : [];
    await ffmpeg(['-i', src, ...a], out);
    return out;
  }
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'];
  const [tag, outExt, args] = {
    compress: ['compressed', 'mp4', [...h264, '-crf', '28']],
    resize: ['720p', 'mp4', ['-vf', 'scale=-2:720', ...h264, '-crf', '23']],
    mute: ['muted', ext, ['-an', '-c:v', 'copy']]
  }[op];
  const out = uniquePath(dir, `${base}-${tag}`, outExt);
  await ffmpeg(['-i', src, ...args], out);
  return out;
}

// Where results go: beside the original, or in a "Bloom" folder next to it (a setting).
function outDirFor(src, opts) {
  const dir = path.dirname(src);
  if (opts.outDir !== 'folder') return dir;
  const sub = path.join(dir, 'Bloom');
  fs.mkdirSync(sub, { recursive: true });
  return sub;
}

// Run one menu entry on `src`. Output lands next to the source (or per `opts.outDir`) and is returned.
// opts: { printPdf, password, quality, pdfDpi, outDir }
async function run(src, op, arg, opts = {}) {
  const ext = extOf(src);
  if (!fs.existsSync(src)) throw new Error('file not found');
  if (!flatten(menuFor(ext)).some(n => n.op === op && String(n.arg ?? '') === String(arg ?? ''))) {
    throw new Error(`cannot ${op}${arg ? ' ' + arg : ''} a .${ext} file`);
  }
  const dir = outDirFor(src, opts), base = path.basename(src, path.extname(src)), kind = kindOf(ext).kind;
  if (kind === 'image') return imageJob(src, op, arg, dir, base, ext, opts);
  if (kind === 'pdf') return pdfJob(src, op, arg, dir, base, opts);
  if (kind === 'doc') return docJob(src, ext, arg, dir, base, opts.printPdf);
  return mediaJob(src, op, arg, kind, dir, base, ext);
}

// A batch: "One PDF" and "Merge" make a single file, anything else runs on each file in turn.
async function runMany(srcs, op, arg, opts = {}) {
  if (!flatten(menuForMany(srcs)).some(n => n.op === op && String(n.arg ?? '') === String(arg ?? ''))) throw new Error('these files cannot be handled together');
  if (op !== 'combine' && op !== 'merge') { const outs = []; for (const s of srcs) outs.push(await run(s, op, arg, opts)); return outs; }
  const { PDFDocument } = require('pdf-lib'), doc = await PDFDocument.create();
  for (const s of srcs) {
    if (op === 'merge') { const d = await PDFDocument.load(fs.readFileSync(s)); (await doc.copyPages(d, d.getPageIndices())).forEach(p => doc.addPage(p)); continue; }
    const c = await loadCanvas(s), page = doc.addPage([c.width, c.height]);
    page.drawImage(await doc.embedPng(await encodeImage(flatWhite(c), 'png')), { x: 0, y: 0, width: c.width, height: c.height });
  }
  const out = uniquePath(outDirFor(srcs[0], opts), path.basename(srcs[0], path.extname(srcs[0])) + (op === 'merge' ? '-merged' : '-combined'), 'pdf');
  fs.writeFileSync(out, await doc.save());
  return [out];
}
function flatWhite(c) {
  const f = canvasLib().createCanvas(c.width, c.height), g = f.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0);
  return f;
}

module.exports = { menuFor, menuForMany, run, runMany, studioBytes, imageMeta, uniquePath, outDirFor, pdfPageCount, pageThumb, buildPdf, releasePdf, convert: (src, to, o) => run(src, 'convert', to, o) };
