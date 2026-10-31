# 99 Ночей в Диком Лесу — сводка проекта

## Ссылки

| Что | Где |
|---|---|
| Репозиторий | https://github.com/brainykola-stack/forest-survival |
| Задачи (Issues) | https://github.com/brainykola-stack/forest-survival/issues |
| Новая задача | https://github.com/brainykola-stack/forest-survival/issues/new/choose |
| Список задач файлом | https://github.com/brainykola-stack/forest-survival/blob/main/TASKS.md |
| История коммитов | https://github.com/brainykola-stack/forest-survival/commits/main |
| README (управление, структура) | https://github.com/brainykola-stack/forest-survival/blob/main/README.md |
| Заметки разработки | https://github.com/brainykola-stack/forest-survival/blob/main/PROJECT_CONTEXT.md |

## Что это

Браузерная 3D survival-horror игра: процедурный ночной лес, 99 ночей, костёр и база,
добыча и крафт, враги с ИИ, спасение детей и сюжет по запискам.
Стек: TypeScript, Three.js, Rapier (физика), Vite, Web Audio, IndexedDB.

## Запуск

```bash
npm install
npm run dev      # http://127.0.0.1:5199
npm run build    # production-сборка в dist/
npm test         # 19 тестов логики и мира
```

## Что уже работает

Меню, лобби, генерация мира по seed (7 зон), игрок от первого лица с физикой, добыча ресурсов,
инвентарь, крафт, строительство с разборкой, костёр с топливом, цикл суток, ночи с врагами
(4 вида), спасение четверых детей с наградами, 6 записок и оберег, 12 заданий, случайные
события, сохранение в IndexedDB, настройки графики и звука.

## Чего нет

Мультиплеер (кнопка честно сообщает), внешние модели — вся геометрия и звук процедурные,
уникальные события на каждую из 99 ночей, полноценные интерьеры и пещеры.

## Как агент читает задачи

- Issue: `GET https://api.github.com/repos/brainykola-stack/forest-survival/issues?state=all`
- Файл: `https://raw.githubusercontent.com/brainykola-stack/forest-survival/main/TASKS.md`
- Работает без токена, пока репозиторий **публичный**. Если сделать приватным — чтение
  задач с GitHub станет невозможно, останется только чат.

## Формат задачи

```
[высокий] Что сделать. Где (экран/механика/файл). Готово = проверяемый результат.
```

## Правила для коммитов

`feat:` новая возможность · `fix:` исправление · `docs:` документы · `chore:` служебное.
Ссылка на задачу в сообщении коммита: `(#12)`.
