// Слайд-переход между главной и страницей лабы: старый экран уезжает, новая страница въезжает.
// Направление у каждой лабы своё (DIRS): left / right / up / down — это куда уезжает ГЛАВНАЯ; обратно всё идёт зеркально.
// Использует межстраничные View Transitions (Chrome/Edge 126+, Safari 18.2+); в остальных браузерах
// SlideNav.supports() даёт false и главная вызывает прежний PageLoader.
// Подключать синхронным скриптом в <head> и на главной, и на странице лабы (оба документа должны согласиться на переход).
(function () {
  var DIRS = {
    js: 'up', typescript: 'right', vue: 'down', nuxt: 'left', angular: 'up', css: 'left', tailwind: 'right',
    php: 'down', 'php-coffee': 'up', 'algorithms-php': 'left', nestjs: 'right', graphql: 'down',
    laravel: 'left', 'laravel-performance': 'up', inertia: 'right', redis: 'down', rabbitmq: 'left',
    postgresql: 'up', docker: 'right', traefik: 'down', caddy: 'left', kubernetes: 'up'
  };
  var OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  var STORE_KEY = 'page-loader-next';           // тот же ключ, что у page-loader.js: флаг slide гасит его заставку
  var DUR = '.65s cubic-bezier(.77,0,.18,1)';
  var supported = 'onpagereveal' in window && 'onpageswap' in window &&
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function go(key, url) { window.location.href = url; }
  window.SlideNav = { supports: function (key) { return supported && !!DIRS[key]; }, go: go };
  if (!supported) return;

  var css = '@view-transition{navigation:auto}';
  // forward(d): старый экран уезжает в сторону d, новый въезжает с противоположной
  var VEC = { left: ['-100%,0', '100%,0'], right: ['100%,0', '-100%,0'], up: ['0,-100%', '0,100%'], down: ['0,100%', '0,-100%'] };
  Object.keys(VEC).forEach(function (d) {
    css += '@keyframes vt-old-' + d + '{to{transform:translate(' + VEC[d][0] + ');opacity:.55}}' +
      '@keyframes vt-new-' + d + '{from{transform:translate(' + VEC[d][1] + ')}}';
    // туда: to-lab-<d> — как forward(d); обратно: to-index-<d> — зеркально, как forward(противоположная)
    css += 'html:active-view-transition-type(to-lab-' + d + ')::view-transition-old(root){animation:vt-old-' + d + ' ' + DUR + ' both;mix-blend-mode:normal}' +
      'html:active-view-transition-type(to-lab-' + d + ')::view-transition-new(root){animation:vt-new-' + d + ' ' + DUR + ' both;mix-blend-mode:normal}' +
      'html:active-view-transition-type(to-index-' + d + ')::view-transition-old(root){animation:vt-old-' + OPP[d] + ' ' + DUR + ' both;mix-blend-mode:normal}' +
      'html:active-view-transition-type(to-index-' + d + ')::view-transition-new(root){animation:vt-new-' + OPP[d] + ' ' + DUR + ' both;mix-blend-mode:normal}';
  });
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function path(u) { try { return new URL(u, location.href).pathname; } catch (e) { return ''; } }
  function labKey(u) { var m = /\/works\/([\w-]+)\.html$/.exec(path(u)); return m && DIRS[m[1]] ? m[1] : null; }
  function isHome(u) { var p = path(u); return p === '/' || /\/index\.html$/.test(p); }
  function type(from, to) {
    var k;
    if (isHome(from) && (k = labKey(to))) return 'to-lab-' + DIRS[k];
    if ((k = labKey(from)) && isHome(to)) return 'to-index-' + DIRS[k];
    return null;
  }

  // уходим: помечаем тип перехода и просим следующую страницу не показывать заставку
  window.addEventListener('pageswap', function (e) {
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    var t = type(location.href, e.activation.entry.url);
    if (!t) return;
    e.viewTransition.types.add(t);
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ slide: true })); } catch (er) {}
  });

  // приходим: тот же тип для новой страницы
  window.addEventListener('pagereveal', function (e) {
    var act = window.navigation && navigation.activation;
    if (!e.viewTransition || !act || !act.from) return;
    var t = type(act.from.url, location.href);
    if (t) e.viewTransition.types.add(t);
  });
})();
