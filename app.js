// Defaults
var DEFAULTS = {
    spreadsheetId: '1R20qaopx4sKJtw_Fg5zPKQzrav2PUntshn5kHF4rQiY',
    sheetName: 'dashport',
    settingsSheetName: 'Настройки',
    refreshInterval: 60
};

function getConfig() {
    return {
        spreadsheetId: localStorage.getItem('dash_sheetId') || DEFAULTS.spreadsheetId,
        sheetName: localStorage.getItem('dash_sheetName') || DEFAULTS.sheetName,
        settingsSheetName: localStorage.getItem('dash_settingsSheetName') || DEFAULTS.settingsSheetName,
        refreshInterval: parseInt(localStorage.getItem('dash_refresh')) || DEFAULTS.refreshInterval,
        showProductsColumn: localStorage.getItem('dash_showProducts') !== 'false' // default to true
    };
}

var countdownValue = getConfig().refreshInterval;
var countdownTimer = null;

// Settings modal
function openSettings() {
    var cfg = getConfig();
    document.getElementById('refresh-input').value = cfg.refreshInterval;
    document.getElementById('sheet-input').value = cfg.spreadsheetId;
    document.getElementById('dashboard-sheet-input').value = cfg.sheetName;
    document.getElementById('settings-sheet-input').value = cfg.settingsSheetName;
    document.getElementById('show-products-input').checked = cfg.showProductsColumn;
    document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
    var refresh = parseInt(document.getElementById('refresh-input').value) || 60;
    var sheetId = document.getElementById('sheet-input').value.trim();
    var dashboardSheet = document.getElementById('dashboard-sheet-input').value.trim() || DEFAULTS.sheetName;
    var settingsSheet = document.getElementById('settings-sheet-input').value.trim() || DEFAULTS.settingsSheetName;
    var showProducts = document.getElementById('show-products-input').checked;

    localStorage.setItem('dash_refresh', Math.max(10, refresh));
    if (sheetId) localStorage.setItem('dash_sheetId', sheetId);
    localStorage.setItem('dash_sheetName', dashboardSheet);
    localStorage.setItem('dash_settingsSheetName', settingsSheet);
    localStorage.setItem('dash_showProducts', showProducts);

    closeSettings();
    // Restart with new settings
    countdownValue = getConfig().refreshInterval;
    startCountdown();
    fetchData();
}

// Make functions global for onclick
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;

function getSheetURL(sheetName, query, range) {
    var cfg = getConfig();
    var url = 'https://docs.google.com/spreadsheets/d/' + cfg.spreadsheetId + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetName);
    if (range) url += '&range=' + encodeURIComponent(range) + '&headers=0';
    if (query) url += '&tq=' + encodeURIComponent(query);
    return url;
}

function parseGvizResponse(text) {
    var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?/);
    if (!jsonStr || !jsonStr[1]) {
        throw new Error('Не удалось разобрать ответ Google Sheets');
    }

    var data = JSON.parse(jsonStr[1]);
    if (data.status === 'error') {
        var errorMsg = (data.errors && data.errors[0]) ? data.errors[0].detailed_message : 'Ошибка API';
        throw new Error(errorMsg);
    }

    return (data.table && data.table.rows) || [];
}

function fetchSheetRows(sheetName, query, range) {
    return fetch(getSheetURL(sheetName, query, range))
        .then(function(response) { return response.text(); })
        .then(parseGvizResponse);
}

// --- THEME SWITCH ----------------------------------------------------------
// Берём активную тему из листа "Настройки": ищем строку, где в колонке K
// стоит "Тема оформления" (или похожее), и читаем значение из колонки L.
// Падаем обратно в Вариант 1, если что-то пошло не так.
function fetchTheme() {
    var cfg = getConfig();
    return fetchSheetRows(cfg.settingsSheetName, 'SELECT K,L WHERE K IS NOT NULL OR L IS NOT NULL')
        .then(function(rows) {
            for (var i = 0; i < rows.length; i++) {
                var k = normalizeText(getCell(rows[i], 0)).toLowerCase();
                if (k.indexOf('тема') !== -1 || k.indexOf('оформ') !== -1) {
                    var v = normalizeText(getCell(rows[i], 1));
                    if (v) return v;
                }
            }
            for (var j = 0; j < rows.length; j++) {
                var v2 = normalizeText(getCell(rows[j], 1));
                if (v2) return v2;
            }
            return 'Вариант 1';
        })
        .catch(function() { return 'Вариант 1'; });
}

