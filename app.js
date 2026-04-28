function updateDate() {
    var el = document.getElementById('current-date');
    if (!el) return;

    var now = new Date();
    var options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    el.textContent = 'Обновлено: ' + now.toLocaleDateString('ru-RU', options);
}

document.addEventListener('DOMContentLoaded', function() {
    updateDate();
});
