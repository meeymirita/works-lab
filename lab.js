var LABS = [
  {
    key: 'rabbitmq',
    titleMain: 'rabbitmq',
    title: 'RabbitMQ Lab',
    subtitle: 'Transactional Outbox, воркеры, DLQ',
    desc: 'Асинхронная обработка заказов через очереди: Transactional Outbox, идемпотентный consumer, prefetch, crash-тесты, retry с TTL→DLX, priority queues, fanout.',
    stack: ['Laravel 13', 'PostgreSQL 16', 'RabbitMQ', 'Mailpit'],
    difficulty: 'Высокая',
    image: 'images/rabbitmq.png',
    open: '../rabbitmq/docs/RabbitMQ_Lab_Plan_v1_pro_max.html',
    repo: 'https://github.com/meeymirita/rabbitmq-lab',
    stackInfo: [
      {
        "tag": "фреймворк",
        "back": "Приложение с заказами и воркерами на php-amqplib."
      },
      {
        "tag": "база данных",
        "back": "Заказы, outbox_messages и processed_messages в одной транзакции."
      },
      {
        "tag": "брокер",
        "back": "Exchange, очереди, DLX и приоритеты: предмет изучения лабы."
      },
      {
        "tag": "почта",
        "back": "Локальный SMTP для проверки писем воркера и retry."
      }
    ],
    learn: [
      {
        "tab": "Модель AMQP",
        "title": "Exchange, очередь и маршрутизация",
        "text": "Издатель пишет в exchange, а тот раскладывает сообщения по очередям по биндингам. Ловушка: сообщение без подходящей очереди молча уничтожается, а order.* не совпадает с order.item.added.",
        "points": [
          "direct, topic, fanout, headers",
          "Флаг mandatory возвращает потерянное сообщение",
          "Жизнь сообщения от publish до ack"
        ],
        "code": "1. relay: basic.publish(exchange=orders.topic, key=order.created, props{message_id=UUID, delivery_mode=2})\n2. брокер: routing по биндингам → копии в order.queue, email.queue, analytics.queue\n4. брокер → relay: basic.ack(seq_no)          ← publisher confirm\n5. брокер → worker:order: basic.deliver(delivery_tag=17, redelivered=false)\n7. worker → брокер: basic.ack(17)"
      },
      {
        "tab": "Transactional Outbox",
        "title": "Запись в БД и событие атомарно",
        "text": "Публикация в брокер после коммита может потеряться при падении, а до коммита — уйти без заказа. Outbox пишет событие в ту же транзакцию, а отдельный релей публикует его в очередь.",
        "points": [
          "Проблема dual write",
          "Гарантия at-least-once, не exactly-once",
          "SKIP LOCKED для нескольких релеев"
        ],
        "code": "$order = DB::transaction(function () use ($data, $outbox) {\n    $order = Order::create([...]);\n    $order->items()->createMany($data['items']);\n\n    $outbox->write('order.created', [\n        'order_id' => $order->id,\n    ], $order->priority);\n\n    return $order;\n});"
      },
      {
        "tab": "Идемпотентный consumer",
        "title": "Ручной ack и защита от дублей",
        "text": "Воркер подтверждает сообщение только после коммита. Если он упал между коммитом и ack, брокер доставит сообщение повторно, а маркер в processed_messages не даст обработать его второй раз.",
        "points": [
          "no_ack=false и ручной basic_ack",
          "Уникальный индекс (message_id, consumer)",
          "Обработка и маркер в одной транзакции"
        ],
        "code": "DB::transaction(function () use ($payload, $msg, $id) {\n    $this->process($payload, $msg);\n    ProcessedMessage::create([\n        'message_id' => $id,\n        'consumer'   => $this->consumerName(),\n        'processed_at' => now(),\n    ]);\n});\n$msg->ack();"
      },
      {
        "tab": "Retry, DLX, DLQ",
        "title": "Отложенные повторы через TTL",
        "text": "Очередь имеет один DLX, поэтому воркер сам публикует копию в нужную retry-очередь, а возврат по истечении TTL делает брокер. Одна очередь с разными TTL не годится из-за head-of-line blocking.",
        "points": [
          "Три retry-очереди: 10 с, 30 с, 300 с",
          "Копия, а не requeue; сначала publish, потом ack",
          "email.dlq как последний рубеж"
        ],
        "code": "{ \"name\": \"email.retry.1\", \"vhost\": \"/\", \"durable\": true, \"arguments\": {\n    \"x-queue-type\": \"classic\", \"x-message-ttl\": 10000,\n    \"x-dead-letter-exchange\": \"email.dlx\",\n    \"x-dead-letter-routing-key\": \"email\" } }"
      },
      {
        "tab": "Prefetch и приоритеты",
        "title": "Справедливая раздача сообщений",
        "text": "basic_qos ограничивает число неподтверждённых сообщений на воркера, поэтому быстрый воркер получает больше. Приоритет через x-max-priority заметен только тогда, когда в очереди есть backlog.",
        "points": [
          "prefetch 1, 10, 100 и consumer utilisation",
          "--scale order-worker=3: competing consumers",
          "Приоритеты 1–10, а не 255"
        ],
        "code": "$this->channel->basic_qos(0, config('rabbitmq.prefetch'), false);\n$this->channel->basic_consume(\n    queue: $this->queue(),\n    no_ack: false,\n    callback: fn (AMQPMessage $m) => $this->handleMessage($m),\n);"
      },
      {
        "tab": "Publisher confirms",
        "title": "Брокер подтверждает приём",
        "text": "В confirm-режиме брокер присылает ack на каждую публикацию, и только после него строка outbox помечается отправленной. Без подтверждения она остаётся pending и уйдёт на следующем проходе.",
        "points": [
          "confirm_select и wait_for_pending_acks",
          "Confirm на сообщение стоит round-trip",
          "Батчи ускоряют публикацию"
        ],
        "code": "$ch->confirm_select();\n// ... basic_publish для пачки pending-строк\n$ch->wait_for_pending_acks(timeout: 5);\n// confirm получен → status='sent'"
      }
    ],
    accent: '#FF6600',
  },
  {
    key: 'redis',
    titleMain: 'redis',
    title: 'Redis Lab',
    subtitle: 'Кэш, локи, rate limit, Streams',
    desc: 'Redis как кэш, хранилище сессий, примитив синхронизации и брокер событий: cache-aside, distributed lock, rate limiter, Streams, XAUTOCLAIM, Pub/Sub-дашборд.',
    stack: ['Laravel 13', 'PostgreSQL 17', 'Redis 7'],
    difficulty: 'Средняя',
    image: 'images/redis.png',
    open: '../redis/Redis_Lab_Plan.html',
    repo: 'https://github.com/meeymirita/redis-lab',
    stackInfo: [
      {
        "tag": "приложение",
        "back": "Контекст, в котором Redis работает как кэш, сессии и очередь."
      },
      {
        "tag": "источник правды",
        "back": "Хранит заказы и товары; Redis лишь ускоряет доступ и координирует воркеры."
      },
      {
        "tag": "in-memory",
        "back": "Кэш, локи, ZSet-лимитер, Streams и Pub/Sub в одном сервисе."
      }
    ],
    learn: [
      {
        "tab": "Cache-aside",
        "title": "Кэш карточки и cache stampede",
        "text": "Читаем из Redis, при промахе идём в PostgreSQL и кладём результат с TTL; при записи ключ инвалидируется. Ловушка: истёкший ключ популярного товара обрушивает сотни запросов на базу, поэтому перестройку кэша защищает короткий лок.",
        "points": [
          "Промах, TTL и инвалидация DEL",
          "volatile-lru вытесняет только ключи с TTL",
          "Лок на перестройку против stampede"
        ],
        "code": "$cached = Redis::get(\"product:{$id}\");\nif ($cached !== null) {\n    return json_decode($cached, true);\n}\n$lockKey = \"lock:product-rebuild:{$id}\";\n$token = uniqid('', true);\n$gotLock = Redis::set($lockKey, $token, 'PX', 3000, 'NX');"
      },
      {
        "tab": "Distributed lock",
        "title": "Лок с токеном и TTL",
        "text": "SET NX PX создаёт ключ только если его нет и снимает лок по таймауту даже при падении процесса. Освобождать нужно Lua-скриптом с проверкой токена, иначе можно удалить чужой лок.",
        "points": [
          "NX — только если ключа нет, PX — TTL",
          "Уникальный токен владельца",
          "Проверка и DEL атомарны в Lua"
        ],
        "code": "-- release_lock.lua\nif redis.call(\"GET\", KEYS[1]) == ARGV[1] then\n    return redis.call(\"DEL\", KEYS[1])\nelse\n    return 0\nend"
      },
      {
        "tab": "Rate limit",
        "title": "Скользящее окно на ZSet",
        "text": "Лимит «не больше 5 заказов в минуту» держится в отсортированном множестве, где score — время запроса. Все три шага собраны в один Lua-скрипт, иначе между ZCARD и ZADD проскочит гонка.",
        "points": [
          "ZREMRANGEBYSCORE чистит старые записи",
          "ZCARD считает остаток окна",
          "PEXPIRE удаляет ключ неактивных пользователей"
        ],
        "code": "redis.call('ZREMRANGEBYSCORE', key, 0, now - window)\nlocal count = redis.call('ZCARD', key)\nif count >= limit then return 0 end\nredis.call('ZADD', key, now, now .. '-' .. math.random())\nredis.call('PEXPIRE', key, window)\nreturn 1"
      },
      {
        "tab": "Атомарность и Lua",
        "title": "Одна команда и целая операция",
        "text": "Каждая команда Redis атомарна, но цепочка «прочитать, проверить, списать» — нет. Lua-скрипт выполняется как одна неделимая операция, поэтому резервирование стока не уходит в минус.",
        "points": [
          "Redis однопоточен: скрипт не прерывается",
          "EVAL с KEYS и ARGV",
          "Альтернативы: MULTI/EXEC и SET NX"
        ],
        "code": "SET stock:99 3\n\nEVAL \"local s = redis.call('GET', KEYS[1]) \\\nif tonumber(s) < tonumber(ARGV[1]) then return 0 end \\\nredis.call('DECRBY', KEYS[1], ARGV[1]) \\\nreturn 1\" 1 stock:99 2"
      },
      {
        "tab": "Streams",
        "title": "Consumer group и PEL",
        "text": "Stream — журнал, из которого запись не пропадает при чтении. Группа делит записи между воркерами, а выданное, но не подтверждённое лежит в PEL до XACK; повторную обработку гасит идемпотентность.",
        "points": [
          "XADD, XREADGROUP, XACK",
          "PEL — аналог unacked в RabbitMQ",
          "Запись висит в PEL, пока её не заберут явно"
        ],
        "code": "Redis::xGroup('CREATE', $stream, $group, '0', true);\n\nwhile (true) {\n    $messages = Redis::xReadGroup($group, $consumer, [$stream => '>'], 5, 5000);\n    if (empty($messages[$stream])) { continue; }\n    // process() и XACK для каждой записи\n}"
      },
      {
        "tab": "Retry и DLQ",
        "title": "XAUTOCLAIM вместо DLX",
        "text": "У Streams нет автоматической повторной доставки и dead-letter: зависшие записи забирает воркер-«надзиратель». Счётчик попыток хранится в Hash, потому что сама запись неизменяема.",
        "points": [
          "XAUTOCLAIM по min-idle-time",
          "Счётчик попыток отдельным ключом",
          "После лимита запись уходит в orders:dlq:stream"
        ],
        "code": "$claimed = $redis->xautoclaim('orders:stream', 'email-cg', 'reaper', 30000, '0');\n\nforeach ($claimed['entries'] as $id => $entry) {\n    $attempts = $redis->hIncrBy(\"retry:attempts:{$id}\", 'count', 1);\n    if ($attempts > 3) {\n        $redis->xAdd('orders:dlq:stream', '*', $entry);\n        $redis->xAck('orders:stream', 'email-cg', $id);\n    }\n}"
      }
    ],
    accent: '#DC382D',
  },
  {
    key: 'traefik',
    titleMain: 'traefik',
    title: 'Traefik Lab',
    subtitle: 'Reverse proxy, service discovery, TLS',
    desc: 'Reverse proxy и service discovery для стека из нескольких сервисов без ручной правки конфигов: EntryPoint → Router → Middleware → Service, TLS, canary-деплой.',
    stack: ['Traefik 3', 'Docker Compose', 'Node.js', 'PostgreSQL'],
    difficulty: 'Низкая–средняя',
    image: '../traefik/traefik.png',
    open: '../traefik/Docker_and_Traefik_Lab_Plan.html',
    repo: 'https://github.com/meeymirita/traefik-lab',
    stackInfo: [
      {
        "tag": "прокси",
        "back": "Единая точка входа: роутинг, middlewares, TLS и балансировка."
      },
      {
        "tag": "окружение",
        "back": "Стек из нескольких сервисов, которые Traefik находит по labels."
      },
      {
        "tag": "бэкенд",
        "back": "Сервис-цель для маршрутизации, rate limit и canary."
      },
      {
        "tag": "база данных",
        "back": "Хранилище за API и Adminer в составе стека."
      }
    ],
    learn: [
      {
        "tab": "Модель Traefik",
        "title": "Пять сущностей на пути запроса",
        "text": "Запрос проходит EntryPoint, затем Router, цепочку Middleware и Service. Providers — источник этих правил; их можно комбинировать: часть в labels, общие middlewares в файле.",
        "points": [
          "EntryPoint — порт, Provider — источник конфигурации",
          "Router сопоставляет Host и Path",
          "Статическая и динамическая конфигурация"
        ],
        "code": "Клиент → EntryPoint (:80/:443) → Router (matches Host/Path)\n       → [Middleware chain] → Service → контейнер(ы)"
      },
      {
        "tab": "Service Discovery",
        "title": "Маршруты в labels контейнера",
        "text": "Traefik читает Docker-сокет и создаёт роуты по labels на лету. Ловушка: без exposedByDefault=false маршрут получит любой контейнер, а неверный порт сервиса даёт 502 Bad Gateway.",
        "points": [
          "Формат traefik.http.routers.<имя>.<свойство>",
          "Явное включение через traefik.enable=true",
          "loadbalancer.server.port — порт внутри контейнера"
        ],
        "code": "labels:\n  - \"traefik.enable=true\"\n  - \"traefik.http.routers.whoami.rule=Host(`whoami.localhost`)\"\n  - \"traefik.http.routers.whoami.entrypoints=web\"\n  - \"traefik.http.services.whoami.loadbalancer.server.port=80\""
      },
      {
        "tab": "Middlewares",
        "title": "Цепочка обработки запроса",
        "text": "Rate limit, заголовки, basicAuth и stripPrefix подключаются к роутеру списком. Порядок важен: middleware, который должен сработать и на отказных ответах, ставят первым.",
        "points": [
          "Общие middlewares в dynamic/middlewares.yml",
          "rateLimit: average и burst",
          "Порядок в router.middlewares"
        ],
        "code": "http:\n  middlewares:\n    api-ratelimit:\n      rateLimit:\n        average: 10\n        burst: 20\n\n# label:\n\"traefik.http.routers.api.middlewares=secure-headers,api-ratelimit\""
      },
      {
        "tab": "Балансировка",
        "title": "Load balancing и canary",
        "text": "По умолчанию реплики получают трафик по round robin, нездоровые исключаются health check-ом. Для canary-релиза два сервиса оборачиваются в weighted service с долей трафика.",
        "points": [
          "Round robin и health check",
          "Weighted service: 90% на 10%",
          "Суффикс @docker для сервисов из labels"
        ],
        "code": "http:\n  services:\n    api-canary:\n      weighted:\n        services:\n          - name: api@docker\n            weight: 9\n          - name: api-v2@docker\n            weight: 1"
      },
      {
        "tab": "TLS",
        "title": "mkcert и Let's Encrypt",
        "text": "mkcert подходит для локальной разработки, Let's Encrypt — для реального домена. Сначала всегда staging-резолвер: он не тратит лимиты боевого CA, а переключение на продакшен — одна строка.",
        "points": [
          "HTTP-01 challenge через entrypoint web",
          "Staging против production",
          "acme.json как хранилище сертификатов"
        ],
        "code": "certificatesResolvers:\n  letsencrypt:\n    acme:\n      email: you@example.com\n      storage: /etc/traefik/acme/acme.json\n      caServer: \"https://acme-staging-v02.api.letsencrypt.org/directory\"\n      httpChallenge:\n        entryPoint: web"
      }
    ],
    accent: '#14B8A6',
  },
  {
    key: 'php-coffee',
    titleMain: 'oop',
    title: 'OOP Lab',
    subtitle: 'Coffee Shop API на PHP 8.4',
    desc: 'ООП на PHP 8.4 с нуля на маленьком API кофейни: 4 принципа ООП, Factory, Decorator, Strategy, Repository, SOLID, наследование vs композиция.',
    stack: ['PHP 8.4', 'Laravel 13', 'PostgreSQL', 'RabbitMQ'],
    difficulty: 'Базовая',
    image: 'images/php.png',
    open: '../php-coffee/docs/OOP_Lab_CoffeeShop.html',
    repo: 'https://github.com/meeymirita/oop-lab',
    stackInfo: [
      {
        "tag": "язык",
        "back": "Весь домен — на PHP 8.4: readonly, enum, promotion конструктора, first-class callable."
      },
      {
        "tag": "каркас",
        "back": "Laravel 13 даёт HTTP-слой, контейнер и Eloquent, а домен от него отделён."
      },
      {
        "tag": "хранилище",
        "back": "PostgreSQL хранит снимки заказов, а доступ к ним закрыт интерфейсом репозитория."
      },
      {
        "tag": "брокер",
        "back": "RabbitMQ доставляет события order.paid воркерам бариста и уведомлений."
      }
    ],
    learn: [
      {
        "tab": "Value Object",
        "title": "Money: деньги как значение",
        "text": "Деньги хранятся целыми копейками, объект неизменяем, а равенство считается по содержимому. Ловушка: readonly защищает свойство, но не объект внутри него.",
        "points": [
          "private-конструктор и static-фабрики",
          "readonly и «изменение» через новый объект",
          "equals() против ===",
          "минус на входе отсекается сразу"
        ],
        "code": "public static function fromCents(int $cents): self\n{\n    if ($cents < 0) {\n        throw new InvalidArgumentException(\"Money cannot be negative: {$cents}\");\n    }\n    return new self($cents);\n}\npublic function add(Money $other): self { return new self($this->cents + $other->cents); }"
      },
      {
        "tab": "Наследование",
        "title": "От копипасты к abstract Drink",
        "text": "Два класса «в лоб» дублируют формулу цены. Общий скелет уходит в абстрактного родителя, а дочерним остаются только «дырки»: название и базовая цена.",
        "points": [
          "abstract-методы и хуки по желанию",
          "final-скелет, который нельзя переопределить",
          "enum Size с match для наценки"
        ],
        "code": "abstract class Drink\n{\n    abstract protected function basePrice(): Money;\n    abstract protected function title(): string;\n\n    final public function price(): Money\n    {\n        return $this->basePrice()->add($this->size->surcharge());\n    }\n}"
      },
      {
        "tab": "Инкапсуляция",
        "title": "Order охраняет свои инварианты",
        "text": "Единственное изменяемое состояние заказа закрыто, а любое действие проходит через проверки. Вывод: инвариант, который можно обойти снаружи, инвариантом не является.",
        "points": [
          "private-состояние и исключения на нарушения",
          "нельзя оплатить пустой или изменить оплаченный заказ",
          "lines() отдаёт копию массива"
        ],
        "code": "public function add(Drink $drink, int $qty = 1): void\n{\n    if ($this->paid) { throw new DomainException('Заказ уже оплачен, добавлять нельзя'); }\n    if ($qty < 1)    { throw new InvalidArgumentException(\"Количество должно быть ≥ 1, получено {$qty}\"); }\n    $this->lines[] = new OrderLine($drink->name(), $drink->price(), $qty);\n}"
      },
      {
        "tab": "Decorator",
        "title": "Добавки поверх напитка",
        "text": "Овсяное молоко, шот и сироп оборачивают напиток и достраивают название и цену. Композиция вместо взрыва подклассов «Латте с сиропом и молоком».",
        "points": [
          "общий интерфейс Beverage у напитка и добавки",
          "абстрактный BeverageDecorator хранит обёрнутый объект",
          "enum Extra как фабрика добавок"
        ],
        "code": "final class OatMilk extends BeverageDecorator\n{\n    public function name(): string { return $this->inner->name() . ' + овсяное молоко'; }\n    public function price(): Money { return $this->inner->price()->add(Money::rub(60)); }\n}"
      },
      {
        "tab": "Strategy",
        "title": "Скидки как объекты",
        "text": "Каждая акция — отдельный класс с одним интерфейсом, а «текущее время» тоже интерфейс, поэтому happy hour проверяется в тесте с подменой часов.",
        "points": [
          "DiscountPolicy и подмена стратегий без if в кассе",
          "NoDiscount как Null Object",
          "композиция: условие плюс любая другая стратегия"
        ],
        "code": "interface DiscountPolicy\n{\n    public function discountFor(Order $order): Money;\n}\n\nfinal class BulkDiscount implements DiscountPolicy\n{\n    public function __construct(private readonly int $minItems, private readonly DiscountPolicy $inner) {}\n}"
      },
      {
        "tab": "Repository и события",
        "title": "Домен не знает про инфраструктуру",
        "text": "Домен говорит только интерфейсами: «сохранить заказ», «опубликовать событие». Eloquent и RabbitMQ подключаются снаружи и заменяются в тестах на in-memory версии.",
        "points": [
          "OrderRepository: интерфейс в домене, Eloquent в Infrastructure",
          "EventPublisher и AMQP-реализация",
          "сквозной тест без БД и брокера"
        ],
        "code": "interface OrderRepository\n{\n    public function save(Order $order): void;\n    /** @throws OrderNotFound */\n    public function get(string $id): Order;\n}\n\ninterface EventPublisher\n{\n    public function publish(string $event, array $payload): void;\n}"
      }
    ],
    accent: '#777BB4',
  },
  {
    key: 'vue',
    titleMain: 'vue',
    title: 'Vue Lab',
    subtitle: 'Helpdesk на Vue 3',
    desc: 'Система тикетов на Vue 3 с нуля: реактивность, компоненты, слоты, Pinia, Vue Router с guard-ами, WebSocket, канбан-доска, тесты на Vitest.',
    stack: ['Vue 3.5', 'Vite 6+', 'Pinia 2+', 'Vue Router', 'Node'],
    difficulty: 'Высокая',
    image: 'images/vue.png',
    open: '../vue/Vue_Lab_Helpdesk.html',
    repo: 'https://github.com/meeymirita/vue-lab',
    stackInfo: [
      {
        "tag": "Фреймворк",
        "back": "Основа приложения: реактивность, компоненты и Composition API."
      },
      {
        "tag": "Сборка",
        "back": "Dev-сервер с мгновенным HMR и продакшен-сборка проекта."
      },
      {
        "tag": "Состояние",
        "back": "Общий store для тикетов и авторизации вне компонентов."
      },
      {
        "tag": "Маршрутизация",
        "back": "Страницы, параметры, query-фильтры и guards для защиты маршрутов."
      },
      {
        "tag": "Среда",
        "back": "Запускает инструменты сборки и тестов, а также мок-бэкенд."
      }
    ],
    learn: [
      {
        "tab": "ref и computed",
        "title": "Реактивное состояние",
        "text": "ref оборачивает примитив в объект с .value, а computed кэширует производное значение. Ловушка: деструктуризация reactive-объекта превращает поле в обычную строку и теряет реактивность.",
        "points": [
          "ref для примитивов, reactive для объектов",
          "computed пересчитывается только при смене зависимостей",
          "watch нужен для побочных эффектов, например запросов"
        ],
        "code": "const status = ref('open')\nstatus.value = 'closed'\n\nconst filters = reactive({ status: 'open', q: '' })\nconst { q } = filters    // деструктуризация теряет реактивность\n\nconst visible = computed(() =>\n  tickets.value.filter(t => filters.status === 'all' || t.status === filters.status)\n)"
      },
      {
        "tab": "Props и emits",
        "title": "Контракт компонента",
        "text": "Компонент принимает данные через props только для чтения и сообщает наверх через emits. Данные текут вниз, события вверх.",
        "points": [
          "defineProps описывает входы с типами и значениями по умолчанию",
          "defineEmits перечисляет исходящие события",
          "Родитель владеет состоянием, потомок его не мутирует"
        ],
        "code": "const props = defineProps({\n  ticket:   { type: Object, required: true },\n  selected: { type: Boolean, default: false },\n})\nconst emit = defineEmits(['select', 'status-change'])\n\n// шаблон: <article @click=\"emit('select', ticket.id)\">"
      },
      {
        "tab": "Слоты",
        "title": "Разметка от родителя",
        "text": "Props передают данные, слоты передают разметку. Именованные слоты дают несколько мест для вставки, а scoped-слот отдаёт значения обратно родителю.",
        "points": [
          "Слот по умолчанию и именованные слоты",
          "Дефолтное содержимое, если слот не передан",
          "Scoped-слот передаёт данные, например функцию close"
        ],
        "code": "<!-- BaseModal.vue -->\n<header><slot name=\"title\">Без названия</slot></header>\n<slot />\n<footer><slot name=\"actions\" :close=\"close\" /></footer>\n\n<!-- родитель -->\n<BaseModal>\n  <template #title>Новый тикет</template>\n  <template #actions=\"{ close }\"><button @click=\"close\">Отмена</button></template>\n</BaseModal>"
      },
      {
        "tab": "Composable",
        "title": "Переиспользуемая логика",
        "text": "Функция useXxx() собирает ref, computed и watch и возвращает реактивные значения. Состояние у каждого вызова своё, в отличие от store.",
        "points": [
          "Выносится логика, а не разметка",
          "Загрузка, ошибка и индикатор в одном месте",
          "Вызывается внутри setup или другого composable"
        ],
        "code": "export function useAsync(fn) {\n  const data = ref(null), error = ref(null), loading = ref(false)\n  async function run(...args) {\n    loading.value = true; error.value = null\n    try { data.value = await fn(...args) } catch (e) { error.value = e } finally { loading.value = false }\n  }\n  return { data, error, loading, run }\n}"
      },
      {
        "tab": "Router и guards",
        "title": "Адрес как состояние",
        "text": "Фильтры в query переживают F5 и передаются ссылкой, а guard решает, пускать ли на маршрут. Ловушка: store в guard нужно вызывать внутри колбэка, а не на уровне модуля.",
        "points": [
          "params, query и вложенные маршруты",
          "meta заменяет if в каждой странице",
          "Возврат объекта из guard — редирект"
        ],
        "code": "router.beforeEach(to => {\n  const auth = useAuthStore()\n  if (to.meta.requiresAuth && !auth.isAuthenticated) {\n    return { name: 'login', query: { redirect: to.fullPath } }\n  }\n  if (to.meta.requiresRole && auth.user?.role !== to.meta.requiresRole) {\n    return { name: 'tickets' }\n  }\n})"
      },
      {
        "tab": "Pinia",
        "title": "Общее состояние приложения",
        "text": "Store в setup-синтаксисе пишется как composable, но существует в одном экземпляре. Ловушка: без storeToRefs деструктуризация store теряет реактивность.",
        "points": [
          "state, getters и actions в одной функции",
          "Менять state только через actions",
          "В тестах свежая Pinia на каждый тест"
        ],
        "code": "export const useTicketsStore = defineStore('tickets', () => {\n  const items = ref([])\n  const open  = computed(() => items.value.filter(t => t.status === 'open'))\n  async function load(params) { items.value = (await api.tickets.list(params)).items }\n  return { items, open, load }\n})\n\nconst { items, open } = storeToRefs(useTicketsStore())"
      }
    ],
    accent: '#42B883',
  },
  {
    key: 'typescript',
    titleMain: 'typescript',
    title: 'TypeScript Lab',
    subtitle: 'Warehouse — складской учёт',
    desc: 'Типизация домена складского учёта с нуля: generics, размеченные объединения, mapped/conditional types, CLI на Zod, сквозная типизация API + Vue.',
    stack: ['TypeScript 5.x', 'Node 22+', 'Zod', 'Vitest'],
    difficulty: 'Высокая',
    image: 'images/typescript.png',
    open: '../typescript/TypeScript_Lab_Warehouse.html',
    repo: 'https://github.com/meeymirita/typescript-lab',
    stackInfo: [
      {
        "tag": "Язык",
        "back": "Статическая типизация домена: union, generics и условные типы."
      },
      {
        "tag": "Среда",
        "back": "Запускает CLI и инструменты сборки для проекта."
      },
      {
        "tag": "Валидация",
        "back": "Проверяет внешние данные в рантайме и выводит из схемы типы."
      },
      {
        "tag": "Тесты",
        "back": "Проверяет и логику, и типы, включая expectTypeOf."
      }
    ],
    learn: [
      {
        "tab": "Структурная типизация",
        "title": "Тип — это форма, а не имя",
        "text": "Значение подходит под тип, если у него есть все нужные поля. Ловушка: два alias на string взаимозаменяемы, и перепутанные аргументы компилируются.",
        "points": [
          "Лишние поля у переменной не мешают",
          "Литерал в аннотации проходит excess property check",
          "Различить одинаковые по форме типы помогают branded types"
        ],
        "code": "interface Entity { id: string }\nconst item = { id: '1', name: 'Болт' }\nconst e: Entity = item                          // ✔\nconst e2: Entity = { id: '1', name: 'Болт' }    // ✖ лишнее свойство\n\ntype ItemId = string; type LocationId = string\nfunction move(item: ItemId, loc: LocationId) {}\nmove(locationId, itemId)                        // ✔ компилируется"
      },
      {
        "tab": "Размеченный union",
        "title": "Discriminated union",
        "text": "Вариант события определяется литеральным полем kind, и внутри case тип сужается до нужного варианта. Ветка default с never превращает забытый вариант в ошибку компиляции.",
        "points": [
          "У каждого варианта только его поля",
          "switch по дискриминанту сужает тип",
          "assertNever проверяет полноту разбора"
        ],
        "code": "type Movement =\n  | { kind: 'in';       itemId: string; to: string;   qty: number; unitCost: number }\n  | { kind: 'out';      itemId: string; from: string; qty: number; reason: 'sale' | 'writeoff' }\n  | { kind: 'transfer'; itemId: string; from: string; to: string; qty: number }\n\nfunction describe(m: Movement): string {\n  switch (m.kind) {\n    case 'in':       return `+${m.qty} → ${m.to} по ${m.unitCost}`\n    case 'out':      return `−${m.qty} из ${m.from} (${m.reason})`\n    case 'transfer': return `${m.qty}: ${m.from} → ${m.to}`\n    default:         return assertNever(m)\n  }\n}"
      },
      {
        "tab": "Generics",
        "title": "Тип как параметр",
        "text": "Generic нужен, когда тип на входе должен сохраниться на выходе. Если параметр T встречается в сигнатуре один раз, достаточно unknown.",
        "points": [
          "Ограничения через extends keyof T",
          "Generic-типы: Result и Paginated",
          "Generic-репозиторий для любой сущности с id"
        ],
        "code": "function groupBy<T, K extends keyof T>(list: T[], key: K): Map<T[K], T[]> { … }\n\ntype Result<T, E> = { ok: true; value: T } | { ok: false; error: E }\ntype Paginated<T> = { items: T[]; total: number; page: number }\n\ninterface Repository<T extends { id: string }> {\n  get(id: string): T | undefined\n  save(e: T): void\n}"
      },
      {
        "tab": "Mapped и conditional",
        "title": "Как устроены типы-утилиты",
        "text": "Partial, Pick и Extract построены на трёх механизмах: mapped, conditional и template literal типах. Их достаточно узнавать в сигнатурах библиотек, изобретать каждый день не нужно.",
        "points": [
          "Mapped проходит по ключам и строит новый тип",
          "Conditional с infer вытаскивает вложенный тип",
          "Template literal собирает строковые union"
        ],
        "code": "type Partial<T> = { [K in keyof T]?: T[K] }\ntype Unwrap<T>  = T extends Promise<infer U> ? U : T\ntype Extract<U, M> = U extends M ? U : never\n\ntype Group = 'item' | 'stock'\ntype Action = 'add' | 'list'\ntype Command = `${Group}:${Action}`\n// 'item:add' | 'item:list' | 'stock:add' | 'stock:list'"
      },
      {
        "tab": "unknown и сужение",
        "title": "Внешние данные не заслуживают доверия",
        "text": "Типы стираются при компиляции, поэтому всё, что пришло извне, имеет тип unknown. Пока значение не проверено, обращаться к его полям нельзя.",
        "points": [
          "unknown безопаснее any",
          "Сужение через typeof, in и проверку на null",
          "never описывает недостижимые ветки"
        ],
        "code": "const data: unknown = JSON.parse(text)\ndata.items                                   // ✖ 'data' is of type 'unknown'\nif (typeof data === 'object' && data !== null && 'items' in data) { … }\n\nfunction fail(msg: string): never { throw new Error(msg) }"
      },
      {
        "tab": "Zod на границе",
        "title": "Схема как источник типа",
        "text": "Zod проверяет данные в рантайме, а тип выводится из той же схемы через z.infer. Результат safeParse сам является размеченным объединением.",
        "points": [
          "Один источник правды для рантайма и компилятора",
          "z.discriminatedUnion повторяет union из домена",
          "safeParse возвращает success или error без исключения"
        ],
        "code": "const MovementSchema = z.discriminatedUnion('kind', [\n  z.object({ kind: z.literal('in'),  itemId: z.string(), to: z.string(),   qty: z.number().positive(), unitCost: z.number().nonnegative() }),\n  z.object({ kind: z.literal('out'), itemId: z.string(), from: z.string(), qty: z.number().positive(), reason: z.enum(['sale', 'writeoff', 'sample']) }),\n])\ntype MovementInput = z.infer<typeof MovementSchema>\n\nconst parsed = MovementSchema.safeParse(JSON.parse(line))\nif (parsed.success) apply(parsed.data)"
      }
    ],
    accent: '#3178C6',
  },
  {
    key: 'laravel',
    titleMain: 'laravel',
    title: 'Laravel Lab',
    subtitle: 'TaskFlow — таск-трекер',
    desc: 'Laravel 13 «изнутри»: ~30 компонентов illuminate/*, Eloquent-связи, Service Container, Auth/Policy, Observer, очереди, Mailable, кэш, Broadcasting, тесты.',
    stack: ['Laravel 13', 'PostgreSQL 17', 'Redis', 'RabbitMQ', 'Reverb'],
    difficulty: 'Высокая',
    image: 'images/laravel.png',
    open: '../laravel/Laravel_Lab_TaskFlow.html',
    repo: 'https://github.com/meeymirita/laravel-lab',
    stackInfo: [
      {
        "tag": "фреймворк",
        "back": "Основа TaskFlow: разбираются контейнер, Eloquent, очереди и тесты на Laravel 13."
      },
      {
        "tag": "база",
        "back": "Хранит воркспейсы, проекты и задачи со связями и pivot-таблицами."
      },
      {
        "tag": "кэш и локи",
        "back": "Backend для Cache::lock, кэша статистики и rate limiting."
      },
      {
        "tag": "брокер",
        "back": "Драйвер очередей: jobs, уведомления и письма выполняются воркером."
      },
      {
        "tag": "realtime",
        "back": "Broadcasting: доска задач получает изменения по WebSocket без опроса."
      }
    ],
    learn: [
      {
        "tab": "Container",
        "title": "Что делает контейнер",
        "text": "Контейнер собирает объекты через Reflection, а интерфейс без биндинга падает с понятной ошибкой. Вывод: bind создаёт новый объект каждый раз, singleton — один общий.",
        "points": [
          "bind против singleton на живом примере",
          "app()->call() и разрешение параметров",
          "путь запроса от public/index.php до ответа"
        ],
        "code": "app()->bind('temp.uuid', fn () => Str::uuid()->toString());\ndump(app('temp.uuid') === app('temp.uuid'));   // false\n\napp()->singleton('temp.uuid2', fn () => Str::uuid()->toString());\ndump(app('temp.uuid2') === app('temp.uuid2'));  // true"
      },
      {
        "tab": "Eloquent и N+1",
        "title": "Связи, pivot и запросы",
        "text": "Обращение к связи в цикле даёт лавину запросов, и Laravel умеет ронять такой код исключением. Eager loading превращает 15 запросов в 3, независимо от числа задач.",
        "points": [
          "preventLazyLoading с первого дня",
          "with, withCount, whereHas",
          "belongsToMany, свой Pivot, полиморфные связи"
        ],
        "code": "Model::preventLazyLoading(true);\n\n// 1 + 2 запроса на каждую задачу\nforeach (Task::all() as $task) { $task->project->workspace->name; }\n\n// всегда 3 запроса\nforeach (Task::with('project.workspace')->get() as $task) { $task->project->workspace->name; }"
      },
      {
        "tab": "Auth и Policy",
        "title": "Кто что может делать",
        "text": "Роли лежат в pivot-таблице, а политика читает их и решает, можно ли действие над моделью. Проверка в контроллере одной строкой, без ручных if.",
        "points": [
          "Sanctum SPA: сессия и CSRF-cookie",
          "Policy: view, update, delete и своё assign",
          "authorize() и автообнаружение политик"
        ],
        "code": "public function update(User $user, Task $task): bool\n{\n    return $user->isAtLeastIn($task->project->workspace, Role::Member)\n        && ($task->created_by === $user->id\n            || $task->assignees->contains($user)\n            || $user->isAtLeastIn($task->project->workspace, Role::Admin));\n}"
      },
      {
        "tab": "Observer и очереди",
        "title": "События, listeners и jobs",
        "text": "Наблюдатель реагирует на изменения модели, а долгую работу выносят в job с повторами и уникальностью. Ловушка: массовый update через Query Builder наблюдатель не вызывает.",
        "points": [
          "created, updating, deleted и isDirty",
          "Event и независимые Listener",
          "retry, backoff, ShouldBeUnique, failed_jobs"
        ],
        "code": "class RecalculateProjectStats implements ShouldQueue, ShouldBeUnique\n{\n    public int $tries = 3;\n    public array $backoff = [5, 15, 30];\n\n    public function uniqueId(): string { return \"project-stats-{$this->project->id}\"; }\n}"
      },
      {
        "tab": "Кэш и блокировки",
        "title": "Cache::lock и rate limit",
        "text": "Распределённый мьютекс поверх Redis не даёт двум одновременным запросам выполнить одно действие. Второй запрос ждёт и видит уже готовый результат.",
        "points": [
          "Cache::remember и инвалидация в Observer",
          "lock()->block() против get()",
          "RateLimiter и свой ответ 429"
        ],
        "code": "return Cache::lock(\"invite:{$workspace->id}:{$email}\", seconds: 10)->block(3, function () use ($workspace, $email) {\n    if ($workspace->invitations()->where('email', $email)->whereNull('accepted_at')->exists()) {\n        throw new \\RuntimeException('Приглашение уже отправлено');\n    }\n    // создаём приглашение и ставим письмо в очередь\n});"
      },
      {
        "tab": "Тесты",
        "title": "Feature-тесты и fakes",
        "text": "Тесты идут через настоящий HTTP-стек с базой, а побочные эффекты — письма, события, уведомления — подменяются fake-ами. Проверяется и ответ, и состояние в БД.",
        "points": [
          "RefreshDatabase, actingAs, фабрики",
          "Event, Notification, Mail::fake()",
          "мок интерфейса через $this->mock()"
        ],
        "code": "$response = $this->actingAs($member)->postJson(\"/api/v1/projects/{$project->id}/tasks\", [\n    'title' => 'Новая задача', 'priority' => 'high',\n]);\n$response->assertCreated()->assertJsonPath('data.title', 'Новая задача');\n$this->assertDatabaseHas('tasks', ['title' => 'Новая задача']);"
      }
    ],
    accent: '#FF2D20',
  },
  {
    key: 'docker',
    titleMain: 'docker',
    title: 'Docker Lab',
    subtitle: 'Крепкое владение Docker и Bash с нуля',
    desc: 'Docker и Bash с нуля: образы, контейнеры, docker-compose, сети и тома — через практику в терминале.',
    stack: ['Docker', 'Docker Compose', 'Bash'],
    difficulty: 'Базовая',
    image: 'images/docker.png',
    open: '../docker/Docker_Bash_Lab.html',
    repo: 'https://github.com/meeymirita/docker-lab',
    stackInfo: [
      {
        "tag": "контейнеры",
        "back": "Образы, слои, тома и сети: основа всей лабы."
      },
      {
        "tag": "оркестрация",
        "back": "Описание многосервисного стека одним файлом с healthcheck и depends_on."
      },
      {
        "tag": "скрипты",
        "back": "Entrypoint-скрипты с set -euo pipefail и exec \"$@\"."
      }
    ],
    learn: [
      {
        "tab": "Слои и кэш",
        "title": "Порядок инструкций решает скорость сборки",
        "text": "Каждая инструкция Dockerfile — отдельный слой, а изменённый слой сбрасывает кэш всех слоёв ниже. Ловушка: COPY . . перед установкой зависимостей заставляет переустанавливать их при каждом коммите.",
        "points": [
          "Слои, overlay2 и хэш кэша",
          "Манифесты зависимостей копируются раньше исходников",
          "Тот же приём для Composer"
        ],
        "code": "FROM node:20-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . ."
      },
      {
        "tab": "Bash strict mode",
        "title": "Три строки для каждого entrypoint",
        "text": "Без строгого режима скрипт молча идёт дальше после ошибки, а опечатка в имени переменной превращается в пустую строку. Три флага делают падение громким и ранним.",
        "points": [
          "-e: остановка на первой ошибке",
          "-u: необъявленная переменная — ошибка",
          "-o pipefail: упавшая команда в конвейере валит весь конвейер"
        ],
        "code": "#!/usr/bin/env bash\nset -euo pipefail\n\n# значение по умолчанию, не нарушающее set -u\necho \"Имя приложения: ${APP_NAME:-контейнер}\""
      },
      {
        "tab": "ENTRYPOINT и CMD",
        "title": "Где встречаются Docker и Bash",
        "text": "ENTRYPOINT задаёт скрипт-обёртку с проверками, CMD — команду по умолчанию, которую можно переопределить. Ловушка: без exec приложение не станет PID 1 и не получит сигнал остановки.",
        "points": [
          "Exec form против shell form",
          "CMD приходит в скрипт как $1 $2 …",
          "exec \"$@\" заменяет bash процессом приложения"
        ],
        "code": "ENTRYPOINT [\"/usr/local/bin/entrypoint.sh\"]\nCMD [\"node\", \"server.js\"]\n\n# entrypoint.sh, последняя строка:\nexec \"$@\""
      },
      {
        "tab": "Тома и данные",
        "title": "Данные переживают контейнер",
        "text": "Файловая система контейнера исчезает вместе с ним. Named volume, bind mount и tmpfs решают разные задачи, а запуск от root оставляет на хосте файлы, принадлежащие root.",
        "points": [
          "Named volume для данных БД",
          "Bind mount для исходников при разработке",
          "Режим :ro и USER вместо root"
        ],
        "code": "docker run -v pgdata:/var/lib/postgresql/data postgres:17\n\ndocker run -v /home/user/project/src:/app/src myapp\n\n-v ./config:/etc/app/config:ro"
      },
      {
        "tab": "Сети и DNS",
        "title": "Имена вместо IP",
        "text": "В пользовательской сети Docker поднимает встроенный DNS, и контейнеры обращаются друг к другу по имени. Сеть по умолчанию такого DNS не имеет, а EXPOSE — лишь документация, порт наружу открывает -p.",
        "points": [
          "Своя bridge-сеть под проект",
          "EXPOSE и -p — не одно и то же",
          "Compose создаёт такую сеть сам"
        ],
        "code": "docker network create lab-net\n\ndocker run -d --name postgres --network lab-net postgres:17-alpine\ndocker run -d --name app --network lab-net myapp\n\ndocker run -p 8080:3000 myapp"
      },
      {
        "tab": "Compose и healthcheck",
        "title": "«Запущен» не значит «готов»",
        "text": "Обычный depends_on гарантирует лишь порядок старта, а база ещё инициализируется — отсюда «connection refused» при первом запуске. Healthcheck с condition: service_healthy ждёт реальной готовности.",
        "points": [
          "Анатомия docker-compose.yml",
          "healthcheck через pg_isready",
          "Ожидание БД в entrypoint как второй рубеж"
        ],
        "code": "postgres:\n  healthcheck:\n    test: [\"CMD-SHELL\", \"pg_isready -U postgres\"]\n    interval: 5s\n    retries: 5\napp:\n  depends_on:\n    postgres:\n      condition: service_healthy"
      }
    ],
    accent: '#2496ED',
  },
  {
    key: 'php',
    titleMain: 'php',
    title: 'Чистый PHP Lab',
    subtitle: 'Фундамент без фреймворка',
    desc: 'Чистый PHP 8.4 без фреймворка: strict_types и copy-on-write массивы, суперглобалы, замыкания и генераторы, магические методы — и своими руками роутер, DI-контейнер, PDO-слой, сессии и CSRF.',
    stack: ['PHP 8.4', 'PDO', 'PostgreSQL', 'Composer (PSR-4)'],
    difficulty: 'Базовая',
    image: '../php/php.png',
    open: '../php/PHP_Lab_VanillaCoffee.html',
    repo: 'https://github.com/meeymirita/php-lab',
    stackInfo: [
      {
        "tag": "язык",
        "back": "Весь код написан на чистом PHP 8.4 без фреймворка: типы, замыкания, генераторы, Reflection."
      },
      {
        "tag": "доступ к БД",
        "back": "Слой над базой: prepared statements, транзакции и защита от SQL-инъекций."
      },
      {
        "tag": "база",
        "back": "Хранилище кофейни, на котором отрабатываются запросы, схема и rollback."
      },
      {
        "tag": "автозагрузка",
        "back": "composer.json и PSR-4 заменяют ручные require и лежат в основе роутера и контейнера."
      }
    ],
    learn: [
      {
        "tab": "Типы и ==",
        "title": "strict_types и сравнения PHP 8",
        "text": "Один declare меняет поведение вызовов функций в файле, а нестрогое сравнение в PHP 8 изменилось. Ловушка: null == 0 в PHP истинно, в JavaScript нет.",
        "points": [
          "declare(strict_types=1) действует на весь файл",
          "таблица == до и после PHP 8",
          "union и nullable типы"
        ],
        "code": "0 == 'abc'   // PHP 7: true   |  PHP 8: false\n0 == ''      // PHP 7: true   |  PHP 8: false\n'10' == '1e1' // true: обе строки числовые\nnull == 0    // true (в JavaScript: false)\n[] == false  // true"
      },
      {
        "tab": "Массивы",
        "title": "Значения с copy-on-write",
        "text": "Массив в PHP передаётся по значению, а физическое копирование откладывается до первой записи. Вывод: функция не изменит исходный массив, пока вы не попросите ссылку явно.",
        "points": [
          "присваивание копирует логически, а не сразу",
          "by-value против by-reference",
          "array_filter сохраняет ключи, usort их сбрасывает"
        ],
        "code": "$a = [1, 2, 3];\n$b = $a;\n$b[] = 4;             // копия происходит здесь\nvar_dump($a);         // [1, 2, 3]\n\nfunction addItemByRef(array &$items): void { $items[] = 'new'; }"
      },
      {
        "tab": "Замыкания и генераторы",
        "title": "use, callable и yield",
        "text": "Замыкание захватывает переменные только явно и по значению на момент создания. Генератор читает данные порциями, поэтому файл в десять гигабайт не занимает память.",
        "points": [
          "use по значению и по ссылке",
          "fn как автозахват",
          "yield, yield from, свой Iterator"
        ],
        "code": "function readLargeFile(string $path): Generator {\n    $handle = fopen($path, 'r');\n    while (($line = fgets($handle)) !== false) {\n        yield trim($line);\n    }\n    fclose($handle);\n}"
      },
      {
        "tab": "Магические методы",
        "title": "На чём стоят фасады и Eloquent",
        "text": "__get и __set прячут атрибуты модели в массив, а __callStatic перенаправляет статический вызов на объект из контейнера. Фасад — не синтаксис, а несколько строк кода.",
        "points": [
          "__get, __set, __isset",
          "__call для динамических where*",
          "__callStatic как механизм фасадов"
        ],
        "code": "public static function __callStatic(string $name, array $args): mixed\n{\n    self::$resolvedInstance ??= app('cache');\n    return self::$resolvedInstance->$name(...$args);\n}\n\nCache::get('key'); // → $resolvedInstance->get('key')"
      },
      {
        "tab": "DI-контейнер",
        "title": "Autowiring через Reflection",
        "text": "Контейнер сам читает конструктор класса, разрешает зависимости по типам и рекурсивно строит граф. Единственное, что нужно указать явно, — реализацию интерфейса.",
        "points": [
          "bind и singleton",
          "ReflectionClass и getParameters()",
          "интерфейс без биндинга: понятная ошибка"
        ],
        "code": "$reflection = new \\ReflectionClass($concrete);\n$constructor = $reflection->getConstructor();\nforeach ($constructor->getParameters() as $param) {\n    $type = $param->getType();\n    $dependencies[] = $this->make($type->getName());   // рекурсия\n}\nreturn $reflection->newInstanceArgs($dependencies);"
      },
      {
        "tab": "PDO и middleware",
        "title": "SQL-инъекции и цепочка обработчиков",
        "text": "Конкатенация ввода в SQL открывает инъекцию, prepared statement передаёт значение отдельно от кода. Middleware собираются в «матрёшку» вложенных замыканий через array_reduce.",
        "points": [
          "prepare и именованные плейсхолдеры",
          "транзакция, CSRF-токен и hash_equals",
          "порядок «до» и «после» у middleware"
        ],
        "code": "$stmt = $pdo->prepare('SELECT * FROM drinks WHERE name = :name');\n$stmt->execute(['name' => $name]);\n\n$pipeline = array_reduce(\n    array_reverse($this->globalMiddleware),\n    fn($next, $mw) => fn($params) => $mw($params, $next),\n    $route['handler'],\n);"
      }
    ],
    accent: '#C9A876',
  },
  {
    key: 'js',
    titleMain: 'js',
    title: 'Чистый JS Lab',
    subtitle: 'Vanilla Helpdesk — фундамент без фреймворка',
    desc: 'Чистый JavaScript с нуля — общий фундамент для Vue и TypeScript: var/let/const и hoisting, this и замыкания, прототипы и class, event loop и async/await, DOM без фреймворка, ESM-модули, своя реактивность на Proxy, финальное мини-SPA с явным сравнением с Vue.',
    stack: ['JavaScript ES2022', 'Node.js 22+', 'json-server', 'node:test', 'Docker'],
    difficulty: 'Средняя',
    image: '../js/JavaScript.png',
    open: '../js/JS_Lab_VanillaHelpdesk.html',
    repo: 'https://github.com/meeymirita/js-lab',
    stackInfo: [
      {
        "tag": "Язык",
        "back": "Основной предмет лабы: весь код пишется на чистом современном JavaScript без фреймворка."
      },
      {
        "tag": "Среда",
        "back": "Запускает скрипты и тесты вне браузера и даёт единое окружение для ESM-модулей."
      },
      {
        "tag": "Мок-API",
        "back": "Отдаёт REST по JSON-файлу, чтобы практиковать fetch и ошибки без своего бэкенда."
      },
      {
        "tag": "Тесты",
        "back": "Встроенный тест-раннер Node проверяет логику без сторонних зависимостей."
      },
      {
        "tag": "Окружение",
        "back": "Контейнер даёт воспроизводимый запуск приложения и API."
      }
    ],
    learn: [
      {
        "tab": "var, let и замыкания",
        "title": "Область видимости и замыкание в цикле",
        "text": "Разберётесь, почему var делает одну переменную на весь цикл, а let создаёт новую на каждой итерации. Ловушка: асинхронные колбэки видят финальное значение счётчика.",
        "points": [
          "var — функциональная область, let/const — блочная",
          "Hoisting и Temporal Dead Zone",
          "let в for создаёт новое связывание на итерацию"
        ],
        "code": "for (var i = 0; i < 3; i++) { setTimeout(() => console.log('var:', i), 0); }\nfor (let j = 0; j < 3; j++) { setTimeout(() => console.log('let:', j), 0); }\n// var: 3 3 3      let: 0 1 2"
      },
      {
        "tab": "this и стрелки",
        "title": "this определяет вызов, а не объявление",
        "text": "Четыре способа вызова функции дают четыре разных this. Стрелочная функция берёт this из окружающего контекста и не переопределяется.",
        "points": [
          "fn(), obj.method(), call/apply/bind, new",
          "bind фиксирует this навсегда",
          "Стрелка внутри метода решает потерю this в колбэке"
        ],
        "code": "const cart = {\n  items: ['bolt', 'nut'],\n  prefix: '→',\n  printItems() {\n    this.items.forEach((item) => {\n      console.log(this.prefix, item);   // this === cart\n    });\n  },\n};"
      },
      {
        "tab": "Прототипы и class",
        "title": "class — синтаксис над прототипами",
        "text": "Цепочку прототипов можно собрать вручную через Object.create, а class даёт тот же механизм в удобной форме. Вывод: методы класса лежат в prototype, а не в каждом экземпляре.",
        "points": [
          "Поиск свойства идёт вверх по цепочке прототипов",
          "extends и super явно связывают родителя",
          "typeof класса — \"function\""
        ],
        "code": "class Animal {\n  constructor(name) { this.name = name; }\n  speak() { return `${this.name} издаёт звук`; }\n}\nclass Dog extends Animal {\n  speak() { return `${super.speak()} (гав!)`; }\n}\nconsole.log(typeof Animal);   // \"function\""
      },
      {
        "tab": "Event loop",
        "title": "Microtask раньше macrotask",
        "text": "JavaScript однопоточный, а асинхронность — это порядок очередей. Ловушка: setTimeout(fn, 0) всегда выполняется после промисов.",
        "points": [
          "Сначала синхронный код до пустого стека",
          "Очередь microtask опустошается целиком",
          "Затем одна macrotask и снова microtask"
        ],
        "code": "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => {\n  console.log('C');\n  Promise.resolve().then(() => console.log('D'));\n});\nPromise.resolve().then(() => console.log('E'));\nconsole.log('F');\n// A, F, C, E, D, B"
      },
      {
        "tab": "fetch и отмена",
        "title": "Ошибки fetch и AbortController",
        "text": "fetch не бросает исключение на 404 и 500, только на сетевой сбой, поэтому response.ok надо проверять вручную. Устаревший запрос при быстром вводе отменяется через AbortController.",
        "points": [
          "Проверка response.ok обязательна",
          "AbortError — ожидаемая отмена, а не сбой",
          "Promise.all, allSettled, race и any для нескольких запросов"
        ],
        "code": "let currentController = null;\nasync function search(query) {\n  currentController?.abort();\n  currentController = new AbortController();\n  try {\n    const res = await fetch(`/api/search?q=${query}`, { signal: currentController.signal });\n    return res.json();\n  } catch (error) {\n    if (error.name === 'AbortError') return null;\n    throw error;\n  }\n}"
      },
      {
        "tab": "Делегирование DOM",
        "title": "Один обработчик на родителе",
        "text": "Вместо обработчика на каждом элементе списка вешается один на контейнер и использует всплытие событий. Он работает и для элементов, которых ещё нет.",
        "points": [
          "event.target.closest находит нужный элемент",
          "Ранний return для кликов мимо",
          "Не нужно перевешивать обработчики после рендера"
        ],
        "code": "document.querySelector('#ticket-list').addEventListener('click', (event) => {\n  const item = event.target.closest('.ticket-item');\n  if (!item) return;\n  console.log('клик по', item.dataset.id);\n});"
      }
    ],
    accent: '#F4D35E',
  },
  {
    key: 'kubernetes',
    titleMain: 'kubernetes',
    title: 'Kubernetes Lab',
    subtitle: 'От Compose к оркестрации',
    desc: 'Миграция стека из Traefik-лабы в Kubernetes (kind): Pod и Deployment, Service и DNS, ConfigMap/Secret, Volumes и PVC, readiness/liveness-пробы, Traefik как Ingress-контроллер, HorizontalPodAutoscaler.',
    stack: ['Kubernetes v1.31.0', 'kind v0.24.0', 'kubectl', 'Traefik'],
    difficulty: 'Средняя–высокая',
    image: '../kubernetes/kubernetes.png',
    open: '../kubernetes/Kubernetes_Lab_Plan.html',
    repo: 'https://github.com/meeymirita/kubernetes-lab',
    stackInfo: [
      {
        "tag": "оркестратор",
        "back": "Pod, Deployment, Service, пробы и автомасштабирование вместо Compose."
      },
      {
        "tag": "кластер",
        "back": "Локальный кластер в контейнерах Docker для экспериментов."
      },
      {
        "tag": "CLI",
        "back": "Основной инструмент: apply, get, describe, exec, logs."
      },
      {
        "tag": "ingress",
        "back": "Тот же роутинг, что в Traefik-лабе, но как Ingress-контроллер."
      }
    ],
    learn: [
      {
        "tab": "Deployment",
        "title": "Желаемое состояние вместо команд",
        "text": "Deployment создаёт ReplicaSet, а тот следит, чтобы Pod'ов с нужными label'ами было ровно replicas. При смене образа поднимается новый ReplicaSet — так работает rolling-обновление без остановки сервиса.",
        "points": [
          "replicas: 3 — утверждение, а не разовая команда",
          "selector.matchLabels связывает Deployment и Pod'ы",
          "Самолечение через reconciliation loop"
        ],
        "code": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: api"
      },
      {
        "tab": "Service и DNS",
        "title": "Стабильный адрес для меняющихся Pod'ов",
        "text": "У Pod'ов нет постоянного IP, поэтому перед ними ставится Service. Он находит Pod'ы по selector, а имя резолвит CoreDNS. ClusterIP по умолчанию виден только внутри кластера.",
        "points": [
          "selector совпадает с label'ами Deployment",
          "api-service.default.svc.cluster.local",
          "kube-proxy распределяет трафик между Pod'ами"
        ],
        "code": "apiVersion: v1\nkind: Service\nmetadata:\n  name: api-service\nspec:\n  selector:\n    app: api\n  ports:\n    - port: 3000\n      targetPort: 3000"
      },
      {
        "tab": "ConfigMap и Secret",
        "title": "Конфигурация отдельно от образа",
        "text": "Не секретные значения живут в ConfigMap, пароли — в Secret. Ловушка: base64 в Secret — это кодирование, а не шифрование; защищает только ограничение доступа через RBAC.",
        "points": [
          "envFrom подключает все переменные разом",
          "stringData удобнее ручного base64",
          "Секреты в git — плохая практика"
        ],
        "code": "containers:\n  - name: api\n    image: traefik-lab-api:v1\n    envFrom:\n      - configMapRef:\n          name: api-config\n      - secretRef:\n          name: api-secret"
      },
      {
        "tab": "Тома и PVC",
        "title": "Данные, переживающие Pod",
        "text": "Pod может пересоздаться на другом узле, поэтому данные БД выносят в PersistentVolumeClaim — «заявку» на место нужного размера. В kind StorageClass создаёт PV автоматически.",
        "points": [
          "emptyDir, PV и PVC — три уровня",
          "accessModes и storage в заявке",
          "Подключение через volumes и volumeMounts"
        ],
        "code": "apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: postgres-pvc\nspec:\n  accessModes:\n    - ReadWriteOnce\n  resources:\n    requests:\n      storage: 1Gi"
      },
      {
        "tab": "Пробы",
        "title": "Готов и жив — разные вопросы",
        "text": "readinessProbe убирает Pod из Service, но не перезапускает его; livenessProbe убивает и пересоздаёт контейнер. Занятый, но живой процесс не должен погибать из-за медленного ответа.",
        "points": [
          "httpGet для API, exec для PostgreSQL",
          "initialDelaySeconds и periodSeconds",
          "Аналог healthcheck из Compose, разделённый надвое"
        ],
        "code": "readinessProbe:\n  httpGet:\n    path: /health\n    port: 3000\n  initialDelaySeconds: 3\n  periodSeconds: 5\nlivenessProbe:\n  httpGet:\n    path: /health\n    port: 3000\n  failureThreshold: 3"
      },
      {
        "tab": "Ingress и HPA",
        "title": "Вход снаружи и автомасштабирование",
        "text": "Traefik работает как Ingress-контроллер: те же роутеры, но описанные через IngressRoute на Service. HPA сам считает число реплик по CPU, но без resources.requests он работать не может.",
        "points": [
          "IngressRoute вместо labels",
          "HPA опирается на metrics-server",
          "requests и limits обязательны для автоскейлинга"
        ],
        "code": "spec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: api\n  minReplicas: 1\n  maxReplicas: 5\n  metrics:\n    - type: Resource\n      resource:\n        name: cpu\n        target:\n          type: Utilization\n          averageUtilization: 50"
      }
    ],
    accent: '#326CE5',
  },
  {
    key: 'nestjs',
    titleMain: 'nestjs',
    title: 'NestJS Lab',
    subtitle: 'DI руками, JWT-ротация, real-time',
    desc: 'Helpdesk API собран с нуля слой за слоем: свой мини-DI контейнер, границы модулей и provider scopes, Prisma и транзакции, JWT-ротация refresh-токенов с reuse-detection, RBAC через TicketPolicy, доменные события и WebSocket-шлюз, свой динамический модуль, unit и e2e тесты.',
    stack: ['NestJS 11', 'Prisma 6', 'PostgreSQL 17', 'JWT + argon2', 'Socket.IO'],
    difficulty: 'Высокая',
    image: '../nestjs/nest.png',
    open: '../nestjs/NestJS_Lab_Plan.html',
    repo: 'https://github.com/meeymirita/nestjs-lab',
    stackInfo: [
      {
        "tag": "фреймворк",
        "back": "Каркас API: модули, DI, guards, pipes и interceptors."
      },
      {
        "tag": "ORM",
        "back": "Типизированный доступ к БД, миграции и транзакции."
      },
      {
        "tag": "база данных",
        "back": "Хранилище тикетов, пользователей и refresh-токенов."
      },
      {
        "tag": "безопасность",
        "back": "Access/refresh-токены и хэширование паролей."
      },
      {
        "tag": "real-time",
        "back": "WebSocket-шлюз с комнатами для живых обновлений тикетов."
      }
    ],
    learn: [
      {
        "tab": "DI руками",
        "title": "Что на самом деле делает контейнер Nest",
        "text": "Мини-DI-контейнер на 25 строк собирает граф зависимостей по метаданным конструктора. После этого @Injectable и токены перестают быть магией; ловушка — забытый декоратор, из-за которого класс не резолвится.",
        "points": [
          "reflect-metadata и design:paramtypes",
          "Синглтон по умолчанию: один экземпляр на всех",
          "Понятная ошибка с путём зависимостей"
        ],
        "code": "resolve<T>(token: Ctor<T>, path: Ctor[] = []): T {\n  if (this.instances.has(token)) return this.instances.get(token) as T;\n  const deps: Ctor[] = Reflect.getMetadata('design:paramtypes', token) ?? [];\n  const instance = new token(...deps.map((d) => this.resolve(d, [...path, token])));\n  this.instances.set(token, instance);\n  return instance;\n}"
      },
      {
        "tab": "Транзакции",
        "title": "Prisma: обновление и история атомарно",
        "text": "Обновление тикета и запись истории изменений выполняются в одной транзакции. Если запись истории упадёт, изменения тикета тоже откатятся.",
        "points": [
          "$transaction с интерактивным tx",
          "diff до/после по отслеживаемым полям",
          "Счётчик version для оптимистичных проверок"
        ],
        "code": "return this.prisma.$transaction(async (tx) => {\n  const before = await tx.ticket.findUnique({ where: { id } });\n  const after = await tx.ticket.update({\n    where: { id },\n    data: { ...dto, version: { increment: 1 } },\n  });\n  const changes = diffTicket(before, after);\n  await tx.ticketHistory.createMany({ data: changes.map((c) => ({ ...c, ticketId: id, actorId })) });\n  return after;\n});"
      },
      {
        "tab": "JWT-ротация",
        "title": "Refresh-токены и reuse-detection",
        "text": "Каждый refresh-токен одноразовый: при обновлении старый отзывается и выдаётся новый в той же «семье». Повторное предъявление отозванного токена считается кражей и гасит всю семью.",
        "points": [
          "В БД хранится хэш, а не сам токен",
          "compare-and-set против гонки двух запросов",
          "revokeFamily при обнаружении повтора"
        ],
        "code": "if (row.revokedAt) {\n  await this.revokeFamily(row.familyId);\n  throw new UnauthorizedException('Refresh token reuse detected');\n}\n// ...\nconst { count } = await tx.refreshToken.updateMany({\n  where: { id: row.id, revokedAt: null },\n  data: { revokedAt: new Date() },\n});\nif (count !== 1) throw new UnauthorizedException('Refresh token already used');"
      },
      {
        "tab": "Роли и политики",
        "title": "RBAC и TicketPolicy",
        "text": "Роль проверяется guard'ом через метаданные, а права на конкретный тикет — отдельным классом-политикой. Guard не видит тело запроса, поэтому проверки по DTO живут в сервисном слое.",
        "points": [
          "SetMetadata и Reflector.getAllAndOverride",
          "scopeFor: условие видимости в каждом запросе",
          "Разрешённые переходы статусов"
        ],
        "code": "scopeFor(user: AuthUser): Prisma.TicketWhereInput {\n  return this.isStaff(user) ? {} : { authorId: user.id };\n}\n\nif (STAFF_ONLY_FIELDS.some((f) => dto[f] !== undefined)) {\n  throw new ForbiddenException('Only staff can change status, priority or assignee');\n}"
      },
      {
        "tab": "Доменные события",
        "title": "Сервис не знает про сокеты",
        "text": "Сервис тикетов публикует типизированные события, а слушатели решают, что с ними делать: слать в WebSocket, писать аудит. Связность падает, добавить реакцию можно без правки сервиса.",
        "points": [
          "@nestjs/event-emitter и wildcard-имена",
          "Классы событий вместо строк с данными",
          "EventEmitter в процессе против брокера"
        ],
        "code": "export const TicketEvents = {\n  Created: 'ticket.created',\n  Updated: 'ticket.updated',\n  Deleted: 'ticket.deleted',\n} as const;\n\nexport class TicketCreatedEvent {\n  readonly type = TicketEvents.Created;\n  constructor(public readonly ticket: Ticket, public readonly actorId: number) {}\n}"
      },
      {
        "tab": "WebSocket-шлюз",
        "title": "Real-time с проверкой прав",
        "text": "Шлюз проверяет JWT один раз при подключении, раскладывает сокеты по комнатам и повторно проверяет доступ при подписке на тикет. Комнаты не переживают перезапуск сервера, поэтому клиент подписывается заново.",
        "points": [
          "Токен в handshake.auth, а не в query",
          "Комнаты user:, ticket:, agents",
          "Подписка через ту же TicketPolicy"
        ],
        "code": "@SubscribeMessage('ticket:subscribe')\nasync subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { ticketId?: unknown }) {\n  const user = client.data.user as AuthUser;\n  const ticket = await this.prisma.ticket.findFirst({\n    where: { id: Number(body?.ticketId), ...this.policy.scopeFor(user) },\n  });\n  if (!ticket) throw new WsException('Ticket not found');\n  await client.join(ticketRoom(ticket.id));\n}"
      }
    ],
    accent: '#E0234E',
  },
  {
    key: 'graphql',
    titleMain: 'graphql',
    title: 'GraphQL Lab',
    subtitle: 'CineGraph — каталог фильмов на GraphQL',
    desc: 'Самостоятельный проект CineGraph с нуля: язык запросов и жизненный цикл запроса, N+1 в резолверах и DataLoader, JWT и права на уровне полей, интерфейсы и юнионы, курсорная пагинация, подписки через Redis, защита от тяжёлых запросов, unit и e2e тесты.',
    stack: ['NestJS + Apollo Server', 'Prisma 7', 'PostgreSQL 17', 'DataLoader', 'Redis'],
    difficulty: 'Высокая',
    image: '../graphql/GraphQL.png',
    open: '../graphql/GraphQL_Lab_Plan.html',
    repo: 'https://github.com/meeymirita/graphql-lab',
    accent: '#E535AB',
  },
  {
    key: 'postgresql',
    titleMain: 'postgresql',
    title: 'PostgreSQL Lab',
    subtitle: 'Coffee Shop изнутри — база без ORM',
    desc: 'Что происходит под ORM на миллионе заказов кофейни: JOIN с нуля, EXPLAIN и индексы B-tree/GIN/BRIN под конкретный запрос, статистика, N+1 глазами базы, уровни изоляции и аномалии, блокировки и дедлоки, SKIP LOCKED, MVCC и VACUUM, партиционирование.',
    stack: ['PostgreSQL 17', 'psql', 'pgbench', 'Docker'],
    difficulty: 'Средняя–высокая',
    image: '../postgresql/PostgreSQL.png',
    open: '../postgresql/PostgreSQL_Lab_CoffeeShop.html',
    repo: 'https://github.com/meeymirita/postgresql-lab',
    stackInfo: [
      {
        "tag": "СУБД",
        "back": "Единственный объект изучения: планировщик, индексы, транзакции, MVCC и партиционирование."
      },
      {
        "tag": "клиент",
        "back": "Рабочее место: EXPLAIN, \\d, \\timing и psql-сессии для параллельных экспериментов."
      },
      {
        "tag": "нагрузка",
        "back": "Имитирует конкурентных кассиров и воспроизводит гонки и дедлоки."
      },
      {
        "tag": "окружение",
        "back": "Поднимает Postgres с расширениями pg_stat_statements и pageinspect одной командой."
      }
    ],
    learn: [
      {
        "tab": "Индекс под FK",
        "title": "Первый B-tree и EXPLAIN",
        "text": "Запрос «позиции заказа» на миллионе строк читает всю таблицу, пока нет индекса на внешний ключ. EXPLAIN ANALYZE с BUFFERS показывает разницу в буферах, а не только во времени.",
        "points": [
          "Seq Scan против Index Scan и Bitmap",
          "как читать actual, loops и Buffers",
          "индекс под каждый внешний ключ"
        ],
        "code": "CREATE INDEX order_items_order_id_idx ON order_items (order_id);\n\nEXPLAIN (ANALYZE)\nSELECT o.id, oi.product_id, oi.qty\nFROM orders o JOIN order_items oi ON oi.order_id = o.id\nWHERE o.id = 500000;   -- ~117 мс → ~0.08 мс"
      },
      {
        "tab": "Составной индекс",
        "title": "Порядок колонок и статистика",
        "text": "Индекс (customer_id, created_at DESC) убирает Sort, и LIMIT останавливается после 20 записей. Но для клиента с неверной оценкой планировщик выбирает другой план: проблема в статистике.",
        "points": [
          "левый префикс и порядок колонок",
          "почему планировщик ошибается в rows",
          "ANALYZE и расширенная статистика"
        ],
        "code": "CREATE INDEX orders_customer_created_idx ON orders (customer_id, created_at DESC);\n\nEXPLAIN (ANALYZE, BUFFERS)\nSELECT * FROM orders WHERE customer_id = 42\nORDER BY created_at DESC LIMIT 20;   -- 70 мс → 0.04 мс"
      },
      {
        "tab": "Частичный и GIN",
        "title": "Индекс только там, где нужно",
        "text": "Экран бариста интересуют около 0,15% заказов — частичный индекс покрывает только их. GIN закрывает подстроки, теги и jsonb, но индекс по @> не помогает запросу через ->>.",
        "points": [
          "WHERE в определении индекса",
          "pg_trgm для ILIKE и полнотекстовый поиск",
          "BRIN для журналов"
        ],
        "code": "CREATE INDEX orders_active_idx ON orders (shop_id, created_at)\n  WHERE status IN ('new', 'paid', 'preparing', 'ready');\n\nCREATE INDEX customers_name_trgm ON customers USING gin (full_name gin_trgm_ops);"
      },
      {
        "tab": "N+1 и пагинация",
        "title": "Запросы глазами базы",
        "text": "OFFSET 500000 читает и выбрасывает пол-миллиона строк, keyset-пагинация идёт по индексу от последней увиденной строки. Ловушка: нельзя перейти сразу на страницу 537.",
        "points": [
          "N+1 в pg_stat_statements",
          "row comparison (created_at, id) < (…)",
          "поиск медленных запросов и auto_explain"
        ],
        "code": "SELECT id, total, created_at FROM orders\nWHERE (created_at, id) < ('2025-09-01', 0)\nORDER BY created_at DESC, id DESC\nLIMIT 20;   -- 4 буфера вместо ~9700"
      },
      {
        "tab": "Изоляция и блокировки",
        "title": "Гонки и очередь на SKIP LOCKED",
        "text": "Прочитал, вычел, записал — 50 продаж списывают 6 штук. Атомарный UPDATE, FOR UPDATE и версия строки решают задачу по-разному, а SKIP LOCKED превращает таблицу в очередь.",
        "points": [
          "потерянное обновление через pgbench",
          "Read Committed, Repeatable Read, Serializable",
          "дедлоки и pg_blocking_pids"
        ],
        "code": "WITH next AS (\n  SELECT id FROM orders\n  WHERE shop_id = 3 AND status = 'paid'\n  ORDER BY created_at LIMIT 1\n  FOR UPDATE SKIP LOCKED\n)\nUPDATE orders o SET status = 'preparing'\nFROM next WHERE o.id = next.id RETURNING o.id;"
      },
      {
        "tab": "MVCC и VACUUM",
        "title": "Версии строк на странице",
        "text": "UPDATE — это буквально DELETE плюс INSERT: старая версия остаётся на странице, пока её не уберёт VACUUM. Долгая транзакция держит горизонт и мешает уборке.",
        "points": [
          "xmin, xmax, ctid и pageinspect",
          "мёртвые строки, autovacuum, HOT",
          "партиционирование журнала по месяцам"
        ],
        "code": "SELECT xmin, xmax, ctid, * FROM cups;\n\nSELECT lp, t_xmin, t_xmax, t_ctid\nFROM heap_page_items(get_raw_page('cups', 0));   -- все версии на странице"
      }
    ],
    accent: '#4A90D9',
  },
  {
    key: 'nuxt',
    titleMain: 'nuxt',
    title: 'Nuxt Lab',
    subtitle: 'Help Center — SSR, SSG и SPA в одном приложении',
    desc: 'Публичный центр поддержки на Nuxt 4 и TypeScript: файловый роутинг, useFetch и гидрация, Nitro server routes, Drizzle + SQLite, общие Zod-схемы в shared/, сессии и защита страниц, Nuxt Content, routeRules (SSG, SWR, SPA), SEO, тесты и сборка в Docker.',
    stack: ['Nuxt 4', 'TypeScript', 'Nitro', 'Drizzle', 'Nuxt Content'],
    difficulty: 'Высокая',
    image: '../nuxt/Nuxt.png',
    open: '../nuxt/Nuxt_Lab_HelpCenter.html',
    repo: 'https://github.com/meeymirita/nuxt-lab',
    stackInfo: [
      {
        "tag": "Фреймворк",
        "back": "Универсальное приложение: SSR, SSG и SPA с файловым роутингом и авто-импортами."
      },
      {
        "tag": "Типизация",
        "back": "Типы выводятся из серверных хендлеров и общих схем до самого шаблона."
      },
      {
        "tag": "Сервер",
        "back": "Серверный движок рендерит страницы и обслуживает API-маршруты."
      },
      {
        "tag": "База данных",
        "back": "Типобезопасный доступ к SQLite: схема, миграции и запросы."
      },
      {
        "tag": "Контент",
        "back": "Статьи базы знаний из markdown-файлов с запросами по коллекциям."
      }
    ],
    learn: [
      {
        "tab": "Файловый роутинг",
        "title": "Маршруты задают файлы",
        "text": "Структура app/pages/ превращается в маршруты, а параметры пишутся в квадратных скобках. Файл [...slug].vue ловит любой остальной путь и подходит для 404.",
        "points": [
          "Динамические сегменты: [id].vue, [category]/[slug].vue",
          "NuxtLink предзагружает код страницы",
          "Под капотом всё тот же Vue Router"
        ],
        "code": "app/pages/\n├── index.vue                  → /\n├── kb/\n│   ├── index.vue              → /kb\n│   └── [category]/\n│       └── [slug].vue         → /kb/network/vpn-setup\n├── tickets/\n│   ├── index.vue              → /tickets\n│   └── [id].vue               → /tickets/42\n└── [...slug].vue              → catch-all (404)"
      },
      {
        "tab": "useFetch и гидрация",
        "title": "Запрос на сервере, без повтора в браузере",
        "text": "useFetch выполняется во время SSR и кладёт результат в payload, поэтому при гидрации запроса нет. Из-за этого setup идёт дважды, и любой код с window или расхождением разметки приводит к ошибкам.",
        "points": [
          "Тип data выводится из серверного хендлера",
          "useFetch(url) — это useAsyncData с автоключом",
          "onMounted и window только в браузере"
        ],
        "code": "const { data, status, error, refresh } = await useFetch('/api/status')\n\nconst { data: article } = await useAsyncData(`kb-${slug}`, () =>\n  queryCollection('kb').path(`/kb/${category}/${slug}`).first()\n)"
      },
      {
        "tab": "Режимы рендеринга",
        "title": "SSG, SWR, SPA и SSR в одном приложении",
        "text": "Режим рендеринга задаётся для каждого маршрута через routeRules. Статьи собираются при сборке, статус кешируется, кабинет агента работает как SPA, а личные данные рендерятся на каждый запрос.",
        "points": [
          "prerender — HTML на сборке",
          "swr — кеш с фоновым обновлением",
          "ssr: false — оболочка без серверного рендера"
        ],
        "code": "export default defineNuxtConfig({\n  routeRules: {\n    '/':          { prerender: true },\n    '/kb/**':     { prerender: true },\n    '/status':    { swr: 60 },\n    '/agent/**':  { ssr: false },\n    // /tickets/** — правил нет, значит SSR на каждый запрос\n  },\n})"
      },
      {
        "tab": "Nitro и валидация",
        "title": "API внутри проекта",
        "text": "Файл в server/api/ становится маршрутом, а метод берётся из суффикса. Тело запроса проверяется Zod-схемой из shared/, ошибки уходят клиенту с кодом и деталями по полям.",
        "points": [
          "Имя файла определяет метод: tickets.post.ts",
          "readValidatedBody принимает safeParse",
          "createError превращает ошибку в HTTP-ответ"
        ],
        "code": "export default defineEventHandler(async (event) => {\n  const result = await readValidatedBody(event, body => TicketCreateSchema.safeParse(body))\n  if (!result.success) {\n    throw createError({\n      statusCode: 400,\n      statusMessage: 'Проверьте поля формы',\n      data: z.flattenError(result.error),\n    })\n  }\n  const ticket = useDb().insert(tables.tickets).values(result.data).returning().get()\n  setResponseStatus(event, 201)\n  return { id: ticket.id, status: ticket.status }\n})"
      },
      {
        "tab": "Состояние на SSR",
        "title": "Почему модульный ref опасен",
        "text": "Модуль на сервере загружается один раз на процесс, поэтому ref на уровне модуля общий для всех пользователей. Безопасны useState и Pinia, состояние которых создаётся на каждый запрос.",
        "points": [
          "В браузере модуль живёт в одной вкладке, на сервере — на всех",
          "useState передаёт значение через payload",
          "callOnce выполняет инициализацию один раз"
        ],
        "code": "// composables/useRecentlyViewed.ts\nconst recent = ref<number[]>([])                 // ← на уровне модуля\nexport function useRecentlyViewed() { return recent }"
      },
      {
        "tab": "Сессии и защита",
        "title": "Сессия в зашифрованной cookie",
        "text": "Пользователь хранится в sealed cookie, а тип User расширяется один раз и работает и на сервере, и на клиенте. Ловушка: внутренний SSR-запрос к API идёт без cookie, а защищать данные нужно на сервере, не только middleware.",
        "points": [
          "setUserSession и requireUserSession на сервере",
          "useUserSession на клиенте",
          "Расширение типа через declaration merging"
        ],
        "code": "// shared/types/auth.d.ts\nimport type { Role } from '#shared/types/domain'\ndeclare module '#auth-utils' {\n  interface User { id: number; email: string; name: string; role: Role }\n}\nexport {}"
      }
    ],
    accent: '#00DC82',
  },
  {
    key: 'angular',
    titleMain: 'angular',
    title: 'Angular Lab',
    subtitle: 'RoomBook — бронирование переговорных',
    desc: 'Внутренний сервис бронирования переговорных на Angular 22: сигналы и OnPush без zone.js, DI и провайдеры, HttpClient, интерцепторы и httpResource, роутер с lazy-загрузкой и guards по ролям, Signal Forms с серверной проверкой слота, RxJS для поиска и живого расписания через SSE, тесты на Vitest и сборка под nginx.',
    stack: ['Angular 22', 'TypeScript', 'Signals', 'Signal Forms', 'RxJS'],
    stackInfo: [
      { tag: 'фреймворк', back: 'Каркас всего проекта: standalone-компоненты, zoneless и OnPush по умолчанию.' },
      { tag: 'язык', back: 'Строгие типы для моделей, API и форм.' },
      { tag: 'состояние', back: 'Реактивность без zone.js: signal, computed, linkedSignal.' },
      { tag: 'формы', back: 'Форма брони с серверной проверкой занятого слота.' },
      { tag: 'потоки', back: 'Поиск с debounce и живое расписание через SSE.' },
    ],
    difficulty: 'Высокая',
    image: '../angular/Angular.png',
    open: '../angular/Angular_Lab_RoomBook.html',
    repo: 'https://github.com/meeymirita/angular-lab',
    learn: [
      {
        tab: 'Сигналы и OnPush',
        title: 'Реактивность без zone.js',
        text: 'Состояние живёт в сигналах, а шаблон перерисовывается только там, где сигнал реально изменился. Никакого «магического» обнаружения изменений: сначала разберёте, почему счётчик растёт, а мутированный массив не обновляет сетку.',
        points: ['signal, computed, effect', 'linkedSignal: значение, которое сбрасывается вслед за источником', 'OnPush и zoneless по умолчанию'],
        code: "filtered = computed(() =>\n  this.rooms().filter(r => r.capacity >= this.minCapacity()));\n\n// выбор сохраняется, пока комната в списке; иначе — первая\nselectedId = linkedSignal<Room[], number | null>({\n  source: this.filtered,\n  computation: (list, prev) =>\n    prev && list.some(r => r.id === prev.value) ? prev.value : (list[0]?.id ?? null),\n});",
      },
      {
        tab: 'DI и провайдеры',
        title: 'Кто и где создаёт сервисы',
        text: 'Внедрение зависимостей — основа всего приложения. Увидите разницу между сервисом на весь корень и на один компонент и почему стор с состоянием формы нельзя делать синглтоном.',
        points: ['inject() вместо конструкторов', 'providedIn: root и providers компонента', 'InjectionToken для конфигурации (API_BASE_URL)'],
        code: "export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');\n\n@Injectable({ providedIn: 'root' })\nexport class RoomsApi {\n  private http = inject(HttpClient);\n  private base = inject(API_BASE_URL);\n}",
      },
      {
        tab: 'HTTP и интерцепторы',
        title: 'Запросы, токены и ошибки в одном месте',
        text: 'HttpClient, цепочка интерцепторов для токена, логов и ошибок, а ещё httpResource — запрос, который сам перезапускается, когда меняется сигнал-параметр.',
        points: ['provideHttpClient(withInterceptors([...]))', 'единый обработчик 401 и 500', 'httpResource и состояние loading / error / value'],
        code: "provideHttpClient(\n  withInterceptors([apiLogInterceptor, errorInterceptor, authInterceptor]),\n),",
      },
      {
        tab: 'Роутер и guards',
        title: 'Страницы, ленивая загрузка и роли',
        text: 'Маршруты с параметрами, lazy-загрузка страниц и guard для администратора. Главный вывод раздела: guard — это UX, а не защита, настоящая проверка живёт на сервере.',
        points: ['loadComponent / loadChildren и разбиение бандла', 'параметры маршрута как input()', 'canMatch-guard и redirect на /not-found'],
        code: "{ path: 'admin', canMatch: [adminGuard],\n  loadChildren: () => import('./admin/admin.routes') },\n\nexport const adminGuard: CanMatchFn = () =>\n  inject(AuthStore).isAdmin();",
      },
      {
        tab: 'Signal Forms',
        title: 'Форма брони с проверкой слота',
        text: 'Форма строится вокруг модели на сигналах. Сначала клиентские правила (обязательность, длина, конец позже начала), потом серверная проверка занятости слота: ответ 409 превращается в понятную ошибку у поля.',
        points: ['form(model, schema) и директива [formField]', 'валидаторы required, minLength, min, validate', 'ошибки сервера 400 и 409 прямо в поле'],
        code: "protected readonly f = form(this.model, (p) => {\n  required(p.title);\n  minLength(p.title, 3);\n  min(p.attendees, 1);\n});",
      },
      {
        tab: 'RxJS, SSE и тесты',
        title: 'Поиск, живое расписание, Vitest',
        text: 'RxJS остаётся там, где он сильнее сигналов: поиск с debounce и живое обновление расписания через SSE. В конце — тесты сторов и guard-ов на Vitest и сборка под nginx.',
        points: ['debounceTime, switchMap, toSignal', 'EventSource как Observable', 'Vitest, provideHttpClientTesting, nginx с SPA-fallback'],
        code: "const results = toSignal(\n  toObservable(query).pipe(debounceTime(300), switchMap(q => api.search(q))),\n  { initialValue: [] },\n);   // сигнал → поток с операторами → снова сигнал",
      },
    ],
    accent: '#CC26D5',
  },
  {
    key: 'css',
    titleMain: 'css',
    title: 'CSS Lab',
    subtitle: 'FrontFest — сайт конференции',
    desc: 'Современный CSS с нуля на сайте фронтенд-конференции: каскад и @layer, токены, oklch и тёмная тема через light-dark(), Flexbox, Grid и subgrid, адаптив и container queries, :has() и формы, sticky, анимации и view transitions. Разметка готовая — вы пишете только стили, без фреймворков и препроцессоров.',
    stack: ['CSS', '@layer', 'Grid', 'Container Queries', 'oklch'],
    difficulty: 'Базовая',
    image: '../css/css.png',
    open: '../css/CSS_Lab_FrontFest.html',
    repo: 'https://github.com/meeymirita/css-lab',
    accent: '#2965F1',
  },
  {
    key: 'tailwind',
    titleMain: 'tailwind',
    title: 'Tailwind Lab',
    subtitle: 'Pulse — сервис аналитики',
    desc: 'Tailwind CSS v4 с нуля на сервисе аналитики «Pulse»: лендинг, дашборд и настройки. Утилиты и шкалы, тема через @theme, варианты и состояния (group, peer, has-*), адаптив и container queries, тёмная тема, формы, @layer components и @apply, сборка на Vite и nginx. Разметку пишете сами.',
    stack: ['Tailwind CSS 4', '@theme', 'Vite', 'Container Queries', 'Dark mode'],
    difficulty: 'Базовая',
    image: '../tailwind/tailwind.png',
    open: '../tailwind/Tailwind_Lab_Pulse.html',
    repo: 'https://github.com/meeymirita/tailwind-lab',
    accent: '#38BDF8',
  },
];

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// GSAP (+ ScrollTrigger, Flip) is loaded from cdnjs as plain <script> tags before this file.
// Every call site below checks for it and falls back to the plain CSS/JS behaviour that
// already existed if the CDN failed to load or the visitor asked for less motion.
var gsapReady = false;
if (window.gsap && window.ScrollTrigger && window.Flip && !prefersReducedMotion()) {
  gsap.registerPlugin(ScrollTrigger, Flip);
  gsapReady = true;
}