function themeFromName(name) {
    var n = (name || '').toString().toLowerCase().replace(/\s+/g, '');
    if (n.indexOf('вариант2') !== -1 || n.indexOf('variant2') !== -1 || n === '2') return 'theme-2';
    if (n.indexOf('вариант3') !== -1 || n.indexOf('variant3') !== -1 || n === '3') return 'theme-3';
    if (n.indexOf('вариант4') !== -1 || n.indexOf('variant4') !== -1 || n === '4') return 'theme-4';
    return 'theme-1';
}

var currentTheme = null;

function applyTheme(theme) {
    if (currentTheme === theme) return false;
    var body = document.body;
    body.classList.remove('theme-1', 'theme-2', 'theme-3');
    body.classList.add(theme);
    currentTheme = theme;
    return true;
}

function rebuildMainForTheme(theme) {
    var main = document.querySelector('main');
    if (!main) return;
    if (theme === 'theme-1') {
        main.innerHTML =
            '<div class="column"><h2>СБОРЩИКИ</h2>' +
              '<table id="table-collectors"><thead><tr>' +
                '<th class="rank">#</th><th class="name-col">Имя</th>' +
                '<th>Заявки (П/Ф)</th><th>Ошибки</th>' +
                '<th class="bar-col">Вып. (Заявки)</th>' +
                '<th>Кол-во (П/Ф)</th>' +
                '<th class="bar-col">Вып. (Кол-во)</th>' +
                '<th>Наим.</th>' +
              '</tr></thead><tbody></tbody></table>' +
            '</div>' +
            '<div class="column"><h2>ВОДИТЕЛИ</h2>' +
              '<table id="table-drivers"><thead><tr>' +
                '<th class="rank">#</th><th class="name-col">Имя</th>' +
                '<th>Заявки (П/Ф)</th><th>Ошибки</th>' +
                '<th class="bar-col">Вып. (Заявки)</th>' +
                '<th>Кол-во (П/Ф)</th>' +
                '<th class="bar-col">Вып. (Кол-во)</th>' +
                '<th>Наим.</th>' +
              '</tr></thead><tbody></tbody></table>' +
            '</div>';
    } else if (theme === 'theme-2') {
        main.innerHTML =
            '<section class="t2-panel" id="t2-collectors">' +
              '<div class="t2-head"><span class="t2-ic">🧺</span><h2>СБОРЩИКИ</h2><span class="t2-count"></span></div>' +
              '<div class="t2-body"></div></section>' +
            '<section class="t2-panel" id="t2-drivers">' +
              '<div class="t2-head"><span class="t2-ic">🚚</span><h2>ВОДИТЕЛИ</h2><span class="t2-count"></span></div>' +
              '<div class="t2-body"></div></section>';
    } else if (theme === 'theme-3') {
        main.innerHTML =
            '<section class="t3-panel" id="t3-collectors">' +
              '<div class="t3-head"><span class="t3-ic">🧺</span><h2>СБОРЩИКИ</h2><span class="t3-count"></span></div>' +
              '<div class="t3-body"></div></section>' +
            '<section class="t3-panel" id="t3-drivers">' +
              '<div class="t3-head"><span class="t3-ic">🚚</span><h2>ВОДИТЕЛИ</h2><span class="t3-count"></span></div>' +
              '<div class="t3-body"></div></section>';
    } else if (theme === 'theme-4') {
        main.innerHTML =
            '<section class="t4-panel" id="t4-collectors">' +
              '<div class="t4-head"><span class="t4-ic">🧺</span><h2>СБОРЩИКИ</h2><span class="t4-count"></span></div>' +
              '<div class="t4-body"></div></section>' +
            '<section class="t4-panel" id="t4-drivers">' +
              '<div class="t4-head"><span class="t4-ic">🚚</span><h2>ВОДИТЕЛИ</h2><span class="t4-count"></span></div>' +
              '<div class="t4-body"></div></section>';
    }
}

