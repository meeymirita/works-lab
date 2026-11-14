/* АВТОГЕНЕРАЦИЯ из fixes/common/_verification.md (tools/build-verification.py) — руками не править. */
/* verification-md-hash: f96237a583babc35 */
window.LAB_STATUS = {
 "algorithms-php": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "только текстовый шаг 13.3, шпаргалка",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/algorithms-php.md"
 },
 "laravel-performance": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker"
  ],
  "rest": "аккаунт Blackfire для 4.5, GitHub Actions для workflow 9.2",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/laravel-performance.md"
 },
 "css": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/css.md"
 },
 "tailwind": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "эмуляция forced-colors/prefers-contrast в DevTools (8.2), шаги 8.3 и 9.3 (Production Hell) и итоговое ТЗ 10.1 не запускались; сессии 7–9 построчно не перечитывались",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/tailwind.md"
 },
 "inertia": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "не запускалось: SSR-сборка с новым кодом, прогон на PHP 8.4 вместо 8.5.7 хоста; сессии 1–5 построчно (но 26.10 во все шаги 1.1–6.2 с командами вписаны настоящие результаты: найдены и исправлены curl без X-Inertia-Version (409), пропущенные CommentFactory и роль по умолчанию, SSR-сборка отдельной командой, import './echo' ломал SSR); 6.3 «Production Hell» и 11.1 без подсказок",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/inertia.md"
 },
 "kubernetes": {
  "level": "none",
  "head": "Не вычитана и не проверена запуском",
  "tail": "не проверено",
  "method": [],
  "rest": "всё: команды и манифесты сессий 1–15 не выполнялись; имена ключей Helm-chart’ов (Traefik metrics), поведение kindnet с NetworkPolicy, helm plugin install, helm test, pending-upgrade",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/devops/kubernetes.md"
 },
 "docker": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "GHCR и токен GitHub, запуск workflow на GitHub, --platform, настройки Docker Desktop, поведение bind mount/host на Mac (помечено «самостоятельно»); прохождения человеком не было",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/devops/docker.md"
 },
 "traefik": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "реальный Let's Encrypt и токены DNS-провайдеров (шаг 8.4 — только конфигурация), proxy protocol с внешним балансировщиком, плагины из каталога, Podman/rootless, переезд на настоящий сервер (8.6 — только проверка синтаксиса), итоговое ТЗ (11.1) не решалось; на Mac отличаются host.docker.internal, права на смонтированные файлы (шаг 8.7), mkcert -install с запросом пароля; владелец не проходила",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/devops/traefik.md"
 },
 "caddy": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker"
  ],
  "rest": "не запускались: systemd-служба 13.1, кластер с общим хранилищем 13.4, Laravel за Caddy 8.3, FrankenPHP; публичный домен/Let's Encrypt 4.4, 13.2 — проверите сами при реальном прохождении",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/devops/caddy.md"
 },
 "php-coffee": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "6.1 (статическое поле) не запускался, повторная доставка в 6.3, репорт 2 из 9.3 (definitions.json), итоговое ТЗ 10.1 (не решается); сессии 6–9 построчно не перечитывались",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/php-coffee.md"
 },
 "php": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/php.md"
 },
 "postgresql": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/postgresql.md"
 },
 "prisma": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "не запускалось: workflow на самом GitHub — внешний ресурс; Prisma 8 — только справка",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/prisma.md"
 },
 "redis": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker"
  ],
  "rest": "не запускалось: сравнение phpredis и predis, TLS, заполнение redis-cache до 256 МБ, kill -9 воркера List, настоящая конкуренция 7.2, ShouldBeUnique/expireAfter, настоящий кластер; в 3.5 и 11.1 без подсказок",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/redis.md"
 },
 "rabbitmq": {
  "level": "part",
  "head": "Вычитана, проверена частично",
  "tail": "не проверено",
  "method": [
   "запуск в Docker"
  ],
  "rest": "9.2 (запуск Prometheus и срабатывание алерта), 9.3, 10.3 и итоговое ТЗ 11.1 не запускались; шаги 2.3–2.4 прогнаны на коде лабы (2 исправления: Pest не установлен, idempotency_key не в #[Fillable]); воркер OrderSequencedWorkerCommand и lab:publish-orders заменены эквивалентным PHP-скриптом",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/rabbitmq.md"
 },
 "laravel": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/laravel.md"
 },
 "nestjs": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "не запускались: задания «Production Hell» 14.3 — для самостоятельного решения",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/nestjs.md"
 },
 "graphql": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker"
  ],
  "rest": "не запускалось: экспорт трасс в настоящий коллектор Jaeger/Tempo, Apollo Router, Redis-хранилище для throttler, клики в GraphiQL — запросы выполнены через curl и скрипты; сессии 1–3 в этот проход не перечитывались построчно; в 6.6 «Production Hell» и 13.1 итоговое ТЗ без подсказок",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/graphql.md"
 },
 "js": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/js.md"
 },
 "typescript": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "сессия 10 — итоговое ТЗ без решения",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/typescript.md"
 },
 "vue": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "Vue Devtools 8.1 — инструмент браузера; e2e прогнан на сервере-заглушке, не на NestJS-стенде",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/vue.md"
 },
 "nuxt": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/nuxt.md"
 },
 "angular": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "не запускалось: озвучка экранным диктором, CSP с nonce, вход в английскую сборку через nginx; сессия 10 — итоговое ТЗ без решения, решаете сами",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/angular.md"
 },
 "bash": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [],
  "rest": "текст не вычитан человеком; не проверялись: интерактивный ввод (read, Ctrl+C), cron на реальном сервере (проверен только в контейнере), отличия macOS (sed -i, mv -T описаны, не запускались), установка Docker Desktop с нуля, прохождение человеком",
  "detail": ""
 },
 "centrifugo": {
  "level": "none",
  "head": "Не вычитана и не проверена запуском",
  "tail": "не проверено",
  "method": [],
  "rest": "всё: код и команды всех 21 сессий (авторы чата отдельно отметили: 8B, 12B, 13B, 15 и пример k6 не запускались; имена опций consumers, channel_regex, лимитов соединений, emulated_headers, internal_port — по памяти, сверить через centrifugo defaultenv; пакет denis660/laravel-centrifugo не читали в исходниках)",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/common/_verification.md"
 },
 "express": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "**15.11.2026 оба открытых пункта закрыты:** (1) редкий SyntaxError в сессии 14 — причина в фиксированном sleep 1 после запуска сервера, воспроизведено на урезанном CPU, исправлено циклом ожидания в сессиях 9, 11, 12–17; (2) Drift detected в сессиях 13 и 17 — два хозяина структуры базы (сырой schema.sql и Prisma), исправлено в 13.5 (первая миграция init, migrate() убран из server.js), в 18.4 — prisma migrate deploy при старте контейнера; повторный прогон 1→18 на чистой базе без Drift; заодно 11.4 теперь различает «до/после починки». Не проверялось: compose с Caddy из 18.5 целиком, прохождение владельцем, реальный Mac без Docker",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/express.md"
 }
};
