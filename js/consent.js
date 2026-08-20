(function () {
    'use strict';

    const STORAGE_KEY = 'sacramental_lgpd_consent';

    window.SACConsent = {
        granted: false,
        decided: false,
    };

    const banner = document.getElementById('consentBanner');
    if (!banner) return;

    function todayKey() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date());
        const get = function (type) {
            const part = parts.find(function (p) { return p.type === type; });
            return part ? part.value : '';
        };
        return get('year') + '-' + get('month') + '-' + get('day');
    }

    function readStoredConsent() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function saveConsent(granted) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                date: todayKey(),
                granted: granted,
                timestamp: new Date().toISOString(),
            }));
        } catch (e) {
            /* Safari em modo privado pode bloquear localStorage */
        }
    }

    function applyConsent(granted) {
        window.SACConsent.granted = granted;
        window.SACConsent.decided = true;
        banner.classList.add('hidden');
        banner.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('consent-banner-open');
        window.dispatchEvent(new CustomEvent('sac:consent', { detail: { granted: granted } }));
    }

    function showBanner() {
        banner.classList.remove('hidden');
        banner.setAttribute('aria-hidden', 'false');
        document.body.classList.add('consent-banner-open');
    }

    const acceptBtn = document.getElementById('consentAccept');
    const declineBtn = document.getElementById('consentDecline');

    if (acceptBtn) {
        acceptBtn.addEventListener('click', function () {
            saveConsent(true);
            applyConsent(true);
        });
    }

    if (declineBtn) {
        declineBtn.addEventListener('click', function () {
            saveConsent(false);
            applyConsent(false);
        });
    }

    const stored = readStoredConsent();
    if (stored && stored.date === todayKey()) {
        applyConsent(stored.granted === true);
    } else {
        showBanner();
    }
})();