function getQtyPct(p) {
    return p.planQty > 0 ? Math.round(p.factQty / p.planQty * 100) : 0;
}

function statusClass(pct) {
    if (pct >= 75) return 'ok';
    if (pct >= 50) return 'good';
    if (pct >= 30) return 'warn';
    return 'bad';
}

function initials(name) {
    return (name || '').split(/\s+/).map(function(w){ return (w && w[0]) || ''; }).slice(0, 2).join('').toUpperCase();
}

function normalizeText(value) {
    return (value === null || value === undefined) ? '' : value.toString().trim();
}

function normalizeKey(name, type) {
    return normalizeText(name).toLowerCase() + '|' + normalizeText(type).toLowerCase();
}

function isYes(value) {
    var text = normalizeText(value).toLowerCase();
    return text === 'да' || text === 'yes' || text === 'true' || text === '1';
}

function isNo(value) {
    var text = normalizeText(value).toLowerCase();
    return text === 'нет' || text === 'no' || text === 'false' || text === '0';
}

function getPersonKind(type) {
    var typeLower = normalizeText(type).toLowerCase();
    if (typeLower.indexOf('сборщик') !== -1 || typeLower.indexOf('сборка') !== -1 || typeLower.indexOf('collector') !== -1) {
        return 'collector';
    }
    return 'driver';
}

function getCell(row, index) {
    return row.c && row.c[index] && row.c[index].v !== null ? row.c[index].v : '';
}

function parseSettingsRows(rows) {
    var map = {};

    rows.forEach(function(row) {
        var name = normalizeText(getCell(row, 0));
        var type = normalizeText(getCell(row, 1));
        if (!name) return;

        var planOrders = parseFloat(getCell(row, 2));
        var planQty = parseFloat(getCell(row, 3));
        var assemblyErrorsValue = getCell(row, 7);
        var assemblyErrors = assemblyErrorsValue === '' ? null : parseFloat(assemblyErrorsValue);

        var settings = {
            planOrders: isNaN(planOrders) ? null : planOrders,
            planQty: isNaN(planQty) ? null : planQty,
            showDashboard: !isNo(getCell(row, 4)),
            hidePlan: isYes(getCell(row, 5)),
            showProducts: isYes(getCell(row, 6)),
            assemblyErrors: isNaN(assemblyErrors) ? null : assemblyErrors
        };

        map[normalizeText(name).toLowerCase()] = settings;
        if (type) {
            map[normalizeKey(name, type)] = settings;
        }
    });

    return map;
}

function buildPerson(row, settingsMap, hasSettingsSheet) {
    var name = normalizeText(getCell(row, 0));
    var type = normalizeText(getCell(row, 1));
    if (!name || !type) return null;

    var kind = getPersonKind(type);
    var key = normalizeKey(name, type);
    var settings = settingsMap[key] || settingsMap[normalizeText(name).toLowerCase()] || null;

    if (!settings) {
        return {
            name: name,
            type: type,
            key: key,
            missingSettings: true
        };
    }

    var factOrders = parseFloat(getCell(row, 2));
    var factQty = parseFloat(getCell(row, 3));

    var showDashboard = hasSettingsSheet
        ? settings.showDashboard
        : true;

    if (!showDashboard) return null;

    return {
        name: name,
        type: type,
        key: key,
        kind: kind,
        hasManualSettings: !!settings,
        planOrders: settings && settings.planOrders !== null ? settings.planOrders : 0,
        factOrders: factOrders || 0,
        planQty: settings && settings.planQty !== null ? settings.planQty : 0,
        factQty: factQty || 0,
        productCount: getCell(row, 4),
        assemblyErrors: settings && settings.assemblyErrors !== null ? settings.assemblyErrors : null,
        hidePlan: !!(settings && settings.hidePlan),
        showProducts: !!(settings && settings.showProducts)
    };
}