function initNavAutoHide() {
  if (!gsapReady) return;
  var nav = document.querySelector('.lab-nav');
  if (!nav) return;

  var hidden = false;
  function setHidden(next) {
    if (next === hidden) return;
    hidden = next;
    gsap.to(nav, { yPercent: hidden ? -100 : 0, duration: .3, ease: 'power2.out', overwrite: true });
  }

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: function (self) {
      setHidden(self.scroll() > nav.offsetHeight + 20 && self.direction === 1);
    },
  });
}

function hexToRgb(hex) {
  var n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixWithWhite(hex, ratio) {
  var rgb = hexToRgb(hex);
  var mixed = rgb.map(function (c) { return Math.round(c + (255 - c) * ratio); });
  return 'rgb(' + mixed.join(',') + ')';
}

function parseTopics(desc, accent) {
  var idx = desc.indexOf(':');
  if (idx === -1) return [];
  var rest = desc.slice(idx + 1).trim().replace(/\.$/, '');
  // запятые внутри скобок не делят тему: «routeRules (SSG, SWR, SPA)» — одна плитка
  return rest.split(/,\s+(?![^()]*\))/).map(function (text, i) {
    return { num: String(i + 1).padStart(2, '0'), text: text, accent: accent };
  });
}

var activeLab = null;

