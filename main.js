// M PlayO - main process. Giữ file này nhẹ để app mở nhanh: thư viện nặng chỉ require khi cần.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

Menu.setApplicationMenu(null);

const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpg', 'mpeg', 'mts', 'm2ts', 'ts', '3gp', 'gif'];
const isVideo = f => VIDEO_EXT.includes(path.extname(f).slice(1).toLowerCase());

function parseArgs(argv) {
  const out = { files: [], newWindow: argv.includes('--new-window') };
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-')) continue;
    try { if (isVideo(a) && fs.statSync(a).isFile()) out.files.push(path.resolve(a)); } catch {}
  }
  return out;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start();
}

/* ---------- settings ---------- */
let settings = {};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; } }
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch {} }

/* ---------- windows ---------- */
const pending = new Map();      // webContents.id -> file to open on load
let lastFocused = null;

function createWindow(file, offset = 0) {
  const b = settings.bounds || {};
  const win = new BrowserWindow({
    width: b.width || 1180, height: b.height || 760,
    x: b.x != null ? b.x + offset : undefined, y: b.y != null ? b.y + offset : undefined,
    minWidth: 640, minHeight: 420,
    title: 'M PlayO', backgroundColor: '#1F2126',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1F2126', symbolColor: '#FFFFFF', height: 58 },
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false, spellcheck: false
    }
  });
  if (b.maximized && offset === 0) win.maximize();
  win.webContents.setVisualZoomLevelLimits(1, 1);
  if (file) pending.set(win.webContents.id, file);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('focus', () => { lastFocused = win; });
  lastFocused = win;
  const send = (ch, v) => { if (!win.isDestroyed()) win.webContents.send(ch, v); };
  win.on('enter-full-screen', () => send('fullscreen', true));
  win.on('leave-full-screen', () => send('fullscreen', false));
  win.on('close', () => {
    if (!win.isFullScreen()) {
      settings.bounds = { ...win.getNormalBounds(), maximized: win.isMaximized() };
      saveSettings();
    }
  });
  const id = win.webContents.id;
  win.on('closed', () => { cancelJob(id); pending.delete(id); if (lastFocused === win) lastFocused = null; });
  return win;
}

function openInExisting(file) {
  const win = lastFocused && !lastFocused.isDestroyed() ? lastFocused : BrowserWindow.getAllWindows()[0];
  if (!win) return createWindow(file);
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send('open-file', file);
}

function start() {
  app.on('second-instance', (_e, argv) => {
    const a = parseArgs(argv);
    if (!a.files.length) {
      const w = lastFocused || BrowserWindow.getAllWindows()[0];
      if (a.newWindow || !w) createWindow(null, 30); else { if (w.isMinimized()) w.restore(); w.focus(); }
      return;
    }
    a.files.forEach((f, i) => (a.newWindow || i > 0) ? createWindow(f, 30 * (i + 1)) : openInExisting(f));
  });

  app.whenReady().then(() => {
    loadSettings();
    const a = parseArgs(process.argv);
    if (!a.files.length) createWindow(null);
    else a.files.forEach((f, i) => createWindow(f, i * 30));
    setTimeout(cleanCache, 8000);
    setTimeout(autoRegisterAssoc, 4000);
  });
  app.on('window-all-closed', () => app.quit());
}

/* ---------- ffmpeg / ffprobe ---------- */
const unpacked = p => p && p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
let FFMPEG, FFPROBE;
function bins() {
  if (!FFMPEG) {
    try { FFMPEG = unpacked(require('ffmpeg-static')); } catch { FFMPEG = 'ffmpeg'; }
    try { FFPROBE = unpacked(require('ffprobe-static').path); } catch { FFPROBE = 'ffprobe'; }
  }
  return { FFMPEG, FFPROBE };
}

function ratio(s) {
  if (!s) return 0;
  const [n, d] = String(s).split('/').map(Number);
  return d ? n / d : n || 0;
}

