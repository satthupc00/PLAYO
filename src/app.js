/* M PlayO - renderer */
'use strict';
/* window.api do preload cung cấp */
const $ = id => document.getElementById(id);
const video = $('video'), stage = $('stage'), tl = $('tl');
if (window.api) document.documentElement.classList.add('electron');

/* ================= Phím tắt ================= */
const ACTIONS = [
  ['playPause', 'Phát / dừng', ['Space']],
  ['prevFrame', 'Lùi 1 frame', ['Comma', 'ArrowLeft']],
  ['nextFrame', 'Tiến 1 frame', ['Period', 'ArrowRight']],
  ['prev10', 'Lùi 10 frame', ['Shift+Comma', 'Shift+ArrowLeft']],
  ['next10', 'Tiến 10 frame', ['Shift+Period', 'Shift+ArrowRight']],
  ['home', 'Về đầu', ['Home']],
  ['end', 'Về cuối', ['End']],
  ['slower', 'Chậm lại', ['KeyJ']],
  ['pause', 'Dừng', ['KeyK']],
  ['faster', 'Nhanh lên', ['KeyL']],
  ['loop', 'Bật / tắt lặp lại', ['KeyR']],
  ['markIn', 'Đặt điểm đầu đoạn', ['KeyI']],
  ['markOut', 'Đặt điểm cuối đoạn', ['KeyO']],
  ['clearRange', 'Xoá đoạn đánh dấu', ['KeyX']],
  ['mute', 'Tắt / bật tiếng', ['KeyM']],
  ['volUp', 'Tăng âm lượng', ['Equal', 'NumpadAdd']],
  ['volDown', 'Giảm âm lượng', ['Minus', 'NumpadSubtract']],
  ['fullscreen', 'Toàn màn hình', ['KeyF']],
  ['fit', 'Zoom vừa khung', ['Digit0']],
  ['rotLeft', 'Xoay trái 90°', ['Ctrl+ArrowLeft']],
  ['rotRight', 'Xoay phải 90°', ['Ctrl+ArrowRight']],
  ['fitWindow', 'Co cửa sổ vừa khít video (giữ chuột trái hoặc Ctrl + click phải)', []],
  ['actual', 'Zoom 100% (kích thước gốc)', ['Digit1']],
  ['open', 'Mở video', ['Ctrl+KeyO']],
  ['newWindow', 'Mở video này trong cửa sổ mới', ['Ctrl+KeyN']]
];
const LABEL = Object.fromEntries(ACTIONS.map(a => [a[0], a[1]]));
const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('mplayo.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mplayo.' + k, JSON.stringify(v)); } catch {} }
};
let keymap = Object.assign({}, DEFAULT_KEYS, store.get('keys', {}));

function comboOf(e) {
  return (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code;
}
const CODE_LABEL = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', PageUp: 'PgUp', PageDown: 'PgDn' };
function codeLabel(c) {
  if (CODE_LABEL[c]) return CODE_LABEL[c];
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad/.test(c)) return 'Num ' + c.slice(6);
  return c;
}
const comboLabel = k => k.split('+').map(p => ['Ctrl', 'Alt', 'Shift'].includes(p) ? p : codeLabel(p)).join('+');
const keyText = act => (keymap[act] || []).map(comboLabel).join(' / ');
const kbdHtml = k => k.split('+').map(p => `<kbd>${esc(['Ctrl', 'Alt', 'Shift'].includes(p) ? p : codeLabel(p))}</kbd>`).join('+');
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

/* ================= Trạng thái ================= */
const S = {
  file: null, name: '', fps: 30, frames: 0, frame: 0, ready: false, token: 0,
  z: { s: 1, x: 0, y: 0, fit: true },
  speedIdx: 3,
  loop: true,
  rot: 0, // góc xoay video: 0 / 90 / 180 / 270
  range: null // đoạn đánh dấu {a, b}: frame đầu và frame cuối (tính cả 2)
};
const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2, 4];

/* ================= Mở file ================= */
let busyTimer = 0;
function showBusy(title, withBar, sub) {
  clearTimeout(busyTimer);
  $('busyTitle').textContent = title;
  $('busySub').textContent = sub || '';
  $('busyBar').parentElement.hidden = !withBar;
  $('busyBar').style.width = '0%';
  $('busy').hidden = false;
}
function showBusyLater(title) { clearTimeout(busyTimer); busyTimer = setTimeout(() => showBusy(title), 180); }
function hideBusy() { clearTimeout(busyTimer); $('busy').hidden = true; }

async function openFile(file) {
  if (!file) return;
  const token = ++S.token;
  video.pause();
  S.ready = false;
  seekBusy = false; seekTarget = null; // bỏ lệnh tua còn dở của video cũ
  setRange(null);
  S.rot = 0;
  showBusyLater('Đang mở…');
  const r = await api.open(file);
  if (token !== S.token) return;
  if (r.error) { hideBusy(); toast(r.error); return; }
  S.file = file; S.name = r.name;
  const info = r.info || {};
  S.fps = info.fps > 0 ? info.fps : 30;
  S.frames = info.frames || 0;
  S.info = info;
  renderFileInfo(r.name, info);
  api.setTitle(r.name + ' — M PlayO');
  if (r.native) loadSrc(r.url, true, token); else transcode(token);
}

