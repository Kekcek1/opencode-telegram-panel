# OpenCode Telegram Panel

Публичный пульт управления [OpenCode](https://opencode.ai) из Telegram: сессии,
модели, агенты и планы, задачи с телефона, Git, отчёты и `/btw`.

**Сайт с инструкцией:**
https://kekcek1.github.io/opencode-telegram-panel/

> Это не официальный проект OpenCode. Бот работает локально на вашем ПК и
> общается с уже запущенным OpenCode по HTTP API.

## Что умеет

- **Сессии общие с ПК.** Бот ходит в тот же сервис, что и TUI. Создали в
  Telegram — видно на ПК; создали на ПК — видно в `/sessions`.
- **Новая сессия:** папка → провайдер → модель → уровень мышления → агент.
- **Задачи с телефона:** обычный текст уходит в выбранную сессию,
  `/task текст` создаёт быструю сессию.
- **`/btw текст`** — вклиниться в текущую работу через `delivery: steer`.
- **Модели и план:** `/model`, `/model deepseek`, `/agent`, `/plan`, варианты
  `minimal/low/medium/high/max`.
- **Отчёты:** токены, стоимость, модель, агент, последний ответ, Git-статус.
- **Коннекты:** провайдеры, активные ключи, MCP connect/disconnect.
- **Git:** статус, коммит, push, pull, история, ветки. Секреты блокируются.
- **`/service`** — выбрать сервис, если запущено несколько OpenCode.

## Быстрый старт

Требуется Node.js 20+ и запущенный OpenCode.

```bash
git clone https://github.com/Kekcek1/opencode-telegram-panel.git
cd opencode-telegram-panel/bot
```

Скопируйте конфиг и заполните пути:

```bash
copy config.example.json config.json
```

`config.json`:

- `serviceStates` — пути к `state/opencode/service.json` запущенного OpenCode;
- `defaultDirectory` — папка для быстрых задач;
- `gitExe` — путь к `git.exe` или просто `git`;
- `repos` — известные Git-репозитории для кнопки `📁 Репо`;
- `allowedUsername` / `allowedId` — белый список Telegram.

Создайте `secrets/bot.env`:

```text
TELEGRAM_BOT_TOKEN=токен_от_BotFather
TELEGRAM_ALLOWED_USERNAME=your_telegram_username
# TELEGRAM_ALLOWED_ID=123456789
```

Запуск без окна:

```text
start-silent.vbs
```

Остановка и проверка:

```text
stop.cmd
status.cmd
```

В Telegram откройте бота и отправьте `/start`.

## Команды

| Команда | Действие |
|---|---|
| `/start` | главное меню |
| `/sessions` | сессии и выбор |
| `/new` | новая сессия |
| `/model` | сменить модель; `/model deepseek` — поиск |
| `/agent` или `/plan` | сменить агента |
| `/task текст` | задача с телефона |
| `/btw текст` | вклиниться в работу |
| `/report` | отчёт по сессии |
| `/git` | Git-меню; `/git push`, `/git commit текст` |
| `/connections` | провайдеры, ключи, MCP |
| `/service` | выбор сервиса OpenCode |
| `/status` | состояние |
| `/stop` | остановить генерацию |
| `/rename текст` | переименовать сессию |
| `/delete` | удалить сессию |
| `/id` | ваш Telegram ID |
| `/help` | помощь |

## Безопасность

- Белый список по numeric ID (надёжнее username).
- Неизвестные пользователи игнорируются; попытки пишутся в `access.log`.
- Бот не выполняет произвольные shell-команды из Telegram. Только HTTP API
  OpenCode и фиксированные Git-операции.
- Перед коммитом блокируются пути, похожие на секреты: `secrets`, `.env`,
  `providers.env`, `service.json`, `id_rsa`, `*.pem`, `*.key`.
- Токен и `config.json` не коммитятся. `service.json` читается локально,
  пароль не логируется.

## Структура

```text
bot/
├── bot.mjs              Telegram polling
├── lib/                 OpenCode API, UI, Git, промты
├── config.example.json  шаблон конфига
├── secrets/bot.env      токен и whitelist
├── start-silent.vbs     запуск без окна
├── stop.cmd             остановка
└── status.cmd           статус и лог
```

## Ограничения

- Только текст: файлы и голосовые пока не поддерживаются.
- Один промт на чат за раз; `/btw` вклинивается в текущую работу.
- Permission-запросы OpenCode не пробрасываются в Telegram.
- Автозапуск при входе в Windows не настроен.
- Если запущено несколько OpenCode, выберите нужный через `/service`.

## Лицензия

Код можно использовать и изменять свободно. Проект не связан с OpenCode.