// One timeline drives both directions (GSAP "interruptible single timeline enter/exit"):
// [enter] -> addPause() -> [exit]. Opening plays up to the pause; closing plays on through
// the exit. Interrupting mid-way just reverses back toward the pause (or to 0), so a fast
// open/close/open never jumps or restarts.
var tocTl = null;
var tocPauseAt = 0;

function tocNodes() {
  return document.querySelectorAll('#lab-toc-panel .lab-toc-node');
}

function staggerTocNodes() {
  var nodes = tocNodes();
  if (!nodes.length) return;
  gsap.fromTo(nodes,
    { opacity: 0, x: -14 },
    { opacity: 1, x: 0, duration: .35, ease: 'power2.out', stagger: .035, overwrite: true });
}

function finishCloseToc() {
  var modal = document.getElementById('lab-toc-modal');
  if (modal) modal.classList.remove('is-open');
  document.body.style.overflow = '';
  if (tocTl) tocTl.pause(0);
}

function getTocTimeline(modal) {
  if (tocTl) return tocTl;

  var backdrop = modal.querySelector('.lab-toc-modal-backdrop');
  var box = modal.querySelector('.lab-toc-modal-box');
  var headParts = modal.querySelectorAll('.lab-toc-modal-head > *');
  var body = document.getElementById('lab-toc-panel');
  modal.classList.add('js-tl');

  tocTl = gsap.timeline({ paused: true, onComplete: finishCloseToc, onReverseComplete: finishCloseToc });

  // enter
  tocTl
    .fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: .3, ease: 'none' }, 0)
    .fromTo(box,
      { opacity: 0, y: 40, clipPath: 'inset(50% 0% 50% 0%)' },
      { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: .55, ease: 'power3.out' }, 0)
    .fromTo(headParts, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out', stagger: .07 }, .2)
    .fromTo(body, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' }, .28)
    .call(function () { if (!tocTl.reversed()) staggerTocNodes(); }, null, .3);

  tocTl.addPause();
  tocPauseAt = tocTl.duration();

  // exit
  tocTl
    .to([headParts, body], { opacity: 0, y: -10, duration: .2, ease: 'power1.in', stagger: .03 })
    .to(box, { y: -30, clipPath: 'inset(0% 0% 100% 0%)', duration: .4, ease: 'power3.in' }, '<.05')
    .to(backdrop, { opacity: 0, duration: .3, ease: 'none' }, '<.1');

  return tocTl;
}

function openToc() {
  var modal = document.getElementById('lab-toc-modal');
  var panel = document.getElementById('lab-toc-panel');
  if (!modal || !panel) return;

  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';

  if (!panel.dataset.loaded) {
    loadToc(activeLab, panel);
  }

  if (!gsapReady) return;
  try {
    var tl = getTocTimeline(modal);
    // mid-exit -> rewind the exit back up to the pause; otherwise play the enter forward
    if (tl.time() > tocPauseAt) tl.reverse();
    else tl.play();
  } catch (e) {}
}

function closeToc() {
  var modal = document.getElementById('lab-toc-modal');
  if (!modal || !modal.classList.contains('is-open')) return;

  if (!gsapReady || !tocTl) {
    finishCloseToc();
    return;
  }
  // mid-enter -> reverse the enter back to 0; at/after the pause -> play on through the exit
  if (tocTl.time() < tocPauseAt) tocTl.reverse();
  else tocTl.play();
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeToc();
});

