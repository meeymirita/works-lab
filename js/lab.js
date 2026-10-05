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
    desc: 'Reverse proxy и service discovery для стека из нескольких сервисов без ручной правки конфигов: EntryPoint → Router → Middleware → Service, TLS, canary-деплой.',
    stack: ['Traefik 3', 'Docker Compose', 'Node.js', 'PostgreSQL', 'mkcert / Let\'s Encrypt'],
    difficulty: 'Низкая–средняя',
    image: 'https://meeymirita-files.storage.yandexcloud.net/traefik/traefik.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/traefik/traefik.html',
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
      },
      {
        "tag": "TLS",
        "back": "Локальный HTTPS через mkcert и выпуск сертификатов Let's Encrypt (staging)."
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
        "code": "http:\n  middlewares:\n    api-ratelimit:\n      rateLimit:\n        average: 10\n        burst: 20\n\n# label:\n\"traefik.http.routers.api.middlewares=secure-headers@file,api-ratelimit@file\"  # @file обязателен: без суффикса Traefik ищет middleware в @docker → 404\""
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
    sessions: [
      {
        "h": "~3 ч",
        "t": "Базовая инфраструктура и первый маршрут",
        "r": "Traefik с Docker provider, роутер на whoami через labels и дашборд под basicauth"
      },
      {
        "h": "~3,5 ч",
        "t": "API, frontend и БД за прокси",
        "r": "Три реплики API с healthcheck и балансировкой, frontend по /app со StripPrefix, PostgreSQL и Adminer, цепочка middlewares"
      },
      {
        "h": "~3,5 ч",
        "t": "TLS и Production Hell",
        "r": "HTTPS через mkcert и Let's Encrypt staging, canary-деплой 90/10 и починенные сломанные сценарии"
      }
    ],
    arch: {
      "title": "Путь запроса через Traefik",
      "rows": [
        {
          "label": "Клиент",
          "boxes": [
            "браузер https://api.localhost",
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
            "Router Host(`api.localhost`)",
            "Middlewares: secure-headers → api-ratelimit"
          ]
        },
        {
          "label": "Сервис",
          "boxes": [
            "Service api: round robin + /health",
            "api ×3 (Node :3000)"
          ]
        },
        {
          "label": "Сеть backend",
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
            "t": "сеть backend",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "browser",
            "t": "Браузер",
            "s": "https://api.localhost",
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
            "d": "Docker provider читает labels контейнеров (exposedByDefault: false), file provider даёт общие middlewares и TLS из traefik/dynamic."
          },
          {
            "id": "rt",
            "t": "Router",
            "s": "Host(`api.localhost`)",
            "x": 570,
            "y": 110,
            "d": "Правило Host/PathPrefix; при нескольких совпадениях побеждает более специфичное или с явным priority."
          },
          {
            "id": "mw",
            "t": "Middlewares",
            "s": "headers → ratelimit",
            "x": 570,
            "y": 270,
            "d": "Цепочка выполняется по порядку: secure-headers, затем api-ratelimit (average 10, burst 20)."
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
            "t": "api × 3",
            "s": "Node :3000",
            "x": 800,
            "y": 170,
            "d": "Реплики, поднятые через docker compose up -d --scale api=3; отвечают servedBy с hostname контейнера."
          },
          {
            "id": "db",
            "t": "PostgreSQL",
            "s": "сеть backend",
            "x": 800,
            "y": 380,
            "d": "База в сети backend, недоступной из traefik-public: Traefik физически не может маршрутизировать в неё напрямую."
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
            "txt": "Router находит правило Host(`api.localhost`)."
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
        "a": "По умолчанию Traefik готов создать маршрут для любого контейнера в сети даже без единого label, по первому открытому порту. В проекте с десятком контейнеров это даёт случайные незапланированные роуты, поэтому каждый сервис включают явно через traefik.enable=true."
      },
      {
        "q": "Почему порядок middlewares в цепочке важен?",
        "a": "Они выполняются строго в порядке перечисления в router.middlewares. Если headers с CORS стоит после ratelimit, запрос, отсечённый лимитом, получит 429 без CORS-заголовков, и браузер покажет CORS-ошибку вместо настоящей причины. Middlewares, которые должны сработать и на отказных ответах, ставят первыми."
      },
      {
        "q": "Что такое HTTP-01 challenge и какое условие должно выполняться при выпуске сертификата?",
        "a": "Центр сертификации стучится на http://домен/.well-known/acme-challenge/... и сверяет ответ. Поэтому порт 80 реального публичного домена должен быть доступен из интернета в момент выпуска; на локальной машине без домена этот шаг можно только прочитать."
      },
      {
        "q": "Как устроен canary-деплой через weighted service?",
        "a": "Две версии объявляются отдельными сервисами (api и api-v2) и оборачиваются в weighted service с весами 9 и 1, то есть 90% трафика на стабильную версию и 10% на новую. Если что-то не так, api-v2 просто убирают из списка, и остальные 90% не замечают даунтайма."
      },
      {
        "q": "Почему монтирование docker.sock в контейнер Traefik — риск безопасности?",
        "a": "Доступ к Docker API фактически эквивалентен root на хосте, а флаг :ro лишь запрещает писать в файл сокета и не изолирует API. В проде используют docker-socket-proxy, которое отдаёт Traefik только минимум нужных вызовов."
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
    stack: ['Caddy 2.11.7', 'Docker Compose', 'Node.js 22', 'PHP 8.4-FPM', 'xcaddy / Go'],
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
        "back": "Проект Edge: два экземпляра API на Node 22, WebSocket-эхо (RFC 6455), поток событий SSE и отдельный сервис для forward_auth."
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
        "r": "Бэкенды проекта Edge на Node 22, handle /api/* и handle_path, заголовки X-Forwarded, WebSocket и SSE без спецнастроек, 502 и его починка"
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
            "API ×2 (Node 22): round_robin",
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
            "s": "Node 22 :3001 :3002",
            "x": 800,
            "y": 120,
            "d": "Два «говорящих» экземпляра — заголовок X-Backend показывает, кто ответил."
          },
          {
            "id": "ws",
            "t": "WebSocket + SSE",
            "s": "Node 22 :3100",
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
    desc: 'Система тикетов на Vue 3 с нуля: реактивность, компоненты, слоты, Pinia, Vue Router с guard-ами, WebSocket, канбан-доска, тесты на Vitest.',
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
    subtitle: 'Крепкое владение Docker и Bash с нуля',
    desc: 'Docker и Bash с нуля: образы, контейнеры, docker-compose, сети и тома — через практику в терминале.',
    stack: ['Docker', 'Docker Compose', 'Bash', 'Node.js 24', 'PostgreSQL 18'],
    difficulty: 'Базовая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/docker/docker.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/docker/docker.html',
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
      },
      {
        "tag": "приложение",
        "back": "Маленькое Node.js-приложение — подопытный: упаковывается в образ, ждёт базу и корректно останавливается."
      },
      {
        "tag": "база",
        "back": "PostgreSQL 18 нужен, чтобы отработать тома, сеть по имени контейнера и ожидание готовности (wait-for-postgres.sh)."
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
        "code": "FROM node:24-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . ."
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
        "code": "docker run -v pgdata:/var/lib/postgresql postgres:18\n\ndocker run -v /home/user/project/src:/app/src myapp\n\n-v ./config:/etc/app/config:ro"
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
        "code": "docker network create lab-net\n\ndocker run -d --name postgres --network lab-net postgres:18-alpine\ndocker run -d --name app --network lab-net myapp\n\ndocker run -p 8080:3000 myapp"
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
    sessions: [
      {
        "h": "~3 ч",
        "t": "Первый образ и bash-entrypoint",
        "r": "Образ Node-приложения с .dockerignore и entrypoint.sh, который проверяет окружение и передаёт управление через exec"
      },
      {
        "h": "~3,5 ч",
        "t": "Данные, сеть, ожидание БД",
        "r": "PostgreSQL в своей сети с volume; приложение ждёт БД, корректно останавливается по SIGTERM; образ собран multi-stage"
      },
      {
        "h": "~3,5 ч",
        "t": "Compose и Production Hell",
        "r": "Весь стек поднимается одной командой с .env, restart policy и лимитами; сломанный compose починен без подсказок"
      }
    ],
    arch: {
      "title": "Путь запроса и запуск контейнера",
      "rows": [
        {
          "label": "Хост",
          "boxes": [
            "curl localhost:3000",
            ".env"
          ]
        },
        {
          "label": "Docker",
          "boxes": [
            "-p 3000:3000",
            "сеть lab-net (DNS по имени)"
          ]
        },
        {
          "label": "Контейнер app",
          "boxes": [
            "entrypoint.sh",
            "ожидание postgres",
            "exec node server.js"
          ]
        },
        {
          "label": "Контейнер postgres",
          "boxes": [
            "postgres:18-alpine",
            "healthcheck pg_isready"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "named volume pgdata"
          ]
        }
      ],
      "note": "Ловушка: без exec в конце entrypoint.sh PID 1 остаётся у bash, docker stop не доходит до node и ждёт 10 секунд до SIGKILL.",
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
            "t": "Docker · контейнер app",
            "x": 250,
            "w": 430
          },
          {
            "t": "postgres · данные",
            "x": 710,
            "w": 276
          }
        ],
        "nodes": [
          {
            "id": "curl",
            "t": "curl :3000",
            "s": "запрос с хоста",
            "x": 110,
            "y": 150,
            "d": "Запрос с хоста на localhost:3000; приложение отвечает строкой с именем из APP_NAME."
          },
          {
            "id": "env",
            "t": ".env",
            "s": "подстановка ${VAR}",
            "x": 110,
            "y": 350,
            "d": "Compose подставляет из .env APP_NAME и POSTGRES_PASSWORD; файл в .gitignore, в git идёт только .env.example."
          },
          {
            "id": "port",
            "t": "-p 3000:3000",
            "s": "хост:контейнер",
            "x": 350,
            "y": 110,
            "d": "Реальный проброс порта; EXPOSE в Dockerfile только документация. Контейнерная часть должна совпадать с портом приложения."
          },
          {
            "id": "ep",
            "t": "entrypoint.sh",
            "s": "set -euo pipefail",
            "x": 350,
            "y": 270,
            "d": "ENTRYPOINT-скрипт проверяет APP_ENV и APP_NAME и падает с exit 1, если в production нет обязательной переменной."
          },
          {
            "id": "wait",
            "t": "ожидание БД",
            "s": "until /dev/tcp",
            "x": 350,
            "y": 430,
            "d": "Цикл until пробует открыть TCP к postgres:5432 до 30 раз с паузой 2 с, иначе выходит с ошибкой."
          },
          {
            "id": "net",
            "t": "сеть lab-net",
            "s": "DNS по имени",
            "x": 570,
            "y": 110,
            "d": "Пользовательская bridge-сеть со встроенным DNS: имя postgres резолвится в IP контейнера. В сети по умолчанию так не работает."
          },
          {
            "id": "app",
            "t": "node server.js",
            "s": "PID 1 через exec",
            "x": 570,
            "y": 270,
            "d": "exec заменяет bash процессом из CMD, поэтому node получает SIGTERM напрямую и останавливается быстро."
          },
          {
            "id": "pg",
            "t": "postgres:18",
            "s": "healthcheck",
            "x": 800,
            "y": 170,
            "d": "База в контейнере; healthcheck pg_isready нужен, чтобы depends_on с condition: service_healthy ждал готовности, а не просто старта."
          },
          {
            "id": "vol",
            "t": "pgdata",
            "s": "named volume",
            "x": 800,
            "y": 380,
            "d": "Named volume на /var/lib/postgresql: данные переживают удаление контейнера."
          }
        ],
        "edges": [
          {
            "a": "curl",
            "b": "port"
          },
          {
            "a": "port",
            "b": "ep"
          },
          {
            "a": "env",
            "b": "ep"
          },
          {
            "a": "ep",
            "b": "wait"
          },
          {
            "a": "wait",
            "b": "net"
          },
          {
            "a": "net",
            "b": "pg"
          },
          {
            "a": "pg",
            "b": "app"
          },
          {
            "a": "pg",
            "b": "vol"
          },
          {
            "a": "app",
            "b": "port",
            "back": true
          }
        ],
        "flow": [
          {
            "n": "env",
            "txt": "Compose подставляет значения из .env и запускает контейнер app."
          },
          {
            "n": "ep",
            "txt": "entrypoint.sh проверяет окружение (APP_ENV, APP_NAME)."
          },
          {
            "n": "wait",
            "txt": "Цикл until ждёт, пока postgres:5432 начнёт принимать соединения."
          },
          {
            "n": "net",
            "txt": "Имя postgres резолвится DNS сети lab-net."
          },
          {
            "n": "pg",
            "txt": "healthcheck pg_isready проходит, база готова."
          },
          {
            "n": "app",
            "txt": "exec \"$@\": node становится PID 1 и слушает порт 3000."
          },
          {
            "n": "port",
            "txt": "Docker пробрасывает ответ с порта 3000 контейнера на хост.",
            "back": true
          },
          {
            "n": "curl",
            "txt": "curl получает: «Привет! Меня зовут …».",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Зачем в конце entrypoint-скрипта пишут exec \"$@\", а не просто \"$@\"?",
        "a": "exec заменяет процесс bash процессом из аргументов: тот же PID, но другой код внутри. Без него команда стартует дочерним процессом, а PID 1 остаётся у bash, и сигналы остановки приходят ему, а не приложению."
      },
      {
        "q": "Что произойдёт при docker stop, если PID 1 — bash-скрипт без exec?",
        "a": "Docker шлёт SIGTERM в PID 1 и ждёт 10 секунд. Bash не пересылает сигнал дочернему node, поэтому тот о нём не узнаёт, и по таймауту всё убивается через SIGKILL, минуя graceful shutdown."
      },
      {
        "q": "Зачем нужен healthcheck вместе с обычным depends_on?",
        "a": "Обычный depends_on гарантирует только порядок старта контейнеров, но не готовность: процесс postgres запущен, а порт 5432 ещё не принимает соединения. condition: service_healthy ждёт успешного pg_isready, а остаточную гонку закрывает ожидание БД в самом entrypoint."
      },
      {
        "q": "Почему имена контейнеров резолвятся по DNS в пользовательской bridge-сети, но не в дефолтной?",
        "a": "Встроенный DNS Docker обслуживает только сети, созданные через docker network create; у сети bridge по умолчанию его нет по историческим причинам совместимости. Поэтому для проекта из нескольких контейнеров создают свою сеть, а Compose делает это автоматически."
      },
      {
        "q": "Как multi-stage build уменьшает итоговый образ?",
        "a": "Сборка и тесты идут в первом стейдже со всеми зависимостями, а в финальный через COPY --from=builder переносятся только нужные файлы и ставятся production-зависимости. devDependencies, исходники тестов и слои первого стейджа в итоговый образ не попадают."
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
        "t": "Composer и свой роутер",
        "r": "PSR-4 автозагрузка и маршрутизация с параметрами пути"
      },
      {
        "h": "~3,5 ч",
        "t": "Свой DI-контейнер",
        "r": "Autowiring через Reflection: конструкторы резолвятся сами"
      },
      {
        "h": "~3,5 ч",
        "t": "PDO, сессии, CSRF, .env",
        "r": "Prepared statements, транзакция, свой CSRF-токен и свой .env-парсер"
      },
      {
        "h": "~4 ч",
        "t": "Финал: REST API и сравнение с Laravel",
        "r": "Рабочий API кофейни, middleware-цепочка и таблица «что Laravel даёт бесплатно»"
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
    desc: 'Чистый JavaScript с нуля — общий фундамент для Vue и TypeScript: var/let/const и hoisting, this и замыкания, прототипы и class, event loop и async/await, DOM без фреймворка, ESM-модули, своя реактивность на Proxy, финальное мини-SPA с явным сравнением с Vue.',
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
        "t": "Event loop, Promises, fetch, debounce/throttle",
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
        "t": "Мини-SPA: роутер, store, рендер, тесты",
        "r": "Рабочее приложение и финальная таблица «vanilla vs Vue»"
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
    subtitle: 'От Compose к оркестрации',
    desc: 'Миграция стека из Traefik-лабы в Kubernetes (kind): Pod и Deployment, Service и DNS, ConfigMap/Secret, Volumes и PVC, readiness/liveness-пробы, Traefik как Ingress-контроллер, HorizontalPodAutoscaler.',
    stack: ['Kubernetes v1.37.0', 'kind v0.33.0', 'kubectl', 'Traefik', 'PostgreSQL'],
    difficulty: 'Средняя–высокая',
    image: 'https://meeymirita-files.storage.yandexcloud.net/kubernetes/kubernetes.png',
    open: 'https://meeymirita-files.storage.yandexcloud.net/kubernetes/kubernetes.html',
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
      },
      {
        "tag": "данные",
        "back": "База на PersistentVolumeClaim: данные не теряются при пересоздании Pod (шаг 2.2)."
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
    sessions: [
      {
        "h": "~3 ч",
        "t": "Кластер и первые объекты",
        "r": "kind-кластер, Deployment с самолечением и Service со стабильным адресом для API"
      },
      {
        "h": "~3,5 ч",
        "t": "Полный стек: конфиги, данные, пробы",
        "r": "API с ConfigMap и Secret, PostgreSQL на PVC, пробы готовности и requests/limits"
      },
      {
        "h": "~3,5 ч",
        "t": "Ingress и автоскейлинг",
        "r": "Traefik в кластере с IngressRoute, HPA вместо ручных реплик и финальный Production Hell"
      }
    ],
    arch: {
      "title": "Путь запроса в кластер kind",
      "rows": [
        {
          "label": "Хост",
          "boxes": [
            "браузер api.localhost",
            "kind extraPortMappings 80/443"
          ]
        },
        {
          "label": "Вход в кластер",
          "boxes": [
            "Traefik Pod (hostPort)",
            "IngressRoute api-route"
          ]
        },
        {
          "label": "Сеть",
          "boxes": [
            "Service api-service :3000",
            "CoreDNS + kube-proxy"
          ]
        },
        {
          "label": "Приложение",
          "boxes": [
            "Deployment api → ReplicaSet → Pod ×3",
            "HPA api-hpa",
            "ConfigMap + Secret"
          ]
        },
        {
          "label": "Данные",
          "boxes": [
            "PostgreSQL Pod",
            "PVC postgres-pvc"
          ]
        }
      ],
      "note": "Ловушка: HPA не работает без resources.requests, а Service типа LoadBalancer в kind не получает внешний IP, поэтому порты хоста пробрасывают в узел.",
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
            "s": "api.localhost",
            "x": 110,
            "y": 150,
            "d": "Запрос на api.localhost попадает на порт 80 хоста."
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
            "d": "Тот же Traefik, но развёрнутый Pod'ом в кластере; берёт порты узла через hostPort и читает маршруты из CRD."
          },
          {
            "id": "ir",
            "t": "IngressRoute",
            "s": "Host(`api.localhost`)",
            "x": 570,
            "y": 110,
            "d": "Аналог Docker-labels из Traefik-лабы: правило match и ссылка на имя Kubernetes Service."
          },
          {
            "id": "svc",
            "t": "api-service",
            "s": "ClusterIP :3000",
            "x": 350,
            "y": 270,
            "d": "Стабильный адрес поверх Pod'ов: находит их через selector app: api, имя резолвит CoreDNS, трафик распределяет kube-proxy."
          },
          {
            "id": "dep",
            "t": "Deployment api",
            "s": "ReplicaSet · 3 Pod",
            "x": 570,
            "y": 270,
            "d": "Deployment создаёт ReplicaSet, тот держит три Pod'а и пересоздаёт упавшие; readiness и liveness-пробы бьют в /health."
          },
          {
            "id": "hpa",
            "t": "HPA api-hpa",
            "s": "CPU 50% · 1–5 реплик",
            "x": 350,
            "y": 430,
            "d": "Раз в 15 секунд спрашивает metrics-server о загрузке и сам меняет replicas у Deployment."
          },
          {
            "id": "cfg",
            "t": "ConfigMap/Secret",
            "s": "envFrom",
            "x": 570,
            "y": 430,
            "d": "Несекретные значения в ConfigMap api-config, пароль в Secret api-secret; подключаются в Pod через envFrom."
          },
          {
            "id": "pg",
            "t": "PostgreSQL",
            "s": "Pod · pg_isready",
            "x": 800,
            "y": 170,
            "d": "База с readiness-пробой командой pg_isready, доступна внутри кластера через ClusterIP Service."
          },
          {
            "id": "pvc",
            "t": "postgres-pvc",
            "s": "1Gi · StorageClass",
            "x": 800,
            "y": 380,
            "d": "Заявка на хранилище: StorageClass standard в kind сам создаёт PV, данные переживают пересоздание Pod'а."
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
            "txt": "GET http://api.localhost/users/1."
          },
          {
            "n": "kind",
            "txt": "Порт 80 хоста проброшен в узел kind."
          },
          {
            "n": "traefik",
            "txt": "Traefik Pod принимает запрос на hostPort."
          },
          {
            "n": "ir",
            "txt": "IngressRoute api-route: Host(`api.localhost`) совпал."
          },
          {
            "n": "svc",
            "txt": "api-service выбирает Pod по selector (kube-proxy)."
          },
          {
            "n": "dep",
            "txt": "Pod из Deployment api отвечает; HPA следит за его CPU."
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
            "txt": "Браузер получает JSON с servedBy.",
            "back": true
          }
        ]
      }
    },
    faq: [
      {
        "q": "Deployment создаёт Pod'ы напрямую или через промежуточный объект?",
        "a": "Через ReplicaSet: он следит за числом Pod'ов с нужными label'ами по selector.matchLabels. Deployment поверх него нужен для rolling-обновлений: при смене image создаётся новый ReplicaSet и трафик переключается постепенно. Удалённый вручную Pod пересоздаётся, а голый Pod без Deployment никто не вернёт."
      },
      {
        "q": "В чём разница между readinessProbe и livenessProbe?",
        "a": "При провале readinessProbe Pod убирается из Service и перестаёт получать трафик, но не перезапускается. При провале livenessProbe контейнер убивается и пересоздаётся. Разделение нужно, чтобы занятый, но живой процесс не убивали."
      },
      {
        "q": "Почему Secret в Kubernetes не является средством шифрования?",
        "a": "Kubernetes хранит значения в base64, а это кодирование, разворачивается одной командой. Защита держится на RBAC: кто может выполнить kubectl get secret -o yaml, тот прочитает пароль. Для настоящей секретности нужны внешние инструменты вроде Vault, Sealed Secrets или SOPS."
      },
      {
        "q": "Почему HorizontalPodAutoscaler не работает без resources.requests?",
        "a": "HPA сам ничего не измеряет: раз в 15 секунд он спрашивает metrics-server, какой процент от requests.cpu потребляет каждый Pod. Без requests не от чего считать проценты. Сам metrics-server в kind по умолчанию нет, его ставят вручную."
      },
      {
        "q": "Почему в kind Service типа LoadBalancer не даёт внешний IP и как это обходится?",
        "a": "В облаке внешний IP выдаёт провайдер, а в kind провайдера нет. Поэтому при создании кластера в kind-config.yaml задают extraPortMappings, которые пробрасывают порты 80 и 443 хоста в узел, а Pod с Traefik запрашивает эти порты через hostPort."
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
        "h": "~3 ч",
        "t": "Фундамент: TypeScript, DI, модули, конфиг",
        "r": "Свои декораторы и мини-DI-контейнер, модуль health, конфиг .env с валидацией"
      },
      {
        "h": "~3,5 ч",
        "t": "База данных: Docker, Prisma, CRUD",
        "r": "CRUD тикетов с валидацией DTO, фильтром ошибок Prisma и историей изменений в транзакции"
      },
      {
        "h": "~3,5 ч",
        "t": "Пользователи и безопасность",
        "r": "Регистрация, логин по JWT, глобальный guard, refresh-ротация, роли и политика доступа"
      },
      {
        "h": "~3,5 ч",
        "t": "Комментарии, события, real-time",
        "r": "Комментарии, доменные события, WebSocket-шлюз, request id, Swagger, CORS и rate limiting"
      },
      {
        "h": "~3,5 ч",
        "t": "Тесты и продакшн",
        "r": "Unit- и e2e-тесты, динамический модуль аудита, health-чеки, Docker-образ, задания Production Hell"
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
    desc: 'Что происходит под ORM на миллионе заказов кофейни: JOIN с нуля, EXPLAIN и индексы B-tree/GIN/BRIN под конкретный запрос, статистика, N+1 глазами базы, уровни изоляции и аномалии, блокировки и дедлоки, SKIP LOCKED, MVCC и VACUUM, партиционирование.',
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
        "t": "JOIN с нуля на песочнице",
        "r": "JOIN всех видов, размножение строк и GROUP BY освоены на пяти клиентах и семи заказах"
      },
      {
        "h": "~3 ч",
        "t": "Окружение, схема, миллион заказов, SQL за пределами CRUD",
        "r": "Postgres 17 в Docker, схема кофейни, 1 млн заказов и инструментарий: CTE, окна, LATERAL"
      },
      {
        "h": "~3,5 ч",
        "t": "EXPLAIN и B-tree",
        "r": "Запрос «последние заказы клиента» ускорен от Seq Scan на миллион строк до 20 прочитанных записей"
      },
      {
        "h": "~3,5 ч",
        "t": "JOIN'ы, GIN и BRIN, статистика, N+1, пагинация",
        "r": "Индексы под поиск и журнал событий, N+1 пойман в pg_stat_statements, keyset-пагинация"
      },
      {
        "h": "~3 ч",
        "t": "Транзакции и изоляция",
        "r": "Потерянное обновление, уровни изоляции и write skew воспроизведены в нескольких терминалах"
      },
      {
        "h": "~3 ч",
        "t": "Блокировки, очереди, дедлоки, миграции",
        "r": "Очередь на SKIP LOCKED, воспроизведённый и вылеченный дедлок, миграции без простоя"
      },
      {
        "h": "~3,5 ч",
        "t": "MVCC, VACUUM, партиционирование, Production Hell",
        "r": "Версии строк видны через pageinspect, таблица партиционирована по месяцам, финальные задания без подсказок"
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
    desc: 'Публичный центр поддержки на Nuxt 4 и TypeScript: файловый роутинг, useFetch и гидрация, Nitro server routes, Drizzle + SQLite, общие Zod-схемы в shared/, сессии и защита страниц, Nuxt Content, routeRules (SSG, SWR, SPA), SEO, тесты и сборка в Docker.',
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
        "t": "Данные и гидрация",
        "r": "Страница статуса на статичных данных, пойманы двойной запрос и mismatch"
      },
      {
        "h": "~3 ч",
        "t": "Nitro и БД",
        "r": "Статус из БД, API и форма обращения"
      },
      {
        "h": "~4 ч",
        "t": "Авторизация и состояние",
        "r": "Вход, «мои обращения», кабинет агента: очередь и смена статуса"
      },
      {
        "h": "~4 ч",
        "t": "Контент, кеш, рендеринг",
        "r": "База знаний с поиском, пререндер, кешируемая страница статуса"
      },
      {
        "h": "~3,5 ч",
        "t": "SEO и продакшн",
        "r": "Индексируемая база знаний, тесты, prod-образ, итоговая таблица"
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
    desc: 'Современный CSS с нуля на сайте фронтенд-конференции: каскад и @layer, токены, oklch и тёмная тема через light-dark(), Flexbox, Grid и subgrid, адаптив и container queries, :has() и формы, sticky, анимации и view transitions. Разметка готовая — вы пишете только стили, без фреймворков и препроцессоров.',
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
        "t": "Основы и каскад",
        "r": "Аккуратная типографика, побеждён «чужой» CSS"
      },
      {
        "h": "~3,5 ч",
        "t": "Токены, цвет, темы, текст",
        "r": "Дизайн-система на переменных, светлая и тёмная темы"
      },
      {
        "h": "~3 ч",
        "t": "Flexbox",
        "r": "Шапка, кнопки, карточки тарифов"
      },
      {
        "h": "~3,5 ч",
        "t": "Grid",
        "r": "Каркас, спикеры, таймлайн программы, выровненные тарифы"
      },
      {
        "h": "~3,5 ч",
        "t": "Адаптив, :has(), формы",
        "r": "Всё адаптивно, форма без JS"
      },
      {
        "h": "~3,5 ч",
        "t": "Позиционирование, движение, сборка",
        "r": "Живой интерфейс и собранный CSS"
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
    accent: '#38BDF8',
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
    accent: '#8B5CF6',
  },
  {
    key: 'laravel-performance',
    titleMain: 'laravel-performance',
    title: 'Laravel Performance Lab',
    subtitle: 'CoffeePerf — замеры и оптимизация',
    desc: 'Измерять, а не гадать, на приложении Coffee Shop с 1 млн заказов: перцентили и k6, Debugbar и Telescope, профилирование SPX и Blackfire, OPcache и JIT, кеш с тегами и блокировками, Octane + FrankenPHP, бюджет p95 в CI.',
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
        "t": "Стенд и первый замер",
        "r": "Coffee Shop с 1 млн заказов, перцентили, curl и ApacheBench"
      },
      {
        "h": "~4 ч",
        "t": "k6 с нуля",
        "r": "smoke, load, stress, spike и таблица «ДО»"
      },
      {
        "h": "~3 ч",
        "t": "Debugbar и Telescope",
        "r": "N+1 найден и закрыт запретом ленивой загрузки"
      },
      {
        "h": "~5 ч",
        "t": "Профилирование",
        "r": "SPX и flamegraph отчёта, затем Blackfire"
      },
      {
        "h": "~4 ч",
        "t": "OPcache и JIT",
        "r": "эффект OPcache и честный замер JIT"
      },
      {
        "h": "~5 ч",
        "t": "Кеширование",
        "r": "route:cache, кеш с тегами, stampede, индексы по EXPLAIN"
      },
      {
        "h": "~4 ч",
        "t": "Octane + FrankenPHP",
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
    accent: '#0e7490',
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
