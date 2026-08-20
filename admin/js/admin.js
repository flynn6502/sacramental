(function () {
    const data = window.ADMIN_CHARTS || {};
    const navy = '#002D5B';
    const gold = '#C4A35A';

    function make(id, cfg) {
        const el = document.getElementById(id);
        if (!el || !window.Chart) return;
        new Chart(el, cfg);
    }

    make('dailyChart', {
        type: 'line',
        data: {
            labels: (data.daily && data.daily.labels) || [],
            datasets: [{ label: 'Acessos', data: (data.daily && data.daily.values) || [], borderColor: navy, tension: 0.3, fill: false }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });

    make('hourlyChart', {
        type: 'bar',
        data: {
            labels: (data.hourly && data.hourly.labels) || [],
            datasets: [{ label: 'Acessos', data: (data.hourly && data.hourly.values) || [], backgroundColor: gold }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });

    make('hymnChart', {
        type: 'bar',
        data: {
            labels: (data.hymns && data.hymns.labels) || [],
            datasets: [{ label: 'Vezes', data: (data.hymns && data.hymns.values) || [], backgroundColor: navy }],
        },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
    });

    make('topicChart', {
        type: 'bar',
        data: {
            labels: (data.topics && data.topics.labels) || [],
            datasets: [{ label: 'Vezes', data: (data.topics && data.topics.values) || [], backgroundColor: gold }],
        },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
    });
})();