function toggleTocNode(btn) {
  var node = btn.closest('.lab-toc-node');
  if (!node) return;

  if (!gsapReady) {
    var openPlain = node.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', openPlain ? 'true' : 'false');
    return;
  }

  var body = node.querySelector('.lab-toc-body');
  if (!body) return;

  // Animate the section's real height (0 <-> auto) instead of snapping it open;
  // siblings below simply follow the growing box, so nothing jumps or overlaps.
  body.style.transition = 'none';
  body.style.maxHeight = 'none';
  var subs = body.querySelectorAll('.lab-toc-sub li');
  var open = !node.classList.contains('is-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open) {
    node.classList.add('is-open');
    gsap.fromTo(body, { height: 0 }, { height: 'auto', duration: .4, ease: 'power2.out', overwrite: true });
    gsap.fromTo(subs, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: .3, ease: 'power2.out', stagger: .04, delay: .08, overwrite: true });
  } else {
    gsap.to(subs, { opacity: 0, duration: .15, overwrite: true });
    gsap.to(body, {
      height: 0, duration: .3, ease: 'power2.inOut', overwrite: true,
      onComplete: function () {
        node.classList.remove('is-open');
        gsap.set(body, { clearProps: 'height' });
        body.style.maxHeight = '';
      },
    });
  }
}

