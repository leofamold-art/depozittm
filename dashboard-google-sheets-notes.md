# Dashboard and Google Sheets notes

Date: 2026-04-27

## Current dashboard

Local project runs at:

```text
http://localhost:8080
```

Dashboard screen:

- Dark theme.
- Header: `Дашборд результативности`.
- Two main tables:
  - `Сборщики`
  - `Водители`
- Each table shows:
  - rank
  - name
  - requests plan/fact
  - errors
  - request completion progress
  - quantity plan/fact
  - quantity completion progress
  - hiring/name column

No code or visual changes were made yet. We only discussed the data/settings structure.

## Current Google Sheets setup

On the dashboard sheet, cell `A1` contains a formula that pulls people from the `Исходник` sheet and detects their type:

```gs
=LET(
src;'Исходник'!A2:A;
tip;SCAN("" ;src;LAMBDA(prev;cur;ЕСЛИ((cur="Водители")+(cur="Сборщики");cur;prev)));
{"Имя"\"Тип";
FILTER({src\tip};(src<>"")*(src<>"Водители")*(src<>"Сборщики")*(src<>"Итого"))
}
)
```

This formula pulls:

- drivers from the `Водители` section
- pickers from the `Сборщики` section
- excludes empty rows, section headers, and `Итого`

## Problem

Manual settings are currently stored in the same rows as the dynamic employee list.

Important columns mentioned:

- `C` - request plan
- `E` - quantity plan
- `H` - show on dashboard
- `I` - hide plan
- `J` - enter/show name
- `K` - picking errors

Example problem:

1. There are 10 pickers.
2. A custom plan is set for `Redin Vladislav`, for example `160`.
3. In the middle of the month, a new picker is added in `Исходник`.
4. The formula rebuilds the list and shifts `Redin Vladislav` down.
5. The manual plan remains on the old row.
6. As a result, the plan is now assigned to another person.

The same issue can happen with columns `C`, `E`, `H`, `I`, `J`, `K`.

Root cause:

Manual settings are attached to row numbers, but employees are dynamic and can move.

## Key principle

Settings must be attached to a stable key, not to a row.

Recommended key:

```text
Имя|Тип
```

Example:

```text
Redin Vladislav|Сборщики
Popa Tudor (Sofer)|Водители
```

This prevents settings from moving to the wrong person when rows shift.

## Recommended solution

Create a separate sheet, for example:

```text
Настройки
```

This sheet should be a stable manual database, not a dynamic mirror of `Исходник`.

Example structure:

```text
Имя | Тип | План заявок | План кол-во | Выводить дашборд | Скрыть план | Вводить наименование | Ошибки сборки
```

Example rows:

```text
Redin Vladislav | Сборщики | 160 | 26000 | Да | Нет | Нет |
Sarcov Vadim    | Сборщики | 160 | 26000 | Да | Нет | Нет | 8
Popa Tudor      | Водители | 250 | 100000 | Да | Нет | Нет |
```

The `Настройки` sheet should not automatically sort or rebuild itself from `Исходник`.

## Important clarification

If `Настройки` also uses a dynamic formula to pull people from `Исходник`, and plans are written manually next to that dynamic list, the same problem will happen again.

So `Настройки` should work like this:

- Existing configured people stay on stable manual rows.
- New people from `Исходник` appear on the dashboard automatically.
- If a new person is not yet in `Настройки`, the dashboard uses default values.
- If the new person needs custom settings, add them manually as a new row in `Настройки`.

## Dashboard formula idea

On the dashboard sheet:

- `A:B` can stay dynamic from `Исходник`.
- Fact columns can be pulled from `Исходник`.
- Settings columns should be pulled from `Настройки` using `Имя|Тип`.

Example for request plan in `C2`:

```gs
=MAP(A2:A;B2:B;LAMBDA(name;typ;
 ЕСЛИ(name="";;
  ЕСЛИОШИБКА(
   XLOOKUP(name&"|"&typ;Настройки!A:A&"|"&Настройки!B:B;Настройки!C:C);
   ЕСЛИ(typ="Водители";250;160)
  )
 )
))
```

Example for quantity plan in `E2`:

```gs
=MAP(A2:A;B2:B;LAMBDA(name;typ;
 ЕСЛИ(name="";;
  ЕСЛИОШИБКА(
   XLOOKUP(name&"|"&typ;Настройки!A:A&"|"&Настройки!B:B;Настройки!D:D);
   ЕСЛИ(typ="Водители";100000;26000)
  )
 )
))
```

Default values discussed:

- Pickers:
  - request plan: `160`
  - quantity plan: `26000`
- Drivers:
  - request plan: `250`
  - quantity plan: `100000`

The same lookup approach can be used for:

- show on dashboard
- hide plan
- enter/show name
- errors

## Optional helper sheet

Create a helper sheet, for example:

```text
Новые сотрудники
```

It can show people who exist in the dashboard list but do not exist in `Настройки`.

Example formula:

```gs
=FILTER(
 Дашборд!A2:B;
 Дашборд!A2:A<>"";
 ISNA(MATCH(Дашборд!A2:A&"|"&Дашборд!B2:B;Настройки!A:A&"|"&Настройки!B:B;0))
)
```

Purpose:

- See who was added in `Исходник`.
- Decide whether to add custom settings for that person.
- Until added to `Настройки`, the dashboard uses default values.

## Alternative options discussed

### Option 1: Separate settings sheet

Best practical option.

Pros:

- Stable.
- Easy to understand.
- Does not break when people are added or moved.

Cons:

- New custom settings must be added manually.

### Option 2: Hidden key column

Add a hidden helper key like:

```gs
=A2&"|"&B2
```

Then use that key for lookups.

Pros:

- Simpler formulas.
- More reliable matching.

### Option 3: Apps Script synchronization

Keep settings visually on one sheet, but use a script to save settings by key and restore them after list changes.

Pros:

- Looks like one working table.

Cons:

- More complex.
- More maintenance.
- Higher risk of bugs.

### Option 4: Only add new people to the end

Avoid inserting people in the middle.

This is not recommended because it is fragile. Sorting or inserting rows can break settings again.

## Decision direction

Most reliable direction for tomorrow:

1. Keep `Исходник` as the raw dynamic export.
2. Keep `Дашборд` as a calculated display sheet.
3. Add `Настройки` as a stable manual settings table.
4. Use `Имя|Тип` as the lookup key.
5. Use default values when a person has no custom row in `Настройки`.
6. Optionally add `Новые сотрудники` to show missing settings rows.

