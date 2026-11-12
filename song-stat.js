// ==========================================================
// 📊 주제곡 재생 세기 (v2.124.0) — 학부모님들이 어떤 곡을 많이 듣는지 (인기곡 · 운영진 통계)
//   · 이 휴대폰에 「어느 곡을 몇 번 들었나」만 모아 두었다가(localStorage daeyeon_stat) 앱을 내리거나 닫을 때 6시간에 한 번 묶어서 서버로 보냄
//     (서버 v2.44.0 songPlays → 시트 「재생통계」 탭) — 이름 · 전화번호 · 기기 번호는 보내지 않음
//   · 30초 넘게 들어야 1회 (짧은 곡은 절반) · 바로 넘긴 곡 · 건너뛴 자리는 안 셈 · 한 곡 반복은 돌 때마다 1회
//   · 「가족 수」: 이 휴대폰이 그날 그 곡을 처음 보고할 때만 1 → 한 집이 하루에 50번 들어도 1가족
//   · 타석 모드 등장곡은 따로 셈(3초 넘게 나오면 1회) — 인기곡 순위에는 안 섞임
//   · 서버 주소 · 열쇠는 페이지의 GOOGLE_SCRIPT_UNIFORM_API_URL · API_KEY · getToken 을 씀 (index.html · player.html 둘 다 있음)
// 이 파일을 고치면 index.html · player.html 의 song-stat.js?v=… 숫자도 같이 올리기
// ==========================================================
(function () {
    'use strict';
    const KEY = 'daeyeon_stat', GAP = 6 * 60 * 60 * 1000, MIN_SEC = 30, BAT_SEC = 3, KEEP_DAYS = 3;
    const pad = n => String(n).padStart(2, '0');
    const dayOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const today = () => dayOf(new Date());
    function load() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
        if (!s || typeof s !== 'object') s = {};
        s.q = s.q && typeof s.q === 'object' ? s.q : {};        // 아직 안 보낸 것: { 날짜: { s: { 곡id: [재생, 타석] }, h: [24] } }
        s.sent = s.sent && typeof s.sent === 'object' ? s.sent : {};   // 그날 이미 「가족 1」로 보낸 곡: { 날짜: [곡id] }
        s.dev = s.dev && typeof s.dev === 'object' ? s.dev : {};       // 그날 「기기 1」을 보냈나: { 날짜: 1 }
        s.last = Number(s.last) || 0;                                  // 마지막으로 보낸 때
        return s;
    }
    function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
    function prune(s) {   // 서버가 받지 않는 오래된 날짜는 버림
        const lo = dayOf(new Date(Date.now() - KEEP_DAYS * 86400000));
        ['q', 'sent', 'dev'].forEach(k => Object.keys(s[k]).forEach(d => { if (d < lo) delete s[k][d]; }));
    }
    function hit(id, bat) {
        if (!id) return;
        const s = load(), d = today(), q = s.q[d] || (s.q[d] = { s: {}, h: [] });
        const v = q.s[id] || (q.s[id] = [0, 0]);
        if (bat) v[1] = Math.min(20, v[1] + 1);
        else {
            v[0] = Math.min(30, v[0] + 1);
            const h = new Date().getHours();
            for (let i = 0; i < 24; i++) q.h[i] = q.h[i] || 0;
            q.h[h] = Math.min(60, q.h[h] + 1);
        }
        prune(s); store(s);
    }
    // 오디오 요소 하나를 지켜봄 · cur() → { id, bat } (지금 곡) | null (세지 않음: 안내 방송 등)
    function watch(audio, cur) {
        if (!audio || audio._songStat) return;
        audio._songStat = true;
        let id = null, acc = 0, last = 0, counted = false;
        const reset = () => { id = null; acc = 0; counted = false; };
        audio.addEventListener('timeupdate', () => {
            let c = null;
            try { c = cur(); } catch (e) {}
            const t = audio.currentTime || 0;
            if (!c || !c.id) { reset(); last = t; return; }
            if (c.id !== id) { id = c.id; acc = 0; counted = false; last = t; return; }
            const dt = t - last; last = t;
            if (dt > 0 && dt < 1.6 && !audio.paused) acc += dt;   // 건너뛰기(큰 차이)는 안 셈
            const dur = audio.duration;
            const need = c.bat ? BAT_SEC : (isFinite(dur) && dur > 0 ? Math.min(MIN_SEC, dur / 2) : MIN_SEC);
            if (!counted && acc >= need) { counted = true; hit(c.id, !!c.bat); }
        });
        audio.addEventListener('ended', reset);       // 한 곡 반복이면 다음 바퀴를 또 셈
        audio.addEventListener('emptied', reset);
    }
    function payload(s) {
        const d = [];
        Object.keys(s.q).sort().forEach(day => {
            const q = s.q[day], sent = new Set(s.sent[day] || []), o = {};
            let any = false, heard = false;
            Object.keys(q.s || {}).slice(0, 160).forEach(id => {
                const v = q.s[id], fam = v[0] > 0 && !sent.has(id) ? 1 : 0;
                if (!v[0] && !v[1]) return;
                o[id] = [v[0], fam, v[1]]; any = true; if (v[0] > 0) heard = true;
            });
            if (!any) return;
            const h = Array.isArray(q.h) && q.h.some(Boolean) ? Array.from({ length: 24 }, (_, i) => q.h[i] || 0) : null;
            d.push({ day: day, s: o, f: heard && !s.dev[day] ? 1 : 0, h: h });
        });
        return d;
    }
    function send(body) {
        let url = '', key = '', tok = '';
        try { url = GOOGLE_SCRIPT_UNIFORM_API_URL; key = API_KEY; tok = typeof getToken === 'function' ? getToken() : ''; } catch (e) { return false; }
        if (!url || !key) return false;
        const text = JSON.stringify(Object.assign({ key: key, token: tok, action: 'songPlays' }, body));
        try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([text], { type: 'text/plain;charset=utf-8' }))) return true; } catch (e) {}
        try { fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text }).catch(() => {}); return true; } catch (e) { return false; }
    }
    // 보낼 것이 있고 마지막으로 보낸 지 6시간이 지났으면 묶어서 보냄 (force: 시간 상관없이)
    function flush(force) {
        const s = load();
        prune(s);
        if (!force && Date.now() - s.last < GAP) return false;
        const d = payload(s);
        if (!d.length) { store(s); return false; }
        if (!navigator.onLine && navigator.onLine !== undefined) return false;
        if (!send({ d: d })) return false;
        d.forEach(x => {
            const set = new Set(s.sent[x.day] || []);
            Object.keys(x.s).forEach(id => { if (x.s[id][0] > 0) set.add(id); });
            s.sent[x.day] = Array.from(set);
            if (x.f) s.dev[x.day] = 1;
            delete s.q[x.day];
        });
        s.last = Date.now();
        store(s);
        return true;
    }
    // 앱을 내리거나 닫을 때 · 켜 두고 오래 들을 때(30분마다 확인)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(false); });
    window.addEventListener('pagehide', () => flush(false));
    setInterval(() => flush(false), 30 * 60 * 1000);
    window.songStat = { watch: watch, hit: hit, flush: flush, _load: load };
})();