function fetchData() {
    var headerEl = document.querySelector('header');
    if (headerEl) headerEl.classList.add('updating');
    var cfg = getConfig();
    
    Promise.all([
        fetchSheetRows(cfg.sheetName, 'SELECT A,B,C,D,E WHERE A IS NOT NULL'),
        fetchSheetRows(cfg.settingsSheetName, 'SELECT A,B,C,D,E,F,G,H WHERE A IS NOT NULL')
            .then(function(rows) {
                return { rows: rows, available: true };
            })
            .catch(function(err) {
                console.warn('Settings sheet unavailable, using inline dashboard settings:', err);
                return { rows: [], available: false };
            }),
        fetchTheme()
    ])
        .then(function(results) {
            var rows = results[0];
            var settingsState = results[1];
            var themeName = results[2];
            var theme = themeFromName(themeName);

            if (applyTheme(theme)) rebuildMainForTheme(theme);

            var settingsMap = parseSettingsRows(settingsState.rows);
            var collectors = [];
            var drivers = [];
            var missingSettings = [];

            rows.forEach(function(row) {
                var person = buildPerson(row, settingsMap, settingsState.available);
                if (!person) return;

                if (person.missingSettings) {
                    missingSettings.push(person);
                    return;
                }

                if (person.kind === 'collector') {
                    collectors.push(person);
                } else {
                    drivers.push(person);
                }
            });

            if (theme === 'theme-2') {
                renderTheme2('t2-collectors', collectors);
                renderTheme2('t2-drivers', drivers);
            } else if (theme === 'theme-3') {
                renderTheme3('t3-collectors', collectors);
                renderTheme3('t3-drivers', drivers);
            } else if (theme === 'theme-4') {
                renderTheme4('t4-collectors', collectors);
                renderTheme4('t4-drivers', drivers);
            } else {
                renderTable('table-collectors', collectors);
                renderTable('table-drivers', drivers);
            }

            renderSettingsWarning(missingSettings);
            updateDate();
        })
        .catch(function(err) {
            console.error('Fetch error:', err);
            var errRow = '<tr class="error-row"><td colspan="8">Ошибка: ' + escapeHTML(err.message) + '</td></tr>';
            var collBody = document.querySelector('#table-collectors tbody');
            var drivBody = document.querySelector('#table-drivers tbody');
            if (collBody) collBody.innerHTML = errRow;
            if (drivBody) drivBody.innerHTML = errRow;
        })
        .finally(function() {
            if (headerEl) {
                setTimeout(function() {
                    headerEl.classList.remove('updating');
                }, 1000);
            }
        });
}

function renderSettingsWarning(people) {
    var el = document.getElementById('settings-warning');
    if (!el) return;

    if (!people.length) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }

    var names = people.map(function(person) {
        return escapeHTML(person.name) + ' (' + escapeHTML(person.type) + ')';
    }).join(', ');

    el.hidden = false;
    el.innerHTML = '<strong>Нужно добавить в лист "Настройки":</strong> ' + names;
}

function getPerformanceClass(pct) {
    if (pct >= 100) return 'excellent';
    if (pct >= 80) return 'good';
    if (pct >= 50) return 'warning';
    return 'danger';
}