function probe(file) {
  const { execFile } = require('child_process');
  return new Promise(resolve => {
    execFile(bins().FFPROBE, ['-v', 'error', '-show_entries',
      'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,pix_fmt:format=duration,format_name',
      '-of', 'json', file], { windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => {
      if (err) return resolve(null);
      try {
        const j = JSON.parse(out);
        const v = (j.streams || []).find(s => s.codec_type === 'video') || {};
        const a = (j.streams || []).find(s => s.codec_type === 'audio');
        let fps = ratio(v.avg_frame_rate) || ratio(v.r_frame_rate);
        if (!fps || fps > 240) fps = ratio(v.r_frame_rate) || 30;
        const duration = parseFloat(v.duration) || parseFloat(j.format && j.format.duration) || 0;
        const frames = parseInt(v.nb_frames, 10) || Math.round(duration * fps);
        resolve({
          vcodec: v.codec_name || '', acodec: a ? a.codec_name : '', pixfmt: v.pix_fmt || '',
          width: v.width || 0, height: v.height || 0, fps, frames, duration,
          format: (j.format && j.format.format_name) || ''
        });
      } catch { resolve(null); }
    });
  });
}

function canPlayNative(file, info) {
  if (!info) return true; // không đọc được thông tin -> cứ thử phát trực tiếp
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!['mp4', 'm4v', 'mov', 'webm', 'mkv'].includes(ext)) return false;
  if (!['h264', 'vp8', 'vp9', 'av1'].includes(info.vcodec)) return false;
  if (info.vcodec === 'h264' && info.pixfmt && !/^yuvj?420p$/.test(info.pixfmt)) return false;
  if (info.acodec && !['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(info.acodec)) return false;
  return true;
}

const cacheDir = () => path.join(app.getPath('temp'), 'mplayo-cache');
function cacheKey(file) {
  const st = fs.statSync(file);
  return require('crypto').createHash('sha1').update(file + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 20);
}
function cleanCache(all = false) {
  const dir = cacheDir();
  let n = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try {
        const st = fs.statSync(p);
        if (all || Date.now() - st.mtimeMs > 3 * 864e5) { fs.unlinkSync(p); n++; }
      } catch {}
    }
  } catch {}
  return n;
}

const jobs = new Map(); // webContents.id -> child process
function cancelJob(id) {
  const p = jobs.get(id);
  if (p) { try { p.kill(); } catch {} jobs.delete(id); }
}

function transcode(sender, file, info) {
  const { spawn } = require('child_process');
  const out = path.join(cacheDir(), cacheKey(file) + '.mp4');
  if (fs.existsSync(out)) { fs.utimesSync(out, new Date(), new Date()); return Promise.resolve(out); }
  fs.mkdirSync(cacheDir(), { recursive: true });
  const part = out + '.part.mp4';
  cancelJob(sender.id);
  const args = ['-hide_banner', '-nostats', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'fastdecode', '-crf', '17', '-g', '6',
    '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-progress', 'pipe:1', part];
  return new Promise((resolve, reject) => {
    const p = spawn(bins().FFMPEG, args, { windowsHide: true });
    jobs.set(sender.id, p);
    const dur = (info && info.duration) || 0;
    let buf = '';
    p.stdout.on('data', d => {
      buf += d;
      const m = buf.match(/out_time_(?:us|ms)=(\d+)/g);
      if (m && dur) {
        const us = parseInt(m[m.length - 1].split('=')[1], 10);
        if (!sender.isDestroyed()) sender.send('transcode-progress', Math.min(99, Math.round(us / 1e6 / dur * 100)));
      }
      if (buf.length > 4096) buf = buf.slice(-1024);
    });
    p.stderr.on('data', () => {});
    p.on('error', reject);
    p.on('close', code => {
      if (jobs.get(sender.id) === p) jobs.delete(sender.id);
      if (code === 0) { try { fs.renameSync(part, out); return resolve(out); } catch (e) { return reject(e); } }
      try { fs.unlinkSync(part); } catch {}
      reject(new Error(code === null ? 'cancelled' : 'ffmpeg ' + code));
    });
  });
}

/* ---------- IPC ---------- */
ipcMain.handle('init', e => {
  const file = pending.get(e.sender.id) || null;
  pending.delete(e.sender.id);
  return { file, version: app.getVersion(), packaged: app.isPackaged };
});

ipcMain.handle('open', async (e, file) => {
  if (!file || !fs.existsSync(file)) return { error: 'Không tìm thấy file' };
  cancelJob(e.sender.id);
  const info = await probe(file);
  const native = canPlayNative(file, info);
  return { info, native, url: native ? pathToFileURL(file).href : null, name: path.basename(file) };
});

ipcMain.handle('transcode', async (e, file) => {
  try {
    const info = await probe(file);
    const out = await transcode(e.sender, file, info);
    return { url: pathToFileURL(out).href };
  } catch (err) {
    return { error: String(err.message || err) };
  }
});
ipcMain.handle('cancel', e => cancelJob(e.sender.id));

