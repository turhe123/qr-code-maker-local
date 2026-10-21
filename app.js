// app.js — Static QR Code Maker. Everything runs on this device; nothing is sent anywhere.
// The QR matrix comes from the vendored qrcode-generator (global `qrcode`, loaded as a classic deferred script).
import { toast, downloadBlob, formatBytes, wireDropzone } from './site.js';

void wireDropzone; // part of the shared helper set; this tool has no file input

const $ = (id) => document.getElementById(id);
const form = $('qr-form');
const canvas = $('qr-canvas');
const img = $('qr-img');
const readout = $('qr-readout');
const warningsEl = $('qr-warnings');
const errorEl = $('qr-error');
const card = $('qr-card');
const btnPng = $('dl-png');
const btnSvg = $('dl-svg');
const btnCopy = $('copy-img');
const typeButtons = [...document.querySelectorAll('.qr-type')];

const ECC_NAMES = { L: 'Low', M: 'Medium', Q: 'Quartile', H: 'High' };
// Byte-mode capacity of a version 40 code for each correction level.
const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };
const FILE_BASE = { url: 'qr-code', text: 'text-qr', wifi: 'wifi-qr', contact: 'contact-qr', email: 'email-qr', phone: 'phone-qr', sms: 'sms-qr' };
const PREVIEW_CSS_PX = 320;

let type = 'url';
let current = null; // { qr, count, version, ecc, margin, fg, bg, size, base }

