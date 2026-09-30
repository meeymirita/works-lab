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
