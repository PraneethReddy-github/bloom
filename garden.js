// Bloom Garden — LAN presence and strictly point-to-point messaging.
//
// Two channels, deliberately kept apart:
//   * UDP :55555   — presence only. A heartbeat says "I exist, reach me at ip:port".
//                    Nothing private ever rides the broadcast.
//   * TCP :55556+  — every message, task and matrix read. One connection per frame,
//                    opened straight at one peer's ip:port, acknowledged, then closed.
//                    A message to one person touches exactly one socket to that person.
//
// Peers are identified by a persistent random id, never by name or IP: names collide
// (two machines, one username) and IPs move (DHCP). The id is what chat history,
// unread counts and the outbox are keyed on, so a peer keeps their thread across
// reconnects, renames and address changes.
//
// Everything on the TCP side is encrypted end to end. Each install holds an X25519
// keypair; the public half rides the presence beacon, and a pair of peers derives a
// key only the two of them can compute. That is what makes "only this person" true
// against a packet sniffer, and not merely true of who gets a notification — a third
// colleague running Bloom cannot read a conversation they are not part of, because
// the key is derived from the two private halves they do not hold.
'use strict';

const dgram = require('dgram');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const PROTO = 2;              // v1 was plaintext and never shipped
const DISCO_PORT = 55555;
const TCP_BASE = 55556;
const TCP_TRIES = 16;          // 55556..55571 before giving up
const BEAT_MS = 4000;          // presence heartbeat
const PEER_TTL = 13000;        // ~3 missed beats before a peer reads as offline
const REAP_MS = 2000;
const FRAME_MAX = 64 * 1024;   // one JSON line
const BUF_MAX = 256 * 1024;    // unterminated garbage tolerated per socket
const SOCK_IDLE_MS = 15000;
const REQ_TIMEOUT = 4500;
const CONN_PER_IP = 8;         // concurrent inbound sockets from one address
const RATE_WINDOW = 10000;
const RATE_MAX = 40;           // frames per peer per window
const CHAT_CAP = 400;          // messages kept per conversation
const INBOX_CAP = 100;
const OUTBOX_CAP = 200;
const OUTBOX_TTL = 24 * 3600 * 1000;
const OUTBOX_TICK = 3000;
const SEEN_CAP = 1024;
const SAVE_DEBOUNCE = 700;

const QUADS = ['do', 'plan', 'delegate', 'drop'];

// Faces people pick to be known by on the network. Kept to plain single-codepoint
// emoji — no variation selectors — so the string that goes over the wire is the
// string that comes back, and an exact match is enough to validate it.
const AVATARS = [
  '\u{1F98A}', '\u{1F43C}', '\u{1F427}', '\u{1F989}', '\u{1F422}', '\u{1F98B}',
  '\u{1F41D}', '\u{1F419}', '\u{1F980}', '\u{1F433}', '\u{1F988}', '\u{1F42C}',
  '\u{1F981}', '\u{1F42F}', '\u{1F428}', '\u{1F9A5}', '\u{1F994}', '\u{1F430}',
  '\u{1F99C}', '\u{1F9A9}', '\u{1F98C}', '\u{1F434}', '\u{1F43A}', '\u{1F9AD}',
  '\u{1F438}', '\u{1F421}', '\u{1F99A}', '\u{1F41E}', '\u{1F99E}', '\u{1F40C}'
];

// Anyone who has not chosen still gets a face, and always the same one — derived
// from the peer id, so it is stable everywhere without needing to be sent.
function pickAvatar(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
const okAvatar = (a, id) => (typeof a === 'string' && AVATARS.includes(a)) ? a : pickAvatar(id);

// ---------------------------------------------------------------- crypto
const KDF_INFO = Buffer.from('bloom-garden-v2');

function newKeypair() {
  const { privateKey } = crypto.generateKeyPairSync('x25519');
  return privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
}

function privFrom(b64) {
  return crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
}

function pubOf(priv) {
  return crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).toString('base64');
}

// A peer's public key arrives over the wire, so treat it as hostile input: anything
// that is not a well-formed X25519 key is simply not a peer we can talk to.
function pubFrom(b64) {
  try {
    if (typeof b64 !== 'string' || b64.length > 128) return null;
    const k = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
    return k.asymmetricKeyType === 'x25519' ? k : null;
  } catch { return null; }
}

// Both sides must land on the same key, so the salt is order-independent.
function sessionKey(priv, pubB64, idA, idB) {
  const pub = pubFrom(pubB64);
  if (!pub) return null;
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: pub });
  const salt = Buffer.from([idA, idB].sort().join('|'));
  return Buffer.from(crypto.hkdfSync('sha256', shared, salt, KDF_INFO, 32));
}

// Something people can read to each other to confirm nobody sat in the middle.
function fingerprint(pubB64) {
  if (!pubB64) return '';
  const h = crypto.createHash('sha256').update(Buffer.from(pubB64, 'base64')).digest('hex').toUpperCase();
  return (h.slice(0, 16).match(/.{4}/g) || []).join(' ');
}

// One code for a pair, derived from both keys and order-independent, so the two
// people see the *same* string. Far easier to check than reading two codes each
// and remembering which belongs to whom.
function pairCode(pubA, pubB) {
  if (!pubA || !pubB) return '';
  const h = crypto.createHash('sha256').update([pubA, pubB].sort().join('|')).digest('hex').toUpperCase();
  return (h.slice(0, 20).match(/.{4}/g) || []).join(' ');
}

const now = () => Date.now();
const rid = (n = 6) => crypto.randomBytes(n).toString('hex');
const normIp = ip => (ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip) || '';
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]', 'g');
// Strip control characters: everything here ends up in innerHTML-escaped UI, but a
// stray CR or U+2028 still mangles layout and log output.
const clean = (s, max) => String(s == null ? '' : s).replace(CTRL, '').slice(0, max);

