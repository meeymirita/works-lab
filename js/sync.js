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
    return api('PUT', '/api/progress/' + encodeURIComponent(slug), { data: data, t: metaGet(slug) || now() }).then(function (r) {
      if (r.status === 401) { try { ls.removeItem(TOKEN); } catch (e) {} setStatus(false, 'неверный пароль'); return; }
      if (!r.ok) { setStatus(false, 'ошибка ' + r.status); return; }
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
        var rem = remote[slug], loc = parse(ls.getItem(PREFIX + slug)), lt = metaGet(slug);
        if (rem && (!loc || count(loc) === 0 && count(rem.data) > 0 || (rem.t > lt && !(count(rem.data) === 0 && count(loc) > 0)))) {
          origSet.call(ls, PREFIX + slug, JSON.stringify(rem.data)); metaSet(slug, rem.t);
          if (!loc || JSON.stringify(loc) !== JSON.stringify(rem.data)) changed.push(slug);
        } else if (loc && (!rem || lt > rem.t || count(loc) > 0 && count(rem.data) === 0)) {
          if (!lt) metaSet(slug, now());
          toPush.push(slug);
        }
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
  var btn, panel, built = false;
  function css() {
    return '#as-btn{position:fixed;left:12px;bottom:12px;z-index:9400;width:40px;height:40px;border:2px solid #1b1a19;background:#fff;color:#1b1a19;font:700 18px/1 system-ui;cursor:pointer;box-shadow:3px 3px 0 #1b1a19;display:grid;place-items:center}' +
      'body[data-theme=dark] #as-btn{background:#1c1a19;color:#f1ede8;border-color:#f1ede8;box-shadow:3px 3px 0 #f1ede8}' +
      '#as-btn i{position:absolute;right:-5px;top:-5px;width:12px;height:12px;border-radius:50%;border:2px solid #1b1a19;background:#999}' +
      '#as-btn i.ok{background:#2f9e4a}#as-btn i.wait{background:#e0a800}#as-btn i.bad{background:#d64545}' +
      '#as-p{position:fixed;left:12px;bottom:62px;z-index:9400;width:min(320px,calc(100vw - 24px));display:none;padding:14px;background:#fff;color:#1b1a19;border:2px solid #1b1a19;box-shadow:4px 4px 0 #1b1a19;font:14px/1.5 system-ui,sans-serif}' +
      'body[data-theme=dark] #as-p{background:#1c1a19;color:#f1ede8;border-color:#f1ede8;box-shadow:4px 4px 0 #f1ede8}' +
      '#as-p.open{display:block}#as-p h4{margin:0 0 6px;font:800 14px system-ui}#as-p p{margin:0 0 10px;opacity:.85;font-size:13px}' +
      '#as-p input[type=password]{width:100%;padding:8px;border:2px solid currentColor;background:transparent;color:inherit;font:inherit;margin-bottom:8px}' +
      '#as-p button{padding:7px 10px;border:2px solid currentColor;background:transparent;color:inherit;font:700 13px system-ui;cursor:pointer;margin:0 6px 6px 0}' +
      '#as-p button.pri{background:#1b1a19;color:#fff}body[data-theme=dark] #as-p button.pri{background:#f1ede8;color:#1c1a19}' +
      '#as-st{font-size:13px;margin:4px 0 8px;min-height:18px}';
  }
  function build() {
    if (built) return; built = true;
    var st = document.createElement('style'); st.textContent = css(); document.head.appendChild(st);
    btn = document.createElement('button'); btn.id = 'as-btn'; btn.type = 'button'; btn.title = 'Синхронизация прогресса';
    btn.innerHTML = '☁<i></i>'; btn.addEventListener('click', function () { panel.classList.toggle('open'); paint(); });
    panel = document.createElement('div'); panel.id = 'as-p';
    document.body.appendChild(btn); document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'save') {
        var v = panel.querySelector('input').value.trim(); if (!v) return;
        origSet.call(ls, TOKEN, v); state.pulled = false; pull();
      } else if (a === 'sync') { state.pulled = false; pull(); }
      else if (a === 'off') { try { ls.removeItem(TOKEN); } catch (er) {} setStatus(null, 'отключено'); paint(); }
      else if (a === 'export') exportFile();
      else if (a === 'import') panel.querySelector('input[type=file]').click();
    });
    panel.addEventListener('change', function (e) { if (e.target.type === 'file' && e.target.files[0]) importFile(e.target.files[0]); });
  }
  function paint() {
    if (!built) return;
    var dot = btn.querySelector('i'); dot.className = !WORKER || !token() ? '' : state.ok === true ? 'ok' : state.ok === false ? 'bad' : 'wait';
    var html = '<h4>Прогресс</h4>';
    if (!WORKER) {
      html += '<p>Синхронизация с сервером ещё не настроена. Пока можно сохранять прогресс в файл и загружать его обратно.</p>';
    } else if (!token()) {
      html += '<p>Введите пароль, и прогресс будет сохраняться на вашем Worker и переживёт очистку браузера.</p>' +
        '<input type="password" placeholder="Пароль" autocomplete="off"><div id="as-st">' + esc(state.text) + '</div>' +
        '<button class="pri" data-a="save">Подключить</button>';
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
