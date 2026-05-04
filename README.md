# tg-subscriber-survey-bot

Второй Telegram-бот для опроса подписчиков Pick me.

## Что делает

- Запускает опрос по ссылке вида `https://t.me/BOT_USERNAME?start=channel1`.
- Сохраняет пользователя в Google Sheets сразу после старта.
- Обновляет строку по мере ответов, поэтому незавершённые анкеты тоже остаются в таблице.
- Записывает источник/канал из `start`-параметра.
- Запрашивает номер телефона, к которому привязана бонусная карта Pick me.
- Не даёт повторно пройти опрос, если пользователь уже запускал/проходил его менее 21 дня назад.

## Важное про автостарт

Telegram deep-link передаёт параметр в команду `/start`, но Telegram-клиент всё равно показывает пользователю кнопку **Start / Запустить**. Бот не может нажать её за пользователя. Правильная ссылка:

```text
https://t.me/BOT_USERNAME?start=channel1
```

Для второго канала:

```text
https://t.me/BOT_USERNAME?start=channel2
```

## Railway Variables

```env
TELEGRAM_BOT_TOKEN=токен_бота
BOT_USERNAME=юзернейм_бота_без_@
PUBLIC_URL=https://your-service.up.railway.app
WEBHOOK_SECRET=любая_длинная_строка
GOOGLE_SHEET_ID=id_гугл_таблицы
GOOGLE_SERVICE_ACCOUNT_EMAIL=client_email_из_json
GOOGLE_PRIVATE_KEY=private_key_из_json_с_\\n
SHEET_NAME=Подписчики - ответы
BONUS_AMOUNT=20
REPEAT_COOLDOWN_DAYS=21
NODE_ENV=production
```

## Лист Google Sheets

По умолчанию бот пишет в лист:

```text
Подписчики - ответы
```

Если листа нет — бот создаст его. Если шапка отличается — бот обновит первую строку.

## Источники/каналы

Используй разные ссылки для разных каналов:

```text
https://t.me/BOT_USERNAME?start=channel1
https://t.me/BOT_USERNAME?start=channel2
```

Можно использовать читаемые значения:

```text
https://t.me/BOT_USERNAME?start=pickme_main
https://t.me/BOT_USERNAME?start=pickme_partner
```

Пробелы в start-параметре не используй. Вместо пробелов — `_`.

## Команды для проверки

```text
/ping
/start channel1
```

## Деплой

```bash
npm install
npm start
```

На Railway после добавления переменных сделай Redeploy.
