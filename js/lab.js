var LABS = [
  {
    key: 'rabbitmq',
    titleMain: 'rabbitmq',
    title: 'RabbitMQ Lab',
    subtitle: 'Transactional Outbox, воркеры, DLQ',
    desc: 'Асинхронная обработка заказов через очереди: Transactional Outbox, идемпотентный consumer, prefetch, crash-тесты, retry с TTL→DLX, priority queues, fanout.',
    stack: ['Laravel 13', 'PostgreSQL 18', 'RabbitMQ', 'Mailpit'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/rabbitmq/rabbitmq.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/rabbitmq/rabbitmq.html',
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
    sessions: [
      {
        "h": "~3 ч",
        "t": "Инфраструктура, топология, happy path",
        "r": "Заказ проходит путь API, outbox, relay, orders.topic и три воркера"
      },
      {
        "h": "~3,5 ч",
        "t": "Надёжность: ack, prefetch, retry, идемпотентность",
        "r": "Три competing consumers, crash-тест без двойного списания и retry-цепочка до DLQ"
      },
      {
        "h": "~3 ч",
        "t": "Priority, Fanout, Production Hell",
        "r": "Приоритетные заказы, fanout-рассылка и починенные сломанные сценарии"
      }
    ],
    arch: {
      "title": "Жизненный цикл заказа",
      "rows": [
        {
          "label": "Laravel 13 API",
          "boxes": [
            "POST /api/orders",
            "OrderController"
          ]
        },
        {
          "label": "PostgreSQL 18 (одна транзакция)",
          "boxes": [
            "orders",
            "outbox_messages"
          ]
        },
        {
          "label": "worker:outbox-relay",
          "boxes": [
            "publish + publisher confirm"
          ]
        },
        {
          "label": "RabbitMQ 4",
          "boxes": [
            "orders.topic",
            "order.queue",
            "email.queue",
            "analytics.queue"
          ]
        },
        {
          "label": "Воркеры (Artisan)",
          "boxes": [
            "worker:order ×3",
            "worker:email + retry → DLQ",
            "worker:analytics"
          ]
        }
      ],
      "note": "Обратный путь: при сбое SMTP воркер кладёт копию в email.retry.N, по истечении TTL DLX возвращает её в email.queue, а после третьей попытки сообщение уходит в email.dlq.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "Laravel · PostgreSQL",
            "x": 14,
            "w": 190
          },
          {
            "t": "RabbitMQ 4",
            "x": 250,
            "w": 430
          },
          {
            "t": "воркеры (Artisan)",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "api",
            "t": "POST /api/orders",
            "s": "OrderController",
            "x": 110,
            "y": 110,
            "d": "API принимает заказ и в одной транзакции пишет Order и запись в outbox."
          },
          {
            "id": "pg",
            "t": "PostgreSQL",
            "s": "orders + outbox_messages",
            "x": 110,
            "y": 270,
            "d": "Заказ и событие коммитятся атомарно: так закрыта проблема dual write между БД и брокером."
          },
          {
            "id": "relay",
            "t": "outbox-relay",
            "s": "publish + confirm",
            "x": 110,
            "y": 430,
            "d": "Отдельный контейнер раз в секунду берёт pending-строки, публикует в orders.topic и после publisher confirm ставит sent."
          },
          {
            "id": "topic",
            "t": "orders.topic",
            "s": "topic exchange",
            "x": 350,
            "y": 270,
            "d": "Маршрутизирует по routing key order.created / order.*: тело хранится один раз, очереди получают копии."
          },
          {
            "id": "oq",
            "t": "order.queue",
            "s": "order.created · prio 10",
            "x": 570,
            "y": 130,
            "d": "Очередь с x-max-priority=10, на неё подписаны три воркера-конкурента."
          },
          {
            "id": "eq",
            "t": "email.queue",
            "s": "order.created",
            "x": 570,
            "y": 270,
            "d": "Очередь для письма «заказ оформлен»; при сбое воркер уводит сообщение в retry-цепочку."
          },
          {
            "id": "aq",
            "t": "analytics.queue",
            "s": "order.* → order_events",
            "x": 570,
            "y": 410,
            "d": "Ловит все статусы жизненного цикла; воркер пишет строку в order_events."
          },
          {
            "id": "wo",
            "t": "worker:order ×3",
            "s": "резерв стока",
            "x": 800,
            "y": 130,
            "d": "Проверяет идемпотентность по processed_messages, резервирует товар и подтверждает ack; prefetch задаёт баланс между воркерами."
          },
          {
            "id": "we",
            "t": "worker:email",
            "s": "Mailpit · retry",
            "x": 800,
            "y": 270,
            "d": "Шлёт письмо в Mailpit; при исключении публикует копию в email.retry.N с x-retry-count и подтверждает оригинал."
          },
          {
            "id": "retry",
            "t": "retry.1–3 → DLQ",
            "s": "TTL 10 с / 30 с / 5 мин",
            "x": 350,
            "y": 430,
            "d": "Три очереди с TTL и DLX email.dlx: по истечении TTL сообщение возвращается в email.queue, после третьей попытки идёт в email.dlq."
          }
        ],
        "edges": [
          {
            "a": "api",
            "b": "pg"
          },
          {
            "a": "pg",
            "b": "relay"
          },
          {
            "a": "relay",
            "b": "topic"
          },
          {
            "a": "topic",
            "b": "oq"
          },
          {
            "a": "topic",
            "b": "eq"
          },
          {
            "a": "topic",
            "b": "aq"
          },
          {
            "a": "oq",
            "b": "wo"
          },
          {
            "a": "eq",
            "b": "we"
          },
          {
            "a": "we",
            "b": "retry"
          },
          {
            "a": "retry",
            "b": "eq",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "api",
            "txt": "POST /api/orders с товарами."
          },
          {
            "n": "pg",
            "txt": "В одной транзакции orders и outbox_messages со статусом pending."
          },
          {
            "n": "relay",
            "txt": "Релей публикует в orders.topic и ждёт publisher confirm."
          },
          {
            "n": "topic",
            "txt": "Routing key order.created копируется в очереди."
          },
          {
            "n": "eq",
            "txt": "Сообщение попадает в email.queue."
          },
          {
            "n": "we",
            "txt": "SMTP недоступен: воркер публикует копию в email.retry.N и делает ack."
          },
          {
            "n": "retry",
            "txt": "TTL истёк, RabbitMQ сам dead-letter'ит сообщение в email.dlx.",
            "back": true
          },
          {
            "n": "eq",
            "txt": "Сообщение вернулось в email.queue: следующая попытка.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Что произойдёт, если consumer умер после обработки, но до ACK?",
        "a": "Брокер узнаёт о смерти из закрытого TCP-соединения и возвращает сообщение в очередь с флагом redelivered. Новый воркер видит маркер в processed_messages, который записан в одной транзакции с эффектом, и подтверждает сообщение без повторного списания."
      },
      {
        "q": "Что такое prefetch и когда prefetch=100 вредит?",
        "a": "Prefetch ограничивает число неподтверждённых сообщений на consumer'а. При 100 быстрый воркер нахватает сотню, а медленный держит сообщения «заложниками», пока остальные простаивают; при крахе все 100 обрабатываются заново. Чем дольше обработка, тем меньше prefetch."
      },
      {
        "q": "Как сделать retry с задержкой без плагина и почему одной retry-очереди с per-message TTL мало?",
        "a": "Воркер по x-retry-count публикует копию в email.retry.1/2/3 с TTL 10 с, 30 с и 5 мин, а возврат в email.queue делают TTL и DLX. В одной очереди просроченное сообщение удаляется, только когда дойдёт до головы FIFO, и короткий TTL ждёт длинный (head-of-line blocking)."
      },
      {
        "q": "Может ли RabbitMQ гарантировать exactly-once?",
        "a": "Нет: через ненадёжную сеть подтверждение может потеряться (проблема двух генералов), поэтому доставка at-least-once. Ровно один раз можно получить только эффект: за это отвечает идемпотентный consumer с таблицей processed_messages и уникальным индексом."
      },
      {
        "q": "Какую проблему решает Outbox Pattern, которую не решает сам RabbitMQ?",
        "a": "Проблему dual write: БД и брокер не умеют коммитить атомарно, и падение между commit и publish теряет событие. Заказ и outbox-запись пишутся одной транзакцией, а релей публикует с publisher confirm. Гарантия «хотя бы раз», поэтому нужен идемпотентный consumer."
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
    stack: ['Laravel 13', 'PostgreSQL 18', 'Redis 8'],
    difficulty: 'Средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/redis/redis.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/redis/redis.html',
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
        "code": "$claimed = $redis->xautoclaim('orders:stream', 'email-cg', 'reaper', $minIdleMs = 30000, '0');\n\nforeach ($claimed['entries'] as $id => $entry) {\n    $attempts = $redis->hIncrBy(\"retry:attempts:{$id}\", 'count', 1);\n    if ($attempts > 3) {\n        $redis->xAdd('orders:dlq:stream', '*', $entry);\n        $redis->xAck('orders:stream', 'email-cg', [$id]);\n    }\n}"
      }
    ],
    sessions: [
      {
        "h": "~3 ч",
        "t": "Инфраструктура, кэш, сессии, happy path",
        "r": "Cache-Aside для карточки товара, сессии в Redis и первый consumer на Streams"
      },
      {
        "h": "~3 ч",
        "t": "Локи, rate limit, конкурентные consumers",
        "r": "Атомарный резерв стока в Lua, скользящий лимит, три воркера и crash-тест с PEL"
      },
      {
        "h": "~3 ч",
        "t": "Retry, DLQ, приоритет, Pub/Sub",
        "r": "Retry через XAUTOCLAIM, DLQ-поток, приоритетный ZSet, live-дашборд и Production Hell"
      }
    ],
    arch: {
      "title": "Путь заказа через Redis",
      "rows": [
        {
          "label": "Laravel 13 API",
          "boxes": [
            "POST /api/orders",
            "rate limit (ZSet)",
            "Lua-резерв stock:{id}"
          ]
        },
        {
          "label": "PostgreSQL 18",
          "boxes": [
            "orders + order_items (транзакция)"
          ]
        },
        {
          "label": "Redis Stream",
          "boxes": [
            "XADD orders:stream",
            "группы email-cg, analytics-cg"
          ]
        },
        {
          "label": "Воркеры",
          "boxes": [
            "worker:email ×3",
            "worker:analytics",
            "XACK + processed_messages"
          ]
        },
        {
          "label": "Сбои и события",
          "boxes": [
            "PEL → XAUTOCLAIM (reaper)",
            "orders:dlq:stream",
            "PUBLISH dashboard:orders"
          ]
        }
      ],
      "note": "Ловушка: запись, которую воркер не подтвердил, не возвращается сама, как в RabbitMQ, а навсегда остаётся в PEL, пока её не заберёт XAUTOCLAIM.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "Laravel · PostgreSQL",
            "x": 14,
            "w": 190
          },
          {
            "t": "Redis 8",
            "x": 250,
            "w": 430
          },
          {
            "t": "потребители",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "api",
            "t": "POST /api/orders",
            "s": "OrderController",
            "x": 110,
            "y": 90,
            "d": "Точка входа: принимает заказ и последовательно проходит лимит, резерв стока и запись в БД."
          },
          {
            "id": "rl",
            "t": "Rate limit",
            "s": "ZSet, скользящее окно",
            "x": 110,
            "y": 210,
            "d": "ZSet ratelimit:orders:{user_id}: не больше 5 заказов в минуту. Три команды в одном Lua-скрипте, иначе лимит становится мягким."
          },
          {
            "id": "stock",
            "t": "Lua-резерв",
            "s": "stock:{id}",
            "x": 110,
            "y": 330,
            "d": "Проверка остатка и DECRBY одной атомарной операцией. Нет товара: 409 и откат уже зарезервированного."
          },
          {
            "id": "pg",
            "t": "PostgreSQL",
            "s": "orders + order_items",
            "x": 110,
            "y": 450,
            "d": "Источник истины: заказ создаётся в транзакции, после неё в поток уходит событие."
          },
          {
            "id": "stream",
            "t": "orders:stream",
            "s": "XADD · consumer groups",
            "x": 350,
            "y": 130,
            "d": "Append-only лог: запись не удаляется при чтении. Группы email-cg и analytics-cg читают его независимо."
          },
          {
            "id": "pel",
            "t": "PEL",
            "s": "записи без XACK",
            "x": 350,
            "y": 290,
            "d": "Выдано, но не подтверждено. Если воркер умер, запись остаётся в PEL под его именем и сама не возвращается."
          },
          {
            "id": "reaper",
            "t": "worker:reaper",
            "s": "XAUTOCLAIM · 3 попытки",
            "x": 570,
            "y": 290,
            "d": "Забирает записи, провисевшие дольше 30 с, и считает попытки в hash retry:attempts:{id}."
          },
          {
            "id": "dlq",
            "t": "DLQ-поток",
            "s": "orders:dlq:stream",
            "x": 350,
            "y": 450,
            "d": "Ручной dead-letter: после трёх попыток запись копируется сюда и подтверждается в основной группе."
          },
          {
            "id": "we",
            "t": "worker:email ×3",
            "s": "email-cg · XACK",
            "x": 800,
            "y": 130,
            "d": "Competing consumers одной группы: шлют письмо в Mailpit, пишут маркер в processed_messages и подтверждают запись."
          },
          {
            "id": "pubsub",
            "t": "Pub/Sub",
            "s": "dashboard:orders",
            "x": 800,
            "y": 330,
            "d": "PUBLISH для live-дашборда: доставка только текущим подписчикам, без хранения. Для заказов используется Stream."
          }
        ],
        "edges": [
          {
            "a": "api",
            "b": "rl"
          },
          {
            "a": "rl",
            "b": "stock"
          },
          {
            "a": "stock",
            "b": "pg"
          },
          {
            "a": "pg",
            "b": "stream"
          },
          {
            "a": "stream",
            "b": "we"
          },
          {
            "a": "we",
            "b": "pel"
          },
          {
            "a": "pel",
            "b": "reaper"
          },
          {
            "a": "reaper",
            "b": "dlq"
          },
          {
            "a": "reaper",
            "b": "stream",
            "back": true
          },
          {
            "a": "stream",
            "b": "pubsub"
          }
        ],
        "flow": [
          {
            "n": "api",
            "txt": "POST /api/orders {user_id, items}."
          },
          {
            "n": "rl",
            "txt": "Лимит по user_id: превышен, ответ 429."
          },
          {
            "n": "stock",
            "txt": "Lua атомарно проверяет и списывает stock, иначе 409."
          },
          {
            "n": "pg",
            "txt": "Транзакция: orders + order_items, статус reserved."
          },
          {
            "n": "stream",
            "txt": "XADD orders:stream, событие видят обе группы."
          },
          {
            "n": "we",
            "txt": "XREADGROUP: письмо, маркер в processed_messages, XACK."
          },
          {
            "n": "pel",
            "txt": "Воркер упал до XACK: запись висит в PEL."
          },
          {
            "n": "reaper",
            "txt": "XAUTOCLAIM после 30 с возвращает запись в обработку.",
            "back": true
          },
          {
            "n": "dlq",
            "txt": "После трёх попыток запись уходит в orders:dlq:stream.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Как устроен distributed lock на SET NX PX и почему освобождать его нужно Lua-скриптом?",
        "a": "SET key value NX PX 5000 создаёт ключ, только если его не было, и он исчезает через 5 секунд, даже если процесс упал. Голый DEL опасен: процесс A мог зависнуть дольше TTL, лок взял B, и DEL от A удалит чужой лок. Lua-скрипт сравнивает уникальный токен и удаляет ключ только при совпадении."
      },
      {
        "q": "Что такое cache stampede и как лок на перестройку кэша его предотвращает?",
        "a": "Когда TTL популярного ключа истекает, сотни одновременных запросов промахиваются мимо кэша и бьют в PostgreSQL. Короткий distributed lock даёт перестроить кэш первому запросу, а остальные ждут и читают готовое или чуть устаревшее значение."
      },
      {
        "q": "Почему проверку остатка и списание нельзя делать отдельными командами GET, сравнение и DECRBY?",
        "a": "Между отдельными вызовами Redis успевает обслужить другого клиента, и два заказа оба увидят достаточный остаток. Поэтому проверка и списание выполняются одним Lua-скриптом атомарно: он возвращает -1 (нет ключа), 0 (мало) или 1 (списано)."
      },
      {
        "q": "Что такое PEL и почему зависшая запись не возвращается другому consumer'у автоматически?",
        "a": "PEL — список записей, выданных через XREADGROUP, но не подтверждённых XACK. В отличие от RabbitMQ, обрыв соединения воркера ничего не возвращает: запись висит под именем мёртвого consumer'а, пока кто-то не вызовет XCLAIM или XAUTOCLAIM с min-idle-time."
      },
      {
        "q": "Чем Pub/Sub отличается от Stream с точки зрения гарантий доставки?",
        "a": "Pub/Sub рассылает сообщение только подписчикам, которые есть в момент публикации, и нигде его не хранит. Stream персистентен и даёт PEL с подтверждениями. Поэтому Pub/Sub годится для live-дашборда, а заказы идут через Stream."
      }
    ],
    accent: '#DC382D',
  },
  {
    key: 'traefik',
    titleMain: 'traefik',
    title: 'Traefik Lab',
    subtitle: 'Reverse proxy, service discovery, TLS',
    desc: 'Reverse proxy, который сам находит контейнеры: маршруты по меткам, middleware, балансировка и canary, TLS (mkcert, ACME), TCP и UDP, наблюдаемость.',
    stack: ['Traefik v3.7', 'Docker Compose', 'Node.js', 'PostgreSQL', 'mkcert / ACME (Pebble)', 'Prometheus / Grafana'],
    difficulty: 'Низкая–средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/traefik/traefik.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/traefik/traefik.html',
    repo: 'https://github.com/meeymirita/traefik-lab',
    stackInfo: [
      {
        "tag": "прокси",
        "back": "Единая точка входа: роутинг по меткам, middlewares, TLS, HTTP/3, балансировка и выкатка."
      },
      {
        "tag": "окружение",
        "back": "Стек из нескольких сервисов, которые Traefik находит по меткам Docker; один файл Compose на проект."
      },
      {
        "tag": "бэкенд",
        "back": "CoffeeShop API с учебными адресами: /health, /info, /slow, /flaky, /drop, Idempotency-Key."
      },
      {
        "tag": "база данных",
        "back": "PostgreSQL 18 и Adminer за прокси; база доступна через TCP-роутер с TLS."
      },
      {
        "tag": "TLS",
        "back": "Локальный HTTPS через mkcert и mTLS; автоматические сертификаты ACME проверяются на тестовом сервере Pebble."
      },
      {
        "tag": "наблюдаемость",
        "back": "Журнал доступа в JSON, метрики Prometheus и дашборд Grafana (RED), трассировка в Jaeger."
      }
    ],
    learn: [
      {
        "tab": "Модель Traefik",
        "title": "Путь запроса: вход → роутер → middleware → сервис",
        "text": "Статическая конфигурация (traefik.yml) читается при запуске, динамическая (метки контейнеров, файлы) — на лету. Первый вопрос при любой поломке: чей это ответ — Traefik или приложения.",
        "points": [
          "404 page not found — роутер не найден; 502/503/504 — проблема сервиса",
          "exposedByDefault: false и traefik.enable=true",
          "Дашборд и журнал показывают, как Traefik понял метки"
        ],
        "code": "Клиент → EntryPoint (:80/:443) → Router (rule) → [Middlewares] → Service → контейнеры"
      },
      {
        "tab": "Метки",
        "title": "Маршрут одной строкой на контейнере",
        "text": "Метки читаются слева направо: протокол, тип объекта, имя, поле. Имена общие на весь Traefik — добавляй префикс проекта. Знак $ в метках Compose удваивают.",
        "points": [
          "Host(), PathPrefix(), Header(), Method() и их комбинации",
          "Приоритет по умолчанию — длина правила",
          "stripprefix, redirect, headers, basicAuth подключаются к роутеру списком"
        ],
        "code": "labels:\n  - traefik.enable=true\n  - traefik.http.routers.coffee-api.rule=Host(`shop.localhost`) && PathPrefix(`/api`)\n  - traefik.http.routers.coffee-api.entrypoints=websecure\n  - traefik.http.routers.coffee-api.tls=true\n  - traefik.http.routers.coffee-api.middlewares=coffee-strip\n  - traefik.http.middlewares.coffee-strip.stripprefix.prefixes=/api\n  - traefik.http.services.coffee-api.loadbalancer.server.port=3000"
      },
      {
        "tab": "Защита",
        "title": "Лимиты, повторы, предохранитель",
        "text": "rateLimit режет частоту, inFlightReq — параллельность, ipAllowList — адреса. retry повторяет запрос, только если не удалось соединиться, а circuitBreaker сам отвечает 503, когда сервис болен.",
        "points": [
          "429 с заголовком Retry-After",
          "Повтор POST без ключа идемпотентности создаёт дубли",
          "Подделка X-Forwarded-For: trustedIPs только для своих прокси"
        ],
        "code": "- traefik.http.middlewares.coffee-limit.ratelimit.average=20\n- traefik.http.middlewares.coffee-limit.ratelimit.burst=40\n- traefik.http.middlewares.cb.circuitbreaker.expression=ResponseCodeRatio(500, 600, 0, 600) > 0.5"
      },
      {
        "tab": "Выкатка",
        "title": "Healthcheck, canary и blue/green",
        "text": "Несколько копий сервиса Traefik балансирует по кругу, больных исключает healthcheck. Для canary и blue/green составной сервис с весами описывается в файле и меняется без перезапуска.",
        "points": [
          "Round robin, sticky cookie",
          "Weighted: 90/10 → 50/50 → 0/100",
          "Mirroring: копия трафика на новую версию"
        ],
        "code": "http:\n  services:\n    shop-canary:\n      weighted:\n        services:\n          - name: canary-v1@docker\n            weight: 90\n          - name: canary-v2@docker\n            weight: 10"
      },
      {
        "tab": "TLS и ACME",
        "title": "mkcert, mTLS и автоматические сертификаты",
        "text": "Локально HTTPS даёт mkcert; для настоящего домена Traefik сам заказывает сертификаты по ACME (HTTP-01, TLS-ALPN-01, DNS-01 для wildcard). Отлаживай на staging, acme.json держи на томе с правами 600.",
        "points": [
          "TLS options: minVersion, sniStrict, клиентские сертификаты (mTLS)",
          "Wildcard — только DNS-01; токены DNS-провайдера вне git",
          "HTTP/3 — http3: {} и порт 443/udp"
        ],
        "code": "certificatesResolvers:\n  le:\n    acme:\n      email: admin@example.com\n      storage: /letsencrypt/acme.json\n      caServer: https://acme-staging-v02.api.letsencrypt.org/directory\n      httpChallenge:\n        entryPoint: web"
      }
    ],
    sessions: [
      {
        "h": "~3,5 ч",
        "t": "Азбука: прокси, HTTP, TLS",
        "r": "Азбука прокси, HTTP и TLS; стенд CoffeeShop на трёх портах, имена *.localhost"
      },
      {
        "h": "~3,5 ч",
        "t": "Установка и первый маршрут",
        "r": "Traefik в Docker, первый маршрут whoami по меткам, дашборд, диагностика «404 / 502 / 504»"
      },
      {
        "h": "~4 ч",
        "t": "Docker provider и правила маршрутизации",
        "r": "Docker provider: правила Host/Path/Header, приоритеты, сети и порты; CoffeeShop за одним входом"
      },
      {
        "h": "~4 ч",
        "t": "Middlewares: преобразование запросов",
        "r": "Middlewares: StripPrefix, redirect, headers и CORS, compress, basicAuth, chain, общий файл; защита дашборда и Adminer"
      },
      {
        "h": "~4 ч",
        "t": "Надёжность и защита",
        "r": "rateLimit, inFlightReq, ipAllowList, retry, circuitBreaker, forwardAuth; нагрузка k6 и повтор небезопасных запросов"
      },
      {
        "h": "~4 ч",
        "t": "Балансировка и выкатка",
        "r": "Балансировка, healthcheck, sticky, canary 90/10, mirroring, blue/green и «все копии больны»"
      },
      {
        "h": "~4 ч",
        "t": "TLS, часть 1: локальные сертификаты",
        "r": "TLS: рукопожатие, mkcert, websecure, редирект на HTTPS, TLS options и mTLS"
      },
      {
        "h": "~4 ч",
        "t": "TLS, часть 2: Let’s Encrypt",
        "r": "ACME: HTTP-01, TLS-ALPN-01, DNS-01 и wildcard на тестовом сервере Pebble, секреты, HTTP/3, переезд на сервер"
      },
      {
        "h": "~4 ч",
        "t": "TCP/UDP, файловый провайдер, IP клиента",
        "r": "Сервис вне Docker, TCP (PostgreSQL) и UDP (DNS), реальный IP клиента, плагин на Go, миграция v2 → v3"
      },
      {
        "h": "~4 ч",
        "t": "Наблюдаемость и итоговый проект",
        "r": "Журнал JSON, метрики Prometheus и Grafana, трассировка, дерево вопросов, итоговый стек с up.sh и smoke.sh, Production Hell"
      },
      {
        "h": "~4 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без ответа: партнёрский API с mTLS, лимитами, выкаткой по метрикам и наблюдаемостью"
      }
    ],
    arch: {
      "title": "Путь запроса через Traefik",
      "rows": [
        {
          "label": "Клиент",
          "boxes": [
            "браузер https://shop.localhost",
            "TLS: mkcert / Let's Encrypt"
          ]
        },
        {
          "label": "Traefik v3.7",
          "boxes": [
            "EntryPoints web :80 / websecure :443",
            "Providers: docker labels + file"
          ]
        },
        {
          "label": "Маршрутизация",
          "boxes": [
            "Router Host(`shop.localhost`)&&PathPrefix(`/api`)",
            "Middlewares: strip → ratelimit"
          ]
        },
        {
          "label": "Сервис",
          "boxes": [
            "Service api: round robin + /health",
            "api ×2 (Node :3000)"
          ]
        },
        {
          "label": "Сеть back",
          "boxes": [
            "PostgreSQL",
            "Adminer"
          ]
        }
      ],
      "note": "Обратный путь: ответ идёт теми же ступенями назад, Traefik добавляет X-Forwarded-For; типичная ловушка — неверный port в loadbalancer.server.port даёт 502.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "снаружи",
            "x": 14,
            "w": 190
          },
          {
            "t": "Traefik v3.7",
            "x": 250,
            "w": 430
          },
          {
            "t": "сеть back",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "browser",
            "t": "Браузер",
            "s": "https://shop.localhost",
            "x": 110,
            "y": 150,
            "d": "Отправляет GET /users/42 на домен, который резолвится на Traefik."
          },
          {
            "id": "tls",
            "t": "mkcert / ACME",
            "s": "tls.yml · acme.json",
            "x": 110,
            "y": 350,
            "d": "Сертификаты для websecure: mkcert локально, Let's Encrypt (сначала staging) для реального домена."
          },
          {
            "id": "ep",
            "t": "EntryPoints",
            "s": "web :80, websecure :443",
            "x": 350,
            "y": 110,
            "d": "Слушающие порты. На websecure TLS завершается, контейнеры про HTTPS не знают."
          },
          {
            "id": "prov",
            "t": "Providers",
            "s": "docker labels · file",
            "x": 350,
            "y": 270,
            "d": "Docker provider читает метки контейнеров (exposedByDefault: false), файловый провайдер даёт общие middlewares, TLS и веса из traefik/dynamic."
          },
          {
            "id": "rt",
            "t": "Router",
            "s": "Host(`shop.localhost`)",
            "x": 570,
            "y": 110,
            "d": "Правило Host/PathPrefix; при нескольких совпадениях побеждает более специфичное или с явным priority."
          },
          {
            "id": "mw",
            "t": "Middlewares",
            "s": "strip → ratelimit",
            "x": 570,
            "y": 270,
            "d": "Цепочка выполняется по порядку: coffee-strip, затем coffee-limit (average 20, burst 40)."
          },
          {
            "id": "svc",
            "t": "Service api",
            "s": "round robin + /health",
            "x": 350,
            "y": 430,
            "d": "Балансировщик выбирает здоровую реплику; healthcheck исключает зависшую. Для canary сюда ставят weighted service."
          },
          {
            "id": "api",
            "t": "api × 2",
            "s": "Node :3000",
            "x": 800,
            "y": 170,
            "d": "Реплики (deploy.replicas: 2); отвечают servedBy с hostname контейнера."
          },
          {
            "id": "db",
            "t": "PostgreSQL",
            "s": "сеть back",
            "x": 800,
            "y": 380,
            "d": "База только во внутренней сети back: Traefik в неё не входит и сам не ходит к базе (TCP-роутер подключается отдельно и по желанию)."
          }
        ],
        "edges": [
          {
            "a": "browser",
            "b": "ep"
          },
          {
            "a": "tls",
            "b": "ep"
          },
          {
            "a": "ep",
            "b": "rt"
          },
          {
            "a": "prov",
            "b": "rt"
          },
          {
            "a": "rt",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "svc"
          },
          {
            "a": "svc",
            "b": "api"
          },
          {
            "a": "api",
            "b": "db"
          },
          {
            "a": "svc",
            "b": "ep",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "browser",
            "txt": "GET https://api.localhost/users/42."
          },
          {
            "n": "ep",
            "txt": "EntryPoint websecure :443, TLS завершается здесь."
          },
          {
            "n": "rt",
            "txt": "Router находит правило Host(`shop.localhost`)."
          },
          {
            "n": "mw",
            "txt": "Цепочка secure-headers → api-ratelimit."
          },
          {
            "n": "svc",
            "txt": "Round robin выбирает здоровую реплику по /health."
          },
          {
            "n": "api",
            "txt": "Реплика api обрабатывает запрос, при необходимости ходит в PostgreSQL."
          },
          {
            "n": "svc",
            "txt": "Ответ возвращается в Service.",
            "back": true
          },
          {
            "n": "ep",
            "txt": "Traefik добавляет X-Forwarded-For и шифрует ответ.",
            "back": true
          },
          {
            "n": "browser",
            "txt": "Браузер получает ответ по HTTPS.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Зачем нужен exposedByDefault=false и что будет, если его не выставить?",
        "a": "По умолчанию Traefik готов создать маршрут для любого контейнера в сети даже без единой метки, по первому открытому порту. В проекте с десятком контейнеров это даёт случайные незапланированные роуты (вплоть до базы данных), поэтому каждый сервис включают явно меткой traefik.enable=true."
      },
      {
        "q": "Почему порядок middlewares в цепочке важен?",
        "a": "Они выполняются строго в порядке перечисления в router.middlewares. Если сначала срезать префикс, а потом дописать другой, получится не то же самое, что наоборот (в лабе — две цепочки из одних и тех же станций с разным результатом). Ошибка порядка не видна ни в дашборде, ни в журнале ошибок — только в том, что получил бэкенд."
      },
      {
        "q": "Когда retry повторяет запрос, а когда нет, и почему повтор POST опасен?",
        "a": "Traefik повторяет запрос к другой копии, только если не удалось соединиться с выбранной (мёртвая реплика). Если запрос уже дошёл до бэкенда, повтора нет. Но клиенты и библиотеки повторяют сами: POST без ключа идемпотентности создаёт дубли, поэтому клиент присылает Idempotency-Key, а сервер не выполняет операцию дважды."
      },
      {
        "q": "Как устроен canary-деплой и как откатиться?",
        "a": "Две версии объявляются отдельными сервисами и оборачиваются в weighted-сервис в файловой конфигурации (например, 90 и 10). Веса меняются без перезапуска Traefik: 90/10, 50/50, 0/100. Откат — та же правка в обратную сторону (вес 0 у новой версии)."
      },
      {
        "q": "Какие три причины стоят за certificate verify failed?",
        "a": "Имя (адрес не входит в SAN сертификата, Traefik отдал запасной TRAEFIK DEFAULT CERT), срок (сертификат истёк) и доверие (клиент не знает удостоверяющий центр). Одна команда curl -v показывает, какой сертификат пришёл и что в нём не так."
      },
      {
        "q": "Что такое HTTP-01, TLS-ALPN-01 и DNS-01 и когда нужен wildcard?",
        "a": "Это три способа доказать владение именем при выдаче сертификата: файл на порту 80, особый сертификат на порту 443 и TXT-запись в DNS. Wildcard (*.example.com) выдаётся только по DNS-01. Отлаживать нужно на staging (у Let's Encrypt жёсткие лимиты); в лабе вместо него тестовый сервер Pebble."
      },
      {
        "q": "Почему широкий trustedIPs превращает ограничение по IP в формальность?",
        "a": "Если вход доверяет заголовку X-Forwarded-For от всей частной сети, клиент сам присылает нужный адрес, и ipAllowList пропускает его. Доверенными должны быть только адреса своих прокси, а ipStrategy.depth должен совпадать с реальным числом прокси перед Traefik; админку дополнительно закрывают паролем, mTLS или forwardAuth."
      },
      {
        "q": "Как по коду ответа понять, где искать причину?",
        "a": "000 — имя, порт или TLS; 404 с текстом page not found — Traefik не нашёл роутер (правило, вход, приоритет, метки); 401/403/429 — отказал middleware; 502 — сервис не отвечает на порту; 503 — нет здоровых копий или разомкнут предохранитель; 504 — Traefik не достучался по сети. Первый вопрос всегда: чей это ответ, Traefik или приложения."
      }
    ],
    accent: '#14B8A6',
  },
  {
    key: 'caddy',
    titleMain: 'caddy',
    title: 'Caddy Lab',
    subtitle: 'Edge — веб-сервер и reverse proxy с автоматическим HTTPS',
    desc: 'Один Caddy перед сайтом, API, WebSocket и PHP: Caddyfile вместо nginx + certbot, HTTPS из коробки, балансировка, безопасность, своя сборка через xcaddy.',
    stack: ['Caddy 2.11.7', 'Docker Compose', 'Node.js 24', 'PHP 8.4-FPM', 'xcaddy / Go'],
    difficulty: 'Средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/caddy/caddy-server.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/caddy/caddy.html',
    repo: 'https://github.com/meeymirita/caddy-lab',
    stackInfo: [
      {
        "tag": "прокси",
        "back": "Caddy 2.11.7: Caddyfile и JSON-конфиг, Admin API, метрики и логи — один бинарник вместо nginx + certbot."
      },
      {
        "tag": "HTTPS",
        "back": "Автоматический TLS из коробки: локальный CA, Let's Encrypt, ZeroSSL, On-Demand TLS и DNS-01 через плагин Cloudflare."
      },
      {
        "tag": "бэкенды",
        "back": "Проект Edge: два экземпляра API на Node 24, WebSocket-эхо (RFC 6455), поток событий SSE и отдельный сервис для forward_auth."
      },
      {
        "tag": "PHP",
        "back": "PHP 8.4-FPM через FastCGI (php_fastcgi); в теории разобраны ещё Laravel и FrankenPHP."
      },
      {
        "tag": "модули",
        "back": "Caddy собирается под себя через xcaddy — свои и сторонние плагины на Go."
      }
    ],
    learn: [
      {
        "tab": "Caddyfile",
        "title": "Один файл вместо nginx + certbot",
        "text": "Caddyfile без расширения в текущей папке caddy run подхватывает сам. admin off отключает Admin API, если он не нужен прямо сейчас — иначе через него же идут start/stop.",
        "points": [
          "caddy run — без аргументов, Caddyfile из текущей папки",
          "admin off, если Admin API не нужен",
          "caddy start/stop — фон, управление через Admin API"
        ],
        "code": ":8080 {\n\trespond \"Hello from Caddyfile\"\n}\n\ncaddy run\ncurl localhost:8080"
      },
      {
        "tab": "Reverse proxy",
        "title": "handle: часть путей на бэкенд, остальное — статика",
        "text": "handle /api/* перехватывает только свой префикс, второй handle без пути — всё остальное отдаёт file_server. Порядок блоков handle друг друга не перекрывает, в отличие от route.",
        "points": [
          "handle /api/* { reverse_proxy ... }",
          "handle { file_server } — всё остальное",
          "root * задаёт корень для статики"
        ],
        "code": ":8080 {\n\troot * site\n\thandle /api/* {\n\t\treverse_proxy localhost:3001\n\t}\n\thandle {\n\t\tfile_server\n\t}\n}"
      },
      {
        "tab": "WebSocket",
        "title": "Проксируется без единой спецнастройки",
        "text": "reverse_proxy сам распознаёт заголовки Upgrade/Connection и держит двусторонний поток — отдельной директивы под WebSocket в Caddy нет.",
        "points": [
          "Тот же reverse_proxy, что и для HTTP",
          "Upgrade/Connection подхватываются автоматически",
          "Проверяется обычным WebSocket-клиентом"
        ],
        "code": "handle /ws {\n\treverse_proxy localhost:3100\n}"
      },
      {
        "tab": "Автоматический HTTPS",
        "title": "Домены .localhost без единой настройки TLS",
        "text": "Без единой строчки про сертификаты app.localhost и api.localhost уже на HTTPS — Caddy сам решает, локальный CA это или настоящий ACME, по имени домена.",
        "points": [
          "auto_https включён по умолчанию",
          "80/443 требуют прав — sudo или setcap",
          ".localhost резолвится в локальный CA"
        ],
        "code": "app.localhost {\n\troot * site\n\tfile_server\n}\n\napi.localhost {\n\treverse_proxy localhost:3001\n}"
      },
      {
        "tab": "Балансировка",
        "title": "round_robin между несколькими адресами",
        "text": "reverse_proxy принимает несколько адресов сразу — lb_policy задаёт стратегию. Без неё уже работает round robin по умолчанию.",
        "points": [
          "Несколько адресов в одном reverse_proxy",
          "lb_policy: round_robin, weighted, ip_hash, cookie",
          "X-Backend в ответе показывает, кто ответил"
        ],
        "code": "reverse_proxy localhost:3001 localhost:3002 {\n\tlb_policy round_robin\n}"
      },
      {
        "tab": "Admin API",
        "title": "Применить конфиг, не перезапуская процесс",
        "text": "localhost:2019 по умолчанию — HTTP-интерфейс самого Caddy: читает текущий конфиг, переводит Caddyfile в JSON не применяя и накатывает новый конфиг без простоя.",
        "points": [
          "GET /config/... — чтение текущей конфигурации",
          "POST /adapt — Caddyfile → JSON, без применения",
          "caddy reload — тот же API под капотом"
        ],
        "code": "curl -s localhost:2019/config/apps/http/servers\n\nprintf ':9999 {\\n\\trespond \"x\"\\n}\\n' | caddy adapt"
      }
    ],
    sessions: [
      {
        "h": "~4 ч",
        "t": "Первый запуск",
        "r": "Установка, caddy respond и file-server без конфига, первый Caddyfile, validate/fmt/adapt, сломать → починить, reload без остановки"
      },
      {
        "h": "~5 ч",
        "t": "Статический сайт",
        "r": "Сайт Bean & Co на root и file_server, сжатие, заголовки и кеш, редиректы и rewrite, SPA через try_files, свои страницы ошибок"
      },
      {
        "h": "~6 ч",
        "t": "Reverse proxy",
        "r": "Бэкенды проекта Edge на Node 24, handle /api/* и handle_path, заголовки X-Forwarded, WebSocket и SSE без спецнастроек, 502 и его починка"
      },
      {
        "h": "~6 ч",
        "t": "Автоматический HTTPS",
        "r": "Локальный HTTPS без единой настройки, что именно отдаёт Caddy (редирект, сертификат, HTTP/3), публичный домен и Let's Encrypt staging, On-Demand TLS, где лежат сертификаты"
      },
      {
        "h": "~5 ч",
        "t": "Балансировка и отказоустойчивость",
        "r": "round_robin между двумя бэкендами, весовая/по IP/по заголовку/по куке, активные health-проверки, канареечная маршрутизация и резервный бэкенд"
      },
      {
        "h": "~6 ч",
        "t": "Безопасность",
        "r": "Защитные заголовки, basic_auth, forward_auth на отдельный сервис, лимит тела запроса и доступ по IP, подделка X-Forwarded-For и обход allowlist"
      },
      {
        "h": "~5 ч",
        "t": "Caddy в Docker и Compose",
        "r": "Образ caddy:2 и три тома, docker-compose.yml для Edge, перезагрузка конфига в контейнере, пересозданный контейнер без сертификатов, секреты и «двойной доллар»"
      },
      {
        "h": "~4 ч",
        "t": "PHP и FastCGI",
        "r": "php_fastcgi, «File not found.» из-за разных путей, Laravel за Caddy — pretty URLs и закрытые файлы"
      },
      {
        "h": "~5 ч",
        "t": "Логи, метрики, отладка",
        "r": "JSON-журнал доступа, секреты в логах, метрики Prometheus, отладка через debug/adapt/config/environ"
      },
      {
        "h": "~5 ч",
        "t": "Caddyfile для профи",
        "r": "Именованные матчеры, сниппеты с аргументами и import, плейсхолдеры и map, условия на CEL, пустая переменная и значения по умолчанию"
      },
      {
        "h": "~5 ч",
        "t": "Admin API и JSON",
        "r": "Admin API для чтения и применения конфига, родной JSON-формат и @id, автосохранение конфигурации и --resume, конфиг-адаптеры"
      },
      {
        "h": "~6 ч",
        "t": "Расширение Caddy: xcaddy и модули",
        "r": "Что такое модуль Caddy, сборка с плагином через xcaddy, свой модуль с заголовком X-Hello, «unrecognized directive»"
      },
      {
        "h": "~6 ч",
        "t": "Продакшн: служба, кластер, чек-лист",
        "r": "systemd вместо caddy run, сеть и порты для HTTP/3, итоговый Caddyfile Edge целиком, несколько экземпляров с общим хранилищем, восстановление из бэкапа, финальный аудит"
      }
    ],
    arch: {
      "title": "Путь запроса через Caddy",
      "rows": [
        {
          "label": "Клиент",
          "boxes": [
            "браузер https://app.localhost",
            "HTTPS: автоматически, без настройки"
          ]
        },
        {
          "label": "Caddy 2.11.7",
          "boxes": [
            "Caddyfile → JSON на лету",
            "Admin API :2019"
          ]
        },
        {
          "label": "Маршрутизация",
          "boxes": [
            "handle /api/*, /ws, /events",
            "handle { file_server } — остальное"
          ]
        },
        {
          "label": "Бэкенды Edge",
          "boxes": [
            "API ×2 (Node 24): round_robin",
            "WebSocket-эхо + поток SSE"
          ]
        },
        {
          "label": "Статика и PHP",
          "boxes": [
            "root * site — Bean & Co",
            "php_fastcgi → PHP-FPM"
          ]
        }
      ],
      "note": "Один процесс вместо связки nginx + certbot + отдельный балансировщик: TLS, роутинг и реверс-прокси — внутри одного Caddyfile.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "снаружи",
            "x": 14,
            "w": 190
          },
          {
            "t": "Caddy 2.11.7",
            "x": 250,
            "w": 430
          },
          {
            "t": "бэкенды Edge",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "browser",
            "t": "Браузер",
            "s": "https://app.localhost",
            "x": 110,
            "y": 150,
            "d": "Запрос на домен .localhost — HTTPS уже включён, настраивать нечего."
          },
          {
            "id": "tls",
            "t": "Локальный CA / ACME",
            "s": "auto_https",
            "x": 110,
            "y": 350,
            "d": "Для .localhost — встроенный локальный CA, для публичного домена — Let's Encrypt или ZeroSSL."
          },
          {
            "id": "admin",
            "t": "Admin API",
            "s": "localhost:2019",
            "x": 350,
            "y": 110,
            "d": "HTTP-интерфейс самого Caddy: чтение конфига, adapt, применение без перезапуска."
          },
          {
            "id": "handle",
            "t": "handle-блоки",
            "s": "/api/*, /ws, /events, остальное",
            "x": 350,
            "y": 270,
            "d": "Каждый путь — свой handle; блоки не перекрываются, порядок не важен так, как в route."
          },
          {
            "id": "rp",
            "t": "reverse_proxy",
            "s": "lb_policy round_robin",
            "x": 570,
            "y": 190,
            "d": "Тот же reverse_proxy обслуживает HTTP, WebSocket (Upgrade подхватывается сам) и SSE."
          },
          {
            "id": "api",
            "t": "API ×2",
            "s": "Node 24 :3001 :3002",
            "x": 800,
            "y": 120,
            "d": "Два «говорящих» экземпляра — заголовок X-Backend показывает, кто ответил."
          },
          {
            "id": "ws",
            "t": "WebSocket + SSE",
            "s": "Node 24 :3100",
            "x": 800,
            "y": 260,
            "d": "Эхо по RFC 6455 и поток событий — без отдельной директивы в Caddyfile."
          },
          {
            "id": "php",
            "t": "PHP-FPM",
            "s": "php_fastcgi",
            "x": 800,
            "y": 400,
            "d": "FastCGI напрямую, без отдельного nginx перед php-fpm."
          }
        ],
        "edges": [
          {
            "a": "browser",
            "b": "admin"
          },
          {
            "a": "tls",
            "b": "admin"
          },
          {
            "a": "admin",
            "b": "handle"
          },
          {
            "a": "handle",
            "b": "rp"
          },
          {
            "a": "rp",
            "b": "api"
          },
          {
            "a": "rp",
            "b": "ws"
          },
          {
            "a": "rp",
            "b": "php"
          },
          {
            "a": "rp",
            "b": "admin",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "browser",
            "txt": "GET https://app.localhost/api/orders."
          },
          {
            "n": "admin",
            "txt": "TLS уже завершён — auto_https сделал это без настройки."
          },
          {
            "n": "handle",
            "txt": "Путь /api/* попадает в свой handle-блок."
          },
          {
            "n": "rp",
            "txt": "reverse_proxy выбирает бэкенд по round_robin."
          },
          {
            "n": "api",
            "txt": "Один из двух экземпляров API отвечает, добавляя X-Backend."
          },
          {
            "n": "rp",
            "txt": "Ответ возвращается через reverse_proxy.",
            "back": true
          },
          {
            "n": "browser",
            "txt": "Браузер получает ответ по HTTPS.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Чем один Caddyfile лучше связки nginx + certbot?",
        "a": "TLS, роутинг и reverse proxy описаны в одном файле и одном процессе: auto_https сам решает, когда нужен локальный CA, а когда настоящий ACME, без отдельного крон-задания на обновление сертификатов."
      },
      {
        "q": "Что происходит с WebSocket, если для него нет отдельной настройки?",
        "a": "Ничего особенного — reverse_proxy и так распознаёт заголовки Upgrade/Connection и держит двусторонний поток. Отдельной директивы под WebSocket в Caddy просто нет."
      },
      {
        "q": "Чем Admin API отличается от caddy reload?",
        "a": "caddy reload внутри сам обращается к тому же Admin API (по умолчанию localhost:2019) — это не отдельный механизм, а то же самое применение нового конфига без перезапуска процесса и обрыва соединений."
      },
      {
        "q": "Зачем xcaddy, если есть официальный образ caddy:2?",
        "a": "Плагины (например DNS-провайдер для DNS-01) не входят в стандартную сборку. xcaddy компилирует свой бинарник с нужными модулями на Go — тот же подход, что в caddy:2-builder для Docker."
      },
      {
        "q": "Всё ли в методичке проверено на реальном Caddy?",
        "a": "Нет, честно: сессии 1–6 и 9–11 проверены на Caddy v2.11.7 (45 из 49 конфигов проходят caddy validate, остальные 4 — намеренные ошибки из «сломать → починить»). Docker/Compose, PHP-FPM, сборка через xcaddy, systemd-служба и кластер не запускались — в тексте помечены «сверьтесь»."
      }
    ],
    accent: '#0a8f6a',
  },
  {
    key: 'centrifugo',
    titleMain: 'centrifugo',
    title: 'Centrifugo Lab',
    subtitle: 'Realtime Workspace — Centrifugo с нуля',
    desc: 'Realtime-сервер Centrifugo для Laravel + Vue: каналы и namespaces, centrifuge-js, публикация из Laravel, JWT и subscription tokens, proxy, presence и history, recovery, Outbox, тесты, production и нагрузка.',
    stack: ['Centrifugo 6', 'Laravel 13', 'Vue', 'Docker', 'Redis'],
    difficulty: 'Средняя–высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/centrifugo/centrifugo.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/centrifugo/centrifugo.html',
    repo: 'https://github.com/meeymirita/centrifugo-lab',
    stackInfo: [
      {
        "tag": "сервер",
        "back": "Centrifugo 6: каналы и namespaces, HTTP API для публикации, WebSocket-соединения клиентов, конфиг в JSON."
      },
      {
        "tag": "клиент",
        "back": "centrifuge-js в Vue: состояния клиента, подписки и их события, токены, переподключение с recovery."
      },
      {
        "tag": "Laravel",
        "back": "Публикация из Laravel через HTTP API, Event → Listener → Queue, выдача JWT и subscription-токенов, Policy, proxy-эндпоинты."
      },
      {
        "tag": "надёжность",
        "back": "Presence и history, recovery позиции в потоке, Transactional Outbox, дедупликация по event_id, сценарии аварий."
      },
      {
        "tag": "production",
        "back": "Docker Compose, nginx, Redis engine, две ноды Centrifugo, лимиты дескрипторов, нагрузочный тест k6."
      }
    ],
    learn: [
      {
        "tab": "Конфиг",
        "title": "Origin и каналы — в одном JSON",
        "text": "Centrifugo настраивается файлом config.json. allowed_origins защищает от подключений с чужих страниц: браузер с другого origin получит отказ.",
        "points": [
          "client.allowed_origins — список разрешённых адресов страниц",
          "namespaces делят каналы по правилам",
          "http_api.key — ключ для публикации с бэкенда"
        ],
        "code": "{\n  \"client\": {\n    \"allowed_origins\": [\"http://localhost:5173\"]\n  }\n}"
      },
      {
        "tab": "Клиент",
        "title": "Подписка на канал и её события",
        "text": "В centrifuge-js подписка — отдельный объект со своими состояниями: subscribing, subscribed, unsubscribed. Приходящие сообщения — событие publication.",
        "points": [
          "client.newSubscription(channel) создаёт подписку",
          "sub.on('state') — переходы состояний",
          "sub.on('publication') — входящие сообщения"
        ],
        "code": "const sub = client.newSubscription(channel);\nsub.on('state', ctx => console.log(ctx.oldState, '→', ctx.newState));\nsub.on('publication', ctx => console.log(ctx.data));\nsub.subscribe();"
      },
      {
        "tab": "JWT",
        "title": "Laravel выдаёт connection-токен",
        "text": "Клиент не знает секрета: Laravel подписывает короткоживущий JWT, а Centrifugo его проверяет. sub — строка с id пользователя, exp — срок жизни.",
        "points": [
          "HS256 и общий hmac_secret_key",
          "sub — строкой, не числом",
          "короткий exp + getToken на клиенте"
        ],
        "code": "JWT::encode([\n    'sub' => (string) $user->id,\n    'iat' => $now,\n    'exp' => $now + $ttl,\n    'info' => ['name' => $user->name],\n], config('services.centrifugo.hmac_secret'), 'HS256');"
      },
      {
        "tab": "Proxy",
        "title": "Laravel решает, кого пускать в канал",
        "text": "Subscribe proxy: Centrifugo при каждой подписке спрашивает у Laravel, можно ли. Ответ — result или error с кодом.",
        "points": [
          "endpoint и timeout в channel.proxy.subscribe",
          "proxy включается на namespace",
          "403 — отказ, result.info — данные пользователя"
        ],
        "code": "Route::post('/centrifugo/subscribe', function (Request $request, ChannelAccess $access) {\n    $user = \\App\\Models\\User::find((int) $request->input('user'));\n    $channel = (string) $request->input('channel');\n\n    if (! $user || ! $access->canSubscribe($user, $channel)) {\n        return ['error' => ['code' => 403, 'message' => 'forbidden']];\n    }\n\n    return ['result' => ['info' => ['name' => $user->name]]];\n});"
      }
    ],
    sessions: [
      {
        "h": "~2.5 ч",
        "t": "Что такое realtime",
        "r": "Одна лента четырьмя способами: polling, long polling, SSE, WebSocket; Минимальный WebSocket-чат на Node и в браузере; Сломать → починить: закрыть сервер и наблюдать close; Два сервера и три клиента: кто хранит подписчиков; Centrifugo в Docker и админка"
      },
      {
        "h": "~3.5 ч",
        "t": "Конфиг, API, каналы, namespaces",
        "r": "Свой конфиг: genconfig, defaultconfig, defaultenv, configdoc; allowed_origins: чужой origin отклоняется; Первый publish через HTTP API и первый подписчик; Publish в несуществующий namespace: 200 с ошибкой внутри; Namespace chat: что он решает…"
      },
      {
        "h": "~3 ч",
        "t": "centrifuge-js и Vue",
        "r": "Ставим centrifuge и читаем types.ts; Клиент и его состояния; Подписка и её события; Токены руками: gentoken, gensubtoken, разбор JWT; Компонент RealtimeChat.vue без утечек…"
      },
      {
        "h": "~3 ч",
        "t": "Laravel → Centrifugo через HTTP API",
        "r": "Laravel-проект и сервис RealtimePublisher на «голом» HTTP; Ошибка внутри 200: проверяем тело ответа; События Laravel и таблица «trait → что делает»; Artisan-команда realtime:test: десять сообщений; broadcast и batch: несколько публикаций одним запросом…"
      },
      {
        "h": "~2.5 ч",
        "t": "Event → Listener → Queue",
        "r": "Модель Task и три события; Listener публикует в канал задачи; ShouldQueue: публикация из очереди; Схема: три разных «Redis»-слова; Остановить worker: события приходят позже"
      },
      {
        "h": "~2.5 ч",
        "t": "Надёжная публикация",
        "r": "Dispatch внутри транзакции, потом rollback; ShouldDispatchAfterCommit: событие только после commit; tries, backoff и failed_jobs: повтор при сбое Centrifugo; idempotency_key в собственном сервисе; Предпросмотр: outbox вместо «dispatch после commit»"
      },
      {
        "h": "~2.5 ч",
        "t": "Протокол сообщений",
        "r": "Конверт сообщения: event_id, type, version, occurred_at, data; Именование типов и реестр; Fat против thin: что класть в data; Дедупликация на клиенте по event_id; version и version_epoch: устаревшая публикация игнорируется…"
      },
      {
        "h": "~3.5 ч",
        "t": "Аутентификация: connection JWT",
        "r": "Authentication против authorization; Разбор JWT: sub, exp, iat, info, meta, channels, subs; Laravel выдаёт connection-токен; Короткий exp, getToken и UnauthorizedError; Аноним или пользователь: два флага…"
      },
      {
        "h": "~2.5 ч",
        "t": "Subscription tokens и private channels",
        "r": "Публичный namespace: allow_subscribe_for_client; Убрать опцию: 103 permission denied; Laravel выдаёт subscription JWT; Policy: чужой задачи токена не будет; info в токене подписки и presence…"
      },
      {
        "h": "~2.5 ч",
        "t": "Proxy, user-limited, выбор механизма",
        "r": "User-limited канал notify:#42; Connect proxy: аутентификация без JWT; http_headers и emulated_headers: cookie и Authorization; Subscribe proxy: Laravel решает по каждой подписке; Ответ proxy: error и disconnect…"
      },
      {
        "h": "~3.5 ч",
        "t": "Presence и History",
        "r": "presence: сначала 103, потом список; presenceStats(): только счётчики; info и chan_info: что видно в ответе; join_leave; UI «Online: N»: два client ID у одного user…"
      },
      {
        "h": "~3 ч",
        "t": "Recovery и reconnect",
        "r": "Lifecycle клиента и backoff с jitter; epoch и offset: позиция в потоке; force_recovery: Wi-Fi off/on; wasRecovering и recovered; Вытеснение истории: recovered false…"
      },
      {
        "h": "~3.5 ч",
        "t": "HTTP API вглубь и Laravel-пакет",
        "r": "Установка пакета и smoke-тест (E4); Что пакет умеет и чего нет; Ошибки: send() глотает, broadcast() не видит (E2); PrivateChannel → $-канал (E3); broadcasting/auth: токен подписки через Laravel…"
      },
      {
        "h": "~2.5 ч",
        "t": "Паттерны: уведомления, прогресс, server-side подписки",
        "r": "Автоканал notify:#42; Приём через client.on('publication'); Другие способы оформить server-side подписку; single_connection; Прогресс job: 25/50/75/100…"
      },
      {
        "h": "~2.5 ч",
        "t": "Паттерны: typing, client publish, доска",
        "r": "Typing: client publish в $typing; Debounce / throttle и авто-таймаут; Publish proxy: Laravel валидирует публикацию клиента; Server-side publish против client-side publish; Сборка доски"
      },
      {
        "h": "~2.5 ч",
        "t": "Reliability: аварии",
        "r": "Остановить Centrifugo; Остановить Laravel; Остановить queue worker; Остановить Redis; Потеря сети у клиента…"
      },
      {
        "h": "~2.5 ч",
        "t": "Reliability: outbox, дубликаты, порядок",
        "r": "Таблица centrifugo_outbox; Конфиг consumers: Centrifugo читает таблицу сам; Транзакция: задача + запись в outbox; LISTEN/NOTIFY: меньше задержка; broadcast в outbox: дубли без ключа…"
      },
      {
        "h": "~3 ч",
        "t": "Тестирование и безопасность",
        "r": "Http::fake(): публикация в тесте; Тесты токенов и Policy; afterCommit и rollback; Чек-лист безопасности конфигурации; XSS, лимиты размера, channel_regex…"
      },
      {
        "h": "~3 ч",
        "t": "Production: compose, прокси, engine",
        "r": "Docker Compose: полный стенд; Nginx по конфигу приложения D; Sticky sessions не нужны; Redis engine: история переживает рестарт; health, prometheus, shutdown, SIGHUP…"
      },
      {
        "h": "~3.5 ч",
        "t": "Масштаб и нагрузка",
        "r": "Две ноды Centrifugo + Redis engine; Лимиты файловых дескрипторов; Ephemeral ports, TIME_WAIT, conntrack; Реальные кадры клиента (E5); k6-скрипт на k6/websockets…"
      },
      {
        "h": "~5 ч",
        "t": "Финальный проект",
        "r": "ТЗ и план: Realtime Task Workspace; Реализация: Laravel; Реализация: Centrifugo и Vue; Шесть приёмочных сценариев; Сдача: тесты, отчёт, протокол, схема, таблица аварий"
      }
    ],
    arch: {
      "title": "Путь сообщения через Centrifugo",
      "rows": [
        {
          "label": "Браузер",
          "boxes": [
            "Vue + centrifuge-js",
            "подписка на канал tasks:42"
          ]
        },
        {
          "label": "Centrifugo",
          "boxes": [
            "WebSocket-соединения, каналы, namespaces",
            "presence, history, recovery"
          ]
        },
        {
          "label": "Laravel",
          "boxes": [
            "HTTP API: publish из Listener",
            "JWT, Policy, proxy-эндпоинты"
          ]
        },
        {
          "label": "Очередь",
          "boxes": [
            "queue worker, Outbox",
            "идемпотентность, повторы"
          ]
        },
        {
          "label": "Хранилища",
          "boxes": [
            "PostgreSQL (задачи, outbox)",
            "Redis (очереди, engine Centrifugo)"
          ]
        }
      ],
      "note": "Laravel — источник правды и единственный, кто публикует; Centrifugo только доставляет сообщения клиентам и хранит короткую историю.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "клиент",
            "x": 14,
            "w": 190
          },
          {
            "t": "Centrifugo",
            "x": 250,
            "w": 330
          },
          {
            "t": "бэкенд",
            "x": 620,
            "w": 366
          }
        ],
        "nodes": [
          {
            "id": "vue",
            "t": "Vue-клиент",
            "s": "centrifuge-js",
            "x": 110,
            "y": 150,
            "d": "Подключается по WebSocket с connection-токеном и подписывается на каналы."
          },
          {
            "id": "cf",
            "t": "Centrifugo",
            "s": "каналы, history",
            "x": 415,
            "y": 150,
            "d": "Держит соединения, раздаёт публикации подписчикам, хранит историю для recovery."
          },
          {
            "id": "api",
            "t": "HTTP API",
            "s": "POST /api/publish",
            "x": 415,
            "y": 330,
            "d": "Вход для бэкенда: публикация, presence, history, disconnect."
          },
          {
            "id": "laravel",
            "t": "Laravel",
            "s": "Listener, JWT, proxy",
            "x": 800,
            "y": 150,
            "d": "Бизнес-логика, права доступа, выдача токенов; публикует события после коммита."
          },
          {
            "id": "queue",
            "t": "Queue worker",
            "s": "ShouldQueue, retry",
            "x": 800,
            "y": 300,
            "d": "Публикует из очереди с повторами и backoff, чтобы не терять сообщения."
          },
          {
            "id": "db",
            "t": "PostgreSQL + Redis",
            "s": "outbox, engine",
            "x": 800,
            "y": 440,
            "d": "Задачи и таблица outbox в PostgreSQL; Redis — очереди и engine для нескольких нод."
          }
        ],
        "edges": [
          {
            "a": "vue",
            "b": "cf"
          },
          {
            "a": "laravel",
            "b": "api"
          },
          {
            "a": "api",
            "b": "cf"
          },
          {
            "a": "laravel",
            "b": "queue"
          },
          {
            "a": "queue",
            "b": "db"
          },
          {
            "a": "cf",
            "b": "laravel",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "laravel",
            "txt": "Задача изменилась — Listener ставит публикацию в очередь."
          },
          {
            "n": "queue",
            "txt": "Воркер отправляет publish в HTTP API Centrifugo."
          },
          {
            "n": "api",
            "txt": "API принимает запрос и находит канал tasks:42."
          },
          {
            "n": "cf",
            "txt": "Centrifugo записывает сообщение в историю и рассылает подписчикам."
          },
          {
            "n": "vue",
            "txt": "Клиент получает publication и обновляет интерфейс."
          }
        ]
      }
    },
    faq: [
      {
        "q": "Чем Centrifugo отличается от Laravel Reverb или Pusher?",
        "a": "Centrifugo — отдельный сервер на Go, не привязанный к Laravel: каналы, presence, history и recovery встроены, клиенты на разных языках, масштабирование через Redis. Laravel лишь публикует в него по HTTP API."
      },
      {
        "q": "Зачем нужен Outbox, если есть очередь?",
        "a": "Очередь и база — два разных хранилища: если запись в БД прошла, а публикация упала, сообщение теряется. Outbox пишет сообщение в ту же транзакцию, откуда его надёжно забирает Centrifugo или воркер."
      },
      {
        "q": "Чем connection-токен отличается от subscription-токена?",
        "a": "Connection-токен подтверждает, кто подключается (sub). Subscription-токен разрешает подписку на конкретный канал — Laravel выдаёт его только тем, у кого есть право на этот канал."
      },
      {
        "q": "Что делает recovery при потере связи?",
        "a": "Клиент помнит позицию (epoch и offset) в потоке канала. При переподключении Centrifugo досылает пропущенные сообщения из истории, если они ещё хранятся."
      },
      {
        "q": "Всё ли в методичке проверено на реальном Centrifugo?",
        "a": "Нет. Методичка получена из отдельного чата 11.10.2026 и ещё не вычитана и не проверена запуском: код сессий 8B, 12B, 13B, 15 и пример k6 не запускались, часть имён опций написана по памяти, пакет denis660/laravel-centrifugo не читали в исходниках."
      }
    ],
    accent: '#EF2D4F',
  },
  {
    key: 'bash',
    titleMain: 'bash',
    title: 'Bash Lab',
    subtitle: 'CoffeeOps — shell и bash с нуля',
    desc: 'Командная строка и bash с нуля: терминал и оболочка, переменные и кавычки, условия и циклы, функции и shellcheck, потоки и конвейеры, массивы и строки, grep / sed / awk, cron и деплой-скрипт с откатом.',
    stack: ['Bash 5', 'Docker', 'grep / sed / awk', 'shellcheck'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/bash/bash.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/bash/bash.html',
    repo: 'https://github.com/meeymirita/bash-lab',
    stackInfo: [
      {
        "tag": "среда",
        "back": "Контейнер Docker с bash 5 и GNU-утилитами: у всех один и тот же bash, а твой Mac (там bash 3.2) остаётся нетронутым."
      },
      {
        "tag": "скрипты",
        "back": "Shebang, переменные, кавычки, аргументы, ветвления if и case, циклы, функции, опции через getopts, библиотека общих функций."
      },
      {
        "tag": "текст",
        "back": "Конвейеры, перенаправления, here-doc, xargs, регулярные выражения, grep, sed и awk — отчёты по журналам и CSV."
      },
      {
        "tag": "надёжность",
        "back": "Коды завершения, set -euo pipefail, trap, shellcheck, сухой запуск, идемпотентность и откат при деплое."
      },
      {
        "tag": "автоматика",
        "back": "cron, деплой по схеме «релиз + символическая ссылка», health check, единая команда coffeeops.sh с подкомандами и тестами."
      }
    ],
    learn: [
      {
        "tab": "Кавычки",
        "title": "Оболочка делит строку на слова",
        "text": "Главное правило bash: строка режется по пробелам. Кавычки решают, сколько слов получится и что раскроется. Переменные всегда берём в двойные кавычки.",
        "points": [
          "без кавычек — слова делятся",
          "\"…\" — переменные раскрываются, слова целые",
          "'…' — всё буквально"
        ],
        "code": "item=\"iced latte\"\nprintf '[%s]\\n' $item      # два слова\nprintf '[%s]\\n' \"$item\"    # одно слово\nprintf '[%s]\\n' '$item'    # буквально"
      },
      {
        "tab": "Строгий режим",
        "title": "Скрипт должен падать громко",
        "text": "По умолчанию bash идёт дальше после ошибки и может «успешно» закончить сломанную работу. Три настройки и ловушка EXIT делают провал заметным и убирают за собой.",
        "points": [
          "set -e — остановиться на ошибке",
          "set -u — ошибка на пустой переменной",
          "trap … EXIT — уборка при любом выходе"
        ],
        "code": "#!/usr/bin/env bash\nset -euo pipefail\ntmp=$(mktemp)\ntrap 'rm -f \"$tmp\"' EXIT\ncp orders.csv \"$tmp\""
      },
      {
        "tab": "Конвейер",
        "title": "Маленькие программы собираются в цепочку",
        "text": "Конвейер соединяет вывод одной команды со вводом следующей. Так за минуту строится отчёт: берём столбец, сортируем, считаем повторы, показываем лидеров.",
        "points": [
          "cut — взять столбец",
          "sort | uniq -c — посчитать повторы",
          "head — оставить первые строки"
        ],
        "code": "cut -d, -f2 orders/*.csv | grep -v '^item$' \\\n  | sort | uniq -c | sort -rn | head -n 3"
      },
      {
        "tab": "Массивы",
        "title": "Счётчик без внешних утилит",
        "text": "Ассоциативный массив работает как словарь «ключ → значение». Им считают заказы по товарам прямо в bash: ключ — название, значение — сумма.",
        "points": [
          "declare -A — объявление (bash 4+)",
          "${m[$k]:-0} — значение или 0",
          "${!m[@]} — все ключи"
        ],
        "code": "declare -A count=()\nwhile IFS=, read -r _ item qty _; do\n  count[$item]=$(( ${count[$item]:-0} + qty ))\ndone < orders/2026-10-01.csv"
      }
    ],
    sessions: [
      {
        "h": "~2,5 ч",
        "t": "Терминал и оболочка",
        "r": "Терминал, оболочка, bash; Среда: Docker и образ лабы; Навигация: где я и как ходить; Файлы: создать, скопировать, прочитать, удалить; Права, владелец и справка…"
      },
      {
        "h": "~3 ч",
        "t": "Первый скрипт: переменные, кавычки, аргументы",
        "r": "Файл-скрипт, shebang и три способа запуска; Переменные: объявление, окружение; Кавычки, подстановка команд и арифметика; Аргументы скрипта; Сломать → починить: пробелы и кавычки…"
      },
      {
        "h": "~2,5 ч",
        "t": "Ввод, арифметика, ветвления",
        "r": "Ввод пользователя: read; Арифметика и дроби; Условия: if, test, [[ ]]; case: выбор по шаблону; Сломать → починить: ловушки условий…"
      },
      {
        "h": "~3 ч",
        "t": "Циклы, коды завершения, строгий режим",
        "r": "Цикл for; while, until и чтение файла по строкам; Коды завершения и строгий режим; trap: прибираем за собой; Сломать → починить: «успешный» провал…"
      },
      {
        "h": "~3 ч",
        "t": "Функции и структура скрипта",
        "r": "Функции; Библиотека: source, лог и die; Опции скрипта: getopts и usage; ShellCheck: линтер для скриптов; Сломать → починить: утечка переменной из функции…"
      },
      {
        "h": "~3 ч",
        "t": "Потоки, перенаправление, конвейеры",
        "r": "Три потока и перенаправление; dev/null, tee, here-doc и here-string; Конвейеры; xargs, find -print0 и подстановка процессов; Сломать → починить: тихие ошибки конвейеров…"
      },
      {
        "h": "~3 ч",
        "t": "Массивы и работа со строками",
        "r": "Индексные массивы; Сортировка, поиск и чтение в массив; Ассоциативные массивы; Строки: расширения параметров; Сломать → починить: потерянные элементы…"
      },
      {
        "h": "~3 ч",
        "t": "Текст: grep, sed, awk",
        "r": "Регулярные выражения; grep; sed; awk; Сломать → починить: sed -i, жадность, спецсимволы…"
      },
      {
        "h": "~3 ч",
        "t": "Автоматизация и развёртывание",
        "r": "Запуск по расписанию: cron; Деплой-скрипт: релизы и символическая ссылка; Запуск, повтор, откат; Production Hell: сломанный deploy.sh; Итоговый проект: coffeeops.sh с подкомандами и тестами"
      },
      {
        "h": "~2 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового ответа: подкоманда coffeeops.sh digest (getopts, сводка по заказам и журналу, тесты, shellcheck)"
      }
    ],
    arch: {
      "title": "Как команда доходит до результата",
      "rows": [
        {
          "label": "Ты",
          "boxes": [
            "терминал: ввод команды",
            "контейнер с bash 5"
          ]
        },
        {
          "label": "Оболочка bash",
          "boxes": [
            "слова, кавычки, подстановки $( )",
            "переменные, функции, коды завершения"
          ]
        },
        {
          "label": "Программы",
          "boxes": [
            "grep, sed, awk, sort, find",
            "каждая — отдельный процесс"
          ]
        },
        {
          "label": "Потоки",
          "boxes": [
            "stdin → stdout, stderr",
            "| > >> 2>&1 <<EOF"
          ]
        },
        {
          "label": "Результат",
          "boxes": [
            "файлы, журнал, отчёты",
            "cron и деплой-скрипт"
          ]
        }
      ],
      "note": "Оболочка только разбирает строку и запускает программы; всё полезное делают маленькие утилиты, а потоки и конвейеры соединяют их в цепочку.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "ты",
            "x": 14,
            "w": 190
          },
          {
            "t": "оболочка",
            "x": 250,
            "w": 330
          },
          {
            "t": "программы и данные",
            "x": 620,
            "w": 366
          }
        ],
        "nodes": [
          {
            "id": "term",
            "t": "Терминал",
            "s": "контейнер bash 5",
            "x": 110,
            "y": 150,
            "d": "Ты вводишь команду; контейнер с bash 5 исполняет её и показывает ответ."
          },
          {
            "id": "sh",
            "t": "Оболочка bash",
            "s": "слова, кавычки, $( )",
            "x": 415,
            "y": 150,
            "d": "Разбирает строку на слова, раскрывает переменные и шаблоны, ищет программу и запускает её."
          },
          {
            "id": "vars",
            "t": "Переменные",
            "s": "функции, $?",
            "x": 415,
            "y": 330,
            "d": "Хранят значения между командами; код завершения $? говорит, получилось ли."
          },
          {
            "id": "prog",
            "t": "Программы",
            "s": "grep · sed · awk",
            "x": 800,
            "y": 150,
            "d": "Утилиты, каждая делает одно дело: ищет, заменяет, считает, сортирует."
          },
          {
            "id": "pipe",
            "t": "Конвейер |",
            "s": "stdout → stdin",
            "x": 800,
            "y": 300,
            "d": "Соединяет вывод одной программы со вводом следующей; все работают одновременно."
          },
          {
            "id": "files",
            "t": "Файлы и журнал",
            "s": "orders/ logs/ backup/",
            "x": 800,
            "y": 440,
            "d": "Данные CoffeeOps: заказы, журнал, архивы; сюда же пишут отчёты и cron-задания."
          }
        ],
        "edges": [
          {
            "a": "term",
            "b": "sh"
          },
          {
            "a": "sh",
            "b": "vars"
          },
          {
            "a": "sh",
            "b": "prog"
          },
          {
            "a": "prog",
            "b": "pipe"
          },
          {
            "a": "pipe",
            "b": "files"
          },
          {
            "a": "files",
            "b": "sh",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "term",
            "txt": "Ты набираешь команду и нажимаешь Enter."
          },
          {
            "n": "sh",
            "txt": "Оболочка делит строку на слова и раскрывает переменные и шаблоны."
          },
          {
            "n": "prog",
            "txt": "Находит программу и запускает её как отдельный процесс."
          },
          {
            "n": "pipe",
            "txt": "Вывод по конвейеру уходит следующей программе или в файл."
          },
          {
            "n": "vars",
            "txt": "Оболочка запоминает код завершения в $? — по нему решают, что делать дальше."
          }
        ]
      }
    },
    faq: [
      {
        "q": "Зачем Docker, если на Mac уже есть bash?",
        "a": "На Mac системный bash — версия 3.2 (2007 года): в нём нет ассоциативных массивов, mapfile и многого другого, а утилиты grep, sed, ls — BSD-версии, которые ведут себя иначе, чем на серверах. Контейнер даёт тот bash 5 и те GNU-утилиты, которые стоят на настоящем сервере."
      },
      {
        "q": "Нужно ли что-то знать заранее?",
        "a": "Нет, лаба самостоятельная: терминал, файлы и права объясняются в сессии 1. Docker объясняется ровно настолько, чтобы запустить контейнер."
      },
      {
        "q": "Чем bash отличается от zsh?",
        "a": "Для интерактивной работы они почти одинаковы (на новых Mac по умолчанию zsh). Скрипты для серверов и автоматизации принято писать на bash или на POSIX sh — поэтому лаба про bash."
      },
      {
        "q": "Что после этой лабы?",
        "a": "Следующая в очереди — Docker (контейнеры, образы, Compose), в которой деплой-скрипт из сессии 9 станет основой для развёртывания контейнеров."
      },
      {
        "q": "Всё ли в методичке проверено?",
        "a": "Не полностью. Методичка собрана 11.10.2026 и не вычитана человеком. Все команды с выводом выполнены в Docker (bash 5.3, shellcheck без замечаний, тесты проекта 8 из 8), но интерактивный ввод, cron на реальном сервере и отличия macOS в тексте описаны, а не запускались."
      }
    ],
    accent: '#2f7d32',
  },
  {
    key: 'php-coffee',
    titleMain: 'oop',
    title: 'OOP Lab',
    subtitle: 'Coffee Shop API на PHP 8.4',
    desc: 'ООП на PHP 8.4 с нуля на маленьком API кофейни: 4 принципа ООП, Factory, Decorator, Strategy, Repository, SOLID, наследование vs композиция.',
    stack: ['PHP 8.4', 'Laravel 13', 'PostgreSQL', 'RabbitMQ'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/php-coffee/php.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/php-coffee/php-coffee.html',
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
    sessions: [
      {
        "h": "~2,5 ч",
        "t": "Стенд и чистый PHP: от массива к объекту",
        "r": "Четыре скрипта в lab0/ и поднятый Docker-стенд"
      },
      {
        "h": "~2 ч",
        "t": "Домен напитков: Money, Size, Drink, фабрика",
        "r": "Меню отдаётся по GET /api/menu, первые unit-тесты"
      },
      {
        "h": "~3 ч",
        "t": "Добавки-декораторы, Order, репозиторий",
        "r": "Заказ создаётся, считается и сохраняется в Postgres через POST /api/orders"
      },
      {
        "h": "~3 ч",
        "t": "Strategy: скидки и оплаты, DI через контейнер",
        "r": "POST /api/orders/{id}/pay с настраиваемыми скидками и способами оплаты"
      },
      {
        "h": "~3 ч",
        "t": "RabbitMQ: события и воркеры бариста и уведомлений",
        "r": "Полный цикл заказ → оплата → готов → письмо, около 15 тестов за 0,1 с"
      }
    ],
    arch: {
      "title": "Путь оплаченного заказа",
      "rows": [
        {
          "label": "HTTP · Laravel",
          "boxes": [
            "POST /api/orders/{id}/pay",
            "PaymentController"
          ]
        },
        {
          "label": "Domain · без Illuminate",
          "boxes": [
            "Checkout + DiscountPolicy",
            "PaymentMethod",
            "Order::markPaid()"
          ]
        },
        {
          "label": "Infrastructure",
          "boxes": [
            "OrderRepository (Eloquent / InMemory)",
            "EventPublisher (AMQP)"
          ]
        },
        {
          "label": "RabbitMQ",
          "boxes": [
            "cafe.events",
            "barista.queue",
            "notify.queue"
          ]
        },
        {
          "label": "Воркеры",
          "boxes": [
            "worker:barista",
            "worker:notify → Notifier"
          ]
        }
      ],
      "note": "Обратный путь: воркер бариста помечает заказ готовым и публикует order.ready, а worker:notify отправляет клиенту письмо; домен при этом ничего не знает о брокере.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "HTTP",
            "x": 14,
            "w": 300
          },
          {
            "t": "Domain",
            "x": 400,
            "w": 320
          },
          {
            "t": "Infrastructure",
            "x": 760,
            "w": 226
          }
        ],
        "nodes": [
          {
            "id": "cli",
            "t": "Клиент",
            "s": "POST /pay",
            "x": 110,
            "y": 150,
            "d": "Отправляет способ оплаты для созданного заказа: {\"method\":\"card\"}."
          },
          {
            "id": "ctl",
            "t": "PayController",
            "s": "только HTTP",
            "x": 110,
            "y": 330,
            "d": "Достаёт заказ из репозитория и передаёт Checkout. Не знает ни одной конкретной скидки или способа оплаты."
          },
          {
            "id": "chk",
            "t": "Checkout",
            "s": "DiscountPolicy → Bill",
            "x": 560,
            "y": 110,
            "d": "Собирает счёт: сумма, скидка, итог. Скидку выбирает биндинг DiscountPolicy из config('cafe.discount')."
          },
          {
            "id": "pay",
            "t": "PaymentMethod",
            "s": "Cash · Card",
            "x": 560,
            "y": 230,
            "d": "Стратегия оплаты. CardPayment ходит во внешний шлюз через интерфейс CardGateway."
          },
          {
            "id": "ord",
            "t": "Order",
            "s": "markPaid()",
            "x": 560,
            "y": 350,
            "d": "Сущность с инвариантами: статус меняется только методами с бизнес-именами, переход draft → paid проверяет OrderStatus."
          },
          {
            "id": "repo",
            "t": "OrderRepository",
            "s": "Eloquent · InMemory",
            "x": 880,
            "y": 110,
            "d": "Интерфейс save/find. В проде Eloquent и Postgres, в тестах InMemoryOrderRepository."
          },
          {
            "id": "pub",
            "t": "EventPublisher",
            "s": "order.paid",
            "x": 880,
            "y": 230,
            "d": "Публикует событие в topic-exchange cafe.events. В тестах его заменяет RecordingEventPublisher."
          },
          {
            "id": "rmq",
            "t": "RabbitMQ",
            "s": "barista · notify",
            "x": 880,
            "y": 350,
            "d": "Одна topic-exchange и две очереди: order.paid идёт в barista.queue, order.ready в notify.queue."
          },
          {
            "id": "wrk",
            "t": "Воркеры",
            "s": "barista · notify",
            "x": 880,
            "y": 470,
            "d": "Artisan-команды worker:barista и worker:notify. Бариста вызывает markReady() и публикует order.ready, notify отправляет письмо через Notifier."
          }
        ],
        "edges": [
          {
            "a": "cli",
            "b": "ctl"
          },
          {
            "a": "ctl",
            "b": "chk"
          },
          {
            "a": "chk",
            "b": "pay"
          },
          {
            "a": "pay",
            "b": "ord"
          },
          {
            "a": "ord",
            "b": "repo"
          },
          {
            "a": "ord",
            "b": "pub"
          },
          {
            "a": "pub",
            "b": "rmq"
          },
          {
            "a": "rmq",
            "b": "wrk"
          },
          {
            "a": "wrk",
            "b": "cli",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "cli",
            "txt": "Клиент вызывает POST /api/orders/{id}/pay со способом оплаты."
          },
          {
            "n": "ctl",
            "txt": "PaymentController находит заказ через OrderRepository."
          },
          {
            "n": "chk",
            "txt": "Checkout применяет DiscountPolicy и собирает Bill."
          },
          {
            "n": "pay",
            "txt": "PaymentMethod списывает итог через CardGateway."
          },
          {
            "n": "ord",
            "txt": "Только после успешной оплаты Order::markPaid(), затем save()."
          },
          {
            "n": "pub",
            "txt": "EventPublisher публикует order.paid."
          },
          {
            "n": "rmq",
            "txt": "RabbitMQ направляет событие в barista.queue."
          },
          {
            "n": "wrk",
            "txt": "worker:barista отмечает заказ готовым и публикует order.ready."
          },
          {
            "n": "cli",
            "txt": "worker:notify через Notifier отправляет клиенту письмо.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему у Money конструктор private?",
        "a": "Объект нельзя создать в обход проверки на отрицательную сумму: снаружи доступны только статические фабрики вроде rub(). Копейки хранятся целым числом, и это решение скрыто внутри класса."
      },
      {
        "q": "Почему два Money::rub(5) дают === false, а equals() true?",
        "a": "=== для объектов сравнивает идентичность, а это два разных экземпляра. equals() сравнивает содержимое, то есть копейки: Money — Value Object, у него нет идентичности, только значение."
      },
      {
        "q": "Что делает readonly и чего он не делает?",
        "a": "Свойство можно записать один раз, в конструкторе, поэтому «изменение» значения создаёт новый объект. При этом защищена только ссылка: объект внутри свойства (например, Carbon) всё равно можно мутировать."
      },
      {
        "q": "Почему Checkout резолвится контейнером без биндинга, а DiscountPolicy нужен биндинг?",
        "a": "Checkout — конкретный класс, и контейнер собирает его граф рекурсивно (autowiring). DiscountPolicy — интерфейс, контейнер не знает, какую реализацию выбрать, поэтому провайдер связывает его с политикой из config('cafe.discount')."
      },
      {
        "q": "Как feature-тест прошёл HTTP, контроллер и домен без Postgres и RabbitMQ?",
        "a": "Через $this->app->instance() подменены два объекта: OrderRepository на InMemoryOrderRepository и EventPublisher на RecordingEventPublisher. Контроллеры с самого начала зависят от интерфейсов, поэтому их менять не пришлось."
      }
    ],
    accent: '#777BB4',
  },
  {
    key: 'vue',
    titleMain: 'vue',
    title: 'Vue Lab',
    subtitle: 'Helpdesk на Vue 3',
    desc: 'Система тикетов на Vue 3 с нуля: реактивность, компоненты, слоты, Pinia, Vue Router с guard-ами, WebSocket, канбан-доска, тесты на Vitest, формы и валидация, composable-паттерны, производительность, Pinia в масштабе, доступность, i18n, безопасность, MSW и e2e на Playwright, Production Hell, итоговое ТЗ.',
    stack: ['Vue 3.5', 'Vite 7', 'Pinia 2+', 'Vue Router', 'Node'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/vue/vue-anime.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/vue/vue.html',
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
        "code": "export const useTicketsStore = defineStore('tickets', () => {\n  const items = ref([])\n  const open  = computed(() => items.value.filter(t => t.status === 'open'))\n  async function load(params) { items.value = (await api.tickets.list(params)).items }\n  return { items, open, load }\n})\n\nconst store = useTicketsStore()\nconst { items, open } = storeToRefs(store)"
      }
    ],
    sessions: [
      {
        "h": "~3 ч",
        "t": "Стенд, бэкенд, песочница реактивности, первый запрос",
        "r": "Список тикетов с API и фильтром в одном файле"
      },
      {
        "h": "~3 ч",
        "t": "Компоненты",
        "r": "Тот же список, разобранный на 8 компонентов, модалка и тосты"
      },
      {
        "h": "~3 ч",
        "t": "Pinia",
        "r": "Логин, кэш тикетов, смена статуса с откатом"
      },
      {
        "h": "~3 ч",
        "t": "Vue Router",
        "r": "Многостраничное приложение: список, тикет с вкладками, новый тикет, логин"
      },
      {
        "h": "~3,5 ч",
        "t": "Продвинутое: WebSocket, канбан, тесты, сборка",
        "r": "Канбан с живыми обновлениями, 12 тестов, production-сборка"
      },
      {
        "h": "~2,5 часа",
        "t": "Формы и валидация",
        "r": "Форма тикета с валидацией, серверными ошибками и вложением с прогрессом"
      },
      {
        "h": "~2,5 часа",
        "t": "Composable-паттерны",
        "r": "useFetch, useLocalStorage, useClipboard, Suspense, onErrorCaptured"
      },
      {
        "h": "~2,5 часа",
        "t": "Производительность",
        "r": "Список из 5000 тикетов без лагов: v-memo, shallowRef, виртуальный список"
      },
      {
        "h": "~2,5 часа",
        "t": "Pinia в большом приложении",
        "r": "Модульные store, композиция store-в-store, аудит через $subscribe/$onAction"
      },
      {
        "h": "~2,5 часа",
        "t": "Доступность",
        "r": "Focus trap, ARIA и объявления aria-live на канбане, контраст, reduced motion"
      },
      {
        "h": "~2 часа",
        "t": "Интернационализация",
        "r": "vue-i18n, множественное число, даты и числа через Intl"
      },
      {
        "h": "~2 часа",
        "t": "Безопасность фронтенда",
        "r": "Санитайзинг, токен и CSRF, CSP, защищённый WebSocket"
      },
      {
        "h": "~3 часа",
        "t": "Продвинутое тестирование",
        "r": "MSW, e2e на Playwright, надёжные тесты сокета и guard"
      },
      {
        "h": "~2 часа",
        "t": "Production Hell",
        "r": "Диагностика сломанного прод-билда; SSR и гидратация"
      },
      {
        "h": "~4 часа",
        "t": "Итоговое ТЗ",
        "r": "Модуль SLA и эскалации — без ответа"
      }
    ],
    arch: {
      "title": "Путь смены статуса на канбане",
      "rows": [
        {
          "label": "Компоненты",
          "boxes": [
            "KanbanColumn",
            "BoardView (контейнер)"
          ]
        },
        {
          "label": "Pinia",
          "boxes": [
            "ticketsStore.changeStatus",
            "byStatus (getter)",
            "uiStore.toast"
          ]
        },
        {
          "label": "API-слой",
          "boxes": [
            "ticketsApi",
            "http (fetch)"
          ]
        },
        {
          "label": "Vite proxy :5173",
          "boxes": [
            "/api",
            "/socket.io"
          ]
        },
        {
          "label": "NestJS :3000",
          "boxes": [
            "PATCH /api/tickets/:id",
            "gateway: ticket.updated"
          ]
        }
      ],
      "note": "Обратный путь: сервер рассылает по WebSocket событие ticket.updated, useSocket вызывает ticketsStore.upsert, и канбан обновляется во всех открытых вкладках.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "браузер · Vue",
            "x": 14,
            "w": 680
          },
          {
            "t": "dev-прокси и Nest",
            "x": 720,
            "w": 266
          }
        ],
        "nodes": [
          {
            "id": "kc",
            "t": "KanbanColumn",
            "s": "кнопка «→»",
            "x": 110,
            "y": 130,
            "d": "Презентационный компонент колонки. Не знает про API и store: по клику только посылает событие status-change(id, status) наверх."
          },
          {
            "id": "bv",
            "t": "BoardView",
            "s": "контейнер",
            "x": 110,
            "y": 290,
            "d": "Страница-контейнер: принимает события колонок и вызывает store. Ошибку от store превращает в тост для пользователя."
          },
          {
            "id": "toast",
            "t": "uiStore.toast",
            "s": "сообщение об ошибке",
            "x": 110,
            "y": 450,
            "d": "Тосты живут в Pinia-сторе. Компонент решает, что сказать пользователю, а откат данных делает store."
          },
          {
            "id": "tst",
            "t": "ticketsStore",
            "s": "changeStatus · upsert",
            "x": 330,
            "y": 130,
            "d": "Запоминает старый тикет, оптимистично применяет новый статус, шлёт запрос и при ошибке откатывает. upsert — единственная дверь для новых данных."
          },
          {
            "id": "api",
            "t": "ticketsApi",
            "s": "http · PATCH fetch",
            "x": 330,
            "y": 290,
            "d": "API-слой: компонент не знает URL, ticketsApi не знает про заголовки и ошибки, http не знает про тикеты."
          },
          {
            "id": "byst",
            "t": "byStatus",
            "s": "getter · TransitionGroup",
            "x": 550,
            "y": 210,
            "d": "Getter раскладывает тикеты по колонкам и пересчитывается при изменении items. TransitionGroup по key анимирует переезд карточки."
          },
          {
            "id": "sock",
            "t": "useSocket",
            "s": "socket.io-client",
            "x": 550,
            "y": 410,
            "d": "Один сокет на приложение, создаётся в корневом компоненте. Подписка ставится в onMounted, снимается в onUnmounted."
          },
          {
            "id": "px",
            "t": "Vite proxy",
            "s": "/api · /socket.io",
            "x": 880,
            "y": 130,
            "d": "Фронтенд ходит на свой же origin, Vite проксирует /api и /socket.io в контейнер api, поэтому CORS не нужен."
          },
          {
            "id": "nest",
            "t": "NestJS :3000",
            "s": "PATCH /api/tickets/:id",
            "x": 880,
            "y": 290,
            "d": "Обновляет тикет в памяти, пишет запись в историю изменений, проверяет токен и отвечает с искусственной задержкой."
          },
          {
            "id": "gw",
            "t": "Socket gateway",
            "s": "ticket.updated",
            "x": 880,
            "y": 450,
            "d": "После каждого изменения рассылает событие ticket.updated всем подключённым клиентам."
          }
        ],
        "edges": [
          {
            "a": "kc",
            "b": "bv"
          },
          {
            "a": "bv",
            "b": "tst"
          },
          {
            "a": "bv",
            "b": "toast"
          },
          {
            "a": "tst",
            "b": "byst"
          },
          {
            "a": "tst",
            "b": "api"
          },
          {
            "a": "api",
            "b": "px"
          },
          {
            "a": "px",
            "b": "nest"
          },
          {
            "a": "nest",
            "b": "gw"
          },
          {
            "a": "gw",
            "b": "sock",
            "back": true
          },
          {
            "a": "sock",
            "b": "tst",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "kc",
            "txt": "Клик по «→» на карточке: событие status-change(id, 'resolved') уходит наверх."
          },
          {
            "n": "bv",
            "txt": "BoardView вызывает ticketsStore.changeStatus(id, 'resolved')."
          },
          {
            "n": "tst",
            "txt": "Store запоминает старый тикет и оптимистично делает upsert нового статуса."
          },
          {
            "n": "byst",
            "txt": "byStatus пересчитан: карточка плавно переезжает в другую колонку."
          },
          {
            "n": "api",
            "txt": "ticketsApi.update отправляет PATCH через http."
          },
          {
            "n": "nest",
            "txt": "Vite проксирует запрос в Nest, тот пишет запись в историю и отвечает."
          },
          {
            "n": "gw",
            "txt": "Gateway рассылает событие ticket.updated."
          },
          {
            "n": "sock",
            "txt": "useSocket получает событие у всех открытых вкладок.",
            "back": true
          },
          {
            "n": "tst",
            "txt": "ticketsStore.upsert применяет серверную версию, а при ошибке PATCH старый тикет возвращается.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Что такое batching и когда нужен nextTick?",
        "a": "Vue обновляет DOM асинхронно и собирает изменения в пакет. Поэтому сразу после count++ в DOM ещё старое значение, а после await nextTick() уже новое. nextTick нужен, когда после изменения состояния надо прочитать или измерить DOM."
      },
      {
        "q": "Почему ключ по индексу в v-for — баг, а не стиль?",
        "a": "По ключу Vue сопоставляет DOM-узлы с элементами. При key=t.id заметка, введённая во втором тикете, остаётся у своего тикета после удаления первого. При ключе по индексу все последующие элементы просто меняют содержимое, и заметка переезжает на другой тикет."
      },
      {
        "q": "Что случится, если TicketCard запишет в props.selected?",
        "a": "Vue выдаст warning, а родитель ничего не узнает. Данные текут вниз через props, а вверх идут события: карточка только сообщает «меня кликнули», а выбранный тикет остаётся состоянием контейнера."
      },
      {
        "q": "Почему откат оптимистичного обновления — работа store, а тост об ошибке — работа компонента?",
        "a": "Откат должен быть виден всем, кто читает items: списку, канбану и странице тикета, а прежнюю версию знает только store. Компонент решает лишь, что сказать пользователю: store бросает исключение (данные), контейнер переводит его в тост (UI)."
      },
      {
        "q": "Почему useAuthStore() нельзя вызвать на верхнем уровне router/index.js?",
        "a": "Модуль исполняется при импорте, до app.use(pinia), и будет ошибка «getActivePinia was called with no active Pinia». Внутри колбэка beforeEach вызов происходит уже после установки Pinia, поэтому store в guard-ах нужно брать лениво."
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
    stack: ['TypeScript 6', 'Node 24+', 'Zod', 'Vitest'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/typescript/typescript.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/typescript/typescript.html',
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
    sessions: [
      {
        "h": "~2,5 ч",
        "t": "Стенд и песочница: от JS к типам",
        "r": "Пять скриптов, которые компилируются без ошибок, и первый тест"
      },
      {
        "h": "~3 ч",
        "t": "Домен склада",
        "r": "applyMovement с тестами: невозможные состояния невыразимы"
      },
      {
        "h": "~3 ч",
        "t": "Generics и типизированные абстракции",
        "r": "Сервис Warehouse из типизированных кубиков"
      },
      {
        "h": "~3,5 ч",
        "t": "CLI",
        "r": "Рабочий wh: item:add, stock:in/out/transfer/list/low, import:csv"
      },
      {
        "h": "~3,5 ч",
        "t": "Сквозная типизация",
        "r": "Тот же домен в API и в браузере с одним источником типов"
      }
    ],
    arch: {
      "title": "Путь запроса от формы до склада",
      "rows": [
        {
          "label": "web · Vue 3 + TS",
          "boxes": [
            "MovementForm",
            "StockTable",
            "request<R>"
          ]
        },
        {
          "label": "core · общие типы",
          "boxes": [
            "ApiContract",
            "MovementInputSchema (Zod)"
          ]
        },
        {
          "label": "api · Express",
          "boxes": [
            "POST /movements",
            "Zod на req.body"
          ]
        },
        {
          "label": "core · домен",
          "boxes": [
            "Warehouse",
            "applyMovement → Result"
          ]
        },
        {
          "label": "Хранилище",
          "boxes": [
            "JsonRepository<T>",
            "JSON-файлы"
          ]
        }
      ],
      "note": "Обратный путь: ошибка домена приходит как Result с ok: false (код 422), клиент возвращает её типизированной, а explainApplyError превращает в текст, как в CLI.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "web · Vue",
            "x": 14,
            "w": 200
          },
          {
            "t": "core · типы и домен",
            "x": 230,
            "w": 200
          },
          {
            "t": "api · Express",
            "x": 450,
            "w": 240
          },
          {
            "t": "данные",
            "x": 720,
            "w": 266
          }
        ],
        "nodes": [
          {
            "id": "ui",
            "t": "MovementForm",
            "s": "computed<MovementInput>",
            "x": 110,
            "y": 130,
            "d": "Vue-форма с переключаемым kind. computed собирает из плоской формы размеченное объединение MovementInput, а компилятор проверяет каждую ветку."
          },
          {
            "id": "cl",
            "t": "request<R>",
            "s": "generic-клиент",
            "x": 110,
            "y": 330,
            "d": "Клиент по ApiContract: тип ответа берётся через indexed access, а обязательность второго аргумента решает conditional type."
          },
          {
            "id": "con",
            "t": "ApiContract",
            "s": "маршрут → запрос/ответ",
            "x": 330,
            "y": 130,
            "d": "Тип в core: карта маршрутов с формой запроса и ответа. Сервер и клиент зависят от одного контракта, изменение ответа ломает компиляцию обеих сторон."
          },
          {
            "id": "sch",
            "t": "MovementInput",
            "s": "Zod · z.infer",
            "x": 330,
            "y": 290,
            "d": "Схема проверяет данные в рантайме и порождает тип MovementInput. Его используют CLI, API, клиент и Vue-форма."
          },
          {
            "id": "wh",
            "t": "Warehouse",
            "s": "applyMovement → Result",
            "x": 330,
            "y": 450,
            "d": "Сервис домена: репозитории, TypedEmitter и applyMovement, возвращающий Result<Stock, StockError> вместо исключения."
          },
          {
            "id": "ex",
            "t": "Express",
            "s": "POST /movements",
            "x": 550,
            "y": 210,
            "d": "Обработчик типизирован как Response<ApiContract[R]['response']>: если тело ответа не совпадает с контрактом, typecheck падает."
          },
          {
            "id": "zd",
            "t": "Zod на req.body",
            "s": "unknown → MovementInput",
            "x": 550,
            "y": 390,
            "d": "В типах Express req.body — any, поэтому на границе тело сразу проходит Zod. На выходе доверенный тип без as."
          },
          {
            "id": "repo",
            "t": "JsonRepository",
            "s": "Repository · guard",
            "x": 880,
            "y": 210,
            "d": "Реализация Repository<T extends Entity>: читает и пишет JSON-файл, а filter с type predicate закрывает границу файла без as."
          },
          {
            "id": "json",
            "t": "JSON-файлы",
            "s": "общие с CLI",
            "x": 880,
            "y": 400,
            "d": "Те же файлы использует CLI wh: экземпляр домена один и тот же, поэтому API и командная строка видят одинаковый склад."
          }
        ],
        "edges": [
          {
            "a": "ui",
            "b": "cl"
          },
          {
            "a": "cl",
            "b": "ex"
          },
          {
            "a": "ex",
            "b": "zd"
          },
          {
            "a": "zd",
            "b": "wh"
          },
          {
            "a": "wh",
            "b": "repo"
          },
          {
            "a": "repo",
            "b": "json"
          },
          {
            "a": "con",
            "b": "cl"
          },
          {
            "a": "con",
            "b": "ex"
          },
          {
            "a": "sch",
            "b": "zd"
          },
          {
            "a": "ex",
            "b": "cl",
            "back": true
          },
          {
            "a": "cl",
            "b": "ui",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "ui",
            "txt": "Форма собирает MovementInput из плоских полей."
          },
          {
            "n": "cl",
            "txt": "request('POST /movements', { body }): типы запроса берутся из ApiContract."
          },
          {
            "n": "ex",
            "txt": "Express принимает POST /movements."
          },
          {
            "n": "zd",
            "txt": "Zod проверяет req.body: unknown превращается в MovementInput."
          },
          {
            "n": "wh",
            "txt": "Warehouse вызывает applyMovement и получает Result<Stock, StockError>."
          },
          {
            "n": "repo",
            "txt": "JsonRepository сохраняет новый снимок склада в JSON-файл."
          },
          {
            "n": "ex",
            "txt": "res.json(Result): при нехватке остатка тело с ok: false уходит с кодом 422.",
            "back": true
          },
          {
            "n": "cl",
            "txt": "Клиент возвращает типизированный Result, а не бросает исключение.",
            "back": true
          },
          {
            "n": "ui",
            "txt": "explainApplyError превращает код ошибки в текст под формой.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Куда деваются типы после компиляции и что из этого следует для JSON, argv и HTTP?",
        "a": "Компилятор tsc проверяет типы и выбрасывает их, в рантайме работает обычный JS без проверок. Поэтому всё, что приходит извне (JSON, argv, файл, HTTP), имеет тип unknown, и проверять это нужно кодом, например Zod, а не объявлять."
      },
      {
        "q": "Как assertNever превращает пропущенный вариант в ошибку компиляции?",
        "a": "В default-ветке switch переменная должна иметь тип never. Если в размеченное объединение добавили новый вариант, а ветку не написали, в default попадёт непустой тип, и компилятор укажет точное место. Так добавление пятого варианта Movement сразу подсвечивает оба switch, где его забыли."
      },
      {
        "q": "Почему Result лучше исключений для ожидаемых отказов и хуже для неожиданных?",
        "a": "Исключение не видно в сигнатуре, а Result<Stock, StockError> — часть типа, и компилятор заставляет проверить ok. Поэтому ожидаемые отказы бизнес-логики возвращают Result, а неожиданное (баг, сбой I/O) остаётся исключением. Цена Result — многословность: if (!r.ok) return r на каждом шаге."
      },
      {
        "q": "Почему обычный Omit ломает union, а DistributiveOmit нет?",
        "a": "Omit<A | B, K> сначала объединяет A и B в общую форму, теряя различия вариантов, и только потом убирает ключи. Распределительная версия применяется к каждому варианту отдельно, поэтому размеченное объединение остаётся размеченным."
      },
      {
        "q": "Как один тип MovementInput используется в CLI, API, клиенте и Vue, и что упадёт при изменении схемы?",
        "a": "Тип выведен из Zod-схемы в core: CLI берёт его для CSV, API для тела запроса, клиент для аргумента request, Vue-форма для emit и computed. При изменении схемы упадёт компиляция во всех четырёх местах сразу, а не в проде."
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
    stack: ['Laravel 13', 'PostgreSQL 18', 'Redis', 'RabbitMQ', 'Reverb'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/laravel/laravel.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/laravel/laravel.html',
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
        "code": "return Cache::lock(\"invite:{$workspace->id}:{$email}\", seconds: 10)->block(3, function () use ($workspace, $email) {\n    if ($workspace->invitations()->where('email', $email)->whereNull('accepted_at')->exists()) {\n        throw new \\RuntimeException('Приглашение уже отправлено и ожидает принятия');\n    }\n    // создаём приглашение и ставим письмо в очередь\n});"
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
    sessions: [
      {
        "h": "~2 ч",
        "t": "Стенд, схема данных, миграции",
        "r": "Docker-стенд с Laravel 13, RabbitMQ, Redis и Mailpit, схема из 20 таблиц"
      },
      {
        "h": "~3,5 ч",
        "t": "Eloquent: связи, pivot, N+1",
        "r": "Связи и pivot разобраны по SQL-логу, N+1 воспроизведён и исправлен, свой Membership-pivot"
      },
      {
        "h": "~2,5 ч",
        "t": "Коллекции, API Resources, пагинация",
        "r": "Групповые операции над коллекциями, ресурсы с whenLoaded и три вида пагинации"
      },
      {
        "h": "~3 ч",
        "t": "HTTP-слой: middleware, Form Requests, исключения",
        "r": "Полноценный CRUD задач с валидацией, middleware роли и единым форматом ошибок"
      },
      {
        "h": "~3 ч",
        "t": "Service Container и провайдеры",
        "r": "bind/call вживую, интерфейс TaskNotifier с биндингом и contextual binding"
      },
      {
        "h": "~4 ч",
        "t": "Auth: Sanctum, Gate и Policy, Vue-фронт",
        "r": "Вход через сессию и CSRF, политики по ролям, доска на Vue и приглашения по токену"
      },
      {
        "h": "~3,5 ч",
        "t": "События, Observers, очереди на RabbitMQ",
        "r": "Observer, Event с независимыми Listeners и Job с ретраями на очереди RabbitMQ"
      },
      {
        "h": "~3 ч",
        "t": "Почта, уведомления, планировщик",
        "r": "Markdown-письма через очередь, Notification в почту и БД, дайджест по расписанию"
      },
      {
        "h": "~3,5 ч",
        "t": "Кэш на Redis, rate limiting, Reverb",
        "r": "Кэш с инвалидацией, Cache::lock, лимиты запросов и доска, обновляемая по WebSocket"
      },
      {
        "h": "~4 ч",
        "t": "Тестирование и финал",
        "r": "Фабрики, Feature-тесты с RefreshDatabase, fakes и финальный прогон всего проекта"
      }
    ],
    arch: {
      "title": "Путь события от запроса до браузера",
      "rows": [
        {
          "label": "Браузер · Vue + Echo",
          "boxes": [
            "Доска задач",
            "Laravel Echo"
          ]
        },
        {
          "label": "HTTP-слой Laravel",
          "boxes": [
            "auth:sanctum · throttle",
            "Form Request",
            "Policy"
          ]
        },
        {
          "label": "Приложение",
          "boxes": [
            "TaskController",
            "TaskAssigner",
            "Event TaskAssigned",
            "Listeners (ShouldQueue)"
          ]
        },
        {
          "label": "Очередь",
          "boxes": [
            "RabbitMQ",
            "queue:work"
          ]
        },
        {
          "label": "Результат",
          "boxes": [
            "Mailpit",
            "таблица notifications",
            "Reverb (WebSocket)"
          ]
        }
      ],
      "note": "Обратный путь: воркер берёт job из RabbitMQ, а Reverb доставляет событие в браузер; ловушка — массовый Query update обходит Observer и события.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "HTTP-слой",
            "x": 14,
            "w": 300
          },
          {
            "t": "приложение",
            "x": 400,
            "w": 320
          },
          {
            "t": "инфраструктура",
            "x": 760,
            "w": 226
          }
        ],
        "nodes": [
          {
            "id": "vue",
            "t": "Vue + Echo",
            "s": "доска задач",
            "x": 110,
            "y": 110,
            "d": "Vue-доска отправляет запрос с cookie и X-XSRF-TOKEN и слушает приватный канал через Laravel Echo."
          },
          {
            "id": "mw",
            "t": "Middleware",
            "s": "auth:sanctum · throttle",
            "x": 110,
            "y": 230,
            "d": "Определяет пользователя по сессии Sanctum и применяет лимит запросов throttle."
          },
          {
            "id": "fr",
            "t": "FormRequest",
            "s": "authorize · rules",
            "x": 110,
            "y": 350,
            "d": "Form Request резолвится до контроллера: authorize() даёт 403, rules() даёт 422 с errors."
          },
          {
            "id": "ctl",
            "t": "TaskController",
            "s": "TaskAssigner",
            "x": 560,
            "y": 110,
            "d": "Проверяет Policy, назначает исполнителя и записывает результат в PostgreSQL."
          },
          {
            "id": "ev",
            "t": "TaskAssigned",
            "s": "Event",
            "x": 560,
            "y": 230,
            "d": "Событие сообщает, что произошло назначение. Реакций несколько, и они не знают друг о друге."
          },
          {
            "id": "lst",
            "t": "Listeners",
            "s": "ShouldQueue",
            "x": 560,
            "y": 350,
            "d": "Независимые слушатели: уведомление исполнителя и наблюдателей. SerializesModels кладёт в очередь только id модели."
          },
          {
            "id": "db",
            "t": "PostgreSQL",
            "s": "20 таблиц",
            "x": 880,
            "y": 110,
            "d": "Хранит задачи, воркспейсы и pivot-таблицу workspace_user с ролью."
          },
          {
            "id": "rmq",
            "t": "RabbitMQ",
            "s": "очередь jobs",
            "x": 880,
            "y": 230,
            "d": "Драйвер очереди: сюда попадают job-ы слушателей, при сбоях после tries они уходят в failed_jobs."
          },
          {
            "id": "wrk",
            "t": "queue:work",
            "s": "воркер · retry",
            "x": 880,
            "y": 350,
            "d": "Забирает job из RabbitMQ, выполняет, при успехе подтверждает, при ошибке повторяет с backoff. Письма уходят в Mailpit."
          },
          {
            "id": "rvb",
            "t": "Reverb",
            "s": "WebSocket",
            "x": 880,
            "y": 470,
            "d": "WebSocket-сервер Laravel. Событие ShouldBroadcastAfterCommit уходит подписчикам приватного канала воркспейса."
          }
        ],
        "edges": [
          {
            "a": "vue",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "fr"
          },
          {
            "a": "fr",
            "b": "ctl"
          },
          {
            "a": "ctl",
            "b": "db"
          },
          {
            "a": "ctl",
            "b": "ev"
          },
          {
            "a": "ev",
            "b": "lst"
          },
          {
            "a": "lst",
            "b": "rmq"
          },
          {
            "a": "rmq",
            "b": "wrk"
          },
          {
            "a": "wrk",
            "b": "rvb"
          },
          {
            "a": "rvb",
            "b": "vue",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "vue",
            "txt": "Пользователь меняет исполнителя задачи, Vue шлёт запрос с cookie и CSRF-токеном."
          },
          {
            "n": "mw",
            "txt": "auth:sanctum узнаёт пользователя, throttle считает запросы."
          },
          {
            "n": "fr",
            "txt": "Form Request проверяет права и правила, иначе 403 или 422."
          },
          {
            "n": "ctl",
            "txt": "Контроллер через Policy назначает исполнителя и пишет в БД."
          },
          {
            "n": "ev",
            "txt": "Диспатчится TaskAssigned, слушатели ставят job-ы в очередь."
          },
          {
            "n": "rmq",
            "txt": "Job-ы ждут в RabbitMQ, ответ API уже ушёл клиенту."
          },
          {
            "n": "wrk",
            "txt": "queue:work выполняет job: письмо в Mailpit, запись в notifications."
          },
          {
            "n": "rvb",
            "txt": "Reverb рассылает событие по приватному каналу.",
            "back": true
          },
          {
            "n": "vue",
            "txt": "Echo получает событие, доска обновляется без перезагрузки.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Чем register() отличается от boot() в провайдере?",
        "a": "В register() допустимы только биндинги в контейнер: обращение к другому сервису опасно, он может быть ещё не зарегистрирован. Всё остальное (маршруты, макросы, Gate::define, Model::preventLazyLoading, наблюдатели) делается в boot()."
      },
      {
        "q": "Чем $model->relation отличается от $model->relation()?",
        "a": "Со скобками возвращается объект связи, к нему можно дописать ->where(...). Без скобок срабатывает __get: выполняется запрос, результат кладётся в $model->relations и при повторном обращении SQL не повторяется. Эта ленивая загрузка в цикле и порождает N+1."
      },
      {
        "q": "Когда Observer «промолчит»?",
        "a": "Observer срабатывает только при работе через экземпляр модели. Массовые Model::where(...)->update() и ->delete() идут прямым SQL и обходят события, поэтому активность не запишется, а кэш с инвалидацией в Observer протухнет только по TTL."
      },
      {
        "q": "Какую проблему решает ShouldBeUnique и где хранится лок?",
        "a": "Если за секунду назначить пятерых исполнителей, вместо пяти одинаковых job-ов пересчёта статистики в очередь попадёт один, пока предыдущий не завершится. Лок хранится в кэше, то есть в Redis."
      },
      {
        "q": "Зачем Cache::lock при двух одновременных запросах?",
        "a": "Без лока оба запроса одновременно проходят проверку «приглашения ещё нет» и оба создают запись, это классическая гонка check-then-act. С lock()->block(3, ...) второй запрос ждёт до 3 секунд и после освобождения уже видит запись первого."
      }
    ],
    accent: '#FF2D20',
  },
  {
    key: 'docker',
    titleMain: 'docker',
    title: 'Docker Lab',
    subtitle: 'Контейнеры, образы, Compose, registry и CI — от первого docker run до релиза',
    desc: 'Docker с нуля до релиза: контейнеры и их жизненный цикл, образы и слои, Dockerfile, multi-stage и безопасность, сети, тома, Compose, registry, GitHub Actions, итоговый стек CoffeeShop.',
    stack: ['Docker 29', 'Docker Compose', 'GitHub Actions', 'Node.js 24', 'PostgreSQL 18', 'nginx 1.30'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/docker/docker.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/docker/docker.html',
    repo: 'https://github.com/meeymirita/docker-lab',
    stackInfo: [
      {
        "tag": "контейнеры",
        "back": "Контейнеры, образы, слои, сети и тома: основа всей лабы, с наглядными схемами в каждом шаге."
      },
      {
        "tag": "Dockerfile",
        "back": "Кэш слоёв, exec-форма и exec \"$@\", multi-stage, BuildKit, не-root, distroless, сканер Trivy."
      },
      {
        "tag": "Compose",
        "back": "Весь стек одним файлом: healthcheck и depends_on, профили, override, watch, лимиты, dev и prod."
      },
      {
        "tag": "registry и CI",
        "back": "Свой registry, GHCR, теги и digest, git-теги, GitHub Actions; релиз стека из готовых образов."
      },
      {
        "tag": "сквозной проект",
        "back": "CoffeeShop: nginx + Node.js API + PostgreSQL 18 + Adminer; в конце — проверенный starter/ для Traefik, Kubernetes и Ansible."
      },
      {
        "tag": "веб-сервер",
        "back": "nginx 1.30 раздаёт сайт и проксирует API; конфигурация и права в контейнере разбираются в сессиях 5–6."
      }
    ],
    learn: [
      {
        "tab": "Слои и кэш",
        "title": "Порядок инструкций решает скорость сборки",
        "text": "Каждая инструкция Dockerfile — слой, а изменённый слой сбрасывает кэш всех слоёв ниже. Поэтому сначала копируют только файлы зависимостей и ставят пакеты, а код — после.",
        "points": [
          "Образ — стопка слоёв только для чтения",
          "COPY . . до npm ci заново ставит пакеты при каждой правке",
          "Удаление файла в следующем слое образ не уменьшает"
        ],
        "code": "FROM node:24-alpine\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\nCOPY server.js ./\nUSER node\nCMD [\"node\", \"server.js\"]"
      },
      {
        "tab": "exec \"$@\"",
        "title": "Одно слово между быстрой остановкой и десятью секундами",
        "text": "docker stop шлёт SIGTERM процессу с PID 1. Если entrypoint-скрипт запускает приложение без exec, PID 1 остаётся у sh, сигнал не доходит до Node, и через 10 секунд приходит SIGKILL (код 137).",
        "points": [
          "ENTRYPOINT + CMD — всегда в exec-форме",
          "exec заменяет скрипт приложением",
          "Проверка: время docker stop и код выхода"
        ],
        "code": "#!/bin/sh\nset -e\necho \"[entrypoint] режим: ${APP_ENV:-dev}\"\nexec \"$@\"   # без exec: stop = 10 с и код 137"
      },
      {
        "tab": "Multi-stage",
        "title": "Сборка отдельно, запуск отдельно",
        "text": "В итоговый образ попадает только последний этап. Инструменты сборки остаются на «стройке»; distroless-образ без оболочки и npm не содержит и уязвимостей этих пакетов.",
        "points": [
          "COPY --from=этап переносит результат",
          "Итоговый образ работает от nonroot",
          "Trivy: у старого образа 8 HIGH, у distroless — 0"
        ],
        "code": "FROM node:24-alpine AS deps\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --omit=dev\n\nFROM gcr.io/distroless/nodejs24-debian13\nWORKDIR /app\nCOPY --from=deps /app/node_modules ./node_modules\nCOPY package.json server.js ./\nUSER nonroot\nCMD [\"server.js\"]"
      },
      {
        "tab": "Тома и данные",
        "title": "Данные переживают контейнер",
        "text": "Файловая система контейнера исчезает вместе с ним. У PostgreSQL 18 том монтируется в /var/lib/postgresql: старый путь /var/lib/postgresql/data образ отвергает.",
        "points": [
          "Именованный том для базы, bind mount для файлов хоста",
          "Анонимные тома «осиротевают» после docker rm",
          "pg_dump — бэкап, том бэкапом не является"
        ],
        "code": "docker volume create coffee-pgdata\ndocker run -d --name pg \\\n  -e POSTGRES_PASSWORD=secret \\\n  -v coffee-pgdata:/var/lib/postgresql \\\n  postgres:18"
      },
      {
        "tab": "Сети и DNS",
        "title": "Имена вместо IP, изоляция вместо открытых портов",
        "text": "В пользовательской сети работает встроенный DNS: api находит db по имени. Две сети (front и back) не дают сайту видеть базу, а у базы нет опубликованных портов.",
        "points": [
          "В сети bridge по умолчанию DNS по именам нет",
          "-p публикует порт, EXPOSE — только подсказка",
          "Диагностика: ps -a → logs → network inspect → nslookup"
        ],
        "code": "docker network create coffee-front\ndocker network create coffee-back\ndocker run -d --name db  --network coffee-back  postgres:18\ndocker run -d --name api --network coffee-back  coffee-api\ndocker network connect coffee-front api"
      },
      {
        "tab": "Compose и healthcheck",
        "title": "«Запущен» не значит «готов»",
        "text": "Обычный depends_on ждёт только старта контейнера, а база ещё инициализируется — отсюда ECONNREFUSED. healthcheck и condition: service_healthy ждут настоящей готовности.",
        "points": [
          "Знак $$ в healthcheck.test: подстановку делает оболочка в контейнере",
          "Профили, override и prod-накладка: один набор файлов на все режимы",
          "restart, лимиты памяти, ограничение логов — в compose.prod.yaml"
        ],
        "code": "db:\n  healthcheck:\n    test: [\"CMD-SHELL\", \"pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}\"]\n    interval: 2s\n    retries: 15\napi:\n  depends_on:\n    db:\n      condition: service_healthy"
      }
    ],
    sessions: [
      {
        "h": "~3,5 ч",
        "t": "Азбука контейнеров и установка",
        "r": "docker run hello-world по шагам; путь команды docker → dockerd → containerd → runc; namespaces и cgroups показаны запуском"
      },
      {
        "h": "~3,5 ч",
        "t": "Контейнеры и жизненный цикл",
        "r": "nginx в фоне с пробросом порта; logs, exec, cp, inspect; коды выхода 137 и 143; починен контейнер, который сразу Exited"
      },
      {
        "h": "~3,5 ч",
        "t": "Образы",
        "r": "Слои, теги и digest, save/load; выбор базы alpine/slim/distroless; первый Dockerfile и найденный «раздувшийся» слой"
      },
      {
        "h": "~4 ч",
        "t": "Dockerfile полностью",
        "r": "CoffeeShop API в образе: порядок слоёв и кэш, .dockerignore, USER node, exec \"$@\" и остановка за доли секунды"
      },
      {
        "h": "~4 ч",
        "t": "Multi-stage, BuildKit, безопасность",
        "r": "API на distroless без уязвимостей, сайт двумя этапами на nginx, секрет сборки, read-only и cap-drop, Trivy"
      },
      {
        "h": "~3,5 ч",
        "t": "Сети",
        "r": "bridge, DNS по имени, две сети front/back: БД без опубликованного порта; диагностика «A не видит B»"
      },
      {
        "h": "~3,5 ч",
        "t": "Хранение данных",
        "r": "Тома, bind mount, tmpfs, права и UID; бэкап PostgreSQL 18 и восстановление; три поломки: старый путь тома, анонимный том, Is a directory"
      },
      {
        "h": "~4 ч",
        "t": "Docker Compose, часть 1",
        "r": "YAML, команды, переменные и .env, healthcheck с service_healthy; полный стек CoffeeShop одной командой, заказы переживают down"
      },
      {
        "h": "~4 ч",
        "t": "Docker Compose, часть 2",
        "r": "Профили, override, extends/include, watch, restart и лимиты, --scale; dev и prod одним репозиторием; Production Hell 1"
      },
      {
        "h": "~4 ч",
        "t": "Registry, GHCR, CI",
        "r": "Свой registry и приватный registry с паролем, теги и digest, git-теги, workflow GitHub Actions; GHCR — самостоятельно"
      },
      {
        "h": "~4 ч",
        "t": "Итоговый проект CoffeeShop",
        "r": "Образы без root и без уязвимостей, prod с read_only и лимитами, чек-лист релиза скриптом, запуск из registry, starter/; Production Hell 2"
      },
      {
        "h": "~3 ч",
        "t": "Итоговое задание",
        "r": "Сервисы report (отчёт в CSV) и backup (pg_dump с ротацией) по ТЗ, без готового ответа"
      }
    ],
    arch: {
      "title": "CoffeeShop: две сети, БД закрыта от внешнего мира",
      "rows": [
        {
          "label": "Хост (Mac)",
          "boxes": [
            "curl localhost:8080",
            ".env"
          ]
        },
        {
          "label": "Сеть coffee-front",
          "boxes": [
            "web: nginx-unprivileged",
            "api (distroless, nonroot)"
          ]
        },
        {
          "label": "Сеть coffee-back",
          "boxes": [
            "api",
            "db: postgres:18 + healthcheck",
            "adminer (только dev)"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "именованный том pgdata",
            "db/init.sql (только для пустого тома)"
          ]
        },
        {
          "label": "Релиз",
          "boxes": [
            "git tag v1.0.0",
            "GitHub Actions",
            "GHCR → compose.release.yaml"
          ]
        }
      ],
      "note": "Опубликован только порт сайта: у db и api нет -p. Сайт не видит базу: api подключён к обеим сетям и служит посредником.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "хост",
            "x": 14,
            "w": 190
          },
          {
            "t": "сеть coffee-front",
            "x": 240,
            "w": 330
          },
          {
            "t": "сеть coffee-back · данные",
            "x": 590,
            "w": 396
          }
        ],
        "nodes": [
          {
            "id": "curl",
            "t": "curl :8080",
            "s": "запрос с хоста",
            "x": 110,
            "y": 150,
            "d": "Единственный вход снаружи: порт сайта, опубликованный через ports в compose.yaml."
          },
          {
            "id": "env",
            "t": ".env",
            "s": "DB_PASSWORD, WEB_PORT",
            "x": 110,
            "y": 380,
            "d": "Значения для интерполяции в compose.yaml; файл в .gitignore, в git идёт .env.example."
          },
          {
            "id": "web",
            "t": "web",
            "s": "nginx, порт 8080",
            "x": 330,
            "y": 150,
            "d": "nginx-unprivileged работает не от root и слушает 8080; /api/ перенаправляет на api (proxy_pass и resolver 127.0.0.11)."
          },
          {
            "id": "api",
            "t": "api",
            "s": "Node, nonroot",
            "x": 480,
            "y": 270,
            "d": "Distroless-образ без оболочки; подключён к front и к back, ждёт healthy у db; healthcheck написан на самом Node."
          },
          {
            "id": "db",
            "t": "db",
            "s": "postgres:18",
            "x": 700,
            "y": 150,
            "d": "Без опубликованных портов; healthcheck pg_isready; init.sql выполняется только в пустом томе."
          },
          {
            "id": "adm",
            "t": "adminer",
            "s": "127.0.0.1:8081",
            "x": 880,
            "y": 150,
            "d": "Веб-интерфейс к базе только для разработки (compose.override.yaml), порт доступен лишь с localhost."
          },
          {
            "id": "vol",
            "t": "pgdata",
            "s": "named volume",
            "x": 800,
            "y": 380,
            "d": "Том на /var/lib/postgresql (PostgreSQL 18): данные переживают docker compose down; down -v их стирает."
          },
          {
            "id": "reg",
            "t": "GHCR",
            "s": "образы по тегу",
            "x": 330,
            "y": 440,
            "d": "git-тег v1.0.0 запускает workflow: образы api и web публикуются как 1.0.0, 1.0, 1; сервер запускает их через compose.release.yaml."
          }
        ],
        "edges": [
          {
            "a": "curl",
            "b": "web"
          },
          {
            "a": "env",
            "b": "web"
          },
          {
            "a": "web",
            "b": "api"
          },
          {
            "a": "api",
            "b": "db"
          },
          {
            "a": "adm",
            "b": "db"
          },
          {
            "a": "db",
            "b": "vol"
          },
          {
            "a": "reg",
            "b": "api"
          }
        ],
        "flow": [
          {
            "n": "env",
            "txt": "Compose подставляет значения из .env и поднимает сервисы в порядке зависимостей."
          },
          {
            "n": "db",
            "txt": "db стартует первой; healthcheck pg_isready решает, когда её можно считать готовой."
          },
          {
            "n": "api",
            "txt": "api стартует после healthy у db и сам проходит healthcheck."
          },
          {
            "n": "web",
            "txt": "web стартует после healthy у api."
          },
          {
            "n": "curl",
            "txt": "Запрос с хоста идёт на порт сайта."
          },
          {
            "n": "web",
            "txt": "nginx отдаёт страницу или пересылает /api/… на api по имени сервиса."
          },
          {
            "n": "api",
            "txt": "api читает меню и пишет заказы в db по сети back."
          },
          {
            "n": "vol",
            "txt": "Данные лежат в томе pgdata и переживают пересоздание контейнеров."
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему docker stop иногда занимает 10 секунд и заканчивается кодом 137?",
        "a": "Docker шлёт SIGTERM процессу с PID 1. Если PID 1 — скрипт или программа без обработчика SIGTERM, сигнал игнорируется, и через 10 секунд приходит SIGKILL (128 + 9 = 137). Лечение: exec-форма CMD и exec \"$@\" в конце entrypoint-скрипта."
      },
      {
        "q": "Чем «контейнер запущен» отличается от «сервис готов» и как это решает Compose?",
        "a": "Обычный depends_on ждёт старта контейнера, а PostgreSQL ещё инициализируется и отвечает ECONNREFUSED. healthcheck у базы и depends_on с condition: service_healthy заставляют зависимый сервис ждать настоящей готовности."
      },
      {
        "q": "Почему удаление файла отдельной инструкцией RUN не уменьшает образ?",
        "a": "Слои неизменяемы: следующий слой лишь помечает файл удалённым, а слой с самим файлом остаётся в образе. Создавать и удалять временное нужно в одной инструкции RUN, а для сборки — использовать multi-stage."
      },
      {
        "q": "Куда монтировать том для PostgreSQL 18 и что будет при старом пути?",
        "a": "В /var/lib/postgresql: образ 18+ кладёт данные в подкаталог версии (18/docker). При монтировании в старый /var/lib/postgresql/data контейнер завершается с ошибкой «unused mount/volume» и просит один том на /var/lib/postgresql."
      },
      {
        "q": "Почему latest в продакшне — ловушка и чем её заменить?",
        "a": "Тег latest — подвижная метка: сегодня он указывает на один образ, завтра на другой. Для воспроизводимости используют точные семантические теги (1.0.0) и при необходимости digest; точный тег никогда не перезаписывают, поэтому откат — смена номера версии."
      }
    ],
    accent: '#2496ED',
  },
  {
    key: 'php',
    titleMain: 'php',
    title: 'Чистый PHP Lab',
    subtitle: 'Фундамент без фреймворка',
    desc: 'Чистый PHP 8.4 без фреймворка: strict_types и copy-on-write массивы, суперглобалы, замыкания и генераторы, магические методы — и своими руками роутер, DI-контейнер, PDO-слой, сессии и CSRF, валидация и пагинация, идемпотентные запросы, итоговое ТЗ.',
    stack: ['PHP 8.4', 'PDO', 'PostgreSQL', 'Composer (PSR-4)', 'PHPUnit'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/php/php.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/php/php.html',
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
      },
      {
        "tag": "тесты",
        "back": "Несколько тестов PHPUnit к финальному REST API (сессия 8), например для роутера."
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
    sessions: [
      {
        "h": "~2 ч",
        "t": "Стенд, типы, strict_types, == vs ===",
        "r": "Таблица сравнений PHP 7 и PHP 8 воспроизведена вживую"
      },
      {
        "h": "~2,5 ч",
        "t": "Массивы (copy-on-write) и строки",
        "r": "Доказан момент физического копирования, mb_* сравнены со strlen на кириллице"
      },
      {
        "h": "~2,5 ч",
        "t": "Суперглобалы и обработка ошибок",
        "r": "Свой разбор JSON-запроса без фреймворка и глобальный exception handler"
      },
      {
        "h": "~3 ч",
        "t": "Замыкания, генераторы, магия, современный синтаксис",
        "r": "Мини-фасад на __callStatic и генератор для больших данных"
      },
      {
        "h": "~3 ч",
        "t": "Composer + свой роутер",
        "r": "PSR-4 автозагрузка и маршрутизация с параметрами пути"
      },
      {
        "h": "~3,5 ч",
        "t": "Свой DI-контейнер: то, что видели как потребители в OOP-лабе (php-coffee)",
        "r": "Autowiring через Reflection: конструкторы резолвятся сами"
      },
      {
        "h": "~3,5 ч",
        "t": "PDO, сессии, CSRF, .env",
        "r": "Prepared statements, транзакция, свой CSRF-токен и свой .env-парсер"
      },
      {
        "h": "~4 ч",
        "t": "Финал: REST API + сравнение с Laravel",
        "r": "Рабочий API кофейни, middleware-цепочка и таблица «что Laravel даёт бесплатно»"
      },
      {
        "h": "~3 ч",
        "t": "Входные данные, выборки и повторные запросы",
        "r": "Валидатор с ошибками по полям, пагинация и фильтр с потолком, SQL-инъекция в ORDER BY и белый список, идемпотентный POST через Idempotency-Key"
      },
      {
        "h": "~3 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового ответа: отчёт по продажам и отмена заказа"
      }
    ],
    arch: {
      "title": "Путь запроса без фреймворка",
      "rows": [
        {
          "label": "Веб-сервер",
          "boxes": [
            "php -S localhost:8000",
            "public/index.php"
          ]
        },
        {
          "label": "Своя инфраструктура",
          "boxes": [
            "Container (autowiring)",
            "Router",
            "Middleware-цепочка"
          ]
        },
        {
          "label": "Приложение",
          "boxes": [
            "MenuController",
            "OrderController",
            "Domain: Drink, Order, Money"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "PdoConnection",
            "PostgreSQL 18"
          ]
        },
        {
          "label": "Ответ",
          "boxes": [
            "Response::json"
          ]
        }
      ],
      "note": "Обратный путь: контроллер возвращает Response::json, и ответ проходит middleware в обратном порядке; ловушка — интерфейс контейнер не разрешит без явного bind.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "вход",
            "x": 14,
            "w": 300
          },
          {
            "t": "своё приложение",
            "x": 400,
            "w": 320
          },
          {
            "t": "данные",
            "x": 760,
            "w": 226
          }
        ],
        "nodes": [
          {
            "id": "cli",
            "t": "Клиент",
            "s": "GET /orders/7",
            "x": 110,
            "y": 110,
            "d": "Обычный HTTP-запрос к встроенному dev-серверу PHP."
          },
          {
            "id": "idx",
            "t": "public/index.php",
            "s": "php -S · вход",
            "x": 110,
            "y": 230,
            "d": "Единственная точка входа: создаёт контейнер и роутер, подключает маршруты и вызывает dispatch()."
          },
          {
            "id": "cont",
            "t": "Container",
            "s": "autowiring · Reflection",
            "x": 110,
            "y": 350,
            "d": "Читает конструктор через ReflectionClass и рекурсивно собирает зависимости. Интерфейсы требуют явного bind."
          },
          {
            "id": "rtr",
            "t": "Router",
            "s": "/orders/{id} → regex",
            "x": 560,
            "y": 110,
            "d": "Превращает шаблон пути в регулярное выражение, находит маршрут и вытаскивает параметры."
          },
          {
            "id": "mw",
            "t": "Middleware",
            "s": "цепочка array_reduce",
            "x": 560,
            "y": 230,
            "d": "Цепочка обёрток вокруг контроллера: обработка ошибок, разбор JSON-тела, CORS."
          },
          {
            "id": "ctl",
            "t": "Controller",
            "s": "Menu · Order",
            "x": 560,
            "y": 350,
            "d": "Контроллер получает зависимости от контейнера, вызывает доменную логику и репозиторий."
          },
          {
            "id": "res",
            "t": "Response",
            "s": "json · код статуса",
            "x": 560,
            "y": 470,
            "d": "Собирает JSON-ответ и код статуса; внутренние ошибки скрываются за общим сообщением."
          },
          {
            "id": "pdo",
            "t": "PdoConnection",
            "s": "prepared statements",
            "x": 880,
            "y": 230,
            "d": "Обёртка над PDO: параметры отправляются отдельно от текста SQL, есть транзакции с rollBack."
          },
          {
            "id": "pg",
            "t": "PostgreSQL 18",
            "s": "drinks · orders",
            "x": 880,
            "y": 390,
            "d": "Хранит таблицы drinks, orders и order_lines."
          }
        ],
        "edges": [
          {
            "a": "cli",
            "b": "idx"
          },
          {
            "a": "idx",
            "b": "rtr"
          },
          {
            "a": "idx",
            "b": "cont"
          },
          {
            "a": "rtr",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "ctl"
          },
          {
            "a": "cont",
            "b": "ctl"
          },
          {
            "a": "ctl",
            "b": "pdo"
          },
          {
            "a": "pdo",
            "b": "pg"
          },
          {
            "a": "ctl",
            "b": "res"
          },
          {
            "a": "res",
            "b": "cli",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "cli",
            "txt": "Клиент отправляет запрос на встроенный сервер php -S."
          },
          {
            "n": "idx",
            "txt": "public/index.php создаёт Container и Router."
          },
          {
            "n": "rtr",
            "txt": "Router->dispatch() находит маршрут и параметры пути."
          },
          {
            "n": "cont",
            "txt": "Container->make() собирает контроллер вместе с зависимостями."
          },
          {
            "n": "mw",
            "txt": "Запрос проходит цепочку middleware."
          },
          {
            "n": "ctl",
            "txt": "Контроллер выполняет действие."
          },
          {
            "n": "pdo",
            "txt": "PdoConnection выполняет prepared statement в PostgreSQL."
          },
          {
            "n": "res",
            "txt": "Response::json собирает ответ.",
            "back": true
          },
          {
            "n": "cli",
            "txt": "Ответ возвращается клиенту через middleware.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Что такое copy-on-write и когда массив физически копируется?",
        "a": "При $b = $a оба имени указывают на одну структуру данных с refcount. Настоящая копия делается лениво, в момент первой попытки изменить один из массивов, например $b[] = 4. Если только читать, копирования не будет вообще."
      },
      {
        "q": "Выполнится ли finally, если в try был return или исключение не поймано?",
        "a": "Да, finally выполняется в обоих случаях. При непойманном исключении оно продолжает лететь вверх по стеку до set_exception_handler, поэтому запись из finally в логе идёт раньше записи обработчика."
      },
      {
        "q": "Почему интерфейс нельзя разрешить через Reflection без явного биндинга?",
        "a": "Reflection видит только тип параметра и не может угадать, какую из возможных реализаций интерфейса выбрать. Конкретные классы контейнер собирает сам, рекурсивно читая конструкторы, а для интерфейса нужен bind."
      },
      {
        "q": "Как prepared statement защищает от SQL-инъекции?",
        "a": "prepare() отправляет шаблон SQL и значения параметров раздельно, и драйвер получает ввод как одно строковое значение, а не как код. При конкатенации апостроф в вводе закрывает литерал, и остаток становится исполняемым SQL."
      },
      {
        "q": "Зачем hash_equals, если можно сравнить строки через ===?",
        "a": "hash_equals сравнивает строки за константное время, а === останавливается на первом несовпадающем байте. По разнице во времени ответа атакующий теоретически может подбирать токен побайтово (timing attack)."
      }
    ],
    accent: '#C9A876',
  },
  {
    key: 'js',
    titleMain: 'js',
    title: 'Чистый JS Lab',
    subtitle: 'Vanilla Helpdesk — фундамент без фреймворка',
    desc: 'Чистый JavaScript с нуля — общий фундамент для Vue и TypeScript: var/let/const и hoisting, this и замыкания, прототипы и class, event loop и async/await, DOM без фреймворка, ESM-модули, своя реактивность на Proxy, финальное мини-SPA с явным сравнением с Vue, надёжная асинхронность (Promise.all/allSettled, повторы, пул), итоговое ТЗ.',
    stack: ['JavaScript ES2022', 'Node.js 24+', 'json-server', 'node:test', 'Docker'],
    difficulty: 'Средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/js/JavaScript.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/js/js.html',
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
    sessions: [
      {
        "h": "~2 ч",
        "t": "Переменные, область видимости, hoisting",
        "r": "Воспроизведён и починен баг с var в цикле тремя способами"
      },
      {
        "h": "~2,5 ч",
        "t": "Типы, приведение, объекты, массивы",
        "r": "Рефакторинг императивного кода в функциональный на методах массивов"
      },
      {
        "h": "~2,5 ч",
        "t": "this, замыкания, паттерны",
        "r": "Каррирование, мемоизация, приватность до и после #private"
      },
      {
        "h": "~2,5 ч",
        "t": "Прототипы, class, Symbol, коллекции",
        "r": "Цепочка прототипов руками, затем class и сравнение с Map/Set"
      },
      {
        "h": "~3 ч",
        "t": "Event Loop, Promises, fetch, debounce/throttle",
        "r": "Своя очередь задач, реальный fetch к json-server, тесты на node --test"
      },
      {
        "h": "~3 ч",
        "t": "DOM без фреймворка",
        "r": "Список тикетов рендерится и обновляется без единой строки фреймворка"
      },
      {
        "h": "~3,5 ч",
        "t": "Модули, Storage, собственная реактивность на Proxy",
        "r": "Мини-reactive() с автослежкой зависимостей и батчингом"
      },
      {
        "h": "~4 ч",
        "t": "Мини-SPA: роутер + store + рендер, тесты, сравнение с Vue",
        "r": "Рабочее приложение и финальная таблица «vanilla vs Vue»"
      },
      {
        "h": "~3 ч",
        "t": "Надёжная асинхронность: параллельность, повторы, ошибки",
        "r": "Promise.all/allSettled/race/any, повтор с паузой и пул с лимитом, свои ошибки с cause и таймаут, await в forEach и потерянные промисы"
      },
      {
        "h": "~3 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового ответа: консольный отчёт по тикетам"
      }
    ],
    arch: {
      "title": "Путь одного действия в мини-SPA",
      "rows": [
        {
          "label": "Браузер · ввод",
          "boxes": [
            "клик по ссылке",
            "смена статуса в select"
          ]
        },
        {
          "label": "Роутер",
          "boxes": [
            "router.js",
            "history.pushState · popstate"
          ]
        },
        {
          "label": "Состояние",
          "boxes": [
            "store.js",
            "reactive.js: Proxy · track/trigger"
          ]
        },
        {
          "label": "Рендер",
          "boxes": [
            "effect() в main.js",
            "views.js",
            "innerHTML"
          ]
        },
        {
          "label": "Сеть",
          "boxes": [
            "api.js · fetch + response.ok",
            "json-server :3001 (db.json)",
            "server.js :5500 (статика)"
          ]
        }
      ],
      "note": "Обратный путь: ответ json-server возвращается в store; при ошибке оптимистичное обновление откатывается, поле снова меняется и effect() перерисовывает страницу.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "ввод и роутинг",
            "x": 14,
            "w": 200
          },
          {
            "t": "состояние и рендер",
            "x": 230,
            "w": 440
          },
          {
            "t": "сеть",
            "x": 700,
            "w": 286
          }
        ],
        "nodes": [
          {
            "id": "ui",
            "t": "Клик / change",
            "s": "ссылка · select",
            "x": 110,
            "y": 130,
            "d": "Пользователь кликает по названию тикета или меняет статус в списке. Один обработчик на родителе ловит событие через делегирование."
          },
          {
            "id": "rt",
            "t": "router.js",
            "s": "pushState · popstate",
            "x": 110,
            "y": 290,
            "d": "Перехватывает клик по ссылке, вызывает preventDefault и history.pushState. Кнопки «назад» и «вперёд» ловит событие popstate."
          },
          {
            "id": "dom",
            "t": "DOM · #app",
            "s": "результат на экране",
            "x": 110,
            "y": 450,
            "d": "Готовая разметка попадает на страницу. Перерисовывается всё целиком, без диффинга: фокус и раскрытый details при этом сбрасываются."
          },
          {
            "id": "st",
            "t": "store.js",
            "s": "reactive + экшены",
            "x": 330,
            "y": 130,
            "d": "Состояние приложения в одном reactive-объекте. changeStatus сразу меняет поле, а при ошибке сервера откатывает его назад."
          },
          {
            "id": "rx",
            "t": "reactive.js",
            "s": "Proxy · track/trigger",
            "x": 330,
            "y": 290,
            "d": "Ловушка get запоминает, какой effect читал поле, ловушка set перезапускает подписанные эффекты через queueMicrotask, то есть с батчингом."
          },
          {
            "id": "api",
            "t": "api.js",
            "s": "fetch + response.ok",
            "x": 330,
            "y": 450,
            "d": "Обёртка над fetch с обязательной проверкой response.ok и AbortController для отмены устаревших запросов."
          },
          {
            "id": "ef",
            "t": "effect() рендера",
            "s": "main.js",
            "x": 550,
            "y": 130,
            "d": "Единственный effect читает store и перерисовывает страницу. Он сам перезапускается при изменении любого прочитанного поля."
          },
          {
            "id": "vw",
            "t": "views.js",
            "s": "функция → строка HTML",
            "x": 550,
            "y": 290,
            "d": "Шаблоны списка и карточки тикета. Данные вставляются в строку HTML, поэтому экранируются вручную через escapeHtml."
          },
          {
            "id": "js",
            "t": "json-server",
            "s": "db.json · :3001",
            "x": 880,
            "y": 210,
            "d": "Мок-API без кода: принимает PATCH на смену статуса тикета и сохраняет его, так что после обновления страницы статус остаётся."
          },
          {
            "id": "web",
            "t": "server.js :5500",
            "s": "статика на node:http",
            "x": 880,
            "y": 400,
            "d": "Свой статический сервер на node:http, около 20 строк. Отдаёт index.html и ES-модули напрямую с диска, без сборки."
          }
        ],
        "edges": [
          {
            "a": "ui",
            "b": "rt"
          },
          {
            "a": "ui",
            "b": "st"
          },
          {
            "a": "rt",
            "b": "st"
          },
          {
            "a": "st",
            "b": "rx"
          },
          {
            "a": "rx",
            "b": "ef"
          },
          {
            "a": "ef",
            "b": "vw"
          },
          {
            "a": "vw",
            "b": "dom"
          },
          {
            "a": "st",
            "b": "api"
          },
          {
            "a": "api",
            "b": "js"
          },
          {
            "a": "web",
            "b": "dom",
            "back": true
          },
          {
            "a": "js",
            "b": "api",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "ui",
            "txt": "Пользователь меняет статус тикета в select."
          },
          {
            "n": "st",
            "txt": "store.changeStatus() сразу меняет поле в reactive-объекте."
          },
          {
            "n": "rx",
            "txt": "Ловушка set вызывает trigger и откладывает эффекты в queueMicrotask."
          },
          {
            "n": "ef",
            "txt": "Единственный effect() перезапускается и читает store."
          },
          {
            "n": "vw",
            "txt": "views.js собирает HTML-строку, данные проходят через escapeHtml."
          },
          {
            "n": "dom",
            "txt": "Страница перерисована: новый статус виден сразу, ещё до ответа сервера."
          },
          {
            "n": "api",
            "txt": "Параллельно api.js отправляет PATCH через fetch."
          },
          {
            "n": "js",
            "txt": "json-server сохраняет статус в db.json и отвечает."
          },
          {
            "n": "st",
            "txt": "Ответ вернулся в store. При ошибке поле откатывается и страница перерисовывается.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Что такое TDZ и чем ошибка обращения к let-переменной до объявления отличается от обращения к необъявленной переменной?",
        "a": "TDZ (временная мёртвая зона) — промежуток от начала блока до строки объявления let/const: переменная уже зарегистрирована, но обратиться к ней нельзя. Поэтому движок пишет «Cannot access ... before initialization», а для действительно необъявленной переменной — «is not defined». Это страховка: тихое undefined превращается в громкий ReferenceError на месте."
      },
      {
        "q": "Почему setTimeout(fn, 0) не выполняется «сразу»?",
        "a": "Он не запускает функцию через 0 мс, а кладёт её в очередь макротасков. Она обрабатывается только после того, как выполнится весь синхронный код и полностью опустеет очередь микротасков, поэтому Promise.then всегда обгоняет даже нулевой таймер. В браузере к этому добавляется минимальная задержка порядка 4 мс."
      },
      {
        "q": "Что делает await технически: блокирует поток или нет?",
        "a": "Не блокирует. await приостанавливает только текущую async-функцию и возвращает управление в event loop, остальной код, обработчики и таймеры продолжают работать. Продолжение функции ставится в очередь микротасков, когда Promise разрешится."
      },
      {
        "q": "Почему fetch не бросает исключение на 404 и как правильно это обработать?",
        "a": "Для fetch успешно полученный ответ остаётся успешным, даже если статус 404: Promise разрешается, а response.status равен 404. Нужно вручную проверять response.ok, иначе страница с ошибкой молча попадёт в response.json() и упадёт с непонятным сообщением."
      },
      {
        "q": "Зачем нужен батчинг обновлений и почему для него используют microtask, а не setTimeout?",
        "a": "Три синхронных state.count++ вызывают trigger три раза, но эффект должен перезапуститься один раз. Перезапуск откладывают в queueMicrotask: микротаск выполнится после всего текущего синхронного кода, но раньше следующего макротаска, так что страница не успеет отрисоваться с промежуточным состоянием."
      }
    ],
    accent: '#F4D35E',
  },
  {
    key: 'kubernetes',
    titleMain: 'kubernetes',
    title: 'Kubernetes Lab',
    subtitle: 'Kubernetes и Helm с нуля',
    desc: "Kubernetes и Helm с нуля, стек CoffeeShop из Traefik-лабы переезжает из Compose в кластер kind: архитектура и kubectl, Pod и Service, Deployment и обновления, Ingress (Traefik), хранение данных и StatefulSet, ConfigMap и Secret, пробы и ресурсы, RBAC и NetworkPolicy, автомасштабирование, Prometheus и Grafana, Helm (chart, шаблоны, репозитории, релизы), umbrella chart и Kustomize.",
    stack: ["Kubernetes v1.37.0", "kind v0.33", "kubectl", "Helm 4", "Traefik v3.7 (Ingress)", "Prometheus / Grafana"],
    difficulty: 'Средняя–высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/kubernetes/kubernetes.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/kubernetes/kubernetes.html',
    repo: 'https://github.com/meeymirita/kubernetes-lab',
    stackInfo: [
      {
        "tag": "оркестратор",
        "back": "Pod, Deployment, StatefulSet, Service, Job вместо Compose: желаемое состояние описано в манифестах, кластер сам его поддерживает."
      },
      {
        "tag": "кластер",
        "back": "kind: control-plane и два рабочих узла в контейнерах Docker; ничего больше ставить на Mac не нужно."
      },
      {
        "tag": "CLI",
        "back": "kubectl: apply, get, describe, logs, exec, rollout, auth can-i. Главная привычка: сначала describe и события, потом догадки."
      },
      {
        "tag": "Helm",
        "back": "Chart, values, release, шаблоны Go, репозиторий, umbrella chart; плюс Kustomize для сравнения."
      },
      {
        "tag": "ingress",
        "back": "Traefik v3.7 как Ingress-контроллер: Ingress и IngressRoute вместо меток Docker. ingress-nginx в лабе не используется — проект свёрнут."
      },
      {
        "tag": "наблюдаемость",
        "back": "metrics-server, HPA, kube-prometheus-stack и Grafana: числа и графики вместо kubectl exec."
      }
    ],
    learn: [
      {
        "tab": "Deployment",
        "title": "Желаемое состояние вместо команд",
        "text": "Deployment создаёт ReplicaSet, а тот следит, чтобы Pod'ов с нужными метками было ровно replicas. Смена образа запускает rolling update: старые Pod уходят по одному, новые приходят, сервис не останавливается; плохую версию откатывает rollout undo.",
        "points": [
          "replicas: 3 — утверждение, а не разовая команда",
          "selector.matchLabels обязан совпадать с метками шаблона",
          "maxSurge и maxUnavailable задают скорость волны"
        ],
        "code": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: coffeeshop-api\nspec:\n  replicas: 3\n  selector:\n    matchLabels: {app: coffeeshop-api}\n  template:\n    metadata:\n      labels: {app: coffeeshop-api}\n    spec:\n      containers:\n        - name: api\n          image: coffeeshop-api:v1"
      },
      {
        "tab": "Service и Ingress",
        "title": "Стабильный адрес и один вход",
        "text": "У Pod'ов адреса меняются, поэтому перед ними стоит Service: находит Pod по меткам, берёт только готовых и имеет DNS-имя. Снаружи на несколько Service смотрит один Ingress, который выполняет контроллер (у нас Traefik).",
        "points": [
          "selector Service = метки Pod",
          "db.default.svc.cluster.local внутри кластера",
          "Ingress — только правила; без контроллера они мёртвый текст"
        ],
        "code": "apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: coffeeshop\nspec:\n  ingressClassName: traefik\n  rules:\n    - host: shop.localhost\n      http:\n        paths:\n          - path: /api\n            pathType: Prefix\n            backend:\n              service: {name: coffeeshop-api, port: {number: 80}}"
      },
      {
        "tab": "Данные и секреты",
        "title": "Том переживает Pod, пароль живёт отдельно",
        "text": "База хранит данные на PersistentVolumeClaim: Pod можно удалить, том и данные остаются. Для БД используют StatefulSet. Конфиг и пароль выносят из образа в ConfigMap и Secret; base64 в Secret — кодирование, а не шифрование.",
        "points": [
          "PVC → PV → диск; StorageClass создаёт тома сам",
          "StatefulSet: стабильные имена и volumeClaimTemplates",
          "secretKeyRef берёт одну переменную под своим именем"
        ],
        "code": "env:\n  - name: DB_PASSWORD\n    valueFrom:\n      secretKeyRef:\n        name: db-credentials\n        key: POSTGRES_PASSWORD\nvolumeClaimTemplates:\n  - metadata: {name: data}\n    spec:\n      accessModes: [ReadWriteOnce]\n      resources: {requests: {storage: 1Gi}}"
      },
      {
        "tab": "Пробы и ресурсы",
        "title": "Готов и жив — разные вопросы",
        "text": "readinessProbe убирает Pod из Service, livenessProbe перезапускает контейнер. requests бронируют ресурсы и служат базой для HPA, limits по памяти — потолок, за которым OOMKilled. Диагностика идёт по таблице «статус → причина».",
        "points": [
          "Running 0/1 — не проходит readiness",
          "OOMKilled — превышен limits.memory",
          "describe pod и Events — первая команда любого разбора"
        ],
        "code": "readinessProbe:\n  httpGet: {path: /health, port: 3000}\n  periodSeconds: 5\nlivenessProbe:\n  httpGet: {path: /health, port: 3000}\n  initialDelaySeconds: 10\nresources:\n  requests: {cpu: 100m, memory: 128Mi}\n  limits: {memory: 256Mi}"
      },
      {
        "tab": "Безопасность и масштаб",
        "title": "Права, запреты и автоскейлинг",
        "text": "RBAC выдаёт права через Role и RoleBinding, securityContext отнимает лишнее у контейнера, NetworkPolicy запирает базу от всех, кроме API. HPA сам считает число реплик по CPU, но без requests и metrics-server показывает <unknown>.",
        "points": [
          "kubectl auth can-i --as проверяет права",
          "политика сети работает только если CNI её применяет",
          "HPA растёт быстро, падает через окно стабилизации"
        ],
        "code": "apiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata: {name: coffeeshop-api}\nspec:\n  scaleTargetRef: {apiVersion: apps/v1, kind: Deployment, name: coffeeshop-api}\n  minReplicas: 2\n  maxReplicas: 6\n  metrics:\n    - type: Resource\n      resource:\n        name: cpu\n        target: {type: Utilization, averageUtilization: 50}"
      },
      {
        "tab": "Helm",
        "title": "Один chart, любое окружение",
        "text": "Chart — шаблоны манифестов плюс значения по умолчанию, release — установка с журналом ревизий. Отличия dev и prod лежат в файлах values; upgrade с --atomic откатывается сам, а rollback возвращает прежнюю ревизию.",
        "points": [
          "helm template — репетиция: читай готовый YAML",
          "toYaml | nindent N — главный приём и главная ловушка",
          "umbrella chart собирает db, api и web одной командой"
        ],
        "code": "helm upgrade --install coffee ./coffeeshop \\\n  -n coffee --create-namespace \\\n  -f values-prod.yaml \\\n  --set global.dbPassword=\"$DB_PASSWORD\" \\\n  --atomic --wait --timeout 6m"
      }
    ],
    sessions: [
      {
        "h": "~4 ч",
        "t": "Азбука и окружение",
        "r": "кластер kind из трёх узлов, kubectl и helm, проверка starter/"
      },
      {
        "h": "~4 ч",
        "t": "Архитектура и объекты",
        "r": "путь apply по компонентам, reconcile, метки и API-группы"
      },
      {
        "h": "~4 ч",
        "t": "Pod и Service",
        "r": "Pod, жизненный цикл, Service и DNS, образ в kind"
      },
      {
        "h": "~4 ч",
        "t": "Deployment и обновления",
        "r": "rolling update, откат, застрявший rollout"
      },
      {
        "h": "~4 ч",
        "t": "Сети и Ingress",
        "r": "типы Service, Traefik как Ingress-контроллер, доступ с Mac"
      },
      {
        "h": "~4 ч",
        "t": "Хранение данных",
        "r": "PostgreSQL на PVC, StatefulSet, резервная копия"
      },
      {
        "h": "~4 ч",
        "t": "Секреты и конфигурация",
        "r": "ConfigMap, Secret, весь стек CoffeeShop в кластере"
      },
      {
        "h": "~4 ч",
        "t": "Эксплуатация и диагностика",
        "r": "namespace и квоты, пробы, ресурсы, Job, Production Hell 1"
      },
      {
        "h": "~4 ч",
        "t": "Безопасность и сеть-политики",
        "r": "RBAC, ServiceAccount, securityContext, Pod Security, NetworkPolicy"
      },
      {
        "h": "~4 ч",
        "t": "Автомасштабирование",
        "r": "metrics-server, HPA под нагрузкой, обзор VPA и Cluster Autoscaler"
      },
      {
        "h": "~4 ч",
        "t": "Наблюдаемость",
        "r": "kube-prometheus-stack, ServiceMonitor, дашборд Grafana, логи"
      },
      {
        "h": "~4 ч",
        "t": "Helm, основы",
        "r": "первый chart для API, install, upgrade, отладка YAML"
      },
      {
        "h": "~4 ч",
        "t": "Шаблоны Helm",
        "r": "функции, if/range, _helpers, chart для БД, subcharts"
      },
      {
        "h": "~4 ч",
        "t": "Репозитории, релизы, окружения",
        "r": "свой репозиторий, atomic, rollback, values-dev и values-prod"
      },
      {
        "h": "~4 ч",
        "t": "Итоговый проект",
        "r": "umbrella chart CoffeeShop, Kustomize, Production Hell 2"
      },
      {
        "h": "~4 ч",
        "t": "Итоговое задание",
        "r": "продакшн-релиз по ТЗ без ответа"
      }
    ],
    arch: {
      "title": "Путь запроса в кластер kind",
      "rows": [
        {
          "label": "Хост",
          "boxes": [
            "браузер shop.localhost",
            "kind extraPortMappings 80/443"
          ]
        },
        {
          "label": "Вход в кластер",
          "boxes": [
            "Traefik Pod (Ingress-контроллер)",
            "Ingress coffeeshop"
          ]
        },
        {
          "label": "Сеть",
          "boxes": [
            "Service coffeeshop-api :80",
            "CoreDNS + NetworkPolicy"
          ]
        },
        {
          "label": "Приложение",
          "boxes": [
            "Deployment coffeeshop-api → Pod ×3",
            "HPA coffeeshop-api",
            "ConfigMap + Secret"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "StatefulSet db (PostgreSQL 18)",
            "PVC data"
          ]
        }
      ],
      "note": "Ловушка: HPA не работает без resources.requests и metrics-server, а Service типа LoadBalancer в kind не получает внешний IP, поэтому порты хоста пробрасывают в узел.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "хост · kind",
            "x": 14,
            "w": 190
          },
          {
            "t": "кластер: вход и приложение",
            "x": 250,
            "w": 430
          },
          {
            "t": "данные",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "browser",
            "t": "Браузер",
            "s": "shop.localhost",
            "x": 110,
            "y": 150,
            "d": "Запрос на shop.localhost/api попадает на порт 80 хоста."
          },
          {
            "id": "kind",
            "t": "kind-порты",
            "s": "extraPortMappings 80/443",
            "x": 110,
            "y": 350,
            "d": "Задаётся в kind-config.yaml при создании кластера: порты хоста пробрасываются в узел, потому что без облака LoadBalancer не получит внешний IP."
          },
          {
            "id": "traefik",
            "t": "Traefik Pod",
            "s": "Ingress-контроллер",
            "x": 350,
            "y": 110,
            "d": "Тот же Traefik, что в прошлой лабе, но Pod'ом в кластере; слушает порты узла и читает правила из API Kubernetes."
          },
          {
            "id": "ir",
            "t": "Ingress",
            "s": "Host(`shop.localhost`) /api",
            "x": 570,
            "y": 110,
            "d": "Правило «этот Host и путь — на этот Service»; сам ничего не слушает, его выполняет контроллер."
          },
          {
            "id": "svc",
            "t": "coffeeshop-api",
            "s": "Service ClusterIP",
            "x": 350,
            "y": 270,
            "d": "Стабильный адрес поверх Pod'ов: находит их по метке app, берёт только готовых; имя резолвит CoreDNS."
          },
          {
            "id": "dep",
            "t": "Deployment api",
            "s": "ReplicaSet · 3 Pod",
            "x": 570,
            "y": 270,
            "d": "Deployment создаёт ReplicaSet, тот держит нужное число Pod'ов; readiness и liveness бьют в /health, обновление идёт волной."
          },
          {
            "id": "hpa",
            "t": "HPA",
            "s": "CPU 50% · 2–6 реплик",
            "x": 350,
            "y": 430,
            "d": "Опрашивает metrics-server и сам меняет replicas у Deployment; без requests показывает <unknown>."
          },
          {
            "id": "cfg",
            "t": "ConfigMap/Secret",
            "s": "api-config, db-credentials",
            "x": 570,
            "y": 430,
            "d": "Несекретные значения в ConfigMap, пароль в Secret; подключаются к Pod через envFrom и secretKeyRef."
          },
          {
            "id": "pg",
            "t": "PostgreSQL",
            "s": "StatefulSet db",
            "x": 800,
            "y": 170,
            "d": "База с readiness-пробой pg_isready; NetworkPolicy пускает к ней только API."
          },
          {
            "id": "pvc",
            "t": "PVC data",
            "s": "1Gi · StorageClass",
            "x": 800,
            "y": 380,
            "d": "Заявка на хранилище: StorageClass kind сам создаёт PV; данные переживают удаление Pod'а."
          }
        ],
        "edges": [
          {
            "a": "browser",
            "b": "kind"
          },
          {
            "a": "kind",
            "b": "traefik"
          },
          {
            "a": "traefik",
            "b": "ir"
          },
          {
            "a": "ir",
            "b": "svc"
          },
          {
            "a": "svc",
            "b": "dep"
          },
          {
            "a": "hpa",
            "b": "dep"
          },
          {
            "a": "cfg",
            "b": "dep"
          },
          {
            "a": "dep",
            "b": "pg"
          },
          {
            "a": "pg",
            "b": "pvc"
          },
          {
            "a": "svc",
            "b": "traefik",
            "back": true
          },
          {
            "a": "traefik",
            "b": "browser",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "browser",
            "txt": "GET http://shop.localhost/api/menu."
          },
          {
            "n": "kind",
            "txt": "Порт 80 хоста проброшен в узел kind."
          },
          {
            "n": "traefik",
            "txt": "Traefik Pod принимает запрос."
          },
          {
            "n": "ir",
            "txt": "Ingress coffeeshop: Host и путь /api совпали."
          },
          {
            "n": "svc",
            "txt": "Service coffeeshop-api выбирает готовый Pod по метке."
          },
          {
            "n": "dep",
            "txt": "Pod из Deployment отвечает, запрашивая данные у БД; HPA следит за CPU."
          },
          {
            "n": "svc",
            "txt": "Ответ возвращается в Service.",
            "back": true
          },
          {
            "n": "traefik",
            "txt": "Traefik отдаёт ответ обратно.",
            "back": true
          },
          {
            "n": "browser",
            "txt": "Браузер получает JSON с меню.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Deployment создаёт Pod'ы напрямую или через промежуточный объект?",
        "a": "Через ReplicaSet: он следит за числом Pod'ов с нужными метками. Deployment поверх него нужен для rolling update: при смене образа создаётся новый ReplicaSet, старый постепенно сворачивается, а rollout undo возвращает прежний. Удалённый вручную Pod пересоздаётся, а голый Pod без Deployment никто не вернёт."
      },
      {
        "q": "В чём разница между readinessProbe и livenessProbe?",
        "a": "При провале readiness Pod убирается из endpoints Service и перестаёт получать трафик, но не перезапускается. При провале liveness контейнер убивается и создаётся заново. Разделение нужно, чтобы занятый, но живой процесс не убивали."
      },
      {
        "q": "Почему Secret в Kubernetes не шифрование?",
        "a": "Значения хранятся в base64 — это кодирование, оно снимается одной командой. Защита держится на RBAC и на том, что секреты не лежат в Git. Для настоящей секретности используют Sealed Secrets, SOPS или внешнее хранилище вроде Vault."
      },
      {
        "q": "Почему HorizontalPodAutoscaler показывает <unknown>?",
        "a": "HPA сам ничего не измеряет: он спрашивает metrics-server, какой процент от requests.cpu использует Pod. Если metrics-server не установлен (в kind его нет по умолчанию) или у контейнера нет requests, считать не от чего. Причину называет kubectl describe hpa."
      },
      {
        "q": "Как пережить удаление Pod'а с базой данных?",
        "a": "Данные нужно хранить на PersistentVolumeClaim, а базу запускать как StatefulSet с volumeClaimTemplates. Pod можно удалять — новый подключит тот же PVC. Данные пропадут только при удалении самого PVC."
      },
      {
        "q": "Почему NetworkPolicy может «не работать» без единой ошибки?",
        "a": "Объект принимает API, но правила выполняет сетевой плагин (CNI). Если плагин политики не применяет, они ничего не блокируют; если селектор политики с опечаткой, она выбирает ноль Pod. Поэтому работу проверяют запросом изнутри Pod'а, а не по виду объекта."
      },
      {
        "q": "Чем Helm-релиз отличается от chart'а и зачем --atomic?",
        "a": "Chart — пакет с шаблонами и значениями по умолчанию, release — его установка с именем и журналом ревизий. Флаг --atomic при неудачном upgrade сам откатывает релиз, а --wait заставляет ждать готовности Pod'ов; без них Helm рапортует об успехе сразу после отправки манифестов."
      },
      {
        "q": "Почему лаба использует Traefik, а не ingress-nginx?",
        "a": "Проект ingress-nginx официально свёрнут: поддержка закончилась весной 2026 года, репозиторий заморожен. Traefik активно развивается, и его модель «роутер → middleware → сервис» читателю уже знакома по Traefik-лабе."
      }
    ],
    accent: '#326CE5',
  },
  {
    key: 'prisma',
    titleMain: 'prisma',
    title: 'Prisma Lab',
    subtitle: 'Наследство: чужая база на Prisma 7',
    desc: "Чужая грязная база «Прокат снаряжения» превращается в типизированный слой данных на Prisma 7 и TypeScript: аудит и db pull, схема и клиент, связи и N+1, пагинация, индексы и EXPLAIN, raw SQL и TypedSQL, миграции на живой базе, внешние ключи и слияние дублей, транзакции и гонки, двойная бронь на диапазонах, деньги и идемпотентность, расширения клиента, мультитенантность и RLS, пул и нагрузка, тесты и CI, итоговое ТЗ.",
    stack: ["Prisma 7", "TypeScript", "PostgreSQL 18", "Node.js 24", "Docker", "Vitest"],
    difficulty: 'Средняя–высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/prisma/prisma.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/prisma/prisma.html',
    download: { label: 'Скачать дамп базы (12 МБ)', url: 'https://meeymirita-files.storage.yandexcloud.net/prisma/rental-legacy.dump' },
    repo: 'https://github.com/meeymirita/prisma-lab',
    stackInfo: [
      {
        "tag": "ORM",
        "back": "Prisma 7: схема, типизированный клиент, миграции, driver adapter pg. Версия закреплена: на npm latest уже Prisma 8 (RC), с другой моделью работы."
      },
      {
        "tag": "язык",
        "back": "TypeScript в минимуме: типы, union и null, async/await, модули, немного generic'ов. Всё объясняется по ходу, глубже — в TypeScript-лабе."
      },
      {
        "tag": "база",
        "back": "PostgreSQL 18 в контейнере и чужой дамп «Проката»: без ключей, с дублями, датами в трёх форматах. Здесь применяются индексы, изоляция и RLS из PostgreSQL-лабы."
      },
      {
        "tag": "среда",
        "back": "Node.js 24 на Mac: tsx для запуска, один проект, схема и миграции в Git."
      },
      {
        "tag": "контейнеры",
        "back": "Docker Desktop: только PostgreSQL и восстановление дампа; приложение запускается на Mac."
      },
      {
        "tag": "тесты",
        "back": "Vitest на настоящей базе: шаблонная база, фабрики, откат транзакцией, запуск в CI."
      }
    ],
    learn: [
      {
        "tab": "Схема",
        "title": "Чужая база становится схемой",
        "text": "prisma db pull читает таблицы и пишет по ним модели. Дальше схему приходится причёсывать: давать нормальные имена через @map, превращать числа статусов в enum, заводить связи, которых в базе нет. Версии закреплены явно, а адрес базы лежит в prisma.config.ts.",
        "points": [
          "db pull не видит модель без первичного ключа",
          "@map и @@map: красивые имена в коде, старые в базе",
          "baseline превращает существующую базу в нулевую миграцию"
        ],
        "code": "model Booking {\n  id         Int           @id @default(autoincrement())\n  customerId Int           @map(\"cust_id\")\n  status     BookingStatus\n  priceCents Decimal       @db.Decimal(12, 2) @map(\"price\")\n  customer   Customer      @relation(fields: [customerId], references: [id])\n\n  @@map(\"tbl_Bookings\")\n  @@index([customerId, status])\n}"
      },
      {
        "tab": "Запросы",
        "title": "Один вызов — сколько SQL?",
        "text": "Клиент с адаптером pg пишет SQL за вас, и его нужно читать: лог запросов показывает, что реально ушло в базу. Вложенный include в цикле даёт N+1, а relationLoadStrategy join собирает связи одним запросом. На большой выборке OFFSET деградирует, cursor нет.",
        "points": [
          "log: ['query'] — смотрим SQL, который шлёт Prisma",
          "include и select определяют форму SQL",
          "cursor вместо skip на глубоких страницах"
        ],
        "code": "const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })\nconst prisma = new PrismaClient({ adapter, log: ['query'] })\n\nconst page = await prisma.booking.findMany({\n  take: 50,\n  cursor: { id: lastId },\n  skip: 1,\n  orderBy: { id: 'asc' },\n  include: { customer: { select: { name: true } } },\n  relationLoadStrategy: 'join',\n})"
      },
      {
        "tab": "Миграции",
        "title": "Менять схему, пока работает «прод»",
        "text": "Типы колонок меняют по схеме expand/contract: добавить новую колонку, заполнить батчами, переключить код, удалить старую. migrate dev сам создаёт SQL, но переименование превращает в DROP и ADD, поэтому миграцию создают с флагом --create-only и правят руками. Внешние ключи на живой таблице добавляют как NOT VALID.",
        "points": [
          "--create-only и ручная правка migration.sql",
          "NOT VALID, затем VALIDATE CONSTRAINT без долгой блокировки",
          "migrate deploy в CI, migrate dev только локально"
        ],
        "code": "-- migration.sql (правим руками)\nALTER TABLE \"tbl_Bookings\" ADD COLUMN \"starts_at\" timestamptz;\n\nUPDATE \"tbl_Bookings\"\nSET \"starts_at\" = to_timestamp(\"d_from\"::bigint)\nWHERE \"d_from\" ~ '^[0-9]+$' AND \"starts_at\" IS NULL;\n\nALTER TABLE \"tbl_Bookings\"\n  ADD CONSTRAINT fk_cust FOREIGN KEY (cust_id) REFERENCES customers(id) NOT VALID;\nALTER TABLE \"tbl_Bookings\" VALIDATE CONSTRAINT fk_cust;"
      },
      {
        "tab": "Транзакции",
        "title": "Гонки, повторы и двойная бронь",
        "text": "Проверка «свободно ли» перед вставкой не спасает от гонки. Серьёзную защиту даёт база: exclusion-ограничение на диапазоне дат, в схеме Prisma оно описывается как Unsupported, а нарушение приходит ошибкой. Для Serializable ловят P2034 и повторяют транзакцию с паузой.",
        "points": [
          "isolationLevel: Serializable и повтор при P2034",
          "EXCLUDE USING gist на tstzrange против двойной брони",
          "SKIP LOCKED для очереди выдачи без дублей"
        ],
        "code": "async function book(data: BookingInput) {\n  for (let attempt = 1; attempt <= 5; attempt++) {\n    try {\n      return await prisma.$transaction(\n        (tx) => tx.booking.create({ data }),\n        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },\n      )\n    } catch (e) {\n      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') continue\n      throw e\n    }\n  }\n}"
      },
      {
        "tab": "Расширения",
        "title": "Soft delete, аудит и изоляция филиалов",
        "text": "client extensions оборачивают каждый запрос: фильтруют удалённые строки, пишут аудит, подставляют филиал. Для RLS филиал передаётся через set_config внутри транзакции, иначе соединение из пула сохранит прежнее значение и один филиал увидит чужие брони.",
        "points": [
          "$extends с query, result и model",
          "set_config внутри транзакции, а не вне её",
          "роль приложения без прав на DDL"
        ],
        "code": "const scoped = (branchId: number) =>\n  prisma.$extends({\n    query: {\n      $allModels: {\n        async $allOperations({ args, query }) {\n          const [, result] = await prisma.$transaction([\n            prisma.$executeRaw`SELECT set_config('app.branch_id', ${String(branchId)}, true)`,\n            query(args),\n          ])\n          return result\n        },\n      },\n    },\n  })"
      },
      {
        "tab": "Raw SQL",
        "title": "Когда Prisma не хватает",
        "text": "Оконные функции, CTE и LATERAL проще писать на SQL. $queryRaw с tagged template передаёт параметры отдельно и защищает от инъекции, а склеивание строк через $queryRawUnsafe открывает дыру. TypedSQL превращает файл .sql в функцию с типизированным результатом.",
        "points": [
          "$queryRaw`...${value}` — параметры не склеиваются",
          "count возвращает BigInt, деньги — Decimal",
          "TypedSQL: .sql файл и prisma generate --sql"
        ],
        "code": "const top = await prisma.$queryRaw<{ branch: string; revenue: Prisma.Decimal }[]>`\n  SELECT b.name AS branch,\n         sum(p.amount) AS revenue,\n         rank() OVER (ORDER BY sum(p.amount) DESC) AS rnk\n  FROM payments p JOIN branches b ON b.id = p.branch_id\n  WHERE p.paid_at >= ${since}\n  GROUP BY b.name`"
      }
    ],
    sessions: [
      {
        "h": "~4 ч",
        "t": "Азбука и окружение",
        "r": "дамп «Проката» в PostgreSQL 18, Node 24, первый взгляд на чужую базу"
      },
      {
        "h": "~4 ч",
        "t": "TypeScript ровно настолько, насколько нужно",
        "r": "типы, union и null, async/await, модули и minimum generic'ов"
      },
      {
        "h": "~4 ч",
        "t": "Чужая база: аудит и db pull",
        "r": "список болячек, интроспекция, baseline миграций"
      },
      {
        "h": "~4 ч",
        "t": "Схема Prisma",
        "r": "модели, типы, enum вместо чисел, @map, генератор"
      },
      {
        "h": "~4 ч",
        "t": "Клиент и чтение",
        "r": "PrismaClient с адаптером, where и select, SQL из лога"
      },
      {
        "h": "~4 ч",
        "t": "Связи и N+1",
        "r": "relationMode, include, join против query, pg_stat_statements"
      },
      {
        "h": "~4 ч",
        "t": "Запись, типы данных, ошибки",
        "r": "create и upsert, Decimal и Json, коды P2002/P2025"
      },
      {
        "h": "~4 ч",
        "t": "Пагинация, индексы, EXPLAIN",
        "r": "skip против cursor, @@index, планы запросов Prisma"
      },
      {
        "h": "~4 ч",
        "t": "Raw SQL и TypedSQL",
        "r": "$queryRaw, инъекция, окна и CTE, типизированный SQL"
      },
      {
        "h": "~4 ч",
        "t": "Чистка данных I: миграции на живой базе",
        "r": "даты, деньги и статусы приводятся к типам без простоя"
      },
      {
        "h": "~4 ч",
        "t": "Чистка данных II: ключи, дубли, команда",
        "r": "FK NOT VALID, слияние дублей, drift и конфликты миграций"
      },
      {
        "h": "~4 ч",
        "t": "Транзакции и гонки",
        "r": "$transaction, изоляция, повтор по P2034, SKIP LOCKED"
      },
      {
        "h": "~4 ч",
        "t": "Двойная бронь: диапазоны",
        "r": "tstzrange, EXCLUDE, часовые пояса, свободные предметы"
      },
      {
        "h": "~4 ч",
        "t": "Деньги",
        "r": "ledger, Decimal, идемпотентные платежи, сверка"
      },
      {
        "h": "~4 ч",
        "t": "Расширения клиента",
        "r": "$extends: soft delete, аудит, вычисляемые поля"
      },
      {
        "h": "~4 ч",
        "t": "Мультитенантность и безопасность",
        "r": "роль приложения, RLS по филиалу, set_config в транзакции"
      },
      {
        "h": "~4 ч",
        "t": "Эксплуатация: пул и нагрузка",
        "r": "пул, singleton клиента, PgBouncer, сидирование миллиона строк"
      },
      {
        "h": "~4 ч",
        "t": "Тесты, поставка и Production Hell",
        "r": "Vitest на настоящей базе, CI, пять поломок слоя данных"
      },
      {
        "h": "~4 ч",
        "t": "Итоговое задание",
        "r": "RentKit 2.0 по ТЗ без решения"
      }
    ],
    arch: {
      "title": "Путь запроса: от кода до базы",
      "rows": [
        {
          "label": "Приложение",
          "boxes": [
            "TypeScript-код слоя данных",
            "типы из схемы Prisma"
          ]
        },
        {
          "label": "Клиент",
          "boxes": [
            "PrismaClient + $extends",
            "soft delete, аудит, филиал"
          ]
        },
        {
          "label": "Драйвер",
          "boxes": [
            "adapter-pg",
            "пул соединений"
          ]
        },
        {
          "label": "База",
          "boxes": [
            "PostgreSQL 18",
            "RLS, ограничения, индексы"
          ]
        },
        {
          "label": "Миграции",
          "boxes": [
            "schema.prisma → migration.sql",
            "migrate deploy в CI"
          ]
        }
      ],
      "note": "Ловушка: set_config вне транзакции протекает через пул соединений, и один филиал увидит чужие данные.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "приложение",
            "x": 14,
            "w": 250
          },
          {
            "t": "Prisma",
            "x": 290,
            "w": 330
          },
          {
            "t": "PostgreSQL",
            "x": 650,
            "w": 336
          }
        ],
        "nodes": [
          {
            "id": "app",
            "t": "Код на TypeScript",
            "s": "слой данных RentKit",
            "x": 130,
            "y": 150,
            "d": "Функции бронирования, платежей и отчётов; типы результата берутся из схемы Prisma, а не пишутся руками."
          },
          {
            "id": "tests",
            "t": "Vitest",
            "s": "настоящая база",
            "x": 130,
            "y": 380,
            "d": "Тесты слоя данных идут против PostgreSQL: шаблонная база, фабрики, откат транзакцией; в CI то же с migrate deploy."
          },
          {
            "id": "client",
            "t": "PrismaClient",
            "s": "типизированные запросы",
            "x": 330,
            "y": 110,
            "d": "Строит SQL по вызову: findMany, create, $transaction; лог query показывает, что реально уходит в базу."
          },
          {
            "id": "ext",
            "t": "$extends",
            "s": "soft delete · аудит · филиал",
            "x": 520,
            "y": 110,
            "d": "Оборачивает каждый запрос: прячет удалённое, пишет аудит, передаёт филиал через set_config внутри транзакции."
          },
          {
            "id": "adapter",
            "t": "adapter-pg",
            "s": "пул соединений",
            "x": 420,
            "y": 270,
            "d": "Драйвер pg: размер пула и таймауты; число процессов умножить на размер пула, и сумма не должна превысить max_connections."
          },
          {
            "id": "raw",
            "t": "$queryRaw · TypedSQL",
            "s": "окна, CTE, диапазоны",
            "x": 420,
            "y": 430,
            "d": "Для того, что Prisma не выражает: оконные функции, tstzrange, SKIP LOCKED; параметры передаются отдельно от текста запроса."
          },
          {
            "id": "pg",
            "t": "PostgreSQL 18",
            "s": "таблицы «Проката»",
            "x": 810,
            "y": 170,
            "d": "Чужая база после чистки: внешние ключи, enum, numeric вместо текста, индексы под реальные запросы."
          },
          {
            "id": "rls",
            "t": "RLS и роль",
            "s": "изоляция филиалов",
            "x": 810,
            "y": 330,
            "d": "Политики по филиалу и роль приложения без прав на DDL; миграции идут отдельной ролью."
          },
          {
            "id": "mig",
            "t": "migrate deploy",
            "s": "SQL-миграции",
            "x": 810,
            "y": 470,
            "d": "Миграции данных по expand/contract, FK как NOT VALID, exclusion-ограничение на брони; в команде порядок миграций согласуется заранее."
          }
        ],
        "edges": [
          {
            "a": "app",
            "b": "client"
          },
          {
            "a": "client",
            "b": "ext"
          },
          {
            "a": "ext",
            "b": "adapter"
          },
          {
            "a": "app",
            "b": "raw"
          },
          {
            "a": "raw",
            "b": "adapter"
          },
          {
            "a": "adapter",
            "b": "pg"
          },
          {
            "a": "pg",
            "b": "rls"
          },
          {
            "a": "mig",
            "b": "pg"
          },
          {
            "a": "tests",
            "b": "app"
          },
          {
            "a": "pg",
            "b": "adapter",
            "back": true
          },
          {
            "a": "adapter",
            "b": "client",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "app",
            "txt": "Приложение просит брони филиала 7 за неделю."
          },
          {
            "n": "client",
            "txt": "PrismaClient строит SELECT по условиям и include."
          },
          {
            "n": "ext",
            "txt": "Расширение в транзакции ставит set_config('app.branch_id', '7') и добавляет фильтр удалённых."
          },
          {
            "n": "adapter",
            "txt": "Адаптер берёт соединение из пула и отправляет запрос."
          },
          {
            "n": "pg",
            "txt": "PostgreSQL выбирает индекс и возвращает строки."
          },
          {
            "n": "rls",
            "txt": "Политика RLS отсекает строки других филиалов."
          },
          {
            "n": "adapter",
            "txt": "Результат возвращается в пул и клиенту.",
            "back": true
          },
          {
            "n": "client",
            "txt": "Prisma собирает объекты с типами, Decimal вместо number.",
            "back": true
          },
          {
            "n": "app",
            "txt": "Код получает типизированный список броней.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Зачем ORM, если есть pg и SQL?",
        "a": "Prisma даёт типы из схемы, миграции в одном месте и безопасные по умолчанию запросы: опечатка в поле ловится при компиляции. Цена: SQL приходится читать в логе, а сложные запросы всё равно пишут вручную через $queryRaw. Лаба показывает обе стороны на живой базе."
      },
      {
        "q": "Почему лаба на Prisma 7, а не 8?",
        "a": "Prisma 8 вышла как release candidate и работает иначе: контракт вместо schema.prisma, свой клиент вместо @prisma/client, другие миграции и middleware. Prisma 7 стабильна, на ней стоят Express, NestJS и GraphQL лаб, документация к ней остаётся в разделе v7. Поэтому версии в package.json закрепляются: иначе npm install prisma принесёт 8."
      },
      {
        "q": "Что делать, если в базе нет внешних ключей?",
        "a": "db pull создаст модели без связей, их описывают вручную с relationMode prisma. Дальше осиротевшие строки находят запросом, чинят и добавляют ключи в два этапа: NOT VALID, затем VALIDATE CONSTRAINT, чтобы не держать долгую блокировку."
      },
      {
        "q": "Как поменять тип колонки, не останавливая приложение?",
        "a": "По схеме expand/contract: добавить новую колонку, заполнить её батчами, переключить код на неё, потом удалить старую. migrate dev переименование колонки превращает в DROP и ADD и теряет данные, поэтому миграцию создают с --create-only и правят вручную."
      },
      {
        "q": "Почему проверки «свободно ли» перед вставкой не защищают от двойной брони?",
        "a": "Две параллельные транзакции обе увидят «свободно» и обе вставят строку. Защита должна жить в базе: exclusion-ограничение на tstzrange не даст сохранить пересекающиеся брони, а клиент превращает ошибку в понятное «предмет занят»."
      },
      {
        "q": "Почему деньги нельзя хранить в number?",
        "a": "У числа с плавающей точкой есть ошибки округления: копейки расходятся при суммировании. В схеме используют Decimal (numeric в базе), в коде Prisma.Decimal. Повторы платежа гасит уникальный идемпотентный ключ."
      },
      {
        "q": "Как изолировать филиалы друг от друга в одной базе?",
        "a": "RLS-политиками по филиалу и ролью приложения без права обходить политики. Филиал передаётся через set_config внутри той же транзакции, что и запрос: если установить его вне транзакции, соединение из пула сохранит значение и один филиал увидит чужие данные."
      },
      {
        "q": "Нужна ли TypeScript-лаба до этой?",
        "a": "Нет. Сессия 2 даёт минимум: типы, union и null, async/await, модули, немного generic'ов. Дальше «Под капотом» объясняет происходящее и ссылается на TypeScript-лабу, где тема разобрана глубже. Знание PostgreSQL (индексы, EXPLAIN, транзакции) нужно из PostgreSQL-лабы."
      }
    ],
    accent: '#FFC933',
  },
  {
    key: 'nestjs',
    titleMain: 'nestjs',
    title: 'NestJS Lab',
    subtitle: 'DI руками, JWT-ротация, real-time',
    desc: 'Helpdesk API собран с нуля слой за слоем: свой мини-DI контейнер, границы модулей и provider scopes, Prisma и транзакции, JWT-ротация refresh-токенов с reuse-detection, RBAC через TicketPolicy, доменные события и WebSocket-шлюз, свой динамический модуль, unit и e2e тесты.',
    stack: ['NestJS 11', 'Prisma 7', 'PostgreSQL 18', 'JWT + argon2', 'Socket.IO'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/nestjs/nest.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/nestjs/nestjs.html',
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
        "code": "@SubscribeMessage('ticket:subscribe')\nasync subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { ticketId?: unknown }) {\n  const user = client.data.user as AuthUser;\n  const ticketId = Number(body?.ticketId);\n  if (!Number.isInteger(ticketId)) throw new WsException('ticketId must be an integer');\n  const ticket = await this.prisma.ticket.findFirst({\n    where: { id: ticketId, ...this.policy.scopeFor(user) },\n    select: { id: true },\n  });\n  if (!ticket) throw new WsException(`Ticket #${ticketId} not found`);\n  await client.join(ticketRoom(ticket.id));\n}"
      }
    ],
    sessions: [
      {
        "h": "~3.5 ч",
        "t": "TypeScript для Nest и как на самом деле работает DI",
        "r": "Свои декораторы и мини-DI-контейнер руками, два сломать-почини (emitDecoratorMetadata, забытый @Injectable())"
      },
      {
        "h": "~1.5 ч",
        "t": "Модули, конфигурация, провайдеры",
        "r": "Первый модуль, конфигурация с валидацией, провайдеры: токены, useValue, useFactory"
      },
      {
        "h": "~2 ч",
        "t": "PostgreSQL и Prisma",
        "r": "PostgreSQL в Docker, схема и первая миграция, PrismaService, тестовые данные"
      },
      {
        "h": "~1 ч",
        "t": "DTO и ValidationPipe, CRUD тикетов",
        "r": "DTO и глобальный ValidationPipe, CRUD тикетов"
      },
      {
        "h": "~1 ч",
        "t": "Ошибки Prisma в HTTP, транзакции, слои приложения",
        "r": "Ошибки Prisma в HTTP-ответы, транзакции и история изменений"
      },
      {
        "h": "~1.5 ч",
        "t": "Регистрация и хэши, логин и JwtStrategy",
        "r": "Регистрация с безопасным выводом, логин и JwtStrategy"
      },
      {
        "h": "~1 ч",
        "t": "Guards, @Public()/@CurrentUser(), Reflector",
        "r": "Глобальный guard, @Public()/@CurrentUser(), свой декоратор @Auth()"
      },
      {
        "h": "~1.5 ч",
        "t": "Refresh-токены: ротация и обнаружение повторного использования",
        "r": "Ротация refresh-токенов, reuse-detection, гонка двух параллельных /auth/refresh"
      },
      {
        "h": "~1.5 ч",
        "t": "Роли и владение ресурсом, доменные события",
        "r": "RolesGuard и TicketPolicy, доменные события"
      },
      {
        "h": "~1 ч",
        "t": "Комментарии и внутренние заметки",
        "r": "Комментарии и внутренние заметки, сериализация не даёт internal-заметке утечь"
      },
      {
        "h": "~1 ч",
        "t": "WebSocket-шлюз: комнаты, авторизация на handshake",
        "r": "WebSocket-шлюз, комнаты, авторизация на handshake, исключения и уборка при отключении"
      },
      {
        "h": "~1.5 ч",
        "t": "Middleware, interceptors, Swagger, безопасность",
        "r": "Request id и access-лог, Swagger, CORS, helmet, rate limiting"
      },
      {
        "h": "~1.5 ч",
        "t": "Unit- и e2e-тесты",
        "r": "Unit-тесты с моком Prisma и guard, e2e на настоящей БД"
      },
      {
        "h": "~2.5 ч",
        "t": "Свой динамический модуль, health-чеки, Docker, Production Hell",
        "r": "Свой динамический модуль, health-чеки, graceful shutdown, Docker-образ, Production Hell — 10 заданий без подсказок"
      }
    ],
    arch: {
      "title": "Путь одного запроса",
      "rows": [
        {
          "label": "Клиент",
          "boxes": [
            "curl / Swagger UI",
            "Socket.IO-клиент"
          ]
        },
        {
          "label": "Конвейер Nest",
          "boxes": [
            "Middleware: helmet, RequestContext",
            "Guards: Throttler → JwtAuth → Roles",
            "ValidationPipe",
            "Interceptors: HandlerTime, Timeout"
          ]
        },
        {
          "label": "Домен",
          "boxes": [
            "TicketsController",
            "TicketsService · TicketPolicy",
            "EventEmitter2"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "PrismaService",
            "PostgreSQL 18 · helpdesk"
          ]
        },
        {
          "label": "Real-time",
          "boxes": [
            "RealtimeListener",
            "TicketsGateway · комнаты"
          ]
        }
      ],
      "note": "Обратный путь: событие публикуется только после коммита и уходит клиентам через шлюз по комнатам; если отправить его внутри транзакции, при откате клиенты получат факт, которого не было.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "клиент",
            "x": 14,
            "w": 224
          },
          {
            "t": "конвейер и домен NestJS",
            "x": 250,
            "w": 440
          },
          {
            "t": "данные и события",
            "x": 700,
            "w": 290
          }
        ],
        "nodes": [
          {
            "id": "cl",
            "t": "Клиент",
            "s": "curl · Swagger · WS",
            "x": 110,
            "y": 230,
            "d": "Отправляет REST-запросы с access-токеном в Authorization и подключается к Socket.IO по /ws с токеном в handshake."
          },
          {
            "id": "mw",
            "t": "Middleware",
            "s": "helmet · request id",
            "x": 350,
            "y": 110,
            "d": "helmet и cookie-parser, а RequestContext ставит x-request-id и пишет access-лог со статусом."
          },
          {
            "id": "gd",
            "t": "Guards",
            "s": "Throttler→JwtAuth→Roles",
            "x": 350,
            "y": 230,
            "d": "Глобальный JwtAuthGuard пропускает только с валидным токеном, если маршрут не помечен @Public(). RolesGuard проверяет роль."
          },
          {
            "id": "pp",
            "t": "ValidationPipe",
            "s": "whitelist · transform",
            "x": 350,
            "y": 350,
            "d": "Проверяет DTO, отбрасывает лишние поля и не даёт клиенту прислать role: ADMIN (mass assignment)."
          },
          {
            "id": "ctl",
            "t": "Controller",
            "s": "тонкий, без ролей",
            "x": 590,
            "y": 350,
            "d": "Только маппит HTTP на вызовы сервиса. Правил доступа и запросов к БД в контроллере нет."
          },
          {
            "id": "svc",
            "t": "TicketsService",
            "s": "Policy · транзакция",
            "x": 590,
            "y": 230,
            "d": "Бизнес-логика тикетов: политика доступа, обновление и запись истории изменений в одной транзакции Prisma."
          },
          {
            "id": "ev",
            "t": "EventEmitter2",
            "s": "ticket.* после коммита",
            "x": 590,
            "y": 110,
            "d": "Сервис публикует событие только после коммита транзакции. Слушатели живут в памяти процесса."
          },
          {
            "id": "db",
            "t": "PostgreSQL 18",
            "s": "PrismaService",
            "x": 830,
            "y": 230,
            "d": "Prisma Client один на приложение (глобальный PrismaModule). База helpdesk, для e2e-тестов отдельная helpdesk_test."
          },
          {
            "id": "ws",
            "t": "TicketsGateway",
            "s": "Socket.IO · rooms",
            "x": 830,
            "y": 110,
            "d": "Шлюз рассылает события по комнатам user:{id}, agents и ticket:{id}. Внутренние заметки уходят только в agents."
          }
        ],
        "edges": [
          {
            "a": "cl",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "gd"
          },
          {
            "a": "gd",
            "b": "pp"
          },
          {
            "a": "pp",
            "b": "ctl"
          },
          {
            "a": "ctl",
            "b": "svc"
          },
          {
            "a": "svc",
            "b": "db"
          },
          {
            "a": "svc",
            "b": "ev"
          },
          {
            "a": "ev",
            "b": "ws"
          },
          {
            "a": "ws",
            "b": "cl",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "cl",
            "txt": "Клиент отправляет POST /api/tickets с access-токеном."
          },
          {
            "n": "mw",
            "txt": "Middleware: helmet, cookie-parser, RequestContext ставит x-request-id."
          },
          {
            "n": "gd",
            "txt": "Guards: Throttler, затем JwtAuth (@Public), затем Roles."
          },
          {
            "n": "pp",
            "txt": "ValidationPipe проверяет DTO и убирает лишние поля; контроллер передаёт DTO сервису."
          },
          {
            "n": "svc",
            "txt": "TicketsService проверяет TicketPolicy и открывает $transaction."
          },
          {
            "n": "db",
            "txt": "Prisma пишет тикет и запись истории в PostgreSQL, транзакция коммитится."
          },
          {
            "n": "ev",
            "txt": "После коммита сервис публикует ticket.created.",
            "back": true
          },
          {
            "n": "ws",
            "txt": "TicketsGateway рассылает событие в нужные комнаты.",
            "back": true
          },
          {
            "n": "cl",
            "txt": "Подписанные клиенты получают обновление по WebSocket.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Как Nest узнаёт, что передать в конструктор сервиса, и почему интерфейс нельзя использовать как токен DI?",
        "a": "Nest читает типы параметров конструктора через emitDecoratorMetadata, и только у классов с декоратором, если тип существует в рантайме. Интерфейс после компиляции стирается: в paramtypes окажется Object, и контейнер не поймёт, что создавать. Для интерфейса нужен токен и @Inject(TOKEN) (шаг 2.3)."
      },
      {
        "q": "Почему на запрос чужого тикета отвечаем 404, а не 403?",
        "a": "Ответ 403 сообщает, что тикет с таким номером существует, и перебором можно оценить объём обращений и найти интересные номера. 404 не раскрывает ничего. Правило: нет права видеть — «не найдено», видеть можно, а менять нельзя — 403."
      },
      {
        "q": "Синхронен ли EventEmitter2.emit() и почему событие публикуется после коммита?",
        "a": "emit() вызывает слушателей синхронно и возвращается после них, так что медленный слушатель задерживает HTTP-ответ. Событие о факте публикуют после коммита: иначе при откате транзакции WebSocket уже разослал бы клиентам «тикет обновлён», чего не произошло. События живут в памяти одного процесса, поэтому они слабее брокера."
      },
      {
        "q": "Как работают ротация refresh-токенов и reuse detection?",
        "a": "При обновлении выдаётся новый refresh, а старый помечается отозванным. Если отозванный токен предъявлен повторно, отзывается вся семья (familyId): и атакующий, и пользователь получают 401 и логинятся заново. Гонку двух вкладок закрывает условный UPDATE ... WHERE revoked_at IS NULL: вторая вкладка получит 401, но семья не отзывается."
      },
      {
        "q": "Почему в БД хранится хэш refresh-токена, и почему для него хватает SHA-256, а для пароля нужен argon2?",
        "a": "Хэш хранят, чтобы утечка дампа БД не давала войти под любым пользователем. Пароли короткие и перебираемые, поэтому нужен медленный argon2. Refresh-секрет — 32 случайных байта, перебрать его невозможно, и быстрого SHA-256 достаточно."
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
    stack: ['NestJS + Apollo Server', 'Prisma 7', 'PostgreSQL 18', 'DataLoader', 'Redis'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/graphql/GraphQL.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/graphql/graphql.html',
    repo: 'https://github.com/meeymirita/graphql-lab',
    stackInfo: [
      {
        "tag": "сервер",
        "back": "Каркас API и Apollo Server: code-first схема из декораторов и резолверы."
      },
      {
        "tag": "ORM",
        "back": "Доступ к данным и миграции, откуда резолверы берут строки."
      },
      {
        "tag": "база данных",
        "back": "Хранилище фильмов, людей, рецензий и пользователей."
      },
      {
        "tag": "батчинг",
        "back": "Схлопывает запросы резолверов полей и лечит N+1."
      },
      {
        "tag": "pub/sub",
        "back": "Доставка событий подписок между несколькими инстансами."
      }
    ],
    learn: [
      {
        "tab": "Интерфейсы и юнионы",
        "title": "Один тип поля — несколько реализаций",
        "text": "Интерфейс Credit описывает общие поля актёрской и режиссёрской работы, а union SearchResult объединяет фильм и человека. Исполнителю нужен resolveType, иначе он не поймёт, какой конкретный тип вернулся.",
        "points": [
          "@InterfaceType и implements",
          "createUnionType и resolveType",
          "Фрагменты ... on для выборки полей"
        ],
        "code": "@InterfaceType({\n  description: 'Участие человека в фильме',\n  resolveType: (value: CreditSource) => (value.kind === 'director' ? DirectorCredit : CastCredit),\n})\nexport abstract class Credit { /* movie, person */ }\n\nexport const SearchResult = createUnionType({\n  name: 'SearchResult',\n  types: () => [Movie, Person] as const,\n  resolveType: (value: object) => ('title' in value ? Movie : Person),\n});"
      },
      {
        "tab": "N+1 и DataLoader",
        "title": "Батчинг вместо запроса на каждую строку",
        "text": "Наивные резолверы полей делают отдельный запрос на каждый фильм. DataLoader собирает ключи за один тик и отправляет один запрос с IN. Кэш загрузчика нужно создавать на каждый запрос, иначе данные потекут между пользователями.",
        "points": [
          "Контракт: результат той же длины и в том же порядке, что ids",
          "Отдельные загрузчики для один-к-одному и один-ко-многим",
          "Новый набор загрузчиков в context() на каждый запрос"
        ],
        "code": "function byId<T extends { id: number }>(label: string, fetch: (ids: number[]) => Promise<T[]>) {\n  return new DataLoader<number, T>(async (ids) => {\n    const rows = await fetch([...ids]);\n    const map = new Map(rows.map((r) => [r.id, r]));\n    return ids.map((id) => map.get(id) ?? new Error(`${label} ${id} not found`));\n  });\n}"
      },
      {
        "tab": "Права на поля",
        "title": "Авторизация внутри схемы",
        "text": "Доступ проверяется не только на входе в мутацию, но и на отдельном поле. Чужой email отдаёт ошибку FORBIDDEN, а остальная часть ответа приходит: GraphQL умеет частичные ответы.",
        "points": [
          "ResolveField с проверкой пользователя из контекста",
          "Порядок guard'ов: сначала кто ты, потом можно ли",
          "Nullable-поле превращает ошибку в null, а не в падение всего запроса"
        ],
        "code": "@ResolveField(() => String, { nullable: true, description: 'Виден только владельцу и админу' })\nemail(@Parent() user: User, @Context('user') me: AuthUser | null) {\n  if (me && (me.id === user.id || me.role === 'ADMIN')) return user.email;\n  throw gqlError('FORBIDDEN', 'Email виден только владельцу');\n}"
      },
      {
        "tab": "Курсорная пагинация",
        "title": "Connection вместо offset",
        "text": "Лента рецензий отдаётся в формате edges/pageInfo. Курсор непрозрачен для клиента, а запрос берёт take + 1 строку, чтобы узнать про следующую страницу без COUNT.",
        "points": [
          "Курсор как base64url от id",
          "hasNextPage без лишнего запроса",
          "totalCount через отдельный загрузчик"
        ],
        "code": "const rows = await this.prisma.review.findMany({\n  where: { movieId, ...(beforeId ? { id: { lt: beforeId } } : {}) },\n  orderBy: { id: 'desc' },\n  take: take + 1,   // +1: узнать, есть ли следующая страница, без COUNT\n});\nconst page = rows.slice(0, take);\npageInfo: { hasNextPage: rows.length > take, endCursor: edges.at(-1)?.cursor ?? null },"
      },
      {
        "tab": "Подписки на Redis",
        "title": "Когда экземпляров два",
        "text": "Подписки на PubSub в памяти работают, пока запущен один процесс. Со вторым инстансом событие, опубликованное в одном, не доходит до подписчика в другом; Redis PubSub решает это.",
        "points": [
          "Воспроизвести проблему на двух портах",
          "Драйвер выбирается переменной окружения",
          "Два соединения Redis: publisher и subscriber"
        ],
        "code": "useFactory: (): PubSubEngine => {\n  if (process.env.PUBSUB_DRIVER === 'redis') {\n    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';\n    return new RedisPubSub({ publisher: new Redis(url), subscriber: new Redis(url) });\n  }\n  return new PubSub();\n},"
      },
      {
        "tab": "Тяжёлые запросы",
        "title": "Лимит глубины и сложности",
        "text": "Запрос, легальный по схеме, может вложить связи на десять уровней и уложить базу. Защита работает до выполнения: правило валидации считает глубину по AST, а плагин оценивает сложность.",
        "points": [
          "depthLimit как правило валидации",
          "Интроспекция и циклы фрагментов не считаются",
          "graphql-query-complexity в плагине Apollo"
        ],
        "code": "OperationDefinition(node) {\n  const depth = measure(node.selectionSet, 0, new Set());\n  if (depth > maxDepth) {\n    context.reportError(new GraphQLError(`Глубина запроса ${depth} превышает лимит ${maxDepth}`,\n      { nodes: [node], extensions: { code: 'QUERY_TOO_DEEP', depth, maxDepth } }));\n  }\n},"
      }
    ],
    sessions: [
      {
        "h": "~3 ч",
        "t": "Инфраструктура, схема, первые запросы",
        "r": "Docker-стенд, схема Prisma и seed, запросы Query.movies и Query.movie, воспроизведённый и посчитанный N+1"
      },
      {
        "h": "~3,5 ч",
        "t": "DataLoader, мутации, ошибки, права",
        "r": "N+1 убран загрузчиками, мутации рецензий с guard, коды ошибок, права на поля, интерфейсы, юнионы и курсорная пагинация"
      },
      {
        "h": "~3 ч",
        "t": "Подписки, Redis, защита, тесты",
        "r": "Живая лента рецензий на подписках и Redis, лимиты глубины и сложности, e2e-тесты и задания Production Hell"
      }
    ],
    arch: {
      "title": "Путь одного запроса",
      "rows": [
        {
          "label": "Клиент",
          "boxes": [
            "GraphiQL /graphql",
            "client/index.html: fetch + graphql-ws"
          ]
        },
        {
          "label": "Apollo Server",
          "boxes": [
            "parse · validate",
            "depthLimit",
            "ComplexityPlugin",
            "formatError()"
          ]
        },
        {
          "label": "Контекст",
          "boxes": [
            "user ← JWT",
            "LoadersFactory: загрузчики на запрос"
          ]
        },
        {
          "label": "Резолверы",
          "boxes": [
            "Query · Mutation",
            "@ResolveField",
            "ReviewsService"
          ]
        },
        {
          "label": "Данные и события",
          "boxes": [
            "PrismaService → PostgreSQL 18",
            "PubSub → Redis reviewAdded"
          ]
        }
      ],
      "note": "Обратный путь: подписки идут по WebSocket мимо HTTP-плагинов, а in-memory PubSub не пересекает границу процесса, поэтому для нескольких инстансов нужен Redis.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "клиент",
            "x": 14,
            "w": 224
          },
          {
            "t": "Apollo и NestJS",
            "x": 250,
            "w": 440
          },
          {
            "t": "данные и события",
            "x": 700,
            "w": 290
          }
        ],
        "nodes": [
          {
            "id": "cl",
            "t": "Клиент",
            "s": "GraphiQL · WS",
            "x": 110,
            "y": 230,
            "d": "Отправляет POST /graphql с query и variables, а для подписок открывает WebSocket (graphql-transport-ws)."
          },
          {
            "id": "ap",
            "t": "Apollo Server",
            "s": "parse · validate",
            "x": 350,
            "y": 110,
            "d": "Разбирает текст запроса в AST и сверяет его со схемой. Ошибки на этом этапе отдаются без единого SQL."
          },
          {
            "id": "lim",
            "t": "Лимиты запроса",
            "s": "лимиты до SQL",
            "x": 350,
            "y": 230,
            "d": "depthLimit и ComplexityPlugin отсекают слишком глубокие и тяжёлые запросы до выполнения; сложность считается с учётом переменных."
          },
          {
            "id": "ctx",
            "t": "context()",
            "s": "user ← JWT, loaders",
            "x": 350,
            "y": 350,
            "d": "Один раз на запрос кладёт в контекст пользователя из JWT и новый набор DataLoader-ов."
          },
          {
            "id": "rs",
            "t": "Resolvers",
            "s": "Query · @ResolveField",
            "x": 590,
            "y": 350,
            "d": "Тонкий слой: разбирает аргументы и делегирует в сервисы и загрузчики. Поля вроде Movie.director имеют свои резолверы."
          },
          {
            "id": "ld",
            "t": "DataLoader",
            "s": "батч за тик",
            "x": 590,
            "y": 230,
            "d": "Собирает ключи за тик event loop и делает один WHERE id IN (...) вместо запроса на каждый элемент: 4 SQL вместо примерно 43."
          },
          {
            "id": "svc",
            "t": "ReviewsService",
            "s": "addReview → publish",
            "x": 590,
            "y": 110,
            "d": "Мутация добавляет рецензию и публикует событие reviewAdded в PubSub."
          },
          {
            "id": "db",
            "t": "PostgreSQL 18",
            "s": "Prisma",
            "x": 830,
            "y": 230,
            "d": "Movies, persons, cast_members, reviews, users. Форма схемы GraphQL намеренно не совпадает с формой таблиц."
          },
          {
            "id": "rd",
            "t": "Redis PubSub",
            "s": "канал reviewAdded",
            "x": 830,
            "y": 110,
            "d": "Общая шина событий для всех инстансов: без неё подписчик на втором инстансе не получит событие."
          }
        ],
        "edges": [
          {
            "a": "cl",
            "b": "ap"
          },
          {
            "a": "ap",
            "b": "lim"
          },
          {
            "a": "lim",
            "b": "ctx"
          },
          {
            "a": "ctx",
            "b": "rs"
          },
          {
            "a": "rs",
            "b": "ld"
          },
          {
            "a": "ld",
            "b": "db"
          },
          {
            "a": "rs",
            "b": "svc"
          },
          {
            "a": "svc",
            "b": "db"
          },
          {
            "a": "svc",
            "b": "rd"
          },
          {
            "a": "rd",
            "b": "cl",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "cl",
            "txt": "Клиент отправляет query с вложенными полями: фильмы, режиссёры, актёры."
          },
          {
            "n": "ap",
            "txt": "Apollo разбирает запрос в AST и проверяет его по схеме."
          },
          {
            "n": "lim",
            "txt": "depthLimit и ComplexityPlugin отклоняют тяжёлый запрос до выполнения."
          },
          {
            "n": "ctx",
            "txt": "context() кладёт пользователя из JWT и свежие загрузчики."
          },
          {
            "n": "rs",
            "txt": "Выполняются резолверы Query.movies и полей Movie.director, Movie.cast."
          },
          {
            "n": "ld",
            "txt": "DataLoader собирает ключи за тик и формирует один запрос IN."
          },
          {
            "n": "db",
            "txt": "PostgreSQL отвечает: 4 SQL независимо от limit."
          },
          {
            "n": "rd",
            "txt": "Мутация addReview публикует reviewAdded через Redis.",
            "back": true
          },
          {
            "n": "cl",
            "txt": "Подписчики на любом инстансе получают рецензию по WebSocket.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Из каких трёх фаз состоит обработка запроса и на какой можно отклонить запрос, не выполнив ни одного SQL?",
        "a": "Parse превращает текст в AST (синтаксическая ошибка останавливает выполнение), validate сверяет AST со схемой и с вашими правилами, например глубиной, а execute вызывает резолверы. Отклонить запрос без SQL можно на parse и validate: именно на validate дёшево отсекают слишком глубокие запросы."
      },
      {
        "q": "Как работает DataLoader и какой контракт у batch-функции?",
        "a": "DataLoader откладывает загрузку до конца текущего тика и собирает все запрошенные ключи в один батч, то есть в один запрос WHERE id IN (...). Batch-функция получает массив ключей и обязана вернуть массив той же длины в том же порядке, поэтому результат пересобирают через Map, а для отсутствующих ключей ставят null или Error."
      },
      {
        "q": "Почему загрузчики нельзя делать синглтонами?",
        "a": "У DataLoader есть кэш по ключу. Если загрузчик живёт дольше запроса, кэш переживёт его: пользователь увидит устаревшие данные, а в худшем случае данные, загруженные в контексте чужих прав. Поэтому загрузчики создаются в context() на каждый запрос."
      },
      {
        "q": "Почему login { user { email } } может вернуть FORBIDDEN?",
        "a": "Контекст вычисляется один раз в начале запроса, когда токена ещё не было, поэтому context.user остаётся null до конца запроса. Контекст — снимок на момент начала, а не живое состояние. Честный вариант: после логина клиент делает отдельный запрос me."
      },
      {
        "q": "Почему сложность запроса считают после подстановки переменных?",
        "a": "Сложность считается в плагине на хуке didResolveOperation, потому что ей нужны значения переменных вроде limit: $n. На этапе валидации они ещё не подставлены. Глубина проверяется правилом валидации; оба рубежа срабатывают до выполнения, поэтому плохой запрос не делает ни одного SQL."
      }
    ],
    accent: '#E535AB',
  },
  {
    key: 'postgresql',
    titleMain: 'postgresql',
    title: 'PostgreSQL Lab',
    subtitle: 'Coffee Shop изнутри — база без ORM',
    desc: 'Что происходит под ORM на миллионе заказов кофейни: JOIN с нуля, EXPLAIN и индексы B-tree/GIN/BRIN под конкретный запрос, статистика, N+1 глазами базы, уровни изоляции и аномалии, блокировки и дедлоки, SKIP LOCKED, MVCC и VACUUM, партиционирование, роли и Row Level Security, pg_dump, PITR и репликация, итоговое ТЗ.',
    stack: ['PostgreSQL 18', 'psql', 'pgbench', 'Docker'],
    difficulty: 'Средняя–высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/postgresql/PostgreSQL.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/postgresql/postgresql.html',
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
    sessions: [
      {
        "h": "~2,5–3 ч",
        "t": "JOIN с нуля: песочница из пяти клиентов и семи заказов",
        "r": "JOIN всех видов, размножение строк и GROUP BY освоены на пяти клиентах и семи заказах"
      },
      {
        "h": "~3 ч",
        "t": "Окружение, схема, миллион заказов и SQL за пределами CRUD",
        "r": "Postgres 18 в Docker, схема кофейни, 1 млн заказов и инструментарий: CTE, окна, LATERAL"
      },
      {
        "h": "~3,5 ч",
        "t": "EXPLAIN и B-tree: от Seq Scan на миллион строк до 20 прочитанных записей",
        "r": "Запрос «последние заказы клиента» ускорен от Seq Scan на миллион строк до 20 прочитанных записей"
      },
      {
        "h": "~3,5 ч",
        "t": "JOIN'ы, GIN и BRIN, расширенная статистика, N+1, пагинация, охота на медленные запросы",
        "r": "Индексы под поиск и журнал событий, N+1 пойман в pg_stat_statements, keyset-пагинация"
      },
      {
        "h": "~3 ч",
        "t": "Транзакции и изоляция: аномалии своими глазами",
        "r": "Потерянное обновление, уровни изоляции и write skew воспроизведены в нескольких терминалах"
      },
      {
        "h": "~3 ч",
        "t": "Блокировки: строки, очереди на SKIP LOCKED, дедлоки, диагностика, безопасные миграции",
        "r": "Очередь на SKIP LOCKED, воспроизведённый и вылеченный дедлок, миграции без простоя"
      },
      {
        "h": "~3,5 ч",
        "t": "MVCC и VACUUM изнутри, партиционирование, Production Hell",
        "r": "Версии строк видны через pageinspect, таблица партиционирована по месяцам, финальные задания без подсказок"
      },
      {
        "h": "~3,5 ч",
        "t": "Роли, права и Row Level Security",
        "r": "Роли и GRANT, Row Level Security, представления; «сломать → починить» про утечку строк"
      },
      {
        "h": "~3,5 ч",
        "t": "Копии, восстановление и репликация",
        "r": "pg_dump и pg_restore, PITR, потоковая репликация; «сломать → починить» про восстановление"
      },
      {
        "h": "~3,5 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового решения по всему пройденному материалу"
      }
    ],
    arch: {
      "title": "Путь запроса внутри PostgreSQL",
      "rows": [
        {
          "label": "Клиенты",
          "boxes": [
            "psql [A] [B] [C]",
            "pgbench"
          ]
        },
        {
          "label": "Процесс",
          "boxes": [
            "postmaster :5432",
            "backend на соединение"
          ]
        },
        {
          "label": "Разбор и план",
          "boxes": [
            "Parser · Analyzer",
            "Planner (pg_stats)"
          ]
        },
        {
          "label": "Исполнение",
          "boxes": [
            "Executor",
            "узлы плана"
          ]
        },
        {
          "label": "Хранение",
          "boxes": [
            "shared_buffers",
            "heap и индексы (страницы 8 КБ)",
            "WAL",
            "VACUUM"
          ]
        }
      ],
      "note": "Обратный путь: строки возвращаются по дереву узлов клиенту; ловушка — оценка rows по pg_stats может врать, и планировщик выберет плохой план.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "клиент и процесс",
            "x": 14,
            "w": 300
          },
          {
            "t": "разбор и план",
            "x": 400,
            "w": 320
          },
          {
            "t": "хранение",
            "x": 760,
            "w": 226
          }
        ],
        "nodes": [
          {
            "id": "cli",
            "t": "psql · pgbench",
            "s": "терминалы A, B, C",
            "x": 110,
            "y": 150,
            "d": "Несколько клиентов одновременно подключаются к одному контейнеру pglab (postgres:18) и шлют запросы."
          },
          {
            "id": "be",
            "t": "backend",
            "s": "процесс на соединение",
            "x": 110,
            "y": 330,
            "d": "Главный процесс postmaster слушает порт 5432 и на каждое соединение запускает отдельный backend."
          },
          {
            "id": "par",
            "t": "Parser·Analyzer",
            "s": "синтаксис и каталог",
            "x": 560,
            "y": 110,
            "d": "Проверяет синтаксис, находит таблицы и колонки в каталоге (pg_class, pg_attribute), проверяет типы."
          },
          {
            "id": "pln",
            "t": "Planner",
            "s": "стоимость по pg_stats",
            "x": 560,
            "y": 230,
            "d": "Перебирает варианты (Seq Scan, индекс, порядок JOIN) и выбирает самый дешёвый по статистике и константам стоимости."
          },
          {
            "id": "exe",
            "t": "Executor",
            "s": "дерево узлов плана",
            "x": 560,
            "y": 350,
            "d": "Выполняет план: каждый узел тянет строки у дочернего. EXPLAIN ANALYZE показывает реальное время и Buffers."
          },
          {
            "id": "buf",
            "t": "shared_buffers",
            "s": "hit / read",
            "x": 880,
            "y": 110,
            "d": "Общий кэш страниц. Страница в кэше даёт shared hit, иначе read через ОС."
          },
          {
            "id": "heap",
            "t": "heap и индексы",
            "s": "страницы 8 КБ · ctid",
            "x": 880,
            "y": 230,
            "d": "Таблица orders на миллион строк и B-tree, GIN, BRIN индексы. Строка адресуется парой (страница, слот)."
          },
          {
            "id": "wal",
            "t": "WAL",
            "s": "журнал при COMMIT",
            "x": 880,
            "y": 350,
            "d": "Любая запись сначала попадает в журнал, COMMIT ждёт только fsync журнала, страницы допишутся на checkpoint."
          },
          {
            "id": "vac",
            "t": "VACUUM",
            "s": "мёртвые версии строк",
            "x": 880,
            "y": 470,
            "d": "UPDATE не меняет строку на месте, а создаёт новую версию. VACUUM убирает старые, если их не держит долгая транзакция."
          }
        ],
        "edges": [
          {
            "a": "cli",
            "b": "be"
          },
          {
            "a": "be",
            "b": "par"
          },
          {
            "a": "par",
            "b": "pln"
          },
          {
            "a": "pln",
            "b": "exe"
          },
          {
            "a": "exe",
            "b": "buf"
          },
          {
            "a": "buf",
            "b": "heap"
          },
          {
            "a": "exe",
            "b": "wal"
          },
          {
            "a": "vac",
            "b": "heap"
          },
          {
            "a": "exe",
            "b": "cli",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "cli",
            "txt": "psql отправляет SELECT ... WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 20."
          },
          {
            "n": "be",
            "txt": "Запрос принимает выделенный backend этого соединения."
          },
          {
            "n": "par",
            "txt": "Parser и Analyzer строят дерево и проверяют таблицы и типы."
          },
          {
            "n": "pln",
            "txt": "Planner по pg_stats выбирает Index Scan вместо Seq Scan."
          },
          {
            "n": "exe",
            "txt": "Executor запускает узлы плана."
          },
          {
            "n": "buf",
            "txt": "Нужные страницы берутся из shared_buffers (hit) или читаются с диска (read)."
          },
          {
            "n": "heap",
            "txt": "Индекс по (customer_id, created_at) сразу отдаёт 20 строк без сортировки."
          },
          {
            "n": "exe",
            "txt": "Executor собирает результат.",
            "back": true
          },
          {
            "n": "cli",
            "txt": "Клиент получает 20 строк.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему индекс по (customer_id, created_at) ускоряет WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20, а по (created_at, customer_id) нет?",
        "a": "Индекс отсортирован сначала по клиенту, затем по дате внутри клиента, как телефонная книга. Планировщик доходит до нужного customer_id и читает 20 записей подряд. Первой колонкой должно идти равенство, затем диапазон или сортировка, иначе индекс для этого запроса почти бесполезен."
      },
      {
        "q": "Защищает ли транзакция на уровне по умолчанию от «прочитал остаток → вычел → записал»?",
        "a": "Нет: в Read Committed два параллельных запроса оба прочитают 50 и оба запишут 49, в лабе 50 продаж списали со склада всего 6. Чинится тремя способами: атомарный UPDATE stock = stock - 1, SELECT ... FOR UPDATE или оптимистическая блокировка по колонке version."
      },
      {
        "q": "Как сделать очередь задач на Postgres и что делает SKIP LOCKED?",
        "a": "Воркеры берут задачи запросом с FOR UPDATE SKIP LOCKED: заблокированные другим воркером строки пропускаются, а не ожидаются. Очередь работает транзакционно вместе с остальными данными, без Redis и RabbitMQ, до сотен–тысяч задач в секунду. Плата: каждая взятая задача создаёт мёртвую версию строки, и таблице нужен VACUUM."
      },
      {
        "q": "Чем VACUUM отличается от VACUUM FULL и что значит «dead but not yet removable»?",
        "a": "Обычный VACUUM не уменьшает файл, а делает место переиспользуемым. VACUUM FULL возвращает место ОС, но блокирует таблицу целиком. «Not yet removable» значит, что где-то живёт старый снимок, например долгая транзакция, и VACUUM отработал, но ничего удалить не может."
      },
      {
        "q": "Как N+1 выглядит со стороны базы и как его найти?",
        "a": "Это сотни одинаковых быстрых запросов по доли миллисекунды, поэтому в логе медленных запросов их нет. Ловится в pg_stat_statements по колонке calls, а лечится одним запросом с = ANY(...), то же самое делает with() в Eloquent."
      }
    ],
    accent: '#4A90D9',
  },
  {
    key: 'nuxt',
    titleMain: 'nuxt',
    title: 'Nuxt Lab',
    subtitle: 'Help Center — SSR, SSG и SPA в одном приложении',
    desc: 'Публичный центр поддержки на Nuxt 4 и TypeScript: файловый роутинг, useFetch и гидрация, Nitro server routes, Drizzle + SQLite, общие Zod-схемы в shared/, сессии и защита страниц, Nuxt Content, routeRules (SSG, SWR, SPA), SEO, тесты и сборка в Docker, SSE и WebSocket, i18n, безопасность (заголовки, XSS), итоговое ТЗ.',
    stack: ['Nuxt 4', 'TypeScript', 'Nitro', 'Drizzle', 'Nuxt Content'],
    difficulty: 'Высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/nuxt/Nuxt.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/nuxt/nuxt.html',
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
        "code": "app/pages/\n├── index.vue                  → /\n├── kb/\n│   ├── index.vue              → /kb\n│   └── [category]/\n│       └── [slug].vue         → /kb/network/vpn-setup\n├── tickets/\n│   ├── index.vue              → /tickets\n│   └── [id].vue               → /tickets/42\n└── [...slug].vue              → всё остальное (catch-all, для 404)"
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
    sessions: [
      {
        "h": "~3 ч",
        "t": "Стенд и основы: роутинг, layouts, SSR руками",
        "r": "Каркас всех зон с навигацией, увиденная разница SSR и SPA"
      },
      {
        "h": "~3 ч",
        "t": "Данные и гидрация: useFetch, payload, ошибки, mismatch",
        "r": "Страница статуса на статичных данных, пойманы двойной запрос и mismatch"
      },
      {
        "h": "~3 ч",
        "t": "Nitro и БД: Drizzle, валидация, request-id, форма",
        "r": "Статус из БД, API и форма обращения"
      },
      {
        "h": "~4 ч",
        "t": "Авторизация и состояние: сессии, middleware, cookie, утечки, кабинет агента",
        "r": "Вход, «мои обращения», кабинет агента: очередь и смена статуса"
      },
      {
        "h": "~4 ч",
        "t": "Контент, кеш, рендеринг: Nuxt Content, поиск, routeRules, SWR",
        "r": "База знаний с поиском, пререндер, кешируемая страница статуса"
      },
      {
        "h": "~3,5 ч",
        "t": "SEO и продакшн: meta, sitemap, robots, runtimeConfig, тесты, Docker",
        "r": "Индексируемая база знаний, тесты, prod-образ, итоговая таблица"
      },
      {
        "h": "~4 ч",
        "t": "Реальное время: SSE, WebSocket и задачи Nitro",
        "r": "Server-Sent Events, WebSocket и задачи Nitro; «сломать → починить»"
      },
      {
        "h": "~3,5 ч",
        "t": "Интернационализация: два языка в одном Help Center",
        "r": "Модуль i18n, язык и SEO, форматы и проверка; «сломать → починить»"
      },
      {
        "h": "~3,5 ч",
        "t": "Безопасность: заголовки, перебор паролей, XSS и подделка запросов",
        "r": "Заголовки безопасности, cookie и Origin, перебор паролей, XSS; два шага «сломать → починить»"
      },
      {
        "h": "~4 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового ответа"
      }
    ],
    arch: {
      "title": "Путь прямого открытия /tickets",
      "rows": [
        {
          "label": "Браузер",
          "boxes": [
            "GET /tickets + Cookie nuxt-session"
          ]
        },
        {
          "label": "Nitro · middleware",
          "boxes": [
            "server/middleware/request-id.ts",
            "routeRules",
            "app/middleware/auth.ts"
          ]
        },
        {
          "label": "Nuxt · рендер",
          "boxes": [
            "pages/tickets/index.vue",
            "useFetch('/api/tickets')",
            "renderToString"
          ]
        },
        {
          "label": "server/api",
          "boxes": [
            "tickets/index.get.ts",
            "requireUserSession"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "Drizzle · useDb",
            "SQLite .data/app.sqlite"
          ]
        }
      ],
      "note": "Обратный путь: сервер отдаёт HTML со списком и payload, а при гидрации useFetch берёт данные из payload и повторного запроса к API не делает.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "браузер",
            "x": 14,
            "w": 200
          },
          {
            "t": "Nitro · SSR-рендер",
            "x": 230,
            "w": 440
          },
          {
            "t": "server/api · БД",
            "x": 700,
            "w": 286
          }
        ],
        "nodes": [
          {
            "id": "br",
            "t": "Браузер",
            "s": "GET /tickets + Cookie",
            "x": 110,
            "y": 150,
            "d": "Прямое открытие страницы: вместе с запросом уходит зашифрованная cookie nuxt-session."
          },
          {
            "id": "hy",
            "t": "Гидрация",
            "s": "payload __NUXT_DATA__",
            "x": 110,
            "y": 400,
            "d": "Страница видна сразу из HTML. Затем Vue оживляет её, а useFetch берёт данные из payload, поэтому запроса к API нет."
          },
          {
            "id": "mw",
            "t": "request-id.ts",
            "s": "server middleware",
            "x": 330,
            "y": 130,
            "d": "Серверный middleware Nitro: ставит event.context.requestId, заголовок x-request-id и пишет строку в лог."
          },
          {
            "id": "rr",
            "t": "routeRules",
            "s": "для /tickets нет → SSR",
            "x": 330,
            "y": 290,
            "d": "Режим рендеринга выбирается по маршруту. Правил для /tickets нет, поэтому страница рендерится на сервере на каждый запрос."
          },
          {
            "id": "am",
            "t": "auth.ts",
            "s": "route middleware",
            "x": 550,
            "y": 130,
            "d": "Проверяет useUserSession().loggedIn. На сервере при прямом открытии чужого отправит редиректом 302 ещё до рендера."
          },
          {
            "id": "pg",
            "t": "tickets/index",
            "s": "await useFetch",
            "x": 550,
            "y": 290,
            "d": "Страница запрашивает /api/tickets. Внутренний вызов идёт без HTTP, но useFetch перекладывает заголовок Cookie входящего запроса."
          },
          {
            "id": "rs",
            "t": "renderToString",
            "s": "HTML + payload",
            "x": 550,
            "y": 450,
            "d": "Собирает HTML со списком обращений и кладёт данные в payload, чтобы браузер не запрашивал их повторно."
          },
          {
            "id": "api",
            "t": "index.get.ts",
            "s": "requireUserSession",
            "x": 880,
            "y": 150,
            "d": "Серверный хендлер проверяет сессию и берёт user.id. Без этой проверки список обращений отдавался бы любому запросу через curl."
          },
          {
            "id": "db",
            "t": "Drizzle · useDb",
            "s": "where userId = …",
            "x": 880,
            "y": 300,
            "d": "Типобезопасный запрос: select из tickets только по обращениям текущего пользователя."
          },
          {
            "id": "sq",
            "t": "SQLite",
            "s": ".data/app.sqlite",
            "x": 880,
            "y": 450,
            "d": "Файловая база приложения, без отдельного сервера. Миграции и сид выполняются при старте в server/plugins/db.ts."
          }
        ],
        "edges": [
          {
            "a": "br",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "rr"
          },
          {
            "a": "rr",
            "b": "am"
          },
          {
            "a": "am",
            "b": "pg"
          },
          {
            "a": "pg",
            "b": "api"
          },
          {
            "a": "api",
            "b": "db"
          },
          {
            "a": "db",
            "b": "sq"
          },
          {
            "a": "pg",
            "b": "rs"
          },
          {
            "a": "rs",
            "b": "hy",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "br",
            "txt": "Браузер открывает /tickets напрямую, с cookie nuxt-session."
          },
          {
            "n": "mw",
            "txt": "request-id.ts ставит requestId, заголовок x-request-id и пишет лог."
          },
          {
            "n": "rr",
            "txt": "routeRules для /tickets нет: страница рендерится на сервере (SSR)."
          },
          {
            "n": "am",
            "txt": "auth.ts на сервере видит loggedIn и пропускает дальше."
          },
          {
            "n": "pg",
            "txt": "await useFetch('/api/tickets'): внутренний вызов без HTTP, но с Cookie."
          },
          {
            "n": "api",
            "txt": "requireUserSession возвращает user.id."
          },
          {
            "n": "db",
            "txt": "Drizzle выбирает из SQLite обращения этого пользователя."
          },
          {
            "n": "rs",
            "txt": "renderToString собирает HTML со списком и payload.",
            "back": true
          },
          {
            "n": "hy",
            "txt": "Гидрация: useFetch берёт данные из payload, запроса нет.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему $fetch в setup — баг?",
        "a": "setup выполняется и на сервере, и в браузере при гидрации, поэтому запрос уходит дважды: страница видна сразу, а потом браузер зря дёргает API и она может «прыгнуть». Второй симптом: внутренний $fetch на сервере идёт без cookie входящего запроса, и API отвечает 401. useFetch кладёт результат в payload и на сервере перекладывает заголовки."
      },
      {
        "q": "Почему hydration mismatch случается со временем и в чём ловушка часового пояса?",
        "a": "Сервер нарисовал одно время, браузер при гидрации посчитал другое, и Vue видит расхождение. Даже одинаковый момент времени toLocaleTimeString форматирует по-разному: в контейнере TZ равен UTC, у браузера локальный пояс. Поэтому одной передачи значения через useState мало, нужен явный timeZone."
      },
      {
        "q": "Почему список «недавно просмотренных» в модульной переменной — утечка, а соединение с БД — нет?",
        "a": "Модули на сервере загружаются один раз на процесс, а процесс обслуживает всех пользователей. Если один открыл обращение №1, у всех остальных в шапке окажется чужой номер. Общее состояние, у которого не должно быть общего владельца, кладут в useState или Pinia: они создаются на каждый запрос."
      },
      {
        "q": "Как работает SWR и как сделать инвалидацию после записи?",
        "a": "SWR обменивает свежесть на скорость: после истечения срока первый запрос всё ещё получает старую версию и запускает перерисовку в фоне, а свежие данные видит следующий. Чтобы страница статуса не молчала после сбоя, после записи удаляют закешированную версию."
      },
      {
        "q": "Почему роль проверяется и в route middleware, и в API?",
        "a": "Middleware защищает страницу: без входа сервер отвечает редиректом ещё до рендера, а для чужой роли даёт 403. Данные защищает requireUserSession в хендлере: без него любой получил бы список обращений через curl, минуя страницу."
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
    image: 'https://meeymirita-files.storage.yandexcloud.net/angular/Angular.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/angular/angular.html',
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
        code: "export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {\n  providedIn: 'root',\n  factory: () => '/api',\n});\n\n@Injectable({ providedIn: 'root' })\nexport class RoomsApi {\n  private readonly http = inject(HttpClient);\n  private readonly base = inject(API_BASE_URL);\n}",
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
    sessions: [
      { h: '~3 ч', t: 'Стенд, компоненты, сигналы', r: 'Каталог комнат на моковых данных с фильтрами' },
      { h: '~3,5 ч', t: 'DI и HTTP', r: 'Каталог с сервера, поиск без гонок, лог и ошибки запросов' },
      { h: '~3 ч', t: 'Роутер', r: 'Страницы комнаты и расписания дня' },
      { h: '~4 ч', t: 'Формы', r: 'Форма брони с клиентской и серверной проверкой слота' },
      { h: '~3,5 ч', t: 'Авторизация, состояние, потоки', r: 'Вход, роли, стор броней и живое расписание по SSE' },
      { h: '~3,5 ч', t: 'Качество и продакшн', r: 'Тесты, runtime-конфиг, сборка под nginx' },
    ],
    arch: {
      title: 'Путь одного запроса',
      rows: [
        { label: 'Браузер · Angular 22', boxes: ['Компоненты (OnPush)', 'Signals · Signal Forms'] },
        { label: 'Состояние', boxes: ['AuthStore', 'BookingsStore'] },
        { label: 'HTTP-слой', boxes: ['authInterceptor', 'apiLogInterceptor', 'errorInterceptor', 'HttpClient · httpResource'] },
        { label: 'nginx :8080', boxes: ['SPA-fallback', 'прокси /api'] },
        { label: 'API на Node :3000', boxes: ['REST /api/*', 'SSE /api/events'] },
      ],
      live: {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "браузер · Angular",
            "x": 14,
            "w": 340
          },
          {
            "t": "HTTP-слой",
            "x": 450,
            "w": 200
          },
          {
            "t": "сервер",
            "x": 680,
            "w": 306
          }
        ],
        "nodes": [
          {
            "id": "ui",
            "t": "Компоненты",
            "s": "OnPush",
            "x": 110,
            "y": 150,
            "d": "BookingPage читает сигналы прямо в шаблоне. Перерисовка происходит только там, где сигнал реально изменился."
          },
          {
            "id": "sig",
            "t": "Signals · Forms",
            "s": "состояние формы",
            "x": 110,
            "y": 330,
            "d": "Модель формы на сигналах: правила валидации, pending() на время проверки слота, ошибки у полей."
          },
          {
            "id": "bks",
            "t": "BookingsStore",
            "s": "create() · «мои брони»",
            "x": 330,
            "y": 150,
            "d": "Стор на сигналах: create() отправляет бронь, список «Мои брони» и счётчик в шапке обновляются автоматически."
          },
          {
            "id": "auth",
            "t": "AuthStore",
            "s": "токен и роль",
            "x": 330,
            "y": 400,
            "d": "Хранит токен и роль пользователя. isAdmin() читает guard, токен подставляет интерцептор."
          },
          {
            "id": "http",
            "t": "HttpClient",
            "s": "httpResource",
            "x": 550,
            "y": 150,
            "d": "Отправляет запросы. httpResource сам перезапускается, когда меняется сигнал-параметр (например, дата в расписании)."
          },
          {
            "id": "int",
            "t": "Интерцепторы",
            "s": "auth → log → error",
            "x": 550,
            "y": 330,
            "d": "authInterceptor добавляет Bearer, apiLogInterceptor логирует запрос, errorInterceptor превращает 401 и 500 в понятные ошибки."
          },
          {
            "id": "ngx",
            "t": "nginx :8080",
            "s": "SPA-fallback · /api",
            "x": 770,
            "y": 240,
            "d": "Отдаёт статику Angular с SPA-fallback на index.html и проксирует /api на Node."
          },
          {
            "id": "rest",
            "t": "REST /api/*",
            "s": "Node :3000",
            "x": 900,
            "y": 110,
            "d": "Сервер бронирований: 201 при успехе, 409 при пересечении брони, 403 при попытке отменить чужую."
          },
          {
            "id": "sse",
            "t": "SSE /api/events",
            "s": "поток событий",
            "x": 900,
            "y": 390,
            "d": "Поток server-sent events: событие booking.created приходит всем открытым клиентам без перезагрузки страницы."
          }
        ],
        "edges": [
          {
            "a": "ui",
            "b": "bks"
          },
          {
            "a": "ui",
            "b": "sig"
          },
          {
            "a": "sig",
            "b": "bks"
          },
          {
            "a": "bks",
            "b": "http"
          },
          {
            "a": "auth",
            "b": "int"
          },
          {
            "a": "http",
            "b": "int"
          },
          {
            "a": "int",
            "b": "ngx"
          },
          {
            "a": "ngx",
            "b": "rest"
          },
          {
            "a": "ngx",
            "b": "sse"
          },
          {
            "a": "sse",
            "b": "bks",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "ui",
            "txt": "Пользователь нажимает «Забронировать»: форма прошла проверку."
          },
          {
            "n": "bks",
            "txt": "BookingsStore.create() готовит запрос POST /api/bookings."
          },
          {
            "n": "http",
            "txt": "HttpClient отправляет запрос."
          },
          {
            "n": "int",
            "txt": "authInterceptor добавил Bearer, apiLogInterceptor записал лог."
          },
          {
            "n": "ngx",
            "txt": "nginx проксирует /api на Node."
          },
          {
            "n": "rest",
            "txt": "Сервер отвечает 201 и рассылает событие."
          },
          {
            "n": "sse",
            "txt": "SSE: событие booking.created уходит клиентам.",
            "back": true
          },
          {
            "n": "bks",
            "txt": "Стор получил событие — «Мои брони» и расписание обновились.",
            "back": true
          }
        ]
      },
      note: 'Обратный путь: сервер шлёт по SSE событие booking.created — и слот появляется в расписании у остальных пользователей без перезагрузки.',
    },
    faq: [
      { q: 'Чем canMatch отличается от canActivate для админки?', a: 'canMatch решает, подходит ли маршрут вообще: при false он не совпадает, и ленивый чанк админки даже не загружается. canActivate срабатывает уже после совпадения. При этом оба guard — только UX: код клиента можно обойти, настоящая проверка (403) живёт на сервере.' },
      { q: 'Почему HttpClient.get ничего не отправляет без подписки?', a: 'Observable холодный: запрос стартует в момент subscribe. Две подписки — два запроса. Поэтому в шаблонах с сигналами используют toSignal или httpResource, а не забытый get().' },
      { q: 'Что запускает перерисовку в zoneless-приложении с OnPush?', a: 'Изменение сигнала, который читается в шаблоне, событие из шаблона и явный markForCheck. Поэтому мутация массива «на месте» сетку не обновит: сигнал не узнал, что что-то изменилось.' },
      { q: 'Зачем SPA-fallback в nginx?', a: 'Без него прямая ссылка или F5 на /rooms/2 даст 404: такого файла на диске нет. Fallback отдаёт index.html, а дальше маршрут разбирает роутер Angular.' },
      { q: 'Почему клиентская проверка слота не отменяет обработку 409?', a: 'Между проверкой и отправкой формы слот мог занять кто-то другой. Клиентская проверка — подсказка, источник истины — сервер, и его 409 нужно показать у полей времени.' },
    ],
    accent: '#CC26D5',
  },
  {
    key: 'css',
    titleMain: 'css',
    title: 'CSS Lab',
    subtitle: 'FrontFest — сайт конференции',
    desc: 'Современный CSS с нуля на сайте фронтенд-конференции: каскад и @layer, токены, oklch и тёмная тема через light-dark(), Flexbox, Grid и subgrid, адаптив и container queries, :has() и формы, sticky, анимации и view transitions, печать и scroll-snap, scroll-driven animations и anchor positioning, производительность и stylelint, итоговое ТЗ. Разметка готовая — вы пишете только стили, без фреймворков и препроцессоров.',
    stack: ['CSS', '@layer', 'Grid', 'Container Queries', 'oklch'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/css/css.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/css/css.html',
    repo: 'https://github.com/meeymirita/css-lab',
    stackInfo: [
      {
        "tag": "язык",
        "back": "Единственный язык проекта: разметка готовая, пишутся только стили."
      },
      {
        "tag": "каскад",
        "back": "Слои задают порядок групп стилей независимо от специфичности."
      },
      {
        "tag": "раскладка",
        "back": "Сетка спикеров, программа по линиям времени и subgrid для тарифов."
      },
      {
        "tag": "адаптив",
        "back": "Карточки подстраиваются под контейнер, а не под окно."
      },
      {
        "tag": "цвет",
        "back": "Палитра и тёмная тема на oklch и light-dark()."
      }
    ],
    learn: [
      {
        "tab": "Каскад и @layer",
        "title": "Слои вместо войны специфичности",
        "text": "Чужой CSS с #id и !important перебить обычными средствами нельзя. Порядок слоёв проверяется раньше специфичности, поэтому один объявленный порядок решает проблему без хаков.",
        "points": [
          "Порядок слоёв объявляется одной строкой",
          "@import ... layer(...) для каждого файла",
          "У !important порядок слоёв переворачивается"
        ],
        "code": "@layer reset, vendor, tokens, base, layout, components, utilities;\n\n@import url('reset.css') layer(reset);\n@import url('vendor-widget.css') layer(vendor);\n@import url('tokens.css') layer(tokens);\n@import url('components.css') layer(components);"
      },
      {
        "tab": "Цвет и тёмная тема",
        "title": "oklch и light-dark()",
        "text": "Вся палитра строится от одного оттенка, а тёмная тема задаётся вторым значением в light-dark(). Ловушка: жёстко заданный цвет в компоненте не переключается вместе с темой.",
        "points": [
          "oklch: предсказуемая светлота",
          "color-mix и относительный синтаксис для производных",
          "color-scheme: light dark и ручной data-theme"
        ],
        "code": ":root {\n  color-scheme: light dark;\n  --brand:      light-dark(oklch(52% 0.2 var(--hue)), oklch(72% 0.16 var(--hue)));\n  --brand-soft: light-dark(oklch(94% 0.04 var(--hue)), oklch(28% 0.06 var(--hue)));\n  --bg:         light-dark(oklch(98.5% 0.005 var(--hue)), oklch(17% 0.015 var(--hue)));\n}\n:root[data-theme=\"dark\"] { color-scheme: dark; }"
      },
      {
        "tab": "Адаптивная сетка",
        "title": "Grid без медиазапросов",
        "text": "Сетка спикеров сама решает, сколько колонок помещается. Ловушка: minmax(18rem, 1fr) даёт горизонтальный скролл на узком экране, пока минимум не обёрнут в min().",
        "points": [
          "auto-fill против auto-fit",
          "min(100%, 18rem) спасает узкие экраны",
          "Дальше subgrid выравнивает строки карточек тарифов"
        ],
        "code": ".speaker-list {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));\n  gap: var(--space-5);\n}"
      },
      {
        "tab": "Container queries",
        "title": "Компонент знает своё место",
        "text": "Карточка спикера должна зависеть от ширины контейнера, а не окна: одна и та же карточка встречается в сетке и в узкой колонке. Медиазапрос этого не различает.",
        "points": [
          "container-type: inline-size на предке",
          "@container вместо @media",
          "Единицы cqi для шрифта от ширины карточки"
        ],
        "code": ".speaker { container-type: inline-size; }\n\n.speaker-card { flex-direction: column; }\n@container (inline-size >= 24rem) {\n  .speaker-card { flex-direction: row; }\n}\n.speaker-card h3 { font-size: clamp(1.05rem, 0.8rem + 3cqi, 1.4rem); }"
      },
      {
        "tab": "Формы на :has()",
        "title": "Состояние без JavaScript",
        "text": "Родительский селектор :has() подсвечивает поле по состоянию его input и показывает блок по выбранному тарифу. :user-invalid, в отличие от :invalid, срабатывает только после взаимодействия.",
        "points": [
          "Ошибка только после работы с полем",
          "Показать блок по :checked без JS",
          "Вложенность CSS с &"
        ],
        "code": ".field {\n  &:has(:user-invalid) {\n    & input, & textarea { border-color: var(--danger); }\n    & .error-text { display: block; }\n  }\n}\n.workshops { display: none; }\n.form:has(#plan-workshops:checked) .workshops { display: grid; }"
      },
      {
        "tab": "Анимации",
        "title": "@property и popover",
        "text": "Регистрация переменной через @property учит браузер интерполировать угол, поэтому градиентная рамка вращается плавно. Для поповера @starting-style задаёт точку старта анимации из display: none.",
        "points": [
          "@property с типом <angle>",
          "transition ... allow-discrete",
          "prefers-reduced-motion как обязательное уважение к пользователю"
        ],
        "code": "@property --angle { syntax: \"<angle>\"; initial-value: 0deg; inherits: false; }\n\n.plan-featured {\n  background: conic-gradient(from var(--angle), var(--brand), var(--brand)) border-box;\n  animation: spin-border 6s linear infinite;\n}\n@keyframes spin-border { to { --angle: 360deg; } }"
      }
    ],
    sessions: [
      {
        "h": "~3 ч",
        "t": "Основы и каскад: стенд, reset, типографика, слои, box model",
        "r": "Аккуратная типографика, побеждён «чужой» CSS"
      },
      {
        "h": "~3,5 ч",
        "t": "Токены, цвет, темы, текст: дизайн-система на переменных",
        "r": "Дизайн-система на переменных, светлая и тёмная темы"
      },
      {
        "h": "~3 ч",
        "t": "Flexbox: шапка, медиа-объект, карточки тарифов",
        "r": "Шапка, кнопки, карточки тарифов"
      },
      {
        "h": "~3,5 ч",
        "t": "Grid: каркас, full-bleed, спикеры, таймлайн программы, subgrid",
        "r": "Каркас, спикеры, таймлайн программы, выровненные тарифы"
      },
      {
        "h": "~3,5 ч",
        "t": "Адаптив, container queries, :has(), формы",
        "r": "Всё адаптивно, форма без JS"
      },
      {
        "h": "~3,5 ч",
        "t": "Позиционирование, движение, view transitions, сборка",
        "r": "Живой интерфейс и собранный CSS"
      },
      {
        "h": "~3,5 ч",
        "t": "Печать и прокрутка",
        "r": "Печать, якоря и шапка, scroll-snap; «сломать → починить»"
      },
      {
        "h": "~3,5 ч",
        "t": "Новые возможности как прогрессивное улучшение",
        "r": "Анимация от прокрутки, anchor positioning, @scope как прогрессивное улучшение"
      },
      {
        "h": "~3,5 ч",
        "t": "Производительность и дисциплина кода",
        "r": "content-visibility, stylelint, дисциплина кода; «сломать → починить»"
      },
      {
        "h": "~3,5 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового ответа"
      }
    ],
    arch: {
      "title": "Путь стиля",
      "rows": [
        {
          "label": "Файлы",
          "boxes": [
            "main.css: порядок слоёв и @import",
            "reset · vendor-widget · tokens",
            "base · layout · components · utilities"
          ]
        },
        {
          "label": "Каскад",
          "boxes": [
            "происхождение",
            "слой @layer",
            "специфичность",
            "порядок в коде"
          ]
        },
        {
          "label": "Токены",
          "boxes": [
            "custom properties",
            "clamp() · oklch",
            "light-dark() + color-scheme"
          ]
        },
        {
          "label": "Раскладка",
          "boxes": [
            "Flexbox · Grid · subgrid",
            "@container"
          ]
        },
        {
          "label": "Отрисовка",
          "boxes": [
            "sticky · z-index",
            "transitions · @property",
            "view transitions"
          ]
        }
      ],
      "note": "Обратный путь: смена темы меняет одно свойство color-scheme, и все light-dark()-токены пересчитываются; жёстко заданный цвет остаётся «пятном» на тёмном фоне.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "файлы",
            "x": 14,
            "w": 224
          },
          {
            "t": "браузер: расчёт стиля",
            "x": 250,
            "w": 440
          },
          {
            "t": "экран",
            "x": 700,
            "w": 290
          }
        ],
        "nodes": [
          {
            "id": "main",
            "t": "main.css",
            "s": "@layer + @import",
            "x": 110,
            "y": 110,
            "d": "Один раз объявляет порядок слоёв reset, vendor, tokens, base, layout, components, utilities и подключает остальные файлы."
          },
          {
            "id": "tok",
            "t": "tokens.css",
            "s": "переменные и темы",
            "x": 110,
            "y": 250,
            "d": "Шкала отступов, резиновые размеры на clamp(), палитра в oklch и light-dark()-цвета для светлой и тёмной темы."
          },
          {
            "id": "cas",
            "t": "Каскад",
            "s": "слой → специфичность",
            "x": 350,
            "y": 110,
            "d": "Критерии по порядку: происхождение, style, слой, специфичность, порядок в коде. Поздний слой побеждает раньше специфичности."
          },
          {
            "id": "cmp",
            "t": "Computed",
            "s": "var() · clamp() · oklch",
            "x": 350,
            "y": 250,
            "d": "Браузер подставляет значения токенов: var(--step-1) превращается в число пикселей, light-dark() выбирает цвет по color-scheme."
          },
          {
            "id": "lay",
            "t": "Раскладка",
            "s": "flex · grid · subgrid",
            "x": 590,
            "y": 250,
            "d": "Из вычисленных стилей строится раскладка: каркас на grid, шапка и карточки на flex, тарифы на subgrid."
          },
          {
            "id": "cq",
            "t": "@container",
            "s": "карточка знает место",
            "x": 590,
            "y": 390,
            "d": "Размер карточки берётся не из окна, а из контейнера: container-type и запросы в единицах cqi."
          },
          {
            "id": "pnt",
            "t": "Отрисовка",
            "s": "sticky · z-index",
            "x": 830,
            "y": 250,
            "d": "Слои наложения, липкая шапка, transitions и keyframes, view transitions между страницами."
          },
          {
            "id": "th",
            "t": "theme.js",
            "s": "data-theme · scheme",
            "x": 830,
            "y": 110,
            "d": "Кнопка ◐ ставит атрибут data-theme, а он меняет одно свойство color-scheme."
          }
        ],
        "edges": [
          {
            "a": "main",
            "b": "cas"
          },
          {
            "a": "tok",
            "b": "cmp"
          },
          {
            "a": "cas",
            "b": "cmp"
          },
          {
            "a": "cmp",
            "b": "lay"
          },
          {
            "a": "lay",
            "b": "cq"
          },
          {
            "a": "cq",
            "b": "pnt"
          },
          {
            "a": "th",
            "b": "cmp",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "main",
            "txt": "main.css задаёт порядок слоёв и подключает файлы через @import."
          },
          {
            "n": "cas",
            "txt": "Каскад: побеждает слой components, а не vendor, специфичность даже не сравнивается."
          },
          {
            "n": "cmp",
            "txt": "Токены превращаются в значения: var(--step-1), clamp(), light-dark()."
          },
          {
            "n": "lay",
            "txt": "Строится раскладка: grid для каркаса, flex для шапки и карточек."
          },
          {
            "n": "cq",
            "txt": "Карточка подстраивается под ширину контейнера, а не окна."
          },
          {
            "n": "pnt",
            "txt": "Браузер рисует страницу: слои наложения, sticky-шапка, анимации."
          },
          {
            "n": "th",
            "txt": "Кнопка ◐ меняет data-theme, а вместе с ним color-scheme.",
            "back": true
          },
          {
            "n": "cmp",
            "txt": "light-dark()-токены пересчитываются без второй копии стилей.",
            "back": true
          },
          {
            "n": "pnt",
            "txt": "Страница перекрашена; при смене ширины пересчитываются и раскладка.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Перечислите по порядку критерии каскада. Почему слои «сильнее» специфичности?",
        "a": "Порядок: происхождение и важность, контекст (Shadow DOM), атрибут style, каскадные слои, специфичность, порядок в коде. До следующего критерия дело доходит только при ничьей, а слои проверяются раньше специфичности. Поэтому .btn в позднем слое побеждает #main .speaker-list li .btn из раннего."
      },
      {
        "q": "Почему !important в раннем слое побеждает !important в позднем?",
        "a": "У важных объявлений порядок слоёв переворачивается: важное в раннем слое сильнее. Поэтому важное объявление в vendor побеждает ваше обычное, и обычными правилами его не победить ни в каком слое. Честнее убрать правило из чужого файла или обернуть виджет."
      },
      {
        "q": "Почему многоточие во flex-элементе не работает без min-width: 0?",
        "a": "У flex-элементов по умолчанию min-width: auto: элемент не сжимается меньше минимального содержимого, а для строки с white-space: nowrap это вся строка. Поэтому .speaker-body раздувается до длины должности, многоточию негде появиться, и карточка вылезает из колонки. min-inline-size: 0 разрешает сжатие."
      },
      {
        "q": "Почему sticky перестаёт работать от overflow: hidden у предка и чем помогает clip?",
        "a": "overflow-x: hidden на body при том же значении на html делает body контейнером прокрутки без ограничения высоты, и шапке больше не к чему прилипать. overflow: clip обрезает лишнее так же, но контейнер прокрутки не создаёт."
      },
      {
        "q": "Что создаёт контекст наложения и почему z-index: 9999 иногда «не работает»?",
        "a": "Контекст наложения создают position с z-index, transform и translate, opacity меньше 1, filter, backdrop-filter, isolation: isolate и container-type. Внутри контекста z-index детей сравниваются только между собой. Поэтому бейдж с 9999 внутри карточки с translate остаётся под шапкой."
      }
    ],
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
    image: 'https://meeymirita-files.storage.yandexcloud.net/tailwind/tailwind.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/tailwind/tailwind.html',
    repo: 'https://github.com/meeymirita/tailwind-lab',
    stackInfo: [
      {
        "tag": "фреймворк",
        "back": "Утилитарные классы и тема на CSS-переменных в четвёртой версии."
      },
      {
        "tag": "токены",
        "back": "@theme превращает переменные в утилиты."
      },
      {
        "tag": "сборка",
        "back": "Dev-сервер и production-сборка с горячей перезагрузкой."
      },
      {
        "tag": "адаптив",
        "back": "Карточки метрик подстраиваются под ширину контейнера."
      },
      {
        "tag": "тёмная тема",
        "back": "Переключение по атрибуту и семантические цвета."
      }
    ],
    learn: [
      {
        "tab": "Тема через @theme",
        "title": "Токены порождают утилиты",
        "text": "Переменная в @theme становится и CSS-переменной, и набором утилит: --color-brand-600 даёт bg-brand-600 и text-brand-600. Так фирменная система собирается без tailwind.config.",
        "points": [
          "Шкала бренда в oklch",
          "Радиус и тень как токены карточки",
          "Значение из темы лучше произвольного [#0b5f7a]"
        ],
        "code": "@import \"tailwindcss\";\n\n@theme {\n  --color-brand-600: oklch(54% 0.13 215);\n  --color-brand-700: oklch(46% 0.11 215);\n  --font-display: \"SF Pro Display\", system-ui, sans-serif;\n  --radius-card: 1.25rem;\n  --shadow-card: 0 1px 2px oklch(0% 0 0 / 0.05), 0 8px 24px -8px oklch(0% 0 0 / 0.12);\n}"
      },
      {
        "tab": "Сканер классов",
        "title": "Почему динамические классы не работают",
        "text": "Tailwind ищет полные имена классов в исходниках как текст. Шаблонная строка bg-${color}-100 сканер не найдёт, и стиль не сгенерируется.",
        "points": [
          "Хранить полные строки классов в карте",
          "Лишние папки раздувают сборку: @source not",
          "В сборку попадают только использованные классы"
        ],
        "code": "const STATUS = {\n  ok:   { label: 'Успех',    classes: 'bg-emerald-100 text-emerald-800' },\n  warn: { label: 'Медленно', classes: 'bg-amber-100 text-amber-800' },\n  fail: { label: 'Ошибка',   classes: 'bg-rose-100 text-rose-800' },\n};"
      },
      {
        "tab": "Варианты без JS",
        "title": "group, has и sr-only",
        "text": "Переключатель «месяц/год» построен на двух настоящих радио, спрятанных через sr-only. Состояние читают has-checked и group-has-[...], поэтому JavaScript не нужен.",
        "points": [
          "has-checked: на label",
          "group-has-[#yearly:checked] на цене",
          "Фокус с клавиатуры остаётся доступным"
        ],
        "code": "<label class=\"cursor-pointer rounded-full px-4 py-2 has-checked:bg-white has-checked:shadow-xs\n              has-focus-visible:ring-2 has-focus-visible:ring-brand-600\">\n  <input type=\"radio\" name=\"period\" value=\"year\" id=\"yearly\" class=\"sr-only\"> За год\n</label>\n<span class=\"group-has-[#yearly:checked]:hidden\">2 900 ₽</span>\n<span class=\"hidden group-has-[#yearly:checked]:inline\">2 320 ₽</span>"
      },
      {
        "tab": "Container queries",
        "title": "@container и @sm:",
        "text": "Карточка метрики в четырёх узких колонках и на всю ширину над таблицей получает разную раскладку при одном и том же окне. Ловушка: без @container на предке варианты @sm: просто не сработают.",
        "points": [
          "@container на обёртке",
          "@sm:, @md: от ширины контейнера",
          "Именованные контейнеры @container/metric"
        ],
        "code": "<li class=\"@container\">\n  <article class=\"flex h-full flex-col gap-3 rounded-card border border-slate-200 bg-white p-5\n                  @sm:flex-row @sm:items-end @sm:justify-between\">\n    <p class=\"mt-1 text-3xl font-bold tracking-tight @sm:text-4xl\">12 480</p>\n  </article>\n</li>"
      },
      {
        "tab": "Тёмная тема",
        "title": "@custom-variant и роли",
        "text": "По умолчанию dark: слушает систему и не реагирует на атрибут. @custom-variant привязывает его к data-theme, а семантические токены в @theme inline избавляют от пар dark: на каждом элементе.",
        "points": [
          "Тема по атрибуту вместо media",
          "Роли surface, fg, line меняются в одном месте",
          "color-scheme: dark для нативных полей"
        ],
        "code": "@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));\n\n[data-theme=dark] { color-scheme: dark; --surface: var(--color-slate-900); --fg: var(--color-slate-100); }\n@theme inline {\n  --color-surface: var(--surface);\n  --color-fg: var(--fg);\n}"
      },
      {
        "tab": "Свои классы и слои",
        "title": "@layer components",
        "text": "Собственный класс вне слоёв побеждает утилиты и ломает модификаторы вроде p-3. В @layer components он остаётся переопределяемым.",
        "points": [
          "Слои: theme, base, components, utilities",
          "@apply как последнее средство",
          "@utility для новых утилит, работающих с вариантами"
        ],
        "code": "@layer components {\n  .card {\n    padding: 2rem;\n    border-radius: var(--radius-card);\n    background: var(--surface);\n    border: 1px solid var(--line);\n  }\n}"
      }
    ],
    sessions: [
      {
        "h": "~3 ч",
        "t": "Стенд и азбука",
        "r": "Каркас лендинга"
      },
      {
        "h": "~3 ч",
        "t": "Тема",
        "r": "Фирменная дизайн-система"
      },
      {
        "h": "~3,5 ч",
        "t": "Варианты и состояния",
        "r": "Интерактивный лендинг без JS, бейджи статусов"
      },
      {
        "h": "~3,5 ч",
        "t": "Адаптив и container queries",
        "r": "Адаптивный лендинг и дашборд"
      },
      {
        "h": "~3,5 ч",
        "t": "Тёмная тема, формы, переиспользование",
        "r": "Тёмная тема, страница настроек, документация"
      },
      {
        "h": "~3 ч",
        "t": "Продакшн",
        "r": "Prod-образ и итоговая таблица сравнения с CSS"
      }
    ],
    arch: {
      "title": "Путь класса до CSS",
      "rows": [
        {
          "label": "Разметка",
          "boxes": [
            "index.html · app.html · settings.html",
            "theme.js · app.js"
          ]
        },
        {
          "label": "Сканер",
          "boxes": [
            "поиск классов как строк",
            "@source · @source not · @source inline"
          ]
        },
        {
          "label": "Тема",
          "boxes": [
            "@theme",
            "@custom-variant dark",
            "@layer components · @utility"
          ]
        },
        {
          "label": "Сборка",
          "boxes": [
            "@tailwindcss/vite",
            "Lightning CSS",
            "dist/assets/style-хеш.css"
          ]
        },
        {
          "label": "Выдача",
          "boxes": [
            "nginx :8080",
            "кеш хешированных файлов"
          ]
        }
      ],
      "note": "Обратный путь: если у элемента класс есть, а правила в DevTools нет, сканер не нашёл строку целиком, и чинить нужно разметку, а не CSS.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "исходники",
            "x": 14,
            "w": 224
          },
          {
            "t": "Tailwind и Vite",
            "x": 250,
            "w": 440
          },
          {
            "t": "выдача",
            "x": 700,
            "w": 290
          }
        ],
        "nodes": [
          {
            "id": "html",
            "t": "HTML-разметка",
            "s": "классы целиком",
            "x": 110,
            "y": 150,
            "d": "index.html, app.html и settings.html: классы пишутся целиком, например rounded-full bg-emerald-100 dark:bg-emerald-900/40."
          },
          {
            "id": "sty",
            "t": "style.css",
            "s": "@import tailwindcss",
            "x": 110,
            "y": 330,
            "d": "Точка входа: @import \"tailwindcss\", @theme, @custom-variant, @layer components и @utility."
          },
          {
            "id": "scn",
            "t": "Сканер",
            "s": "ищет классы как текст",
            "x": 350,
            "y": 110,
            "d": "Находит кандидатов среди строк исходников и не выполняет JS. Поэтому bg-${color}-100 в CSS не попадёт."
          },
          {
            "id": "thm",
            "t": "@theme",
            "s": "--color-brand-600",
            "x": 350,
            "y": 250,
            "d": "Токены темы: из --color-brand-600 появляются bg-brand-600, text-brand-600 и другие утилиты. --color-*: initial сбрасывает палитру."
          },
          {
            "id": "var",
            "t": "Варианты",
            "s": "dark: hover: @md:",
            "x": 590,
            "y": 110,
            "d": "hover:, dark:, md: и @md: оборачивают правило в состояние, media- или container-запрос."
          },
          {
            "id": "utl",
            "t": "Utilities",
            "s": "@layer utilities",
            "x": 590,
            "y": 250,
            "d": "Для каждого класса создаётся правило, например .bg-emerald-100 { background-color: var(--color-emerald-100) }."
          },
          {
            "id": "vite",
            "t": "Vite + плагин",
            "s": "Lightning CSS · хеш",
            "x": 590,
            "y": 390,
            "d": "@tailwindcss/vite собирает CSS, Lightning CSS минифицирует его: в dist/assets/style-хеш.css только использованные классы."
          },
          {
            "id": "ng",
            "t": "nginx :8080",
            "s": "долгий кеш хешей",
            "x": 830,
            "y": 390,
            "d": "Multi-stage образ отдаёт статику; файлы с хешем в имени кешируются надолго."
          },
          {
            "id": "br",
            "t": "Браузер",
            "s": "DevTools · слои",
            "x": 830,
            "y": 150,
            "d": "В Styles правила видны с подписью @layer utilities. Утилиты сильнее preflight и слабее CSS вне слоёв."
          }
        ],
        "edges": [
          {
            "a": "html",
            "b": "scn"
          },
          {
            "a": "scn",
            "b": "utl"
          },
          {
            "a": "sty",
            "b": "thm"
          },
          {
            "a": "thm",
            "b": "utl"
          },
          {
            "a": "var",
            "b": "utl"
          },
          {
            "a": "utl",
            "b": "vite"
          },
          {
            "a": "vite",
            "b": "ng"
          },
          {
            "a": "ng",
            "b": "br"
          },
          {
            "a": "br",
            "b": "html",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "html",
            "txt": "В разметке классы записаны целиком: rounded-full bg-emerald-100."
          },
          {
            "n": "scn",
            "txt": "Сканер находит их как строки в исходниках, JS не выполняется."
          },
          {
            "n": "thm",
            "txt": "@theme даёт значения: --color-emerald-100, --spacing, брейкпоинты."
          },
          {
            "n": "var",
            "txt": "Варианты dark:, hover:, @md: оборачивают правила."
          },
          {
            "n": "utl",
            "txt": "Генерируются правила в @layer utilities."
          },
          {
            "n": "vite",
            "txt": "Vite и Lightning CSS собирают минифицированный style-хеш.css."
          },
          {
            "n": "ng",
            "txt": "nginx отдаёт файл с долгим кешем."
          },
          {
            "n": "br",
            "txt": "Браузер применяет слои: утилиты сильнее preflight."
          },
          {
            "n": "html",
            "txt": "Нет правила в DevTools: правят разметку и класс снова попадает в сканер.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Как Tailwind решает, какие классы попадут в CSS, и почему bg-${color}-500 не работает?",
        "a": "Сканер ищет в исходниках строки, похожие на классы, и не выполняет JS. Строки bg-emerald-100 там нет, есть только bg-${…}-100, поэтому правило не генерируется. Исправить можно двумя способами: писать классы целиком и выбирать между ними картой (объект, switch) либо перечислить их в @source inline(...)."
      },
      {
        "q": "На элементе p-2 px-8 и px-8 p-2 — какой будет padding и почему?",
        "a": "В обоих случаях побеждает px-8: порядок классов в атрибуте class ничего не решает. Все утилиты лежат в одном слое с одной специфичностью, и побеждает правило, которое ниже в сгенерированном CSS, а сокращения Tailwind выводит раньше полных свойств. Для двух равных классов вроде bg-sky-600 и bg-rose-600 победитель определяется внутренним порядком, поэтому конфликтующие классы на элемент не ставят."
      },
      {
        "q": "Почему dark: по умолчанию не реагирует на переключатель и как устроены семантические токены?",
        "a": "По умолчанию dark: это @media (prefers-color-scheme: dark), он слушает ОС и не знает о вашем атрибуте. @custom-variant переопределяет его как «сам элемент или предок с data-theme=dark». Семантические токены через @theme inline делают утилиты вида bg-surface → var(--surface), а значения переменных переключает атрибут."
      },
      {
        "q": "Чем md: отличается от @md: и что нужно, чтобы @md: заработал?",
        "a": "md: срабатывает по ширине окна, а @md: по ширине ближайшего контейнера, то есть это запрос @container. Чтобы он заработал, у предка должен быть @container (container-type: inline-size). Без него @md: молча ничего не делает и ошибки нет."
      },
      {
        "q": "Почему свой CSS вне слоёв перебивает утилиты и где ему место?",
        "a": "Все утилиты лежат в слое utilities, а CSS вне слоёв сильнее любого слоя. Поэтому класс .card вне слоя перебивает p-3, и уточнить компонент утилитой невозможно. В @layer components он оказывается ниже утилит, и p-3 побеждает, как и задумано."
      }
    ],
    accent: '#08a5bb',
  },
  {
    key: 'inertia',
    titleMain: 'inertia',
    title: 'Inertia Lab',
    subtitle: 'Inkwell — блог-платформа',
    desc: 'Laravel 13 + Inertia 3 + Vue 3 без starter kit, на блог-платформе «Inkwell»: протокол на проводе и объект страницы, props как публичный API через Resources, формы и валидация без 422, SSR и мета-теги, hydration mismatch и утечка Pinia между посетителями, optional/defer/merge для отложенных props, роли и Policies без дублирования прав на фронте, typed routes через Wayfinder.',
    stack: ['Laravel 13', 'Inertia 3', 'Vue 3', 'TypeScript', 'Pinia'],
    difficulty: 'Средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/inertia/inertia.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/inertia/inertia.html',
    repo: 'https://github.com/meeymirita/inertia-lab',
    stackInfo: [
      {
        "tag": "бэкенд",
        "back": "Laravel 13: контроллеры, FormRequest, Policies, сессии."
      },
      {
        "tag": "мост",
        "back": "Inertia 3 — протокол между Laravel и Vue, без отдельного API."
      },
      {
        "tag": "фронтенд",
        "back": "Vue 3 на Composition API, строго типизированный."
      },
      {
        "tag": "состояние",
        "back": "Pinia только для того, чего нет на сервере."
      },
      {
        "tag": "рендеринг",
        "back": "SSR для публичных страниц, студия автора — без него."
      }
    ],
    learn: [
      {
        "tab": "Протокол на проводе",
        "title": "HTML один раз, дальше — JSON",
        "text": "Первый визит — обычный GET: Laravel рендерит app.blade.php с объектом страницы внутри <script type=\"application/json\">. Каждый следующий клик по <Link> — XHR с заголовком X-Inertia: true на тот же URL; в ответ приходит тот же объект страницы, но уже application/json. Один маршрут обслуживает и HTML, и JSON — отдельного REST API нет.",
        "points": [
          "component + props + url + version в каждом ответе",
          "X-Inertia-Version расходится → 409 → полная перезагрузка",
          "history.pushState хранит объект страницы для кнопки «назад»"
        ],
        "code": "GET /posts/hello-world                          (обычный запрос браузера)\n← 200 text/html\n   <div id=\"app\"></div>\n   <script data-page=\"app\" type=\"application/json\">\n     {\"component\":\"Posts/Show\",\"props\":{...},\"url\":\"/posts/hello-world\",\"version\":\"a1b2c3\"}\n   </script>\n\nклик <Link href=\"/posts/other\">\n  → GET /posts/other   X-Inertia: true   X-Inertia-Version: a1b2c3\n← 200 application/json   X-Inertia: true\n   {\"component\":\"Posts/Show\",\"props\":{...},\"url\":\"/posts/other\",\"version\":\"a1b2c3\"}"
      },
      {
        "tab": "Props — белый список",
        "title": "Resource вместо модели целиком",
        "text": "Inertia::render('Posts/Show', ['post' => $post]) сериализует модель в JSON целиком — в браузер уйдёт всё, включая user_id и непоказанные поля. Каждая «форма» данных получает свой ресурс: PostCardResource для карточки в ленте, PostResource — для страницы поста с телом.",
        "points": [
          "Ресурс — белый список полей, как DTO на выходе",
          "$hidden защищает по чёрному списку, ресурс — по белому",
          "Markdown рендерится на сервере, в props уходит готовый HTML"
        ],
        "code": "// app/Http/Resources/PostResource.php\npublic function toArray(Request $request): array\n{\n    return [\n        ...PostCardResource::make($this->resource)->toArray($request),\n        'url' => route('posts.show', $this->resource),\n        'status' => $this->status,\n        'body_html' => Str::markdown($this->body, [\n            'html_input' => 'strip',\n            'allow_unsafe_links' => false,\n        ]),\n        'author_bio' => $this->author?->bio,\n    ];\n}"
      },
      {
        "tab": "303, а не 302",
        "title": "Почему редирект после PUT не повторяет метод",
        "text": "После PUT /studio/posts/5 обычный redirect — это 302, а браузеры и XHR при 302 исторически могут повторить исходный метод на новом адресе: получился бы PUT вместо GET. Middleware Inertia превращает такие редиректы в 303 See Other — однозначно «теперь сделай GET».",
        "points": [
          "Ошибка валидации — это тоже редирект: 302 back + errors в сессии",
          "errors приходит как shared prop, а не 422 JSON",
          "Состояние формы (useForm) переживает редирект с ошибками"
        ],
        "code": "useForm({ title, body, cover }).post(store.url(), { forceFormData: true })\n  → POST /studio/posts   X-Inertia: true   multipart/form-data\n       ├── ошибка → redirect()->back() (302) + errors во flash-сессии\n       │     → HandleInertiaRequests кладёт errors в props → form.errors.title\n       └── успех → redirect()->route('studio.posts.edit', $post)  (303 для PUT/PATCH/DELETE)"
      },
      {
        "tab": "Отложенные props",
        "title": "optional и defer — не вычислять лишнее",
        "text": "Prop значением вычисляется на каждом запросе, даже если partial reload попросил другое поле. Inertia::optional откладывает и вычисление, и отправку до явного запроса через only; Inertia::defer не отправляет в первом ответе, а клиент сам дозапрашивает его сразу после рендера.",
        "points": [
          "Комментарии — optional: не нужны, пока не долистали",
          "Тяжёлая статистика дашборда — defer: страница видна сразу",
          "Inertia::merge добавляет новые данные к старым — «показать ещё»"
        ],
        "code": "return Inertia::render('Posts/Show', [\n    'post' => PostResource::make($post),\n    'comments' => Inertia::optional(\n        fn () => CommentResource::collection($post->commentsVisibleTo($request->user())->get())\n    ),\n]);"
      },
      {
        "tab": "SSR: один процесс на всех",
        "title": "Pinia на уровне модуля — общий стор на сервер",
        "text": "SSR-сервер — долгоживущий процесс Node, рендерящий страницы для всех посетителей подряд. const pinia = createPinia() на верхнем уровне модуля создаёт один store на весь сервер: посетитель A записал имя — посетитель B получил его в разметке. Inertia 3 вызывает withApp(app) на каждый рендер — именно там нужно создавать Pinia.",
        "points": [
          "withApp — единственное место для Vue-плагинов",
          "window, localStorage на верхнем уровне компонента роняют SSR",
          "/studio/* исключены через withoutSsr — индексация там не нужна"
        ],
        "code": "import { createInertiaApp } from '@inertiajs/vue3'\nimport { createPinia } from 'pinia'\n\ncreateInertiaApp({\n    pages: './Pages',\n    title: (title) => (title ? `${title} — Inkwell` : 'Inkwell'),\n    withApp(app) {\n        // новый store на КАЖДЫЙ рендер — важно для SSR\n        app.use(createPinia())\n    },\n})"
      },
      {
        "tab": "Без лишнего визита",
        "title": "usePoll и useHttp",
        "text": "Не каждое обновление данных — это визит Inertia. usePoll делает периодический partial reload с автостопом при размонтировании и замедлением в фоновой вкладке; useHttp обращается к обычному JSON-эндпоинту (например, проверка уникальности слага) без смены страницы и истории.",
        "points": [
          "usePoll(15_000, { only: ['counts'] }) — обновляет только счётчик",
          "Замедление в фоновой вкладке — не греет сервер зря",
          "useHttp не трогает history и объект страницы"
        ],
        "code": "import { usePage, usePoll } from '@inertiajs/vue3'\n\nconst page = usePage()\nif (page.props.auth.user?.role === 'editor') {\n    usePoll(15_000, { only: ['counts'] })   // каждые 15 с — partial reload только счётчиков\n}"
      }
    ],
    sessions: [
      {
        "h": "~3,5 ч",
        "t": "Протокол и фундамент",
        "r": "Чистый Laravel + Inertia руками, лента на ресурсах с layout"
      },
      {
        "h": "~3 ч",
        "t": "Страница поста",
        "r": "SSR-страница поста с мета-тегами и комментариями при прокрутке"
      },
      {
        "h": "~3,5 ч",
        "t": "Пользователи и формы",
        "r": "Авторизация, студия автора, редактор поста с автосохранением"
      },
      {
        "h": "~3,5 ч",
        "t": "Данные и производительность",
        "r": "Бесконечная лента, дашборд на отложенных props, модерация"
      },
      {
        "h": "~3 ч",
        "t": "Тесты и продакшн",
        "r": "Тесты assertInertia, сборка и запуск с SSR, Production Hell"
      }
    ],
    arch: {
      "title": "Путь Inertia-визита",
      "rows": [
        {
          "label": "Браузер",
          "boxes": [
            "Vue 3 + Pinia + Wayfinder",
            "клик <Link> → router.visit"
          ]
        },
        {
          "label": "Запрос",
          "boxes": [
            "X-Inertia: true",
            "X-Inertia-Version · X-XSRF-TOKEN"
          ]
        },
        {
          "label": "Laravel",
          "boxes": [
            "HandleInertiaRequests (share/version)",
            "Controller → Resource → Inertia::render"
          ]
        },
        {
          "label": "Ответ",
          "boxes": [
            "первый визит: HTML + JSON в <script>",
            "дальше: application/json, X-Inertia: true"
          ]
        },
        {
          "label": "Клиент",
          "boxes": [
            "resolve(component) → подмена без reload",
            "history.pushState(page)"
          ]
        }
      ],
      "note": "При расхождении X-Inertia-Version сервер отвечает 409 с X-Inertia-Location — клиент делает window.location = ..., то есть полную перезагрузку.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "браузер",
            "x": 14,
            "w": 230
          },
          {
            "t": "протокол",
            "x": 260,
            "w": 220
          },
          {
            "t": "Laravel",
            "x": 500,
            "w": 490
          }
        ],
        "nodes": [
          {
            "id": "vue",
            "t": "Vue-компонент",
            "s": "<Link> · router.visit",
            "x": 110,
            "y": 150,
            "d": "Клик по <Link> перехватывается клиентом Inertia вместо обычной навигации браузера."
          },
          {
            "id": "req",
            "t": "XHR-визит",
            "s": "X-Inertia: true",
            "x": 350,
            "y": 110,
            "d": "Запрос уходит на тот же URL с заголовками X-Inertia: true и X-Inertia-Version."
          },
          {
            "id": "mw",
            "t": "HandleInertiaRequests",
            "s": "share() + version()",
            "x": 350,
            "y": 310,
            "d": "Middleware сравнивает версию ассетов; расхождение — 409 и X-Inertia-Location."
          },
          {
            "id": "ctrl",
            "t": "Controller",
            "s": "Inertia::render(...)",
            "x": 610,
            "y": 150,
            "d": "Контроллер вызывает Inertia::render с именем компонента и props."
          },
          {
            "id": "res",
            "t": "API Resource",
            "s": "белый список полей",
            "x": 610,
            "y": 330,
            "d": "Каждый prop проходит через Resource — белый список, а не модель целиком."
          },
          {
            "id": "page",
            "t": "Page Object",
            "s": "component · props · url · version",
            "x": 850,
            "y": 240,
            "d": "Laravel собирает объект страницы и отправляет его как HTML (первый визит) или JSON (дальше)."
          },
          {
            "id": "swap",
            "t": "Подмена компонента",
            "s": "pushState · без reload",
            "x": 850,
            "y": 420,
            "d": "Клиент разбирает ответ, подменяет компонент и кладёт объект страницы в history.state."
          }
        ],
        "edges": [
          {
            "a": "vue",
            "b": "req"
          },
          {
            "a": "req",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "ctrl"
          },
          {
            "a": "ctrl",
            "b": "res"
          },
          {
            "a": "res",
            "b": "page"
          },
          {
            "a": "page",
            "b": "swap"
          },
          {
            "a": "swap",
            "b": "vue",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "vue",
            "txt": "Клик по <Link>: клиент Inertia перехватывает переход вместо обычной навигации."
          },
          {
            "n": "req",
            "txt": "Запрос уходит с X-Inertia: true и X-Inertia-Version — тем же URL, что и обычный GET."
          },
          {
            "n": "mw",
            "txt": "HandleInertiaRequests сверяет версию ассетов; при расхождении — 409 и полная перезагрузка."
          },
          {
            "n": "ctrl",
            "txt": "Контроллер вызывает Inertia::render с именем компонента и props."
          },
          {
            "n": "res",
            "txt": "Каждый prop проходит через API Resource — белый список полей."
          },
          {
            "n": "page",
            "txt": "Laravel собирает объект страницы: component, props, url, version."
          },
          {
            "n": "swap",
            "txt": "Клиент подменяет компонент без перезагрузки и кладёт объект в history.state."
          },
          {
            "n": "vue",
            "txt": "Следующий клик повторяет цикл — один маршрут обслуживает и HTML, и JSON.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему валидация в Inertia не возвращает 422, и как на фронте узнать об ошибке?",
        "a": "Laravel видит, что запрос не ждёт JSON (заголовок X-Inertia, а не Accept: application/json), и делает обычный redirect back с ошибками в сессии — ровно как для Blade-формы. Middleware Inertia берёт их из сессии и кладёт в shared prop errors, поэтому form.errors.title появляется без единого 422-ответа. Вся валидация пишется один раз — в FormRequest — и на фронте не дублируется."
      },
      {
        "q": "Чем 303 после PUT/PATCH/DELETE отличается от обычного 302, и зачем это нужно?",
        "a": "По историческим причинам браузер и XHR при 302 могут повторить исходный метод на новом адресе — PUT превратился бы в PUT на другом URL. 303 See Other однозначно говорит клиенту «теперь сделай GET». Middleware Inertia подменяет 302 на 303 именно для PUT, PATCH и DELETE."
      },
      {
        "q": "Если prop передан значением, а не замыканием, что произойдёт при partial reload?",
        "a": "Значение всё равно вычислится — контроллер выполнится целиком, просто ответ не отправится клиенту. Замыкание же вообще не вызовется, если его не запросили через only. Отсюда правило «тяжёлое — в замыкание или Inertia::optional/defer», а не в простое значение."
      },
      {
        "q": "Почему Pinia, созданная на верхнем уровне модуля, ломает SSR?",
        "a": "SSR-сервер — это долгоживущий процесс Node, который рендерит страницы для всех посетителей подряд. const pinia = createPinia() на верхнем уровне модуля выполняется один раз на весь сервер — один store на всех. Inertia 3 вызывает withApp(app) на каждый рендер, и именно там app.use(createPinia()) даёт свежий store на каждый запрос."
      },
      {
        "q": "Зачем при обновлении поста с новой обложкой отправляют POST с _method: 'put', а не просто PUT?",
        "a": "Если в данных формы есть File, Inertia отправляет multipart/form-data, а PHP разбирает multipart только для POST. Для PUT-запроса файл тихо «потеряется». Поэтому отправляют POST с полем _method: 'put' — Laravel увидит его и маршрутизирует как PUT (method spoofing); это не баг Inertia или Laravel, а особенность PHP."
      }
    ],
    accent: '#0854e1',
  },
  {
    key: 'laravel-performance',
    titleMain: 'laravel-performance',
    title: 'Laravel Performance Lab',
    subtitle: 'CoffeePerf — замеры и оптимизация',
    desc: 'Измерять, а не гадать, на приложении Coffee Shop с 1 млн заказов: перцентили и k6, Debugbar и Telescope, профилирование SPX и Blackfire, OPcache и JIT, кеш с тегами и блокировками, Octane + FrankenPHP, бюджет p95 в CI, итоговое ТЗ (топ-10 по выручке).',
    stack: ['Laravel 13', 'k6', 'SPX', 'OPcache', 'Octane + FrankenPHP'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/laravel-performance/laravel-performance.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/laravel-performance/laravel-performance.html',
    repo: 'https://github.com/meeymirita/laravel-performance-lab',
    stackInfo: [
      {
        "tag": "фреймворк",
        "back": "Laravel 13 на PHP 8.4: приложение Coffee Shop с намеренными проблемами."
      },
      {
        "tag": "нагрузка",
        "back": "k6: сценарии smoke, load, stress, spike и пороги p95 как регрессионный тест."
      },
      {
        "tag": "профилирование",
        "back": "Debugbar и Telescope для запросов, SPX и Blackfire для flamegraph."
      },
      {
        "tag": "рантайм",
        "back": "PHP-FPM против Octane + FrankenPHP, OPcache и JIT."
      },
      {
        "tag": "данные",
        "back": "PostgreSQL 18 с 1 млн заказов, Redis 8 для кеша и блокировок."
      }
    ],
    learn: [
      {
        "tab": "Перцентили",
        "title": "Почему среднее врёт",
        "text": "98 быстрых запросов по 50 мс и два по 5000 мс дают среднее 149 мс — цифра выглядит терпимо, хотя каждый пятидесятый пользователь ждёт пять секунд. Поэтому в лабе смотрят на p50, p95 и p99, а не на среднее.",
        "points": [
          "Среднее скрывает хвост: p99 = 5000 мс при среднем 149 мс",
          "Замеры «до» и «после» сравнивают при одних и тех же условиях прогона",
          "percentiles.php считается чистым PHP, без Laravel"
        ],
        "code": "<?php\n// k6/percentiles.php — чистый PHP, без Laravel\n$times = array_merge(array_fill(0, 98, 50), [5000, 5000]);   // 98 быстрых запросов и 2 очень медленных\nsort($times);\n$p = fn(float $q) => $times[(int) ceil($q / 100 * count($times)) - 1];   // метод ближайшего ранга\n\nprintf(\"среднее: %d мс\\n\", array_sum($times) / count($times));\nprintf(\"p50: %d мс | p95: %d мс | p99: %d мс | max: %d мс\\n\", $p(50), $p(95), $p(99), max($times));"
      },
      {
        "tab": "k6: пороги",
        "title": "Порог как условие прохождения",
        "text": "Load-тест k6 растёт до 10 виртуальных пользователей, держит нагрузку и проверяет p95 для каждого эндпоинта отдельно — через теги name. Если порог нарушен, k6 завершается с кодом 99, и сборка в CI может упасть на регрессии производительности.",
        "points": [
          "Отдельный порог на каждый эндпоинт через тег name",
          "stages: разгон → удержание → остановка",
          "Код возврата 99 при нарушенном пороге"
        ],
        "code": "import http from 'k6/http';\nimport { check, sleep } from 'k6';\n\nexport const options = {\n  stages: [\n    { duration: '30s', target: 10 },   // разгон\n    { duration: '1m',  target: 10 },   // держим\n    { duration: '10s', target: 0 },    // остановка\n  ],\n  thresholds: {\n    http_req_failed: ['rate<0.01'],\n    'http_req_duration{name:products}': ['p(95)<500'],\n    'http_req_duration{name:orders}':   ['p(95)<500'],\n    'http_req_duration{name:order}':    ['p(95)<200'],\n    'http_req_duration{name:report}':   ['p(95)<1000'],\n  },\n};\n\nconst BASE = __ENV.BASE_URL || 'http://nginx';\n\nexport default function () {\n  const calls = [\n    ['products', '/api/products'],\n    ['orders',   '/api/orders?status=paid'],\n    ['order',    `/api/orders/${1 + Math.floor(Math.random() * 1000000)}`],\n    ['report',   '/api/report/daily'],\n  ];\n  for (const [name, path] of calls) {\n    const res = http.get(`${BASE}${path}`, { tags: { name } });\n    check(res, { 'status 200': (r) => r.status === 200 });\n  }\n  sleep(0.5);\n}"
      },
      {
        "tab": "N+1",
        "title": "Запретить lazy loading — и N+1 падает сразу",
        "text": "Вместо поиска N+1 глазами приложение заставляют падать на ленивой загрузке в разработке: Model::preventLazyLoading включают только вне продакшна. Чинится жадной загрузкой with(): один дополнительный запрос WHERE id IN (...) вместо запроса на каждую строку.",
        "points": [
          "Debugbar показывает 1 запрос к products и 50 однотипных к categories",
          "preventLazyLoading превращает «тихую тормозилку» в ошибку",
          "В проде запрет не включают: лучше медленный ответ, чем 500"
        ],
        "code": "// app/Providers/AppServiceProvider.php\nuse Illuminate\\Database\\Eloquent\\Model;\n\npublic function boot(): void\n{\n    Model::preventLazyLoading(! $this->app->isProduction());\n}\n\nRoute::get('/products', function () {\n    return Product::with('category')->get()->map(fn ($p) => [\n        'id' => $p->id, 'name' => $p->name, 'price_cents' => $p->price_cents,\n        'category' => $p->category->name,\n    ]);\n});"
      },
      {
        "tab": "OPcache",
        "title": "validate_timestamps=0 на проде",
        "text": "В продакшне код не меняется между деплоями, поэтому OPcache не сверяет время изменения файлов. Цена — после выкладки кеш нужно сбрасывать: перезапуск контейнера, reload FPM или opcache_reset(), иначе работает старый код. В разработке оставляют validate_timestamps=1.",
        "points": [
          "Без перезапуска после правки виден старый код",
          "В лабе это воспроизводится: ответы v1 → v1 → v2",
          "ini копируется в образ — после правки образ пересобирают"
        ],
        "code": "; docker/php/opcache.prod.ini — для прода (образ собирается заново на каждый релиз)\nopcache.enable=1\nopcache.memory_consumption=256\nopcache.interned_strings_buffer=16\nopcache.max_accelerated_files=20000\nopcache.validate_timestamps=0"
      },
      {
        "tab": "Кеш",
        "title": "Кеш с тегами и блокировка от stampede",
        "text": "Отчёт кешируется в Redis с тегом reports и сбрасывается при записи заказа. Когда кеш пуст, 30 одновременных запросов все пересчитывают отчёт (cache stampede). Cache::lock пропускает к пересчёту одного, остальные ждут и берут готовое.",
        "points": [
          "Cache::tags([...])->flush() — инвалидация при изменении данных",
          "k6-сценарий stampede.js стартует 30 запросов сразу после сброса",
          "Счётчик пересчётов отчёта падает до 1"
        ],
        "code": "// CoffeeController::report()\npublic function report()\n{\n    $key = 'report:daily';\n    if (($cached = Cache::tags(['reports'])->get($key)) !== null) {\n        return $cached;\n    }\n    return Cache::lock('lock:' . $key, 10)->block(5, function () use ($key) {\n        return Cache::tags(['reports'])->remember($key, 60, fn () => $this->computeReport());\n    });\n}"
      },
      {
        "tab": "Octane",
        "title": "Состояние живёт между запросами",
        "text": "Octane загружает приложение один раз и держит его в памяти воркера, поэтому статическое свойство или синглтон делят данные между посетителями. Привязка scoped создаётся заново на каждый запрос — alice и bob больше не видят чужие данные.",
        "points": [
          "Сначала воспроизводится утечка: два пользователя — чужие данные",
          "scoped вместо singleton — состояние живёт один запрос",
          "--max-requests перезапускает воркер, но утечку не лечит"
        ],
        "code": "// app/Providers/AppServiceProvider.php, метод register()\n$this->app->scoped(\\App\\Support\\VisitLog::class);\n\n// routes/api.php — замени /lab/visit\nRoute::get('/lab/visit', function (Request $r, \\App\\Support\\VisitLog $log) {\n    $user = $r->header('X-User', 'anon');\n    $log->add($user);\n    return ['you' => $user, 'seen_in_memory' => $log->all()];\n});"
      }
    ],
    sessions: [
      {
        "h": "~4 ч",
        "t": "Что такое производительность: стенд и первый замер",
        "r": "Coffee Shop с 1 млн заказов, перцентили, curl и ApacheBench"
      },
      {
        "h": "~4 ч",
        "t": "k6 с нуля",
        "r": "smoke, load, stress, spike и таблица «ДО»"
      },
      {
        "h": "~3 ч",
        "t": "Debugbar и Telescope с нуля",
        "r": "N+1 найден и закрыт запретом ленивой загрузки"
      },
      {
        "h": "~5 ч",
        "t": "Профилирование PHP: SPX, затем Blackfire",
        "r": "SPX и flamegraph отчёта, затем Blackfire"
      },
      {
        "h": "~4 ч",
        "t": "OPcache и JIT с нуля",
        "r": "эффект OPcache и честный замер JIT"
      },
      {
        "h": "~5 ч",
        "t": "Кеширование в Laravel",
        "r": "route:cache, кеш с тегами, stampede, индексы по EXPLAIN"
      },
      {
        "h": "~4 ч",
        "t": "Octane + FrankenPHP с нуля",
        "r": "первое сравнение FPM и Octane на k6"
      },
      {
        "h": "~4 ч",
        "t": "Подводные камни Octane",
        "r": "утечки состояния и памяти, итоговое сравнение"
      },
      {
        "h": "~3 ч",
        "t": "Бюджет производительности",
        "r": "таблица «до → после», бюджет p95 в CI, prod-образ"
      },
      {
        "h": "~2 ч",
        "t": "Итоговое задание",
        "r": "Итоговое ТЗ без готового ответа: топ-10 товаров по выручке — замерить, найти узкое место, починить, закрепить бюджет"
      }
    ],
    arch: {
      "title": "Путь замера: от гипотезы к цифре",
      "rows": [
        {
          "label": "Гипотеза",
          "boxes": [
            "где тормозит?",
            "что ожидаем улучшить"
          ]
        },
        {
          "label": "Нагрузка",
          "boxes": [
            "k6: smoke · load · stress · spike",
            "пороги p95 по эндпоинтам"
          ]
        },
        {
          "label": "Приложение",
          "boxes": [
            "Laravel 13: nginx + PHP-FPM или Octane",
            "PostgreSQL 18 · Redis 8"
          ]
        },
        {
          "label": "Профиль",
          "boxes": [
            "Debugbar · Telescope",
            "SPX · Blackfire"
          ]
        },
        {
          "label": "Вердикт",
          "boxes": [
            "таблица «до / после»",
            "бюджет p95 в CI"
          ]
        }
      ],
      "note": "Одна правка — один замер: изменение принимается, только если цифры «после» лучше «до» при тех же условиях прогона.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "нагрузка",
            "x": 14,
            "w": 230
          },
          {
            "t": "вход",
            "x": 260,
            "w": 220
          },
          {
            "t": "приложение и замер",
            "x": 500,
            "w": 490
          }
        ],
        "nodes": [
          {
            "id": "k6",
            "t": "k6",
            "s": "load.js · пороги p95",
            "x": 110,
            "y": 150,
            "d": "k6 даёт повторяемую нагрузку и проверяет пороги p95 по каждому эндпоинту."
          },
          {
            "id": "web",
            "t": "nginx",
            "s": "порт 8080",
            "x": 350,
            "y": 240,
            "d": "Веб-сервер принимает запросы и отдаёт их PHP-FPM (или Octane на своём порту)."
          },
          {
            "id": "app",
            "t": "Laravel 13",
            "s": "FPM или Octane",
            "x": 610,
            "y": 150,
            "d": "Приложение Coffee Shop с намеренными проблемами: N+1, тяжёлый отчёт, нет индекса."
          },
          {
            "id": "db",
            "t": "PostgreSQL · Redis",
            "s": "1 млн заказов · кеш",
            "x": 610,
            "y": 330,
            "d": "База с миллионом заказов и Redis для кеша и блокировок."
          },
          {
            "id": "prof",
            "t": "Профилирование",
            "s": "Debugbar · SPX · Blackfire",
            "x": 850,
            "y": 240,
            "d": "Инструменты показывают, на что уходит время: запросы, функции, ожидание или CPU."
          },
          {
            "id": "table",
            "t": "Таблица «до / после»",
            "s": "perf-notes.md",
            "x": 850,
            "y": 420,
            "d": "Каждая правка заносится в таблицу вместе с условиями прогона."
          }
        ],
        "edges": [
          {
            "a": "k6",
            "b": "web"
          },
          {
            "a": "web",
            "b": "app"
          },
          {
            "a": "app",
            "b": "db"
          },
          {
            "a": "app",
            "b": "prof"
          },
          {
            "a": "prof",
            "b": "table"
          },
          {
            "a": "table",
            "b": "k6",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "k6",
            "txt": "k6 запускает сценарий: smoke, load, stress или spike."
          },
          {
            "n": "web",
            "txt": "Запросы проходят через nginx к приложению."
          },
          {
            "n": "app",
            "txt": "Laravel обрабатывает запрос: контроллер, Eloquent, кеш."
          },
          {
            "n": "db",
            "txt": "База и Redis отвечают — здесь обычно прячется N+1 или тяжёлый отчёт."
          },
          {
            "n": "prof",
            "txt": "Профилировщик показывает, где ушло время: ждали или считали."
          },
          {
            "n": "table",
            "txt": "Цифры «до» и «после» попадают в таблицу."
          },
          {
            "n": "k6",
            "txt": "Следующая правка — снова замер на тех же условиях.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему среднее время ответа — плохая метрика, и что используют вместо него?",
        "a": "Среднее скрывает хвост распределения: 98 запросов по 50 мс и два по 5000 мс дают среднее 149 мс, а p99 при этом 5000 мс — каждый пятидесятый пользователь ждёт пять секунд. Поэтому смотрят перцентили (p50, p95, p99) и задают пороги на p95 по каждому эндпоинту."
      },
      {
        "q": "Что значит «wall-time большой, а CPU-time маленький» и что с этим делать?",
        "a": "Wall-time — реальное прошедшее время, включая ожидание БД, диска и сети; CPU-time — время, когда процессор действительно считал. У usleep(300_000) wall ≈ 300 мс, CPU — единицы миллисекунд: процесс ждал. «Ждём» лечится уменьшением обращений (кеш, меньше запросов), «считаем» — оптимизацией кода."
      },
      {
        "q": "Почему после config:cache функция env() возвращает null?",
        "a": "Когда конфиги закешированы, Laravel не читает файл .env, и env() вне файлов config/*.php возвращает null. Правило: env() — только внутри config/, а в коде приложения — config('...'). В лабе это воспроизводится на маршруте /lab/env: до config:cache оба значения «postgres», после — env() даёт null, config() по-прежнему «postgres»."
      },
      {
        "q": "Почему OPcache с validate_timestamps=0 требует перезапуска при деплое?",
        "a": "С validate_timestamps=0 OPcache не смотрит на изменения файлов, поэтому вы видите старый код, пока кеш не сброшен. В проде кеш сбрасывается при деплое: перезапуск контейнера, reload FPM или opcache_reset(). В разработке оставляют validate_timestamps=1, иначе каждая правка требует перезапуска."
      },
      {
        "q": "Чем Octane ускоряет приложение и какие риски приносит?",
        "a": "Octane запускает приложение один раз и держит его в памяти воркера, поэтому каждый запрос не тратит время на повторный bootstrap — ускорение не от «более быстрого PHP». Цена: всё, что приложение запомнило в памяти воркера (статические свойства, синглтоны), переживает запрос — отсюда утечки данных между пользователями и рост памяти."
      }
    ],
    accent: '#d798f8',
  },
  {
    key: 'algorithms-php',
    titleMain: 'algorithms-php',
    title: 'Algorithms PHP Lab',
    subtitle: 'CoffeeAlgo — алгоритмы и структуры данных',
    desc: 'Алгоритмы и структуры данных на задачах кофейни, каждое утверждение — замером: сложность без формул, массивы и хеш-таблицы, стек и очередь, связные списки, рекурсия, бинарный поиск и сортировки, два указателя, деревья, кучи, графы, динамическое программирование, разбор собеседований.',
    stack: ['PHP 8.4', 'SPL', 'PHPUnit', 'Docker'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/algorithms-php/algorithms-php.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/algorithms-php/algorithms-php.html',
    repo: 'https://github.com/meeymirita/algorithms-php-lab',
    stackInfo: [
      {
        "tag": "язык",
        "back": "PHP 8.4 CLI без фреймворка: только циклы, массивы и функции, пока тема не требует большего."
      },
      {
        "tag": "структуры",
        "back": "SPL: SplStack, SplQueue, SplMinHeap и своя реализация рядом для сравнения."
      },
      {
        "tag": "проверка",
        "back": "PHPUnit: у каждой задачи тест, включая граничные случаи."
      },
      {
        "tag": "замер",
        "back": "Класс Bench на hrtime: время — лучшее из нескольких прогонов, память — memory_get_usage."
      },
      {
        "tag": "среда",
        "back": "Docker: php и composer запускаются через docker compose run, ничего не ставится на хост."
      }
    ],
    learn: [
      {
        "tab": "Сложность замером",
        "title": "Таблица роста вместо формул",
        "text": "Функции O(1), O(n) и O(n²) запускаются на n = 1000…8000, и видно, как растёт время при удвоении n. Каждое утверждение о сложности лаба проверяет замером через класс Bench, который берёт лучшее из нескольких прогонов.",
        "points": [
          "Смотрим отношение при удвоении n, а не миллисекунды",
          "Bench берёт минимум из прогонов: шум системы только замедляет",
          "Невидимый O(n²) в цикле — первая задача «сломать → починить»"
        ],
        "code": "<?php\n// bench/s1_growth.php\ndeclare(strict_types=1);\nrequire __DIR__ . '/../vendor/autoload.php';\n\nuse Algo\\Bench;\n\nfunction oOne(array $a): int { return $a[count($a) - 1]; }                           // O(1)\nfunction oN(array $a): bool { foreach ($a as $v) { if ($v === -1) return true; } return false; } // O(n)\nfunction oN2(array $a): bool {                                               // O(n²)\n    $n = count($a);\n    for ($i = 0; $i < $n; $i++) {\n        for ($j = $i + 1; $j < $n; $j++) {\n            if ($a[$i] + $a[$j] === -1) return true; // такой пары нет: идём до конца\n        }\n    }\n    return false;\n}\n\nprintf(\"%6s | %10s | %10s | %12s\\n\", 'n', 'O(1) мс', 'O(n) мс', 'O(n²) мс');\nforeach ([1000, 2000, 4000, 8000] as $n) {\n    $a = range(1, $n);\n    printf(\"%6d | %10.5f | %10.5f | %12.3f\\n\", $n,\n        Bench::ms(fn() => oOne($a)), Bench::ms(fn() => oN($a)), Bench::ms(fn() => oN2($a)));\n}"
      },
      {
        "tab": "Хеш-таблица",
        "title": "Хеш вместо двух циклов",
        "text": "Брутфорс проверяет все пары — O(n²). Хеш-таблица отвечает на вопрос «встречал ли я уже дополнение?» за O(1), и весь алгоритм становится O(n) по времени за счёт O(n) памяти.",
        "points": [
          "isset по ключу массива PHP — O(1)",
          "Обмен памяти на время",
          "Отдельный шаг про то, когда хеш «ломается»: приведение ключей"
        ],
        "code": "<?php\ndeclare(strict_types=1);\nnamespace Algo;\n\nfinal class TwoSum\n{\n    /** O(n²), O(1) памяти. Возвращает индексы или null */\n    public static function brute(array $a, int $target): ?array\n    {\n        $n = count($a);\n        for ($i = 0; $i < $n; $i++) {\n            for ($j = $i + 1; $j < $n; $j++) {\n                if ($a[$i] + $a[$j] === $target) return [$i, $j];\n            }\n        }\n        return null;\n    }\n    /** O(n) времени, O(n) памяти: «встречал ли я уже дополнение?» */\n    public static function hash(array $a, int $target): ?array\n    {\n        $seen = []; // значение => индекс\n        foreach ($a as $i => $v) {\n            $need = $target - $v;\n            if (isset($seen[$need])) return [$seen[$need], $i];\n            $seen[$v] = $i;\n        }\n        return null;\n    }\n}"
      },
      {
        "tab": "Связный список",
        "title": "Разворот за один проход",
        "text": "Разворот односвязного списка делается тремя указателями: запомнить следующий узел, развернуть ссылку, сдвинуться. «Середина» находится приёмом медленного и быстрого указателей, он же ловит цикл (алгоритм Флойда).",
        "points": [
          "reverse: O(n) по времени, O(1) по памяти",
          "append без указателя на хвост — O(n)",
          "Для вставки в начало список обгоняет массив — замер в шаге 5.3"
        ],
        "code": "public function reverse(): void                                                                  // O(n), O(1) памяти\n{\n    $prev = null; $cur = $this->head;\n    while ($cur) {\n        $next = $cur->next;   // 1. запомнить\n        $cur->next = $prev;   // 2. развернуть\n        $prev = $cur;         // 3. сдвинуть\n        $cur = $next;\n    }\n    $this->head = $prev;\n}\npublic function middle(): mixed                                                                  // медленный/быстрый указатель\n{\n    $slow = $fast = $this->head;\n    while ($fast && $fast->next) { $slow = $slow->next; $fast = $fast->next->next; }\n    return $slow?->value;\n}"
      },
      {
        "tab": "Бинарный поиск",
        "title": "lowerBound — рабочая лошадка",
        "text": "Из lowerBound получаются «первое вхождение», «сколько элементов меньше x» и «куда вставить». Две функции в лабе намеренно написаны в разных стилях границ: закрытый интервал в find и полуинтервал в lowerBound.",
        "points": [
          "O(log n) шагов, но только на отсортированном массиве",
          "Ошибка в границах даёт бесконечный цикл — отдельная задача «сломать → починить»",
          "Стиль границ выбирают один и не смешивают внутри функции"
        ],
        "code": "<?php\ndeclare(strict_types=1);\nnamespace Algo;\n\nfinal class BinarySearch\n{\n    public static function find(array $a, int $x): int\n    {\n        $lo = 0; $hi = count($a) - 1;\n        while ($lo <= $hi) {\n            $mid = intdiv($lo + $hi, 2);\n            if ($a[$mid] === $x) return $mid;\n            if ($a[$mid] < $x) { $lo = $mid + 1; } else { $hi = $mid - 1; }\n        }\n        return -1;\n    }\n    /** Индекс первого элемента >= x (или count, если такого нет). Полуинтервал [lo, hi). */\n    public static function lowerBound(array $a, int $x): int\n    {\n        $lo = 0; $hi = count($a);\n        while ($lo < $hi) {\n            $mid = intdiv($lo + $hi, 2);\n            if ($a[$mid] < $x) { $lo = $mid + 1; } else { $hi = $mid; }\n        }\n        return $lo;\n    }\n}"
      },
      {
        "tab": "BFS",
        "title": "Кратчайший путь по слоям",
        "text": "BFS обходит вершины в порядке расстояния от старта, поэтому первый найденный путь кратчайший по числу рёбер. Массив $prev решает две задачи сразу: помечает посещённые вершины и позволяет восстановить путь.",
        "points": [
          "O(V + E) по времени",
          "Без пометки посещённых обход зацикливается — шаг 11.4",
          "Для взвешенных рёбер нужен Дейкстра — шаг 11.3"
        ],
        "code": "<?php\ndeclare(strict_types=1);\nnamespace Algo;\n\nfinal class Graph\n{\n    /** @var array<string, string[]> */\n    private array $adj = [];\n\n    public function addEdge(string $u, string $v): void\n    {\n        $this->adj[$u][] = $v;\n        $this->adj[$v][] = $u;\n    }\n    public function neighbors(string $u): array { return $this->adj[$u] ?? []; }\n    public function vertices(): array { return array_keys($this->adj); }\n\n    public function shortestPath(string $from, string $to): ?array      // BFS, O(V + E)\n    {\n        $prev = [$from => null];                                         // он же «посещённые»\n        $q = new \\SplQueue(); $q->enqueue($from);\n        while (!$q->isEmpty()) {\n            $u = $q->dequeue();\n            if ($u === $to) {\n                $path = [];\n                for ($x = $to; $x !== null; $x = $prev[$x]) { array_unshift($path, $x); }\n                return $path;\n            }\n            foreach ($this->neighbors($u) as $v) {\n                if (!array_key_exists($v, $prev)) { $prev[$v] = $u; $q->enqueue($v); }\n            }\n        }\n        return null;\n    }\n}"
      },
      {
        "tab": "Динамическое программирование",
        "title": "Размен монет: когда жадность проигрывает",
        "text": "Для суммы 6 и номиналов [1, 3, 4] жадный выбор самой крупной монеты даёт 4 + 1 + 1, а оптимум — 3 + 3. Динамическое программирование строит таблицу dp[x] — минимум монет на сумму x — из ответов для меньших сумм.",
        "points": [
          "O(сумма · число номиналов)",
          "«Ступеньки» — те же числа Фибоначчи с другой формулировкой",
          "Задача на ДП: оптимальная подструктура и перекрывающиеся подзадачи"
        ],
        "code": "/** dp[x] = минимум монет на сумму x; O(amount · число номиналов) */\npublic static function minCoins(array $coins, int $amount): int\n{\n    $dp = array_fill(0, $amount + 1, INF);\n    $dp[0] = 0;\n    for ($x = 1; $x <= $amount; $x++) {\n        foreach ($coins as $c) {\n            if ($c <= $x && $dp[$x - $c] + 1 < $dp[$x]) $dp[$x] = $dp[$x - $c] + 1;\n        }\n    }\n    return is_infinite($dp[$amount]) ? -1 : (int) $dp[$amount];\n}"
      }
    ],
    sessions: [
      {
        "h": "~3 ч",
        "t": "Мышление и сложность",
        "r": "Bench, таблица роста O(1) / O(n) / O(n²), память"
      },
      {
        "h": "~3 ч",
        "t": "Массивы и строки",
        "r": "isset против поиска, частоты, палиндромы, анаграммы"
      },
      {
        "h": "~3 ч",
        "t": "Хеш-таблицы и множества",
        "r": "два числа с суммой за O(n), дубликаты, ключи массива"
      },
      {
        "h": "~3 ч",
        "t": "Стек и очередь",
        "r": "скобки, история отмен, SplStack и SplQueue"
      },
      {
        "h": "~3 ч",
        "t": "Связные списки",
        "r": "односвязный и двусвязный список, цикл по Флойду"
      },
      {
        "h": "~3 ч",
        "t": "Рекурсия",
        "r": "Фибоначчи, мемоизация, обход вложенных категорий"
      },
      {
        "h": "~4 ч",
        "t": "Бинарный поиск и сортировки",
        "r": "lowerBound, пузырёк, быстрая и слияние, устойчивость"
      },
      {
        "h": "~3 ч",
        "t": "Указатели и окно",
        "r": "два указателя, скользящее окно, префиксные суммы"
      },
      {
        "h": "~4 ч",
        "t": "Деревья",
        "r": "BST, обходы в глубину и ширину, вырожденное дерево"
      },
      {
        "h": "~3 ч",
        "t": "Кучи и приоритеты",
        "r": "SplMinHeap, топ-K, своя куча, слияние K списков"
      },
      {
        "h": "~4 ч",
        "t": "Графы",
        "r": "BFS, DFS, компоненты связности, Дейкстра"
      },
      {
        "h": "~4 ч",
        "t": "Динамическое программирование",
        "r": "ступеньки, размен монет, рюкзак, LCS"
      },
      {
        "h": "~4 ч",
        "t": "Разбор собеседований",
        "r": "шаблон ответа, пять задач с замером, шпаргалка"
      }
    ],
    arch: {
      "title": "Путь одной задачи",
      "rows": [
        {
          "label": "Задача",
          "boxes": [
            "сценарий кофейни",
            "«найди заказ», «топ-K напитков»"
          ]
        },
        {
          "label": "Идея",
          "boxes": [
            "структура данных",
            "оценка O(...)"
          ]
        },
        {
          "label": "Реализация",
          "boxes": [
            "PHP 8.4 без фреймворка",
            "SPL или своя структура"
          ]
        },
        {
          "label": "Тест",
          "boxes": [
            "PHPUnit",
            "граничные случаи"
          ]
        },
        {
          "label": "Замер",
          "boxes": [
            "Bench: время и память",
            "отношение при росте n"
          ]
        }
      ],
      "note": "Каждая тема проходит этот цикл; шаги «сломать → починить» показывают, где идея перестаёт работать: вырожденное дерево, жадный размен, обход без пометки посещённых.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "условие",
            "x": 14,
            "w": 230
          },
          {
            "t": "решение",
            "x": 260,
            "w": 220
          },
          {
            "t": "проверка",
            "x": 500,
            "w": 490
          }
        ],
        "nodes": [
          {
            "id": "task",
            "t": "Задача кофейни",
            "s": "«найди заказ»",
            "x": 110,
            "y": 150,
            "d": "Каждая тема начинается с понятной задачи: найти заказ, взять топ-K напитков, проложить маршрут доставки."
          },
          {
            "id": "idea",
            "t": "Идея",
            "s": "структура + O(...)",
            "x": 350,
            "y": 150,
            "d": "Выбираем структуру данных и оцениваем сложность до того, как писать код."
          },
          {
            "id": "code",
            "t": "Реализация",
            "s": "PHP 8.4 · SPL",
            "x": 350,
            "y": 330,
            "d": "Пишем решение на чистом PHP, где можно — на встроенных структурах SPL."
          },
          {
            "id": "test",
            "t": "Тест",
            "s": "PHPUnit",
            "x": 610,
            "y": 150,
            "d": "Тест фиксирует поведение, включая граничные случаи: пустой ввод, один элемент, повторы."
          },
          {
            "id": "bench",
            "t": "Замер",
            "s": "Bench · hrtime",
            "x": 610,
            "y": 330,
            "d": "Bench берёт лучшее из прогонов; сравниваем отношение времени при росте n."
          },
          {
            "id": "break",
            "t": "Сломать → починить",
            "s": "где идея не работает",
            "x": 850,
            "y": 240,
            "d": "Шаг, где решение намеренно ломается: невидимый O(n²), вырожденное дерево, обход без пометки посещённых."
          }
        ],
        "edges": [
          {
            "a": "task",
            "b": "idea"
          },
          {
            "a": "idea",
            "b": "code"
          },
          {
            "a": "code",
            "b": "test"
          },
          {
            "a": "test",
            "b": "bench"
          },
          {
            "a": "bench",
            "b": "break"
          },
          {
            "a": "break",
            "b": "task",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "task",
            "txt": "Тема открывается задачей из кофейни."
          },
          {
            "n": "idea",
            "txt": "Выбираем структуру данных и оцениваем сложность."
          },
          {
            "n": "code",
            "txt": "Реализуем на PHP, сначала сам — потом сверяем с эталоном."
          },
          {
            "n": "test",
            "txt": "PHPUnit подтверждает, что решение верное, включая граничные случаи."
          },
          {
            "n": "bench",
            "txt": "Замер показывает, как растёт время при удвоении n."
          },
          {
            "n": "break",
            "txt": "Намеренная поломка показывает границу применимости идеи."
          },
          {
            "n": "task",
            "txt": "Следующая тема — новая задача, тот же цикл.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Почему array_shift в цикле — O(n²), а SplQueue::dequeue — O(1)?",
        "a": "array_shift перенумеровывает все оставшиеся элементы массива, поэтому каждый вызов стоит O(n), а цикл по n элементам — O(n²). SplQueue построена на двусвязном списке, и dequeue снимает элемент с головы за O(1). В лабе на 100 000 элементов разница — примерно 4,7 секунды против нескольких миллисекунд."
      },
      {
        "q": "Что такое устойчивая сортировка и гарантирует ли её PHP?",
        "a": "Устойчивая сортировка сохраняет относительный порядок равных элементов. Начиная с PHP 8.0 sort, usort и родственные функции устойчивы — это гарантия языка. В лабе это видно на заказах с одинаковой категорией: порядок по времени внутри категории не нарушается."
      },
      {
        "q": "Почему жадный алгоритм не работает для размена монет [1, 3, 4]?",
        "a": "Для суммы 6 жадный выбор берёт самую крупную монету: 4 + 1 + 1, то есть три монеты. Оптимум — 3 + 3, две монеты. Лучший выбор на текущем шаге закрывает лучший общий ответ, поэтому строят таблицу dp[x] — минимум монет на каждую сумму."
      },
      {
        "q": "Что происходит с двоичным деревом поиска при вставке отсортированных данных?",
        "a": "Каждый новый элемент уходит вправо, дерево вырождается в цепочку, и поиск становится O(n) вместо O(log n). В лабе: при случайной вставке 1000 элементов высота 22, при отсортированной — 1000. Чинят самобалансирующиеся деревья (AVL, красно-чёрные); для собеседования достаточно знать проблему и назвать решения."
      },
      {
        "q": "Как найти топ-K элементов за O(n log k)?",
        "a": "Держать min-кучу размера k: вставлять каждый элемент и, если в куче больше k элементов, удалять минимум. В куче остаются k наибольших. Такой подход работает и на потоке данных, который целиком не помещается в память."
      }
    ],
    accent: '#b45f06',
  },  {
    key: 'express',
    titleMain: 'express',
    title: 'Express Lab',
    subtitle: 'Node.js с нуля + ShareBox на Express, в двух частях',
    desc: 'Node.js с нуля в двух частях перед TypeScript и NestJS: рантайм и протокол HTTP, свой сервер, процессы, архитектура, роутер Express и middleware, ошибки и zod, PostgreSQL и Prisma 7, JWT с ротацией refresh, файлы потоком до 200 МБ, share-ссылки, тесты, Docker, два финала без подсказок.',
    stack: ['Node 24', 'Express 5', 'PostgreSQL 18', 'Prisma 7', 'Docker'],
    difficulty: 'Низкая–средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/express/express.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/express/express.html',
    repo: 'https://github.com/meeymirita/express-lab',
    stackInfo: [
      {
        "tag": "среда",
        "back": "Node 24 на Mac с первой сессии; PostgreSQL 18 — в Docker Compose с сессии 12 (часть II), только с согласия. Часть I требует пройденный js-lab."
      },
      {
        "tag": "фреймворк",
        "back": "Express 5: роутер, middleware, единый обработчик ошибок, слои routes → controllers → services."
      },
      {
        "tag": "база данных",
        "back": "Сначала сырой SQL через pg и транзакции, потом Prisma 7 с адаптером драйвера и миграциями."
      },
      {
        "tag": "безопасность",
        "back": "argon2 для паролей, JWT access/refresh с ротацией, владение ресурсом, path traversal."
      },
      {
        "tag": "файлы и ссылки",
        "back": "multer, лимит 200 МБ потоком, Range и докачка, share-код с паролем и сроком жизни."
      }
    ],
    learn: [
      {
        "tab": "Слои",
        "title": "routes → controllers → services",
        "text": "Роут знает про req/res, контроллер связывает роут и логику, сервис не знает про Express вообще — его можно вызвать и из теста, и из консоли. Стрелка зависимости — в одну сторону.",
        "points": [
          "routes: какой адрес к какой функции",
          "controllers: разобрать req, собрать res",
          "services: чистая логика, без HTTP"
        ],
        "code": "export function getFile(req, res) {\n  res.json(await getFileOrThrow(req.params.id))\n}\n// сервис ничего не знает про req/res:\nexport async function getFileOrThrow(id) {\n  const file = await prisma.file.findUnique({ where: { id: Number(id) } })\n  if (!file) throw new NotFoundError(`файл ${id} не найден`)\n  return file\n}"
      },
      {
        "tab": "Ошибки",
        "title": "Один обработчик на всё приложение",
        "text": "Четырёхаргументный middleware (err, req, res, next) — Express находит его по сигнатуре и зовёт при любой брошенной или переданной через next(err) ошибке. Свои классы ошибок несут HTTP-статус с собой.",
        "points": [
          "class AppError extends Error { status }",
          "throw — поймано один раз, не в каждом роуте",
          "404 и 500 без утечки деталей клиенту"
        ],
        "code": "app.use((err, req, res, next) => {\n  console.error('поймано:', err.message)\n  res.status(err.status || 500).json({ error: err.message || 'internal' })\n})"
      },
      {
        "tab": "JWT",
        "title": "Access живёт минуты, refresh — дни",
        "text": "Короткий access летает в каждом запросе; долгий refresh хранится отдельно и только обновляет пару токенов. Ротация — каждый refresh выдаёт новую пару взамен старой, а не продлевает прежнюю.",
        "points": [
          "jwt.sign({ sub, type }, secret, { expiresIn })",
          "requireAuth — middleware, кладёт req.user",
          "403 (чужое) ≠ 401 (не вошла)"
        ],
        "code": "const access = jwt.sign({ sub: userId, type: 'access' }, secret, { expiresIn: '15m' })\nconst refresh = jwt.sign({ sub: userId, type: 'refresh' }, secret, { expiresIn: '7d' })"
      },
      {
        "tab": "Потоки",
        "title": "Файл до 200 МБ без роста памяти",
        "text": "createReadStream(...).pipe(res) отдаёт файл кусками, не читая целиком в память — тот же приём, которым в сессии 2 копировали файл. Range-запрос просит только часть файла — так устроена докачка.",
        "points": [
          "multer пишет на диск потоком, с лимитом",
          "случайное имя на диске — защита от path traversal",
          "Range → 206 Partial Content"
        ],
        "code": "export async function downloadFile(req, res) {\n  const file = await getFileOrThrow(req.params.id)\n  res.setHeader('Content-Disposition', `attachment; filename=\"${file.name}\"`)\n  createReadStream(file.storedPath).pipe(res)\n}"
      }
    ],
    sessions: [
      {
        "h": "~4 ч",
        "t": "Node с нуля",
        "r": "Что такое Node и V8; REPL и первый файл; модули CommonJS; модули ES Modules; process и npm-скрипты; Сломать → починить: забытое расширение и первый сервер на node:http"
      },
      {
        "h": "~4 ч",
        "t": "Файлы, Buffer, Streams",
        "r": "fs/promises: читаем и пишем файлы; node:path без боли; EventEmitter; Buffer и потоки — копируем файл без роста памяти; Сломать → починить: readFile на большом файле"
      },
      {
        "h": "~4 ч",
        "t": "Протокол HTTP и свой сервер",
        "r": "Сырой HTTP своими глазами; методы, статусы, заголовки ответа; формы — urlencoded и multipart; cookies и chunked; curl построчно, HTTPS, HTTP/2-3; node:crypto — хеши и токены"
      },
      {
        "h": "~4 ч",
        "t": "Процессы и параллелизм",
        "r": "child_process: запускаем внешнюю команду; event loop и тяжёлые вычисления; worker_threads: выносим вычисление в поток; cluster: несколько процессов на одном порту; Сломать → починить: хеш файла блокирует сервер"
      },
      {
        "h": "~4 ч",
        "t": "Архитектура серверного кода",
        "r": "Зачем слои routes → controllers → services; свои классы ошибок; валидация на границе — zod; собираем сервер на слоях"
      },
      {
        "h": "~4 ч",
        "t": "Тестирование и отладка",
        "r": "node:test: первый тест сервиса; моки и стабы; измеряем время: простой профайлинг; утечка памяти: растущий кеш; Сломать → починить: необработанный reject роняет процесс"
      },
      {
        "h": "~4 ч",
        "t": "Эксплуатационная граница",
        "r": ".env, dotenv и падать сразу; graceful shutdown: закончить, а не оборвать; /health и /ready; Сломать → починить: SIGKILL обрывает скачивание"
      },
      {
        "h": "~4 ч",
        "t": "Финал части I: Загрузчик страниц",
        "r": "Итоговое задание без ответа — CLI-утилита на голом Node: HTTP-клиент, разбор и перезапись ссылок в HTML, потоковая запись, тесты на моках"
      },
      {
        "h": "~4 ч",
        "t": "Express 5",
        "r": "Зачем Express, если есть node:http; роутер, параметры и query; express.json(); middleware и порядок; статика; каркас ShareBox с GET /health"
      },
      {
        "h": "~4 ч",
        "t": "REST и контракт API",
        "r": "Ресурсы, а не глаголы в URL; идемпотентность на практике; версии API; единый контракт ошибок; OpenAPI — описываем ShareBox"
      },
      {
        "h": "~4 ч",
        "t": "Ошибки, валидация, структура",
        "r": "Единый обработчик ошибок; валидация как middleware; переносим слои в Express без переписывания service; Сломать → починить: забытый порядок middleware"
      },
      {
        "h": "~4 ч",
        "t": "PostgreSQL и SQL",
        "r": "Docker Compose с базой; pg и пул соединений; SQL руками — таблицы ShareBox; параметризованные запросы; транзакции; переносим ShareBox на базу"
      },
      {
        "h": "~4 ч",
        "t": "Prisma 7",
        "r": "Зачем Prisma; схема, конфиг и генератор; клиент с адаптером; pg вручную vs Prisma; миграции; ShareBox на Prisma"
      },
      {
        "h": "~4 ч",
        "t": "Аутентификация",
        "r": "Регистрация и хеширование пароля argon2; JWT access/refresh; вход и middleware авторизации; ротация refresh-токена; владение ресурсом — чужой файл как 404"
      },
      {
        "h": "~4 ч",
        "t": "Файлы",
        "r": "multer и лимит размера потоком; случайные имена и защита от path traversal; POST /files; скачивание потоком; Range и докачка"
      },
      {
        "h": "~4 ч",
        "t": "Share-ссылки и консоль",
        "r": "Код ссылки и создание share; срок жизни и лимит скачиваний; пароль на ссылку; HTML-страница скачивания; GET /s/:code/download; скачивание из консоли — curl, wget, докачка, sha256"
      },
      {
        "h": "~4 ч",
        "t": "Админ и надёжность",
        "r": "Роль admin и middleware по роли; /admin/*; rate limit; helmet, CORS, pino-логи и request ID; graceful shutdown; фоновая чистка просроченных ссылок"
      },
      {
        "h": "~4 ч",
        "t": "Тесты, Docker, прод-стенд",
        "r": "node:test для чистой функции; supertest для роутов; тест с настоящей базой; многоэтапный Dockerfile; Compose + Caddy одной командой; Production Hell и сравнение Express → NestJS"
      },
      {
        "h": "~5 ч",
        "t": "Финал части II: ShareBox Teams",
        "r": "Итоговое задание без ответа — командные пространства, роли owner/admin/member, идемпотентные приглашения, очередь импорта, журнал изменений, webhook, несколько инстансов за Caddy"
      }
    ],
    arch: {
      "title": "Путь запроса от клиента до базы",
      "rows": [
        {
          "label": "Клиент",
          "boxes": [
            "curl / браузер / wget",
            "Authorization: Bearer <токен>"
          ]
        },
        {
          "label": "Middleware",
          "boxes": [
            "helmet, cors, pino, rate limit",
            "express.json(), requireAuth"
          ]
        },
        {
          "label": "Роуты и контроллеры",
          "boxes": [
            "routes → controllers",
            "валидация zod, req.user, req.file"
          ]
        },
        {
          "label": "Сервисы",
          "boxes": [
            "чистая логика, без Express",
            "вызываются и из тестов"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "PostgreSQL через Prisma",
            "файлы — потоком на диск"
          ]
        }
      ],
      "note": "Каждый слой знает только про соседний: контроллер не трогает SQL, сервис не видел req/res — поэтому смена pg → Prisma в сессии 6 не задела ни один контроллер.",
      "live": {
        "w": 1000,
        "h": 560,
        "zones": [
          {
            "t": "клиент",
            "x": 14,
            "w": 190
          },
          {
            "t": "express-приложение",
            "x": 250,
            "w": 400
          },
          {
            "t": "данные",
            "x": 696,
            "w": 290
          }
        ],
        "nodes": [
          {
            "id": "client",
            "t": "Клиент",
            "s": "curl, браузер",
            "x": 110,
            "y": 280,
            "d": "Запрос с токеном в заголовке Authorization: Bearer, иногда с файлом в multipart/form-data."
          },
          {
            "id": "mw",
            "t": "Middleware",
            "s": "helmet, requireAuth",
            "x": 420,
            "y": 150,
            "d": "Заголовки безопасности, JSON-тело, проверка JWT, rate limit на публичных роутах — до того, как запрос дойдёт до роута."
          },
          {
            "id": "routes",
            "t": "Routes / Controllers",
            "s": "req → res",
            "x": 420,
            "y": 330,
            "d": "Роут сопоставляет метод и путь, контроллер разбирает req (параметры, тело, req.user) и вызывает сервис."
          },
          {
            "id": "services",
            "t": "Services",
            "s": "без req/res",
            "x": 420,
            "y": 470,
            "d": "Вся бизнес-логика: создать share-ссылку, проверить пароль, посчитать скачивания — чистые функции."
          },
          {
            "id": "db",
            "t": "PostgreSQL",
            "s": "через Prisma",
            "x": 800,
            "y": 300,
            "d": "Таблицы users, files, shares; транзакции и внешние ключи следят за целостностью."
          },
          {
            "id": "disk",
            "t": "Файлы на диске",
            "s": "uploads/, потоком",
            "x": 800,
            "y": 450,
            "d": "Загруженные файлы — под случайным именем, отдаются обратно потоком через createReadStream.pipe(res)."
          }
        ],
        "edges": [
          {
            "a": "client",
            "b": "mw"
          },
          {
            "a": "mw",
            "b": "routes"
          },
          {
            "a": "routes",
            "b": "services"
          },
          {
            "a": "services",
            "b": "db"
          },
          {
            "a": "services",
            "b": "disk"
          },
          {
            "a": "db",
            "b": "client",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "client",
            "txt": "Клиент шлёт запрос с токеном (и, может быть, файлом)."
          },
          {
            "n": "mw",
            "txt": "Middleware проверяет токен, разбирает тело, применяет лимиты и заголовки безопасности."
          },
          {
            "n": "routes",
            "txt": "Контроллер собирает входные данные и вызывает нужный сервис."
          },
          {
            "n": "services",
            "txt": "Сервис выполняет логику — читает/пишет в базу и, если нужно, на диск."
          },
          {
            "n": "db",
            "txt": "Результат возвращается обратно по той же цепочке клиенту уже как JSON или поток файла."
          }
        ]
      }
    },
    faq: [
      {
        "q": "Зачем эта лаба, если дальше всё равно NestJS?",
        "a": "NestJS стоит на Express и берёт на себя ровно то, что здесь написано руками: роутинг, middleware, DI, обработку ошибок. Без этой лабы в NestJS декораторы вроде @Controller() или @UseGuards() выглядят магией; после неё видно, что они автоматизируют."
      },
      {
        "q": "Нужно ли знать TypeScript или Vue заранее?",
        "a": "Нет. Лаба на чистом JavaScript (ESM) и не трогает фронтенд вообще — ShareBox отдаёт голый HTML только для одной страницы скачивания."
      },
      {
        "q": "Обязателен ли Docker?",
        "a": "Node нужен на Mac с первой сессии. PostgreSQL в Docker Compose подключается только в части II (сессия 12), и только с согласия — всю часть I и начало части II можно пройти вообще без Docker."
      },
      {
        "q": "Что после этой лабы?",
        "a": "TypeScript — тот же код, но с типами, затем NestJS. Если хочется остаться на чистом Node — Redis (тот же rate limit, но в общем месте для нескольких инстансов) или RabbitMQ (фоновые задачи вместо setInterval)."
      },
      {
        "q": "Всё ли в методичке проверено?",
        "a": "Методичка переписана в две части ассистентом 14.10.2026 (9 находок, все исправлены, 2 открытых без решения — fixes/backend/express.md), весь вывод в блоках «Ожидаемый результат» — из настоящего прогона в Docker с реальным PostgreSQL. Прохождения человеком пока не было."
      }
    ],
    accent: '#52D12E',
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

// Методички с 02.10.2026 — «бандлы»: разделов <h2> в самом HTML нет, текст лежит в сжатом JSON (window.LAB)
// внутри <script type="__bundler/manifest">. Достаём его так же, как это делает сама страница методички.
function readBundleLab(html) {
  var m = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
  if (!m || typeof DecompressionStream === 'undefined') return Promise.resolve(null);
  var man;
  try { man = JSON.parse(m[1]); } catch (e) { return Promise.resolve(null); }
  var keys = Object.keys(man).filter(function (k) { return /javascript/.test(man[k].mime || ''); });

  function decode(asset) {
    var bin = atob(asset.data), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var stream = new Blob([bytes]).stream();
    if (asset.compressed) stream = stream.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  function next(i) {
    if (i >= keys.length) return Promise.resolve(null);
    return decode(man[keys[i]]).then(function (txt) {
      if (txt.indexOf('window.LAB=') !== 0) return next(i + 1);
      // после объекта могут идти ещё операторы вида «;window.LAB.accent="#…";» — отрезаем их
      var body = txt.slice('window.LAB='.length), cut = body.indexOf(';window.LAB.');
      if (cut !== -1) body = body.slice(0, cut);
      try { return JSON.parse(body.replace(/;\s*$/, '')); } catch (e) { return null; }
    });
  }
  return next(0);
}

function tocItemsFromLab(L) {
  var units = (L && L.units) || [];
  var steps = units.filter(function (u) { return u.kind === 'step'; });
  var items = units.filter(function (u) { return u.kind !== 'step'; }).map(function (u) {
    return { id: u.key, title: (u.num ? u.num + '. ' : '') + u.title, subs: [] };
  });
  var subs = steps.map(function (st) { return st.num + ' ' + st.title.replace(/^🔨\s*/, ''); });
  var host = items.filter(function (it) { return /пошагов|задани|сесси/i.test(it.title); })[0];
  if (host) host.subs = subs;
  else if (steps.length) items.push({ id: steps[0].key, title: 'Шаги по сессиям', subs: subs });
  return items;
}

function tocItemsFromHtml(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var sections = Array.prototype.slice.call(doc.querySelectorAll('h2[id]'));
  return sections.map(function (h2) {
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
}

function loadToc(lab, panel) {
  panel.innerHTML = '<div class="lab-toc-status mono">загрузка…</div>';

  // Основной путь — готовый js/toc.json рядом со страницей (tools/build-toc.py): без сети до бакета и CORS.
  // Запасной — разобрать саму методичку, скачав её (работает только там, где бакет разрешает запросы с этого адреса).
  fetch('js/toc.json')
    .then(function (res) { if (!res.ok) throw new Error('toc.json'); return res.json(); })
    .then(function (all) { if (!all[lab.key]) throw new Error('нет ' + lab.key); return all[lab.key]; })
    .catch(function () {
      return fetch(lab.open)
        .then(function (res) { return res.text(); })
        .then(function (html) {
          var items = tocItemsFromHtml(html);                   // старый формат методичек: обычные <h2>
          if (items.length) return items;
          return readBundleLab(html).then(tocItemsFromLab);     // новый формат: оглавление из window.LAB
        });
    })
    .then(function (items) {
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
// «~3 ч» → 3, «~2,5–3 ч» → 2.75 (среднее диапазона), пусто → 0
function sessionHours(h) {
  var m = String(h || '').replace(/,/g, '.').match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?/);
  if (!m) return 0;
  var a = parseFloat(m[1]), b = m[2] ? parseFloat(m[2]) : a;
  return (a + b) / 2;
}

function renderSessions(lab) {
  if (!lab.sessions || !lab.sessions.length) return '';
  var total = lab.sessions.reduce(function (sum, x) { return sum + sessionHours(x.h); }, 0);
  return '<section id="sessions" class="lab-section">' +
    '<div class="lab-kicker mono">@@ / маршрут</div>' +
    '<h2 class="lab-h2 display">Карта сессий</h2>' +
    '<div class="lab-route" data-total="' + total + '">' +
      '<p class="lab-route-hint">' + (total ? 'Ширина сегмента — длительность сессии. ' : '') + 'Нажмите на сегмент или пройдите весь маршрут автоматически.</p>' +
      '<div class="lab-route-bar" role="tablist" aria-label="Сессии лабы">' +
        lab.sessions.map(function (x, n) {
          return '<button type="button" role="tab" class="lab-route-seg" data-i="' + n + '" style="flex:' + (sessionHours(x.h) || 1) + '" aria-selected="' + (n === 0) + '" aria-label="Сессия ' + (n + 1) + ': ' + escapeHtml(x.t) + '">' +
            '<span class="lab-route-seg-n mono">' + (n + 1) + '</span>' + (x.h ? '<span class="lab-route-seg-h mono">' + escapeHtml(x.h) + '</span>' : '') + '</button>';
        }).join('') +
      '</div>' +
      '<div class="lab-route-meter"><div class="lab-route-meter-fill"></div></div>' +
      '<div class="lab-route-card" role="tabpanel" aria-live="polite"></div>' +
      '<div class="lab-route-ctl">' +
        '<button type="button" class="lab-route-btn" data-act="prev" aria-label="Предыдущая сессия">←</button>' +
        '<button type="button" class="lab-route-btn primary" data-act="tour">▶ пройти маршрут</button>' +
        '<button type="button" class="lab-route-btn" data-act="next" aria-label="Следующая сессия">→</button>' +
      '</div>' +
    '</div></section>';
}

function initRoute(lab) {
  var root = document.querySelector('.lab-route');
  if (!root || !lab.sessions) return;
  var S = lab.sessions, timed = parseFloat(root.getAttribute('data-total')) > 0, total = timed ? parseFloat(root.getAttribute('data-total')) : S.length;
  var segs = Array.prototype.slice.call(root.querySelectorAll('.lab-route-seg'));
  var card = root.querySelector('.lab-route-card'), fill = root.querySelector('.lab-route-meter-fill');
  var tourBtn = root.querySelector('[data-act="tour"]'), cur = 0, timer = null;
  function fmt(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
  function show(n) {
    cur = (n + S.length) % S.length;
    var done = 0; for (var i = 0; i <= cur; i++) done += timed ? sessionHours(S[i].h) : 1;
    segs.forEach(function (b, k) {
      b.setAttribute('aria-selected', String(k === cur)); b.classList.toggle('is-done', k < cur);
    });
    fill.style.width = (done / total * 100) + '%';
    card.innerHTML =
      '<div class="lab-route-big display">' + (cur + 1) + '</div>' +
      '<div class="lab-route-body"><span class="lab-route-tag mono">сессия ' + (cur + 1) + ' из ' + S.length + (S[cur].h ? ' · ' + escapeHtml(S[cur].h) : '') + '</span>' +
      '<h3 class="lab-route-title display">' + escapeHtml(S[cur].t) + '</h3>' +
      '<p class="lab-route-res"><span class="mono">результат</span>' + escapeHtml(S[cur].r) + '</p>' +
      '<p class="lab-route-sum mono">' + (timed ? 'к концу сессии: ' + fmt(done) + ' из ' + fmt(total) + ' ч · ' : 'пройдено сессий: ' + done + ' из ' + total + ' · ') + Math.round(done / total * 100) + '%</p></div>';
    card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } tourBtn.textContent = '▶ пройти маршрут'; }
  segs.forEach(function (b, n) { b.addEventListener('click', function () { stop(); show(n); }); });
  root.querySelector('[data-act="prev"]').addEventListener('click', function () { stop(); show(cur - 1); });
  root.querySelector('[data-act="next"]').addEventListener('click', function () { stop(); show(cur + 1); });
  tourBtn.addEventListener('click', function () {
    if (timer) { stop(); return; }
    tourBtn.textContent = '❚❚ пауза'; show(0);
    timer = setInterval(function () { if (cur >= S.length - 1) { stop(); return; } show(cur + 1); }, 2400);
  });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); stop(); show(cur + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); show(cur - 1); }
  });
  show(0);
}

function renderArch(lab) {
  if (!lab.arch) return '';
  var a = lab.arch;
  var stat = '<div class="lab-arch">' +
      a.rows.map(function (r, n) {
        return (n ? '<div class="lab-arch-arrow" aria-hidden="true">↓</div>' : '') +
          '<div class="lab-arch-row" style="--i:' + n + '"><span class="lab-arch-label mono">' + escapeHtml(r.label) + '</span>' +
          '<div class="lab-arch-boxes">' + r.boxes.map(function (b) { return '<span class="lab-arch-box">' + escapeHtml(b) + '</span>'; }).join('') + '</div></div>';
      }).join('') +
    '</div>';
  var liveHtml = a.live
    ? '<div class="lab-arch-live" hidden>' +
        '<p class="lab-arch-hint">Двигайте блоки — стрелки тянутся следом. Нажмите на блок, чтобы прочитать, что он делает.</p>' +
        '<div class="lab-arch-bar"><button type="button" class="lab-arch-btn primary" data-act="send">▶ отправить запрос</button>' +
        '<button type="button" class="lab-arch-btn" data-act="reset">↺ сбросить</button></div>' +
        '<div class="lab-arch-stage"><svg class="lab-arch-svg" viewBox="0 0 ' + a.live.w + ' ' + a.live.h + '" role="img" aria-label="' + escapeHtml(a.title) + '"></svg></div>' +
        '<div class="lab-arch-info" aria-live="polite"><b>Подсказка</b><span>Нажмите на любой блок схемы.</span></div>' +
      '</div>'
    : '';
  return '<section id="arch" class="lab-section-alt"><div class="lab-section-inner">' +
    '<div class="lab-kicker mono">@@ / архитектура</div>' +
    '<h2 class="lab-h2 display">' + escapeHtml(a.title) + '</h2>' +
    '<div class="lab-arch-static">' + stat + '</div>' + liveHtml +
    (a.note ? '<p class="lab-arch-note"><span class="mono">↑ обратно</span>' + escapeHtml(a.note) + '</p>' : '') +
    '</div></section>';
}

// Интерактивная схема: блоки двигаются (GSAP Draggable), стрелки следуют, точка «пробегает» запрос.
function loadScript(src, cb) {
  var sc = document.createElement('script');
  sc.src = src; sc.onload = function () { cb(true); }; sc.onerror = function () { cb(false); };
  document.head.appendChild(sc);
}

function initArch(lab) {
  var root = document.querySelector('.lab-arch-live');
  if (!lab.arch || !lab.arch.live || !root || !window.gsap || prefersReducedMotion()) return;
  function boot() {
    if (!window.Draggable) return;
    gsap.registerPlugin(Draggable);
    buildArch(lab.arch.live, root);
    root.hidden = false;
    var st = document.querySelector('.lab-arch-static'); if (st) st.hidden = true;
  }
  if (window.Draggable) boot();
  else loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/Draggable.min.js', function (ok) { if (ok) boot(); });
}

function buildArch(cfg, root) {
  var NS = 'http://www.w3.org/2000/svg', W = 176, H = 52;
  var svg = root.querySelector('svg'), info = root.querySelector('.lab-arch-info');
  var byId = {}, edgeEls = [], running = null;
  function mk(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  var defs = mk('defs', {}, svg);
  [['lab-ah', 'rgba(247,242,245,.7)'], ['lab-ag', '#6fdc7f']].forEach(function (m) {
    var mm = mk('marker', { id: m[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    mk('path', { d: 'M0 0L10 5L0 10z', fill: m[1] }, mm);
  });
  var gl = mk('g', {}, svg), ge = mk('g', {}, svg), gn = mk('g', {}, svg);
  var dot = mk('circle', { class: 'lab-arch-dot', r: 7, cx: -50, cy: -50, opacity: 0 }, svg);

  cfg.zones.forEach(function (z) {
    mk('rect', { class: 'lab-arch-zone', x: z.x, y: 34, width: z.w, height: cfg.h - 60, rx: 14 }, gl);
    mk('text', { class: 'lab-arch-zone-t', x: z.x + 14, y: 56 }, gl).textContent = z.t;
  });
  cfg.nodes.forEach(function (n) {
    byId[n.id] = n;
    var g = mk('g', { class: 'lab-arch-node', tabindex: 0, role: 'button', 'aria-label': n.t + ': ' + n.s }, gn);
    mk('rect', { x: n.x - W / 2, y: n.y - H / 2, width: W, height: H, rx: 10 }, g);
    mk('text', { x: n.x, y: n.y - 3, 'text-anchor': 'middle' }, g).textContent = n.t;
    mk('text', { x: n.x, y: n.y + 14, 'text-anchor': 'middle', class: 'sub' }, g).textContent = n.s;
    n.g = g;
  });
  cfg.edges.forEach(function (e) {
    edgeEls.push({ e: e, p: mk('path', { class: 'lab-arch-edge' + (e.back ? ' back' : ''), 'marker-end': 'url(#' + (e.back ? 'lab-ag' : 'lab-ah') + ')' }, ge) });
  });

  function pos(id) { var n = byId[id]; return { x: n.x + gsap.getProperty(n.g, 'x'), y: n.y + gsap.getProperty(n.g, 'y') }; }
  function edgePt(c, to) {
    var dx = to.x - c.x, dy = to.y - c.y; if (!dx && !dy) return c;
    var s = Math.min((W / 2 + 4) / Math.abs(dx || 1e-9), (H / 2 + 4) / Math.abs(dy || 1e-9));
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  function draw() {
    edgeEls.forEach(function (o) {
      var a = pos(o.e.a), b = pos(o.e.b), p = edgePt(a, b), q = edgePt(b, a);
      var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dx = q.x - p.x, dy = q.y - p.y, k = o.e.back ? 0.22 : 0.12;
      o.p.setAttribute('d', 'M' + p.x + ' ' + p.y + ' Q' + (mx - dy * k) + ' ' + (my + dx * k) + ' ' + q.x + ' ' + q.y);
    });
  }
  draw();
  function clearMarks() { cfg.nodes.forEach(function (n) { n.g.classList.remove('hit', 'back-hit', 'sel'); }); }
  function say(title, text, cls) {
    info.innerHTML = '<b></b><span></span>';
    info.firstChild.textContent = title; info.lastChild.textContent = text;
    info.className = 'lab-arch-info' + (cls ? ' ' + cls : '');
  }
  function show(n) { clearMarks(); n.g.classList.add('sel'); say(n.t + ' · ' + n.s, n.d); }

  cfg.nodes.forEach(function (n) {
    Draggable.create(n.g, {
      type: 'x,y', edgeResistance: .75, zIndexBoost: false,
      bounds: { minX: -(n.x - W / 2 - 8), maxX: cfg.w - (n.x + W / 2) - 8, minY: -(n.y - H / 2 - 8), maxY: cfg.h - (n.y + H / 2) - 8 },
      onPress: function () { gn.appendChild(n.g); },
      onDrag: draw, onClick: function () { show(n); }
    });
    n.g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(n); } });
  });

  var sendBtn = root.querySelector('[data-act="send"]'), resetBtn = root.querySelector('[data-act="reset"]');
  sendBtn.addEventListener('click', function () {
    if (running) return;
    sendBtn.disabled = true; clearMarks();
    var tl = running = gsap.timeline({ onComplete: function () { running = null; sendBtn.disabled = false; gsap.to(dot, { opacity: 0, duration: .3 }); } });
    var f = pos(cfg.flow[0].n);
    tl.set(dot, { attr: { cx: f.x, cy: f.y }, opacity: 1 });
    cfg.flow.forEach(function (s, i) {
      tl.call(function () {
        dot.setAttribute('class', 'lab-arch-dot' + (s.back ? ' back' : ''));
        byId[s.n].g.classList.add(s.back ? 'back-hit' : 'hit');
        say((s.back ? '↩ ответ · ' : '→ запрос · ') + 'шаг ' + (i + 1) + '/' + cfg.flow.length, s.txt, 'flow');
      });
      var to = cfg.flow[i + 1];
      if (to) {
        tl.call(function () {
          var a = pos(s.n), b = pos(to.n);
          gsap.fromTo(dot, { attr: { cx: a.x, cy: a.y } }, { attr: { cx: b.x, cy: b.y }, duration: .75, ease: 'power2.inOut' });
        });
        tl.to({}, { duration: .85 });
      } else { tl.to({}, { duration: .9 }); }
    });
  });
  resetBtn.addEventListener('click', function () {
    if (running) { running.kill(); running = null; sendBtn.disabled = false; }
    gsap.to(dot, { opacity: 0, duration: .2 }); clearMarks();
    gsap.to(cfg.nodes.map(function (n) { return n.g; }), { x: 0, y: 0, duration: .6, ease: 'power3.inOut', onUpdate: draw, onComplete: draw });
    say('Подсказка', 'Нажмите на любой блок схемы.');
  });
}

function renderFaq(lab) {
  if (!lab.faq || !lab.faq.length) return '';
  return '<section id="faq" class="lab-section">' +
    '<div class="lab-kicker mono">@@ / вопросы</div>' +
    '<h2 class="lab-h2 display">Проверьте себя</h2>' +
    '<div class="lab-faq">' +
      lab.faq.map(function (f) {
        return '<details class="lab-faq-item"><summary>' + escapeHtml(f.q) + '</summary><p>' + escapeHtml(f.a) + '</p></details>';
      }).join('') +
    '</div></section>';
}

// Сквозная нумерация блоков: «@@» заменяется на 01, 02, … в порядке появления.
function numberKickers(html) {
  var n = 0;
  return html.replace(/@@/g, function () { n += 1; return String(n).padStart(2, '0'); });
}

function renderLearn(lab) {
  if (!lab.learn || !lab.learn.length) return '';
  var tabs = lab.learn.map(function (t, n) {
    return '<button type="button" role="tab" id="learn-tab-' + n + '" class="lab-learn-tab" aria-controls="learn-panel" aria-selected="' + (n === 0) + '" tabindex="' + (n === 0 ? 0 : -1) + '" data-i="' + n + '">' +
      '<span class="lab-learn-tab-num mono">' + String(n + 1).padStart(2, '0') + '</span>' +
      '<span class="lab-learn-tab-name">' + escapeHtml(t.tab) + '</span></button>';
  }).join('');
  return '<section id="learn" class="lab-section">' +
    '<div class="lab-kicker mono">@@ / навыки</div>' +
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

// Статус вычитки и проверки (works/js/status.js собирается из fixes/common/_verification.md — tools/build-verification.py)
function labVerifyBanner(key) {
  var st = window.LAB_STATUS && window.LAB_STATUS[key];
  if (!st) return '';
  var part = st.level === 'part', none = st.level === 'none';
  var icon = none
    ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M12 4v10M12 19v1"/></svg>'
    : part
    ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>'
    : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M20 6 9 17l-5-5"/></svg>';
  return '<section class="lab-verify" aria-label="Статус проверки">' +
    '<div class="lab-verify__main">' +
      '<div class="lab-verify__icon" aria-hidden="true">' + icon + '</div>' +
      '<div class="lab-verify__body">' +
        '<div class="lab-verify__meta"><span class="lab-verify__kicker">01 / СТАТУС ПРОВЕРКИ</span>' +
          (st.method || []).map(function (m) { return '<span class="lab-verify__tag">' + escapeHtml(m.charAt(0).toUpperCase() + m.slice(1)) + '</span>'; }).join('') + '</div>' +
        '<h2 class="lab-verify__title">' + escapeHtml(st.head) + '</h2>' +
        '<p class="lab-verify__text">' + (none ? 'методичка написана, но ещё не вычитана и код из неё не запускался — возможны ошибки в тексте, командах и именах опций; проверяется при прохождении' : 'возможны небольшие недочёты — методичка вычитана построчно, код из неё запускался') + '</p>' +
      '</div>' +
      '<div class="lab-verify__actions">' +
        '<a class="lab-verify__btn lab-verify__btn--primary" href="verification.html">Что чем проверено</a>' +
        (st.detail ? '<a class="lab-verify__btn lab-verify__btn--secondary" href="' + escapeHtml(st.detail) + '" target="_blank" rel="noopener">Подробности →</a>' : '') +
      '</div>' +
    '</div>' +
    (st.rest ? '<div class="lab-verify__note"><span class="lab-verify__kicker">' + escapeHtml(st.tail).toUpperCase() + '</span><span>' + escapeHtml(st.rest) + '</span></div>' : '') +
  '</section>';
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

  // необязательная вторая кнопка: ссылка на скачивание файла (стартовый дамп базы и т. п.): lab.download = { label, url }
  var downloadHtml = lab.download
    ? '<a href="' + lab.download.url + '" download class="lab-btn lab-btn-outline mono">' + escapeHtml(lab.download.label) + '</a>'
    : '';

  var pageHtml =
    '<nav class="lab-nav">' +
      '<div class="lab-nav-brand">' +
        '<a href="../index.html" class="display lab-nav-title" data-pl-name="ANITECH" data-pl-color="#ff2e88">' + escapeHtml(lab.title) + '</a>' +
      '</div>' +
      '<div class="lab-nav-links mono">' +
        '<a href="../index.html#works" data-pl-name="ANITECH" data-pl-color="#ff2e88">← все работы</a>' +
        '<a href="progress.html" title="Все работы и общий прогресс">прогресс</a>' +
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
            downloadHtml +
            '<a href="#inside" class="lab-btn lab-btn-outline mono">что внутри ↓</a>' +
          '</div>' +
        '</div>' +
        '<div class="lab-hero-image">' +
          '<img src="https://meeymirita-files.storage.yandexcloud.net/' + lab.key + '/thumb.webp" data-full="' + lab.image + '" alt="' + escapeHtml(lab.title) + '" decoding="async" width="1200" height="1200">' +
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

    labVerifyBanner(lab.key) +
    '<section id="inside" class="lab-section">' +
      '<div class="lab-inside-grid">' +
        '<div>' +
          '<div class="lab-kicker mono">@@ / программа</div>' +
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
    renderSessions(lab) +
    renderArch(lab) +
    renderFaq(lab) +

    '<section class="lab-section-alt"><div class="lab-section-inner">' +
      '<div class="lab-kicker mono">@@ / стек</div>' +
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
      '<div class="lab-kicker mono">@@ / материалы</div>' +
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
  document.getElementById('lab-root').innerHTML = numberKickers(pageHtml);

  initNavAutoHide();
  initLearn(lab);
  initTiles();
  initArch(lab);
  initRoute(lab);
  if (window.FlipGallery) FlipGallery.init('.lab-hero-image img');

  if (window.PageLoader) PageLoader.enter(lab.title, lab.accent);
}