function renderTable(tableId, people) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    var thead = document.querySelector('#' + tableId + ' thead');
    if (!tbody || !thead) return;

    var cfg = getConfig();
    var showProd = cfg.showProductsColumn;

    // Toggle column visibility in header
    var headers = thead.querySelectorAll('th');
    if (headers.length >= 8) {
        headers[7].style.display = showProd ? '' : 'none';
    }

    if (people.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="' + (showProd ? 8 : 7) + '">Нет данных</td></tr>';
        return;
    }

    // Sort by average of order% and qty% performance
    function getAvgPct(p) {
        var orderPct = p.planOrders > 0 ? (p.factOrders / p.planOrders) * 100 : 0;
        var qtyPct = p.planQty > 0 ? (p.factQty / p.planQty) * 100 : 0;
        var count = (p.planOrders > 0 ? 1 : 0) + (p.planQty > 0 ? 1 : 0);
        return count > 0 ? (orderPct + qtyPct) / count : 0;
    }
    people.sort(function(a, b) { return getAvgPct(b) - getAvgPct(a); });

    var rowsHtml = people.map(function(p, i) {
        var hasPlanOrders = p.planOrders > 0;
        var hasPlanQty = p.planQty > 0;
        
        // Расчет выполнения: Факт / План * 100
        var orderPct = hasPlanOrders ? Math.round((p.factOrders / p.planOrders) * 100) : null;
        var qtyPct = hasPlanQty ? Math.round((p.factQty / p.planQty) * 100) : null;

        var rankClass = i < 3 ? ' rank-' + (i + 1) : '';
        var rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);

        var orderDisplay = (hasPlanOrders && !p.hidePlan)
            ? '<span class="perf-' + getPerformanceClass(orderPct) + '">' + formatNumber(p.planOrders) + '/<strong>' + formatNumber(p.factOrders) + '</strong></span>'
            : '<strong>' + formatNumber(p.factOrders) + '</strong>';
        
        var qtyDisplay = (hasPlanQty && !p.hidePlan)
            ? '<span class="perf-' + getPerformanceClass(qtyPct) + '">' + formatNumber(p.planQty) + '/<strong>' + formatNumber(p.factQty) + '</strong></span>'
            : '<strong>' + formatNumber(p.factQty) + '</strong>';
        
        var prodDisplay = (p.showProducts && p.productCount !== '') ? formatNumber(Number(p.productCount)) : '—';

        // Визуализация прогресс-бара для заявок
        var orderBarHTML = '';
        if (hasPlanOrders) {
            var cls = getPerformanceClass(orderPct);
            var fillWidth = Math.min(orderPct, 100);
            orderBarHTML = 
                '<div class="mini-bar">' +
                    '<div class="mini-bar-bg">' +
                        '<div class="mini-bar-fill bar-' + cls + '" style="width:' + fillWidth + '%"></div>' +
                    '</div>' +
                    '<span class="mini-bar-label perf-' + cls + '">' + orderPct + '%</span>' +
                '</div>';
        } else {
            orderBarHTML = '<span style="color:#546e7a">—</span>';
        }

        // Визуализация прогресс-бара для количества
        var qtyBarHTML = '';
        if (hasPlanQty) {
            var cls = getPerformanceClass(qtyPct);
            var fillWidth = Math.min(qtyPct, 100);
            qtyBarHTML = 
                '<div class="mini-bar">' +
                    '<div class="mini-bar-bg">' +
                        '<div class="mini-bar-fill bar-' + cls + '" style="width:' + fillWidth + '%"></div>' +
                    '</div>' +
                    '<span class="mini-bar-label perf-' + cls + '">' + qtyPct + '%</span>' +
                '</div>';
        } else {
            qtyBarHTML = '<span style="color:#546e7a">—</span>';
        }

        var errDisplay = (p.assemblyErrors !== null && !isNaN(p.assemblyErrors))
            ? '<span class="' + (p.assemblyErrors > 0 ? 'perf-danger' : 'perf-excellent') + '"><strong>' + formatNumber(p.assemblyErrors) + '</strong></span>'
            : '—';

        var row = '<tr>' +
            '<td class="rank' + rankClass + '">' + rankIcon + '</td>' +
            '<td class="name-cell">' + escapeHTML(p.name) + '</td>' +
            '<td class="num">' + orderDisplay + '</td>' +
            '<td class="num">' + errDisplay + '</td>' +
            '<td>' + orderBarHTML + '</td>' +
            '<td class="num">' + qtyDisplay + '</td>' +
            '<td>' + qtyBarHTML + '</td>';
        
        if (showProd) {
            row += '<td class="num">' + prodDisplay + '</td>';
        }
        
        row += '</tr>';
        return row;
    });

    tbody.innerHTML = rowsHtml.join('');
}

