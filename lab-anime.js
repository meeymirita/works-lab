// Прототип редизайна «аниме-опенинг» для страницы лабы.
// Работает поверх renderLabPage() из lab.js: переписывает подписи и добавляет
// номер лабы, направление и превью следующей лабы.
// Подключается ко всем страницам works/*.html после lab.js.
(function () {
  // тот же порядок и те же направления, что на главной: номер лабы совпадает с карточкой
  var ORDER = ['js', 'typescript', 'vue', 'nuxt', 'php', 'php-coffee', 'nestjs', 'graphql', 'laravel', 'redis', 'rabbitmq', 'postgresql', 'docker', 'traefik', 'kubernetes'];
  var TRACKS = [
    { n: 1, title: 'Фронтенд', keys: ['js', 'typescript', 'vue', 'nuxt'] },
    { n: 2, title: 'Бэкенд', keys: ['php', 'php-coffee', 'nestjs', 'graphql', 'laravel', 'redis', 'rabbitmq', 'postgresql'] },
    { n: 3, title: 'Инфраструктура', keys: ['docker', 'traefik', 'kubernetes'] }
  ];

  function labByKey(key) {
    return LABS.filter(function (l) { return l.key === key; })[0];
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  // Заголовок — одно слово без переносов: от «JS» до «KUBERNETES». Размер подбираем по ширине
  // колонки: замеряем слово на 100px и масштабируем, но не крупнее 170px и потолка по ширине экрана.
  function fitTitle() {
    var el = document.querySelector('.ep-title');
    if (!el || !el.parentElement) return;
    var avail = el.parentElement.clientWidth - 20;          // запас на цветную тень справа
    el.style.fontSize = '100px';
    var at100 = el.getBoundingClientRect().width || 1;
    // потолок по ширине экрана: на компьютере 11vw (рядом обложка), на телефоне колонка во всю ширину
    var cap = window.innerWidth < 760 ? window.innerWidth * .3 : window.innerWidth * .11;
    var size = Math.min(170, cap, avail * 100 / at100);
    el.style.fontSize = Math.max(24, Math.floor(size)) + 'px';
  }

  window.animeEnhance = function (key) {
    var lab = labByKey(key);
    if (!lab) return;
    var idx = ORDER.indexOf(key);
    var ep = idx + 1;
    var track = TRACKS.filter(function (t) { return t.keys.indexOf(key) !== -1; })[0];

    document.documentElement.classList.add('anime');
    document.title = lab.title + ' — лаба ' + pad(ep) + ' · ANITECH';

    // шапка
    var back = document.querySelector('.lab-nav-links a[href="../index.html#works"]');
    if (back) back.textContent = '← все лабы';

    // первый экран: номер лабы, направление, заголовок без «lab»
    var eyebrow = document.querySelector('.lab-eyebrow');
    if (eyebrow) {
      eyebrow.innerHTML =
        '<span class="ep-tag"><span>лаба</span><b>' + pad(ep) + '</b></span>' +
        '<span class="ep-of">из ' + ORDER.length + '</span>' +
        (track ? '<span class="ep-arc">Направление ' + track.n + ' · ' + esc(track.title) + '</span>' : '');
    }
    var title = document.querySelector('.lab-title');
    if (title) {
      var word = lab.titleMain.toUpperCase();
      title.innerHTML = '<span class="ep-title" data-text="' + esc(word) + '">' +
        word.split('').map(function (ch) { return '<span class="ep-ch">' + esc(ch) + '</span>'; }).join('') +
        '</span>';
      title.setAttribute('aria-label', lab.title);
      fitTitle();
      window.addEventListener('resize', fitTitle);
      // шрифт заголовка грузится не сразу: пересчитать, когда он действительно подгрузится
      if (document.fonts) {
        if (document.fonts.load) document.fonts.load('100px "Dela Gothic One"').then(fitTitle, function () {});
        document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', fitTitle);
      }
      window.addEventListener('load', fitTitle);
    }

    // обложка: наклейка с номером лабы
    var image = document.querySelector('.lab-hero-image');
    if (image) image.insertAdjacentHTML('beforeend', '<span class="ep-img-tag">лаба ' + pad(ep) + '</span>');

    // полоса цифр
    var statValues = document.querySelectorAll('.lab-stat-value');
    if (statValues[2]) statValues[2].textContent = 'свой репозиторий';

    // части страницы вместо «01 / программа»
    var kickers = document.querySelectorAll('.lab-kicker');
    var parts = ['Часть 1 · программа', 'Часть 2 · стек', 'Часть 3 · материалы'];
    kickers.forEach(function (k, i) { if (parts[i]) k.textContent = parts[i]; });
    var firstMaterial = document.querySelector('.lab-material span');
    if (firstMaterial && lab.open) firstMaterial.textContent = 'методичка';

    // соседние лабы — по порядку главной, «следующая» оформлена как превью
    var prev = labByKey(ORDER[(idx - 1 + ORDER.length) % ORDER.length]);
    var next = labByKey(ORDER[(idx + 1) % ORDER.length]);
    var pager = document.querySelector('.lab-pager-grid');
    if (pager && prev && next) {
      // обе соседние лабы — карточками с обложкой: предыдущая слева, следующая справа
      var neighbour = function (l, dir) {
        var isNext = dir === 'next';
        var img = '<span class="ep-nb-img"><img src="images/thumbs/' + l.key + '.webp" alt="" loading="lazy" width="1200" height="1200"></span>';
        var text =
          '<span class="ep-nb-text">' +
            '<span class="lab-pager-kicker mono">' + (isNext ? 'Следующая лаба · ' : '← Предыдущая лаба · ') + pad(ORDER.indexOf(l.key) + 1) + '</span>' +
            '<span class="lab-pager-title display">' + esc(l.title) + '</span>' +
            '<span class="ep-nb-sub">' + esc(l.subtitle) + '</span>' +
            '<span class="ep-nb-go mono">' + (isNext ? 'перейти →' : '← вернуться') + '</span>' +
          '</span>';
        return '<a href="' + l.key + '.html" class="lab-pager-link ep-nb ep-' + dir + '" data-pl-name="' + esc(l.title) + '" data-pl-color="' + l.accent + '" style="--pager-accent:' + l.accent + '">' +
          (isNext ? text + img : img + text) + '</a>';
      };
      pager.innerHTML = neighbour(prev, 'prev') + neighbour(next, 'next');
    }

    // подвал
    var footer = document.querySelector('.lab-footer');
    if (footer) {
      footer.innerHTML = '<span>ANITECH · обучающая платформа</span>' +
        '<span class="lab-footer-git"><span class="lab-spinner"></span>лаба ' + pad(ep) + ' из ' + ORDER.length + '</span>';
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