function loadToc(lab, panel) {
  panel.innerHTML = '<div class="lab-toc-status mono">загрузка…</div>';

  fetch(lab.open)
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var sections = Array.prototype.slice.call(doc.querySelectorAll('h2[id]'));

      var items = sections.map(function (h2) {
        var title = h2.textContent.replace(/#\s*$/, '').trim();
        var subs = [];
        var el = h2.nextElementSibling;
        while (el && el.tagName !== 'H2') {
          if (el.tagName === 'H3') {
            var subTitle = el.textContent.replace(/#\s*$/, '').trim();
            if (/^\d+\.\d+/.test(subTitle)) subs.push(subTitle);
          }
          el = el.nextElementSibling;
        }
        return { id: h2.id, title: title, subs: subs };
      });

      panel.dataset.loaded = '1';

      if (!items.length) {
        panel.innerHTML = '<div class="lab-toc-status mono">не удалось разобрать оглавление — <a href="' + lab.open + '" target="_blank" rel="noopener">открой методичку напрямую</a></div>';
        return;
      }

      panel.innerHTML = '<ol class="lab-toc-list">' + items.map(function (it) {
        var hasSubs = it.subs.length > 0;
        return '<li class="lab-toc-node">' +
          '<div class="lab-toc-head">' +
            (hasSubs
              ? '<button type="button" class="lab-toc-toggle" onclick="toggleTocNode(this)" aria-expanded="false" aria-label="Развернуть раздел"><span class="lab-toc-arrow">▸</span></button>'
              : '<span class="lab-toc-toggle-spacer"></span>') +
            '<a class="lab-toc-item" href="' + lab.open + '#' + it.id + '" target="_blank" rel="noopener">' + escapeHtml(it.title) + '</a>' +
          '</div>' +
          (hasSubs
            ? '<div class="lab-toc-body"><ul class="lab-toc-sub">' + it.subs.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul></div>'
            : '') +
        '</li>';
      }).join('') + '</ol>';

      // content arrived after the enter already ran -> stagger it in now
      if (gsapReady && tocTl && !tocTl.reversed() && tocTl.time() > 0) staggerTocNodes();
    })
    .catch(function () {
      panel.dataset.loaded = '';
      panel.innerHTML = '<div class="lab-toc-status mono">не удалось загрузить оглавление — <a href="' + lab.open + '" target="_blank" rel="noopener">открой методичку напрямую</a></div>';
    });
}

