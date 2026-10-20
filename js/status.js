/* АВТОГЕНЕРАЦИЯ из fixes/common/_verification.md (tools/build-verification.py) — руками не править. */
/* verification-md-hash: 961989dfc63ebee5 */
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
  "rest": "",
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
  "rest": "задания 6.3 «Production Hell» без подсказок",
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
  "rest": "",
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
  "level": "none",
  "head": "Не вычитана и не проверена запуском",
  "tail": "не проверено",
  "method": [],
  "rest": "всё: команды, схема, миграции, версии Prisma 7 (на npm latest — 8 RC, версии закреплены), TypedSQL, relationLoadStrategy, пул и PgBouncer, трассировка; вычитки нет",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/prisma.md"
 },
 "redis": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker"
  ],
  "rest": "задания 3.5 без подсказок",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/redis.md"
 },
 "rabbitmq": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "не запускалось",
  "method": [
   "запуск в Docker"
  ],
  "rest": "",
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
  "level": "part",
  "head": "Вычитана, проверена частично",
  "tail": "не проверено",
  "method": [
   "запуск в Docker"
  ],
  "rest": "задания 14.3 «Production Hell» без подсказок",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/nestjs.md"
 },
 "graphql": {
  "level": "ok",
  "head": "Вычитана и проверена",
  "tail": "вам остаётся проверить самим",
  "method": [
   "запуск в Docker"
  ],
  "rest": "задания 6.6 «Production Hell» без подсказок",
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
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/typescript.md"
 },
 "vue": {
  "level": "part",
  "head": "Вычитана, проверена частично",
  "tail": "не проверено",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "построчная вычитка новых сессий 6–15 человеком/ассистентом построчно — не делалась; Vue SFC (.vue, defineModel, Suspense) не компилировались и не монтировались в реальном Vite-проекте; MSW и Playwright e2e (13.2) — только написаны, не выполнены; весь стенд (Vite + NestJS-бэкенд из сессии 1) не поднимался целиком с новыми сессиями; задание 15.1 не решалось; прохождение владельцем",
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
  "tail": "не запускалось",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/frontend/angular.md"
 },
 "bash": {
  "level": "none",
  "head": "Не вычитана и не проверена запуском",
  "tail": "не проверено",
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
  "level": "part",
  "head": "Вычитана, проверена частично",
  "tail": "не проверено",
  "method": [
   "запуск в Docker"
  ],
  "rest": "2 открытых пункта без решения: (1) сессия 14 — редкий SyntaxError при разборе ответа логина, не воспроизведён надёжно за отведённое время; (2) архитектурная нестыковка Prisma-миграций с сырым schema.sql — Drift detected возвращается периодически (сессии 13, 17), миграция роли в сессии 17 по факту не долетает до базы без ручного migrate reset (не внесено перестройкой 14.10, существовало и в версии 12.10, просто не было поймано тогда); плюс обычное — прохождение владельцем, реальный Mac без Docker",
  "detail": "https://github.com/meeymirita/lab-fixes/blob/main/backend/express.md"
 }
};
