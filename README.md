# Depozit Dashboard

Dashboard for warehouse performance results. The app reads public Google Sheets data, shows separate tables for pickers and drivers, and uses a separate manual settings sheet for plans, visibility, product display, and errors.

## Local Run

Requirements:

- Node.js

Start the project:

```bash
node server.js
```

Open:

```text
http://localhost:8080/login
```

Default password:

```text
1181
```

The password can be changed with the environment variable:

```text
DASH_PASSWORD
```

## Files

- `server.js` - Node HTTP server, login, session cookie, and static file serving.
- `index.html` - dashboard markup.
- `app.js` - Google Sheets loading, settings merge, rendering, sorting, and refresh logic.
- `style.css` - dashboard styles.
- `vercel.json` - Vercel deployment config.
- `fruit_vegetable_pumpkin_1812.png` - favicon.
- `dashboard-google-sheets-notes.md` - working notes about the Google Sheets structure.

## Google Sheets Structure

The app uses two sheets:

```text
Дашборд
Настройки
```

The sheet names can be changed from the dashboard settings modal.

### Sheet: Дашборд

This sheet should contain only automatic/dynamic data.

Columns:

```text
A: Имя
B: Тип
C: Факт заявок
D: Факт количества
E: Наименования
```

Expected type values:

```text
Сборщики
Водители
```

The dashboard reads only columns `A:E` from this sheet.

### Sheet: Настройки

This sheet stores manual settings. A person is matched by name and type.

Columns:

```text
A: Имя
B: Тип
C: План заявок
D: План кол-во
E: Выводить дашборд
F: Скрыть план
G: Вводить наименование
H: Ошибки сборки
```

Example rows:

```text
Arnaut Andrei    Сборщики    160    26000     Да    Нет    Нет    2
Bronici Vladislav    Водители    250    100000    Да    Нет    Нет
Turcan Nadejda    Сборщики    160    26000    Нет    Нет    Нет
```

Values:

- `Выводить дашборд`: `Да` shows the person, `Нет` hides the person.
- `Скрыть план`: `Да` shows only fact values without plan values.
- `Вводить наименование`: `Да` shows the product/name count for that person.
- `Ошибки сборки`: optional number shown in the errors column.

## Missing Settings Behavior

If a person exists in `Дашборд` but does not exist in `Настройки`, the person is not shown in the tables.

Instead, the dashboard shows a warning at the top:

```text
Нужно добавить в лист "Настройки": Name (Type)
```

Add that person to `Настройки` to make them appear on the dashboard.

## Dashboard Settings Modal

The `Настройки` button in the dashboard lets you configure:

- refresh interval
- Google Spreadsheet ID
- dashboard sheet name
- manual settings sheet name
- global visibility of the `Наим.` column

These values are stored in browser `localStorage`.

## Deployment

The project is deployed to Vercel from GitHub:

```text
https://github.com/leofamold-art/depozittm.git
```

Push changes to `main`; Vercel should deploy automatically.

Important: `vercel.json` includes static files needed by the serverless deployment. If new static assets are added, include them in `includeFiles`.
