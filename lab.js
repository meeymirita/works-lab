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
          "label": "PostgreSQL 16 (одна транзакция)",
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
          "label": "PostgreSQL 17",
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
            "t": "Redis 7",
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
    sessions: [
      {
        "h": "",
        "t": "Базовая инфраструктура и первый маршрут",
        "r": "Traefik с Docker provider, роутер на whoami через labels и дашборд под basicauth"
      },
      {
        "h": "",
        "t": "API, frontend и БД за прокси",
        "r": "Три реплики API с healthcheck и балансировкой, frontend по /app со StripPrefix, PostgreSQL и Adminer, цепочка middlewares"
      },
      {
        "h": "",
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
          "label": "Traefik v3.1",
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
            "t": "Traefik v3.1",
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
    sessions: [
      {
        "h": "",
        "t": "Первый образ и bash-entrypoint",
        "r": "Образ Node-приложения с .dockerignore и entrypoint.sh, который проверяет окружение и передаёт управление через exec"
      },
      {
        "h": "",
        "t": "Данные, сеть, ожидание БД",
        "r": "PostgreSQL в своей сети с volume; приложение ждёт БД, корректно останавливается по SIGTERM; образ собран multi-stage"
      },
      {
        "h": "",
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
            "postgres:17-alpine",
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
            "t": "postgres:17",
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
            "d": "Named volume на /var/lib/postgresql/data: данные переживают удаление контейнера."
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
    sessions: [
      {
        "h": "",
        "t": "Кластер и первые объекты",
        "r": "kind-кластер, Deployment с самолечением и Service со стабильным адресом для API"
      },
      {
        "h": "",
        "t": "Полный стек: конфиги, данные, пробы",
        "r": "API с ConfigMap и Secret, PostgreSQL на PVC, пробы готовности и requests/limits"
      },
      {
        "h": "",
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
    image: '../css/css.png',
    open: '../css/CSS_Lab_FrontFest.html',
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