// ---------- payloads ----------
const val = (name) => (form.elements[name]?.value ?? '').trim();
const escWifi = (s) => s.replace(/([\\;,:"])/g, '\\$1');
const escVcard = (s) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
const cleanPhone = (s) => s.replace(/[^\d+*#]/g, '');

export function buildPayload(kind, get = val) {
  switch (kind) {
    case 'url': {
      const u = get('url');
      if (!u) return { error: 'Enter a web address to make a QR code.' };
      // Bare domains get https:// so phones open them as links rather than search text.
      return { data: /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}` };
    }
    case 'text': {
      const t = form.elements.text.value;
      if (!t.trim()) return { error: 'Type some text to make a QR code.' };
      return { data: t };
    }
    case 'wifi': {
      const ssid = get('ssid');
      if (!ssid) return { error: 'Enter the Wi-Fi network name (SSID).' };
      const sec = get('wifiSec');
      const pass = form.elements.wifiPass.value;
      if (sec !== 'nopass' && !pass) return { error: 'Enter the Wi-Fi password, or choose “None (open network)”.' };
      let s = `WIFI:T:${sec};S:${escWifi(ssid)};`;
      if (sec !== 'nopass') s += `P:${escWifi(pass)};`;
      if (form.elements.wifiHidden.checked) s += 'H:true;';
      return { data: `${s};` };
    }
    case 'contact': {
      const first = get('first'), last = get('last'), org = get('org'), tel = get('cPhone'), email = get('cEmail');
      const full = [first, last].filter(Boolean).join(' ');
      if (!full && !org) return { error: 'Enter a name or an organisation for the contact card.' };
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escVcard(last)};${escVcard(first)};;;`, `FN:${escVcard(full || org)}`];
      if (org) lines.push(`ORG:${escVcard(org)}`);
      if (tel) lines.push(`TEL;TYPE=CELL:${cleanPhone(tel)}`);
      if (email) lines.push(`EMAIL:${escVcard(email)}`);
      lines.push('END:VCARD');
      return { data: lines.join('\r\n') };
    }
    case 'email': {
      const to = get('emailTo');
      if (!to) return { error: 'Enter the email address to send to.' };
      const q = [];
      if (get('emailSubject')) q.push(`subject=${encodeURIComponent(get('emailSubject'))}`);
      if (get('emailBody')) q.push(`body=${encodeURIComponent(get('emailBody'))}`);
      return { data: `mailto:${to}${q.length ? `?${q.join('&')}` : ''}` };
    }
    case 'phone': {
      const n = cleanPhone(get('phone'));
      if (!n) return { error: 'Enter a phone number.' };
      return { data: `tel:${n}` };
    }
    case 'sms': {
      const n = cleanPhone(get('smsTo'));
      if (!n) return { error: 'Enter the phone number the message goes to.' };
      const body = get('smsBody');
      return { data: `SMSTO:${n}${body ? `:${body}` : ''}` };
    }
    default:
      return { error: 'Unknown content type.' };
  }
}

// UTF-8 bytes as a "binary string": the library's default converter keeps the low 8 bits of each char.
const utf8 = (s) => { let out = ''; for (const b of new TextEncoder().encode(s)) out += String.fromCharCode(b); return out; };

// ---------- colours ----------
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------- drawing ----------
// Integer pixels per module, centred, so every edge lands on a whole pixel.
function draw(ctx, px, s) {
  const total = s.count + s.margin * 2;
  const cell = Math.max(1, Math.floor(px / total));
  const offset = Math.floor((px - cell * total) / 2) + s.margin * cell;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = s.fg;
  for (let r = 0; r < s.count; r++) {
    for (let c = 0; c < s.count; c++) {
      if (s.qr.isDark(r, c)) ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
    }
  }
}

function exportPx(s) { return Math.max(s.size, s.count + s.margin * 2); }

function renderPreview(s) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(Math.round(PREVIEW_CSS_PX * dpr), s.count + s.margin * 2);
  canvas.width = px;
  canvas.height = px;
  draw(canvas.getContext('2d'), px, s);
}

function pngBlob(s) {
  const px = exportPx(s);
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  draw(c.getContext('2d'), px, s);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

// One path built from horizontal runs of dark modules keeps the SVG small.
export function svgString(s) {
  const total = s.count + s.margin * 2;
  let d = '';
  for (let r = 0; r < s.count; r++) {
    let c = 0;
    while (c < s.count) {
      if (!s.qr.isDark(r, c)) { c++; continue; }
      const start = c;
      while (c < s.count && s.qr.isDark(r, c)) c++;
      d += `M${start + s.margin} ${r + s.margin}h${c - start}v1h-${c - start}z`;
    }
  }
  const px = exportPx(s);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="${s.bg}"/><path fill="${s.fg}" d="${d}"/></svg>\n`;
}

// ---------- UI ----------
function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
  card.classList.toggle('is-stale', Boolean(msg));
  [btnPng, btnSvg, btnCopy].forEach((b) => { b.disabled = Boolean(msg); });
}

function setWarnings(list) {
  warningsEl.replaceChildren(...list.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
}

function readOptions() {
  const num = (name, min, max, def) => {
    const n = Math.round(Number(form.elements[name].value));
    return Number.isFinite(n) && form.elements[name].value !== '' ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    ecc: form.elements.ecc.value,
    size: num('size', 64, 4096, 1024),
    margin: num('margin', 0, 16, 4),
    fg: form.elements.fg.value,
    bg: form.elements.bg.value,
  };
}

let imgTimer = 0;
let imgUrl = '';
function refreshImage() {
  clearTimeout(imgTimer);
  imgTimer = setTimeout(async () => {
    if (!current) return;
    const s = current;
    const blob = await pngBlob(s);
    if (s !== current) return;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = URL.createObjectURL(blob);
    img.src = imgUrl;
    btnPng.dataset.bytes = String(blob.size);
  }, 150);
}

export function update() {
  const opts = readOptions();
  const base = FILE_BASE[type];
  btnPng.textContent = `Download ${base}.png`;
  btnSvg.textContent = `Download ${base}.svg`;

  const { data, error } = buildPayload(type);
  if (error) {
    showError(error);
    readout.textContent = '';
    setWarnings([]);
    current = null;
    return;
  }
  const bytes = utf8(data);
  const chars = [...data].length;
  const max = MAX_BYTES[opts.ecc];
  if (bytes.length > max) {
    showError(`Too long for ${ECC_NAMES[opts.ecc]} error correction: ${bytes.length.toLocaleString('en-US')} bytes, the maximum is ${max.toLocaleString('en-US')}. Shorten the content${opts.ecc === 'L' ? '' : ' or choose a lower error correction level'}.`);
    readout.textContent = `${chars.toLocaleString('en-US')} characters · ${bytes.length.toLocaleString('en-US')} bytes`;
    setWarnings([]);
    current = null;
    return;
  }

  let qr;
  try {
    qr = qrcode(0, opts.ecc);
    qr.addData(bytes, 'Byte');
    qr.make();
  } catch (err) {
    showError(`Could not build this QR code: ${String(err)}`);
    current = null;
    return;
  }
  const count = qr.getModuleCount();
  const version = (count - 17) / 4;
  current = { qr, count, version, base, ...opts };
  showError('');
  renderPreview(current);
  canvas.dataset.version = String(version);
  canvas.dataset.ecc = opts.ecc;
  canvas.setAttribute('aria-label', `QR code preview, version ${version}, ${ECC_NAMES[opts.ecc]} error correction`);

  readout.textContent = `${chars.toLocaleString('en-US')} characters · ${bytes.length.toLocaleString('en-US')} bytes · version ${version} (${count}×${count}) · ${ECC_NAMES[opts.ecc]} correction`;

  const warn = [];
  const ratio = contrastRatio(opts.fg, opts.bg);
  if (luminance(opts.fg) > luminance(opts.bg)) warn.push('The foreground is lighter than the background. Many scanners cannot read inverted codes.');
  if (ratio < 3) warn.push(`Low contrast (${(Math.floor(ratio * 10) / 10).toFixed(1)}:1). Use at least 3:1, ideally dark on light, or phones may fail to scan it.`);
  if (opts.size < 128) warn.push('Below 128 pixels the code is hard to scan. Choose a larger size.');
  if (exportPx(current) > opts.size) warn.push(`Saved at ${exportPx(current)} px, the smallest size that fits every module.`);
  if (opts.margin < 2) warn.push('A quiet zone under 2 modules can stop some scanners. 4 is the standard.');
  if (bytes.length > max * 0.85) warn.push('Close to the capacity limit. A dense code needs a large print and a steady hand.');
  setWarnings(warn);
  refreshImage();
}

function setType(next, { focus = false } = {}) {
  type = next;
  typeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === next)));
  document.querySelectorAll('.qr-fields').forEach((f) => { f.hidden = f.dataset.for !== next; });
  if (focus) document.querySelector(`.qr-fields[data-for="${next}"] input, .qr-fields[data-for="${next}"] textarea`)?.focus();
  update();
}

typeButtons.forEach((b) => b.addEventListener('click', () => setType(b.dataset.type, { focus: true })));
form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', (e) => e.preventDefault());

btnPng.addEventListener('click', async () => {
  if (!current) return;
  try {
    const blob = await pngBlob(current);
    downloadBlob(blob, `${current.base}.png`);
    toast(`Saved ${current.base}.png (${formatBytes(blob.size)})`);
  } catch (err) {
    showError(`Could not create the PNG: ${err.message}`);
  }
});

btnSvg.addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([svgString(current)], { type: 'image/svg+xml' });
  downloadBlob(blob, `${current.base}.svg`);
  toast(`Saved ${current.base}.svg (${formatBytes(blob.size)})`);
});

btnCopy.addEventListener('click', async () => {
  if (!current) return;
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(current) })]);
    toast('QR code copied as an image');
  } catch {
    toast('This browser cannot copy images. Use Download PNG instead.');
  }
});

window.addEventListener('resize', () => { if (current) renderPreview(current); });

// On phones keep the live code right under the fields; the options panel starts collapsed.
if (window.matchMedia('(max-width: 859px)').matches) document.querySelector('.qr-options').open = false;
setType('url');

// Called by the factory's screenshot script: fills the fictional Lantern Bean guest Wi-Fi from a fixture.
window.__demo = async () => {
  const res = await fetch('./tests/fixtures/lantern-bean.json');
  const demo = await res.json();
  form.elements.url.value = demo.url;
  form.elements.first.value = demo.contact.first;
  form.elements.last.value = demo.contact.last;
  form.elements.cPhone.value = demo.contact.phone;
  form.elements.cEmail.value = demo.contact.email;
  form.elements.org.value = demo.contact.org;
  form.elements.ssid.value = demo.wifi.ssid;
  form.elements.wifiPass.value = demo.wifi.password;
  form.elements.wifiSec.value = demo.wifi.security;
  form.elements.ecc.value = 'Q';
  setType('wifi');
  card.scrollIntoView({ block: 'nearest' });
};
