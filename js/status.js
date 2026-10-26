/* АВТОГЕНЕРАЦИЯ из fixes/common/_verification.md (tools/build-verification.py) — руками не править. */
/* verification-md-hash: e5947c42843da80f */
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
  "level": "part",
  "head": "Вычитана, проверена частично",
  "tail": "не проверено",
  "method": [
   "запуск в Docker",
   "проверка в браузере"
  ],
  "rest": "сессии 7–10 — новые: написаны ассистентом по содержанию, без вычитки и без прогона в Docker/Chromium",
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
  "level": "part",
  "head": "Вычитана, проверена частично",
  "tail": "не проверено",
  "method": [
   "запуск в Docker"
  ],
  "rest": "сессии 6–10 — новые: написаны ассистентом по содержанию, без вычитки и без прогона в Docker",
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
  "rest": "сессии 7–11 и 2 новых шага главы 2 — новые: написаны ассистентом по содержанию, без вычитки и без прогона в Docker",
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
