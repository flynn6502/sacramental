(function () {
    'use strict';

    const state = {
        user: null,
        preferences: null,
        csrf: '',
        meeting: null,
        page: 'agenda',
        hymnTimers: {},
        charts: [],
    };

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const TZ_BR = 'America/Sao_Paulo';

    let confirmResolver = null;

    function closeAppConfirm(result) {
        const overlay = $('#appConfirm');
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
        const resolve = confirmResolver;
        confirmResolver = null;
        if (resolve) resolve(!!result);
    }

    function askConfirm(options) {
        const opts = options || {};
        return new Promise((resolve) => {
            if (confirmResolver) {
                confirmResolver(false);
                confirmResolver = null;
            }
            confirmResolver = resolve;
            $('#appConfirmTitle').textContent = opts.title || 'Confirmar?';
            $('#appConfirmMessage').textContent = opts.message || 'Essa ação não pode ser desfeita.';
            $('#appConfirmOk').textContent = opts.confirmLabel || 'Remover';
            $('#appConfirmCancel').textContent = opts.cancelLabel || 'Cancelar';
            const overlay = $('#appConfirm');
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
            $('#appConfirmCancel').focus();
        });
    }

    function partValue(parts, type) {
        const part = parts.find(function (p) { return p.type === type; });
        return part ? part.value : '';
    }

    function isIosDevice() {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function shouldUsePrintForPdf() {
        return isIosDevice();
    }

    function formatIsoDateBr(iso) {
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            return iso || '';
        }
        const parts = iso.split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function isoToFilenameDate(iso) {
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            return 'domingo';
        }
        const parts = iso.split('-');
        return parts[2] + '-' + parts[1] + '-' + parts[0];
    }

    function nowBrasilia() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: TZ_BR,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date());
        const get = function (type) { return partValue(parts, type); };
        return {
            year: parseInt(get('year'), 10),
            month: parseInt(get('month'), 10),
            iso: get('year') + '-' + get('month') + '-' + get('day'),
        };
    }

    function displayDate(meeting) {
        return meeting.formatted_date || formatIsoDateBr(meeting.meeting_date);
    }

    function toast(msg, ok) {
        const wrap = $('#toastWrap');
        wrap.innerHTML = '<div class="alert ' + (ok ? 'alert-success' : 'alert-danger') + ' py-2 px-3 shadow">' + escapeHtml(msg) + '</div>';
        setTimeout(() => { wrap.innerHTML = ''; }, 2800);
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    async function api(url, options) {
        const opts = options || {};
        const headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        if (state.csrf && opts.method && opts.method !== 'GET') {
            headers['X-CSRF-TOKEN'] = state.csrf;
        }
        const res = await fetch(url, Object.assign({}, opts, { headers, credentials: 'same-origin' }));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'Não foi possível concluir a solicitação.');
        }
        if (data.csrf_token) state.csrf = data.csrf_token;
        return data;
    }

    function showAuth(which) {
        $$('.auth-form').forEach((f) => f.classList.add('hidden'));
        const map = { login: '#formLogin', register: '#formRegister', forgot: '#formForgot', reset: '#formReset' };
        $(map[which] || '#formLogin').classList.remove('hidden');
        $('#alertAuth').classList.add('hidden');
        $('#alertAuthOk').classList.add('hidden');
    }

    function authAlert(msg, ok) {
        const el = ok ? $('#alertAuthOk') : $('#alertAuth');
        $('#alertAuth').classList.add('hidden');
        $('#alertAuthOk').classList.add('hidden');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function applySession(data) {
        state.user = data.user;
        state.preferences = data.preferences;
        state.csrf = data.csrf_token || state.csrf;
        $('#authView').classList.add('hidden');
        $('#appView').classList.remove('hidden');
        $('#hdrUnit').textContent = (data.user.unit_number || '') + ' · ' + data.user.unit_name;
        loadAgenda();
        if (window.SACConsent && window.SACConsent.granted) {
            api('api/log.php', { method: 'POST', body: { consent: true } }).catch(() => {});
        }
    }

    document.addEventListener('sac:consent', function (ev) {
        if (ev.detail && ev.detail.granted && state.user) {
            api('api/log.php', { method: 'POST', body: { consent: true } }).catch(() => {});
        }
    });

    $$('[data-auth]').forEach((a) => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            showAuth(a.getAttribute('data-auth'));
        });
    });

    $('#formLogin').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('api/auth.php?action=login', {
                method: 'POST',
                body: {
                    username: $('#loginUser').value.trim(),
                    password: $('#loginPass').value,
                    consent: !!(window.SACConsent && window.SACConsent.granted),
                },
            });
            applySession(data);
        } catch (err) {
            authAlert(err.message);
        }
    });

    $('#regUnitNumber').addEventListener('blur', async () => {
        const n = $('#regUnitNumber').value.trim();
        if (!n) return;
        const data = await api('api/auth.php?action=check_unit&unit_number=' + encodeURIComponent(n));
        $('#unitExistsHint').classList.toggle('hidden', !data.exists);
    });

    $('#formRegister').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('api/auth.php?action=register', {
                method: 'POST',
                body: {
                    display_name: $('#regName').value.trim(),
                    username: $('#regUser').value.trim(),
                    email: $('#regEmail').value.trim(),
                    password: $('#regPass').value,
                    unit_number: $('#regUnitNumber').value.trim(),
                    unit_name: $('#regUnitName').value.trim(),
                },
            });
            applySession(data);
        } catch (err) {
            authAlert(err.message);
        }
    });

    $('#formForgot').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('api/auth.php?action=forgot', {
                method: 'POST',
                body: { email: $('#forgotEmail').value.trim() },
            });
            authAlert(data.message, true);
        } catch (err) {
            authAlert(err.message);
        }
    });

    $('#formReset').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await api('api/auth.php?action=reset', {
                method: 'POST',
                body: { token: $('#resetToken').value, password: $('#resetPass').value },
            });
            authAlert(data.message, true);
            showAuth('login');
        } catch (err) {
            authAlert(err.message);
        }
    });

    $$('.bottom-nav button').forEach((btn) => {
        btn.addEventListener('click', () => {
            const page = btn.getAttribute('data-page');
            go(page);
        });
    });

    function go(page, opts) {
        opts = opts || {};
        state.page = page;
        $$('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.getAttribute('data-page') === page));
        $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + page));
        const titles = {
            agenda: 'Reunião sacramental',
            calendar: 'Calendário mensal',
            history: 'Histórico de reuniões',
            dashboard: 'Painel da unidade',
            settings: 'Configurações',
        };
        $('#hdrTitle').textContent = titles[page] || 'Agenda Sacramental';
        if (page === 'agenda' && !opts.skipLoad) loadAgenda();
        if (page === 'calendar') loadCalendar();
        if (page === 'history') loadHistory();
        if (page === 'dashboard') loadDashboard();
        if (page === 'settings') loadSettings();
    }

    function hymnLabel(h) {
        if (!h || !h.title) return '';
        return (h.number ? h.number + ' — ' : '') + h.title;
    }

    function namesDatalist(id, names) {
        return '<datalist id="' + id + '">' + (names || []).map((n) => '<option value="' + escapeHtml(n) + '">').join('') + '</datalist>';
    }

    function hymnPicker(slot, hymn) {
        const label = hymnLabel(hymn);
        const suggested = hymn && hymn.suggested ? '<span class="badge-suggested ms-1">sugerido</span>' : '';
        return (
            '<div class="hymn-picker mb-2" data-slot="' + slot + '">' +
            '<div class="d-flex justify-content-between"><label class="form-label mb-1">' + slotTitle(slot) + suggested + '</label></div>' +
            '<input class="form-control hymn-input" placeholder="Buscar por número ou título" value="' + escapeHtml(label) + '" autocomplete="off">' +
            '<input type="hidden" class="hymn-json" value=\'' + escapeHtml(JSON.stringify(hymn || null)) + '\'>' +
            '<div class="hymn-meta mt-1">' + (hymn && hymn.hymnal_name ? escapeHtml(hymn.hymnal_name) : '') + '</div>' +
            '<div class="hymn-results hidden"></div></div>'
        );
    }

    function slotTitle(slot) {
        return {
            opening_hymn: 'Hino de abertura',
            sacrament_hymn: 'Hino sacramental',
            special_hymn: 'Hino intermediário',
            closing_hymn: 'Hino de encerramento',
        }[slot] || slot;
    }

    function normalizeProgramItems(meeting) {
        if (Array.isArray(meeting.program_items) && meeting.program_items.length) {
            return meeting.program_items.map((item) => Object.assign({}, item));
        }
        const items = [];
        const musical = meeting.musical_number || {};
        if (String(musical.who || '').trim() || String(musical.piece || '').trim() || meeting.show_musical_number) {
            items.push({ type: 'musical', who: musical.who || '', piece: musical.piece || '' });
        }
        if ((meeting.special_hymn && meeting.special_hymn.title) || meeting.show_special_hymn) {
            items.push({ type: 'hymn', hymn: meeting.special_hymn || null });
        }
        (Array.isArray(meeting.speakers) ? meeting.speakers : []).forEach((s) => {
            items.push({
                type: 'speaker',
                name: s.name || '',
                topic: s.topic || '',
                duration: s.duration || '',
                role: s.role || 'adulto',
            });
        });
        return items;
    }

    function programMoveControls(idx, total) {
        return `
            <div class="program-move">
                <button type="button" class="btn-program-move" data-move="up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">▲</button>
                <button type="button" class="btn-program-move" data-move="down" data-idx="${idx}" ${idx >= total - 1 ? 'disabled' : ''} title="Descer" aria-label="Descer">▼</button>
            </div>`;
    }

    function programCardHeader(title, idx, total) {
        return `
            <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div class="d-flex align-items-center gap-2">
                    ${programMoveControls(idx, total)}
                    <strong>${escapeHtml(title)}</strong>
                </div>
                <button type="button" class="btn btn-sm btn-link text-danger p-0 btn-del-program" data-idx="${idx}">remover</button>
            </div>`;
    }

    function renderProgramSection(meeting) {
        const isFast = !!meeting.is_fast_sunday;
        const items = normalizeProgramItems(meeting).filter((item) => !isFast || item.type !== 'speaker');
        let speakerN = 0;
        const cards = items.map((item, idx) => {
            let speakerLabel = null;
            if ((item.type || 'speaker') === 'speaker') {
                speakerN += 1;
                speakerLabel = speakerN;
            }
            return programItemCard(item, idx, items.length, speakerLabel);
        }).join('');
        const fastNote = isFast
            ? '<p class="small mb-2">No domingo de jejum, o tempo após o sacramento é reservado aos testemunhos.</p>'
            : '';
        return `${fastNote}<div id="programWrap">${cards}</div>${programAddButtons(isFast)}`;
    }

    function programItemCard(item, idx, total, speakerLabel) {
        const type = item.type || 'speaker';
        if (type === 'musical') {
            return `
                <div class="speaker-card program-card" data-idx="${idx}" data-type="musical">
                    ${programCardHeader('Número musical', idx, total)}
                    <div class="row g-2">
                        <div class="col-6"><input class="form-control prog-who" placeholder="Quem apresenta" value="${escapeHtml(item.who || '')}"></div>
                        <div class="col-6"><input class="form-control prog-piece" placeholder="Peça / hino" value="${escapeHtml(item.piece || '')}"></div>
                    </div>
                </div>`;
        }
        if (type === 'hymn') {
            const hymn = item.hymn || null;
            const label = hymnLabel(hymn);
            const slot = 'program_hymn_' + idx;
            return `
                <div class="speaker-card program-card" data-idx="${idx}" data-type="hymn">
                    ${programCardHeader('Hino intermediário', idx, total)}
                    <div class="hymn-picker mb-0" data-slot="${slot}">
                        <input class="form-control hymn-input" placeholder="Buscar por número ou título" value="${escapeHtml(label)}" autocomplete="off">
                        <input type="hidden" class="hymn-json" value='${escapeHtml(JSON.stringify(hymn))}'>
                        <div class="hymn-meta mt-1">${hymn && hymn.hymnal_name ? escapeHtml(hymn.hymnal_name) : ''}</div>
                        <div class="hymn-results hidden"></div>
                    </div>
                </div>`;
        }
        return `
            <div class="speaker-card program-card" data-idx="${idx}" data-type="speaker">
                ${programCardHeader('Discursante ' + (speakerLabel || idx + 1), idx, total)}
                <div class="row g-2">
                    <div class="col-12"><input class="form-control sp-name" placeholder="Nome" value="${escapeHtml(item.name || '')}"></div>
                    <div class="col-12"><input class="form-control sp-topic" placeholder="Tema" value="${escapeHtml(item.topic || '')}"></div>
                    <div class="col-6"><input class="form-control sp-duration" placeholder="Tempo (min)" value="${escapeHtml(item.duration || '')}"></div>
                    <div class="col-6"><select class="form-select sp-role">
                        ${option('jovem', item.role, 'Jovem')}${option('adulto', item.role, 'Adulto')}
                        ${option('principal', item.role, 'Orador principal')}${option('visitante', item.role, 'Autoridade visitante')}
                    </select></div>
                </div>
            </div>`;
    }

    function programAddButtons(isFast) {
        let html = '<div class="d-flex flex-wrap gap-2 mt-2 mb-1" id="programAddBtns">';
        if (!isFast) {
            html += '<button type="button" class="btn btn-outline-navy btn-sm" id="btnAddSpeaker">Adicionar discursante</button>';
        }
        html += '<button type="button" class="btn btn-outline-navy btn-sm" id="btnAddMusical">Adicionar Número Musical</button>';
        html += '<button type="button" class="btn btn-outline-navy btn-sm" id="btnAddSpecialHymn">Adicionar Hino Intermediário</button>';
        html += '</div>';
        return html;
    }

    function businessRows(list, type, options) {
        const opts = options || {};
        const allowBlank = opts.allowBlank !== false;
        let items = Array.isArray(list) ? list.slice() : [];
        if (!items.length && allowBlank) items = [{ name: '', calling: '' }];
        if (!items.length) return '';
        return items.map((item, i) => (
            '<div class="biz-row" data-type="' + type + '" data-idx="' + i + '">' +
            '<div class="biz-row-head">' +
            '<span class="biz-row-index">' + (i + 1) + '</span>' +
            '<button type="button" class="btn btn-sm btn-link text-danger p-0 btn-del-biz" data-type="' + type + '" data-idx="' + i + '"' +
            (items.length <= 1 && allowBlank ? ' disabled aria-hidden="true" style="visibility:hidden"' : '') +
            '>remover</button></div>' +
            '<label class="biz-field-label">Nome</label>' +
            '<input class="form-control biz-name" placeholder="Nome completo" value="' + escapeHtml(item.name || '') + '" autocomplete="name">' +
            '<label class="biz-field-label">Chamado</label>' +
            '<input class="form-control biz-calling" placeholder="Chamado" value="' + escapeHtml(item.calling || '') + '">' +
            '</div>'
        )).join('');
    }

    function businessSection(label, type, list, addLabel, options) {
        const opts = options || {};
        return `
            <div class="biz-section ${opts.className || 'mb-3'}">
                <label class="form-label">${escapeHtml(label)}</label>
                <div id="biz-${type}">${businessRows(list, type, opts)}</div>
                <button type="button" class="btn btn-outline-navy btn-sm btn-add-biz" data-type="${type}">${escapeHtml(addLabel)}</button>
            </div>`;
    }

    function recognitionField(id, label, value, listId) {
        return `
            <div class="recog-field">
                <label class="biz-field-label" for="${id}">${escapeHtml(label)}</label>
                <input class="form-control" id="${id}" ${listId ? 'list="' + listId + '"' : ''} value="${escapeHtml(value || '')}" autocomplete="name">
            </div>`;
    }

    function option(val, cur, label) {
        return '<option value="' + val + '"' + (cur === val ? ' selected' : '') + '>' + label + '</option>';
    }

    function renderAgenda(meeting) {
        state.meeting = meeting;
        const prefs = state.preferences || {};
        const members = meeting.members_count ?? '';
        const visitors = meeting.visitors_count ?? '';
        const total = (parseInt(members || 0, 10) + parseInt(visitors || 0, 10)) || '';
        const special = meeting.meeting_type && meeting.meeting_type !== 'sacramental';
        const types = {
            sacramental: 'Reunião sacramental',
            general_conference: 'Conferência Geral',
            stake_conference: 'Conferência de Estaca',
            special: 'Domingo especial (sem sacramental)',
        };

        $('#hdrSub').textContent = displayDate(meeting) +
            (meeting.is_today_sunday ? ' · Hoje' : ' · Próximo domingo');

        const html = `
            <div class="card-soft">
                <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                    <div>
                        <h2 class="mb-1">Programa do domingo</h2>
                        <p class="small text-muted mb-0">${escapeHtml(displayDate(meeting))}${meeting.is_fast_sunday && !special ? ' · Jejum e testemunhos' : ''}</p>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-outline-navy btn-sm" id="btnPng">Baixar PNG</button>
                        <button class="btn btn-outline-navy btn-sm" id="btnPdf">Baixar PDF</button>
                        <button class="btn btn-navy btn-sm btn-save-agenda" type="button">Salvar</button>
                    </div>
                </div>
            </div>
            <div class="card-soft">
                <h2>Tipo de domingo</h2>
                <select class="form-select mb-2" id="meetingType">
                    ${Object.keys(types).map((k) => option(k, meeting.meeting_type || 'sacramental', types[k])).join('')}
                </select>
                <input class="form-control ${special ? '' : 'hidden'}" id="specialNote" placeholder="Observação (ex.: transmissão da conferência)" value="${escapeHtml(meeting.special_note || '')}">
                <div class="form-check mt-2 ${special ? 'hidden' : ''}" id="fastWrap">
                    <input class="form-check-input" type="checkbox" id="isFast" ${meeting.is_fast_sunday ? 'checked' : ''}>
                    <label class="form-check-label" for="isFast">Reunião de jejum e testemunhos</label>
                </div>
            </div>
            <div id="sacramentalFields" class="${special ? 'hidden' : ''}">
                <div class="card-soft">
                    <h2>Frequência</h2>
                    <div class="attendance-grid">
                        <div><label class="form-label">Membros</label><input type="number" min="0" class="form-control" id="membersCount" value="${escapeHtml(members)}"></div>
                        <div><label class="form-label">Visitantes</label><input type="number" min="0" class="form-control" id="visitorsCount" value="${escapeHtml(visitors)}"></div>
                        <div class="total"><span>Total</span><strong id="attTotal">${escapeHtml(total)}</strong></div>
                    </div>
                </div>
                <div class="card-soft">
                    <h2>Reconhecimentos</h2>
                    <div class="recog-stack">
                        ${recognitionField('presides', 'Presidida por', meeting.presides, 'dl-preside')}
                        ${recognitionField('conducts', 'Dirigida por', meeting.conducts, 'dl-conduct')}
                    </div>
                    ${namesDatalist('dl-preside', prefs.preside_names)}
                    ${namesDatalist('dl-conduct', prefs.conduct_names)}
                    ${businessSection('Líderes visitantes', 'visiting_leaders', meeting.visiting_leaders || [], 'Adicionar líder visitante', { allowBlank: false, className: 'mb-3 mt-3' })}
                    <div class="recog-stack">
                        ${recognitionField('chorister', 'Regente', meeting.chorister, 'dl-chorister')}
                        ${recognitionField('pianist', 'Pianista', meeting.pianist, 'dl-pianist')}
                    </div>
                    ${namesDatalist('dl-chorister', prefs.chorister_names)}
                    ${namesDatalist('dl-pianist', prefs.pianist_names)}
                </div>
                <div class="card-soft">
                    <h2>Abertura</h2>
                    <label class="form-label">Anúncios</label>
                    <textarea class="form-control mb-3 announcements-field" id="announcements" rows="12">${escapeHtml(meeting.announcements || '')}</textarea>
                    ${hymnPicker('opening_hymn', meeting.opening_hymn)}
                    <label class="form-label">Oração de abertura</label>
                    <input class="form-control" id="openingPrayer" value="${escapeHtml(meeting.opening_prayer || '')}">
                </div>
                <div class="card-soft">
                    <h2>Assuntos da unidade</h2>
                    <p class="small text-muted">Desobrigações, apoios, confirmações, ordenações.</p>
                    ${businessSection('Desobrigações', 'releases', (meeting.ward_business || {}).releases, 'Adicionar desobrigação')}
                    ${businessSection('Apoios', 'sustainings', (meeting.ward_business || {}).sustainings, 'Adicionar apoio')}
                    ${businessSection('Confirmações', 'confirmations', (meeting.ward_business || {}).confirmations, 'Adicionar confirmação')}
                    ${businessSection('Ordenações / bênçãos', 'ordinations', (meeting.ward_business || {}).ordinations, 'Adicionar ordenação')}
                    <label class="form-label">Outros assuntos</label>
                    <textarea class="form-control" id="bizOther" rows="2">${escapeHtml(((meeting.ward_business || {}).other) || '')}</textarea>
                </div>
                <div class="card-soft">
                    <h2>Sacramento</h2>
                    ${hymnPicker('sacrament_hymn', meeting.sacrament_hymn)}
                    <p class="small mb-0">Administração do sacramento pelos portadores do Sacerdócio Aarônico.</p>
                </div>
                <div class="card-soft">
                    <h2>Programa</h2>
                    ${renderProgramSection(meeting)}
                </div>
                <div class="card-soft">
                    <h2>Encerramento</h2>
                    ${hymnPicker('closing_hymn', meeting.closing_hymn)}
                    <label class="form-label">Oração de encerramento</label>
                    <input class="form-control mb-3" id="closingPrayer" value="${escapeHtml(meeting.closing_prayer || '')}">
                    <label class="form-label">Observações</label>
                    <textarea class="form-control mb-3" id="notes" rows="2">${escapeHtml(meeting.notes || '')}</textarea>
                    <button class="btn btn-navy btn-sm btn-save-agenda" type="button">Salvar</button>
                </div>
            </div>
            <div class="card-soft ${special ? '' : 'hidden'}" id="specialBox">
                <p class="mb-3">Neste domingo não haverá reunião sacramental na unidade. Use o campo acima para registrar o motivo e preserve o histórico no calendário.</p>
                <button class="btn btn-navy btn-sm btn-save-agenda" type="button">Salvar</button>
            </div>
        `;
        $('#page-agenda').innerHTML = html;
        bindAgendaEvents();
    }

    function collectBiz(type, keepEmpty) {
        const rows = $$(`#biz-${type} .biz-row`).map((row) => ({
            name: $('.biz-name', row).value.trim(),
            calling: $('.biz-calling', row).value.trim(),
        }));
        if (keepEmpty) return rows;
        return rows.filter((x) => x.name || x.calling);
    }

    function commitBizLists(mutator) {
        const payload = collectMeeting();
        const wb = Object.assign({}, payload.ward_business || {});
        ['sustainings', 'releases', 'confirmations', 'ordinations'].forEach((type) => {
            const rows = collectBiz(type, true);
            wb[type] = rows.length ? rows : [{ name: '', calling: '' }];
        });
        payload.ward_business = wb;
        payload.visiting_leaders = collectBiz('visiting_leaders', true);
        if (typeof mutator === 'function') mutator(payload);
        state.meeting = Object.assign({}, state.meeting, payload);
        renderAgenda(state.meeting);
    }

    function parseHymn(slot) {
        const box = $(`.hymn-picker[data-slot="${slot}"]`);
        if (!box) return null;
        try {
            return JSON.parse($('.hymn-json', box).value || 'null');
        } catch (e) {
            return null;
        }
    }

    function collectProgramItems() {
        return $$('#programWrap .program-card').map((card) => {
            const type = card.getAttribute('data-type');
            if (type === 'musical') {
                return {
                    type: 'musical',
                    who: ($('.prog-who', card) || {}).value ? $('.prog-who', card).value.trim() : '',
                    piece: ($('.prog-piece', card) || {}).value ? $('.prog-piece', card).value.trim() : '',
                };
            }
            if (type === 'hymn') {
                let hymn = null;
                try {
                    hymn = JSON.parse(($('.hymn-json', card) || {}).value || 'null');
                } catch (e) {
                    hymn = null;
                }
                return { type: 'hymn', hymn: hymn };
            }
            return {
                type: 'speaker',
                name: ($('.sp-name', card) || {}).value ? $('.sp-name', card).value.trim() : '',
                topic: ($('.sp-topic', card) || {}).value ? $('.sp-topic', card).value.trim() : '',
                duration: ($('.sp-duration', card) || {}).value ? $('.sp-duration', card).value.trim() : '',
                role: ($('.sp-role', card) || {}).value || 'adulto',
            };
        });
    }

    function deriveLegacyFromProgram(items) {
        const speakers = [];
        let musical = { who: '', piece: '' };
        let specialHymn = null;
        let gotMusical = false;
        items.forEach((item) => {
            if (item.type === 'speaker') {
                speakers.push({
                    name: item.name || '',
                    topic: item.topic || '',
                    duration: item.duration || '',
                    role: item.role || 'adulto',
                });
            } else if (item.type === 'musical' && !gotMusical) {
                musical = { who: item.who || '', piece: item.piece || '' };
                gotMusical = true;
            } else if (item.type === 'hymn' && !specialHymn) {
                specialHymn = item.hymn || null;
            }
        });
        return { speakers, musical_number: musical, special_hymn: specialHymn };
    }

    function collectMeeting() {
        const m = state.meeting || {};
        const isFast = $('#isFast') ? $('#isFast').checked : false;
        let programItems = collectProgramItems();
        if (isFast) {
            programItems = programItems.filter((item) => item.type !== 'speaker');
        }
        const legacy = deriveLegacyFromProgram(programItems);
        return {
            meeting_date: m.meeting_date,
            meeting_type: $('#meetingType').value,
            special_note: $('#specialNote').value.trim(),
            members_count: $('#membersCount') ? $('#membersCount').value : null,
            visitors_count: $('#visitorsCount') ? $('#visitorsCount').value : null,
            presides: $('#presides') ? $('#presides').value.trim() : '',
            conducts: $('#conducts') ? $('#conducts').value.trim() : '',
            chorister: $('#chorister') ? $('#chorister').value.trim() : '',
            pianist: $('#pianist') ? $('#pianist').value.trim() : '',
            opening_hymn: parseHymn('opening_hymn'),
            sacrament_hymn: parseHymn('sacrament_hymn'),
            special_hymn: legacy.special_hymn,
            closing_hymn: parseHymn('closing_hymn'),
            opening_prayer: $('#openingPrayer') ? $('#openingPrayer').value.trim() : '',
            closing_prayer: $('#closingPrayer') ? $('#closingPrayer').value.trim() : '',
            announcements: $('#announcements') ? $('#announcements').value.trim() : '',
            ward_business: {
                sustainings: collectBiz('sustainings'),
                releases: collectBiz('releases'),
                confirmations: collectBiz('confirmations'),
                ordinations: collectBiz('ordinations'),
                other: $('#bizOther') ? $('#bizOther').value.trim() : '',
            },
            visiting_leaders: collectBiz('visiting_leaders'),
            speakers: legacy.speakers,
            program_items: programItems,
            is_fast_sunday: isFast,
            musical_number: legacy.musical_number,
            notes: $('#notes') ? $('#notes').value.trim() : '',
        };
    }

    function applyMobileFieldSizes() {
        const el = $('#announcements');
        if (!el) return;
        const mobile = window.matchMedia('(max-width: 767.98px)').matches;
        el.classList.add('announcements-field');
        if (mobile) {
            el.setAttribute('rows', '12');
            el.style.minHeight = '24rem';
            el.style.height = '24rem';
        } else {
            el.setAttribute('rows', '2');
            el.style.minHeight = '';
            el.style.height = '';
        }
    }

    function bindAgendaEvents() {
        const updTotal = () => {
            if (!$('#membersCount')) return;
            const t = (parseInt($('#membersCount').value || 0, 10) + parseInt($('#visitorsCount').value || 0, 10));
            $('#attTotal').textContent = t || '';
        };
        $('#membersCount') && $('#membersCount').addEventListener('input', updTotal);
        $('#visitorsCount') && $('#visitorsCount').addEventListener('input', updTotal);

        $('#meetingType').addEventListener('change', () => {
            const special = $('#meetingType').value !== 'sacramental';
            $('#sacramentalFields').classList.toggle('hidden', special);
            $('#specialBox').classList.toggle('hidden', !special);
            $('#specialNote').classList.toggle('hidden', !special);
            $('#fastWrap').classList.toggle('hidden', special);
        });

        $('#isFast') && $('#isFast').addEventListener('change', () => {
            const payload = collectMeeting();
            payload.is_fast_sunday = $('#isFast').checked;
            if (payload.is_fast_sunday) {
                payload.program_items = (payload.program_items || []).filter((item) => item.type !== 'speaker');
                payload.speakers = [];
            }
            state.meeting = Object.assign({}, state.meeting, payload);
            renderAgenda(state.meeting);
        });

        function commitProgram(items) {
            const payload = collectMeeting();
            payload.program_items = items;
            const legacy = deriveLegacyFromProgram(items);
            payload.speakers = legacy.speakers;
            payload.musical_number = legacy.musical_number;
            payload.special_hymn = legacy.special_hymn;
            state.meeting = Object.assign({}, state.meeting, payload);
            renderAgenda(state.meeting);
        }

        $('#btnAddSpeaker') && $('#btnAddSpeaker').addEventListener('click', () => {
            const items = collectProgramItems();
            items.push({ type: 'speaker', name: '', topic: '', duration: '', role: 'adulto' });
            commitProgram(items);
        });

        $('#btnAddMusical') && $('#btnAddMusical').addEventListener('click', () => {
            const items = collectProgramItems();
            items.push({ type: 'musical', who: '', piece: '' });
            commitProgram(items);
        });

        $('#btnAddSpecialHymn') && $('#btnAddSpecialHymn').addEventListener('click', () => {
            const items = collectProgramItems();
            items.push({ type: 'hymn', hymn: null });
            commitProgram(items);
        });

        $$('.btn-del-program').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('.program-card');
                const type = card ? card.getAttribute('data-type') : 'speaker';
                const labels = {
                    speaker: 'Remover este discursante do programa?',
                    musical: 'Remover este número musical do programa?',
                    hymn: 'Remover este hino intermediário do programa?',
                };
                const ok = await askConfirm({
                    title: 'Remover item?',
                    message: (labels[type] || 'Remover este item do programa?') + ' Os dados digitados serão perdidos.',
                    confirmLabel: 'Remover',
                });
                if (!ok) return;
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                const items = collectProgramItems();
                items.splice(idx, 1);
                commitProgram(items);
            });
        });

        $$('.btn-program-move').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                const dir = btn.getAttribute('data-move');
                const items = collectProgramItems();
                const swap = dir === 'up' ? idx - 1 : idx + 1;
                if (swap < 0 || swap >= items.length) return;
                const tmp = items[idx];
                items[idx] = items[swap];
                items[swap] = tmp;
                commitProgram(items);
            });
        });

        $$('.btn-add-biz').forEach((btn) => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                commitBizLists((payload) => {
                    if (type === 'visiting_leaders') {
                        payload.visiting_leaders = (payload.visiting_leaders || []).concat([{ name: '', calling: '' }]);
                        return;
                    }
                    const wb = payload.ward_business || {};
                    wb[type] = (wb[type] || []).concat([{ name: '', calling: '' }]);
                    payload.ward_business = wb;
                });
            });
        });

        $$('.btn-del-biz').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;
                const type = btn.getAttribute('data-type');
                const labels = {
                    releases: 'esta desobrigação',
                    sustainings: 'este apoio',
                    confirmations: 'esta confirmação',
                    ordinations: 'esta ordenação',
                    visiting_leaders: 'este líder visitante',
                };
                const ok = await askConfirm({
                    title: 'Remover item?',
                    message: 'Remover ' + (labels[type] || 'este item') + '? Nome e chamado digitados serão perdidos.',
                    confirmLabel: 'Remover',
                });
                if (!ok) return;
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                commitBizLists((payload) => {
                    if (type === 'visiting_leaders') {
                        const list = (payload.visiting_leaders || []).slice();
                        list.splice(idx, 1);
                        payload.visiting_leaders = list;
                        return;
                    }
                    const wb = payload.ward_business || {};
                    const list = (wb[type] || []).slice();
                    list.splice(idx, 1);
                    wb[type] = list.length ? list : [{ name: '', calling: '' }];
                    payload.ward_business = wb;
                });
            });
        });

        $$('.btn-save-agenda').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    const saved = await api('api/meetings.php?action=save', { method: 'POST', body: collectMeeting() });
                    state.meeting = saved.meeting;
                    toast('Agenda salva.', true);
                } catch (err) {
                    toast(err.message);
                }
            });
        });

        $('#btnPdf').addEventListener('click', () => downloadPdf());
        $('#btnPng').addEventListener('click', () => downloadPng());

        $$('.hymn-input').forEach((input) => {
            const box = input.closest('.hymn-picker');
            input.addEventListener('input', () => searchHymns(box, input.value));
            input.addEventListener('focus', () => searchHymns(box, input.value));
        });

        applyMobileFieldSizes();
    }

    window.addEventListener('resize', applyMobileFieldSizes);

    function searchHymns(box, q) {
        const slot = box.getAttribute('data-slot');
        clearTimeout(state.hymnTimers[slot]);
        state.hymnTimers[slot] = setTimeout(async () => {
            const data = await api('api/hymns.php?q=' + encodeURIComponent(q || ''));
            const results = $('.hymn-results', box);
            results.innerHTML = (data.hymns || []).map((h) => (
                '<button type="button" data-id="' + escapeHtml(h.id) + '"><strong>' +
                escapeHtml(h.number) + '</strong> — ' + escapeHtml(h.title) +
                '<div class="hymn-meta">' + escapeHtml(h.hymnal_name) + ' · ' + escapeHtml((h.roles || []).join(', ')) + '</div></button>'
            )).join('') || '<div class="p-2 small text-muted">Nenhum hino encontrado.</div>';
            results.classList.remove('hidden');
            $$('button', results).forEach((btn) => {
                btn.addEventListener('click', () => {
                    const hymn = data.hymns.find((h) => h.id === btn.getAttribute('data-id'));
                    hymn.suggested = false;
                    $('.hymn-input', box).value = hymnLabel(hymn);
                    $('.hymn-json', box).value = JSON.stringify(hymn);
                    $('.hymn-meta', box).textContent = hymn.hymnal_name;
                    results.classList.add('hidden');
                });
            });
        }, 180);
    }

    async function loadAgenda(date) {
        try {
            const url = date
                ? 'api/meetings.php?action=get&date=' + encodeURIComponent(date)
                : 'api/meetings.php?action=current';
            const data = await api(url);
            if (data.preferences) state.preferences = data.preferences;
            renderAgenda(data.meeting);
        } catch (err) {
            toast(err.message);
        }
    }

    async function loadHistory() {
        const data = await api('api/meetings.php?action=history');
        const today = data.today;
        const types = {
            sacramental: 'Sacramental',
            general_conference: 'Conferência Geral',
            stake_conference: 'Conferência de Estaca',
            special: 'Especial',
        };
        const meetings = data.meetings || [];
        $('#page-history').innerHTML = `
            <div class="card-soft">
                <h2>Reuniões anteriores e futuras</h2>
                <p class="small text-muted mb-3">Lista da mais recente para a mais antiga.</p>
                ${meetings.map((m) => `
                    <div class="history-item" data-id="${escapeHtml(m.id)}">
                        <div>
                            <strong>${escapeHtml(m.formatted_date || formatIsoDateBr(m.meeting_date))}</strong>
                            <div class="small text-muted">${types[m.meeting_type] || m.meeting_type}${m.meeting_date > today ? ' · futura' : (m.meeting_date < today ? ' · anterior' : ' · atual')}</div>
                        </div>
                        <div class="history-actions">
                            <button type="button" class="btn btn-outline-navy btn-sm" data-open="${escapeHtml(m.meeting_date)}">Abrir</button>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-delete="${escapeHtml(m.id)}" data-date-label="${escapeHtml(m.formatted_date || formatIsoDateBr(m.meeting_date))}">Excluir</button>
                        </div>
                    </div>
                `).join('') || '<p class="text-muted mb-0">Nenhuma reunião salva ainda.</p>'}
            </div>`;
        $$('#page-history [data-open]').forEach((b) => {
            b.addEventListener('click', () => {
                go('agenda', { skipLoad: true });
                loadAgenda(b.getAttribute('data-open'));
            });
        });
        $$('#page-history [data-delete]').forEach((b) => {
            b.addEventListener('click', async () => {
                const id = parseInt(b.getAttribute('data-delete'), 10);
                const label = b.getAttribute('data-date-label') || 'esta reunião';
                if (!id) return;
                const ok = await askConfirm({
                    title: 'Excluir reunião?',
                    message: 'Excluir a reunião de ' + label + '? Essa ação não pode ser desfeita.',
                    confirmLabel: 'Excluir',
                });
                if (!ok) return;
                try {
                    await api('api/meetings.php?action=delete', {
                        method: 'POST',
                        body: { id: id },
                    });
                    toast('Reunião excluída.', true);
                    loadHistory();
                } catch (err) {
                    toast(err.message);
                }
            });
        });
    }

    const brNow = nowBrasilia();
    let calYear = brNow.year;
    let calMonth = brNow.month;

    async function loadCalendar() {
        const data = await api(`api/meetings.php?action=calendar&year=${calYear}&month=${calMonth}`);
        const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const weekStartSunday = ((state.preferences || {}).week_starts_on === 'sunday');
        const first = new Date(calYear, calMonth - 1, 1);
        const startPad = weekStartSunday ? first.getDay() : (first.getDay() + 6) % 7;
        const daysInMonth = new Date(calYear, calMonth, 0).getDate();
        const sundayMap = {};
        (data.sundays || []).forEach((s) => { sundayMap[s.day] = s; });
        let cells = '';
        for (let i = 0; i < startPad; i++) cells += '<div></div>';
        for (let d = 1; d <= daysInMonth; d++) {
            const s = sundayMap[d];
            if (!s) {
                cells += `<div class="cal-day">${d}</div>`;
                continue;
            }
            const special = s.meeting && s.meeting.meeting_type !== 'sacramental';
            const hasSavedAgenda = s.meeting
                && s.meeting.meeting_type === 'sacramental'
                && s.kind !== 'past';
            cells += `<button type="button" class="cal-day sun ${s.kind}${special ? ' special' : ''}${hasSavedAgenda ? ' has-saved' : ''}" data-date="${s.date}">${d}</button>`;
        }
        const dows = weekStartSunday
            ? '<div class="cal-dow">Dom</div><div class="cal-dow">Seg</div><div class="cal-dow">Ter</div><div class="cal-dow">Qua</div><div class="cal-dow">Qui</div><div class="cal-dow">Sex</div><div class="cal-dow">Sáb</div>'
            : '<div class="cal-dow">Seg</div><div class="cal-dow">Ter</div><div class="cal-dow">Qua</div><div class="cal-dow">Qui</div><div class="cal-dow">Sex</div><div class="cal-dow">Sáb</div><div class="cal-dow">Dom</div>';
        $('#page-calendar').innerHTML = `
            <div class="card-soft">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <button class="btn btn-outline-navy btn-sm" id="calPrev">‹</button>
                    <h2 class="mb-0">${monthNames[calMonth - 1]} ${calYear}</h2>
                    <button class="btn btn-outline-navy btn-sm" id="calNext">›</button>
                </div>
                <div class="cal-grid mb-2">
                    ${dows}
                    ${cells}
                </div>
                <div class="legend mb-3">
                    <span><i style="background:#e4e7eb"></i>Passado</span>
                    <span><i style="background:#C4A35A"></i>Atual / próximo</span>
                    <span><i style="background:#d7eee2"></i>Futuro</span>
                    <span><i style="outline:2px solid #8B2E2E;background:#fff"></i>Sem sacramental</span>
                    <span><span class="legend-saved">23</span> Agenda salva</span>
                </div>
                <div class="border-top pt-3">
                    <h2>Marcar domingo especial</h2>
                    <p class="small text-muted">Use para Conferência Geral, de estaca ou outro domingo sem reunião sacramental.</p>
                    <div class="row g-2">
                        <div class="col-12"><input type="date" class="form-control" id="specialDate"></div>
                        <div class="col-12">
                            <select class="form-select" id="specialType">
                                <option value="general_conference">Conferência Geral</option>
                                <option value="stake_conference">Conferência de Estaca</option>
                                <option value="special">Outro domingo especial</option>
                                <option value="sacramental">Voltar a ser sacramental</option>
                            </select>
                        </div>
                        <div class="col-12"><input class="form-control" id="specialCalNote" placeholder="Observação"></div>
                        <div class="col-12"><button class="btn btn-navy w-100" id="btnMarkSpecial">Registrar</button></div>
                    </div>
                </div>
            </div>`;
        $('#calPrev').addEventListener('click', () => {
            calMonth -= 1;
            if (calMonth < 1) { calMonth = 12; calYear -= 1; }
            loadCalendar();
        });
        $('#calNext').addEventListener('click', () => {
            calMonth += 1;
            if (calMonth > 12) { calMonth = 1; calYear += 1; }
            loadCalendar();
        });
        $$('#page-calendar .cal-day.sun').forEach((b) => {
            b.addEventListener('click', () => {
                go('agenda', { skipLoad: true });
                loadAgenda(b.getAttribute('data-date'));
            });
        });
        $('#btnMarkSpecial').addEventListener('click', async () => {
            try {
                await api('api/meetings.php?action=mark_special', {
                    method: 'POST',
                    body: {
                        meeting_date: $('#specialDate').value,
                        meeting_type: $('#specialType').value,
                        special_note: $('#specialCalNote').value.trim(),
                    },
                });
                toast('Domingo atualizado.', true);
                loadCalendar();
            } catch (err) {
                toast(err.message);
            }
        });
    }

    function destroyCharts() {
        state.charts.forEach((c) => c.destroy());
        state.charts = [];
    }

    async function loadDashboard() {
        const data = await api('api/dashboard.php');
        destroyCharts();
        const s = data.summary;
        $('#page-dashboard').innerHTML = `
            <div class="stat-grid mb-3">
                <div class="stat"><b>${s.meetings}</b><span>Reuniões sacramentais</span></div>
                <div class="stat"><b>${s.avg_total}</b><span>Média de frequência</span></div>
                <div class="stat"><b>${s.avg_members}</b><span>Média de membros</span></div>
                <div class="stat"><b>${s.avg_visitors}</b><span>Média de visitantes</span></div>
            </div>
            <div class="card-soft">${(data.insights || []).map((i) => `<div class="insight">${escapeHtml(i)}</div>`).join('')}</div>
            <div class="card-soft"><h2>Série histórica de frequência</h2><canvas id="attChart" height="140"></canvas></div>
            <div class="card-soft"><h2>Temas mais abordados</h2>${table(data.topics, 'topic')}</div>
            <div class="card-soft"><h2>Hinos mais cantados</h2>${table(data.hymns, 'label')}</div>
            <div class="card-soft"><h2>Quem mais discursou</h2>${table(data.speakers, 'label')}</div>
            <div class="card-soft"><h2>Quem mais orou</h2>${table(data.prayers, 'label')}</div>
        `;
        if (data.attendance && data.attendance.length && window.Chart) {
            const ctx = $('#attChart');
            state.charts.push(new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.attendance.map((r) => r.label),
                    datasets: [
                        { label: 'Membros', data: data.attendance.map((r) => r.members), borderColor: '#002D5B', tension: 0.3 },
                        { label: 'Visitantes', data: data.attendance.map((r) => r.visitors), borderColor: '#C4A35A', tension: 0.3 },
                    ],
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
            }));
        }
    }

    function table(rows, key) {
        if (!rows || !rows.length) return '<p class="small text-muted mb-0">Ainda sem dados suficientes.</p>';
        return '<table class="table table-sm mb-0"><tbody>' + rows.map((r) =>
            `<tr><td>${escapeHtml(r[key] || r.label)}</td><td class="text-end fw-bold">${r.count}</td></tr>`
        ).join('') + '</tbody></table>';
    }

    function chips(list, key) {
        return `<div class="mb-2" id="chips-${key}">${(list || []).map((n) =>
            `<span class="names-chip">${escapeHtml(n)}<button type="button" data-key="${key}" data-name="${escapeHtml(n)}">×</button></span>`
        ).join('')}</div>
        <div class="input-group mb-3">
            <input class="form-control" id="add-${key}" placeholder="Adicionar nome">
            <button class="btn btn-outline-navy" type="button" data-add="${key}">Incluir</button>
        </div>`;
    }

    async function loadSettings() {
        const me = await api('api/users.php?action=me');
        state.user = me.user;
        state.preferences = me.preferences;
        const users = await api('api/users.php?action=unit_users');
        const p = me.preferences;
        $('#page-settings').innerHTML = `
            <div class="card-soft">
                <h2>Seus dados</h2>
                <label class="form-label">Nome</label>
                <input class="form-control mb-2" id="setName" value="${escapeHtml(me.user.display_name)}">
                <label class="form-label">Usuário</label>
                <input class="form-control mb-2" id="setUser" value="${escapeHtml(me.user.username)}">
                <label class="form-label">E-mail</label>
                <input class="form-control mb-2" id="setEmail" value="${escapeHtml(me.user.email)}">
                <p class="small text-muted">Unidade ${escapeHtml(me.user.unit_number)} — ${escapeHtml(me.user.unit_name)}</p>
                <button class="btn btn-navy" id="btnSaveProfile">Salvar perfil</button>
            </div>
            <div class="card-soft">
                <h2>Segurança</h2>
                <input class="form-control mb-2" id="curPass" type="password" placeholder="Senha atual">
                <input class="form-control mb-2" id="newPass" type="password" placeholder="Nova senha">
                <button class="btn btn-outline-navy" id="btnSavePass">Alterar senha</button>
            </div>
            <div class="card-soft">
                <h2>Preferências da reunião</h2>
                <label class="form-label">Horário habitual (Horário de Brasília)</label>
                <input class="form-control mb-3" id="meetTime" type="time" value="${escapeHtml(p.meeting_time || '09:00')}">
                <label class="form-label">Início da semana no calendário</label>
                <select class="form-select mb-3" id="weekStart">
                    <option value="monday"${(p.week_starts_on || 'monday') === 'monday' ? ' selected' : ''}>Segunda-feira</option>
                    <option value="sunday"${p.week_starts_on === 'sunday' ? ' selected' : ''}>Domingo</option>
                </select>
                <label class="form-label">Nomes preferidos para presidir</label>
                ${chips(p.preside_names, 'preside_names')}
                <label class="form-label">Nomes preferidos para dirigir</label>
                ${chips(p.conduct_names, 'conduct_names')}
                <label class="form-label">Regentes</label>
                ${chips(p.chorister_names, 'chorister_names')}
                <label class="form-label">Piano / órgão</label>
                ${chips(p.pianist_names, 'pianist_names')}
                <button class="btn btn-navy" id="btnSavePrefs">Salvar preferências</button>
            </div>
            <div class="card-soft">
                <h2>Usuários da unidade</h2>
                <p class="small text-muted">Somente líderes desta unidade podem adicionar novos acessos. O cadastro público não aceita unidade já existente.</p>
                ${(users.users || []).map((u) => `<div class="user-item"><div><strong>${escapeHtml(u.display_name)}</strong><div class="small text-muted">${escapeHtml(u.username)} · ${escapeHtml(u.email)}</div></div></div>`).join('')}
                <hr>
                <label class="form-label">Adicionar usuário à unidade</label>
                <input class="form-control mb-2" id="nuName" placeholder="Nome">
                <input class="form-control mb-2" id="nuUser" placeholder="Usuário">
                <input class="form-control mb-2" id="nuEmail" placeholder="E-mail" type="email">
                <input class="form-control mb-2" id="nuPass" placeholder="Senha temporária" type="password">
                <button class="btn btn-gold" id="btnAddUser">Adicionar à unidade</button>
            </div>
            <div class="card-soft">
                <a class="footer-privacy-link" href="privacidade.php">Política de privacidade</a>
            </div>
        `;
        bindSettings();
    }

    function prefFromChips() {
        const read = (key) => $$(`#chips-${key} .names-chip`).map((c) => c.childNodes[0].textContent.trim());
        return {
            preside_names: read('preside_names'),
            conduct_names: read('conduct_names'),
            chorister_names: read('chorister_names'),
            pianist_names: read('pianist_names'),
            meeting_time: $('#meetTime').value,
            week_starts_on: $('#weekStart').value,
        };
    }

    function bindSettings() {
        $$('[data-add]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-add');
                const input = $('#add-' + key);
                const name = input.value.trim();
                if (!name) return;
                $('#chips-' + key).insertAdjacentHTML('beforeend', `<span class="names-chip">${escapeHtml(name)}<button type="button" data-key="${key}" data-name="${escapeHtml(name)}">×</button></span>`);
                input.value = '';
                bindChipRemoves();
            });
        });
        bindChipRemoves();
        $('#btnSaveProfile').addEventListener('click', async () => {
            try {
                await api('api/users.php?action=update_profile', {
                    method: 'POST',
                    body: { display_name: $('#setName').value, username: $('#setUser').value, email: $('#setEmail').value },
                });
                toast('Perfil atualizado.', true);
            } catch (err) { toast(err.message); }
        });
        $('#btnSavePass').addEventListener('click', async () => {
            try {
                await api('api/users.php?action=update_password', {
                    method: 'POST',
                    body: { current_password: $('#curPass').value, new_password: $('#newPass').value },
                });
                toast('Senha alterada.', true);
            } catch (err) { toast(err.message); }
        });
        $('#btnSavePrefs').addEventListener('click', async () => {
            try {
                const data = await api('api/users.php?action=preferences', { method: 'POST', body: prefFromChips() });
                state.preferences = data.preferences;
                toast('Preferências salvas.', true);
            } catch (err) { toast(err.message); }
        });
        $('#btnAddUser').addEventListener('click', async () => {
            try {
                await api('api/users.php?action=add_user', {
                    method: 'POST',
                    body: {
                        display_name: $('#nuName').value,
                        username: $('#nuUser').value,
                        email: $('#nuEmail').value,
                        password: $('#nuPass').value,
                    },
                });
                toast('Usuário adicionado à unidade.', true);
                loadSettings();
            } catch (err) { toast(err.message); }
        });
    }

    function bindChipRemoves() {
        $$('.names-chip button').forEach((b) => {
            b.onclick = async () => {
                const name = b.getAttribute('data-name') || 'este nome';
                const ok = await askConfirm({
                    title: 'Remover nome?',
                    message: 'Remover "' + name + '" da lista de preferências?',
                    confirmLabel: 'Remover',
                });
                if (!ok) return;
                b.parentElement.remove();
            };
        });
    }

    function hymnLine(h) {
        if (!h || !h.title) return '________________';
        return (h.number ? h.number + ' — ' : '') + h.title;
    }

    function openPrintPdf(html) {
        const holder = $('#printRoot');
        holder.innerHTML = html;
        window.print();
        setTimeout(function () { holder.innerHTML = ''; }, 1000);
    }

    function exportBizLines(title, rows) {
        const lines = (rows || []).filter((r) => r.name);
        if (!lines.length) return '';
        return lines.map((r) => r.name + (r.calling ? ' — ' + r.calling : '')).join('; ');
    }

    function buildProgramExportLines(m) {
        const programItems = normalizeProgramItems(m);
        let speakerN = 0;
        if (m.is_fast_sunday) {
            return [{ kind: 'note', text: 'Reunião de jejum e testemunhos' }];
        }
        const lines = [];
        programItems.forEach((item) => {
            if (item.type === 'musical') {
                const line = [item.who, item.piece].filter(Boolean).join(' — ');
                if (line) lines.push({ kind: 'musical', text: line });
                return;
            }
            if (item.type === 'hymn') {
                if (item.hymn && item.hymn.title) {
                    lines.push({ kind: 'hymn', text: hymnLine(item.hymn) });
                }
                return;
            }
            speakerN += 1;
            if (!item.name) return;
            lines.push({
                kind: 'speaker',
                n: speakerN,
                name: item.name,
                topic: item.topic || '',
                duration: item.duration || '',
            });
        });
        return lines;
    }

    function buildPdfHtml(m, unit) {
        const special = m.meeting_type !== 'sacramental';
        const biz = (title, rows) => {
            const text = exportBizLines(title, rows);
            return text ? `<p><strong>${title}:</strong> ${escapeHtml(text)}</p>` : '';
        };
        const programLines = buildProgramExportLines(m);
        const programHtml = programLines.length
            ? programLines.map((line) => {
                if (line.kind === 'musical') return `<p><strong>Número musical:</strong> ${escapeHtml(line.text)}</p>`;
                if (line.kind === 'hymn') return `<p><strong>Hino intermediário:</strong> ${escapeHtml(line.text)}</p>`;
                if (line.kind === 'note') return `<p><strong>${escapeHtml(line.text)}</strong></p>`;
                return `<p><strong>Discursante ${line.n}:</strong> ${escapeHtml(line.name)}${line.topic ? ' — ' + escapeHtml(line.topic) : ''}${line.duration ? ' (' + escapeHtml(line.duration) + ' min)' : ''}</p>`;
            }).join('')
            : '<p><strong>Programa:</strong> ________________________________</p>';

        return `
            <div style="font-family:Georgia,'Times New Roman',serif;color:#10233A;padding:24px;width:720px;">
                <div style="text-align:center;border-bottom:3px solid #002D5B;padding-bottom:12px;margin-bottom:16px;">
                    <h1 style="margin:8px 0 4px;font-size:26px;color:#002D5B;">Reunião Sacramental</h1>
                    <div style="font-size:14px;">${escapeHtml(unit.unit_name || '')}</div>
                    <div style="font-size:15px;margin-top:6px;">${escapeHtml(displayDate(m))}</div>
                </div>
                ${special ? `<p style="text-align:center;font-size:16px;">Não haverá reunião sacramental neste domingo.<br><em>${escapeHtml(m.special_note || m.meeting_type)}</em></p>` : `
                <table style="width:100%;font-size:13px;margin-bottom:14px;">
                    <tr><td colspan="2">Preside: <strong>${escapeHtml(m.presides || '___________')}</strong></td></tr>
                    <tr><td colspan="2">Dirige: <strong>${escapeHtml(m.conducts || '___________')}</strong></td></tr>
                    ${(m.visiting_leaders || []).filter((r) => r.name).map((r) =>
                        `<tr><td colspan="2">${escapeHtml(r.calling ? r.calling + ': ' : 'Líder visitante: ')}<strong>${escapeHtml(r.name)}</strong></td></tr>`
                    ).join('')}
                    <tr><td colspan="2">Regente: <strong>${escapeHtml(m.chorister || '___________')}</strong></td></tr>
                    <tr><td colspan="2">Piano/órgão: <strong>${escapeHtml(m.pianist || '___________')}</strong></td></tr>
                </table>
                <div style="border:1px solid #C4A35A;padding:10px 14px;margin-bottom:14px;background:#FBF7EE;">
                    <strong>Frequência</strong>
                    <div style="display:flex;gap:24px;margin-top:6px;">
                        <span>Membros: ${escapeHtml(m.members_count ?? '______')}</span>
                        <span>Visitantes: ${escapeHtml(m.visitors_count ?? '______')}</span>
                        <span>Total: ${escapeHtml((parseInt(m.members_count||0,10)+parseInt(m.visitors_count||0,10)) || '______')}</span>
                    </div>
                </div>
                ${m.announcements ? `<p><strong>Anúncios:</strong> ${escapeHtml(m.announcements)}</p>` : ''}
                <p><strong>Hino de abertura:</strong> ${escapeHtml(hymnLine(m.opening_hymn))}</p>
                <p><strong>Oração de abertura:</strong> ${escapeHtml(m.opening_prayer || '___________')}</p>
                ${biz('Desobrigações', (m.ward_business || {}).releases)}
                ${biz('Apoios', (m.ward_business || {}).sustainings)}
                ${biz('Confirmações', (m.ward_business || {}).confirmations)}
                ${biz('Ordenações', (m.ward_business || {}).ordinations)}
                ${(m.ward_business || {}).other ? `<p><strong>Outros assuntos:</strong> ${escapeHtml(m.ward_business.other)}</p>` : ''}
                <p><strong>Hino sacramental:</strong> ${escapeHtml(hymnLine(m.sacrament_hymn))}</p>
                <p><em>Administração do sacramento</em></p>
                <p style="margin-top:10px;"><strong>Programa</strong></p>
                ${programHtml}
                <p style="margin-top:14px;"><strong>Hino de encerramento:</strong> ${escapeHtml(hymnLine(m.closing_hymn))}</p>
                <p><strong>Oração de encerramento:</strong> ${escapeHtml(m.closing_prayer || '___________')}</p>
                `}
            </div>`;
    }

    function pngRow(label, value, valueHtml) {
        if (!value && !valueHtml) return '';
        return `
            <div style="margin:0 0 14px;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#9A7B32;margin-bottom:4px;">${escapeHtml(label)}</div>
                <div style="font-size:20px;line-height:1.35;color:#10233A;font-weight:600;word-break:break-word;">${valueHtml || escapeHtml(value)}</div>
            </div>`;
    }

    function pngSection(title, body) {
        if (!body) return '';
        return `
            <div style="margin:0 0 18px;padding:16px 16px 8px;background:#FFFEFB;border:1px solid #D9D1C3;border-radius:16px;">
                <div style="font-size:15px;font-weight:800;color:#002D5B;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #C4A35A;">${escapeHtml(title)}</div>
                ${body}
            </div>`;
    }

    function buildPngHtml(m, unit) {
        const special = m.meeting_type !== 'sacramental';
        const total = (parseInt(m.members_count || 0, 10) + parseInt(m.visitors_count || 0, 10)) || '';
        const bizBlock = (title, rows) => {
            const text = exportBizLines(title, rows);
            return text ? pngRow(title, text) : '';
        };
        const programLines = buildProgramExportLines(m);
        let programBody = '';
        if (special) {
            programBody = `<div style="font-size:20px;line-height:1.4;text-align:center;color:#10233A;">Não haverá reunião sacramental neste domingo.<br><em style="color:#5C6775;">${escapeHtml(m.special_note || m.meeting_type)}</em></div>`;
        } else if (!programLines.length) {
            programBody = pngRow('Programa', 'A definir');
        } else {
            programBody = programLines.map((line) => {
                if (line.kind === 'musical') return pngRow('Número musical', line.text);
                if (line.kind === 'hymn') return pngRow('Hino intermediário', line.text);
                if (line.kind === 'note') return pngRow('Programa', line.text);
                const detail = [line.topic, line.duration ? line.duration + ' min' : ''].filter(Boolean).join(' · ');
                const valueHtml = escapeHtml(line.name)
                    + (detail ? `<div style="font-size:16px;font-weight:500;color:#5C6775;margin-top:4px;line-height:1.35;">${escapeHtml(detail)}</div>` : '');
                return pngRow('Discursante ' + line.n, null, valueHtml);
            }).join('');
        }

        const peopleBody = special ? '' : (
            pngRow('Preside', m.presides || '—') +
            pngRow('Dirige', m.conducts || '—') +
            bizBlock('Líderes visitantes', m.visiting_leaders || []) +
            pngRow('Regente', m.chorister || '—') +
            pngRow('Piano / órgão', m.pianist || '—')
        );

        const freqBody = special ? '' : `
            <div style="display:flex;gap:10px;margin-bottom:8px;">
                <div style="flex:1;background:#F6F1E7;border-radius:12px;padding:12px;text-align:center;">
                    <div style="font-size:12px;color:#5C6775;font-weight:700;text-transform:uppercase;">Membros</div>
                    <div style="font-size:26px;font-weight:800;color:#002D5B;margin-top:4px;">${escapeHtml(m.members_count ?? '—')}</div>
                </div>
                <div style="flex:1;background:#F6F1E7;border-radius:12px;padding:12px;text-align:center;">
                    <div style="font-size:12px;color:#5C6775;font-weight:700;text-transform:uppercase;">Visitantes</div>
                    <div style="font-size:26px;font-weight:800;color:#002D5B;margin-top:4px;">${escapeHtml(m.visitors_count ?? '—')}</div>
                </div>
                <div style="flex:1;background:#002D5B;border-radius:12px;padding:12px;text-align:center;">
                    <div style="font-size:12px;color:#C4A35A;font-weight:700;text-transform:uppercase;">Total</div>
                    <div style="font-size:26px;font-weight:800;color:#fff;margin-top:4px;">${escapeHtml(total || '—')}</div>
                </div>
            </div>`;

        const openingBody = special ? '' : (
            (m.announcements ? pngRow('Anúncios', m.announcements) : '') +
            pngRow('Hino de abertura', hymnLine(m.opening_hymn)) +
            pngRow('Oração de abertura', m.opening_prayer || '—')
        );

        const businessBody = special ? '' : (
            bizBlock('Desobrigações', (m.ward_business || {}).releases) +
            bizBlock('Apoios', (m.ward_business || {}).sustainings) +
            bizBlock('Confirmações', (m.ward_business || {}).confirmations) +
            bizBlock('Ordenações', (m.ward_business || {}).ordinations) +
            ((m.ward_business || {}).other ? pngRow('Outros assuntos', m.ward_business.other) : '')
        );

        const sacramentBody = special ? '' : (
            pngRow('Hino sacramental', hymnLine(m.sacrament_hymn)) +
            '<div style="font-size:17px;line-height:1.4;color:#5C6775;font-style:italic;margin:0 0 12px;">Administração do sacramento</div>'
        );

        const closingBody = special ? '' : (
            pngRow('Hino de encerramento', hymnLine(m.closing_hymn)) +
            pngRow('Oração de encerramento', m.closing_prayer || '—')
        );

        return `
            <div id="pngExportRoot" style="width:390px;box-sizing:border-box;padding:22px 18px 28px;background:linear-gradient(180deg,#F6F1E7 0%,#FFFEFB 40%,#F6F1E7 100%);color:#10233A;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
                <div style="text-align:center;margin-bottom:18px;">
                    <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#002D5B;color:#C4A35A;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">Agenda Sacramental</div>
                    <h1 style="margin:12px 0 6px;font-size:28px;line-height:1.2;color:#002D5B;font-weight:800;">Reunião Sacramental</h1>
                    <div style="font-size:18px;line-height:1.35;font-weight:600;color:#1C2430;">${escapeHtml(unit.unit_name || '')}</div>
                    <div style="margin-top:8px;font-size:20px;font-weight:700;color:#9A7B32;">${escapeHtml(displayDate(m))}</div>
                    ${m.is_fast_sunday && !special ? '<div style="margin-top:8px;font-size:15px;color:#8B2E2E;font-weight:700;">Jejum e testemunhos</div>' : ''}
                </div>
                ${pngSection('Reconhecimentos', peopleBody)}
                ${pngSection('Frequência', freqBody)}
                ${pngSection('Abertura', openingBody)}
                ${pngSection('Assuntos da unidade', businessBody)}
                ${pngSection('Sacramento', sacramentBody)}
                ${pngSection('Programa', programBody)}
                ${pngSection('Encerramento', closingBody)}
                <div style="text-align:center;margin-top:8px;font-size:12px;color:#5C6775;line-height:1.4;">Agenda Sacramental · Alta Software</div>
            </div>`;
    }

    function triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    function downloadPdf() {
        const m = Object.assign({}, state.meeting, collectMeeting());
        const unit = state.user || {};
        const html = buildPdfHtml(m, unit);
        const holder = document.createElement('div');
        holder.innerHTML = html;
        if (shouldUsePrintForPdf()) {
            openPrintPdf(html);
            return;
        }
        const opt = {
            margin: 10,
            filename: 'agenda-sacramental-' + isoToFilenameDate(m.meeting_date) + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        };
        if (window.html2pdf) {
            window.html2pdf().set(opt).from(holder.firstElementChild).save().catch(function () {
                openPrintPdf(html);
            });
        } else {
            openPrintPdf(html);
        }
    }

    async function downloadPng() {
        if (!window.html2canvas) {
            toast('Não foi possível gerar o PNG neste dispositivo.');
            return;
        }
        const m = Object.assign({}, state.meeting, collectMeeting());
        const unit = state.user || {};
        const filename = 'agenda-sacramental-' + isoToFilenameDate(m.meeting_date) + '.png';
        const mount = document.createElement('div');
        mount.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;';
        mount.innerHTML = buildPngHtml(m, unit);
        document.body.appendChild(mount);
        const target = mount.firstElementChild;
        toast('Gerando imagem…', true);
        try {
            const canvas = await window.html2canvas(target, {
                scale: 2.5,
                useCORS: true,
                backgroundColor: '#F6F1E7',
                logging: false,
                width: 390,
                windowWidth: 390,
            });
            await new Promise(function (resolve, reject) {
                if (canvas.toBlob) {
                    canvas.toBlob(function (blob) {
                        if (!blob) {
                            reject(new Error('Falha ao criar PNG.'));
                            return;
                        }
                        triggerBlobDownload(blob, filename);
                        resolve();
                    }, 'image/png');
                } else {
                    const a = document.createElement('a');
                    a.href = canvas.toDataURL('image/png');
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    resolve();
                }
            });
            toast('PNG baixado.', true);
        } catch (err) {
            toast(err.message || 'Não foi possível gerar o PNG.');
        } finally {
            mount.remove();
        }
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hymn-picker')) {
            $$('.hymn-results').forEach((r) => r.classList.add('hidden'));
        }
    });

    document.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.hymn-picker')) {
            $$('.hymn-results').forEach((r) => r.classList.add('hidden'));
        }
    }, { passive: true });

    function closeAppConfirmFromUi() {
        closeAppConfirm(false);
    }

    $('#btnLogout').addEventListener('click', async () => {
        const ok = await askConfirm({
            title: 'Sair da conta?',
            message: 'Você precisará entrar novamente para acessar a agenda.',
            confirmLabel: 'Sair',
        });
        if (!ok) return;
        await api('api/auth.php?action=logout', { method: 'POST', body: {} });
        location.reload();
    });

    $('#appConfirmCancel').addEventListener('click', closeAppConfirmFromUi);

    $('#appConfirm').addEventListener('click', (e) => {
        if (e.target === $('#appConfirm')) closeAppConfirm(false);
    });

    $('#appConfirmOk').addEventListener('click', () => closeAppConfirm(true));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#appConfirm').classList.contains('hidden')) {
            closeAppConfirm(false);
        }
    });

    async function boot() {
        if ($('#resetToken').value) {
            showAuth('reset');
        }
        try {
            const data = await api('api/auth.php?action=session');
            if (data.authenticated) applySession(data);
        } catch (e) {}
    }

    function keepSessionAlive() {
        if (!state.user) return;
        api('api/auth.php?action=session').then((data) => {
            if (data && data.authenticated) {
                if (data.csrf_token) state.csrf = data.csrf_token;
                return;
            }
            state.user = null;
            $('#appView').classList.add('hidden');
            $('#authView').classList.remove('hidden');
        }).catch(() => {});
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') keepSessionAlive();
    });

    window.addEventListener('pageshow', (ev) => {
        if (ev.persisted) keepSessionAlive();
    });

    setInterval(keepSessionAlive, 15 * 60 * 1000);

    boot();
})();