async function transcode(token) {
  showBusy('Đang chuẩn bị video…', true, 'AVI / ProRes được chuyển sang dạng xem mượt. Lần sau mở lại sẽ tức thì.');
  const r = await api.transcode(S.file);
  if (token !== S.token) return;
  if (r.error) { if (r.error !== 'cancelled') { hideBusy(); toast('Không mở được video này'); } return; }
  loadSrc(r.url, false, token);
}

function loadSrc(url, allowFallback, token) {
  const onData = () => { cleanup(); if (token === S.token) onReady(); };
  const onErr = () => {
    cleanup();
    if (token !== S.token) return;
    if (allowFallback) transcode(token); else { hideBusy(); toast('Không phát được video này'); }
  };
  const cleanup = () => { video.removeEventListener('loadeddata', onData); video.removeEventListener('error', onErr); };
  video.addEventListener('loadeddata', onData);
  video.addEventListener('error', onErr);
  video.src = url;
  video.load();
}

function onReady() {
  hideBusy();
  S.ready = true;
  const dur = video.duration || (S.info && S.info.duration) || 0;
  S.frames = Math.max(1, S.frames || Math.round(dur * S.fps));
  // khớp số frame với độ dài thật của video (tránh lệch khi metadata sai)
  if (dur && Math.abs(S.frames / S.fps - dur) > 2 / S.fps) S.frames = Math.max(1, Math.round(dur * S.fps));
  S.frame = 0;
  stage.classList.add('has-video');
  $('empty').hidden = true;
  $('ctrl').classList.remove('disabled');
  $('osd').hidden = false;
  S.z.fit = true; layout();
  updateTicks(); updateUI();
  video.playbackRate = SPEEDS[S.speedIdx];
  play();
}

function renderFileInfo(name, info) {
  const fi = $('fileInfo');
  const tags = [];
  if (info.width) tags.push(`${info.width}×${info.height}`);
  if (info.fps) tags.push(`${+info.fps.toFixed(3)} fps`);
  if (info.vcodec) tags.push(info.vcodec.toUpperCase());
  if (info.duration) tags.push(fmtTime(info.duration));
  // chỉ hiện tên file; thông số video nằm trong tooltip
  fi.innerHTML = `<b title="${esc(name + (tags.length ? '\n' + tags.join(' · ') : ''))}">${esc(name)}</b>`;
}

/* ================= Frame & thời gian ================= */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function fmtTime(t) {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000 + 1e-6);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (h ? h + ':' + p(m) : p(m)) + ':' + p(s) + '.' + p(ms, 3);
}

let seekBusy = false, seekTarget = null;
function seekTime(t) {
  seekTarget = clamp(t, 0, Math.max(0, (video.duration || 0) - 0.0005));
  if (!seekBusy) { seekBusy = true; video.currentTime = seekTarget; seekTarget = null; }
}
video.addEventListener('seeked', () => {
  if (seekTarget != null) { const t = seekTarget; seekTarget = null; video.currentTime = t; }
  else seekBusy = false;
});
function seekFrame(n) {
  if (!S.ready) return;
  n = clamp(Math.round(n), 0, S.frames - 1);
  S.frame = n;
  seekTime((n + 0.5) / S.fps);
  updateUI();
}
function step(d) {
  if (!S.ready) return;
  if (!video.paused) { video.pause(); S.frame = frameFromTime(video.currentTime); }
  seekFrame(S.frame + d);
}
const frameFromTime = t => clamp(Math.floor(t * S.fps + 1e-4), 0, Math.max(0, S.frames - 1));

// lấy frame thật đang hiển thị
if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
  const onFrame = (_now, meta) => {
    if (S.ready && !seekBusy) {
      const f = clamp(Math.round(meta.mediaTime * S.fps), 0, S.frames - 1);
      if (!video.paused || Math.abs(f - S.frame) <= 1) S.frame = f;
      updateUI();
    }
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}

function play() {
  if (!S.ready) return;
  if (rangeActive()) {
    const { a, b } = S.range;
    if (S.frame < a || S.frame >= b) { S.frame = a; seekTime((a + 0.5) / S.fps); }
  } else if (S.frame >= S.frames - 1 && !video.loop) { S.frame = 0; video.currentTime = 0; }
  video.play().catch(() => {});
}
function togglePlay() { if (!S.ready) return; video.paused ? play() : pause(); }
function pause() { if (!video.paused) { video.pause(); S.frame = frameFromTime(video.currentTime); seekFrame(S.frame); } }
video.addEventListener('play', () => document.body.classList.add('playing'));
video.addEventListener('pause', () => { document.body.classList.remove('playing'); updateUI(); });
video.addEventListener('ended', () => {
  if (rangeActive()) { S.frame = S.range.a; seekTime((S.range.a + 0.5) / S.fps); video.play().catch(() => {}); return; }
  S.frame = S.frames - 1; updateUI();
});