// --- THEME 2: тёмный пьедестал --------------------------------------------
function renderTheme2(panelId, people) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var body = panel.querySelector('.t2-body');
    var count = panel.querySelector('.t2-count');
    if (!body) return;

    if (!people.length) {
        body.innerHTML = '<div class="t2-empty">Нет данных</div>';
        if (count) count.textContent = '';
        return;
    }

    people = people.slice();
    people.forEach(function(p){ p._pct = getQtyPct(p); p._st = statusClass(p._pct); });
    people.sort(function(a, b){ return b._pct - a._pct; });
    if (count) count.textContent = people.length + ' чел.';

    var top = people.slice(0, 3);
    var rest = people.slice(3);

    function podium(p, rank) {
        var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
        var crown = rank === 1 ? '<span class="t2-crown">👑</span>' : '';
        return '<div class="t2-pod t2-p' + rank + '">' + crown +
            '<div class="t2-medal">' + medal + '</div>' +
            '<div class="t2-ava">' + escapeHTML(initials(p.name)) + '</div>' +
            '<div class="t2-nm">' + escapeHTML(p.name) + '</div>' +
            '<div class="t2-big t2-c-' + p._st + '">' + p._pct + '%</div>' +
            '<div class="t2-small">' + formatNumber(p.factQty) + ' / ' + formatNumber(p.planQty) + '</div>' +
        '</div>';
    }

    function listRow(p, rank) {
        var w = Math.min(p._pct, 100);
        return '<div class="t2-row t2-s-' + p._st + '">' +
            '<div class="t2-rk">' + rank + '</div>' +
            '<div class="t2-mid">' +
                '<div class="t2-name">' + escapeHTML(p.name) + '</div>' +
                '<div class="t2-bar"><div class="t2-fill t2-f-' + p._st + '" style="width:' + w + '%"></div></div>' +
                '<div class="t2-meta">' +
                    '<span>Кол-во <b>' + formatNumber(p.factQty) + '</b>/' + formatNumber(p.planQty) + '</span>' +
                    '<span>Заявки <b>' + formatNumber(p.factOrders) + '</b>/' + formatNumber(p.planOrders) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="t2-pct t2-c-' + p._st + '">' + p._pct + '%<small>ВЫПОЛНЕНО</small></div>' +
        '</div>';
    }

    var podHtml = '';
    if (top[1]) podHtml += podium(top[1], 2);
    if (top[0]) podHtml += podium(top[0], 1);
    if (top[2]) podHtml += podium(top[2], 3);
    var restHtml = rest.map(function(p, i){ return listRow(p, i + 4); }).join('');

    body.innerHTML = '<div class="t2-podium">' + podHtml + '</div>' +
                     '<div class="t2-list">' + restHtml + '</div>';
}

// --- THEME 3: светлый лидер-баннер ----------------------------------------
function renderTheme3(panelId, people) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var body = panel.querySelector('.t3-body');
    var count = panel.querySelector('.t3-count');
    if (!body) return;

    if (!people.length) {
        body.innerHTML = '<div class="t3-empty">Нет данных</div>';
        if (count) count.textContent = '';
        return;
    }

    people = people.slice();
    people.forEach(function(p){ p._pct = getQtyPct(p); p._st = statusClass(p._pct); });
    people.sort(function(a, b){ return b._pct - a._pct; });
    if (count) count.textContent = people.length + ' чел.';

    var lead = people[0];
    var rest = people.slice(1);

    var hero = '<div class="t3-hero"><span class="t3-crown">👑</span>' +
        '<div class="t3-ava">' + escapeHTML(initials(lead.name)) + '</div>' +
        '<div class="t3-info">' +
            '<div class="t3-label">ЛИДЕР · 1 МЕСТО</div>' +
            '<div class="t3-name">' + escapeHTML(lead.name) + '</div>' +
            '<div class="t3-sub">Кол-во ' + formatNumber(lead.factQty) + ' / ' + formatNumber(lead.planQty) +
                ' · Заявки ' + formatNumber(lead.factOrders) + '/' + formatNumber(lead.planOrders) + '</div>' +
        '</div>' +
        '<div class="t3-pct">' + lead._pct + '%</div></div>';

    var restHtml = rest.map(function(p, i) {
        var rank = i + 2;
        var w = Math.min(p._pct, 100);
        return '<div class="t3-row">' +
            '<div class="t3-fillbg t3-b-' + p._st + '" style="width:' + w + '%"></div>' +
            '<div class="t3-rk">' + rank + '</div>' +
            '<div class="t3-rava t3-b-' + p._st + '">' + escapeHTML(initials(p.name)) + '</div>' +
            '<div class="t3-nm">' + escapeHTML(p.name) + '</div>' +
            '<div class="t3-sub">Кол-во <b>' + formatNumber(p.factQty) + '</b> · Заявки <b>' + formatNumber(p.factOrders) + '</b></div>' +
            '<div class="t3-rpct t3-t-' + p._st + '">' + p._pct + '%</div>' +
        '</div>';
    }).join('');

    body.innerHTML = hero + '<div class="t3-list">' + restHtml + '</div>';
}