function materialCard(n, title, desc, href) {
  var inner =
    '<span class="lab-material-num mono">' + n + '</span>' +
    '<span class="lab-material-body"><span class="lab-material-title">' + escapeHtml(title) + '</span>' +
    '<span class="lab-material-desc">' + escapeHtml(desc) + '</span></span>' +
    '<span class="lab-material-arrow">' + (href ? '↗' : '—') + '</span>';
  return href
    ? '<a href="' + href + '" target="_blank" rel="noopener" class="lab-material">' + inner + '</a>'
    : '<span class="lab-material" style="opacity:.5;cursor:not-allowed">' + inner + '</span>';
}

// Вертикальные табы «Чему вы научитесь» — только у лаб с полем learn.
function renderLearn(lab) {
  if (!lab.learn || !lab.learn.length) return '';
  var tabs = lab.learn.map(function (t, n) {
    return '<button type="button" role="tab" id="learn-tab-' + n + '" class="lab-learn-tab" aria-controls="learn-panel" aria-selected="' + (n === 0) + '" tabindex="' + (n === 0 ? 0 : -1) + '" data-i="' + n + '">' +
      '<span class="lab-learn-tab-num mono">' + String(n + 1).padStart(2, '0') + '</span>' +
      '<span class="lab-learn-tab-name">' + escapeHtml(t.tab) + '</span></button>';
  }).join('');
  return '<section id="learn" class="lab-section">' +
    '<div class="lab-kicker mono">02 / навыки</div>' +
    '<h2 class="lab-h2 display">Чему вы научитесь</h2>' +
    '<div class="lab-learn">' +
      '<div class="lab-learn-tabs" role="tablist" aria-orientation="vertical" aria-label="Темы лабы">' + tabs + '</div>' +
      '<div class="lab-learn-panel" id="learn-panel" role="tabpanel" aria-live="polite"></div>' +
    '</div></section>';
}