/* ================= Đánh dấu đoạn + lặp đoạn ================= */
const rangeActive = () => !!(S.loop && S.range && S.ready);
const curFrame = () => video.paused ? S.frame : frameFromTime(video.currentTime);
function applyLoop() {
  video.loop = S.loop && !S.range;          // có đoạn đánh dấu thì app tự lặp trong đoạn
  $('btnLoop').classList.toggle('on', S.loop);
  $('btnLoop').classList.toggle('range', !!(S.loop && S.range));
  const k = keyText('loop');
  $('btnLoop').title = (S.loop && S.range ? 'Lặp đoạn đánh dấu: đang bật' : S.loop ? 'Lặp lại: đang bật' : 'Lặp lại: đang tắt') + (k ? ` (${k})` : '');
  $('rng').classList.toggle('off', !S.loop);
}
function setRange(a, b) {
  if (a == null || !S.frames) S.range = null;
  else {
    a = clamp(a, 0, S.frames - 1); b = clamp(b, 0, S.frames - 1);
    if (a > b) [a, b] = [b, a];
    S.range = { a, b };
  }
  applyLoop(); renderRange();
}
function renderRange() {
  const r = S.range, el = $('rng'), chip = $('btnRange');
  el.hidden = chip.hidden = !r;
  if (!r) return;
  el.style.left = (r.a / S.frames * 100) + '%';
  el.style.width = ((r.b - r.a + 1) / S.frames * 100) + '%';
  chip.textContent = `F${r.a + 1}–F${r.b + 1}`;
  chip.title = `Đoạn đánh dấu: ${r.b - r.a + 1} frame (${fmtTime(r.a / S.fps)} → ${fmtTime((r.b + 1) / S.fps)}) · bấm để xoá (${keyText('clearRange') || 'X'})`;
}
function markIn() {
  if (!S.ready) return;
  const f = curFrame(), b = S.range ? S.range.b : S.frames - 1;
  setRange(f, f > b ? S.frames - 1 : b);
  toast(`Điểm đầu đoạn: F${S.range.a + 1}`);
}
function markOut() {
  if (!S.ready) return;
  const f = curFrame(), a = S.range ? S.range.a : 0;
  setRange(f < a ? 0 : a, f);
  toast(`Điểm cuối đoạn: F${S.range.b + 1}`);
}
function clearRange() { if (S.range) { setRange(null); toast('Đã xoá đoạn đánh dấu'); } }
// đang phát + lặp đoạn: tới cuối đoạn thì quay về đầu đoạn
function enforceRange() {
  if (!rangeActive() || video.paused || seekBusy || scrub) return;
  const { a, b } = S.range, t = video.currentTime;
  if (t >= (b + 1) / S.fps - 0.25 / S.fps || t < (a - 0.5) / S.fps) { S.frame = a; seekTime((a + 0.5) / S.fps); }
}

/* ================= Timeline ================= */
let lastTc = '';
function updateUI() {
  if (!S.ready) return;
  const playingNow = !video.paused && !seekBusy;
  const pos = playingNow ? clamp(video.currentTime / (video.duration || 1), 0, 1) : (S.frame + 0.5) / S.frames;
  const pct = (pos * 100).toFixed(3) + '%';
  $('fill').style.width = pct;
  $('head').style.left = pct;
  const tc = `${fmtTime(S.frame / S.fps)} <span>/ ${fmtTime(S.frames / S.fps)}</span> &nbsp; F${S.frame + 1} <span>/ ${S.frames}</span>`;
  if (tc !== lastTc) { $('tc').innerHTML = tc; lastTc = tc; $('osd').textContent = `Frame ${S.frame + 1} / ${S.frames}`; }
}
(function loop() { if (S.ready && !video.paused) { enforceRange(); updateUI(); } requestAnimationFrame(loop); })();