ipcMain.handle('open-dialog', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Mở video', properties: ['openFile'],
    filters: [{ name: 'Video', extensions: VIDEO_EXT }, { name: 'Tất cả', extensions: ['*'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('new-window', (_e, file) => { createWindow(file || null, 30); });
ipcMain.handle('show-in-folder', (_e, file) => shell.showItemInFolder(file));
ipcMain.handle('toggle-fullscreen', e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  w.setFullScreen(!w.isFullScreen());
  return w.isFullScreen();
});
ipcMain.handle('exit-fullscreen', e => { BrowserWindow.fromWebContents(e.sender).setFullScreen(false); });
ipcMain.on('set-title', (e, t) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setTitle(t); });
// Co cửa sổ vừa khít video: sw/sh = kích thước video đang hiển thị, cw/ch = phần giao diện ngoài vùng video
ipcMain.handle('fit-window', (e, { sw, sh, cw, ch }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.isFullScreen()) return false;
  if (win.isMaximized()) win.unmaximize();
  const [ow, oh] = win.getSize(), [iw, ih] = win.getContentSize();
  const fw = ow - iw, fh = oh - ih;                       // viền cửa sổ
  const wa = screen.getDisplayMatching(win.getBounds()).workArea;
  const k = Math.min(1, (wa.width - fw - cw) / sw, (wa.height - fh - ch) / sh);
  const [minW, minH] = win.getMinimumSize();
  const W = Math.max(minW, Math.round(sw * k + cw + fw)), H = Math.max(minH, Math.round(sh * k + ch + fh));
  const b = win.getBounds(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const x = Math.round(Math.min(Math.max(cx - W / 2, wa.x), wa.x + wa.width - W));
  const y = Math.round(Math.min(Math.max(cy - H / 2, wa.y), wa.y + wa.height - H));
  win.setBounds({ x, y, width: W, height: H }, true);
  return true;
});
ipcMain.handle('clear-cache', () => cleanCache(true));

/* ---------- auto update (GitHub Releases) ---------- */
let updater = null;
let updState = { state: 'idle' };
function broadcast(s) {
  updState = s;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update-status', s);
}
function getUpdater() {
  if (updater) return updater;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => broadcast({ state: 'checking' }));
  updater.on('update-available', i => broadcast({ state: 'available', version: i.version }));
  updater.on('update-not-available', () => broadcast({ state: 'latest' }));
  updater.on('download-progress', p => broadcast({ state: 'downloading', percent: Math.round(p.percent), version: updState.version }));
  updater.on('update-downloaded', i => {
    broadcast({ state: 'downloaded', version: i.version });
    setTimeout(() => updater.quitAndInstall(true, true), 1200);
  });
  updater.on('error', err => broadcast({ state: 'error', message: String(err && err.message || err) }));
  return updater;
}
ipcMain.handle('update-check', async () => {
  if (!app.isPackaged) { broadcast({ state: 'dev' }); return updState; }
  if (['checking', 'downloading', 'downloaded'].includes(updState.state)) return updState;
  try { await getUpdater().checkForUpdates(); } catch (err) { broadcast({ state: 'error', message: String(err.message || err) }); }
  return updState;
});
ipcMain.handle('update-state', () => updState);
ipcMain.handle('update-download', async () => {
  if (!app.isPackaged) return;
  try { await getUpdater().downloadUpdate(); } catch (err) { broadcast({ state: 'error', message: String(err.message || err) }); }
});

/* ---------- App mặc định (Windows) ---------- */
const ASSOC_EXT = ['.mp4', '.m4v', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.mpg', '.mpeg', '.mts', '.m2ts'];
const PROGID = 'MPlayO.Video', APPNAME = 'M PlayO';
const isWin = process.platform === 'win32';
const regEsc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function regRun(args) {
  const { execFile } = require('child_process');
  return new Promise(res => execFile('reg', args, { windowsHide: true }, (err, out) => res(err ? '' : String(out))));
}
async function regValue(key, name) {
  const out = await regRun(name ? ['query', key, '/v', name] : ['query', key, '/ve']);
  const m = out.match(/REG_\w+\s+(.*)/);
  const v = m ? m[1].trim() : '';
  return v && !v.startsWith('(') ? v : null;
}
// Đuôi file đang mở bằng app nào
async function assocStatus() {
  if (!isWin) return { supported: false, list: [] };
  const list = await Promise.all(ASSOC_EXT.map(async ext => {
    const base = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\' + ext;
    const uc = (await regValue(base + '\\UserChoice', 'ProgId')) ||
      (await regValue(base + '\\UserChoiceLatest\\ProgId', 'ProgId')) || (await regValue(base + '\\UserChoiceLatest', 'ProgId'));
    const cls = uc ? null : await regValue('HKCU\\Software\\Classes\\' + ext);
    const prog = uc || cls || '';
    const mine = prog === PROGID || /M PlayO\.exe/i.test(prog);
    return { ext, mine, locked: !!uc };
  }));
  const win11 = parseInt(require('os').release().split('.')[2] || '0', 10) >= 22000;
  return { supported: true, list, win11, all: list.every(x => x.mine) };
}
// Ghi đăng ký vào HKCU (không cần quyền admin). setFor = các đuôi chưa có lựa chọn của người dùng -> đặt mặc định luôn
async function registerAssoc(setFor) {
  const exe = process.execPath;
  const cmd = `"${exe}" "%1"`;
  const L = ['Windows Registry Editor Version 5.00', ''];
  const key = (k, vals) => { L.push(`[HKEY_CURRENT_USER\\${k}]`); for (const [n, v] of vals) L.push(`${n === '@' ? '@' : `"${n}"`}=${v}`); L.push(''); };
  const str = v => `"${regEsc(v)}"`;
  key(`Software\\Classes\\${PROGID}`, [['@', str('Video (M PlayO)')], ['FriendlyTypeName', str('Video (M PlayO)')]]);
  key(`Software\\Classes\\${PROGID}\\DefaultIcon`, [['@', str(`"${exe}",0`)]]);
  key(`Software\\Classes\\${PROGID}\\shell\\open`, [['FriendlyAppName', str(APPNAME)]]);
  key(`Software\\Classes\\${PROGID}\\shell\\open\\command`, [['@', str(cmd)]]);
  key(`Software\\Mondiro\\MPlayO\\Capabilities`, [['ApplicationName', str(APPNAME)],
    ['ApplicationDescription', str('Xem nhanh video, xem từng frame')], ['ApplicationIcon', str(`"${exe}",0`)]]);
  key(`Software\\Mondiro\\MPlayO\\Capabilities\\FileAssociations`, ASSOC_EXT.map(e => [e, str(PROGID)]));
  key(`Software\\RegisteredApplications`, [[APPNAME, str('Software\\Mondiro\\MPlayO\\Capabilities')]]);
  key(`Software\\Classes\\Applications\\${path.basename(exe)}`, [['FriendlyAppName', str(APPNAME)]]);
  key(`Software\\Classes\\Applications\\${path.basename(exe)}\\shell\\open\\command`, [['@', str(cmd)]]);
  key(`Software\\Classes\\Applications\\${path.basename(exe)}\\SupportedTypes`, ASSOC_EXT.map(e => [e, '""']));
  for (const e of ASSOC_EXT) {
    key(`Software\\Classes\\${e}\\OpenWithProgids`, [[PROGID, 'hex(0):']]);
    if (setFor.includes(e)) key(`Software\\Classes\\${e}`, [['@', str(PROGID)]]);
  }
  const file = path.join(app.getPath('temp'), 'mplayo-assoc.reg');
  fs.writeFileSync(file, Buffer.from('﻿' + L.join('\r\n'), 'utf16le'));
  await regRun(['import', file]);
  try { fs.unlinkSync(file); } catch {}
}
async function autoRegisterAssoc() {
  if (!isWin || !app.isPackaged) return;
  const mark = app.getVersion() + '|' + process.execPath;
  if (settings.assocMark === mark) return;
  try {
    const st = await assocStatus();
    await registerAssoc(st.list.filter(x => !x.locked).map(x => x.ext));
    settings.assocMark = mark; saveSettings();
  } catch {}
}
ipcMain.handle('assoc-status', () => assocStatus());
// Đặt mặc định trực tiếp bằng Set-FTA (PS-SFTA) giống app M-View, không cần người dùng xác nhận trong Windows
function setFTA(exts) {
  const { execFile } = require('child_process');
  const script = path.join(__dirname, 'assoc', 'set-default.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const pairs = exts.map(e => `${PROGID}=${e}`).join(';');
  return new Promise(res => execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Pairs', pairs],
    { windowsHide: true, timeout: 90000 }, (_err, out) => res(String(out || ''))));
}
ipcMain.handle('assoc-set-default', async () => {
  if (!isWin) return { supported: false };
  const st = await assocStatus();
  await registerAssoc(st.list.filter(x => !x.locked).map(x => x.ext));
  const todo = (await assocStatus()).list.filter(x => !x.mine).map(x => x.ext);
  if (todo.length) await setFTA(todo);
  const after = await assocStatus();
  if (after.all) return { done: true, status: after };
  await shell.openExternal('ms-settings:defaultapps?registeredAppUser=' + encodeURIComponent(APPNAME));
  return { opened: true, win11: after.win11, status: after };
});
