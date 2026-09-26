// Прототип редизайна «аниме-опенинг» для страницы серии.
// Работает поверх renderLabPage() из lab.js: переписывает подписи и добавляет
// «серийные» элементы (номер серии, арка, отметка «просмотрено», превью следующей серии).
// Подключается пока только к nuxt.html — остальные страницы не затронуты.
(function () {
  // тот же порядок и те же арки, что на главной: номер серии совпадает с карточкой
  var ORDER = ['js', 'typescript', 'vue', 'nuxt', 'php', 'php-coffee', 'nestjs', 'graphql', 'laravel', 'redis', 'rabbitmq', 'postgresql', 'docker', 'traefik', 'kubernetes'];
  var ARCS = [
    { n: 1, title: 'Фронтенд', keys: ['js', 'typescript', 'vue', 'nuxt'] },
    { n: 2, title: 'Бэкенд', keys: ['php', 'php-coffee', 'nestjs', 'graphql', 'laravel', 'redis', 'rabbitmq', 'postgresql'] },
    { n: 3, title: 'Инфраструктура', keys: ['docker', 'traefik', 'kubernetes'] }
  ];
  var WATCH_KEY = 'anitech-watched';

  function labByKey(key) {
    return LABS.filter(function (l) { return l.key === key; })[0];
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  function getWatched() {
    try { var v = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function setWatched(list) {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function setText(sel, text) {
    var el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  window.animeEnhance = function (key) {
    var lab = labByKey(key);
    if (!lab) return;
    var idx = ORDER.indexOf(key);
    var ep = idx + 1;
    var arc = ARCS.filter(function (a) { return a.keys.indexOf(key) !== -1; })[0];

    document.documentElement.classList.add('anime');
    document.title = lab.title + ' — серия ' + pad(ep) + ' · ANITECH';

    // шапка
    var back = document.querySelector('.lab-nav-links a[href="../index.html#works"]');
    if (back) back.textContent = '← все серии';

    // первый экран: номер серии, арка, заголовок без «lab»
    var eyebrow = document.querySelector('.lab-eyebrow');
    if (eyebrow) {
      eyebrow.innerHTML =
        '<span class="ep-tag"><span>серия</span><b>' + pad(ep) + '</b></span>' +
        '<span class="ep-of">из ' + ORDER.length + '</span>' +
        (arc ? '<span class="ep-arc">Арка ' + arc.n + ' · ' + esc(arc.title) + '</span>' : '');
    }
    var title = document.querySelector('.lab-title');
    if (title) {
      var word = lab.titleMain.toUpperCase();
      title.innerHTML = '<span class="ep-title" data-text="' + esc(word) + '">' +
        word.split('').map(function (ch) { return '<span class="ep-ch">' + esc(ch) + '</span>'; }).join('') +
        '</span>';
      title.setAttribute('aria-label', lab.title);
    }

    // отметка «просмотрено»: кнопка в первом экране + штамп на обложке, общий ключ с главной
    var actions = document.querySelector('.lab-hero-actions');
    var image = document.querySelector('.lab-hero-image');
    if (image) {
      image.insertAdjacentHTML('beforeend',
        '<span class="ep-img-tag">серия ' + pad(ep) + '</span><span class="ep-stamp" aria-hidden="true">просмотрено</span>');
    }
    if (actions) {
      actions.insertAdjacentHTML('beforeend', '<button type="button" class="lab-btn ep-watch" aria-pressed="false"></button>');
      var btn = actions.querySelector('.ep-watch');
      var sync = function () {
        var on = getWatched().indexOf(key) !== -1;
        btn.setAttribute('aria-pressed', on);
        btn.textContent = on ? '✓ Просмотрено' : 'Отметить просмотренной';
        document.documentElement.classList.toggle('ep-is-watched', on);
      };
      btn.addEventListener('click', function () {
        var list = getWatched();
        var i = list.indexOf(key);
        if (i === -1) list.push(key); else list.splice(i, 1);
        setWatched(list);
        sync();
      });
      window.addEventListener('storage', function (e) { if (e.key === WATCH_KEY) sync(); });
      sync();
    }

    // полоса цифр
    var statValues = document.querySelectorAll('.lab-stat-value');
    if (statValues[2]) statValues[2].textContent = 'свой репозиторий';

    // части страницы вместо «01 / программа»
    var kickers = document.querySelectorAll('.lab-kicker');
    var parts = ['Часть 1 · программа', 'Часть 2 · стек', 'Часть 3 · материалы'];
    kickers.forEach(function (k, i) { if (parts[i]) k.textContent = parts[i]; });
    var firstMaterial = document.querySelector('.lab-material span');
    if (firstMaterial && lab.open) firstMaterial.textContent = 'методичка';

    // соседние серии — по порядку главной, а «следующая» оформлена как превью
    var prev = labByKey(ORDER[(idx - 1 + ORDER.length) % ORDER.length]);
    var next = labByKey(ORDER[(idx + 1) % ORDER.length]);
    var pager = document.querySelector('.lab-pager-grid');
    if (pager && prev && next) {
      pager.innerHTML =
        '<a href="' + prev.key + '.html" class="lab-pager-link ep-prev" data-pl-name="' + esc(prev.title) + '" data-pl-color="' + prev.accent + '" style="--pager-accent:' + prev.accent + '">' +
          '<span class="lab-pager-kicker mono">← предыдущая серия · ' + pad(ORDER.indexOf(prev.key) + 1) + '</span>' +
          '<span class="lab-pager-title display">' + esc(prev.title) + '</span>' +
        '</a>' +
        '<a href="' + next.key + '.html" class="lab-pager-link ep-next" data-pl-name="' + esc(next.title) + '" data-pl-color="' + next.accent + '" style="--pager-accent:' + next.accent + '">' +
          '<span class="ep-next-img"><img src="images/thumbs/' + next.key + '.webp" alt="" loading="lazy" width="1200" height="1200"></span>' +
          '<span class="ep-next-text">' +
            '<span class="lab-pager-kicker mono">В следующей серии · ' + pad(ORDER.indexOf(next.key) + 1) + '</span>' +
            '<span class="lab-pager-title display">' + esc(next.title) + '</span>' +
            '<span class="ep-next-sub">' + esc(next.subtitle) + '</span>' +
            '<span class="ep-next-go mono">смотреть →</span>' +
          '</span>' +
        '</a>';
    }

    // подвал
    var footer = document.querySelector('.lab-footer');
    if (footer) {
      footer.innerHTML = '<span>ANITECH · конец серии ' + pad(ep) + '</span>' +
        '<span class="lab-footer-git"><span class="lab-spinner"></span>продолжение следует</span>';
    }

    // заставка: буквы влетают, вспышка, остальное подтягивается
    var hero = document.querySelector('.lab-hero');
    if (hero) hero.insertAdjacentHTML('afterbegin', '<div class="ep-lines" aria-hidden="true"></div><div class="ep-flash" aria-hidden="true"></div>');
    if (window.gsap && gsapReady) {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.ep-ch', { yPercent: -120, scale: 2.4, autoAlpha: 0, filter: 'blur(8px)', duration: .5, stagger: .06, ease: 'back.out(2)' }, .15)
        .fromTo('.ep-flash', { autoAlpha: .85 }, { autoAlpha: 0, duration: .45 }, '-=.1')
        .from('.lab-eyebrow > *, .lab-subtitle, .lab-desc, .lab-hero-actions > *', { y: 20, autoAlpha: 0, duration: .45, stagger: .05 }, '-=.3')
        .from('.lab-hero-image', { x: 40, rotate: 4, autoAlpha: 0, duration: .6 }, '<')
        .add(function () { document.documentElement.classList.add('ep-played'); });
    } else {
      document.documentElement.classList.add('ep-played');
    }
  };
})();