function updateTicks() {
  const w = tl.clientWidth, px = S.frames ? w / S.frames : 0;
  const t = $('ticks');
  t.style.display = px >= 4 ? '' : 'none';
  t.style.setProperty('--tick', px + 'px');
}
const frameAtX = clientX => {
  const r = tl.getBoundingClientRect();
  return clamp(Math.floor((clientX - r.left) / r.width * S.frames), 0, S.frames - 1);
};
let scrub = null;
// kéo timeline = tua; kéo 2 đầu đoạn đỏ = chỉnh đoạn; Shift + kéo = đánh dấu đoạn mới
tl.addEventListener('pointerdown', e => {
  if (!S.ready || e.button !== 0) return;
  tl.setPointerCapture(e.pointerId);
  const f = frameAtX(e.clientX);
  const h = e.target.closest('.rh');
  scrub = { wasPlaying: !video.paused, handle: h ? (h.classList.contains('a') ? 'a' : 'b') : null, start: e.shiftKey ? f : null };
  video.pause();
  tl.classList.add('drag');
  if (scrub.start != null) setRange(f, f);
  if (!scrub.handle) seekFrame(f);
  showTip(e.clientX);
});
tl.addEventListener('pointermove', e => {
  if (!S.ready) return;
  showTip(e.clientX);
  if (!scrub) return;
  const f = frameAtX(e.clientX);
  if (scrub.handle === 'a') setRange(Math.min(f, S.range.b), S.range.b);
  else if (scrub.handle === 'b') setRange(S.range.a, Math.max(f, S.range.a));
  else if (scrub.start != null) setRange(scrub.start, f);
  seekFrame(f);
});
const endScrub = () => {
  if (!scrub) return;
  tl.classList.remove('drag');
  const w = scrub.wasPlaying; scrub = null;
  if (w) play();
};
tl.addEventListener('pointerup', endScrub);
tl.addEventListener('pointercancel', endScrub);
tl.addEventListener('pointerleave', () => { if (!scrub) $('tip').hidden = true; });
tl.addEventListener('wheel', e => { if (!S.ready) return; e.preventDefault(); step(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }, { passive: false });
function showTip(clientX) {
  const r = tl.getBoundingClientRect();
  const f = frameAtX(clientX);
  const x = clamp(clientX - r.left, 0, r.width);
  const tip = $('tip');
  tip.hidden = false;
  tip.textContent = `${fmtTime(f / S.fps)} · F${f + 1}`;
  const half = tip.offsetWidth / 2;
  tip.style.left = clamp(x, half, r.width - half) + 'px';
  $('hoverLine').style.left = x + 'px';
}

/* ================= Zoom & pan ================= */
// kích thước gốc của video
function nSize() { return [video.videoWidth || (S.info && S.info.width) || 16, video.videoHeight || (S.info && S.info.height) || 9]; }
// kích thước video đang hiển thị (đã tính xoay 90° / 270°)
function vSize() { const [w, h] = nSize(); return S.rot % 180 ? [h, w] : [w, h]; }
function layout() {
  const [vw, vh] = vSize();
  const W = stage.clientWidth, H = stage.clientHeight;
  const [nw, nh] = nSize();
  video.style.width = nw + 'px'; video.style.height = nh + 'px';
  if (S.z.fit) {
    const s = Math.min(W / vw, H / vh);
    S.z = { s, x: (W - vw * s) / 2, y: (H - vh * s) / 2, fit: true };
  }
  applyZoom();
}
function applyZoom() {
  const [nw, nh] = nSize(), [ew, eh] = vSize();
  // xoay quanh tâm video, rồi đặt khung đã xoay vào vị trí (x, y) với tỉ lệ s
  video.style.transform = `translate(${S.z.x}px,${S.z.y}px) scale(${S.z.s}) translate(${ew / 2}px,${eh / 2}px) rotate(${S.rot}deg) translate(${-nw / 2}px,${-nh / 2}px)`;
  video.classList.toggle('pixel', S.z.s >= 3);
}
let badgeTimer = 0;
function showZoomBadge() { showBadge(Math.round(S.z.s * 100) + '%'); }
function showBadge(text) {
  const b = $('zoomBadge');
  b.hidden = false; b.classList.remove('fade');
  b.textContent = text;
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => b.classList.add('fade'), 900);
}
function zoomAt(factor, cx, cy) {
  const ns = clamp(S.z.s * factor, 0.05, 40);
  const k = ns / S.z.s;
  S.z = { s: ns, x: cx - (cx - S.z.x) * k, y: cy - (cy - S.z.y) * k, fit: false };
  applyZoom(); showZoomBadge();
}
function zoomTo(s) {
  const r = stage.getBoundingClientRect();
  zoomAt(s / S.z.s, r.width / 2, r.height / 2);
  const [vw, vh] = vSize();
  S.z.x = (r.width - vw * S.z.s) / 2; S.z.y = (r.height - vh * S.z.s) / 2;
  applyZoom();
}
function rotate(d) {
  if (!S.ready) return;
  S.rot = ((S.rot + d) % 360 + 360) % 360;
  S.z.fit = true; layout();
  showBadge(S.rot ? `Xoay ${S.rot}°` : 'Không xoay');
}
function fit() { S.z.fit = true; layout(); showZoomBadge(); }

