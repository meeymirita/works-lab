// Страница открыта по http на нашем домене — переходим на https (на случай, если браузер отдал старую копию без редиректа Cloudflare).
if(location.protocol==='http:'&&location.hostname==='anitech.meeymirita.ru')location.replace('https://'+location.host+location.pathname+location.search+location.hash);
/* Синхронизация прогресса с вашим Cloudflare Worker (tools/progress-worker/).
 *
 * Зачем: прогресс методичек лежит в localStorage (ключи lab-redesign-v1:<лаба>) и пропадает при очистке данных сайта.
 * Что делает скрипт: после ввода пароля сохраняет эти ключи на Worker и подтягивает их обратно, когда локально пусто.
 * Работает на всех страницах, куда подключён (методички, works/progress.html).
 * Без пароля ничего не отправляет. Пароль хранится только в localStorage этого браузера и на самом Worker (секрет PASSWORD);
 * в репозитории его нет. Резервный путь без сервера — кнопки «Экспорт» и «Импорт» в панели ☁.
 *
 * Адрес Worker вписывается в WORKER ниже после деплоя (инструкция — tools/progress-worker/README.md).
 */
(function () {
  'use strict';
  var WORKER = 'https://anitech-progress.popap182.workers.dev';

  var PREFIX = 'lab-redesign-v1:';
  var TOKEN = 'anitech-sync-token';
  var META = 'anitech-sync-meta:';
  var BASE = 'anitech-sync-base:';   // время записи на сервере, с которой этот браузер последний раз сверялся
  var GUARD = 'anitech-sync-reloaded';
  var state = { ok: null, text: '', pulled: false };
  var timers = {};

  var ls = (function () { try { return window.localStorage; } catch (e) { return null; } })();
  if (!ls) return;
  var origSet = Storage.prototype.setItem;

  function now() { return Date.now(); }
  function token() { try { return ls.getItem(TOKEN) || ''; } catch (e) { return ''; } }
  function metaGet(slug) { return parseInt(ls.getItem(META + slug) || '0', 10) || 0; }
  function metaSet(slug, t) { origSet.call(ls, META + slug, String(t)); }
  function baseGet(slug) { return parseInt(ls.getItem(BASE + slug) || '0', 10) || 0; }
  function baseSet(slug, t) { origSet.call(ls, BASE + slug, String(t)); }
  // объединение при расхождении: отметки шагов и «проверь себя» — union (ничего не теряем), остальное — от более новой стороны
  function merge(loc, lt, rem, rt) {
    var out = {}, newerRemote = rt >= lt, k, src = newerRemote ? rem : loc, other = newerRemote ? loc : rem;
    for (k in other) out[k] = other[k];
    for (k in src) out[k] = src[k];
    ['done', 'quiz'].forEach(function (f) {
      var m = {}, a = loc && loc[f] || {}, b = rem && rem[f] || {}, x;
      for (x in a) if (a[x]) m[x] = a[x];
      for (x in b) if (b[x]) m[x] = b[x];
      out[f] = m;
    });
    ['tSess', 'tTotal'].forEach(function (f) { out[f] = Math.max((loc && loc[f]) || 0, (rem && rem[f]) || 0); });
    return out;
  }
  function parse(v) { try { var o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
  function count(d) {
    var n = 0, k;
    if (d && d.done) for (k in d.done) if (d.done[k]) n++;
    if (d && d.quiz) for (k in d.quiz) if (d.quiz[k]) n++;
    return n;
  }
  function localSlugs() {
    var out = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); }
    return out;
  }
  function api(method, path, body) {
    return fetch(WORKER.replace(/\/$/, '') + path, {
      method: method, keepalive: method === 'PUT',
      headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  function setStatus(ok, text) { state.ok = ok; state.text = text || ''; paint(); }

  // ── запись на Worker ───────────────────────────────────────────────────
  function push(slug) {
    if (!WORKER || !token() || !state.pulled) return Promise.resolve();
    var data = parse(ls.getItem(PREFIX + slug));
    if (!data) return Promise.resolve();
    setStatus(null, 'сохраняю…');
    var t = metaGet(slug) || now();
    return api('PUT', '/api/progress/' + encodeURIComponent(slug), { data: data, t: t }).then(function (r) {
      if (r.status === 401) { try { ls.removeItem(TOKEN); } catch (e) {} setStatus(false, 'неверный пароль'); return; }
      if (!r.ok) { setStatus(false, 'ошибка ' + r.status); return; }
      baseSet(slug, t);
      setStatus(true, 'сохранено ' + new Date().toLocaleTimeString('ru-RU'));
    }).catch(function () { setStatus(false, 'нет связи с Worker'); });
  }
  function schedule(slug) {
    clearTimeout(timers[slug]);
    timers[slug] = setTimeout(function () { push(slug); }, 1500);
  }
  Storage.prototype.setItem = function (k, v) {
    origSet.apply(this, arguments);
    if (this === ls && typeof k === 'string' && k.indexOf(PREFIX) === 0) {
      var slug = k.slice(PREFIX.length);
      if (state.pulled) { metaSet(slug, now()); schedule(slug); }
    }
  };
  window.addEventListener('pagehide', function () {
    Object.keys(timers).forEach(function (s) { clearTimeout(timers[s]); push(s); });
  });

  // ── чтение с Worker и слияние ──────────────────────────────────────────
  function pull() {
    if (!WORKER || !token()) { state.pulled = true; paint(); return Promise.resolve(); }
    setStatus(null, 'синхронизирую…');
    return api('GET', '/api/progress').then(function (r) {
      if (r.status === 401) { try { ls.removeItem(TOKEN); } catch (e) {} state.pulled = true; setStatus(false, 'неверный пароль'); return null; }
      if (r.status === 429) { state.pulled = true; setStatus(false, 'слишком много попыток, подождите'); return null; }
      if (!r.ok) { state.pulled = true; setStatus(false, 'ошибка ' + r.status); return null; }
      return r.json();
    }).then(function (remote) {
      if (!remote) return;
      var changed = [], toPush = [], all = {};
      Object.keys(remote).forEach(function (s) { all[s] = 1; });
      localSlugs().forEach(function (s) { all[s] = 1; });
      Object.keys(all).forEach(function (slug) {
        var rem = remote[slug], loc = parse(ls.getItem(PREFIX + slug)), lt = metaGet(slug), base = baseGet(slug);
        function take(data, t) {
          if (!loc || JSON.stringify(loc) !== JSON.stringify(data)) changed.push(slug);
          origSet.call(ls, PREFIX + slug, JSON.stringify(data)); metaSet(slug, t); baseSet(slug, rem ? rem.t : t);
        }
        if (!rem) { if (loc) { if (!lt) metaSet(slug, now()); toPush.push(slug); } return; }
        if (!loc || count(loc) === 0 && count(rem.data) > 0) { take(rem.data, rem.t); return; }
        if (count(rem.data) === 0 && count(loc) > 0) { if (!lt) metaSet(slug, now()); toPush.push(slug); return; }
        if (JSON.stringify(loc) === JSON.stringify(rem.data)) { baseSet(slug, rem.t); if (!lt) metaSet(slug, rem.t); return; }
        var localChanged = !base || lt > base, remoteChanged = rem.t > base;
        if (localChanged && remoteChanged) {            // менялось и там и тут: объединяем, ничего не теряя
          var merged = merge(loc, lt, rem.data, rem.t), t = Math.max(now(), rem.t + 1);
          take(merged, t); toPush.push(slug);
        } else if (remoteChanged) take(rem.data, rem.t);
        else toPush.push(slug);
      });
      state.pulled = true;
      return Promise.all(toPush.map(push)).then(function () {
        setStatus(true, 'синхронизировано ' + new Date().toLocaleTimeString('ru-RU'));
        var reloaded = false; try { reloaded = !!sessionStorage.getItem(GUARD); } catch (e) {}
        if (changed.length && !reloaded) { try { sessionStorage.setItem(GUARD, '1'); } catch (e) {} location.reload(); }
      });
    }).catch(function () { state.pulled = true; setStatus(false, 'нет связи с Worker'); });
  }

  // ── экспорт и импорт файла (работает без Worker) ───────────────────────
  function exportFile() {
    var out = {};
    localSlugs().forEach(function (s) { var d = parse(ls.getItem(PREFIX + s)); if (d) out[s] = { data: d, t: metaGet(s) || now() }; });
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anitech-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function importFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var obj = parse(fr.result), n = 0;
      if (!obj) { setStatus(false, 'файл не подошёл'); return; }
      Object.keys(obj).forEach(function (slug) {
        var e = obj[slug]; if (!e || !e.data || typeof e.data !== 'object') return;
        origSet.call(ls, PREFIX + slug, JSON.stringify(e.data)); metaSet(slug, now()); n++;
        if (state.pulled) schedule(slug);
      });
      setStatus(n > 0, n ? 'загружено лаб: ' + n : 'в файле нет прогресса');
      if (n) setTimeout(function () { location.reload(); }, 400);
    };
    fr.readAsText(file);
  }

  // ── интерфейс ──────────────────────────────────────────────────────────
  var btn, panel, nudge, built = false;
  var NUDGE = 'anitech-sync-nudge-closed';
  var POS = 'anitech-sync-pos';          // положение кнопки в долях экрана {x, y}
  var SIZE = 40;
  function readPos() {
    var o = null; try { o = JSON.parse(ls.getItem(POS) || 'null'); } catch (e) {}
    return o && typeof o.x === 'number' && typeof o.y === 'number' ? o : { x: 10 / Math.max(innerWidth, 1), y: 0.5 };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  // ставит кнопку и привязывает к ней окошки так, чтобы они не выходили за экран
  function place() {
    if (!btn) return;
    var W = innerWidth, H = innerHeight, pos = readPos();
    var x = clamp(pos.x * W, 4, W - SIZE - 4), y = clamp(pos.y * H, 4, H - SIZE - 4);
    btn.style.left = x + 'px'; btn.style.top = y + 'px';
    [panel, nudge].forEach(function (el) {
      if (!el) return;
      if (x < W / 2) { el.style.left = (x + SIZE + 10) + 'px'; el.style.right = 'auto'; }
      else { el.style.right = (W - x + 10) + 'px'; el.style.left = 'auto'; }
      if (y > H / 2) { el.style.bottom = (H - y - SIZE) + 'px'; el.style.top = 'auto'; }
      else { el.style.top = y + 'px'; el.style.bottom = 'auto'; }
    });
  }
  function enableDrag(el) {
    var sx, sy, ox, oy, moved = false, down = false;
    el.addEventListener('pointerdown', function (e) {
      down = true; moved = false; sx = e.clientX; sy = e.clientY;
      var r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      try { el.setPointerCapture(e.pointerId); } catch (er) {}
    });
    el.addEventListener('pointermove', function (e) {
      if (!down) return;
      if (!moved && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 6) return;
      moved = true;
      var W = innerWidth, H = innerHeight;
      var x = clamp(ox + e.clientX - sx, 4, W - SIZE - 4), y = clamp(oy + e.clientY - sy, 4, H - SIZE - 4);
      origSet.call(ls, POS, JSON.stringify({ x: x / W, y: y / H })); place();
    });
    el.addEventListener('pointerup', function () { down = false; });
    el.addEventListener('click', function (e) { if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; } }, true);
  }
  function css() {
    return '#as-btn{position:fixed;left:10px;top:50%;z-index:9400;touch-action:none;width:40px;height:40px;border:2px solid #1b1a19;background:#fff;color:#1b1a19;font:700 18px/1 system-ui;cursor:pointer;box-shadow:3px 3px 0 #1b1a19;display:grid;place-items:center}' +
      'body[data-theme=dark] #as-btn{background:#1c1a19;color:#f1ede8;border-color:#f1ede8;box-shadow:3px 3px 0 #f1ede8}' +
      '#as-btn i{position:absolute;right:-5px;top:-5px;width:12px;height:12px;border-radius:50%;border:2px solid #1b1a19;background:#999}' +
      '#as-btn i.ask{background:#2965F1;animation:as-pulse 1.4s ease-in-out infinite}@keyframes as-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}' +
      '#as-btn i.ok{background:#2f9e4a}#as-btn i.wait{background:#e0a800}#as-btn i.bad{background:#d64545}' +
      '#as-p{position:fixed;left:62px;bottom:62px;z-index:9400;width:min(320px,calc(100vw - 24px));display:none;padding:14px;background:#fff;color:#1b1a19;border:2px solid #1b1a19;box-shadow:4px 4px 0 #1b1a19;font:14px/1.5 system-ui,sans-serif}' +
      'body[data-theme=dark] #as-p{background:#1c1a19;color:#f1ede8;border-color:#f1ede8;box-shadow:4px 4px 0 #f1ede8}' +
      '#as-p.open{display:block}#as-p h4{margin:0 0 6px;font:800 14px system-ui}#as-p p{margin:0 0 10px;opacity:.85;font-size:13px}' +
      '#as-p input[type=password]{width:100%;padding:8px;border:2px solid currentColor;background:transparent;color:inherit;font:inherit;margin-bottom:8px}' +
      '#as-p button{padding:7px 10px;border:2px solid currentColor;background:transparent;color:inherit;font:700 13px system-ui;cursor:pointer;margin:0 6px 6px 0}' +
      '#as-p button.pri{background:#1b1a19;color:#fff}body[data-theme=dark] #as-p button.pri{background:#f1ede8;color:#1c1a19}' +
      '#as-st{font-size:13px;margin:4px 0 8px;min-height:18px}' +
      '#as-n{position:fixed;left:62px;top:50%;z-index:9399;display:none;max-width:min(260px,calc(100vw - 80px));padding:10px 12px;background:#fff;color:#1b1a19;border:2px solid #2965F1;box-shadow:3px 3px 0 #2965F1;font:13px/1.45 system-ui,sans-serif}' +
      'body[data-theme=dark] #as-n{background:#1c1a19;color:#f1ede8}#as-n.on{display:block}' +
      '#as-n b{display:block;margin-bottom:4px}#as-n button{margin:6px 6px 0 0;padding:5px 9px;border:2px solid currentColor;background:transparent;color:inherit;font:700 12px system-ui;cursor:pointer}' +
      '#as-n button.pri{background:#2965F1;border-color:#2965F1;color:#fff}';
  }
  function build() {
    if (built) return; built = true;
    var st = document.createElement('style'); st.textContent = css(); document.head.appendChild(st);
    btn = document.createElement('button'); btn.id = 'as-btn'; btn.type = 'button'; btn.title = 'Синхронизация прогресса';
    btn.title = 'Синхронизация прогресса (можно перетащить)'; btn.innerHTML = '☁<i></i>'; btn.addEventListener('click', function () { panel.classList.toggle('open'); paint(); });
    panel = document.createElement('div'); panel.id = 'as-p';
    nudge = document.createElement('div'); nudge.id = 'as-n'; nudge.setAttribute('role', 'status');
    nudge.innerHTML = '<b>Синхронизация не подключена</b>Без неё прогресс пропадёт, если очистить данные сайта.<br><button class="pri" data-n="open">Подключить</button><button data-n="close">Закрыть</button>';
    nudge.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-n');
      if (a === 'open') { panel.classList.add('open'); paint(); var i = panel.querySelector('input[type=password]'); if (i) i.focus(); }
      else if (a === 'close') { try { sessionStorage.setItem(NUDGE, '1'); } catch (er) {} paint(); }
    });
    document.body.appendChild(btn); document.body.appendChild(panel); document.body.appendChild(nudge);
    enableDrag(btn); window.addEventListener('resize', place); place();
    panel.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'sync') { state.pulled = false; pull(); }
      else if (a === 'off') { try { ls.removeItem(TOKEN); } catch (er) {} setStatus(null, 'отключено'); paint(); }
      else if (a === 'export') exportFile();
      else if (a === 'import') panel.querySelector('input[type=file]').click();
    });
    panel.addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = panel.querySelector('input[type=password]'), v = inp ? inp.value.trim() : '';
      if (!v) return;
      origSet.call(ls, TOKEN, v); state.pulled = false; pull();
    });
    panel.addEventListener('change', function (e) { if (e.target.type === 'file' && e.target.files[0]) importFile(e.target.files[0]); });
  }
  function paint() {
    if (!built) return;
    var dot = btn.querySelector('i'); dot.className = !WORKER ? '' : !token() ? 'ask' : state.ok === true ? 'ok' : state.ok === false ? 'bad' : 'wait';
    var closed = false; try { closed = !!sessionStorage.getItem(NUDGE); } catch (e) {}
    nudge.classList.toggle('on', !!WORKER && !token() && !closed && !panel.classList.contains('open'));
    var html = '<h4>Прогресс</h4>';
    if (!WORKER) {
      html += '<p>Синхронизация с сервером ещё не настроена. Пока можно сохранять прогресс в файл и загружать его обратно.</p>';
    } else if (!token()) {
      html += '<p>Введите пароль, и прогресс будет сохраняться на вашем Worker и переживёт очистку браузера.</p>' +
        '<form id="as-f"><input type="text" name="username" value="anitech-progress" autocomplete="username" tabindex="-1" aria-hidden="true" style="position:absolute;opacity:0;height:0;width:0;padding:0;border:0">' +
        '<input type="password" name="password" placeholder="Пароль" autocomplete="current-password"><div id="as-st">' + esc(state.text) + '</div>' +
        '<button class="pri" type="submit">Подключить</button></form>';
    } else {
      html += '<div id="as-st">' + esc(state.text || 'подключено') + '</div>' +
        '<button class="pri" data-a="sync">Синхронизировать</button><button data-a="off">Отключить</button><br>';
    }
    html += '<button data-a="export">Экспорт в файл</button><button data-a="import">Импорт из файла</button><input type="file" accept="application/json" hidden>';
    var focused = panel.querySelector('input[type=password]') && document.activeElement === panel.querySelector('input[type=password]');
    if (!focused) panel.innerHTML = html;
    else panel.querySelector('#as-st').textContent = state.text;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function start() { build(); paint(); pull().then(paint); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