// --- THEME 4: неоновые кольца прогресса -----------------------------------
function renderTheme4(panelId, people) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var body = panel.querySelector('.t4-body');
    var count = panel.querySelector('.t4-count');
    if (!body) return;

    if (!people.length) {
        body.innerHTML = '<div class="t4-empty">Нет данных</div>';
        if (count) count.textContent = '';
        return;
    }

    people = people.slice();
    people.forEach(function(p){ p._pct = getQtyPct(p); p._st = statusClass(p._pct); });
    people.sort(function(a, b){ return b._pct - a._pct; });
    if (count) count.textContent = people.length + ' чел.';

    var CIRC = 2 * Math.PI * 44; // r=44 in viewBox 100x100

    function tile(p, rank) {
        var capped = Math.min(p._pct, 100);
        var offset = (CIRC * (1 - capped / 100)).toFixed(2);
        var leaderCls = rank === 1 ? ' t4-leader' : '';
        var medal = rank === 1 ? '<span class="t4-medal">🥇</span>'
                  : rank === 2 ? '<span class="t4-medal">🥈</span>'
                  : rank === 3 ? '<span class="t4-medal">🥉</span>' : '';
        var ring =
            '<svg class="t4-ring" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">' +
                '<circle class="t4-ring-bg" cx="50" cy="50" r="44"></circle>' +
                '<circle class="t4-ring-fg t4-rs-' + p._st + '" cx="50" cy="50" r="44" ' +
                    'stroke-dasharray="' + CIRC.toFixed(2) + '" ' +
                    'stroke-dashoffset="' + offset + '"></circle>' +
            '</svg>';
        return '<div class="t4-tile' + leaderCls + '">' + medal +
            '<div class="t4-rank">#' + rank + '</div>' +
            '<div class="t4-ring-wrap">' + ring +
                '<div class="t4-center">' +
                    '<div class="t4-init">' + escapeHTML(initials(p.name)) + '</div>' +
                    '<div class="t4-pct t4-c-' + p._st + '">' + p._pct + '<small>%</small></div>' +
                '</div>' +
            '</div>' +
            '<div class="t4-name">' + escapeHTML(p.name) + '</div>' +
            '<div class="t4-meta">' + formatNumber(p.factQty) + ' / ' + formatNumber(p.planQty) + '</div>' +
        '</div>';
    }

    body.innerHTML = '<div class="t4-grid">' +
        people.map(function(p, i){ return tile(p, i + 1); }).join('') +
    '</div>';
}

function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatNumber(num) {
    if (isNaN(num)) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function updateDate() {
    var now = new Date();
    var options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    var el = document.getElementById('current-date');
    if (el) el.textContent = now.toLocaleDateString('ru-RU', options);
}

function startCountdown() {
    var cfg = getConfig();
    countdownValue = cfg.refreshInterval;
    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(function() {
        countdownValue--;
        var el = document.getElementById('countdown');
        if (el) el.textContent = countdownValue;
        if (countdownValue <= 0) {
            fetchData();
            updateDate();
            countdownValue = cfg.refreshInterval;
        }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', function() {
    var collBody = document.querySelector('#table-collectors tbody');
    var drivBody = document.querySelector('#table-drivers tbody');
    if (collBody) collBody.innerHTML = '<tr class="loading-row"><td colspan="8">Загрузка...</td></tr>';
    if (drivBody) drivBody.innerHTML = '<tr class="loading-row"><td colspan="8">Загрузка...</td></tr>';
    updateDate();
    fetchData();
    startCountdown();
});