// lăn chuột trên video = zoom ngay tại vị trí con chuột
stage.addEventListener('wheel', e => {
  if (!S.ready || e.target.closest('.busy')) return;
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  zoomAt(Math.exp(-d * 0.0018), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

let pan = null;
// Giữ chuột trái + click chuột phải = co cửa sổ app vừa khít video đang xem
function fitWindow() {
  if (!S.ready || document.body.classList.contains('fs')) return;
  const [vw, vh] = vSize();
  S.z.fit = true;
  // sau khi cửa sổ đổi cỡ: căn video vào giữa khung (kể cả khi cửa sổ chạm cỡ tối thiểu / không đổi cỡ)
  api.fitWindow({ sw: vw * S.z.s, sh: vh * S.z.s, cw: innerWidth - stage.clientWidth, ch: innerHeight - stage.clientHeight })
    .then(() => { layout(); setTimeout(layout, 120); setTimeout(layout, 400); });
}
let skipMenu = false;
function chordFit() { skipMenu = true; if (pan) pan.cancel = true; fitWindow(); }
// đang giữ chuột trái mà bấm thêm chuột phải: trình duyệt báo bằng pointermove (button = 2)
stage.addEventListener('pointermove', e => { if (e.button === 2 && (e.buttons & 3) === 3) chordFit(); });
stage.addEventListener('pointerdown', e => {
  if (!S.ready || (e.button !== 0 && e.button !== 1)) return;
  if (e.target.closest('.busy')) return;
  e.preventDefault();
  stage.setPointerCapture(e.pointerId);
  pan = { x: e.clientX, y: e.clientY, ox: S.z.x, oy: S.z.y, moved: false };
});
stage.addEventListener('pointermove', e => {
  if (!pan || pan.cancel) return;   // sau khi co cửa sổ: bỏ kéo (cửa sổ dời chỗ làm con trỏ 'di chuyển' giả)
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 4) return;
  pan.moved = true;
  stage.classList.add('panning');
  S.z.x = pan.ox + dx; S.z.y = pan.oy + dy; S.z.fit = false;
  applyZoom();
});
const endPan = () => { pan = null; stage.classList.remove('panning'); };
// click (không kéo) = phát / dừng; double-click = 2 lần click (trạng thái phát giữ nguyên) + toàn màn hình
stage.addEventListener('pointerup', e => {
  const click = pan && !pan.moved && !pan.cancel && e.button === 0;
  const midClick = pan && !pan.moved && e.button === 1;   // click chuột giữa = zoom vừa khung
  if (midClick) { endPan(); fit(); return; }
  endPan();
  if (click) togglePlay();
});
stage.addEventListener('pointercancel', endPan);
stage.addEventListener('dblclick', e => { if (S.ready && !e.target.closest('.busy')) toggleFullscreen(); });
new ResizeObserver(() => { if (S.ready) { if (S.z.fit) layout(); updateTicks(); } }).observe(stage);
new ResizeObserver(() => { if (S.ready) updateTicks(); }).observe(tl);

/* ================= Các nút ================= */
function cycleSpeed(d) {
  S.speedIdx = clamp(S.speedIdx + d, 0, SPEEDS.length - 1);
  video.playbackRate = SPEEDS[S.speedIdx];
  $('btnSpeed').textContent = SPEEDS[S.speedIdx] + '×';
  $('btnSpeed').classList.toggle('on', SPEEDS[S.speedIdx] !== 1);
}
$('btnSpeed').addEventListener('click', e => {
  if (e.shiftKey) cycleSpeed(-1);
  else if (S.speedIdx === SPEEDS.length - 1) cycleSpeed(-(SPEEDS.length - 1 - 3)); else cycleSpeed(1);
});
$('btnRange').addEventListener('click', clearRange);
$('btnSpeed').addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); cycleSpeed(-1); });

function setLoop(v) { S.loop = v; store.set('loop', v); applyLoop(); }
function setMute(v) { video.muted = v; document.body.classList.toggle('muted-on', v); store.set('muted', v); }
function setVolume(v, badge) {
  v = Math.round(clamp(v, 0, 1) * 100) / 100;
  video.volume = v; $('vol').value = v; store.set('vol', v);
  if (video.muted && v > 0) setMute(false);
  $('vol').title = `Âm lượng ${Math.round(v * 100)}% (+ / −, lăn chuột)`;
  if (badge) showBadge(`Âm lượng ${Math.round(v * 100)}%`);
}
$('vol').addEventListener('input', e => setVolume(+e.target.value));
// lăn chuột trên nút loa / thanh âm lượng để chỉnh
[$('vol'), $('btnMute')].forEach(el => el.addEventListener('wheel', e => { e.preventDefault(); setVolume(video.volume + (e.deltaY < 0 ? 0.05 : -0.05), true); }, { passive: false }));
setVolume(store.get('vol', 1));
setLoop(store.get('loop', true)); setMute(store.get('muted', false));

async function toggleFullscreen() { await api.toggleFullscreen(); }
api.on('fullscreen', v => {
  document.body.classList.toggle('fs', v); bumpIdle();
  if (S.ready) fit();   // vào / thoát toàn màn hình: video zoom vừa khung, căn giữa
});
let idleTimer = 0;
function bumpIdle() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  if (document.body.classList.contains('fs')) idleTimer = setTimeout(() => { if (!video.paused) document.body.classList.add('idle'); }, 2200);
}
document.addEventListener('pointermove', bumpIdle);

async function openDialog(newWin) {
  const f = await api.openDialog();
  if (f) newWin ? api.newWindow(f) : openFile(f);
}