function initLearn(lab) {
  if (!lab.learn) return;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.lab-learn-tab'));
  var panel = document.getElementById('learn-panel');
  if (!tabs.length || !panel) return;
  function show(n, focus) {
    var t = lab.learn[n];
    tabs.forEach(function (b, k) {
      b.setAttribute('aria-selected', String(k === n));
      b.tabIndex = k === n ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', 'learn-tab-' + n);
    panel.innerHTML =
      '<h3 class="lab-learn-title display">' + escapeHtml(t.title) + '</h3>' +
      '<p class="lab-learn-text">' + escapeHtml(t.text) + '</p>' +
      '<ul class="lab-learn-points">' + t.points.map(function (x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('') + '</ul>' +
      (t.code ? '<pre class="lab-learn-code"><code>' + escapeHtml(t.code) + '</code></pre>' : '');
    panel.classList.remove('is-in'); void panel.offsetWidth; panel.classList.add('is-in');
    if (focus) tabs[n].focus();
  }
  tabs.forEach(function (b, n) {
    b.addEventListener('click', function () { show(n); });
    b.addEventListener('keydown', function (e) {
      var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); show((n + d + tabs.length) % tabs.length, true); }
      else if (e.key === 'Home') { e.preventDefault(); show(0, true); }
      else if (e.key === 'End') { e.preventDefault(); show(tabs.length - 1, true); }
    });
  });
  show(0);
}

// Плитки стека: на тач-экранах переворот по тапу.
function initTiles() {
  Array.prototype.forEach.call(document.querySelectorAll('.lab-tile.can-flip'), function (t) {
    t.addEventListener('click', function () { t.classList.toggle('is-flip'); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.classList.toggle('is-flip'); }
    });
  });
}

function renderLabPage(key) {
  var i = LABS.findIndex(function (l) { return l.key === key; });
  if (i < 0) i = 0;
  var lab = LABS[i];
  var prev = LABS[(i - 1 + LABS.length) % LABS.length];
  var next = LABS[(i + 1) % LABS.length];
  activeLab = lab;

  var rgb = hexToRgb(lab.accent).join(',');
  var accentSoft = mixWithWhite(lab.accent, .55);
  var accentBorder = 'rgba(' + rgb + ',.55)';

  document.title = lab.title + ' — ANITECH';

  var root = document.documentElement;
  root.style.setProperty('--accent', lab.accent);
  root.style.setProperty('--accent-soft', accentSoft);
  root.style.setProperty('--accent-border', accentBorder);
  root.style.setProperty('--title-shadow', '0 0 40px rgba(' + rgb + ',.5)');
  root.style.setProperty('--hero-glow',
    'radial-gradient(60% 55% at 18% 5%, rgba(' + rgb + ',.28), transparent 70%), ' +
    'radial-gradient(45% 45% at 92% 35%, rgba(' + rgb + ',.14), transparent 70%)');
  root.style.setProperty('--pager-accent', lab.accent);

  var topics = parseTopics(lab.desc, lab.accent);
  var marqueeText = lab.titleMain + ' lab · ' + lab.stack.join(' · ') + ' · ';

  var openHtml = lab.open
    ? '<a href="' + lab.open + '" target="_blank" rel="noopener" class="lab-btn lab-btn-primary mono">Открыть методичку</a>'
    : '<span class="lab-btn lab-btn-primary mono" style="opacity:.5;cursor:not-allowed">Методичка скоро</span>';

  document.getElementById('lab-root').innerHTML =
    '<nav class="lab-nav">' +
      '<div class="lab-nav-brand">' +
        '<a href="../index.html" class="display lab-nav-title" data-pl-name="ANITECH" data-pl-color="#ff2e88">' + escapeHtml(lab.title) + '</a>' +
      '</div>' +
      '<div class="lab-nav-links mono">' +
        '<a href="../index.html#works" data-pl-name="ANITECH" data-pl-color="#ff2e88">← все работы</a>' +
        '<a href="' + lab.repo + '" target="_blank" rel="noopener" class="lab-nav-cta">репозиторий ↗</a>' +
      '</div>' +
    '</nav>' +

    '<section class="lab-hero">' +
      '<div class="lab-hero-glow"></div>' +
      '<div class="lab-hero-grid">' +
        '<div>' +
          '<div class="lab-eyebrow mono">' +
            '<span class="lab-eyebrow-index"><span class="lab-dot"></span>лабораторная ' + String(i + 1).padStart(2, '0') + ' / ' + LABS.length + '</span>' +
          '</div>' +
          '<h1 class="lab-title display">' +
            '<span class="accent-word">' + escapeHtml(lab.titleMain) + '</span> <span class="outline-word">lab</span>' +
          '</h1>' +
          '<p class="lab-subtitle">' + escapeHtml(lab.subtitle) + '</p>' +
          '<p class="lab-desc">' + escapeHtml(lab.desc) + '</p>' +
          '<div class="lab-hero-actions">' +
            openHtml +
            '<a href="#inside" class="lab-btn lab-btn-outline mono">что внутри ↓</a>' +
          '</div>' +
        '</div>' +
        '<div class="lab-hero-image">' +
          '<img src="images/thumbs/' + lab.key + '.webp" data-full="' + lab.image + '" alt="' + escapeHtml(lab.title) + '" decoding="async" width="1200" height="1200">' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<div class="lab-marquee"><div class="lab-marquee-track display">' +
      '<span>' + escapeHtml(marqueeText) + '</span><span>' + escapeHtml(marqueeText) + '</span>' +
    '</div></div>' +

    '<div class="lab-stats">' +
      '<div class="lab-stat"><div class="lab-stat-label mono">сложность</div><div class="lab-stat-value accent display">' + escapeHtml(lab.difficulty) + '</div></div>' +
      '<div class="lab-stat"><div class="lab-stat-label mono">тем внутри</div><div class="lab-stat-value accent-soft display">' + topics.length + '</div></div>' +
      '<div class="lab-stat"><div class="lab-stat-label mono">формат</div><div class="lab-stat-value display">git submodule</div></div>' +
    '</div>' +

    '<section id="inside" class="lab-section">' +
      '<div class="lab-inside-grid">' +
        '<div>' +
          '<div class="lab-kicker mono">01 / программа</div>' +
          '<h2 class="lab-h2 display">Что внутри</h2>' +
          (lab.open
            ? '<button type="button" id="lab-toc-btn" class="lab-btn lab-btn-outline mono" onclick="openToc()">Показать оглавление</button>'
            : '') +
        '</div>' +
        '<div class="lab-topics">' +
          topics.map(function (t) {
            return '<div class="lab-topic"><span class="lab-topic-num">' + t.num + '</span><span class="lab-topic-text">' + escapeHtml(t.text) + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    (lab.open
      ? '<div id="lab-toc-modal" class="lab-toc-modal">' +
          '<div class="lab-toc-modal-backdrop" onclick="closeToc()"></div>' +
          '<div class="lab-toc-modal-box">' +
            '<div class="lab-toc-modal-head">' +
              '<h3 class="lab-toc-modal-title display">Оглавление</h3>' +
              '<button type="button" class="lab-toc-modal-close" onclick="closeToc()" aria-label="Закрыть">✕</button>' +
            '</div>' +
            '<div id="lab-toc-panel" class="lab-toc-modal-body"></div>' +
          '</div>' +
        '</div>'
      : '') +

    renderLearn(lab) +

    '<section class="lab-section-alt"><div class="lab-section-inner">' +
      '<div class="lab-kicker mono">' + (lab.learn ? '03' : '02') + ' / стек</div>' +
      '<h2 class="lab-h2 display">Технологии в этой работе</h2>' +
      '<div class="lab-bento">' +
        lab.stack.map(function (name, n) {
          var info = (lab.stackInfo && lab.stackInfo[n]) || {};
          var flip = !!info.back;
          return '<div class="lab-tile' + (flip ? ' can-flip' : '') + '"' + (flip ? ' tabindex="0"' : '') + ' style="--i:' + n + '">' +
            '<div class="lab-tile-in">' +
              '<div class="lab-tile-face lab-tile-front"><span class="lab-tile-num mono">' + String(n + 1).padStart(2, '0') + '</span>' +
                '<span class="lab-tile-name">' + escapeHtml(name) + '</span>' +
                (info.tag ? '<small class="mono">' + escapeHtml(info.tag) + '</small>' : '') + '</div>' +
              (flip ? '<div class="lab-tile-face lab-tile-back"><span>' + escapeHtml(info.back) + '</span></div>' : '') +
            '</div></div>';
        }).join('') +
      '</div>' +
    '</div></section>' +

    '<section id="materials" class="lab-section">' +
      '<div class="lab-kicker mono">' + (lab.learn ? '04' : '03') + ' / материалы</div>' +
      '<h2 class="lab-h2 display">С чего начать</h2>' +
      '<div class="lab-materials">' +
        (lab.open
          ? materialCard('1', 'методичка', 'Откройте и идите по шагам: код → зачем → команда → ожидаемый результат → проверь себя. Прогресс галочек сохраняется в браузере.', lab.open)
          : materialCard('1', 'методичка скоро', 'Методичка ещё в подготовке — загляните позже.', '')) +
        materialCard('2', 'репозиторий лабы', 'Открытый репозиторий лабы: README со статусом и исходники. Можно клонировать и запускать у себя.', lab.repo) +
        materialCard('3', 'история коммитов', 'Как развивалась лаба: каждое изменение методички и кода — отдельный коммит, всё видно по порядку.', lab.repo + '/commits/main') +
      '</div>' +
    '</section>' +

    '<section class="lab-pager"><div class="lab-pager-grid">' +
      '<a href="' + prev.key + '.html" class="lab-pager-link" data-pl-name="' + escapeHtml(prev.title) + '" data-pl-color="' + prev.accent + '" style="--pager-accent:' + prev.accent + '">' +
        '<span class="lab-pager-kicker mono">← предыдущая</span>' +
        '<span class="lab-pager-title display">' + escapeHtml(prev.title) + '</span>' +
      '</a>' +
      '<a href="' + next.key + '.html" class="lab-pager-link next" data-pl-name="' + escapeHtml(next.title) + '" data-pl-color="' + next.accent + '" style="--pager-accent:' + next.accent + '">' +
        '<span class="lab-pager-kicker mono">следующая →</span>' +
        '<span class="lab-pager-title display">' + escapeHtml(next.title) + '</span>' +
      '</a>' +
    '</div></section>' +

    '<footer class="lab-footer mono">' +
      '<span>ANITECH · обучающая платформа</span>' +
      '<span class="lab-footer-git"><span class="lab-spinner"></span>git submodules</span>' +
    '</footer>';

  initNavAutoHide();
  initLearn(lab);
  initTiles();
  if (window.FlipGallery) FlipGallery.init('.lab-hero-image img');

  if (window.PageLoader) PageLoader.enter(lab.title, lab.accent);
}
