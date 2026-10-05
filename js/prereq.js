/* Окно «Что нужно знать до старта» на главном экране каждой методички.
 *
 * Подключается в шаблон методички скриптом tools/patch-manuals.py (путь считается от глубины файла).
 * Данные — только здесь: уровень входа, что нужно знать, с чем придётся работать, какие лабы пройти раньше,
 * общий порядок прохождения. Источники: fixes/common/_order.md, README лаб и сами методички (раздел «Как устроена лаба»,
 * «Перед стартом», шаг 1.1). Меняете лабу — правьте и её запись здесь (tools/check-site.py сверяет набор ключей).
 *
 * Окно открывается само один раз для каждой лабы (localStorage) и всегда — кнопкой «Что знать до старта»
 * на главном экране методички.
 */
(function () {
  'use strict';

  // Уровни входа
  var LEVELS = {
    zero:  { label: 'С нуля', note: 'ничего знать заранее не нужно' },
    light: { label: 'Лёгкий вход', note: 'нужен минимум' },
    solid: { label: 'Нужна база', note: 'часть тем здесь не объясняется' },
    heavy: { label: 'Нужно многое', note: 'много технологий, без базы не пройти' }
  };

  // Рекомендуемый порядок прохождения (зависимости из fixes/common/_order.md).
  var ORDER = ['docker', 'php-coffee', 'php', 'algorithms-php', 'postgresql', 'rabbitmq', 'redis', 'laravel',
    'laravel-performance', 'css', 'tailwind', 'js', 'vue', 'inertia', 'typescript', 'nuxt', 'angular',
    'nestjs', 'graphql', 'traefik', 'caddy', 'kubernetes'];

  // Сила связи в «before»: need — без неё шаги не выполнить; know — методичка опирается на её знания; help — полезно.
  var LABS = {
    docker: {
      name: 'Docker Lab', file: 'docker/docker.html', accent: '#2496ED', level: 'zero',
      headline: 'Ничего знать не нужно — лаба идёт с нуля',
      know: ['Уметь открыть терминал и запустить команду',
             'Про контейнеры, образы и Bash заранее знать не нужно: оба объясняются с нуля, Bash идёт параллельным треком'],
      meet: ['Docker и Docker Compose', 'Bash: entrypoint-скрипты, set -euo pipefail, trap', 'Учебное Node.js-приложение и PostgreSQL'],
      before: [], tip: 'Нужен установленный Docker.'
    },
    'php-coffee': {
      name: 'OOP Lab', file: 'php-coffee/php-coffee.html', accent: '#777BB4', level: 'light',
      headline: 'Нужен только синтаксис PHP',
      know: ['Синтаксис PHP: переменные, функции, массивы, циклы',
             'Терминал и Docker на уровне «запустить и посмотреть вывод»'],
      meet: ['PHP 8.4: readonly, enum, promotion конструктора', 'Laravel 13 — со 2-й сессии, первая идёт на чистом PHP',
             'PostgreSQL и RabbitMQ (сессия 5)'],
      before: [], tip: 'Если ООП даётся тяжело — не спешите: это фундамент для большинства следующих лаб.'
    },
    php: {
      name: 'Чистый PHP Lab', file: 'php/php.html', accent: '#C9A876', level: 'light',
      headline: 'Синтаксис PHP и принципы ООП',
      know: ['Синтаксис PHP и работа в терминале',
             'ООП-принципы (инкапсуляция, полиморфизм, Value Object) — на уровне OOP-лабы: здесь они используются без объяснений'],
      meet: ['PHP 8.4 без фреймворка', 'PDO и PostgreSQL', 'Composer и автозагрузка PSR-4', 'Свой роутер, DI-контейнер, сессии и CSRF', 'PHPUnit (сессия 8)'],
      before: [{ key: 'php-coffee', kind: 'know', why: 'принципы ООП здесь используются без повторного объяснения' }],
      tip: 'Laravel знать не нужно: сравнения с ним даются по ходу.'
    },
    'algorithms-php': {
      name: 'Algorithms PHP Lab', file: 'algorithms-php/algorithms-php.html', accent: '#b45f06', level: 'light',
      headline: 'Нужен только синтаксис PHP',
      know: ['Циклы, массивы и функции в PHP — первые сессии используют только их',
             'Формулы сложности знать не нужно: она объясняется без формул и проверяется замером'],
      meet: ['PHP 8.4 CLI, SPL, PHPUnit', 'Замеры времени и памяти'],
      before: [], tip: 'Нужен Docker. Лаба самостоятельна, её удобно проходить рядом с «Чистым PHP».'
    },
    postgresql: {
      name: 'PostgreSQL Lab', file: 'postgresql/postgresql.html', accent: '#4A90D9', level: 'solid',
      headline: 'Уровень «умею SELECT и INSERT»',
      know: ['SELECT и INSERT; если JOIN пока «тёмный лес» — начните с сессии 0, там он разобран с нуля',
             'Docker Compose на уровне «поднять базу и подключиться»',
             'ORM и Laravel знать не нужно — это лаба про то, что происходит под ними'],
      meet: ['PostgreSQL 18 и psql', 'EXPLAIN, индексы, статистика', 'Транзакции, блокировки, MVCC, VACUUM', 'pgbench и миллион заказов (около 1 ГБ диска)'],
      before: [], tip: 'Лаба самостоятельна: ничего не берёт из других.'
    },
    rabbitmq: {
      name: 'RabbitMQ Lab', file: 'rabbitmq/rabbitmq.html', accent: '#FF6600', level: 'heavy',
      headline: 'Нужен уверенный Laravel и понимание очередей',
      know: ['Уверенный Laravel/PHP: транзакции, Artisan-команды',
             'Очереди хотя бы на уровне концепции: что такое job и воркер',
             'Транзакции SQL',
             'Docker Compose: поднять сервис и прочитать логи'],
      meet: ['Laravel 13', 'PostgreSQL 18', 'RabbitMQ 4 и протокол AMQP', 'Mailpit', 'Transactional Outbox, ack/nack, retry, DLQ'],
      before: [{ key: 'php-coffee', kind: 'know', why: 'ООП и контейнер Laravel используются без повторного объяснения' }],
      tip: 'Пройдена пользователем; методичка вычитана и проверена.'
    },
    redis: {
      name: 'Redis Lab', file: 'redis/redis.html', accent: '#DC382D', level: 'solid',
      headline: 'Laravel и Docker плюс RabbitMQ-лаба',
      know: ['Laravel и Docker на уровне RabbitMQ-лабы: домен заказов переиспользуется',
             'Идея очередей и воркеров — методичка постоянно сравнивает Streams с брокером'],
      meet: ['Laravel 13 и PostgreSQL 18', 'Redis 8: кэш, локи, лимитер, Lua, Streams, Pub/Sub'],
      before: [{ key: 'rabbitmq', kind: 'know', why: 'почти половина «почему» читается через сравнение с RabbitMQ-лабой' }],
      tip: 'Задания 3.5 («Production Hell») идут без подсказок.'
    },
    laravel: {
      name: 'Laravel Lab', file: 'laravel/laravel.html', accent: '#FF2D20', level: 'heavy',
      headline: 'Много технологий в одном проекте — нужна база',
      know: ['Базовый Laravel: роутинг, контроллеры, миграции, Blade — они даны ссылками на документацию, без разбора',
             'ООП на PHP: интерфейсы, внедрение зависимостей',
             'Общее представление об очередях и о том, зачем нужен брокер',
             'Docker Compose: сразу несколько контейнеров'],
      meet: ['PostgreSQL 18 и Eloquent: связи, pivot, N+1', 'Service Container и провайдеры', 'Sanctum, Gate и Policy', 'Минимальный Vue-фронт (только API-клиент)',
             'События, Observers и очереди на RabbitMQ 4', 'Почта и уведомления (Mailpit), планировщик', 'Кэш и rate limiting на Redis 8', 'Realtime через Reverb (WebSocket)', 'Feature- и unit-тесты'],
      before: [{ key: 'php-coffee', kind: 'know', why: 'ООП-основа' },
               { key: 'rabbitmq', kind: 'know', why: 'очереди и драйвер RabbitMQ в сессии 7' },
               { key: 'redis', kind: 'help', why: 'кэш, rate limit и Redis в сессии 9' }],
      tip: 'Десять сессий; весь стек (PostgreSQL, Redis, RabbitMQ, Mailpit, Reverb) поднимается в Docker.'
    },
    'laravel-performance': {
      name: 'Laravel Performance Lab', file: 'laravel-performance/laravel-performance.html', accent: '#0e7490', level: 'light',
      headline: 'Нужен базовый Laravel',
      know: ['Базовый Laravel: маршруты, контроллеры, Eloquent',
             'Docker Compose на уровне «поднять и посмотреть логи»',
             'k6, профилировщики, OPcache и Octane объясняются с нуля'],
      meet: ['k6 и перцентили (p95)', 'Debugbar и Telescope', 'SPX и Blackfire (нужен аккаунт)', 'OPcache и JIT', 'Кеш с тегами и блокировками', 'Octane + FrankenPHP', 'Бюджет p95 в CI (нужен GitHub)'],
      before: [{ key: 'laravel', kind: 'help', why: 'нужен базовый Laravel; по заданиям лаба самостоятельна' }],
      tip: 'Тяжёлые прогоны (миллион заказов, k6): ноутбук греется.'
    },
    css: {
      name: 'CSS Lab', file: 'css/css.html', accent: '#2965F1', level: 'zero',
      headline: 'Нужны только HTML и браузер',
      know: ['Минимум HTML и умение открыть страницу в браузере',
             'Разметка уже готова: вы пишете только стили, без фреймворков и препроцессоров'],
      meet: ['Каскад и @layer', 'Flexbox, Grid и subgrid', 'Container queries и :has()', 'oklch и тёмная тема через light-dark()', 'Анимации и view transitions'],
      before: [], tip: 'Нужен Docker (nginx) и браузер с современным CSS. Во фронтенд-треке идёт первой.'
    },
    tailwind: {
      name: 'Tailwind Lab', file: 'tailwind/tailwind.html', accent: '#38BDF8', level: 'light',
      headline: 'Нужен уверенный CSS',
      know: ['Каскад, flex, grid, container queries и :has() — Tailwind их не заменяет, а записывает классами',
             'HTML: разметку пишете сами'],
      meet: ['Tailwind CSS v4 и @theme', 'Варианты: group, peer, has-*', 'Адаптив и тёмная тема', '@layer components и @apply', 'Vite и nginx'],
      before: [{ key: 'css', kind: 'know', why: 'Tailwind строится на каскаде и box model' }], tip: ''
    },
    js: {
      name: 'Чистый JS Lab', file: 'js/js.html', accent: '#F4D35E', level: 'light',
      headline: 'Нужен базовый синтаксис JavaScript',
      know: ['Базовый синтаксис JS: переменные, функции, условия, циклы',
             'Терминал и браузер с консолью разработчика — больше лаба ничего не требует'],
      meet: ['var/let/const, this, замыкания', 'Прототипы и class', 'Event loop и async/await', 'DOM без фреймворка', 'ESM-модули и реактивность на Proxy', 'node:test'],
      before: [], tip: 'Общий фундамент для Vue и TypeScript: логично проходить первой из трёх.'
    },
    vue: {
      name: 'Vue Lab', file: 'vue/vue.html', accent: '#42B883', level: 'heavy',
      headline: 'Нужен уверенный JavaScript',
      know: ['Уверенный JavaScript: ES6+, async/await, деструктуризация',
             'Опыт с фреймворками не нужен. Бэкенд (мини-сервис на Node) дан готовым'],
      meet: ['Vue 3.5 и Vite 7', 'Реактивность, компоненты, слоты', 'Pinia и Vue Router', 'WebSocket и канбан-доска', 'Vitest'],
      before: [{ key: 'js', kind: 'help', why: 'если сомневаетесь в фундаменте JS' }], tip: 'Нужен Docker; свободны порты 5173 и 3000.'
    },
    inertia: {
      name: 'Inertia Lab', file: 'inertia/inertia.html', accent: '#8B5CF6', level: 'solid',
      headline: 'Нужны Laravel и Vue 3',
      know: ['Laravel на уровне Laravel Lab: контроллеры, Eloquent, FormRequest, Policies',
             'Vue 3 (Composition API) на уровне Vue Lab',
             'Сам мост Inertia объясняется с нуля'],
      meet: ['Laravel 13 без starter kit', 'Inertia 3 и Vue 3 с TypeScript', 'Pinia и Vite', 'SSR и мета-теги', 'Typed routes (Wayfinder)'],
      before: [{ key: 'laravel', kind: 'know', why: 'контроллеры, Eloquent, Policies — без разбора' },
               { key: 'vue', kind: 'know', why: 'Vue 3 Composition API — без разбора' }],
      tip: 'В общем маршруте Vue идёт раньше Inertia; без Vue лучше сначала пройти его.'
    },
    typescript: {
      name: 'TypeScript Lab', file: 'typescript/typescript.html', accent: '#3178C6', level: 'heavy',
      headline: 'JavaScript, ООП и готовность к абстрактному мышлению',
      know: ['JavaScript на уровне «писал на нём»',
             'ООП-концепции — из OOP-лабы, ссылки по тексту',
             'Типы (generics, conditional и mapped types) непривычны после динамического PHP и JS — это нормально'],
      meet: ['TypeScript 6 и Node 24', 'Generics, размеченные объединения, template literal types', 'Zod и Vitest', 'Express и typed client', 'Vue + TS (сессия 5)'],
      before: [{ key: 'vue', kind: 'know', why: 'сессия 5 использует Vue-приложение' },
               { key: 'js', kind: 'help', why: 'фундамент JavaScript' }],
      tip: 'Можно идти после Vue или параллельно с ней.'
    },
    nuxt: {
      name: 'Nuxt Lab', file: 'nuxt/nuxt.html', accent: '#00DC82', level: 'heavy',
      headline: 'Нужны Vue и TypeScript',
      know: ['Vue на уровне Vue Lab: ref, computed, props/emits, Pinia, Router — заново не объясняются',
             'TypeScript на уровне сессий 1–3 TS-лабы'],
      meet: ['Nuxt 4, SSR и гидрация', 'Nitro и server routes', 'Drizzle + SQLite, Zod', 'Сессии и middleware', 'Nuxt Content, routeRules (SSG, SWR, SPA), SEO', 'Тесты и Docker'],
      before: [{ key: 'vue', kind: 'know', why: 'без разбора' }, { key: 'typescript', kind: 'know', why: 'сессии 1–3' }],
      tip: 'Код из других лаб не берёт.'
    },
    angular: {
      name: 'Angular Lab', file: 'angular/angular.html', accent: '#CC26D5', level: 'heavy',
      headline: 'Нужен TypeScript',
      know: ['TypeScript на уровне сессий 1–3 TS-лабы',
             'Всё, что специфично для Angular (декораторы, DI, сигналы), объясняется внутри лабы',
             'Опыт Vue полезен для сравнений, но не обязателен'],
      meet: ['Angular 22: сигналы, OnPush, zoneless', 'DI, HttpClient, интерцепторы, httpResource', 'Роутер с lazy и guards', 'Signal Forms и Reactive Forms', 'RxJS и SSE', 'Vitest и nginx'],
      before: [{ key: 'typescript', kind: 'know', why: 'сессии 1–3' }, { key: 'nuxt', kind: 'help', why: 'теория сравнивает с Vue и Nuxt' }],
      tip: 'Бэкенд готовый (api/server.mjs), лаба целиком про фронтенд.'
    },
    nestjs: {
      name: 'NestJS Lab', file: 'nestjs/nestjs.html', accent: '#E0234E', level: 'heavy',
      headline: 'Самостоятельная, но объёмная: TypeScript идёт по ходу',
      know: ['Основы JavaScript и Node: функции, async/await, npm',
             'TypeScript-минимум, нужный для Nest, объясняется в сессии 1: отдельно учить его не обязательно',
             'Лаба полностью самостоятельна: других лаб проходить не требуется'],
      meet: ['NestJS 11: DI, модули, scopes', 'Prisma 7 и PostgreSQL 18', 'JWT с ротацией refresh-токенов, argon2', 'RBAC, события, WebSocket (Socket.IO)', 'Swagger, helmet, rate limit', 'Unit- и e2e-тесты, Docker'],
      before: [{ key: 'typescript', kind: 'help', why: 'TS-минимум есть и в сессии 1, но с типами проще' }],
      tip: 'Это не лаба на один вечер: по словам самой методички, за один присест к середине начинается копипаст без понимания.'
    },
    graphql: {
      name: 'GraphQL Lab', file: 'graphql/graphql.html', accent: '#E535AB', level: 'heavy',
      headline: 'Нужны основы NestJS и TypeScript',
      know: ['Основы NestJS: модули, DI, декораторы',
             'TypeScript: классы, интерфейсы, async/await',
             'Остальное, включая сам язык запросов, объясняется по ходу'],
      meet: ['NestJS и Apollo Server', 'Prisma 7 и PostgreSQL 18', 'DataLoader и N+1', 'JWT и права на уровне полей', 'Подписки через Redis', 'Защита от тяжёлых запросов, тесты'],
      before: [{ key: 'nestjs', kind: 'help', why: 'основы NestJS' }],
      tip: 'Проект самостоятельный: свой домен (каталог фильмов).'
    },
    traefik: {
      name: 'Traefik Lab', file: 'traefik/traefik.html', accent: '#14B8A6', level: 'light',
      headline: 'Нужен Docker Compose на уровне «поднять и читать логи»',
      know: ['Docker Compose: поднять сервис, прочитать логи',
             'Новичкам в контейнерах — вводный раздел 0 «Docker с нуля» внутри лабы'],
      meet: ['Traefik 3: EntryPoint → Router → Middleware → Service', 'Docker provider и labels', 'API, frontend, PostgreSQL, Adminer', 'Балансировка и canary', 'TLS: mkcert, Let\'s Encrypt'],
      before: [{ key: 'docker', kind: 'know', why: 'контейнеры, сети, volume и compose' }],
      tip: 'Let\'s Encrypt требует публичный домен; локально — mkcert.'
    },
    caddy: {
      name: 'Caddy Lab', file: 'caddy/caddy.html', accent: '#0a8f6a', level: 'zero',
      headline: 'Ничего знать не нужно — лаба идёт с нуля',
      know: ['Уметь открыть терминал и запустить команду',
             'Про HTTP, TLS и reverse proxy заранее знать не нужно: объясняется с нуля в разделах 1–7'],
      meet: ['Caddy 2: Caddyfile и JSON, Admin API', 'Reverse proxy, WebSocket, SSE', 'Автоматический HTTPS: локальный CA, Let\'s Encrypt, On-Demand TLS', 'Балансировка, безопасность, Docker, PHP-FPM', 'Расширение через xcaddy и модуль на Go'],
      before: [], tip: 'Нужен установленный Caddy; для сессии 7 — Docker, для сессии 12 — Go.'
    },
    kubernetes: {
      name: 'Kubernetes Lab', file: 'kubernetes/kubernetes.html', accent: '#326CE5', level: 'heavy',
      headline: 'Нужны пройденные Docker и Traefik',
      know: ['Образ, контейнер, сеть, volume, healthcheck — по Docker-лабе',
             'Модель Traefik EntryPoint → Router → Middleware → Service — по Traefik-лабе',
             'Код api/ из Traefik-лабы (Dockerfile, server.js, package.json); он приведён и здесь, но свой образ нужен'],
      meet: ['kind и kubectl', 'Pod, Deployment, Service и DNS', 'ConfigMap, Secret, PVC', 'Readiness и liveness probes', 'Traefik как Ingress-контроллер', 'HorizontalPodAutoscaler и metrics-server'],
      before: [{ key: 'traefik', kind: 'need', why: 'берёт стек и образ api из Traefik-лабы' },
               { key: 'docker', kind: 'know', why: 'все понятия контейнеров' }],
      tip: 'Нужны kind v0.33 и kubectl; кластер поднимается на ноутбуке.'
    }
  };

  var KIND = { need: 'обязательно', know: 'нужны знания', help: 'полезно' };

  // ── определяем лабу по адресу страницы ─────────────────────────────────
  var script = document.currentScript;
  var root = script && script.src ? script.src.replace(/works\/js\/prereq\.js.*$/, '') : '../';
  // методички лежат не на сайте, а в бакете Object Storage — ссылки на НИХ (другие лабы в
  // "Сначала пройдите"/"Порядок"/"Дальше") строим от бакета, а не от root (сайта)
  var BUCKET = 'https://meeymirita-files.storage.yandexcloud.net/';
  var path = decodeURIComponent(location.pathname);
  var key = null;
  Object.keys(LABS).forEach(function (k) { if (path.slice(-LABS[k].file.length) === LABS[k].file) key = k; });
  window.LAB_PREREQ = { order: ORDER, labs: LABS, levels: LEVELS, key: key };
  if (!key) return;
  var lab = LABS[key];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function inkOn(hex) { var c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#1b1a19' : '#ffffff'; }
  function mix(hex, amt, base) { var c = rgb(hex), b = rgb(base); return 'rgb(' + c.map(function (v, i) { return Math.round(v * amt + b[i] * (1 - amt)); }).join(',') + ')'; }

  var lvl = LEVELS[lab.level];
  var pos = ORDER.indexOf(key) + 1;
  var accent = lab.accent, ink = inkOn(accent);

  var css = '' +
    '#pq-btn{position:fixed;right:20px;bottom:20px;z-index:9000;display:none;align-items:center;gap:8px;padding:11px 16px;border:2px solid #1b1a19;background:' + accent + ';color:' + ink + ';font:800 14px/1 system-ui,sans-serif;cursor:pointer;box-shadow:4px 4px 0 #1b1a19}' +
    '#pq-btn:hover{transform:translate(-1px,-1px);box-shadow:5px 5px 0 #1b1a19}' +
    '#pq-btn.on{display:flex}' +
    '#pq-ov{position:fixed;inset:0;z-index:9500;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(10,9,8,.62)}' +
    '#pq-ov.open{display:flex}' +
    '#pq{width:min(880px,100%);max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:#fff;color:#1b1a19;border:3px solid #1b1a19;box-shadow:8px 8px 0 ' + accent + ';font:15px/1.55 system-ui,sans-serif}' +
    'body[data-theme=dark] #pq{background:#1c1a19;color:#f1ede8;border-color:#f1ede8}' +
    '#pq-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;padding:20px 24px;background:' + accent + ';color:' + ink + '}' +
    '#pq-head small{display:block;font:700 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-bottom:8px}' +
    '#pq-head h2{margin:0;font:800 clamp(20px,3vw,28px)/1.15 system-ui,sans-serif}' +
    '#pq-head p{margin:6px 0 0;font-weight:600}' +
    '#pq-x{flex:none;width:36px;height:36px;border:2px solid currentColor;background:transparent;color:inherit;font:700 18px/1 system-ui;cursor:pointer}' +
    '#pq-body{overflow:auto;padding:20px 24px;display:grid;gap:20px;scrollbar-width:thin;scrollbar-color:' + accent + ' transparent}' +
    '#pq-body::-webkit-scrollbar{width:12px}#pq-body::-webkit-scrollbar-track{background:' + mix(accent, 0.14, '#ffffff') + '}' +
    'body[data-theme=dark] #pq-body::-webkit-scrollbar-track{background:' + mix(accent, 0.2, '#1c1a19') + '}' +
    '#pq-body::-webkit-scrollbar-thumb{background:' + accent + ';border:2px solid #1b1a19;border-radius:0}' +
    '#pq-body::-webkit-scrollbar-thumb:hover{background:' + mix(accent, 0.8, '#000000') + '}' +
    '#pq h3{margin:0 0 8px;font:800 12px/1 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:' + mix(accent, 1, '#000000') + '}' +
    'body[data-theme=dark] #pq h3{color:' + accent + '}' +
    '#pq ul{margin:0;padding-left:20px}#pq li{margin:5px 0}' +
    '#pq .pq-lvl{display:inline-block;padding:3px 10px;font:800 12px/1.4 ui-monospace,monospace;border:2px solid currentColor;margin-right:8px}' +
    '#pq .pq-pre{display:grid;gap:8px}' +
    '#pq a{color:inherit}' +
    '#pq .pq-lab{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;padding:9px 12px;border:2px solid rgba(127,127,127,.35);text-decoration:none}' +
    '#pq .pq-lab:hover{border-color:' + accent + '}' +
    '#pq .pq-lab b{font-weight:800}#pq .pq-lab span{opacity:.75}' +
    '#pq .pq-k{font:700 10.5px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;background:rgba(127,127,127,.18)}' +
    '#pq .pq-k.need{background:#d64545;color:#fff}' +
    '#pq ol.pq-ord{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}' +
    '#pq ol.pq-ord a{display:flex;gap:8px;align-items:center;padding:7px 10px;border:2px solid rgba(127,127,127,.3);text-decoration:none;font-size:14px}' +
    '#pq ol.pq-ord a:hover{border-color:currentColor}' +
    '#pq ol.pq-ord a i{flex:none;width:9px;height:9px;border-radius:50%}' +
    '#pq ol.pq-ord a em{font:700 11px/1 ui-monospace,monospace;opacity:.6;font-style:normal;min-width:20px}' +
    '#pq ol.pq-ord a.cur{background:' + accent + ';color:' + ink + ';border-color:' + accent + ';font-weight:800}' +
        '#pq-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:14px 24px;border-top:2px solid rgba(127,127,127,.3)}' +
    '#pq-foot .l{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}' +
    '#pq-go{padding:11px 22px;border:2px solid #1b1a19;background:' + accent + ';color:' + ink + ';font:800 15px system-ui;cursor:pointer;box-shadow:3px 3px 0 #1b1a19}' +
    '@media(max-width:560px){#pq-head,#pq-body,#pq-foot{padding-left:16px;padding-right:16px}#pq-btn{right:12px;bottom:12px}}';

  function html() {
    var pre = lab.before.map(function (b) {
      var t = LABS[b.key];
      return '<a class="pq-lab" href="' + BUCKET + t.file + '"><b>' + esc(t.name) + '</b><span class="pq-k ' + b.kind + '">' + KIND[b.kind] + '</span><span>' + esc(b.why) + '</span></a>';
    }).join('');
    var path = route(key);
    var order = path.map(function (k, i) {
      var t = LABS[k];
      return '<li><a class="' + (k === key ? 'cur' : '') + '" href="' + BUCKET + t.file + '"' + (k === key ? ' aria-current="page"' : '') + '><em>' + (i + 1) + '</em><i style="background:' + t.accent + '"></i>' + esc(t.name.replace(/ Lab$/, '')) + (k === key ? ' · эта работа' : '') + '</a></li>';
    }).join('');
    var next = ORDER[ORDER.indexOf(key) + 1];
    var nextHtml = next ? '<p style="margin:10px 0 0;opacity:.85">Дальше по общему порядку: <a href="' + BUCKET + LABS[next].file + '">' + esc(LABS[next].name) + '</a>.</p>' : '';
    var routeHtml = path.length > 1
      ? '<section><h3>Порядок: что пройти до этой работы</h3><ol class="pq-ord">' + order + '</ol>' + nextHtml + '</section>'
      : '<section><h3>Порядок</h3><p style="margin:0">Предыдущих работ проходить не нужно: можно начинать сразу.</p>' + nextHtml + '</section>';
    return '<div id="pq" role="dialog" aria-modal="true" aria-labelledby="pq-t">' +
      '<div id="pq-head"><div><small>Перед стартом · лаба ' + pos + ' из ' + ORDER.length + ' в общем порядке</small>' +
      '<h2 id="pq-t">' + esc(lab.name) + ': что нужно знать</h2><p><span class="pq-lvl">' + esc(lvl.label) + '</span>' + esc(lab.headline) + '</p></div>' +
      '<button id="pq-x" type="button" aria-label="Закрыть">✕</button></div>' +
      '<div id="pq-body">' +
      '<section><h3>Нужно знать и понимать</h3><ul>' + lab.know.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>' +
      (lab.before.length ? '<section><h3>Сначала пройдите</h3><div class="pq-pre">' + pre + '</div></section>' : '') +
      '<section><h3>С чем придётся работать</h3><ul>' + lab.meet.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (lab.tip ? '<p style="margin:10px 0 0;opacity:.85">' + esc(lab.tip) + '</p>' : '') + '</section>' +
      routeHtml +
      '</div>' +
      '<div id="pq-foot"><div class="l"><a href="' + root + 'works/progress.html">Все работы и прогресс</a><a href="' + root + 'index.html#routes">Маршруты обучения</a></div>' +
      '<button id="pq-go" type="button">Понятно, начать</button></div></div>';
  }

  // Что пройти до работы: транзитивно по need/know, плюс прямые «полезно» (без их собственных зависимостей); в порядке ORDER, последней — сама работа.
  function route(k) {
    var seen = {};
    (function walk(x, direct) {
      LABS[x].before.forEach(function (b) {
        if (b.kind === 'help' && !direct) return;
        if (!seen[b.key]) { seen[b.key] = true; if (b.kind !== 'help') walk(b.key, false); }
      });
    })(k, true);
    seen[k] = true;
    return ORDER.filter(function (x) { return seen[x]; });
  }

  var ov, btn, shown = false;
  var styled = false;
  function addStyle() { if (styled) return; styled = true; var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
  function open() { build(); ov.classList.add('open'); document.getElementById('pq-go').focus(); }
  function close() { if (ov) ov.classList.remove('open'); try { localStorage.setItem('anitech-prereq:' + key, '1'); } catch (e) {} }
  function build() {
    if (ov) return;
    addStyle();
    ov = document.createElement('div'); ov.id = 'pq-ov'; ov.innerHTML = html(); document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.id === 'pq-x' || e.target.id === 'pq-go') close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
  }

  function isHome() {
    var all = document.querySelectorAll('div,span,small,p');
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.children.length === 0 && /^лабораторная работа$/i.test((e.textContent || '').trim())) return true;
    }
    return false;
  }

  function sync() {
    if (!btn) {
      addStyle();
      btn = document.createElement('button'); btn.id = 'pq-btn'; btn.type = 'button'; btn.textContent = 'Что знать до старта';
      btn.addEventListener('click', open); document.body.appendChild(btn);
    }
    var home = isHome();
    btn.classList.toggle('on', home);
    if (home && !shown) {
      shown = true;
      var seen = false; try { seen = !!localStorage.getItem('anitech-prereq:' + key); } catch (e) {}
      if (!seen && !/^#(step|sec)-/.test(location.hash)) open();
    }
    if (!home && ov && ov.classList.contains('open')) { /* окно открыто — не трогаем */ }
  }

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(sync, 120); }
  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