const RUN = {
  playPause: togglePlay, prevFrame: () => step(-1), nextFrame: () => step(1),
  prev10: () => step(-10), next10: () => step(10),
  home: () => { pause(); seekFrame(0); }, end: () => { pause(); seekFrame(S.frames - 1); },
  slower: () => cycleSpeed(-1), faster: () => { cycleSpeed(1); if (video.paused) play(); }, pause: () => pause(),
  loop: () => setLoop(!S.loop), markIn, markOut, clearRange, mute: () => setMute(!video.muted),
  volUp: () => setVolume((video.muted ? 0 : video.volume) + 0.1, true), volDown: () => setVolume(video.volume - 0.1, true),
  fullscreen: toggleFullscreen, fit: () => S.ready && fit(), fitWindow,
  rotLeft: () => rotate(-90), rotRight: () => rotate(90), actual: () => S.ready && zoomTo(1),
  open: () => openDialog(false), newWindow: () => S.file ? api.newWindow(S.file) : openDialog(true)
};
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => RUN[b.dataset.act]()));

function refreshTitles() {
  document.querySelectorAll('[data-act]').forEach(b => {
    const a = b.dataset.act, k = keyText(a);
    b.title = LABEL[a] + (k ? ` (${k})` : '');
  });
  $('btnSpeed').title = `Tốc độ (${keyText('slower') || '-'} chậm / ${keyText('faster') || '-'} nhanh)`;
  const kb = a => (keymap[a] || []).slice(0, 2).map(kbdHtml).join(' ');
  $('emptyKeys').innerHTML = [['playPause'], ['prevFrame', 'nextFrame'], ['prev10', 'next10'], ['markIn', 'markOut'], ['fit']]
    .map(g => `<span>${g.map(kb).join(' &nbsp;')}</span><span>${g.map(a => LABEL[a]).join(' / ')}</span>`).join('') +
    `<span>Lăn chuột</span><span>Zoom tại con chuột · kéo chuột để di chuyển</span>` +
    `<span>Click / double-click</span><span>Phát–dừng / toàn màn hình</span>`;
  const p = (keymap.prevFrame || [])[0], n = (keymap.nextFrame || [])[0];
  $('hint').textContent = `${p ? comboLabel(p) : ''} ${n ? comboLabel(n) : ''} từng frame · Shift: 10 frame · ${comboLabel((keymap.markIn || ['I'])[0])}/${comboLabel((keymap.markOut || ['O'])[0])}: đánh dấu đoạn lặp · Lăn chuột: zoom · Kéo: di chuyển · Click: phát/dừng · Double-click: toàn màn hình · Giữ trái / Ctrl + click phải: cửa sổ vừa video`;
}

/* ================= Bàn phím ================= */
let listening = null;
document.addEventListener('keydown', e => {
  if (listening) return captureKey(e);
  if (e.key === 'Escape') {
    if (!$('menu').hidden) return hideMenu();
    const open = [...document.querySelectorAll('.modal-bg')].find(m => !m.hidden);
    if (open) return closeModal(open);
    if (document.body.classList.contains('fs')) return api.exitFullscreen();
    return;
  }
  if (document.querySelector('.modal-bg:not([hidden])')) return;
  if (e.target.matches('input[type=text],textarea')) return;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const combo = comboOf(e);
  let act = Object.keys(keymap).find(a => (keymap[a] || []).includes(combo));
  // phím "+" trên bàn phím thường = Shift + "=": vẫn tính là tăng âm lượng
  if (!act && e.shiftKey && ['Equal', 'Minus'].includes(e.code)) act = Object.keys(keymap).find(a => (keymap[a] || []).includes(e.code) && /^vol/.test(a));
  if (act) { e.preventDefault(); RUN[act](); }
  else if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});

/* ================= Click phải ================= */
function showMenu(x, y) {
  const m = $('menu');
  const has = !!S.file;
  const items = [
    ['Mở trong cửa sổ mới', 'newWindow', !has],
    ['Mở video khác trong cửa sổ mới…', () => openDialog(true)],
    ['Mở video khác…', 'open'],
    '-',
    ['Zoom vừa khung', 'fit', !S.ready],
    ['Zoom 100%', 'actual', !S.ready],
    ['Xoay trái 90°', 'rotLeft', !S.ready],
    ['Xoay phải 90°', 'rotRight', !S.ready],
    ['Co cửa sổ vừa khít video', 'fitWindow', !S.ready],
    ['Toàn màn hình', 'fullscreen'],
    '-',
    ['Đặt điểm đầu đoạn', 'markIn', !S.ready],
    ['Đặt điểm cuối đoạn', 'markOut', !S.ready],
    ['Xoá đoạn đánh dấu', 'clearRange', !S.range],
    '-',
    ['Hiện file trong thư mục', () => api.showInFolder(S.file), !has]
  ];
  m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); continue; }
    const [label, act, dis] = it;
    const d = document.createElement('div');
    d.className = 'mi' + (dis ? ' dis' : '');
    const k = typeof act === 'string' ? (keymap[act] || [])[0] : null;
    d.innerHTML = `<span>${esc(label)}</span>${k ? kbdHtml(k) : ''}`;
    d.addEventListener('click', () => { hideMenu(); typeof act === 'string' ? RUN[act]() : act(); });
    m.appendChild(d);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, 4, innerWidth - r.width - 4) + 'px';
  m.style.top = clamp(y, 4, innerHeight - r.height - 4) + 'px';
}
function hideMenu() { $('menu').hidden = true; }
stage.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (skipMenu) { skipMenu = false; return; }
  if ((e.buttons & 1) || e.ctrlKey) return chordFit();   // giữ chuột trái hoặc Ctrl + click phải
  showMenu(e.clientX, e.clientY);
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu')) hideMenu(); }, true);
window.addEventListener('blur', hideMenu);

