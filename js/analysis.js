/* ===================================
   FiskeLOGG — Analysis & Charts Module
   =================================== */

(function () {
    'use strict';

    const chartInstances = {};
    const CHART_COLORS = [
        '#2980b9', '#27ae60', '#e74c3c', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#3498db', '#2ecc71', '#e74c3c',
        '#f1c40f', '#8e44ad', '#16a085', '#d35400', '#2c3e50'
    ];

    window.loadAnalysis = async function () {
        const sessions = await storage.getAllSessions();
        const catches = await storage.getAllCatches();

        // Filter by period
        const period = document.getElementById('analysis-period').value;
        const { filteredSessions, filteredCatches } = filterByPeriod(sessions, catches, period);

        renderSpeciesChart(filteredCatches);
        renderMethodsChart(filteredCatches);
        renderTimelineChart(filteredSessions, catches);
        renderHourlyChart(filteredCatches);
        renderWeatherChart(filteredSessions, catches);
        renderWaterTempChart(filteredSessions, catches);
        renderBaitsChart(filteredCatches);
        renderLocationsChart(filteredSessions, catches);
        renderAnglersChart(filteredCatches);
        renderInsights(filteredSessions, filteredCatches);
    };

    // Period filter setup
    document.getElementById('analysis-period').addEventListener('change', loadAnalysis);

    function filterByPeriod(sessions, catches, period) {
        if (period === 'all') return { filteredSessions: sessions, filteredCatches: catches };

        const now = new Date();
        let cutoff;
        if (period === 'year') cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        else if (period === '6months') cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        else if (period === 'month') cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

        const cutoffStr = cutoff.toISOString().split('T')[0];
        const filteredSessions = sessions.filter(s => s.date >= cutoffStr);
        const sessionIds = new Set(filteredSessions.map(s => s.id));
        const filteredCatches = catches.filter(c => sessionIds.has(c.sessionId));

        return { filteredSessions, filteredCatches };
    }

    // ============== CHARTS ==============

    function renderSpeciesChart(catches) {
        const counts = countBy(catches, 'species');
        const labels = Object.keys(counts).slice(0, 10);
        const data = labels.map(l => counts[l]);

        renderChart('chart-species', 'doughnut', {
            labels,
            datasets: [{
                data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
            }]
        }, { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } });
    }

    function renderMethodsChart(catches) {
        const counts = countBy(catches, 'method');
        const labels = Object.keys(counts).map(m => window.FiskeApp.getMethodLabel(m));
        const data = Object.values(counts);

        renderChart('chart-methods', 'bar', {
            labels,
            datasets: [{
                label: 'Antal',
                data,
                backgroundColor: CHART_COLORS[0],
                borderRadius: 6,
            }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        });
    }

    function renderTimelineChart(sessions, allCatches) {
        // Group catches by month
        const monthly = {};
        sessions.forEach(s => {
            const month = s.date.substring(0, 7); // YYYY-MM
            if (!monthly[month]) monthly[month] = { sessions: 0, catches: 0 };
            monthly[month].sessions++;
            monthly[month].catches += allCatches.filter(c => c.sessionId === s.id).length;
        });

        const labels = Object.keys(monthly).sort();
        const catchData = labels.map(l => monthly[l].catches);
        const sessionData = labels.map(l => monthly[l].sessions);

        renderChart('chart-timeline', 'line', {
            labels: labels.map(l => formatMonth(l)),
            datasets: [
                {
                    label: 'Fångster',
                    data: catchData,
                    borderColor: CHART_COLORS[0],
                    backgroundColor: CHART_COLORS[0] + '30',
                    fill: true,
                    tension: 0.3,
                },
                {
                    label: 'Fiskepass',
                    data: sessionData,
                    borderColor: CHART_COLORS[1],
                    backgroundColor: CHART_COLORS[1] + '30',
                    fill: true,
                    tension: 0.3,
                }
            ]
        }, {
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        });
    }

    function renderHourlyChart(catches) {
        const hourCounts = new Array(24).fill(0);
        catches.forEach(c => {
            if (c.time) {
                const hour = parseInt(c.time.split(':')[0]);
                if (!isNaN(hour)) hourCounts[hour]++;
            }
        });

        // Only show hours with data (typically 04-23)
        const startHour = hourCounts.findIndex(v => v > 0);
        const endHour = hourCounts.length - 1 - [...hourCounts].reverse().findIndex(v => v > 0);

        if (startHour === -1) {
            renderChart('chart-hourly', 'bar', { labels: ['Ingen data'], datasets: [{ data: [0] }] }, {});
            return;
        }

        const labels = [];
        const data = [];
        for (let h = Math.max(0, startHour); h <= Math.min(23, endHour); h++) {
            labels.push(`${h.toString().padStart(2, '0')}:00`);
            data.push(hourCounts[h]);
        }

        renderChart('chart-hourly', 'bar', {
            labels,
            datasets: [{
                label: 'Fångster',
                data,
                backgroundColor: CHART_COLORS[3],
                borderRadius: 4,
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        });
    }

    function renderWeatherChart(sessions, allCatches) {
        const weatherStats = {};
        sessions.forEach(s => {
            if (!s.weather) return;
            if (!weatherStats[s.weather]) weatherStats[s.weather] = { sessions: 0, catches: 0 };
            weatherStats[s.weather].sessions++;
            weatherStats[s.weather].catches += allCatches.filter(c => c.sessionId === s.id).length;
        });

        const labels = Object.keys(weatherStats);
        const avgCatches = labels.map(w => {
            const stat = weatherStats[w];
            return stat.sessions > 0 ? (stat.catches / stat.sessions).toFixed(1) : 0;
        });

        renderChart('chart-weather', 'bar', {
            labels: labels.map(w => `${window.FiskeApp.getWeatherEmoji(w)} ${window.FiskeApp.getWeatherLabel(w)}`),
            datasets: [{
                label: 'Snitt fångster/pass',
                data: avgCatches,
                backgroundColor: CHART_COLORS[4],
                borderRadius: 6,
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        });
    }

    function renderWaterTempChart(sessions, allCatches) {
        const tempData = [];
        sessions.forEach(s => {
            if (s.waterTemp == null) return;
            const catchCount = allCatches.filter(c => c.sessionId === s.id).length;
            tempData.push({ x: s.waterTemp, y: catchCount });
        });

        if (tempData.length === 0) {
            renderChart('chart-watertemp', 'scatter', { datasets: [{ data: [] }] }, {});
            return;
        }

        renderChart('chart-watertemp', 'scatter', {
            datasets: [{
                label: 'Fångster vs vattentemp',
                data: tempData,
                backgroundColor: CHART_COLORS[5],
                pointRadius: 6,
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: {
                x: { title: { display: true, text: 'Vattentemp (°C)' } },
                y: { title: { display: true, text: 'Antal fångster' }, beginAtZero: true, ticks: { stepSize: 1 } }
            }
        });
    }

    function renderBaitsChart(catches) {
        const counts = countBy(catches, 'baitType');
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const labels = sorted.map(s => window.FiskeApp.getBaitTypeLabel(s[0]));
        const data = sorted.map(s => s[1]);

        renderChart('chart-baits', 'bar', {
            labels,
            datasets: [{
                label: 'Antal',
                data,
                backgroundColor: CHART_COLORS[6],
                borderRadius: 6,
            }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        });
    }

    function renderLocationsChart(sessions, allCatches) {
        const locationStats = {};
        sessions.forEach(s => {
            if (!s.location) return;
            if (!locationStats[s.location]) locationStats[s.location] = { sessions: 0, catches: 0 };
            locationStats[s.location].sessions++;
            locationStats[s.location].catches += allCatches.filter(c => c.sessionId === s.id).length;
        });

        const sorted = Object.entries(locationStats).sort((a, b) => b[1].catches - a[1].catches).slice(0, 8);
        const labels = sorted.map(s => s[0]);
        const data = sorted.map(s => s[1].catches);

        renderChart('chart-locations', 'bar', {
            labels,
            datasets: [{
                label: 'Fångster',
                data,
                backgroundColor: CHART_COLORS[1],
                borderRadius: 6,
            }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        });
    }

    function renderAnglersChart(catches) {
        const counts = countBy(catches, 'angler');
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const labels = sorted.map(s => s[0]);
        const data = sorted.map(s => s[1]);

        renderChart('chart-anglers', 'doughnut', {
            labels,
            datasets: [{
                data,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
            }]
        }, { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } });
    }

    // ============== INSIGHTS ==============

    function renderInsights(sessions, catches) {
        const container = document.getElementById('insights-content');

        if (catches.length === 0) {
            container.innerHTML = '<p class="empty-state">Logga fler fiskepass för att få insikter!</p>';
            return;
        }

        const insights = [];

        // Best species
        const speciesCounts = countBy(catches, 'species');
        const topSpecies = Object.entries(speciesCounts).sort((a, b) => b[1] - a[1])[0];
        if (topSpecies) {
            insights.push(`<strong>Vanligast fångad art:</strong> ${topSpecies[0]} (${topSpecies[1]} st)`);
        }

        // Best method
        const methodCounts = countBy(catches, 'method');
        const topMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0];
        if (topMethod) {
            insights.push(`<strong>Mest produktiva metod:</strong> ${window.FiskeApp.getMethodLabel(topMethod[0])} (${topMethod[1]} fångster)`);
        }

        // Best bait type
        const baitTypeCounts = countBy(catches, 'baitType');
        const topBaitType = Object.entries(baitTypeCounts).sort((a, b) => b[1] - a[1])[0];
        if (topBaitType) {
            insights.push(`<strong>Bästa betestyp:</strong> ${window.FiskeApp.getBaitTypeLabel(topBaitType[0])} (${topBaitType[1]} fångster)`);
        }

        // Best specific bait
        const baitCounts = countBy(catches, 'bait');
        const topBait = Object.entries(baitCounts).sort((a, b) => b[1] - a[1])[0];
        if (topBait) {
            insights.push(`<strong>Bästa bete:</strong> ${topBait[0]} (${topBait[1]} fångster)`);
        }

        // Top angler
        const anglerCounts = countBy(catches, 'angler');
        const topAngler = Object.entries(anglerCounts).sort((a, b) => b[1] - a[1])[0];
        if (topAngler) {
            insights.push(`<strong>Flest fångster:</strong> ${topAngler[0]} (${topAngler[1]} st)`);
        }

        // Best time
        const hourCounts = {};
        catches.forEach(c => {
            if (c.time) {
                const hour = parseInt(c.time.split(':')[0]);
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            }
        });
        const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
        if (topHour) {
            insights.push(`<strong>Bästa tid på dygnet:</strong> ${topHour[0].toString().padStart(2, '0')}:00 (${topHour[1]} fångster)`);
        }

        // Weather correlation
        const weatherEfficiency = {};
        sessions.forEach(s => {
            if (!s.weather) return;
            if (!weatherEfficiency[s.weather]) weatherEfficiency[s.weather] = { sessions: 0, catches: 0 };
            weatherEfficiency[s.weather].sessions++;
            weatherEfficiency[s.weather].catches += catches.filter(c => c.sessionId === s.id).length;
        });
        const bestWeather = Object.entries(weatherEfficiency)
            .map(([w, d]) => ({ weather: w, avg: d.catches / d.sessions }))
            .sort((a, b) => b.avg - a.avg)[0];
        if (bestWeather && bestWeather.avg > 0) {
            insights.push(`<strong>Bäst väder:</strong> ${window.FiskeApp.getWeatherEmoji(bestWeather.weather)} ${window.FiskeApp.getWeatherLabel(bestWeather.weather)} (snitt ${bestWeather.avg.toFixed(1)} fångster/pass)`);
        }

        // Water temp sweet spot
        const tempCatches = [];
        sessions.forEach(s => {
            if (s.waterTemp == null) return;
            const count = catches.filter(c => c.sessionId === s.id).length;
            if (count > 0) tempCatches.push({ temp: s.waterTemp, count });
        });
        if (tempCatches.length >= 3) {
            tempCatches.sort((a, b) => b.count - a.count);
            const bestTemps = tempCatches.slice(0, 3);
            const avgTemp = bestTemps.reduce((sum, t) => sum + t.temp, 0) / bestTemps.length;
            insights.push(`<strong>Optimal vattentemp:</strong> ca ${avgTemp.toFixed(1)}°C (baserat på dina bästa pass)`);
        }

        // Catch & release ratio
        const released = catches.filter(c => c.released).length;
        if (catches.length > 0) {
            const ratio = ((released / catches.length) * 100).toFixed(0);
            insights.push(`<strong>Catch & release:</strong> ${ratio}% (${released} av ${catches.length})`);
        }

        // Average catches per session
        if (sessions.length > 0) {
            const avg = (catches.length / sessions.length).toFixed(1);
            insights.push(`<strong>Snitt fångster per pass:</strong> ${avg}`);
        }

        container.innerHTML = insights.map(i => `<div class="insight-item">${i}</div>`).join('');
    }

    // ============== CHART HELPER ==============

    function renderChart(canvasId, type, data, options) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Destroy existing
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { font: { size: 11 } } }
            },
        };

        chartInstances[canvasId] = new Chart(ctx, {
            type,
            data,
            options: deepMerge(defaultOptions, options),
        });
    }

    // ============== UTILITIES ==============

    function countBy(arr, key) {
        const counts = {};
        arr.forEach(item => {
            const val = item[key];
            if (val) counts[val] = (counts[val] || 0) + 1;
        });
        return counts;
    }

    function formatMonth(monthStr) {
        const [year, month] = monthStr.split('-');
        const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
        return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
    }

    function deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
})();
