# README сессии · 2026-11-25

Сессия: `ses_df0d3b96bffeYaDcEMO8RxkjAS` · `UniverseOpen_AgentHub`
Модель: `commandcode/deepseek/deepseek-v4.1-flash-fast`
Рабочая папка: `G:\sessions\ses_df0d3b96bffeYaDcEMO8RxkjAS` (правило для новых сессий).

## Что сделано

### Telegram-бот

- Асинхронная обработка: промт, `/btw`, отчёт и кнопки не блокируют друг друга.
- `/btw` через `POST /api/session/:id/generate`: ответ по контексту, история сессии не меняется.
- Красивые отчёты: токены с барами, стоимость, инструменты, Git, последний ответ.
- Закреплённая live-панель активных сессий, обновление каждые 20 секунд.
- Уведомление о завершении сессии с кнопками «Отчёт» и «Открыть».
- Избранное с заметками: `data/favorites.json`, общее для всех ключей CommandCode.
- Скрытые модели, пагинация всех моделей, кнопки `⭐`, `🙈`, `📝` в списках.
- Файлы: `/send путь`, `bin/tg-send.cmd` для модели, автоотправка по просьбе в промте.
- Входящие файлы: документ, фото, аудио, голосовое или видео скачиваются в
  `<папка сессии>/uploads`; модель получает путь и анализирует файл (до 20 МБ).
- Одно навигационное сообщение: старые меню удаляются, отчёт тоже один.
- Группы сессий: те же категории, что у плагина `commandcode-sessions` в TUI.
- Удаление сессии из списка с подтверждением и удалением из групп.
- Новая сессия получает папку `G:\sessions\<session-id>`.

### Отдел агентов и переносимость

- `G:\0_PROGRAMS\opencode-portable` — одна папка: runtime, config, plugins, secrets, tools.
- `config/opencode/agency/` — роли, процесс, модели, поправки, шаблоны.
- `config/opencode/agents/` — `lead`, `builder`, `reviewer`, `inspector`, `editor`.
- `config/opencode/skills/` — `core`, `delivery`, `quality`, `recipes`.
- Linux x64 и ARM64 сборки в соседних папках.
- AGENTS.md: рабочая папка новой сессии — `G:\sessions\<session-id>`.

## Карта бота

```text
opencode-bot/
├── bot.mjs                 polling, команды, Presence
├── bin/tg-send.cmd|mjs     отправка файла моделью
├── lib/
│   ├── opencode.mjs        HTTP API, prompt, generate, move
│   ├── prompt.mjs          асинхронный промт, /btw, файлы
│   ├── presence.mjs        live-панель, уведомления
│   ├── groups.mjs          чтение/запись групп плагина
│   ├── files.mjs           поиск и отправка файлов
│   ├── prefs.mjs           избранное, заметки, скрытые
│   ├── handlers.mjs        команды и callback-роутинг
│   └── actions/            сессии, группы, модели, Git, отчёты
├── data/favorites.json     заметки (не в git)
└── secrets/bot.env         токен и whitelist (не в git)
```

## Рабочие папки и Git

- Новая сессия: `G:\sessions\<session-id>`.
- `G:\sessions` — локальный git-репозиторий с README и `.gitignore`.
- `G:\sessions\repos` — shallow-клоны `my_rep_ai` и `opencode-telegram-panel`.
- Лаунчеры OpenCode переходят на диск сборки, если запущены из другого диска
  (в том числе из `C:\Windows\System32` от администратора).

## Группы

Источник правды — файл плагина:

```text
state/opencode/latest/tui/plugin.commandcode.sessions.session-folders.json
```

Бот читает `order`, `sessions`, `expanded` и пишет обратно атомарно, сохраняя
неизвестные поля. Команды: `/groups`, кнопка `⚙️` в списке сессий, перенос,
переименование группы, удаление группы, удаление сессии.

## Проверки

- `node --check` — все `.mjs` в трёх копиях.
- Модели: 92 у CommandCode, пагинация и `renderModelsPage` работают.
- Группы: чтение реального файла, создание/перенос/переименование/удаление на копии.
- `/btw`: `ORANGE` из контекста, сообщений `3 -> 3`.
- Асинхронность: `/sessions` во время промта — 21 мс.
- Файлы: `AGENT-PI.md` отправлен (message 94), `tg-send` с пробелами работает.
- Сайт: `PAGE OK`, ошибок консоли нет.

## Ограничения

- Второй обычный промт во время работы ждёт завершения первого; `/btw` и меню доступны.
- Существующие сессии сохраняют старую рабочую папку. Новые сессии бота — `G:\sessions\<id>`.
- Групповой файл общий с TUI; плагин может перезаписать его при следующем сохранении.
- Telegram Bot API: документы до 50 МБ.
- Permission-запросы OpenCode в Telegram не пробрасываются.

## Следующие шаги

1. Перезапустить бота и проверить `/groups`, `/model`, `/favorites`.
2. При переходе на portable выбрать сервис через `/service`.
3. Для публичного репозитория — отдельный commit/push после проверки.