/* ================= Kéo thả ================= */
let dragDepth = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('dropzone').hidden = false; });
window.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').hidden = true; } });
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('dropzone').hidden = true;
  const paths = [...e.dataTransfer.files].map(f => { try { return api.pathForFile(f); } catch { return ''; } }).filter(Boolean);
  if (!paths.length) return;
  openFile(paths[0]);
  paths.slice(1).forEach(p => api.newWindow(p));
});
api.on('open-file', f => openFile(f));
api.on('transcode-progress', p => { $('busyBar').style.width = p + '%'; $('busyTitle').textContent = `Đang chuẩn bị video… ${p}%`; });

/* ================= Modal ================= */
function openModal(id) { hideMenu(); $(id).hidden = false; }
function closeModal(m) { m.hidden = true; stopListening(); }
document.querySelectorAll('.modal-bg').forEach(m => {
  m.addEventListener('pointerdown', e => { if (e.target === m) closeModal(m); });
  m.querySelector('[data-close]').addEventListener('click', () => closeModal(m));
});
$('btnSettings').addEventListener('click', () => { renderKeymap(); refreshAssoc(); openModal('settingsModal'); });

/* ================= App mặc định ================= */
async function refreshAssoc() {
  const st = await api.assocStatus();
  const box = $('assocList');
  if (!st.supported) { $('assocText').textContent = 'Chỉ dùng được trên Windows.'; $('btnDefault').disabled = true; box.innerHTML = ''; return st; }
  box.innerHTML = st.list.map(x => `<span class="ext${x.mine ? ' ok' : ''}" title="${x.mine ? 'Đang mở bằng M PlayO' : 'Đang mở bằng app khác'}">${x.ext.slice(1).toUpperCase()}${x.mine ? ' ✓' : ''}</span>`).join('');
  const n = st.list.filter(x => x.mine).length;
  $('assocText').textContent = st.all ? 'M PlayO đã là app mặc định cho tất cả định dạng.' : `M PlayO đang là mặc định cho ${n}/${st.list.length} định dạng.`;
  $('btnDefault').textContent = st.all ? 'Đã là mặc định' : 'Đặt làm app mặc định';
  $('btnDefault').disabled = st.all;
  $('btnDefault2').hidden = st.all;
  return st;
}
async function setDefaultApp() {
  const r = await api.setDefaultApp();
  if (!r.supported && r.supported !== undefined) return toast('Chỉ dùng được trên Windows');
  if (r.done) toast('Đã đặt M PlayO làm app mặc định cho tất cả định dạng');
  else if (r.opened) toast(r.win11
    ? 'Windows cần bạn xác nhận: trong trang vừa mở, bấm “Đặt mặc định” (Set default) ở mục M PlayO'
    : 'Windows cần bạn xác nhận: chọn “Chọn ứng dụng mặc định theo loại tệp”, rồi chọn M PlayO cho các đuôi còn lại', null, null, 9000);
  refreshAssoc();
}
$('btnDefault').addEventListener('click', setDefaultApp);
$('btnDefault2').addEventListener('click', setDefaultApp);
window.addEventListener('focus', () => { if (!$('settingsModal').hidden || !$('btnDefault2').hidden) refreshAssoc(); });

