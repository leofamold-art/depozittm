// Defaults
var DEFAULTS = {
    spreadsheetId: '1R20qaopx4sKJtw_Fg5zPKQzrav2PUntshn5kHF4rQiY',
    sheetName: 'dashport',
    refreshInterval: 60
};

function getConfig() {
    return {
        spreadsheetId: localStorage.getItem('dash_sheetId') || DEFAULTS.spreadsheetId,
        sheetName: localStorage.getItem('dash_sheetName') || DEFAULTS.sheetName,
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
    document.getElementById('show-products-input').checked = cfg.showProductsColumn;
    document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
    var refresh = parseInt(document.getElementById('refresh-input').value) || 60;
    var sheetId = document.getElementById('sheet-input').value.trim();
    var showProducts = document.getElementById('show-products-input').checked;

    localStorage.setItem('dash_refresh', Math.max(10, refresh));
    if (sheetId) localStorage.setItem('dash_sheetId', sheetId);
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

function getSheetURL() {
    var cfg = getConfig();
    var query = encodeURIComponent('SELECT A,B,C,D,E,F,G,H,I,J,K WHERE A IS NOT NULL');
    return 'https://docs.google.com/spreadsheets/d/' + cfg.spreadsheetId + '/gviz/tq?tqx=out:json&sheet=' + cfg.sheetName + '&tq=' + query;
}

function fetchData() {
    var headerEl = document.querySelector('header');
    if (headerEl) headerEl.classList.add('updating');
    
    fetch(getSheetURL())
        .then(function(response) { return response.text(); })
        .then(function(text) {
            var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?/);
            if (!jsonStr || !jsonStr[1]) {
                throw new Error('Не удалось разобрать ответ Google Sheets');
            }

            var data = JSON.parse(jsonStr[1]);
            if (data.status === 'error') {
                var errorMsg = (data.errors && data.errors[0]) ? data.errors[0].detailed_message : 'Ошибка API';
                throw new Error(errorMsg);
            }

            var rows = (data.table && data.table.rows) || [];
            var collectors = [];
            var drivers = [];

            rows.forEach(function(row) {
                var cells = row.c;
                if (!cells || !cells[0]) return;

                var name = (cells[0] && cells[0].v !== null) ? cells[0].v : '';
                var type = (cells[1] && cells[1].v !== null) ? cells[1].v.toString().trim() : '';
                var typeLower = type.toLowerCase();
                var planOrders = (cells[2] && cells[2].v !== null) ? parseFloat(cells[2].v) : 0;
                var factOrders = (cells[3] && cells[3].v !== null) ? parseFloat(cells[3].v) : 0;
                var planQty = (cells[4] && cells[4].v !== null) ? parseFloat(cells[4].v) : 0;
                var factQty = (cells[5] && cells[5].v !== null) ? parseFloat(cells[5].v) : 0;
                var productCount = (cells[6] && cells[6].v !== null) ? cells[6].v : '';
                var status = (cells[7] && cells[7].v !== null) ? cells[7].v.toString().toLowerCase().trim() : '';
                var hidePlan = (cells[8] && cells[8].v !== null) ? cells[8].v.toString().toLowerCase().trim() : '';
                var showProductsSetting = (cells[9] && cells[9].v !== null) ? cells[9].v.toString().toLowerCase().trim() : '';
                var assemblyErrors = (cells[10] && cells[10].v !== null) ? parseFloat(cells[10].v) : null;

                if (status === 'нет' || status === 'no' || status === 'false' || status === '0') {
                    return;
                }

                var person = { 
                    name: name, 
                    type: type, 
                    planOrders: planOrders || 0, 
                    factOrders: factOrders || 0, 
                    planQty: planQty || 0, 
                    factQty: factQty || 0, 
                    productCount: productCount,
                    assemblyErrors: assemblyErrors,
                    hidePlan: (hidePlan === 'да' || hidePlan === 'yes' || hidePlan === 'true' || hidePlan === '1'),
                    showProducts: (showProductsSetting === 'да' || showProductsSetting === 'yes' || showProductsSetting === 'true' || showProductsSetting === '1')
                };

                if (typeLower.indexOf('сборщик') !== -1 || typeLower.indexOf('сборка') !== -1 || typeLower.indexOf('collector') !== -1) {
                    collectors.push(person);
                } else {
                    // Все остальные (водители и т.д.)
                    drivers.push(person);
                }
            });

            renderTable('table-collectors', collectors);
            renderTable('table-drivers', drivers);
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
