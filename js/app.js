/* ================================
   FiskeLOGG — Main Application Logic
   ================================ */

(function () {
    'use strict';

    // State
    let currentSessionId = null;
    let editingCatchId = null;
    let detailCatchMode = false;
    let sessionCatches = []; // temp catches for current session form
    let sessionAnglers = []; // anglers for current session

    // DOM refs
    const pages = document.querySelectorAll('.page');
    const navButtons = document.querySelectorAll('.nav-btn');

    // Init
    document.addEventListener('DOMContentLoaded', async () => {
        await storage.init();
        setupNavigation();
        setupSessionForm();
        setupCatchForm();
        setupDetailView();
        setupHistory();
        loadDashboard();
    });

    // ============== NAVIGATION ==============

    function setupNavigation() {
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                navigateTo(page);
            });
        });

        document.getElementById('btn-new-session').addEventListener('click', () => {
            openSessionForm(null);
        });
    }

    function navigateTo(pageId) {
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${pageId}`).classList.add('active');

        navButtons.forEach(b => b.classList.remove('active'));
        const activeNav = document.querySelector(`[data-page="${pageId}"]`);
        if (activeNav) activeNav.classList.add('active');

        if (pageId === 'dashboard') loadDashboard();
        if (pageId === 'history') loadHistory();
        if (pageId === 'analysis') loadAnalysis();
    }

    function showPage(pageId) {
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }

    // ============== DASHBOARD ==============

    async function loadDashboard() {
        const sessions = await storage.getAllSessions();
        const catches = await storage.getAllCatches();

        // Stats
        document.getElementById('stat-sessions').textContent = sessions.length;
        document.getElementById('stat-catches').textContent = catches.length;

        const maxWeight = catches.reduce((max, c) => Math.max(max, c.weight || 0), 0);
        document.getElementById('stat-biggest').textContent = maxWeight > 0 ? maxWeight.toFixed(2) : '0';

        const species = new Set(catches.map(c => c.species).filter(Boolean));
        document.getElementById('stat-species').textContent = species.size;

        // Recent sessions (top 5)
        const recentContainer = document.getElementById('recent-sessions');
        const sorted = sessions.sort((a, b) => b.date.localeCompare(a.date));
        const recent = sorted.slice(0, 5);

        if (recent.length === 0) {
            recentContainer.innerHTML = '<p class="empty-state">Inga fiskepass ännu. Tryck + för att börja!</p>';
            return;
        }

        let html = '';
        for (const session of recent) {
            const sessionCatches = catches.filter(c => c.sessionId === session.id);
            html += renderSessionCard(session, sessionCatches);
        }
        recentContainer.innerHTML = html;

        // Click handlers
        recentContainer.querySelectorAll('.session-card').forEach(card => {
            card.addEventListener('click', () => {
                openSessionDetail(card.dataset.id);
            });
        });
    }

    function renderSessionCard(session, catches) {
        const date = formatDate(session.date);
        const tags = [];
        if (session.weather) tags.push(getWeatherEmoji(session.weather));
        if (session.waterTemp) tags.push(`💧 ${session.waterTemp}°C`);
        if (session.airTemp) tags.push(`🌡️ ${session.airTemp}°C`);

        const tagsHtml = tags.map(t => `<span class="tag">${t}</span>`).join('');

        return `
            <div class="session-card" data-id="${session.id}">
                <div class="session-card-header">
                    <span class="session-card-date">${date}</span>
                    <span class="session-card-catches">${catches.length} fångst${catches.length !== 1 ? 'er' : ''}</span>
                </div>
                <div class="session-card-location">📍 ${escapeHtml(session.location || 'Okänd plats')}</div>
                ${tags.length ? `<div class="session-card-tags">${tagsHtml}</div>` : ''}
            </div>
        `;
    }

    // ============== SESSION FORM ==============

    function setupSessionForm() {
        document.getElementById('btn-back-session').addEventListener('click', () => {
            navigateTo('dashboard');
        });

        document.getElementById('btn-save-session').addEventListener('click', saveSession);

        document.getElementById('btn-get-gps').addEventListener('click', getGPS);

        // Toggle session form collapse
        document.getElementById('btn-toggle-session-form').addEventListener('click', () => {
            const formEl = document.getElementById('session-form');
            const isCollapsed = formEl.classList.contains('collapsed');
            if (isCollapsed) {
                expandSessionForm();
            } else {
                // Build session summary from current form values
                const date = document.getElementById('session-date').value;
                const loc = document.getElementById('session-location').value;
                collapseSessionForm({ date, location: loc });
            }
        });

        // Anglers
        document.getElementById('btn-add-angler').addEventListener('click', addAngler);
        document.getElementById('angler-name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addAngler(); }
        });

        document.getElementById('btn-add-catch').addEventListener('click', () => {
            editingCatchId = null;
            detailCatchMode = false;
            document.getElementById('catch-form-title').textContent = 'Ny fångst';
            document.getElementById('catch-form').reset();
            resetCatchFormDefaults();
            populateAnglerDropdown();
            document.getElementById('catch-modal').classList.add('open');
        });
    }

    function openSessionForm(sessionId, opts) {
        const editMode = opts && opts.edit;
        currentSessionId = sessionId;
        const form = document.getElementById('session-form');

        if (sessionId) {
            // Existing session
            document.getElementById('session-form-title').textContent = editMode ? 'Redigera fiskepass' : 'Fiskepass';
            storage.getSession(sessionId).then(async session => {
                if (!session) return;
                document.getElementById('session-date').value = session.date || '';
                document.getElementById('session-start').value = session.startTime || '';
                document.getElementById('session-end').value = session.endTime || '';
                document.getElementById('session-location').value = session.location || '';
                document.getElementById('session-lat').value = session.lat || '';
                document.getElementById('session-lng').value = session.lng || '';
                document.getElementById('session-weather').value = session.weather || '';
                document.getElementById('session-air-temp').value = session.airTemp || '';
                document.getElementById('session-water-temp').value = session.waterTemp || '';
                document.getElementById('session-wind-dir').value = session.windDirection || '';
                document.getElementById('session-wind-speed').value = session.windSpeed || '';
                document.getElementById('session-water-clarity').value = session.waterClarity || '';
                document.getElementById('session-pressure').value = session.pressure || '';

                document.getElementById('session-notes').value = session.notes || '';

                // Load anglers
                sessionAnglers = session.anglers || [];
                renderAnglers();

                if (session.lat && session.lng) {
                    document.getElementById('gps-status').textContent = `📍 ${session.lat}, ${session.lng}`;
                }

                sessionCatches = await storage.getCatchesBySession(sessionId);
                renderSessionCatches();

                // Edit mode → expanded, catch mode → collapsed
                if (editMode) {
                    expandSessionForm();
                } else {
                    collapseSessionForm(session);
                }
            });
        } else {
            // New session
            document.getElementById('session-form-title').textContent = 'Nytt fiskepass';
            form.reset();
            document.getElementById('session-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('session-start').value = new Date().toTimeString().slice(0, 5);
            document.getElementById('gps-status').textContent = '';
            sessionAnglers = ['Olle', 'Peter'];
            renderAnglers();
            sessionCatches = [];
            renderSessionCatches();
            // Expand session form for new sessions
            expandSessionForm();
        }

        showPage('page-session-form');
    }

    async function saveSession() {
        const form = document.getElementById('session-form');
        const date = document.getElementById('session-date').value;
        const location = document.getElementById('session-location').value.trim();

        if (!date || !location) {
            showToast('Fyll i datum och plats');
            return;
        }

        const session = {
            id: currentSessionId || null,
            date,
            startTime: document.getElementById('session-start').value || null,
            endTime: document.getElementById('session-end').value || null,
            location,
            lat: document.getElementById('session-lat').value || null,
            lng: document.getElementById('session-lng').value || null,
            weather: document.getElementById('session-weather').value || null,
            airTemp: parseFloatOrNull(document.getElementById('session-air-temp').value),
            waterTemp: parseFloatOrNull(document.getElementById('session-water-temp').value),
            windDirection: document.getElementById('session-wind-dir').value || null,
            windSpeed: parseFloatOrNull(document.getElementById('session-wind-speed').value),
            pressure: parseFloatOrNull(document.getElementById('session-pressure').value),
            waterClarity: document.getElementById('session-water-clarity').value || null,

            anglers: sessionAnglers,
            notes: document.getElementById('session-notes').value.trim() || null,
        };

        const saved = await storage.saveSession(session);
        currentSessionId = saved.id;

        // Save catches linked to this session
        for (const c of sessionCatches) {
            c.sessionId = saved.id;
            await storage.saveCatch(c);
        }

        showToast('Fiskepass sparat! ✓');
        
        // Collapse session form to focus on catch reporting
        collapseSessionForm(session);
    }

    function collapseSessionForm(session) {
        const formEl = document.getElementById('session-form');
        const toggle = document.getElementById('btn-toggle-session-form');
        const summary = document.getElementById('session-summary');
        const summaryText = document.getElementById('session-summary-text');

        formEl.classList.add('collapsed');
        if (toggle) toggle.textContent = 'Visa pass-info ▼';

        // Show summary
        if (summary && session) {
            const parts = [];
            if (session.date) parts.push(formatDate(session.date));
            if (session.location) parts.push(session.location);
            summaryText.textContent = parts.join(' — ') || 'Fiskepass';
            summary.style.display = '';
        }
    }

    function expandSessionForm() {
        const formEl = document.getElementById('session-form');
        const toggle = document.getElementById('btn-toggle-session-form');
        const summary = document.getElementById('session-summary');

        formEl.classList.remove('collapsed');
        if (toggle) toggle.textContent = 'Dölj pass-info ▲';
        if (summary) summary.style.display = 'none';
    }

    function getGPS() {
        const statusEl = document.getElementById('gps-status');
        if (!navigator.geolocation) {
            statusEl.textContent = 'GPS stöds ej i denna webbläsare';
            return;
        }

        statusEl.textContent = 'Hämtar position...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(6);
                const lng = pos.coords.longitude.toFixed(6);
                document.getElementById('session-lat').value = lat;
                document.getElementById('session-lng').value = lng;
                statusEl.textContent = `📍 ${lat}, ${lng}`;
                fetchWeatherData(lat, lng);
            },
            (err) => {
                statusEl.textContent = 'Kunde inte hämta position';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    async function fetchWeatherData(lat, lng) {
        const statusEl = document.getElementById('gps-status');
        try {
            statusEl.textContent = `📍 ${lat}, ${lng} — hämtar väder...`;
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=ms&timezone=auto`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('API error');
            const data = await resp.json();
            const current = data.current;

            // Air temp — find closest option
            const airTempEl = document.getElementById('session-air-temp');
            if (current.temperature_2m != null && !airTempEl.value) {
                const temp = Math.round(current.temperature_2m);
                selectClosestOption(airTempEl, temp);
            }

            // Wind speed
            const windSpeedEl = document.getElementById('session-wind-speed');
            if (current.wind_speed_10m != null && !windSpeedEl.value) {
                const speed = Math.round(current.wind_speed_10m);
                selectClosestOption(windSpeedEl, speed);
            }

            // Wind direction — convert degrees to compass
            const windDirEl = document.getElementById('session-wind-dir');
            if (current.wind_direction_10m != null && !windDirEl.value) {
                const compass = degreesToCompass(current.wind_direction_10m);
                windDirEl.value = compass;
            }

            // Air pressure
            const pressureEl = document.getElementById('session-pressure');
            if (current.surface_pressure != null && !pressureEl.value) {
                pressureEl.value = Math.round(current.surface_pressure);
            }

            statusEl.textContent = `📍 ${lat}, ${lng} — väder hämtat ✓`;
        } catch (e) {
            statusEl.textContent = `📍 ${lat}, ${lng}`;
        }
    }

    function selectClosestOption(selectEl, targetValue) {
        let bestOption = '';
        let bestDiff = Infinity;
        for (const opt of selectEl.options) {
            if (!opt.value) continue;
            const diff = Math.abs(parseFloat(opt.value) - targetValue);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestOption = opt.value;
            }
        }
        if (bestOption) selectEl.value = bestOption;
    }

    function degreesToCompass(deg) {
        const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'];
        const index = Math.round(deg / 45) % 8;
        return dirs[index];
    }

    // ============== ANGLERS ==============

    function addAngler() {
        const input = document.getElementById('angler-name-input');
        const name = input.value.trim();
        if (!name) return;
        if (sessionAnglers.includes(name)) {
            showToast('Fiskaren finns redan');
            return;
        }
        sessionAnglers.push(name);
        input.value = '';
        renderAnglers();
    }

    function removeAngler(index) {
        sessionAnglers.splice(index, 1);
        renderAnglers();
    }

    function renderAnglers() {
        const container = document.getElementById('anglers-list');
        if (sessionAnglers.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = sessionAnglers.map((name, i) =>
            `<span class="angler-chip">${escapeHtml(name)}<button type="button" class="remove-angler" data-index="${i}">\u00d7</button></span>`
        ).join('');

        container.querySelectorAll('.remove-angler').forEach(btn => {
            btn.addEventListener('click', () => removeAngler(parseInt(btn.dataset.index)));
        });
    }

    function populateAnglerDropdown() {
        const select = document.getElementById('catch-angler');
        // Keep first option
        select.innerHTML = '<option value="">Välj fiskare...</option>';
        const anglers = sessionAnglers.length > 0 ? sessionAnglers : currentAnglers;
        anglers.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }

    // Store current session's anglers for detail mode
    let currentAnglers = [];

    function renderSessionCatches() {
        const container = document.getElementById('session-catches');
        const emptyMsg = document.getElementById('no-catches-msg');

        if (sessionCatches.length === 0) {
            container.innerHTML = '<p class="empty-state" id="no-catches-msg">Inga fångster registrerade ännu.</p>';
            return;
        }

        let html = '';
        sessionCatches.forEach((c, idx) => {
            const details = [];
            if (c.weight) details.push(`${c.weight} kg`);
            if (c.length) details.push(`${c.length} cm`);
            if (c.method) details.push(getMethodLabel(c.method));
            if (c.bait) details.push(c.bait);
            if (c.baitColor) details.push(c.baitColor);

            html += `
                <div class="catch-card" data-index="${idx}">
                    <div class="catch-card-icon"></div>
                    <div class="catch-card-info">
                        <div class="catch-card-species">
                            ${escapeHtml(c.species)}
                            ${c.angler ? ' <span class="tag">' + escapeHtml(c.angler) + '</span>' : ''}
                            ${c.released ? '<span class="badge-released">C&R</span>' : ''}
                        </div>
                        <div class="catch-card-details">${escapeHtml(details.join(' • '))}</div>
                    </div>
                    <div class="catch-card-actions">
                        <button class="btn-edit-catch" data-index="${idx}">✏️</button>
                        <button class="btn-delete-catch" data-index="${idx}">🗑️</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Bind edit/delete
        container.querySelectorAll('.btn-edit-catch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                editCatch(idx);
            });
        });

        container.querySelectorAll('.btn-delete-catch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                sessionCatches.splice(idx, 1);
                renderSessionCatches();
            });
        });
    }

    function editCatch(index) {
        const c = sessionCatches[index];
        if (!c) return;

        editingCatchId = index;
        document.getElementById('catch-form-title').textContent = 'Redigera fångst';
        populateAnglerDropdown();
        document.getElementById('catch-angler').value = c.angler || '';
        document.getElementById('catch-weight').value = c.weight || '';
        document.getElementById('catch-length').value = c.length || '';
        document.getElementById('catch-time').value = c.time || '';
        document.getElementById('catch-bait').value = c.bait || '';
        document.getElementById('catch-bait-color').value = c.baitColor || '';
        document.getElementById('catch-released').checked = c.released !== false;
        document.getElementById('catch-notes').value = c.notes || '';
        setCatchFormValues(c);

        document.getElementById('catch-modal').classList.add('open');
    }

    // ============== CATCH FORM ==============

    function setupCatchForm() {
        document.getElementById('btn-close-catch').addEventListener('click', () => {
            document.getElementById('catch-modal').classList.remove('open');
        });

        document.getElementById('catch-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveCatch();
        });

        // Close modal on backdrop click
        document.getElementById('catch-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('catch-modal').classList.remove('open');
            }
        });

        // Species buttons
        document.querySelectorAll('.species-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.species-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const species = btn.dataset.species;
                const otherInput = document.getElementById('catch-species-other');
                if (species === 'Annat') {
                    otherInput.style.display = '';
                    otherInput.focus();
                    document.getElementById('catch-species').value = '';
                } else {
                    otherInput.style.display = 'none';
                    otherInput.value = '';
                    document.getElementById('catch-species').value = species;
                }
            });
        });

        // Species other input sync
        document.getElementById('catch-species-other').addEventListener('input', (e) => {
            document.getElementById('catch-species').value = e.target.value.trim();
        });

        // Method buttons
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('catch-method').value = btn.dataset.method;
            });
        });
    }

    function resetCatchFormDefaults() {
        // Species: default Gädda
        document.getElementById('catch-species').value = 'Gädda';
        document.querySelectorAll('.species-btn').forEach(b => b.classList.remove('active'));
        const defaultSpecies = document.querySelector('.species-btn[data-species="Gädda"]');
        if (defaultSpecies) defaultSpecies.classList.add('active');
        document.getElementById('catch-species-other').style.display = 'none';
        document.getElementById('catch-species-other').value = '';

        // Method: default Spinnfiske
        document.getElementById('catch-method').value = 'spinn';
        document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
        const defaultMethod = document.querySelector('.method-btn[data-method="spinn"]');
        if (defaultMethod) defaultMethod.classList.add('active');

        // Released: default checked
        document.getElementById('catch-released').checked = true;
    }

    function setCatchFormValues(c) {
        // Species
        const speciesBtn = document.querySelector(`.species-btn[data-species="${c.species}"]`);
        document.querySelectorAll('.species-btn').forEach(b => b.classList.remove('active'));
        if (speciesBtn) {
            speciesBtn.classList.add('active');
            document.getElementById('catch-species').value = c.species;
            document.getElementById('catch-species-other').style.display = 'none';
            document.getElementById('catch-species-other').value = '';
        } else {
            // Custom species — select "Annat"
            const annatBtn = document.querySelector('.species-btn[data-species="Annat"]');
            if (annatBtn) annatBtn.classList.add('active');
            document.getElementById('catch-species').value = c.species;
            document.getElementById('catch-species-other').style.display = '';
            document.getElementById('catch-species-other').value = c.species;
        }

        // Method
        document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
        const methodBtn = document.querySelector(`.method-btn[data-method="${c.method}"]`);
        if (methodBtn) methodBtn.classList.add('active');
        document.getElementById('catch-method').value = c.method || 'spinn';
    }

    function saveCatch() {
        const species = document.getElementById('catch-species').value.trim();
        if (!species) {
            showToast('Ange fiskart');
            return;
        }

        const catchData = {
            id: editingCatchId !== null && !detailCatchMode ? sessionCatches[editingCatchId]?.id : null,
            sessionId: currentSessionId,
            angler: document.getElementById('catch-angler').value || null,
            species,
            weight: parseFloatOrNull(document.getElementById('catch-weight').value),
            length: parseFloatOrNull(document.getElementById('catch-length').value),
            time: document.getElementById('catch-time').value || null,
            method: document.getElementById('catch-method').value || null,
            bait: document.getElementById('catch-bait').value.trim() || null,
            baitColor: document.getElementById('catch-bait-color').value.trim() || null,
            released: document.getElementById('catch-released').checked,
            notes: document.getElementById('catch-notes').value.trim() || null,
        };

        if (detailCatchMode) {
            // Save directly to DB and refresh detail view
            storage.saveCatch(catchData).then(() => {
                showToast('Fångst sparad! ✓');
                openSessionDetail(currentSessionId);
            });
        } else if (editingCatchId !== null) {
            sessionCatches[editingCatchId] = { ...sessionCatches[editingCatchId], ...catchData };
            renderSessionCatches();
        } else {
            sessionCatches.push(catchData);
            renderSessionCatches();
        }

        document.getElementById('catch-modal').classList.remove('open');
        document.getElementById('catch-form').reset();
        editingCatchId = null;
        detailCatchMode = false;
    }

    // ============== SESSION DETAIL ==============

    function setupDetailView() {
        document.getElementById('btn-back-detail').addEventListener('click', () => {
            navigateTo('dashboard');
        });

        document.getElementById('btn-edit-session').addEventListener('click', () => {
            if (currentSessionId) {
                openSessionForm(currentSessionId, { edit: true });
            }
        });

        document.getElementById('btn-delete-session').addEventListener('click', () => {
            showConfirm('Vill du verkligen ta bort detta fiskepass och alla dess fångster?', async () => {
                await storage.deleteSession(currentSessionId);
                showToast('Fiskepass borttaget');
                navigateTo('dashboard');
            });
        });

        document.getElementById('btn-add-catch-detail').addEventListener('click', () => {
            editingCatchId = null;
            detailCatchMode = true;
            document.getElementById('catch-form-title').textContent = 'Ny fångst';
            document.getElementById('catch-form').reset();
            resetCatchFormDefaults();
            populateAnglerDropdown();
            document.getElementById('catch-modal').classList.add('open');
        });
    }

    async function openSessionDetail(sessionId) {
        currentSessionId = sessionId;
        const session = await storage.getSession(sessionId);
        if (!session) return;

        // Store anglers for dropdown in detail mode
        currentAnglers = session.anglers || [];

        const catches = await storage.getCatchesBySession(sessionId);

        document.getElementById('detail-title').textContent = formatDate(session.date);

        let html = '';

        // Session info
        html += `<div class="detail-section">
            <h3>📋 Fiskepass</h3>
            <div class="detail-row"><span class="detail-label">Datum</span><span class="detail-value">${formatDate(session.date)}</span></div>`;

        if (session.startTime || session.endTime) {
            html += `<div class="detail-row"><span class="detail-label">Tid</span><span class="detail-value">${session.startTime || ''} – ${session.endTime || ''}</span></div>`;
        }

        html += `<div class="detail-row"><span class="detail-label">Plats</span><span class="detail-value">${escapeHtml(session.location)}</span></div>`;

        if (session.lat && session.lng) {
            html += `<div class="detail-row"><span class="detail-label">GPS</span><span class="detail-value">${session.lat}, ${session.lng}</span></div>`;
        }

        html += `</div>`;

        // Weather
        if (session.weather || session.airTemp || session.waterTemp || session.windDirection || session.pressure) {
            html += `<div class="detail-section"><h3>🌤️ Förhållanden</h3>`;
            if (session.weather) html += `<div class="detail-row"><span class="detail-label">Väder</span><span class="detail-value">${getWeatherEmoji(session.weather)} ${getWeatherLabel(session.weather)}</span></div>`;
            if (session.airTemp != null) html += `<div class="detail-row"><span class="detail-label">Lufttemp</span><span class="detail-value">${session.airTemp}°C</span></div>`;
            if (session.waterTemp != null) html += `<div class="detail-row"><span class="detail-label">Vattentemp</span><span class="detail-value">${session.waterTemp}°C</span></div>`;
            if (session.windDirection) html += `<div class="detail-row"><span class="detail-label">Vind</span><span class="detail-value">${session.windDirection} ${session.windSpeed ? session.windSpeed + ' m/s' : ''}</span></div>`;
            if (session.pressure != null) html += `<div class="detail-row"><span class="detail-label">Lufttryck</span><span class="detail-value">${session.pressure} hPa</span></div>`;
            if (session.waterClarity) html += `<div class="detail-row"><span class="detail-label">Siktdjup</span><span class="detail-value">${getWaterClarityLabel(session.waterClarity)}</span></div>`;

            html += `</div>`;
        }

        // Anglers
        if (session.anglers && session.anglers.length > 0) {
            html += `<div class="detail-section"><h3>🎣 Fiskare</h3>`;
            html += `<div class="anglers-chips">${session.anglers.map(a => `<span class="angler-chip">${escapeHtml(a)}</span>`).join('')}</div>`;
            html += `</div>`;
        }

        // Notes
        if (session.notes) {
            html += `<div class="detail-section"><h3>📝 Anteckningar</h3><div class="detail-notes">${escapeHtml(session.notes)}</div></div>`;
        }

        // Catches
        html += `<div class="detail-section"><h3>🐟 Fångster (${catches.length})</h3>`;

        if (catches.length === 0) {
            html += `<p class="empty-state">Inga fångster detta pass</p>`;
        } else {
            catches.forEach(c => {
                html += `<div class="catch-card" style="margin-bottom:8px;">
                    <div class="catch-card-icon"></div>
                    <div class="catch-card-info">
                        <div class="catch-card-species">${escapeHtml(c.species)}${c.angler ? ' <span class="tag">' + escapeHtml(c.angler) + '</span>' : ''}${c.released ? '<span class="badge-released">C&R</span>' : ''}</div>
                        <div class="catch-card-details">`;

                const details = [];
                if (c.weight) details.push(`${c.weight} kg`);
                if (c.length) details.push(`${c.length} cm`);
                if (c.method) details.push(getMethodLabel(c.method));
                if (c.bait) details.push(c.bait);
                if (c.baitColor) details.push(c.baitColor);
                if (c.time) details.push(`kl ${c.time}`);
                html += escapeHtml(details.join(' • '));

                html += `</div></div></div>`;

                if (c.notes) {
                    html += `<div class="detail-notes" style="margin: -4px 0 8px 52px; font-size:0.82rem;">${escapeHtml(c.notes)}</div>`;
                }
            });
        }
        html += `</div>`;

        document.getElementById('detail-content').innerHTML = html;
        showPage('page-session-detail');
    }

    // ============== HISTORY ==============

    function setupHistory() {
        document.getElementById('history-search').addEventListener('input', debounce(loadHistory, 300));
        document.getElementById('history-sort').addEventListener('change', loadHistory);
    }

    async function loadHistory() {
        const sessions = await storage.getAllSessions();
        const catches = await storage.getAllCatches();
        const search = (document.getElementById('history-search').value || '').toLowerCase().trim();
        const sort = document.getElementById('history-sort').value;

        let filtered = sessions;
        if (search) {
            filtered = sessions.filter(s => {
                const locationMatch = (s.location || '').toLowerCase().includes(search);
                const sessionCatches = catches.filter(c => c.sessionId === s.id);
                const speciesMatch = sessionCatches.some(c => (c.species || '').toLowerCase().includes(search));
                return locationMatch || speciesMatch;
            });
        }

        // Sort
        if (sort === 'date-desc') filtered.sort((a, b) => b.date.localeCompare(a.date));
        else if (sort === 'date-asc') filtered.sort((a, b) => a.date.localeCompare(b.date));
        else if (sort === 'catches-desc') {
            filtered.sort((a, b) => {
                const ac = catches.filter(c => c.sessionId === a.id).length;
                const bc = catches.filter(c => c.sessionId === b.id).length;
                return bc - ac;
            });
        }

        const container = document.getElementById('history-list');
        if (filtered.length === 0) {
            container.innerHTML = '<p class="empty-state">Inga fiskepass hittades</p>';
            return;
        }

        let html = '';
        for (const session of filtered) {
            const sessionCatches = catches.filter(c => c.sessionId === session.id);
            html += renderSessionCard(session, sessionCatches);
        }
        container.innerHTML = html;

        container.querySelectorAll('.session-card').forEach(card => {
            card.addEventListener('click', () => {
                openSessionDetail(card.dataset.id);
            });
        });
    }

    // ============== CONFIRM DIALOG ==============

    function showConfirm(message, onConfirm) {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-message').textContent = message;
        dialog.classList.add('open');

        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        const cleanup = () => {
            dialog.classList.remove('open');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        const handleOk = () => { cleanup(); onConfirm(); };
        const handleCancel = () => { cleanup(); };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    }

    // ============== UTILITIES ==============

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('sv-SE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }

    function parseFloatOrNull(val) {
        const n = parseFloat(val);
        return isNaN(n) ? null : n;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function getWeatherEmoji(weather) {
        const map = { sol: '☀️', molnigt: '☁️', halvklart: '⛅', regn: '🌧️', duggregn: '🌦️', snö: '❄️', dimma: '🌫️', åska: '⛈️' };
        return map[weather] || '🌤️';
    }

    function getWeatherLabel(weather) {
        const map = { sol: 'Sol', molnigt: 'Molnigt', halvklart: 'Halvklart', regn: 'Regn', duggregn: 'Duggregn', snö: 'Snö', dimma: 'Dimma', åska: 'Åska' };
        return map[weather] || weather;
    }

    function getMethodLabel(method) {
        const map = {
            spinn: 'Spinnfiske', fluga: 'Flugfiske', mete: 'Mete', pimpel: 'Pimpelfiske',
            trolling: 'Trolling', haspel: 'Haspelfiske', jerk: 'Jerkbait',
            bottenmete: 'Bottenmete', drop_shot: 'Drop shot', vertikalt: 'Vertikalfiske', annat: 'Annat'
        };
        return map[method] || method;
    }

    function getWaterClarityLabel(val) {
        const map = { klart: 'Klart', lätt_grumligt: 'Lätt grumligt', grumligt: 'Grumligt', mycket_grumligt: 'Mycket grumligt' };
        return map[val] || val;
    }

    function getBaitTypeLabel(val) {
        const map = {
            spinner: 'Spinner', skeddrag: 'Skeddrag', wobbler: 'Wobbler', jig: 'Jig',
            softbait: 'Softbait', jerkbait: 'Jerkbait', mask: 'Mask', maggot: 'Maggot',
            räka: 'Räka', torrfluga: 'Torrfluga', nymf: 'Nymf', streamer: 'Streamer',
            balanspigg: 'Balanspigg', pilk: 'Pilk', levande_bete: 'Levande bete',
            dött_bete: 'Dött bete', majs: 'Majs', deg: 'Deg', boilie: 'Boilie', annat: 'Annat'
        };
        return map[val] || val;
    }



    // Expose for analysis module
    window.FiskeApp = {
        navigateTo,
        showToast,
        formatDate,
        getWeatherEmoji,
        getWeatherLabel,
        getMethodLabel,
        getBaitTypeLabel,
    };
})();
