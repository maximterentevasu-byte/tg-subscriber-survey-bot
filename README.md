# TG Subscriber Survey Bot для Pick me

Второй Telegram-бот для публикации в сообществах. Пользователь переходит по ссылке со старт-параметром, проходит опрос, вводит номер телефона бонусной карты Pick me, а ответы записываются в Google Sheets на лист **«Подписчики - ответы»**.

## Что умеет

- Автостарт через deep link: `https://t.me/BOT_USERNAME?start=channel_1`
- Сохраняет тех, кто только запустил опрос, даже если не дошёл до конца.
- Сохраняет источник/канал из параметра `start`.
- Пишет в ту же Google таблицу, но на отдельный лист `Подписчики - ответы`.
- Все столбцы на русском.
- Есть столбец **«Пользовательские данные»**.
- Обязательно спрашивает номер телефона бонусной карты Pick me.

## Переменные Railway

```env
TELEGRAM_BOT_TOKEN=токен_нового_бота
BOT_USERNAME=username_бота_без_@
PUBLIC_URL=https://your-service.up.railway.app
WEBHOOK_SECRET=длинная_секретная_строка
GOOGLE_SHEET_ID=id_той_же_google_таблицы
GOOGLE_SERVICE_ACCOUNT_EMAIL=email_service_account
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
SHEET_NAME=Подписчики - ответы
BONUS_AMOUNT=20
```

## Ссылки для 2 каналов

Примеры:

```text
https://t.me/BOT_USERNAME?start=channel_1
https://t.me/BOT_USERNAME?start=channel_2
```

Можно использовать понятные названия:

```text
https://t.me/BOT_USERNAME?start=pickme_main
https://t.me/BOT_USERNAME?start=pickme_second
```

Значение после `start=` будет записано в столбец **«Источник / канал»**.

Важно: Telegram ограничивает start-параметр. Используйте латиницу, цифры и подчёркивания, до 64 символов.

## Проверка после деплоя

1. Откройте:

```text
https://your-service.up.railway.app/health
```

Должно вернуться:

```json
{"ok":true}
```

2. Откройте ссылку:

```text
https://t.me/BOT_USERNAME?start=channel_1
```

3. Пройдите опрос.
4. Проверьте лист **«Подписчики - ответы»**.

## Текст публикации

```text
🎁 Получи 20 бонусов на карту Pick me

Мы хотим стать лучше и запустили короткий опрос 🙌

Это займёт всего 1–2 минуты.
За прохождение начислим тебе 20 бонусов на бонусную карту Pick me 💛

👇 Начать опрос:
https://t.me/BOT_USERNAME?start=channel_1
```