// ---------------------------------------------------------------- addressing
function bcastAddr(ip, mask) {
  const a = String(ip).split('.').map(Number);
  const m = String(mask).split('.').map(Number);
  if (a.length !== 4 || m.length !== 4) return null;
  if (a.some(n => !Number.isInteger(n)) || m.some(n => !Number.isInteger(n))) return null;
  return a.map((o, i) => (o | (~m[i] & 255)) & 255).join('.');
}

// Directed broadcast per interface. 255.255.255.255 is a fallback only — plenty of
// switches drop it, and on a multi-homed host it leaves by one interface at most.
function scanInterfaces() {
  const targets = new Set();
  const locals = new Set();
  const nets = [];
  for (const list of Object.values(os.networkInterfaces() || {})) {
    for (const ni of list || []) {
      if (!(ni.family === 4 || ni.family === 'IPv4')) continue;
      locals.add(ni.address);
      if (ni.internal) continue;
      const b = bcastAddr(ni.address, ni.netmask);
      if (!b || b === '0.0.0.0') continue;
      targets.add(b);
      // A /32 interface (Tailscale and friends) has no subnet, so it can say
      // nothing about which peers are on the same network as us. Only real
      // subnets get a vote on which of a peer's addresses to keep.
      if (ni.netmask !== '255.255.255.255') nets.push({ address: ni.address, netmask: ni.netmask });
    }
  }
  if (!targets.size) targets.add('255.255.255.255');
  return { targets: Array.from(targets), locals, nets };
}

const ip4 = a => { const p = String(a).split('.').map(Number); return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n < 256) ? p : null; };

