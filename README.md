# works-lab — страницы и служебные данные сайта

Репозиторий входит в сборный [anitech-performance](https://github.com/meeymirita/anitech-performance) как подмодуль `works`.

- `<ключ>.html` — страница-витрина каждой лабы (описание, стек, «Чему вы научитесь», оглавление, статус проверки);
- `progress.html` — все работы, прогресс, порядок прохождения и список дел (вкладка «Что осталось»);
- `verification.html` — что чем проверено; `changelog.html` — хронология;
- `js/` — данные и скрипты (`lab.js` — реестр лаб, `prereq.js` — порядок и зависимости, `toc.json`, `status.js`);
- `images/` — обложки, миниатюры (`thumbs/`) и превью для ссылок (`og/`).

Страницы собираются скриптами из корня сборного репозитория (`tools/build-progress.py`, `build-toc.py`, `build-verification.py`, `build-seo.py`); вручную правятся только `changelog.html` и реестры в `js/`.

Код — MIT, тексты — CC BY 4.0, обложки не покрыты (см. [LICENSE](LICENSE), [NOTICE](NOTICE)).
