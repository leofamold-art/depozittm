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

function getSheetURL(sheetName, query) {
    var cfg = getConfig();
    return 'https://docs.google.com/spreadsheets/d/' + cfg.spreadsheetId + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetName) + '&tq=' + encodeURIComponent(query);
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

function fetchSheetRows(sheetName, query) {
    return fetch(getSheetURL(sheetName, query))
        .then(function(response) { return response.text(); })
        .then(parseGvizResponse);
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
            })
    ])
        .then(function(results) {
            var rows = results[0];
            var settingsState = results[1];
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

            renderTable('table-collectors', collectors);
            renderTable('table-drivers', drivers);
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
