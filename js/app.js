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
            special_hymn: 'Hino especial / intermediário',
            closing_hymn: 'Hino de encerramento',
        }[slot] || slot;
    }

    function businessRows(list, type) {
        const items = list && list.length ? list : [{ name: '', calling: '' }];
        return items.map((item, i) => (
            '<div class="row g-2 mb-2 biz-row" data-type="' + type + '">' +
            '<div class="col-6"><input class="form-control form-control-sm biz-name" placeholder="Nome" value="' + escapeHtml(item.name || '') + '"></div>' +
            '<div class="col-6"><input class="form-control form-control-sm biz-calling" placeholder="Chamado" value="' + escapeHtml(item.calling || '') + '"></div></div>'
        )).join('');
    }

    function speakerCards(speakers, isFast) {
        if (isFast) {
            return '<p class="small mb-0">Neste domingo de jejum, o tempo após o sacramento é reservado aos testemunhos da congregação, conduzidos pelo Espírito.</p>';
        }
        const list = Array.isArray(speakers) ? speakers : [];
        return list.map((s, i) => (
            '<div class="speaker-card" data-idx="' + i + '">' +
            '<div class="d-flex justify-content-between mb-2"><strong>Discursante ' + (i + 1) + '</strong>' +
            '<button type="button" class="btn btn-sm btn-link text-danger p-0 btn-del-speaker">remover</button></div>' +
            '<div class="row g-2">' +
            '<div class="col-12"><input class="form-control sp-name" placeholder="Nome" value="' + escapeHtml(s.name || '') + '"></div>' +
            '<div class="col-12"><input class="form-control sp-topic" placeholder="Tema" value="' + escapeHtml(s.topic || '') + '"></div>' +
            '<div class="col-6"><input class="form-control sp-duration" placeholder="Tempo (min)" value="' + escapeHtml(s.duration || '') + '"></div>' +
            '<div class="col-6"><select class="form-select sp-role">' +
            option('jovem', s.role, 'Jovem') + option('adulto', s.role, 'Adulto') +
            option('principal', s.role, 'Orador principal') + option('visitante', s.role, 'Autoridade visitante') +
            '</select></div></div></div>'
        )).join('') + '<button type="button" class="btn btn-outline-navy btn-sm" id="btnAddSpeaker">Adicionar discursante</button>';
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
                        <button class="btn btn-outline-navy btn-sm" id="btnPdf">Baixar PDF</button>
                        <button class="btn btn-navy btn-sm" id="btnSave">Salvar agenda</button>
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
                    <h2>Frequência — registrar no início</h2>
                    <p class="small text-muted">Espaço para quem dirige anotar membros e visitantes antes de começar.</p>
                    <div class="attendance-grid">
                        <div><label class="form-label">Membros</label><input type="number" min="0" class="form-control" id="membersCount" value="${escapeHtml(members)}"></div>
                        <div><label class="form-label">Visitantes</label><input type="number" min="0" class="form-control" id="visitorsCount" value="${escapeHtml(visitors)}"></div>
                        <div class="total"><span>Total</span><strong id="attTotal">${escapeHtml(total)}</strong></div>
                    </div>
                </div>
                <div class="card-soft">
                    <h2>Presidência e música</h2>
                    <div class="person-row">
                        <div><label class="form-label">Preside</label><input class="form-control" id="presides" list="dl-preside" value="${escapeHtml(meeting.presides || '')}"></div>
                        <div><label class="form-label">Dirige</label><input class="form-control" id="conducts" list="dl-conduct" value="${escapeHtml(meeting.conducts || '')}"></div>
                        <div><label class="form-label">Regente</label><input class="form-control" id="chorister" list="dl-chorister" value="${escapeHtml(meeting.chorister || '')}"></div>
                        <div><label class="form-label">Piano / órgão</label><input class="form-control" id="pianist" list="dl-pianist" value="${escapeHtml(meeting.pianist || '')}"></div>
                    </div>
                    ${namesDatalist('dl-preside', prefs.preside_names)}
                    ${namesDatalist('dl-conduct', prefs.conduct_names)}
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
                    <p class="small text-muted">Apoios, dispensas, confirmações e ordenações — conforme o Manual Geral.</p>
                    <label class="form-label">Apoios</label>
                    <div id="biz-sustainings">${businessRows((meeting.ward_business || {}).sustainings, 'sustainings')}</div>
                    <label class="form-label">Dispensas</label>
                    <div id="biz-releases">${businessRows((meeting.ward_business || {}).releases, 'releases')}</div>
                    <label class="form-label">Confirmações</label>
                    <div id="biz-confirmations">${businessRows((meeting.ward_business || {}).confirmations, 'confirmations')}</div>
                    <label class="form-label">Ordenações / bênçãos</label>
                    <div id="biz-ordinations">${businessRows((meeting.ward_business || {}).ordinations, 'ordinations')}</div>
                    <label class="form-label">Outros assuntos</label>
                    <textarea class="form-control" id="bizOther" rows="2">${escapeHtml(((meeting.ward_business || {}).other) || '')}</textarea>
                </div>
                <div class="card-soft">
                    <h2>Sacramento</h2>
                    ${hymnPicker('sacrament_hymn', meeting.sacrament_hymn)}
                    <p class="small mb-0">Administração do sacramento pelos portadores do Sacerdócio Aarônico, sob a direção de quem preside.</p>
                </div>
                <div class="card-soft">
                    <h2>Programa</h2>
                    <div class="mb-3">
                        <label class="form-label">Número musical</label>
                        <div class="row g-2">
                            <div class="col-6"><input class="form-control" id="musicWho" placeholder="Quem apresenta" value="${escapeHtml((meeting.musical_number || {}).who || '')}"></div>
                            <div class="col-6"><input class="form-control" id="musicPiece" placeholder="Peça / hino" value="${escapeHtml((meeting.musical_number || {}).piece || '')}"></div>
                        </div>
                    </div>
                    ${hymnPicker('special_hymn', meeting.special_hymn)}
                    <div id="speakersWrap">${speakerCards(meeting.speakers, !!meeting.is_fast_sunday)}</div>
                </div>
                <div class="card-soft">
                    <h2>Encerramento</h2>
                    ${hymnPicker('closing_hymn', meeting.closing_hymn)}
                    <label class="form-label">Oração de encerramento</label>
                    <input class="form-control mb-3" id="closingPrayer" value="${escapeHtml(meeting.closing_prayer || '')}">
                    <label class="form-label">Observações de quem dirige</label>
                    <textarea class="form-control" id="notes" rows="2">${escapeHtml(meeting.notes || '')}</textarea>
                </div>
            </div>
            <div class="card-soft ${special ? '' : 'hidden'}" id="specialBox">
                <p class="mb-0">Neste domingo não haverá reunião sacramental na unidade. Use o campo acima para registrar o motivo e preserve o histórico no calendário.</p>
            </div>
        `;
        $('#page-agenda').innerHTML = html;
        bindAgendaEvents();
    }

    function collectBiz(type) {
        return $$(`#biz-${type} .biz-row`).map((row) => ({
            name: $('.biz-name', row).value.trim(),
            calling: $('.biz-calling', row).value.trim(),
        })).filter((x) => x.name || x.calling);
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

    function collectMeeting() {
        const m = state.meeting || {};
        const isFast = $('#isFast') ? $('#isFast').checked : false;
        const speakers = $$('#speakersWrap .speaker-card').map((card) => ({
            name: $('.sp-name', card).value.trim(),
            topic: $('.sp-topic', card).value.trim(),
            duration: $('.sp-duration', card).value.trim(),
            role: $('.sp-role', card).value,
        }));
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
            special_hymn: parseHymn('special_hymn'),
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
            speakers: speakers,
            is_fast_sunday: isFast,
            musical_number: {
                who: $('#musicWho') ? $('#musicWho').value.trim() : '',
                piece: $('#musicPiece') ? $('#musicPiece').value.trim() : '',
            },
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
            state.meeting = Object.assign({}, state.meeting, payload);
            renderAgenda(state.meeting);
        });

        $('#btnAddSpeaker') && $('#btnAddSpeaker').addEventListener('click', () => {
            const payload = collectMeeting();
            payload.speakers.push({ name: '', topic: '', duration: '', role: 'adulto' });
            state.meeting = Object.assign({}, state.meeting, payload);
            renderAgenda(state.meeting);
        });

        $$('.btn-del-speaker').forEach((btn) => {
            btn.addEventListener('click', () => {
                const payload = collectMeeting();
                const card = btn.closest('.speaker-card');
                const idx = $$('#speakersWrap .speaker-card').indexOf(card);
                payload.speakers.splice(idx, 1);
                state.meeting = Object.assign({}, state.meeting, payload);
                renderAgenda(state.meeting);
            });
        });

        $('#btnSave').addEventListener('click', async () => {
            try {
                const saved = await api('api/meetings.php?action=save', { method: 'POST', body: collectMeeting() });
                state.meeting = saved.meeting;
                toast('Agenda salva.', true);
            } catch (err) {
                toast(err.message);
            }
        });

        $('#btnPdf').addEventListener('click', () => downloadPdf());

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
        $('#page-history').innerHTML = `
            <div class="card-soft">
                <h2>Reuniões anteriores e futuras</h2>
                ${(data.meetings || []).map((m) => `
                    <div class="history-item">
                        <div>
                            <strong>${escapeHtml(m.formatted_date || formatIsoDateBr(m.meeting_date))}</strong>
                            <div class="small text-muted">${types[m.meeting_type] || m.meeting_type}${m.meeting_date > today ? ' · futura' : (m.meeting_date < today ? ' · anterior' : ' · atual')}</div>
                        </div>
                        <button class="btn btn-outline-navy btn-sm" data-open="${escapeHtml(m.meeting_date)}">Abrir</button>
                    </div>
                `).join('') || '<p class="text-muted mb-0">Nenhuma reunião salva ainda.</p>'}
            </div>`;
        $$('#page-history [data-open]').forEach((b) => {
            b.addEventListener('click', () => {
                go('agenda', { skipLoad: true });
                loadAgenda(b.getAttribute('data-open'));
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
            b.onclick = () => b.parentElement.remove();
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

    function downloadPdf() {
        const m = Object.assign({}, state.meeting, collectMeeting());
        const unit = state.user || {};
        const special = m.meeting_type !== 'sacramental';
        const biz = (title, rows) => {
            const lines = (rows || []).filter((r) => r.name);
            if (!lines.length) return '';
            return `<p><strong>${title}:</strong> ${lines.map((r) => r.name + (r.calling ? ' — ' + r.calling : '')).join('; ')}</p>`;
        };
        const speakers = (m.speakers || []).filter((s) => s.name).map((s, i) =>
            `<tr><td>${i + 1}.</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.topic || '')}</td><td>${escapeHtml(s.duration || '')}</td></tr>`
        ).join('');

        const html = `
            <div style="font-family:Georgia,'Times New Roman',serif;color:#10233A;padding:24px;width:720px;">
                <div style="text-align:center;border-bottom:3px solid #002D5B;padding-bottom:12px;margin-bottom:16px;">
                    <h1 style="margin:8px 0 4px;font-size:26px;color:#002D5B;">Reunião Sacramental</h1>
                    <div style="font-size:14px;">${escapeHtml(unit.unit_name || '')}</div>
                    <div style="font-size:15px;margin-top:6px;">${escapeHtml(displayDate(m))}</div>
                </div>
                ${special ? `<p style="text-align:center;font-size:16px;">Não haverá reunião sacramental neste domingo.<br><em>${escapeHtml(m.special_note || m.meeting_type)}</em></p>` : `
                <table style="width:100%;font-size:13px;margin-bottom:14px;">
                    <tr><td>Preside: <strong>${escapeHtml(m.presides || '___________')}</strong></td><td>Dirige: <strong>${escapeHtml(m.conducts || '___________')}</strong></td></tr>
                    <tr><td>Regente: <strong>${escapeHtml(m.chorister || '___________')}</strong></td><td>Piano/órgão: <strong>${escapeHtml(m.pianist || '___________')}</strong></td></tr>
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
                ${biz('Apoios', (m.ward_business || {}).sustainings)}
                ${biz('Dispensas', (m.ward_business || {}).releases)}
                ${biz('Confirmações', (m.ward_business || {}).confirmations)}
                ${biz('Ordenações', (m.ward_business || {}).ordinations)}
                ${(m.ward_business || {}).other ? `<p><strong>Outros assuntos:</strong> ${escapeHtml(m.ward_business.other)}</p>` : ''}
                <p><strong>Hino sacramental:</strong> ${escapeHtml(hymnLine(m.sacrament_hymn))}</p>
                <p><em>Administração do sacramento</em></p>
                ${(m.musical_number || {}).piece ? `<p><strong>Número musical:</strong> ${escapeHtml(m.musical_number.who)} — ${escapeHtml(m.musical_number.piece)}</p>` : ''}
                <p><strong>Hino especial:</strong> ${escapeHtml(hymnLine(m.special_hymn))}</p>
                ${m.is_fast_sunday ? '<p><strong>Reunião de jejum e testemunhos</strong></p>' : `
                    <p><strong>Discursos</strong></p>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead><tr style="border-bottom:1px solid #002D5B;text-align:left;"><th></th><th>Nome</th><th>Tema</th><th>Tempo</th></tr></thead>
                        <tbody>${speakers || '<tr><td colspan="4">________________________________</td></tr>'}</tbody>
                    </table>`}
                <p style="margin-top:14px;"><strong>Hino de encerramento:</strong> ${escapeHtml(hymnLine(m.closing_hymn))}</p>
                <p><strong>Oração de encerramento:</strong> ${escapeHtml(m.closing_prayer || '___________')}</p>
                `}
            </div>`;
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

    function closeLogoutConfirm() {
        const overlay = $('#logoutConfirm');
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    }

    $('#btnLogout').addEventListener('click', () => {
        const overlay = $('#logoutConfirm');
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        $('#logoutCancel').focus();
    });

    $('#logoutCancel').addEventListener('click', closeLogoutConfirm);

    $('#logoutConfirm').addEventListener('click', (e) => {
        if (e.target === $('#logoutConfirm')) closeLogoutConfirm();
    });

    $('#logoutConfirmBtn').addEventListener('click', async () => {
        await api('api/auth.php?action=logout', { method: 'POST', body: {} });
        location.reload();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#logoutConfirm').classList.contains('hidden')) {
            closeLogoutConfirm();
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

    boot();
})();
