// ==========================================================
// 🎧 주제곡 플레이리스트 (v2.106.0) — 전체 선수 주제곡을 음악 앱처럼 이어 듣기
//   · 「음악」 탭: 전체 곡 목록(학년별 · 우리 아이) · 전체 재생 · 셔플 재생
//   · 아래 작은 플레이어 띠: 다른 탭으로 가도 계속 재생 · 누르면 큰 플레이어
//   · 큰 플레이어: 셔플 · 전체 반복 / 한 곡 반복 / 반복 끔 · 이전 · 다음 · 막대로 건너뛰기 · 큰 글씨 세 줄 가사 → 누르면 전체 가사
//       (아래 탭은 그대로 보임 · 「닫기」 · 휴대폰 뒤로 가기 · 아래 탭 누르기로 닫힘 · 닫아도 계속 재생)
//   · ⚾ 타석 모드: 등번호 버튼 한 번 → 그 선수 곡이 후렴부터 바로 · 「오늘 타순」을 넣어 두면 「다음 타자」 버튼 하나로
//       · 서서히 끄기 · 20초 뒤 자동 끄기 · 타순 곡 미리 받아 두기(경기장 인터넷이 느려도 바로 나오게)
//   · 휴대폰 잠금 화면 · 알림 창에서 이전 · 멈춤 · 다음 (Media Session)
// 곡 목록은 cheer-songs.json (cheer-songs.js 가 받음) · 명단에 보이는 선수의 곡만 · 구글 서버 · 시트에는 묻지 않음
// 설정(셔플 · 반복 · 타순 · 타석 곡)은 이 기기에만 저장(daeyeon_pl) · 이 파일을 고치면 index.html 의 playlist.js?v=… 숫자도 같이 올리기
// ==========================================================
(function () {
    'use strict';
    const LS_KEY = 'daeyeon_pl', SS_KEY = 'daeyeon_pl_now', CACHE_NAME = 'daeyeon-walkup-v1';
    const LEAD = 0.15;        // 가사 줄을 눈으로 따라 읽기 좋게 조금 먼저 바꿈 (초) — 선수 상세와 같음
    const WALK_SEC = 20;      // 타석 곡: 이만큼 지나면 자동으로 서서히 끔 (켜 둔 경우)
    const HOLD_MAX = 3 * 60 * 60 * 1000;   // 타석 모드 화면에서 자동 잠금을 미루는 시간 (켠 뒤 최대 3시간)
    const AWAY_MAX = 10 * 60 * 1000;       // 화면을 끄거나 다른 앱에 이보다 오래 가 있었으면 미루지 않음
    const FADE_MS = 1600;     // 서서히 끄기 길이
    const I = {
        play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>',
        next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5v14l10-7z"/><rect x="16.5" y="5" width="2.8" height="14" rx="1"/></svg>',
        prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 5v14L9 12z"/><rect x="4.7" y="5" width="2.8" height="14" rx="1"/></svg>',
        shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h3.5c2.5 0 4 1.2 5.5 5s3 5 5.5 5H21"/><path d="M3 17h3.5c1.6 0 2.8-.5 3.8-1.8M14 8.6c1-1 2-1.6 3.5-1.6H21"/><path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/></svg>',
        repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M17 3l3 3-3 3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4M7 21l-3-3 3-3"/></svg>',
        repeat1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M17 3l3 3-3 3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4M7 21l-3-3 3-3"/><path d="M11 10.2l1.4-.9v5.6" stroke-width="1.9"/></svg>',
        down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
    };
    const REPEAT_LABEL = { all: '전체 반복', one: '한 곡 반복', off: '반복 끔' };
    const $ = id => document.getElementById(id);
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const lenSec = t => { const m = /^(\d+):(\d{1,2})$/.exec(String(t || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
    const shuffled = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; };
    const root = document.documentElement;
    const notify = (text, sub) => { try { if (typeof bkNotify === 'function') bkNotify('info', text, sub || '', { ms: 3500 }); } catch (e) {} };

    // ---------------- 이 기기에 저장하는 설정 ----------------
    const cfg = { shuffle: false, repeat: 'all', hook: true, auto20: true, lineup: [], walkSong: {}, batIdx: -1, xl: false };
    try {
        const j = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
        if (typeof j.shuffle === 'boolean') cfg.shuffle = j.shuffle;
        if (REPEAT_LABEL[j.repeat]) cfg.repeat = j.repeat;
        if (typeof j.hook === 'boolean') cfg.hook = j.hook;
        if (typeof j.auto20 === 'boolean') cfg.auto20 = j.auto20;
        if (Array.isArray(j.lineup)) cfg.lineup = j.lineup.filter(x => typeof x === 'string').slice(0, 30);
        if (j.walkSong && typeof j.walkSong === 'object') cfg.walkSong = j.walkSong;
        if (typeof j.batIdx === 'number') cfg.batIdx = j.batIdx;
        if (typeof j.xl === 'boolean') cfg.xl = j.xl;
    } catch (e) {}
    function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }

    // ---------------- 상태 ----------------
    let people = [], tracks = [], byId = new Map(), sig = '';   // 명단에 보이는 선수와 곡
    let base = [], order = [], qi = -1, cur = null;             // 재생 줄(고른 목록 · 실제 순서 · 지금 자리 · 지금 곡)
    let attached = false, pendingSeek = null, fails = 0;        // 음원 붙였는지 · 붙인 뒤 옮길 자리 · 연달아 실패한 횟수
    let walk = false, walkHeard = 0, walkLast = 0, fadeTimer = 0;   // 타석 곡 재생 중 · 흘러나온 시간 · 직전 자리 · 서서히 끄는 중
    let view = 'list', filter = 'all', mode = '', pickPid = ''; // 음악 탭 안: 전체 곡/타석 · 학년 걸러 보기 · 타순 정하기/곡 고르기
    let built = false, audio = null, raf = 0, seeking = false, seekF = 0;
    let lines = [], spans = null, kIdx = -2;                    // 가사 줄 · 시간표 · 지금 줄
    let bigOpen = false, lyrOpen = false, wake = null, preBusy = false, preText = '';
    const blobUrl = {};                                         // 미리 받아 둔 곡: 음원 주소 → 기기 안 주소

    const personOf = pid => people.find(p => p.pid === pid) || null;
    const who = t => `${t.name} · ${t.g ? t.g + '학년 ' : ''}${t.no ? t.no + '번' : ''}`.trim();
    const mood = t => [t.beat, t.vocal].filter(Boolean).join(' · ');
    const cover = (t, cls) => `<span class="pl-cv pl-g${t.g || 0}${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(t.no || '♪')}</span>`;

    // ---------------- 곡 목록 만들기 (명단 + cheer-songs.json) ----------------
    function sync() {
        let ps;
        try { ps = players; } catch (e) { return; }   // index.html 의 명단
        if (!Array.isArray(ps) || typeof window.cheerSongFor !== 'function' || typeof window.cheerVersions !== 'function') return;
        const ppl = [];
        ps.forEach(p => {
            if (!p || !p.name || p.visible === false) return;
            try { if (isStaff(p.grade)) return; } catch (e) {}
            const song = window.cheerSongFor(p);
            if (!song) return;
            const vers = window.cheerVersions(song);
            if (!vers.length) return;
            const g = parseInt(String(p.grade || '').replace(/[^0-9]/g, ''), 10) || parseInt(song.grade, 10) || 0;
            const pid = (p.no || 0) + '/' + p.name;
            let mine = false;
            try { mine = !!isParentOfPlayer(p); } catch (e) {}
            const person = { pid: pid, no: p.no || 0, name: p.name, g: g, mine: mine, pos: p.pos && p.pos !== '-' ? String(p.pos) : '', src: p, tracks: [] };
            vers.forEach(v => person.tracks.push({
                id: pid + '/' + v.key, pid: pid, no: person.no, name: p.name, g: g, key: v.key,
                title: v.title || v.label || (p.name + ' 주제곡'), src: v.src, len: v.len || '', beat: v.beat || '', vocal: v.vocal || '', lyrics: v.lyrics, times: v.times
            }));
            ppl.push(person);
        });
        ppl.sort((a, b) => (b.g - a.g) || (a.no - b.no) || a.name.localeCompare(b.name));
        const s = ppl.map(p => p.pid + (p.mine ? '*' : '') + '~' + p.pos + '~' + (p.src.photoLink || '') + (p.src.hidePhoto ? 'h' : '') + ':' + p.tracks.map(t => t.key + '~' + t.title + '~' + t.src.slice(-14)).join(',')).join('|');
        if (s === sig) return;
        sig = s; people = ppl; tracks = []; byId = new Map();
        ppl.forEach(p => p.tracks.forEach(t => { tracks.push(t); byId.set(t.id, t); }));
        base = base.filter(id => byId.has(id)); order = order.filter(id => byId.has(id));
        if (cur) {
            if (byId.has(cur.id)) { cur = byId.get(cur.id); qi = order.indexOf(cur.id); if (qi < 0) { setQueue(tracks.map(t => t.id), cur.id); } }
            else stopAll();
        }
        const n0 = cfg.lineup.length;
        cfg.lineup = cfg.lineup.filter(pid => !!personOf(pid));
        if (cfg.lineup.length !== n0) { cfg.batIdx = -1; saveCfg(); }
        if (filter !== 'all' && filter !== 'mine' && !people.some(p => String(p.g) === String(filter))) filter = 'all';
        if (filter === 'mine' && !people.some(p => p.mine)) filter = 'all';
        if (!cur) restore();
        renderAll();
    }

    // ---------------- 재생 ----------------
    function ensureAudio() {
        if (audio) return audio;
        audio = document.createElement('audio');
        audio.id = 'plAudio'; audio.preload = 'none';
        audio.style.display = 'none';
        document.body.appendChild(audio);
        audio.addEventListener('playing', () => { fails = 0; hideMsg(); paintState(); startLoop(); });
        audio.addEventListener('pause', () => { paintState(); });
        audio.addEventListener('ended', () => next(true));
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('durationchange', paintTime);
        audio.addEventListener('loadedmetadata', () => {
            if (pendingSeek != null) { const at = pendingSeek; pendingSeek = null; try { if (Math.abs(audio.currentTime - at) > 0.5) audio.currentTime = at; } catch (e) {} }
            paintTime();
        });
        audio.addEventListener('error', onError);
        return audio;
    }
    function setQueue(ids, startId) {
        base = ids.slice();
        order = cfg.shuffle ? [startId].concat(shuffled(base.filter(i => i !== startId))) : base.slice();
        qi = order.indexOf(startId);
    }
    function attach(at) {   // 지금 곡의 음원을 붙임 (미리 받아 둔 곡이면 기기 안 것을 씀)
        const src = blobUrl[cur.src] || cur.src;
        pendingSeek = at > 0 ? at : null;
        audio.src = at > 0 ? src + '#t=' + at.toFixed(1) : src;
        attached = true;
    }
    function load(t, andPlay, at) {
        ensureAudio();
        clearFade();
        cur = t; attached = false; pendingSeek = at > 0 ? at : null;
        if (andPlay) { attach(at || 0); play(); }
        else { try { audio.removeAttribute('src'); audio.load(); } catch (e) {} }
        prepLyrics(); renderNow(); paintState(); paintTime(); setMeta();
    }
    function play() {
        if (!cur) return;
        ensureAudio();
        if (!attached) attach(pendingSeek || 0);
        try { audio.volume = 1; } catch (e) {}
        const pr = audio.play();
        if (pr && pr.catch) pr.catch(e => { if (e && e.name !== 'AbortError' && e.name !== 'NotSupportedError') showMsg('재생하지 못했어요. ▶ 를 한 번 더 눌러 주세요.'); paintState(); });
    }
    function playTrack(id, ids) {
        const t = byId.get(id);
        if (!t) return;
        if (cur && cur.id === id && attached && !walk) { toggle(); return; }   // 듣던 곡을 다시 누르면 멈춤/이어 듣기
        walk = false;
        setQueue(ids && ids.indexOf(id) >= 0 ? ids : tracks.map(x => x.id), id);
        load(t, true);
    }
    function playAll(ids, shuffle) {
        if (!ids || !ids.length) return;
        cfg.shuffle = !!shuffle; saveCfg();
        const first = shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
        walk = false;
        setQueue(ids, first);
        load(byId.get(first), true);
    }
    function toggle() {
        if (!cur) { playAll(tracks.map(t => t.id), cfg.shuffle); return; }
        ensureAudio();
        if (audio.paused || !attached) { clearFade(); play(); } else audio.pause();
    }
    function next(auto) {
        if (!cur) return;
        if (auto && walk) { walk = false; paintState(); return; }                      // 타석 곡은 끝나면 그대로 멈춤
        if (auto && cfg.repeat === 'one') { try { audio.currentTime = 0; } catch (e) {} play(); return; }
        walk = false;
        if (qi < order.length - 1) qi++;
        else if (auto && cfg.repeat === 'off') { try { audio.currentTime = 0; } catch (e) {} paintState(); paintTime(); return; }   // 마지막 곡이 끝남
        else { if (cfg.shuffle) order = shuffled(base); qi = 0; }
        const t = byId.get(order[qi]);
        if (t) load(t, true);
    }
    function prev() {
        if (!cur) return;
        walk = false;
        if (attached && audio.currentTime > 3) { try { audio.currentTime = 0; } catch (e) {} if (audio.paused) play(); return; }
        qi = (qi - 1 + order.length) % order.length;
        const t = byId.get(order[qi]);
        if (t) load(t, true);
    }
    function toggleShuffle() {
        cfg.shuffle = !cfg.shuffle; saveCfg();
        if (cur) setQueue(base.length ? base : tracks.map(t => t.id), cur.id);
        paintState(); renderNow();
    }
    function cycleRepeat() { cfg.repeat = cfg.repeat === 'all' ? 'one' : cfg.repeat === 'one' ? 'off' : 'all'; saveCfg(); paintState(); }
    function seekTo(sec) {
        if (!cur) return;
        if (!attached) { pendingSeek = sec; paintTime(); return; }
        try { audio.currentTime = Math.max(0, sec); } catch (e) {}
        paintTime();
    }
    function stopAll() {
        clearFade();
        try { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } } catch (e) {}
        cur = null; qi = -1; attached = false; walk = false; pendingSeek = null;
        closeBig(); renderNow(); paintState();
    }
    function onTime() {
        if (walk) {   // 타석 곡: 실제로 흘러나온 시간을 셈 (건너뛴 만큼은 안 셈 → 후렴 자리로 못 간 기기에서도 20초를 다 들려줌)
            const c = audio.currentTime, d = c - walkLast;
            walkLast = c;
            if (d > 0 && d < 1.5) walkHeard += d;
            if (cfg.auto20 && !fadeTimer && !audio.paused && walkHeard >= WALK_SEC) fadeOut();
        }
        paintTime();
    }
    function onError() {
        if (!cur || !attached || !audio.getAttribute('src')) return;
        if (blobUrl[cur.src] && audio.src.indexOf('blob:') === 0) {   // 받아 둔 파일이 깨졌으면 인터넷 것으로 다시
            try { URL.revokeObjectURL(blobUrl[cur.src]); } catch (e) {}
            delete blobUrl[cur.src];
            const at = audio.currentTime || pendingSeek || 0;
            attach(at); play(); return;
        }
        fails++;
        showMsg('곡을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
        paintState();
        if (!walk && fails < 3 && order.length > 1) setTimeout(() => { if (fails && fails < 3) next(true); }, 1500);   // 다음 곡으로 넘어가 봄 (3번까지만)
    }
    // 서서히 끄기 — 소리를 줄이며 멈춤 (아이폰은 소리 크기를 못 바꿔서 끝에 바로 멈춤)
    function clearFade() { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; } try { if (audio) audio.volume = 1; } catch (e) {} paintVol(1); }
    function fadeOut() {
        if (!audio || audio.paused || fadeTimer) return;
        const t0 = Date.now();
        fadeTimer = setInterval(() => {
            const k = 1 - (Date.now() - t0) / FADE_MS;
            if (k <= 0) { clearInterval(fadeTimer); fadeTimer = 0; try { audio.pause(); audio.volume = 1; } catch (e) {} walk = false; paintVol(1); paintState(); }
            else { try { audio.volume = k * k; } catch (e) {} paintVol(k); }
        }, 50);
        paintState();
    }

    // 🔒 잠금 화면 · 알림 창 조작
    function setMeta() {
        if (!('mediaSession' in navigator) || !cur) return;
        try {
            const art = n => new URL('icons/icon-' + n + '.png', location.href).href;
            navigator.mediaSession.metadata = new MediaMetadata({
                title: cur.title, artist: who(cur), album: '대연초 야구부 주제곡',
                artwork: [{ src: art(192), sizes: '192x192', type: 'image/png' }, { src: art(512), sizes: '512x512', type: 'image/png' }]
            });
        } catch (e) {}
    }
    function setupMediaKeys() {
        if (!('mediaSession' in navigator)) return;
        const on = (k, f) => { try { navigator.mediaSession.setActionHandler(k, f); } catch (e) {} };
        on('play', () => { if (cur) { clearFade(); play(); } });
        on('pause', () => { if (audio) audio.pause(); });
        on('previoustrack', prev);
        on('nexttrack', () => next(false));
        on('seekto', d => { if (d && typeof d.seekTime === 'number') seekTo(d.seekTime); });
    }

    // 다른 화면(선수 상세)에 다녀와도 듣던 곡 · 자리를 기억 (돌아오면 ▶ 한 번으로 이어 듣기)
    function remember() {
        try {
            if (!cur) { sessionStorage.removeItem(SS_KEY); return; }
            sessionStorage.setItem(SS_KEY, JSON.stringify({ id: cur.id, pos: attached && audio ? Math.floor(audio.currentTime || 0) : (pendingSeek || 0) }));
        } catch (e) {}
    }
    function restore() {
        try {
            const j = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
            if (!j || !byId.has(j.id)) return;
            setQueue(tracks.map(t => t.id), j.id);
            load(byId.get(j.id), false, +j.pos || 0);
        } catch (e) {}
    }

    // ---------------- ⚾ 타석 ----------------
    function walkTrack(person) { const k = cfg.walkSong[person.pid]; return person.tracks.find(t => t.key === k) || person.tracks[0]; }
    function hookTime(t) {   // 후렴이 시작하는 자리 (가사 시간표에서 찾음 · 없으면 처음부터)
        try {
            const tm = window.cheerLineTimes(t);
            if (!tm) return 0;
            let i = 0;
            const blocks = window.cheerLyricBlocks(t);
            for (let b = 0; b < blocks.length; b++) {
                const ch = /후렴|chorus/i.test(blocks[b].label || '');
                for (let k = 0; k < blocks[b].lines.length; k++, i++) if (ch && tm[i]) return Math.max(0, tm[i].s - 0.4);
            }
        } catch (e) {}
        return 0;
    }
    function playWalk(pid) {
        const person = personOf(pid);
        if (!person) return;
        const t = walkTrack(person);
        const at = cfg.hook ? hookTime(t) : 0;
        setQueue(tracks.map(x => x.id), t.id);
        load(t, true, at);
        walk = true; walkHeard = 0; walkLast = at;
        const li = cfg.lineup.indexOf(pid);
        if (li >= 0 && li !== cfg.batIdx) { cfg.batIdx = li; saveCfg(); }
        renderBat();
    }
    function nextBatter() {
        const n = cfg.lineup.length;
        if (!n) return;
        cfg.batIdx = (cfg.batIdx + 1) % n; saveCfg();
        playWalk(cfg.lineup[cfg.batIdx]);
    }
    // 타순 곡 미리 받아 두기 — 기기에 저장해 두면 인터넷이 느려도 바로 나옴 (타순에서 빠진 곡은 지움)
    function lineupTracks() { return cfg.lineup.map(personOf).filter(Boolean).map(walkTrack); }
    async function preload() {
        if (preBusy) return;
        const list = lineupTracks();
        if (!list.length) return;
        if (!('caches' in window)) { preText = '이 기기에서는 미리 받기를 쓸 수 없어요'; renderBat(); return; }
        preBusy = true; let done = 0, bad = 0;
        const say = () => { preText = `받는 중… ${done + bad} / ${list.length}`; const el = $('plPreTxt'); if (el) el.textContent = preText; };
        say(); renderBat();
        try {
            const c = await caches.open(CACHE_NAME);
            for (const t of list) {
                try {
                    let r = await c.match(t.src);
                    if (!r) { r = await fetch(t.src, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(t.src, r.clone()); }
                    if (!blobUrl[t.src]) blobUrl[t.src] = URL.createObjectURL(await r.blob());
                    done++;
                } catch (e) { bad++; console.warn('타석 곡 미리 받기 실패:', t.title, e); }
                say();
            }
            const keep = new Set(list.map(t => t.src));
            (await c.keys()).forEach(req => { if (!keep.has(req.url)) c.delete(req); });
        } catch (e) { bad = list.length - done; }
        preBusy = false;
        preText = bad ? `${done}곡 받아 둠 · ${bad}곡은 못 받았어요 (인터넷 확인 후 다시)` : `${done}곡 받아 둠 ✓ 인터넷이 느려도 바로 나와요`;
        renderBat();
    }
    async function hydrate() {   // 타석 모드를 열 때: 전에 받아 둔 곡을 바로 쓸 수 있게 올려 둠
        if (!('caches' in window) || preBusy) return;
        const list = lineupTracks();
        if (!list.length) return;
        try {
            const c = await caches.open(CACHE_NAME);
            let n = 0;
            for (const t of list) {
                if (blobUrl[t.src]) { n++; continue; }
                const r = await c.match(t.src);
                if (r) { blobUrl[t.src] = URL.createObjectURL(await r.blob()); n++; }
            }
            preText = n ? (n === list.length ? `${n}곡 받아 둠 ✓ 인터넷이 느려도 바로 나와요` : `${n} / ${list.length}곡 받아 둠`) : '';
            const el = $('plPreTxt'); if (el) el.textContent = preText;
        } catch (e) {}
    }
    // 타석 모드를 보는 동안은 화면이 저절로 꺼지지 않게 (되는 기기만)
    function wakeOn() {
        if (wake || !('wakeLock' in navigator) || document.hidden) return;
        try { navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); } catch (e) {}
    }
    function wakeOff() { try { if (wake) wake.release(); } catch (e) {} wake = null; }
    // ⚾ 자동 잠금 미루기: 타석 모드 화면이 보이는 동안만 · 켠 뒤 최대 3시간 (index.html 의 잠금 검사가 물어봄)
    //   · 화면을 끄거나 다른 앱에 10분 넘게 가 있었으면 미루지 않음 (돌아온 순간 원래 규칙대로)
    let holdFrom = 0, awaySince = 0;
    // 📋 타순 고르기 화면(v2.107.0): 위 타순 칸 · 아래 학년별 사진 목록 — 누르면 다음 칸에 들어감 · 칸을 먼저 누르면 그 칸으로
    let luEdit = [], luSnap = [], luFix = -1, luFilter = 'all';
    const lockIfDue = () => setTimeout(() => { try { if (typeof window.dyLockIfDue === 'function') window.dyLockIfDue(); } catch (e) {} }, 0);
    function holdSync() {   // 타석 모드에 들어오고 나갈 때마다
        const on = batShown();
        if (on && !holdFrom) holdFrom = Date.now();
        if (!on && holdFrom) { holdFrom = 0; lockIfDue(); }   // 나가는 순간: 미뤄 둔 잠금이 있으면 바로
    }
    window.plHold = function () {
        if (!holdFrom || !batShown() || Date.now() - holdFrom >= HOLD_MAX) return false;
        return !(awaySince && Date.now() - awaySince > AWAY_MAX);
    };
    const batShown = () => { let tab = ''; try { tab = currentMainTab; } catch (e) {} return tab === 'music' && view === 'bat' && root.classList.contains('is-authenticated'); };

    // ---------------- 가사 (큰 글씨 세 줄 · 전체 가사) ----------------
    function prepLyrics() {
        lines = []; spans = null; kIdx = -2;
        if (cur) {
            try {
                window.cheerLyricBlocks(cur).forEach(b => b.lines.forEach((tx, i) => lines.push({ tx: tx, tag: b.label || '', first: i === 0 })));
                const tm = window.cheerLineTimes(cur);
                if (tm && tm.length === lines.length) {
                    spans = tm.map((t, i) => {
                        if (!t) return null;
                        let nx = null;
                        for (let k = i + 1; k < tm.length; k++) if (tm[k]) { nx = tm[k].s; break; }
                        const guess = t.s + lines[i].tx.length * 0.35 + 1;
                        const e = t.e != null ? t.e : (nx != null ? Math.min(nx, guess) : guess);
                        return { s: t.s, e: Math.max(e, t.s + 0.3) };
                    });
                }
            } catch (e) { lines = []; spans = null; }
        }
        const box = $('plLyr');
        if (!box) return;
        box.classList.toggle('plain', !spans);
        box.innerHTML = lines.length
            ? lines.map((l, i) => (l.first && l.tag ? `<span class="pl-tag">${esc(l.tag)}</span>` : '') + `<p data-li="${i}"><span>${esc(l.tx)}</span></p>`).join('')
            : '<p>가사가 없는 곡이에요</p>';
        box.scrollTop = 0;
        paintLyrics(true);
    }
    function activeAt(sec) { let a = -1; for (let i = 0; i < spans.length; i++) if (spans[i] && spans[i].s <= sec + LEAD) a = i; return a; }
    function paintLyrics(force) {
        const k3 = $('plK3');
        if (!k3) return;
        if (!cur) return;
        if (!spans) {   // 시간표가 없는 곡: 따라가기 없이 안내만
            if (force || kIdx !== -3) {
                kIdx = -3;
                k3.innerHTML = `<span class="tag"></span><span class="pv">♪</span><span class="now">${esc(cur.title)}</span><span class="nx">${lines.length ? esc(lines[0].tx) : ''}</span><span class="hint">${lines.length ? '누르면 가사 전체가 나와요' : ''}</span>`;
            }
            return;
        }
        const sec = attached && audio ? audio.currentTime : (pendingSeek || 0);
        const a = activeAt(sec);
        if (force || a !== kIdx) {
            kIdx = a;
            const c = a >= 0 ? a : Math.max(0, spans.findIndex(Boolean));   // 아직 첫 줄 전이면 첫 줄을 미리 보여 줌
            const pv = a > 0 ? lines[a - 1].tx : '♪', nx = lines[c + 1];
            k3.innerHTML = `<span class="tag">${esc(lines[c] ? lines[c].tag : '')}</span><span class="pv">${esc(pv)}</span><span class="now"><span>${esc(lines[c] ? lines[c].tx : '')}</span></span>` +
                `<span class="nx"><em>다음</em>${esc(nx ? nx.tx : '♪')}</span><span class="hint">가사를 누르면 전체가 크게 나와요</span>`;
            const box = $('plLyr');
            if (box) {
                const ps = box.querySelectorAll('p');
                ps.forEach((el, i) => { el.classList.toggle('now', i === a); el.classList.toggle('past', a >= 0 && i < a); if (i !== a) { const sp = el.firstElementChild; if (sp) sp.style.removeProperty('--p'); } });
                if (lyrOpen && ps[c]) { const el = ps[c]; box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2), behavior: force ? 'auto' : 'smooth' }); }
            }
        }
        const sp = a >= 0 ? spans[a] : null;
        const pct = sp ? Math.max(0, Math.min(100, (sec - sp.s) / (sp.e - sp.s) * 100)).toFixed(1) + '%' : '0%';
        const n1 = k3.querySelector('.now span');
        if (n1) n1.style.setProperty('--p', pct);
        if (lyrOpen) { const n2 = document.querySelector('#plLyr p.now span'); if (n2) n2.style.setProperty('--p', pct); }
    }
    function startLoop() {
        if (raf || !bigOpen) return;
        const step = () => { raf = 0; if (!bigOpen || !audio || audio.paused) return; paintLyrics(false); raf = requestAnimationFrame(step); };
        raf = requestAnimationFrame(step);
    }

    // ---------------- 화면 그리기 ----------------
    function build() {
        if (built) return;
        const sec = $('musicSection');
        if (!sec) return;
        built = true;
        sec.innerHTML = `
            <div class="pl-seg" role="tablist" aria-label="음악 화면 고르기">
                <button type="button" data-pl="view" data-v="list" class="on">🎵 전체 곡</button>
                <button type="button" data-pl="view" data-v="bat">⚾ 타석 모드</button>
            </div>
            <div id="plList">
                <div class="pl-hero"><b>대연초 주제곡</b><small id="plCount"></small>
                    <div class="pl-hero-btns"><button type="button" class="main" data-pl="playall">${I.play}전체 재생</button><button type="button" data-pl="shuffleall">${I.shuffle}셔플 재생</button></div>
                </div>
                <div class="pl-chips" id="plChips"></div>
                <div class="pl-rows" id="plRows"></div>
            </div>
            <div id="plBat" hidden></div>`;
        sec.addEventListener('click', onClick);

        const mini = document.createElement('div');
        mini.id = 'plMini'; mini.className = 'pl-mini'; mini.hidden = true;
        mini.innerHTML = `<i class="pl-mline"><i id="plMiniBar"></i></i>
            <button type="button" class="pl-mini-open" data-pl="open" aria-label="큰 플레이어 열기"><span id="plMiniCv"></span><span class="tx"><b id="plMiniT"></b><small id="plMiniW"></small></span></button>
            <button type="button" class="pl-ib" data-pl="toggle" id="plMiniPlay" aria-label="재생">${I.play}</button>
            <button type="button" class="pl-ib" data-pl="next" aria-label="다음 곡">${I.next}</button>`;
        mini.addEventListener('click', onClick);
        document.body.appendChild(mini);

        const big = document.createElement('div');
        big.id = 'plBig'; big.className = 'pl-big'; big.hidden = true;
        big.setAttribute('role', 'dialog'); big.setAttribute('aria-label', '주제곡 플레이어');
        big.innerHTML = `
            <div class="pl-bhead">
                <button type="button" class="pl-close" data-pl="close" id="plClose">${I.down}<span id="plCloseTx">닫기</span></button>
                <span id="plHeadTx">지금 재생 중</span>
                <span class="cnt" id="plCnt"></span>
                <button type="button" class="pl-fs" data-pl="xl" id="plXl" hidden>가 크게</button>
            </div>
            <div class="pl-main" id="plMain">
                <div class="pl-song"><span id="plBigCv"></span><span class="tx"><b id="plBigT"></b><small id="plBigW"></small><em id="plBigG"></em></span><button type="button" class="pl-dl" data-pl="dl" id="plDl">⬇ MP3 저장</button></div>
                <button type="button" class="pl-k3" data-pl="lyrics" id="plK3" aria-label="가사 전체 보기"></button>
            </div>
            <div class="pl-lyr${cfg.xl ? ' xl' : ''}" id="plLyr" hidden></div>
            <div class="pl-prog"><div class="pl-seek" id="plSeek" role="slider" tabindex="0" aria-label="재생 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i><i id="plSeekFill"></i></i><b id="plSeekKnob"></b></div>
                <div class="pl-times"><span id="plCurT">0:00</span><span id="plDurT"></span></div></div>
            <div class="pl-ctl">
                <button type="button" class="md" data-pl="shuffle" id="plShuf" aria-label="셔플">${I.shuffle}<em></em></button>
                <button type="button" class="sk" data-pl="prev" aria-label="이전 곡">${I.prev}</button>
                <button type="button" class="pp" data-pl="toggle" id="plBigPlay" aria-label="재생">${I.play}</button>
                <button type="button" class="sk" data-pl="next" aria-label="다음 곡">${I.next}</button>
                <button type="button" class="md" data-pl="repeat" id="plRep" aria-label="반복"></button>
            </div>
            <div class="pl-msg" id="plMsg" hidden></div>`;
        big.addEventListener('click', onClick);
        document.body.appendChild(big);
        const seek = $('plSeek');
        const fracAt = e => { const r = seek.getBoundingClientRect(); return r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0; };
        const drag = e => { seekF = fracAt(e); setSeek(seekF); const d = dur(); if (d) $('plCurT').textContent = fmt(seekF * d); };
        const drop = commit => { if (!seeking) return; seeking = false; seek.classList.remove('drag'); const d = dur(); if (commit && d) seekTo(seekF * d); kIdx = -2; paintLyrics(true); paintTime(); };
        seek.addEventListener('pointerdown', e => { if (!cur) return; seeking = true; seek.classList.add('drag'); try { seek.setPointerCapture(e.pointerId); } catch (x) {} drag(e); e.preventDefault(); });
        seek.addEventListener('pointermove', e => { if (seeking) drag(e); });
        seek.addEventListener('pointerup', () => drop(true));
        seek.addEventListener('pointercancel', () => drop(false));
        seek.addEventListener('keydown', e => {   // 자판: ← → 5초씩
            const k = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
            if (!k || !cur) return;
            e.preventDefault();
            const d = dur(), c = attached && audio ? (audio.currentTime || 0) : (pendingSeek || 0);
            seekTo(Math.max(0, Math.min(d ? d - 1 : c + k, c + k))); kIdx = -2; paintLyrics(true);
        });
        $('plXl').textContent = cfg.xl ? '가 작게' : '가 크게';

        measure();
        const tabs = $('mainTabs');
        if (tabs && 'ResizeObserver' in window) { try { new ResizeObserver(measure).observe(tabs); } catch (e) {} }
        window.addEventListener('resize', measure);
        window.addEventListener('pagehide', remember);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { remember(); awaySince = Date.now(); }
            else {
                const long = awaySince && Date.now() - awaySince > AWAY_MAX;
                awaySince = 0;
                if (long && holdFrom) { holdFrom = 0; lockIfDue(); setTimeout(holdSync, 50); }   // 오래 비웠다 돌아옴: 미뤄 둔 잠금부터 확인하고, 안 잠겼으면 다시 미루기 시작
                measure(); if (batShown()) wakeOn(); paintTime();
            }
        });
        setupMediaKeys();
    }
    function measure() {   // 아래 탭 막대 높이 → 띠 · 큰 플레이어가 그 바로 위에 붙음
        const t = $('mainTabs');
        const h = t && getComputedStyle(t).position === 'fixed' ? t.offsetHeight : 0;
        root.style.setProperty('--pl-tabh', h + 'px');
    }
    function listIds() {
        return tracks.filter(t => filter === 'all' ? true : filter === 'mine' ? (personOf(t.pid) || {}).mine : String(t.g) === String(filter)).map(t => t.id);
    }
    function renderList() {
        const cnt = $('plCount');
        if (!cnt) return;
        const total = tracks.reduce((a, t) => a + lenSec(t.len), 0), m = Math.round(total / 60);
        cnt.textContent = tracks.length ? `${tracks.length}곡 · 선수 ${people.length}명` + (m ? ` · 약 ${m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분'}` : '') : '';
        const grades = Array.from(new Set(people.map(p => p.g))).filter(Boolean).sort((a, b) => b - a);
        const chips = [['all', '전체']];
        if (people.some(p => p.mine)) chips.push(['mine', '우리 아이']);
        grades.forEach(g => chips.push([String(g), g + '학년']));
        $('plChips').innerHTML = chips.map(c => `<button type="button" data-pl="chip" data-f="${c[0]}" class="${String(filter) === c[0] ? 'on' : ''}">${c[1]}</button>`).join('');
        const ids = listIds();
        $('plRows').innerHTML = ids.length ? ids.map((id, i) => {
            const t = byId.get(id);
            return `<button type="button" class="pl-row${cur && cur.id === id ? ' cur' : ''}" data-pl="row" data-id="${esc(id)}"><span class="n">${i + 1}</span>${cover(t)}` +
                `<span class="t"><b>${esc(t.title)}</b><small>${esc(t.name)}${t.beat ? ' · ' + esc(t.beat) : ''}</small></span><span class="d">${esc(t.len)}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></button>`;
        }).join('') : `<div class="pl-empty">${tracks.length ? '이 학년에는 아직 곡이 없어요' : '주제곡을 불러오는 중이에요.<br>잠시 뒤에도 안 보이면 인터넷 연결을 확인해 주세요.'}</div>`;
    }
    // ---------------- 📋 타순 고르기 ----------------
    const LU_MIN = 9, LU_MAX = 30;
    function canSeeHidden() { try { return currentRole === 'sub' || currentRole === 'general' || (typeof isSuperOrDev === 'function' && isSuperOrDev()); } catch (e) { return false; } }
    function photo(person, size) {   // 명단 탭과 같은 사진 · 사진을 숨긴 선수는 등번호 그림
        let src = '';
        try { if (!(person.src.hidePhoto && !canSeeHidden()) && typeof getPlayerPhotoUrl === 'function') src = getPlayerPhotoUrl(person.src) || ''; } catch (e) { src = ''; }
        if (!src) return `<span class="pl-ph pl-cv pl-g${person.g || 0}" style="width:${size}px;height:${size}px" aria-hidden="true">${esc(person.no || '♪')}</span>`;
        return `<img class="pl-ph" src="${esc(src)}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}" onerror="try{handleImgError(this)}catch(e){this.onerror=null;this.style.visibility='hidden'}">`;
    }
    function luOpen() {
        luSnap = cfg.lineup.slice();
        luEdit = cfg.lineup.slice();
        while (luEdit.length < LU_MIN) luEdit.push(null);
        luFix = -1; luFilter = 'all';
    }
    function luSave() {
        while (luEdit.length > LU_MIN && luEdit[luEdit.length - 1] == null) luEdit.pop();   // 끝에 남은 빈 칸은 9칸까지 줄임
        cfg.lineup = luEdit.filter(Boolean); cfg.batIdx = -1; preText = ''; saveCfg();
    }
    function luPick(pid) {
        const k = luEdit.indexOf(pid);
        if (luFix >= 0) {   // 칸을 먼저 골라 두었으면 그 칸으로 (다른 칸에 있던 선수면 자리를 바꿈 · 같은 칸이면 뺌)
            if (k === luFix) luEdit[k] = null;
            else { if (k >= 0) luEdit[k] = luEdit[luFix]; luEdit[luFix] = pid; }
            luFix = -1;
        } else if (k >= 0) luEdit[k] = null;   // 이미 들어간 선수를 다시 누르면 뺌
        else {
            let e = luEdit.indexOf(null);
            if (e < 0 && luEdit.length < LU_MAX) { luEdit.push(null); e = luEdit.length - 1; }   // 9칸이 다 찼으면 칸을 하나 늘림 (모두 치는 경기)
            if (e >= 0) luEdit[e] = pid;
        }
        luSave();
    }
    function renderLineup(box) {
        const n = luEdit.filter(Boolean).length, nx = luFix >= 0 ? luFix : luEdit.indexOf(null);
        const same = luSnap.join('|') === luEdit.filter(Boolean).join('|');
        const slots = luEdit.map((pid, i) => {
            const p = pid ? personOf(pid) : null;
            return `<button type="button" class="pl-slot${p ? ' fill' : ''}${i === nx ? ' next' : ''}" data-pl="lu-slot" data-i="${i}" aria-label="${i + 1}번 타자 ${p ? esc(p.name) + ' · 누르고 다른 선수를 고르면 바뀜' : '비어 있음'}">` +
                `<i>${i + 1}</i>${p ? `<span>${esc(p.name)}<small>${esc(p.no)}번</small></span>` : `<span class="e">${i === nx ? '다음 차례' : '비어 있음'}</span>`}</button>`;
        }).join('') + (luEdit.length < LU_MAX && luEdit.indexOf(null) < 0 ? `<button type="button" class="pl-slot add" data-pl="lu-more"><i>+</i><span class="e">칸 더하기</span></button>` : '');
        const head = nx >= 0 ? `<b class="hot">${nx + 1}번 타자</b>를 아래에서 눌러 주세요` : `<b class="hot">${n}명 다 정했어요 ✓</b>`;
        const gs = [...new Set(people.map(p => p.g))];
        const chips = [['all', '전체']].concat(gs.map(g => [String(g), g ? g + '학년' : '기타'])).map(c => `<button type="button" data-pl="lu-f" data-f="${c[0]}" class="${luFilter === c[0] ? 'on' : ''}">${c[1]}</button>`).join('');
        const list = gs.filter(g => luFilter === 'all' || String(g) === luFilter).map(g => {
            const ps = people.filter(p => p.g === g);
            return `<div class="pl-gh"><i class="pl-g${g || 0}"></i>${g ? g + '학년' : '기타'}<span>${ps.length}명</span></div>` + ps.map(p => {
                const k = luEdit.indexOf(p.pid);
                return `<button type="button" class="pl-lrow${k >= 0 ? ' in' : ''}" data-pl="lu-pick" data-pid="${esc(p.pid)}" aria-label="${esc(p.no)}번 ${esc(p.name)}${k >= 0 ? ' · ' + (k + 1) + '번 타자 (누르면 빠짐)' : ' · 타순에 넣기'}">${photo(p, 32)}` +
                    `<span class="t"><b>${esc(p.name)}</b><small>${esc(p.no)}번${p.pos ? ' · ' + esc(p.pos) : ''}</small></span>` +
                    (k >= 0 ? `<span class="k">${k + 1}번</span>` : '') + `</button>`;
            }).join('');
        }).join('');
        box.innerHTML = `
            <div class="pl-lue">
                <div class="pl-lue-top">
                    <div class="pl-lue-h"><b>오늘 타순 정하기</b><small>${n}명</small>
                        <button type="button" class="pl-sbtn" data-pl="lu-undo"${same ? ' disabled' : ''}>되돌리기</button>
                        <button type="button" class="pl-sbtn on" data-pl="lu-done">완료</button></div>
                    <div class="pl-lue-tip"><span>${head}</span><button type="button" class="pl-lnk" data-pl="lu-clear"${n ? '' : ' disabled'}>모두 지우기</button></div>
                    <div class="pl-slots">${slots}</div>
                    <p class="pl-lue-hint${luFix >= 0 ? ' fix' : ''}">${luFix >= 0 ? `<b>${luFix + 1}번 칸</b>을 바꾸는 중이에요. 아래에서 선수를 누르세요.` : '칸을 먼저 누르면 그 칸에 넣거나 바꿀 수 있어요 · 목록에서 다시 누르면 빠져요'}</p>
                </div>
                <div class="pl-chips pl-lue-chips">${chips}</div>
                <div class="pl-lue-list">${list || '<div class="pl-empty">선수 명단을 불러오는 중이에요.</div>'}</div>
                <button type="button" class="pl-lue-done" data-pl="lu-done">완료 · 타석 모드로 (${n}명)</button>
            </div>`;
    }

    function renderBat() {
        const box = $('plBat');
        if (!box || view !== 'bat') return;
        if (mode === 'lineup') { renderLineup(box); paintState(); return; }
        const lu = cfg.lineup.map(personOf).filter(Boolean), n = lu.length;
        const nxt = n ? lu[(cfg.batIdx + 1) % n] : null;
        const curPid = walk && cur ? cur.pid : '';
        let lineupHtml;
        if (n) {
            lineupHtml = `<button type="button" class="pl-nextbat" data-pl="nextbat">${I.play}<span><small>다음 타자 틀기</small><b>${(cfg.batIdx + 1) % n + 1}번 타자 ${esc(nxt.name)} <span style="opacity:.8">(${esc(nxt.no)})</span></b></span></button>` +
                `<ol class="pl-lu">${lu.map((p, i) => `<li><button type="button" data-pl="bat" data-pid="${esc(p.pid)}" class="${i === cfg.batIdx ? 'cur' : ''}" aria-label="${i + 1}번 타자 ${esc(p.name)} 곡 틀기"><i>${i + 1}</i>${esc(p.name)}</button></li>`).join('')}</ol>` +
                `<div class="pl-pre"><button type="button" class="pl-sbtn" data-pl="preload"${preBusy ? ' disabled' : ''}>⬇&nbsp;타순 곡 미리 받아 두기</button><span id="plPreTxt">${esc(preText)}</span></div>`;
        } else {
            lineupHtml = `<p class="pl-tip">「타순 정하기」를 누르면 선수 사진 목록에서 1번 타자부터 차례로 고를 수 있어요. 정해 두면 경기 중에는 「다음 타자」 버튼 하나만 누르면 됩니다.</p>`;
        }
        const pick = pickPid ? personOf(pickPid) : null;
        box.innerHTML = `
            <div class="pl-batnow"><span class="tx" id="plBatTx"></span><span class="pl-vol" id="plVol" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><button type="button" class="pl-fade" data-pl="fade" id="plFade">🔉 서서히 끄기</button></div>
            <div class="pl-opts">
                <button type="button" data-pl="opt" data-o="hook" aria-pressed="${cfg.hook ? 'true' : 'false'}"><i></i>후렴부터 시작</button>
                <button type="button" data-pl="opt" data-o="auto20" aria-pressed="${cfg.auto20 ? 'true' : 'false'}"><i></i>${WALK_SEC}초 뒤 자동으로 끄기</button>
            </div>
            <div class="pl-box">
                <div class="pl-h"><b>오늘 타순</b><button type="button" class="pl-sbtn${n ? '' : ' on'}" data-pl="lu-edit">📋 ${n ? '타순 고치기' : '타순 정하기'}</button></div>
                ${lineupHtml}
            </div>
            <div class="pl-box">
                <div class="pl-h"><b>등번호 버튼</b><small>${mode === 'song' ? '선수를 누르면 곡을 고를 수 있어요' : '누르면 바로 나옵니다'}</small><button type="button" class="pl-sbtn${mode === 'song' ? ' on' : ''}" data-pl="song-edit">${mode === 'song' ? '완료' : '타석 곡 고르기'}</button></div>
                ${[...new Set(people.map(p => p.g))].map(g => `<div class="pl-gl"><i class="pl-g${g || 0}"></i>${g ? g + '학년' : '기타'}</div><div class="pl-batgrid">${people.filter(p => p.g === g).map(p => {
                    const li = cfg.lineup.indexOf(p.pid);
                    return `<button type="button" class="pl-bat pl-g${p.g || 0}${curPid === p.pid ? ' cur' : ''}" data-pl="bat" data-pid="${esc(p.pid)}" aria-label="${esc(p.no)}번 ${esc(p.name)}${li >= 0 ? ' · ' + (li + 1) + '번 타자' : ''}"><b>${esc(p.no || '♪')}</b><span>${esc(p.name)}</span>${li >= 0 ? `<em>${li + 1}</em>` : ''}</button>`;
                }).join('')}</div>`).join('')}
                ${pick ? `<div class="pl-pick"><div class="pl-h"><b>${esc(pick.name)} 타석 곡</b><small>타석에 들어설 때 틀 곡</small></div>${pick.tracks.map(t => {
                    const on = walkTrack(pick).id === t.id;
                    return `<button type="button" class="opt${on ? ' on' : ''}" data-pl="song-pick" data-id="${esc(t.id)}"><i>${on ? '✓' : ''}</i><span>${esc(t.title)}<small>${esc(t.beat)}${t.len ? ' · ' + esc(t.len) : ''}</small></span></button>`;
                }).join('')}</div>` : ''}
            </div>
            ${people.length ? '' : '<div class="pl-empty">주제곡을 불러오는 중이에요.</div>'}`;
        paintState();
    }
    function renderNow() {   // 지금 곡이 바뀔 때: 띠 · 큰 플레이어 · 목록 표시
        if (!built) return;
        const mini = $('plMini');
        mini.hidden = !cur;
        root.classList.toggle('pl-on', !!cur);
        if (cur) {
            $('plMiniCv').innerHTML = cover(cur); $('plMiniT').textContent = cur.title; $('plMiniW').textContent = who(cur);
            $('plBigCv').innerHTML = cover(cur); $('plBigT').textContent = cur.title; $('plBigW').textContent = who(cur); $('plBigG').textContent = mood(cur);
            $('plCnt').textContent = (qi + 1) + ' / ' + order.length;
            $('plDurT').textContent = cur.len || '';
        }
        document.querySelectorAll('#plRows .pl-row').forEach(el => el.classList.toggle('cur', !!cur && el.dataset.id === cur.id));
    }
    function paintVol(k) {
        const v = $('plVol');
        if (!v) return;
        const on = audio && !audio.paused ? Math.ceil(k * 5) : 0;
        Array.prototype.forEach.call(v.children, (b, i) => b.classList.toggle('off', i >= on));
    }
    function paintState() {
        if (!built) return;
        const playing = !!(audio && !audio.paused && cur);
        root.classList.toggle('pl-playing', playing);
        ['plMiniPlay', 'plBigPlay'].forEach(id => { const b = $(id); if (b) { b.innerHTML = playing ? I.pause : I.play; b.setAttribute('aria-label', playing ? '멈춤' : '재생'); } });
        const sh = $('plShuf'); sh.classList.toggle('on', cfg.shuffle); sh.querySelector('em').textContent = cfg.shuffle ? '셔플' : '순서대로';
        const rp = $('plRep'); rp.classList.toggle('on', cfg.repeat !== 'off'); rp.innerHTML = (cfg.repeat === 'one' ? I.repeat1 : I.repeat) + `<em>${REPEAT_LABEL[cfg.repeat]}</em>`;
        if (cur) $('plCnt').textContent = (qi + 1) + ' / ' + order.length;
        const bt = $('plBatTx');
        if (bt) {
            bt.textContent = walk && cur && playing ? `${cur.no}번 ${cur.name} 등장곡 「${cur.title}」` : (mode === 'lineup' ? '타순을 정하는 중입니다' : '등번호를 누르면 바로 나옵니다');
            const fd = $('plFade'); if (fd) fd.disabled = !playing || !!fadeTimer;
            document.querySelectorAll('#plBat .pl-bat').forEach(el => el.classList.toggle('cur', walk && !!cur && el.dataset.pid === cur.pid));
            if (!fadeTimer) paintVol(1);
        }
        try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : (cur ? 'paused' : 'none'); } catch (e) {}
    }
    const dur = () => { const d = audio && attached ? audio.duration : 0; return isFinite(d) && d > 0 ? d : (cur ? lenSec(cur.len) : 0); };
    function paintTime() {
        if (!built || !cur) return;
        const d = dur(), c = attached && audio ? (audio.currentTime || 0) : (pendingSeek || 0);
        const f = d ? Math.max(0, Math.min(1, c / d)) : 0;
        $('plMiniBar').style.width = (f * 100).toFixed(2) + '%';
        if (!seeking) { setSeek(f); $('plCurT').textContent = fmt(c); }
        $('plDurT').textContent = d ? fmt(d) : (cur.len || '');
        if (bigOpen && (!audio || audio.paused)) paintLyrics(false);
    }
    function setSeek(f) {
        const p = (f * 100).toFixed(2) + '%';
        $('plSeekFill').style.width = p; $('plSeekKnob').style.left = p;
        $('plSeek').setAttribute('aria-valuenow', String(Math.round(f * 100)));
    }
    function renderAll() { if (!built) return; renderList(); renderBat(); renderNow(); paintState(); paintTime(); }
    function showMsg(t) { const m = $('plMsg'); if (m) { m.textContent = t; m.hidden = false; } if (!bigOpen) notify(t); }
    function hideMsg() { const m = $('plMsg'); if (m) m.hidden = true; }

    // ---------------- 큰 플레이어 열기 / 닫기 ----------------
    function openBig() {
        if (!cur || !built) return;
        bigOpen = true;
        $('plBig').hidden = false;
        root.classList.add('pl-big-on');
        setLyr(false);
        kIdx = -2; paintLyrics(true); paintTime(); startLoop();
    }
    function closeBig() {
        if (!built) return;
        bigOpen = false; lyrOpen = false;
        $('plBig').hidden = true;
        root.classList.remove('pl-big-on');
    }
    function setLyr(open) {   // 큰 글씨 세 줄 ↔ 전체 가사
        lyrOpen = !!open;
        $('plMain').hidden = lyrOpen; $('plLyr').hidden = !lyrOpen;
        $('plCnt').hidden = lyrOpen; $('plXl').hidden = !lyrOpen;
        $('plCloseTx').textContent = lyrOpen ? '가사 닫기' : '닫기';
        $('plHeadTx').textContent = lyrOpen && cur ? cur.title : '지금 재생 중';
        if (lyrOpen) { kIdx = -2; paintLyrics(true); }
    }
    // ⬇ MP3 저장 — 선수 상세와 같은 이름 「이름 주제곡 - 제목 (분위기).mp3」
    function download() {
        const t = cur, b = $('plDl');
        if (!t || !b || b.dataset.busy) return;
        const name = (t.name + ' 주제곡' + (t.title ? ' - ' + t.title : '') + (mood(t) ? ' (' + mood(t) + ')' : '')).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) + '.mp3';
        b.dataset.busy = '1'; b.textContent = '받는 중…';
        fetch(t.src, { mode: 'cors', cache: 'force-cache' })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
            .then(bl => {
                const blob = (bl.type && bl.type.indexOf('audio') === 0) ? bl : new Blob([bl], { type: 'audio/mpeg' });
                const u = URL.createObjectURL(blob), a = document.createElement('a');
                a.href = u; a.download = name; a.style.display = 'none';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(u), 60000);
            })
            .catch(e => { console.warn('MP3 이름 붙여 저장 실패 → 링크로 엶:', e); window.open(t.src, '_blank', 'noopener'); })
            .then(() => { delete b.dataset.busy; b.textContent = '⬇ MP3 저장'; });
    }

    // ---------------- 누르기 ----------------
    function onClick(e) {
        const li = e.target.closest('#plLyr p[data-li]');
        if (li) {   // 전체 가사에서 줄을 누르면 그 줄부터
            const i = +li.dataset.li;
            if (spans && spans[i]) { if (!attached) { pendingSeek = spans[i].s; play(); } else { seekTo(spans[i].s); if (audio.paused) play(); } kIdx = -2; paintLyrics(true); }
            return;
        }
        const el = e.target.closest('[data-pl]');
        if (!el) return;
        const d = el.dataset;
        switch (d.pl) {
            case 'view': setView(d.v); break;
            case 'chip': filter = d.f; renderList(); break;
            case 'row': playTrack(d.id, listIds()); break;
            case 'playall': playAll(listIds(), false); break;
            case 'shuffleall': playAll(listIds(), true); break;
            case 'open': openBig(); break;
            case 'close': if (lyrOpen) setLyr(false); else closeBig(); break;
            case 'toggle': toggle(); break;
            case 'next': next(false); break;
            case 'prev': prev(); break;
            case 'shuffle': toggleShuffle(); break;
            case 'repeat': cycleRepeat(); break;
            case 'lyrics': if (lines.length) setLyr(true); break;
            case 'xl': cfg.xl = !cfg.xl; saveCfg(); $('plLyr').classList.toggle('xl', cfg.xl); $('plXl').textContent = cfg.xl ? '가 작게' : '가 크게'; kIdx = -2; paintLyrics(true); break;
            case 'dl': download(); break;
            case 'fade': fadeOut(); break;
            case 'opt': if (d.o === 'hook' || d.o === 'auto20') { cfg[d.o] = !cfg[d.o]; saveCfg(); el.setAttribute('aria-pressed', cfg[d.o] ? 'true' : 'false'); } break;
            case 'nextbat': nextBatter(); break;
            case 'preload': preload(); break;
            case 'lu-edit': luOpen(); mode = 'lineup'; pickPid = ''; renderBat(); batTop(); break;
            case 'lu-done': mode = ''; luFix = -1; hydrate(); renderBat(); batTop(); break;
            case 'lu-clear': luEdit = Array(LU_MIN).fill(null); luFix = -1; luSave(); renderBat(); break;
            case 'lu-undo': luEdit = luSnap.slice(); while (luEdit.length < LU_MIN) luEdit.push(null); luFix = -1; luSave(); renderBat(); break;
            case 'lu-slot': { const i = +d.i; luFix = luFix === i ? -1 : i; renderBat(); break; }
            case 'lu-more': if (luEdit.length < LU_MAX) { luEdit.push(null); luFix = luEdit.length - 1; } renderBat(); break;
            case 'lu-f': luFilter = d.f; renderBat(); break;
            case 'lu-pick': luPick(d.pid); renderBat(); break;
            case 'lu-del': cfg.lineup = cfg.lineup.filter(x => x !== d.pid); cfg.batIdx = -1; saveCfg(); renderBat(); break;
            case 'song-edit': mode = mode === 'song' ? '' : 'song'; pickPid = ''; renderBat(); break;
            case 'song-pick': { const t = byId.get(d.id); if (t) { cfg.walkSong[t.pid] = t.key; saveCfg(); preText = ''; renderBat(); } break; }
            case 'bat':
                if (mode === 'song') { pickPid = d.pid; renderBat(); const pk = document.querySelector('#plBat .pl-pick'); if (pk && pk.scrollIntoView) pk.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
                else playWalk(d.pid);
                break;
        }
    }
    function batTop() {   // 타순 화면을 열고 닫을 때: 타석 모드 맨 위로
        const b = $('plBat'); if (!b) return;
        try { const y = b.getBoundingClientRect().top + window.scrollY - 70; if (window.scrollY > y) window.scrollTo(0, Math.max(0, y)); } catch (e) {}
    }
    function setView(v) {
        view = v === 'bat' ? 'bat' : 'list';
        mode = ''; pickPid = '';
        document.querySelectorAll('#musicSection .pl-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
        $('plList').hidden = view !== 'list'; $('plBat').hidden = view !== 'bat';
        if (view === 'bat') { renderBat(); hydrate(); wakeOn(); } else wakeOff();
        holdSync();
    }

    // ---------------- index.html 과 맞닿는 곳 ----------------
    window.plSync = function () { try { build(); sync(); } catch (e) { console.warn('플레이리스트 준비 실패:', e); } };
    window.plTab = function (tab) {   // 탭을 바꿀 때마다 (showMainTab)
        try {
            build();
            if (bigOpen) closeBig();
            measure();
            if (tab === 'music') { sync(); if (view === 'bat') { hydrate(); wakeOn(); } }
            else wakeOff();
            holdSync();
        } catch (e) { console.warn('플레이리스트 탭 처리 실패:', e); }
    };
    window.plLayers = function () { return (bigOpen ? 1 : 0) + (lyrOpen ? 1 : 0); };            // 뒤로 가기로 닫을 수 있는 것 개수
    window.plBack = function () { if (lyrOpen) { setLyr(false); return true; } if (bigOpen) { closeBig(); return true; } return false; };
    window.plOnLock = function (why) {   // 잠금 · 로그아웃: 큰 플레이어는 닫음 · 「자동 잠금」이면 듣던 노래는 그대로 (직접 로그아웃하면 멈춤)
        try {
            closeBig(); wakeOff(); holdFrom = 0;
            if (why !== '자동 잠금') { stopAll(); try { sessionStorage.removeItem(SS_KEY); } catch (e) {} }   // 로그아웃 · 앱 종료: 듣던 곡도 비움 (다음에 다른 분이 로그인해도 안 남게)
        } catch (e) {}
    };
})();