// Is this address on one of the networks we are actually attached to? A machine on
// both office wifi and a VPN beacons from both, so the same peer arrives under two
// addresses; the one that shares a subnet with us is the one worth keeping and
// dialling. Without this the peer's address flaps, and half of them are unroutable.
function onOurSubnet(ip, nets) {
  const a = ip4(ip);
  if (!a) return false;
  for (const n of nets || []) {
    const b = ip4(n.address), m = ip4(n.netmask);
    if (!b || !m) continue;
    if (a.every((o, i) => (o & m[i]) === (b[i] & m[i]))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- framing
// Line-delimited JSON. The buffer is trimmed on every line whatever happens to it,
// so one malformed frame can never wedge the stream or grow the buffer without end.
function readFrames(sock, onFrame) {
  let buf = '';
  sock.on('data', chunk => {
    buf += chunk.toString('utf8');
    if (buf.length > BUF_MAX) { buf = ''; sock.destroy(); return; }
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const raw = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!raw || raw.length > FRAME_MAX) continue;
      let f;
      try { f = JSON.parse(raw); } catch { continue; }
      if (f && typeof f === 'object' && !Array.isArray(f)) onFrame(f);
    }
  });
}

const line = obj => JSON.stringify(obj) + '\n';

// ---------------------------------------------------------------- module
class Garden extends EventEmitter {
  constructor() {
    super();
    this.self = { id: '', name: '', avatar: '', host: '', user: '', port: TCP_BASE, public: false, dnd: false, pub: '' };
    this.priv = null;             // X25519 private half; never leaves this process
    this.keys = new Map();        // peer id -> derived session key, dropped if theirs changes
    this.live = new Map();        // id -> {id, name, ip, port, public, lastSeen}
    this.state = { people: {}, chats: {}, unread: {}, inbox: [], outbox: [] };
    this.locals = new Set();
    this.bcast = ['255.255.255.255'];
    this.nets = [];
    this.udp = null;
    this.tcp = null;
    this.timers = [];
    this.seen = new Set();
    this.seenQ = [];
    this.conns = new Map();       // ip -> open inbound socket count
    this.socks = new Set();       // live inbound sockets, so shutdown can close them
    this.rate = new Map();        // peer id -> {n, until}
    this.saveTimer = null;
    this.persist = null;
    this.readTasks = () => [];
    this.running = false;
  }

  // -------------------------------------------------------------- lifecycle
  start(cfg, { persist, readTasks }) {
    if (this.running) return;
    this.running = true;
    this.persist = persist;
    if (readTasks) this.readTasks = readTasks;
    this.hydrate(cfg);
    this._refreshIfaces();
    this._openUdp();
    this._openTcp(TCP_BASE, TCP_TRIES);
    this.timers.push(setInterval(() => this._beat(), BEAT_MS));
    this.timers.push(setInterval(() => this._reap(), REAP_MS));
    this.timers.push(setInterval(() => this._flushOutbox(), OUTBOX_TICK));
    this.timers.push(setInterval(() => this._refreshIfaces(), 20000));
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    // dgram.send defers to the next tick even for a literal address, so closing the
    // socket in the same breath would swallow the goodbye and leave everyone showing
    // us online until the 13s timeout.
    const sock = this.udp;
    this.udp = null;
    let closed = false;
    const shut = () => {
      if (closed) return;
      closed = true;
      try { sock?.close(); } catch { /* already gone */ }
    };
    try {
      const buf = Buffer.from(JSON.stringify({ v: PROTO, t: 'bye', id: this.self.id }));
      let left = this.bcast.length;
      if (!left || !sock) shut();
      for (const dst of this.bcast) {
        sock.send(buf, 0, buf.length, DISCO_PORT, dst, () => { if (--left <= 0) shut(); });
      }
      setTimeout(shut, 250).unref?.();
    } catch { shut(); }

    // close() only refuses *new* connections. Drop the established ones too, or a
    // frame can land after the final flush and be appended to a state nobody will
    // ever write — the message would vanish without a trace.
    try { this.tcp?.close(); } catch { /* already gone */ }
    this.tcp = null;
    for (const sk of this.socks) { try { sk.destroy(); } catch { /* already gone */ } }
    this.socks.clear();
    this.saveNow();
  }

  // -------------------------------------------------------------- state
  // Garden owns these config keys outright. Renderers never write them directly —
  // every mutation lands here first, which is what stops a stale renderer copy of a
  // conversation from clobbering messages that arrived while it was in flight.
  hydrate(cfg) {
    const g = cfg.garden || {};
    this.self.id = g.id || rid(8);
    this.self.name = clean(g.name, 24) || os.userInfo().username || 'Bloom';
    this.self.avatar = okAvatar(g.avatar, this.self.id);
    this.self.public = g.public === true;
    this.self.host = clean(os.hostname(), 32);
    this.self.user = clean(os.userInfo().username, 32);
    // The keypair is generated once and then it *is* this install's identity to
    // everyone else. Losing it means every peer sees a changed key and says so.
    let sk = typeof g.sk === 'string' ? g.sk : '';
    try { this.priv = privFrom(sk); } catch { this.priv = null; }
    if (!this.priv) { sk = newKeypair(); this.priv = privFrom(sk); }
    this.sk = sk;
    this.self.pub = pubOf(this.priv);

    const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? { ...v } : {};
    this.state.people = obj(cfg.gardenPeople);
    this.state.chats = obj(cfg.gardenChats);
    this.state.unread = obj(cfg.gardenUnread);
    this.state.inbox = Array.isArray(cfg.gardenInbox) ? cfg.gardenInbox.slice() : [];
    this.state.outbox = Array.isArray(cfg.gardenOutbox) ? cfg.gardenOutbox.slice() : [];

    if (cfg.gardenSchema !== 2) this._migrate(cfg);
    this._prune();
    // First boot writes the identity and the schema marker straight away. Waiting
    // for the first peer would mean a new id — and an orphaned history — every
    // launch until somebody else showed up.
    this._save();
  }

  // v1 kept everything under raw IPs and gave messages no identity at all. Rehome it
  // onto synthetic ids so nobody loses a thread on upgrade; those read as offline
  // peers until the same person is discovered again under their real id.
  _migrate(cfg) {
    const oldChats = (cfg.gardenChats && typeof cfg.gardenChats === 'object') ? cfg.gardenChats : {};
    const oldUnread = (cfg.gardenUnread && typeof cfg.gardenUnread === 'object') ? cfg.gardenUnread : {};
    const chats = {}, unread = {}, people = {};

    for (const [key, arr] of Object.entries(oldChats)) {
      if (!Array.isArray(arr) || !/^\d+\.\d+\.\d+\.\d+$/.test(key)) continue;
      const pid = 'ip-' + key.replace(/\./g, '-');
      const peerName = (arr.find(m => m && m.sender && m.sender !== 'You') || {}).sender || key;
      people[pid] = { id: pid, name: clean(peerName, 24), avatar: pickAvatar(pid), key: null, ip: key, port: null, public: false, lastSeen: 0, firstSeen: 0 };
      chats[pid] = arr.filter(m => m && typeof m.text === 'string').map(m => ({
        id: rid(), dir: m.sender === 'You' ? 'out' : 'in', kind: 'text',
        text: clean(m.text, 2000), ts: m.time || now(), status: 'sent'
      }));
      if (oldUnread[key]) unread[pid] = 1;
    }

    const oldInbox = Array.isArray(cfg.gardenInbox) ? cfg.gardenInbox : [];
    this.state.people = { ...people, ...this.state.people };
    this.state.chats = chats;
    this.state.unread = unread;
    this.state.outbox = [];
    this.state.inbox = oldInbox.filter(t => t && t.title).map(t => ({
      id: rid(),
      fromId: t.senderIp ? 'ip-' + String(t.senderIp).replace(/\./g, '-') : 'unknown',
      fromName: clean(t.sender, 24) || 'Someone',
      ip: t.senderIp || null,
      port: t.senderPort || null,
      taskId: rid(),
      title: clean(t.title, 140),
      desc: clean(t.desc, 600),
      preferredQ: QUADS.includes(t.preferredQ) ? t.preferredQ : 'do',
      ts: t.time || now()
    }));
  }

  _prune() {
    for (const [id, arr] of Object.entries(this.state.chats)) {
      if (!Array.isArray(arr)) { delete this.state.chats[id]; continue; }
      if (arr.length > CHAT_CAP) this.state.chats[id] = arr.slice(-CHAT_CAP);
    }
    if (this.state.inbox.length > INBOX_CAP) this.state.inbox = this.state.inbox.slice(-INBOX_CAP);
    const cut = now() - OUTBOX_TTL;
    this.state.outbox = this.state.outbox.filter(o => o && o.queuedAt > cut).slice(-OUTBOX_CAP);
    for (const id of Object.keys(this.state.unread)) if (!this.state.unread[id]) delete this.state.unread[id];
  }

  // Everything garden owns, ready to be written onto whichever cfg object main is
  // holding — main replaces cfg wholesale on every patch.
  snapshot() {
    return {
      garden: { id: this.self.id, name: this.self.name, avatar: this.self.avatar, public: this.self.public, sk: this.sk },
      gardenSchema: 2,
      gardenPeople: this.state.people,
      gardenChats: this.state.chats,
      gardenUnread: this.state.unread,
      gardenInbox: this.state.inbox,
      gardenOutbox: this.state.outbox
    };
  }

  _save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, SAVE_DEBOUNCE);
  }

  // Chat used to hit the disk once per message, and each of those writes rotated
  // five backup files. Coalesce instead; a burst of ten messages is now one write.
  saveNow() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try { this.persist?.(this.snapshot()); } catch (e) { console.error('[garden] persist failed', e); }
  }

  // One small event carries the whole view a renderer needs. This replaces the old
  // habit of broadcasting the entire config — action tree included — per chat line.
  _push(kinds) {
    this._save();
    const out = { people: this.people() };
    for (const k of kinds) {
      if (k === 'chats') out.chats = this.state.chats;
      if (k === 'unread') out.unread = this.state.unread;
      if (k === 'inbox') out.inbox = this.state.inbox;
      if (k === 'outbox') out.outbox = this._outboxView();
    }
    this.emit('data', out);
  }

  _outboxView() {
    return this.state.outbox.map(o => ({ id: o.id, to: o.to, chatId: o.chatId, tries: o.tries }));
  }

  // -------------------------------------------------------------- presence
  _refreshIfaces() {
    const { targets, locals, nets } = scanInterfaces();
    this.bcast = targets;
    this.locals = locals;
    this.nets = nets;
  }

  _openUdp() {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.udp = sock;
    sock.on('error', e => {
      console.error('[garden] discovery socket error', e.code || e.message);
      try { sock.close(); } catch { /* already closing */ }
      if (this.udp === sock) this.udp = null;
      // A dead discovery socket used to end presence for the rest of the session.
      if (this.running) setTimeout(() => { if (this.running && !this.udp) this._openUdp(); }, 4000);
    });
    sock.on('message', (raw, rinfo) => this._onBeacon(raw, rinfo));
    try {
      sock.bind(DISCO_PORT, () => {
        try { sock.setBroadcast(true); } catch { /* not permitted here */ }
        this._beat();
      });
    } catch (e) {
      console.error('[garden] discovery bind failed', e);
    }
  }

  _say(obj) {
    if (!this.udp) return;
    const buf = Buffer.from(JSON.stringify(obj));
    for (const dst of this.bcast) {
      try { this.udp.send(buf, 0, buf.length, DISCO_PORT, dst, () => { }); } catch { /* interface went away */ }
    }
  }

  _beat() {
    this._say({
      v: PROTO, t: 'hello', id: this.self.id, name: this.self.name, av: this.self.avatar,
      k: this.self.pub, h: this.self.host, u: this.self.user, dnd: this.self.dnd,
      port: this.self.port, public: this.self.public
    });
  }

  _onBeacon(raw, rinfo) {
    if (raw.length > 2048) return;
    let d;
    try { d = JSON.parse(raw.toString('utf8')); } catch { return; }
    // Identity, not name+port, is what tells us a beacon is our own echo. The old
    // check dropped anyone who happened to share a username with us.
    if (!d || d.v !== PROTO || typeof d.id !== 'string' || !d.id || d.id === this.self.id) return;

    if (d.t === 'bye') {
      if (this.live.delete(d.id)) this._pushPeers();
      return;
    }
    if (d.t !== 'hello') return;
    if (!Number.isInteger(d.port) || d.port < 1 || d.port > 65535) return;

    if (!pubFrom(d.k)) return;          // no usable key means no way to talk privately
    let ip = normIp(rinfo.address);
    const name = clean(d.name, 24) || 'Bloom';
    const prev = this.live.get(d.id);
    // Keep a same-subnet address once we have one, rather than letting a VPN or
    // secondary interface overwrite the address we can actually reach them on.
    const prevIp = prev?.ip || this.state.people[d.id]?.ip;
    if (prevIp && prevIp !== ip && onOurSubnet(prevIp, this.nets) && !onOurSubnet(ip, this.nets)) ip = prevIp;
    const avatar = okAvatar(d.av, d.id);
    const peer = {
      id: d.id, name, avatar, key: d.k, ip, port: d.port,
      host: clean(d.h, 32), user: clean(d.u, 32), dnd: d.dnd === true,
      public: d.public === true, lastSeen: now()
    };
    this.live.set(d.id, peer);
    this._remember(peer);

    const appeared = !prev;
    if (appeared || prev.name !== name || prev.avatar !== avatar || prev.key !== d.k
      || prev.host !== peer.host || prev.user !== peer.user || prev.dnd !== peer.dnd
      || prev.ip !== ip || prev.port !== d.port || prev.public !== peer.public) {
      this._pushPeers();
    }
    if (appeared) this._flushOutbox(d.id);   // they're back — drain anything held for them
  }

  _reap() {
    const cut = now() - PEER_TTL;
    let changed = false;
    for (const [id, p] of this.live) if (p.lastSeen < cut) { this.live.delete(id); changed = true; }
    if (changed) this._pushPeers();
  }

  _remember(peer) {
    const known = this.state.people[peer.id];
    const key = peer.key || known?.key || null;
    // Trust on first use, then say so if it ever changes. A changed key is usually a
    // reinstall — but it is also exactly what an impostor looks like, so it is never
    // swallowed silently. The derived session key is dropped so the next message
    // uses the new one rather than failing to decrypt.
    const changed = !!(known && known.key && key && known.key !== key);
    if (changed) this.keys.delete(peer.id);

    const merged = {
      id: peer.id,
      name: peer.name || known?.name || 'Bloom',
      avatar: okAvatar(peer.avatar || known?.avatar, peer.id),
      host: peer.host || known?.host || '',
      user: peer.user || known?.user || '',
      key,
      keyChanged: changed || (known?.keyChanged === true),
      ip: peer.ip || known?.ip || null,
      port: peer.port || known?.port || null,
      public: peer.public === true,
      lastSeen: now(),
      firstSeen: known?.firstSeen || now()
    };
    const same = known && known.name === merged.name && known.avatar === merged.avatar
      && known.key === merged.key && known.keyChanged === merged.keyChanged
      && known.host === merged.host && known.user === merged.user
      && known.ip === merged.ip && known.port === merged.port && known.public === merged.public;
    this.state.people[peer.id] = merged;
    if (!same) this._save();
  }

  // Live presence merged with the directory, so anyone you have history with stays on
  // the list after they leave — reading a message must never depend on the sender
  // still being awake.
  people() {
    const out = [];
    const seen = new Set();
    for (const [id, p] of this.live) {
      seen.add(id);
      const known = this.state.people[id] || {};
      out.push({
        ...p, avatar: okAvatar(p.avatar, id), online: true, dnd: p.dnd === true,
        unread: this.state.unread[id] || 0,
        fingerprint: fingerprint(p.key), safety: pairCode(this.self.pub, p.key),
        keyChanged: known.keyChanged === true
      });
    }
    for (const [id, p] of Object.entries(this.state.people)) {
      if (seen.has(id)) continue;
      const hasHistory = (this.state.chats[id] || []).length > 0
        || this.state.unread[id] > 0
        || this.state.outbox.some(o => o.to === id)
        || this.state.inbox.some(t => t.fromId === id);
      if (!hasHistory) continue;
      out.push({
        ...p, avatar: okAvatar(p.avatar, id), online: false,
        unread: this.state.unread[id] || 0,
        fingerprint: fingerprint(p.key), safety: pairCode(this.self.pub, p.key),
        keyChanged: p.keyChanged === true
      });
    }
    out.sort((a, b) =>
      (b.unread - a.unread) ||
      (Number(b.online) - Number(a.online)) ||
      String(a.name).localeCompare(String(b.name)));
    return out;
  }

  _pushPeers() { this.emit('peers', this.people()); }

  peerAddr(id) {
    const l = this.live.get(id);
    if (l) return { id, name: l.name, ip: l.ip, port: l.port, key: l.key, online: true };
    const k = this.state.people[id];
    if (k && k.ip && k.port) return { id, name: k.name, ip: k.ip, port: k.port, key: k.key, online: false };
    return null;
  }

  // -------------------------------------------------------------- transport
  _openTcp(port, left) {
    const srv = net.createServer(sock => this._onSocket(sock));
    this.tcp = srv;
    srv.on('error', e => {
      if (e.code === 'EADDRINUSE' && left > 0) {
        // Walk forward from the port that actually failed. The previous version
        // retried the same number forever because it read a variable it only ever
        // advanced inside the (never-reached) listen callback.
        srv.removeAllListeners();
        try { srv.close(); } catch { /* never listened */ }
        this._openTcp(port + 1, left - 1);
      } else {
        console.error('[garden] listen failed', e.code || e.message);
      }
    });
    srv.listen(port, '0.0.0.0', () => {
      this.self.port = port;
      this._beat();
    });
  }

  _onSocket(sock) {
    const ip = normIp(sock.remoteAddress);
    const n = (this.conns.get(ip) || 0) + 1;
    if (n > CONN_PER_IP) { sock.destroy(); return; }
    this.conns.set(ip, n);
    this.socks.add(sock);

    sock.setNoDelay(true);
    sock.setTimeout(SOCK_IDLE_MS, () => sock.destroy());   // no more sockets held open forever
    sock.on('error', () => { /* peers vanish mid-write; nothing to do */ });
    sock.on('close', () => {
      this.socks.delete(sock);
      const c = (this.conns.get(ip) || 1) - 1;
      if (c > 0) this.conns.set(ip, c); else this.conns.delete(ip);
    });
    readFrames(sock, shell => this._onShell(shell, sock, ip));
  }

  // The key for a pair, derived once and cached. `pub` lets a first contact work
  // before the peer's beacon has landed; after that the pinned key always wins.
  _keyFor(peerId, pub) {
    const cached = this.keys.get(peerId);
    if (cached) return cached;
    const known = this.state.people[peerId];
    const use = (known && known.key) || pub;
    if (!use || !this.priv) return null;
    const k = sessionKey(this.priv, use, this.self.id, peerId);
    if (k) this.keys.set(peerId, k);
    return k;
  }

  // Only the routing shell travels in the clear — who it is from, and the nonce.
  // Type, text, task titles, matrix contents: all inside the ciphertext. The shell
  // is bound in as additional data, so it cannot be rewritten in flight either.
  _seal(peerId, obj, pub) {
    const key = this._keyFor(peerId, pub);
    if (!key) return null;
    const nonce = crypto.randomBytes(12);
    const shell = { v: PROTO, e: 1, f: this.self.id, k: this.self.pub, n: nonce.toString('base64') };
    const aad = Buffer.from(`${shell.v}|${shell.e}|${shell.f}|${shell.k}|${shell.n}`);
    const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
    c.setAAD(aad);
    const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    shell.c = Buffer.concat([body, c.getAuthTag()]).toString('base64');
    return shell;
  }

  _open(shell) {
    if (!shell || shell.v !== PROTO || shell.e !== 1) return null;
    if (typeof shell.f !== 'string' || !shell.f || shell.f === this.self.id) return null;
    if (typeof shell.n !== 'string' || typeof shell.c !== 'string') return null;
    if (shell.c.length > FRAME_MAX) return null;
    const key = this._keyFor(shell.f, shell.k);
    if (!key) return null;
    try {
      const nonce = Buffer.from(shell.n, 'base64');
      if (nonce.length !== 12) return null;
      const raw = Buffer.from(shell.c, 'base64');
      if (raw.length < 17) return null;
      const tag = raw.subarray(raw.length - 16);
      const body = raw.subarray(0, raw.length - 16);
      const d = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      d.setAAD(Buffer.from(`${shell.v}|${shell.e}|${shell.f}|${shell.k}|${shell.n}`));
      d.setAuthTag(tag);
      const out = JSON.parse(Buffer.concat([d.update(body), d.final()]).toString('utf8'));
      // The tag proves the sender holds the private half that matches the pinned
      // key, so identity is carried by the decryption itself, not by a claim in the
      // payload — a frame asserting someone else's id simply will not open.
      return (out && typeof out === 'object' && !Array.isArray(out)) ? out : null;
    } catch {
      return null;   // wrong key, tampered, or replayed under a rotated key
    }
  }

  _rateOk(key) {
    const r = this.rate.get(key);
    const t = now();
    if (!r || r.until < t) { this.rate.set(key, { n: 1, until: t + RATE_WINDOW }); return true; }
    r.n++;
    return r.n <= RATE_MAX;
  }

  _fresh(mid) {
    if (!mid || typeof mid !== 'string') return true;   // unlabelled frames aren't replays we can spot
    if (this.seen.has(mid)) return false;
    this.seen.add(mid);
    this.seenQ.push(mid);
    if (this.seenQ.length > SEEN_CAP) this.seen.delete(this.seenQ.shift());
    return true;
  }

  _onShell(shell, sock, ip) {
    if (!this.running) return;            // shutting down; nothing would persist
    if (!shell || typeof shell.f !== 'string') return;
    if (!this._rateOk(shell.f)) return;   // rate-limit before spending a decryption
    const f = this._open(shell);
    if (!f) return;                       // not for us, or not who it claims to be
    this._onFrame(f, sock, ip, shell.f, shell.k);
  }

  _onFrame(f, sock, ip, fromId, fromKey) {
    if (typeof f.t !== 'string') return;
    const from = f.from || {};

    // The socket's remote address is ground truth for where this came from, and the
    // decryption is ground truth for who sent it. The payload only fills in the
    // cosmetics — a name and a callback port.
    const peer = {
      id: fromId,
      name: clean(from.name, 24) || 'Bloom',
      avatar: okAvatar(from.av, fromId),
      host: clean(from.h, 32),
      user: clean(from.u, 32),
      key: fromKey || null,
      ip,
      port: Number.isInteger(from.port) ? from.port : (this.state.people[fromId]?.port || null),
      public: from.public === true
    };
    this._remember(peer);
    if (!this.live.has(fromId)) { this.live.set(fromId, { ...peer, lastSeen: now() }); this._pushPeers(); }

    const reply = (obj) => {
      const shell = this._seal(fromId, obj, fromKey);
      if (shell) { try { sock.write(line(shell)); } catch { /* peer hung up */ } }
    };
    const ack = () => reply({ v: PROTO, t: 'ack', mid: f.mid });

    switch (f.t) {
      case 'ping': ack(); break;

      case 'msg': {
        const text = clean(f.text, 2000);
        ack();
        if (!text || !this._fresh(f.mid)) break;
        this._append(peer.id, { id: f.mid || rid(), dir: 'in', kind: 'text', text, ts: now(), status: 'sent' });
        this.state.unread[peer.id] = (this.state.unread[peer.id] || 0) + 1;
        this._push(['chats', 'unread']);
        this.emit('notify', { id: rid(), kind: 'msg', peerId: peer.id, sender: peer.name, avatar: peer.avatar, body: text, ts: now() });
        break;
      }

      case 'task': {
        const title = clean(f.title, 140);
        ack();
        if (!title || !this._fresh(f.mid)) break;
        const item = {
          id: f.mid || rid(),
          fromId: peer.id, fromName: peer.name, ip: peer.ip, port: peer.port,
          taskId: clean(f.taskId, 32) || rid(),
          title, desc: clean(f.desc, 600),
          preferredQ: QUADS.includes(f.preferredQ) ? f.preferredQ : 'do',
          ts: now()
        };
        this.state.inbox.push(item);
        if (this.state.inbox.length > INBOX_CAP) this.state.inbox = this.state.inbox.slice(-INBOX_CAP);
        this._append(peer.id, { id: rid(), dir: 'in', kind: 'task', text: title, ts: now(), status: 'sent' });
        this._push(['inbox', 'chats']);
        this.emit('notify', {
          id: rid(), kind: 'task', peerId: peer.id, sender: peer.name, avatar: peer.avatar,
          body: title, ts: now(), inboxId: item.id, preferredQ: item.preferredQ
        });
        break;
      }

      case 'task-ack': {
        const title = clean(f.taskTitle, 140);
        ack();
        if (!this._fresh(f.mid)) break;
        const accepted = f.accepted === true;
        const q = QUADS.includes(f.q) ? f.q : '';
        this._append(peer.id, {
          id: f.mid || rid(), dir: 'in', kind: accepted ? 'accepted' : 'denied',
          text: title, q, ts: now(), status: 'sent'
        });
        this._push(['chats']);
        this.emit('notify', {
          id: rid(), kind: accepted ? 'accepted' : 'denied', peerId: peer.id,
          sender: peer.name, avatar: peer.avatar, body: title, q, ts: now()
        });
        break;
      }

      case 'task-done': {
        const title = clean(f.taskTitle, 140);
        ack();
        if (!title || !this._fresh(f.mid)) break;
        this._append(peer.id, { id: f.mid || rid(), dir: 'in', kind: 'done', text: title, ts: now(), status: 'sent' });
        this._push(['chats']);
        this.emit('notify', {
          id: rid(), kind: 'done', peerId: peer.id, sender: peer.name,
          avatar: peer.avatar, body: title, ts: now()
        });
        break;
      }

      case 'matrix-req': {
        // The response *is* the acknowledgement; sending both would resolve the
        // waiting request twice.
        const body = this.self.public
          ? { tasks: (this.readTasks() || []).map(t => ({ id: t.id, text: t.text, q: t.q, done: !!t.done })) }
          : { error: 'private' };
        reply({ v: PROTO, t: 'matrix-res', mid: f.mid, ...body });
        break;
      }

      default: break;
    }
  }

  _append(peerId, msg) {
    const arr = this.state.chats[peerId] || (this.state.chats[peerId] = []);
    arr.push(msg);
    if (arr.length > CHAT_CAP) this.state.chats[peerId] = arr.slice(-CHAT_CAP);
  }

  // The plaintext frame. It is sealed at dial time, not here, so a message parked in
  // the outbox is encrypted with whatever key the peer holds when it finally goes —
  // not one they may have rotated away from days earlier.
  _envelope(t, body) {
    return {
      v: PROTO, t, mid: rid(8), ts: now(),
      from: { name: this.self.name, av: this.self.avatar, h: this.self.host, u: this.self.user, port: this.self.port, public: this.self.public },
      ...body
    };
  }

  // One frame, one socket, one peer. Resolves once the far side acknowledges, so a
  // "sent" tick means their Bloom actually took it — not merely that TCP connected.
  _dial(addr, frame, expect) {
    return new Promise(resolve => {
      if (!addr || !addr.ip || !addr.port) { resolve({ ok: false, error: 'no-address' }); return; }
      // Stamp who we are *now*, not who we were when this was written. A message
      // parked in the outbox for a day would otherwise arrive announcing an old name
      // and animal, and the notification it raises would show them too.
      if (frame.from) {
        frame.from.name = this.self.name;
        frame.from.av = this.self.avatar;
        frame.from.h = this.self.host;
        frame.from.u = this.self.user;
        frame.from.port = this.self.port;
        frame.from.public = this.self.public;
      }
      const shell = this._seal(addr.id, frame);
      if (!shell) { resolve({ ok: false, error: 'no-key' }); return; }
      const sock = new net.Socket();
      let done = false;
      const finish = r => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { sock.destroy(); } catch { /* already gone */ }
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), REQ_TIMEOUT);
      sock.setNoDelay(true);
      sock.on('error', e => finish({ ok: false, error: e.code || e.message || 'error' }));
      sock.on('close', () => finish({ ok: false, error: 'closed' }));
      readFrames(sock, back => {
        const r = this._open(back);
        if (!r || (r.mid && frame.mid && r.mid !== frame.mid)) return;
        if (expect && r.t === expect) finish({ ok: true, data: r });
        else if (!expect && r.t === 'ack') finish({ ok: true });
      });
      sock.connect(addr.port, addr.ip, () => {
        try { sock.write(line(shell)); } catch { finish({ ok: false, error: 'write' }); }
      });
    });
  }

  // -------------------------------------------------------------- outbox
  // A peer dropping off mid-conversation should not cost you the message. It parks
  // here and goes out the moment their heartbeat returns.
  _queue(to, frame, chatId) {
    this.state.outbox.push({ id: rid(), to, frame, chatId, tries: 0, queuedAt: now(), nextAt: now() + 2000 });
    if (this.state.outbox.length > OUTBOX_CAP) this.state.outbox = this.state.outbox.slice(-OUTBOX_CAP);
  }

  _setStatus(peerId, chatId, status) {
    const m = (this.state.chats[peerId] || []).find(x => x.id === chatId);
    if (!m || m.status === status) return false;
    m.status = status;
    return true;
  }

  async _flushOutbox(onlyPeer) {
    if (!this.state.outbox.length || this.flushing) return;
    const t = now();
    const due = this.state.outbox.filter(o => (!onlyPeer || o.to === onlyPeer) && o.nextAt <= t);
    if (!due.length) return;

    this.flushing = true;
    let changed = false;
    try {
      for (const o of due) {
        const addr = this.peerAddr(o.to);
        if (!addr || !addr.online) { o.nextAt = t + OUTBOX_TICK * 2; continue; }
        o.tries++;
        const r = await this._dial(addr, o.frame);
        if (r.ok) {
          this.state.outbox = this.state.outbox.filter(x => x !== o);
          if (o.chatId) changed = this._setStatus(o.to, o.chatId, 'sent') || changed;
        } else if (o.queuedAt + OUTBOX_TTL < now() || o.tries > 40) {
          this.state.outbox = this.state.outbox.filter(x => x !== o);
          if (o.chatId) changed = this._setStatus(o.to, o.chatId, 'failed') || changed;
        } else {
          o.nextAt = t + Math.min(60000, OUTBOX_TICK * Math.pow(1.6, Math.min(o.tries, 8)));
          changed = true;
        }
      }
    } finally {
      this.flushing = false;
    }
    if (changed) this._push(['chats', 'outbox']);
  }

  // -------------------------------------------------------------- api
  setName(name) {
    const n = clean(name, 24);
    if (!n || n === this.self.name) return this.self.name;
    this.self.name = n;
    this._beat();
    this._save();
    return n;
  }

  // Announced, not enforced: it tells other people you are heads-down. Their
  // messages still arrive and still queue — nothing is refused.
  setDnd(on) {
    const next = on === true;
    if (next === this.self.dnd) return next;
    this.self.dnd = next;
    this._beat();
    return next;
  }

  setPublic(pub) {
    this.self.public = pub === true;
    this._beat();
    this._save();
    return this.self.public;
  }

  identity() {
    return {
      id: this.self.id, name: this.self.name, avatar: this.self.avatar,
      host: this.self.host, user: this.self.user,
      port: this.self.port, public: this.self.public,
      fingerprint: fingerprint(this.self.pub)
    };
  }

  setAvatar(a) {
    const next = okAvatar(a, this.self.id);
    if (next === this.self.avatar) return next;
    this.self.avatar = next;
    this._beat();          // let everyone see the new face immediately
    this._save();
    return next;
  }

  async _deliver(peerId, frame, rec) {
    this._append(peerId, rec);
    this._push(['chats']);
    const addr = this.peerAddr(peerId);
    if (!addr) { rec.status = 'failed'; this._push(['chats']); return { ok: false, error: 'unknown-peer' }; }
    if (!addr.online) {
      rec.status = 'queued';
      this._queue(peerId, frame, rec.id);
      this._push(['chats', 'outbox']);
      return { ok: true, queued: true };
    }
    const r = await this._dial(addr, frame);
    rec.status = r.ok ? 'sent' : 'queued';
    if (!r.ok) this._queue(peerId, frame, rec.id);
    this._push(['chats', 'outbox']);
    return { ok: true, queued: !r.ok, error: r.ok ? null : r.error };
  }

  sendMessage(peerId, text) {
    const body = clean(text, 2000);
    if (!body) return Promise.resolve({ ok: false, error: 'empty' });
    if (!this.peerAddr(peerId)) return Promise.resolve({ ok: false, error: 'unknown-peer' });
    const frame = this._envelope('msg', { text: body });
    return this._deliver(peerId, frame, { id: frame.mid, dir: 'out', kind: 'text', text: body, ts: now(), status: 'sending' });
  }

  sendTask(peerId, { title, desc, preferredQ } = {}) {
    const t = clean(title, 140);
    if (!t) return Promise.resolve({ ok: false, error: 'empty' });
    if (!this.peerAddr(peerId)) return Promise.resolve({ ok: false, error: 'unknown-peer' });
    const q = QUADS.includes(preferredQ) ? preferredQ : 'do';
    const frame = this._envelope('task', { taskId: rid(), title: t, desc: clean(desc, 600), preferredQ: q });
    return this._deliver(peerId, frame, { id: frame.mid, dir: 'out', kind: 'task', text: t, q, ts: now(), status: 'sending' });
  }

  // Answering resolves against the inbox entry's own id, never its list position —
  // the list re-sorts under the user whenever anything else arrives.
  async answerTask(inboxId, accepted, q) {
    const i = this.state.inbox.findIndex(x => x.id === inboxId);
    if (i < 0) return { ok: false, error: 'gone' };
    const item = this.state.inbox[i];
    this.state.inbox.splice(i, 1);
    this._push(['inbox']);

    const quad = QUADS.includes(q) ? q : item.preferredQ;
    const frame = this._envelope('task-ack', { taskId: item.taskId, taskTitle: item.title, accepted: !!accepted, q: quad });
    const rec = { id: frame.mid, dir: 'out', kind: accepted ? 'accepted' : 'denied', text: item.title, q: quad, ts: now(), status: 'sending' };

    // The sender may already be gone; fall back to the address the task arrived from.
    if (!this.peerAddr(item.fromId) && item.ip && item.port) {
      this.state.people[item.fromId] = {
        id: item.fromId, name: item.fromName, ip: item.ip, port: item.port,
        public: false, lastSeen: item.ts, firstSeen: item.ts
      };
    }
    await this._deliver(item.fromId, frame, rec);
    return { ok: true, item };
  }

  async requestMatrix(peerId) {
    const addr = this.peerAddr(peerId);
    if (!addr) return { ok: false, error: 'unknown-peer' };
    if (!addr.online) return { ok: false, error: 'offline' };
    const r = await this._dial(addr, this._envelope('matrix-req', {}), 'matrix-res');
    if (!r.ok) return { ok: false, error: r.error };
    if (r.data.error) return { ok: false, error: r.data.error };
    return { ok: true, tasks: Array.isArray(r.data.tasks) ? r.data.tasks.slice(0, 300) : [] };
  }

  // Clears the "their key changed" flag once a person has looked at it.
  ackKey(peerId) {
    const p = this.state.people[peerId];
    if (!p || !p.keyChanged) return false;
    p.keyChanged = false;
    this._push([]);
    return true;
  }

  // Sent when a task somebody assigned you is ticked off. Best effort by design —
  // it queues like anything else, and a task is done whether or not the news lands.
  reportDone(peerId, title) {
    const t = clean(title, 140);
    if (!t || !this.peerAddr(peerId)) return Promise.resolve({ ok: false });
    const frame = this._envelope('task-done', { taskTitle: t });
    return this._deliver(peerId, frame, {
      id: frame.mid, dir: 'out', kind: 'done', text: t, ts: now(), status: 'sending'
    });
  }

  markRead(peerId) {
    if (!this.state.unread[peerId]) return false;
    delete this.state.unread[peerId];
    this._push(['unread']);
    return true;
  }

  totalUnread() {
    return Object.values(this.state.unread).reduce((a, b) => a + (b || 0), 0) + this.state.inbox.length;
  }

  clearChat(peerId) {
    delete this.state.chats[peerId];
    delete this.state.unread[peerId];
    this.state.outbox = this.state.outbox.filter(o => o.to !== peerId);
    this._push(['chats', 'unread', 'outbox']);
  }

  forgetPeer(peerId) {
    delete this.state.chats[peerId];
    delete this.state.unread[peerId];
    delete this.state.people[peerId];
    this.state.outbox = this.state.outbox.filter(o => o.to !== peerId);
    this.state.inbox = this.state.inbox.filter(t => t.fromId !== peerId);
    this._push(['chats', 'unread', 'inbox', 'outbox']);
  }

  data() {
    return {
      self: this.identity(),
      people: this.people(),
      chats: this.state.chats,
      unread: this.state.unread,
      inbox: this.state.inbox,
      outbox: this._outboxView()
    };
  }
}

module.exports = { Garden, AVATARS, pickAvatar, fingerprint, pairCode, PROTO, DISCO_PORT };