function renderKeymap() {
  const box = $('keymap');
  box.innerHTML = '';
  for (const [act, label] of ACTIONS) {
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label; box.appendChild(l);
    for (let i = 0; i < 2; i++) {
      const k = (keymap[act] || [])[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kslot' + (k ? '' : ' empty-slot');
      b.textContent = k ? comboLabel(k) : '+ thêm phím';
      b.title = 'Bấm rồi nhấn phím mới · Delete để xoá · Esc để huỷ';
      b.addEventListener('click', () => startListening(b, act, i));
      box.appendChild(b);
    }
  }
}
function startListening(btn, act, i) {
  stopListening();
  listening = { btn, act, i };
  btn.classList.add('listening');
  btn.textContent = 'Nhấn phím…';
}
function stopListening() {
  if (!listening) return;
  listening.btn.classList.remove('listening');
  listening = null;
  renderKeymap();
}
function captureKey(e) {
  e.preventDefault(); e.stopPropagation();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const { act, i } = listening;
  const list = (keymap[act] || []).slice();
  if (e.key === 'Escape') return stopListening();
  if (e.key === 'Delete' || e.key === 'Backspace') { list.splice(i, 1); }
  else {
    const combo = comboOf(e);
    for (const a of Object.keys(keymap)) {
      if (a !== act && (keymap[a] || []).includes(combo)) {
        keymap[a] = keymap[a].filter(k => k !== combo);
        toast(`Đã gỡ ${comboLabel(combo)} khỏi "${LABEL[a]}"`);
      }
    }
    const dup = list.indexOf(combo);
    if (dup >= 0) list.splice(dup, 1);
    list[Math.min(i, list.length)] = combo;
  }
  keymap[act] = list.filter(Boolean).slice(0, 2);
  saveKeys();
  stopListening();
}
function saveKeys() { store.set('keys', keymap); refreshTitles(); }
$('btnResetKeys').addEventListener('click', () => { keymap = JSON.parse(JSON.stringify(DEFAULT_KEYS)); saveKeys(); renderKeymap(); toast('Đã khôi phục phím tắt mặc định'); });
$('btnClearCache').addEventListener('click', async () => { const n = await api.clearCache(); toast(n ? `Đã xoá ${n} file tạm` : 'Bộ nhớ tạm đang trống'); });

$('btnWhatsNew').addEventListener('click', () => {
  const w = api.whatsNew();
  const body = $('newsBody');
  if (!w) { body.innerHTML = '<p class="muted">Chưa có thông tin.</p>'; }
  else {
    const d = (w.date || '').split('-').reverse().join('/');
    let h = `<div class="news-ver">v${esc(w.version)}${d ? ' · ' + esc(d) : ''}</div>`;
    for (const [k, t] of [['new', 'Mới'], ['improved', 'Cải thiện'], ['fixed', 'Sửa lỗi']])
      if (w[k] && w[k].length) h += `<div class="news-grp ${k}">${t}</div><ul>${w[k].map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (upd.state === 'available') h += `<p style="margin-top:14px">Có bản mới <b>v${esc(upd.version)}</b> <button type="button" class="primary" id="newsUpd">Cập nhật</button></p>`;
    body.innerHTML = h;
    const nb = $('newsUpd'); if (nb) nb.addEventListener('click', () => api.downloadUpdate());
  }
  openModal('newsModal');
});

/* ================= Cập nhật ================= */
let upd = { state: 'idle' }, userAsked = false;
function renderUpd(s) {
  upd = s;
  const b = $('btnUpdate');
  b.classList.remove('checking', 'latest', 'available', 'error');
  let tip = 'Kiểm tra cập nhật', txt = '';
  switch (s.state) {
    case 'checking': b.classList.add('checking'); tip += ' · Đang kiểm tra…'; txt = 'Đang kiểm tra…'; break;
    case 'latest': b.classList.add('latest'); tip += ' · Đã là bản mới nhất'; txt = 'Đã là bản mới nhất'; break;
    case 'available': b.classList.add('available'); tip = `Có bản mới v${s.version} · Bấm để cập nhật`; txt = `Có bản mới v${s.version}`; break;
    case 'downloading': b.classList.add('checking'); tip = `Đang tải bản mới… ${s.percent || 0}%`; txt = tip; break;
    case 'downloaded': tip = 'Đang cài bản mới…'; txt = tip; break;
    case 'error': b.classList.add('error'); tip += ' · Không kết nối được'; txt = 'Không kiểm tra được'; break;
    case 'dev': tip += ' · Bản chạy thử'; txt = 'Bản chạy thử'; break;
  }
  b.title = tip; b.setAttribute('aria-label', tip);
  $('updText').textContent = txt ? '· ' + txt : '';
  $('latest').hidden = s.state !== 'latest';
  if (s.state === 'available') toast(`Có bản mới v${s.version}`, 'Cập nhật', () => api.downloadUpdate(), 8000);
  else if (userAsked && ['latest', 'error', 'dev'].includes(s.state)) { toast(txt); userAsked = false; }
  else if (s.state === 'downloaded') toast('Đã tải xong, đang cài bản mới…');
}
api.on('update-status', renderUpd);
function clickUpdate() {
  if (upd.state === 'available') { api.downloadUpdate(); toast('Đang tải bản mới…'); return; }
  if (['checking', 'downloading', 'downloaded'].includes(upd.state)) return;
  userAsked = true; api.checkUpdate();
}
$('btnUpdate').addEventListener('click', clickUpdate);
$('btnCheck2').addEventListener('click', clickUpdate);

/* ================= Toast ================= */
let toastTimer = 0;
function toast(msg, btnText, onBtn, ms = 2600) {
  const t = $('toast');
  t.innerHTML = esc(msg);
  if (btnText) {
    const b = document.createElement('button');
    b.className = 'primary'; b.type = 'button'; b.textContent = btnText;
    b.addEventListener('click', () => { t.hidden = true; onBtn(); });
    t.appendChild(b);
  }
  t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ================= Slider fill ================= */
(function tick() {
  const r = $('vol');
  r.style.setProperty('--fill', (r.value * 100) + '%');
  requestAnimationFrame(tick);
})();

/* ================= Khởi động ================= */
$('ctrl').classList.add('disabled');
refreshTitles();
(async () => {
  const init = await api.init();
  $('verText').textContent = 'v' + init.version;
  if (init.file) openFile(init.file);
  renderUpd(await api.updateState());
  if (init.packaged) setTimeout(refreshAssoc, 5000);
  if (init.packaged) setTimeout(() => api.checkUpdate(), 2500);
})();
