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
    const WALK_SECS = [10, 15, 20, 30];   // 타석 곡: 고른 시간이 지나면 자동으로 서서히 끔 (0 = 안 끔)
    const HOLD_MAX = 3 * 60 * 60 * 1000;   // 타석 모드 화면에서 자동 잠금을 미루는 시간 (켠 뒤 최대 3시간)
    const AWAY_MAX = 30 * 60 * 1000;       // 화면을 끄거나 다른 앱에 이보다 오래 가 있었으면 미루지 않음
    const FADE_MS = 1600;     // 서서히 끄기 길이
    const FADE_IN_MS = 2000;  // 서서히 시작 길이 (타석 곡)
    // 📣 타석 모드 아래 효과음 띠 — mu: 음악(한 번 더 누르면 꺼짐 · 등장곡은 서서히 꺼짐) · max: 이 초가 지나면 저절로 꺼짐
    const SND_CDN = 'https://cdn.abocado.ai/ai/audio/google_a7d80a06/mcp_google_a7d80a06_';
    const SND = [
        { id: 'clap', em: '👏', nm: '박수', src: 'sfx/clap.mp3?v=1' },
        { id: 'cheer', em: '📣', nm: '함성', src: 'sfx/cheer.mp3?v=1' },
        { id: 'hit', em: '⚾', nm: '안타!', src: 'sfx/hit.mp3?v=1' },
        { id: 'hr', em: '💥', nm: '홈런!', mu: 1, max: 25, src: SND_CDN + '20261111144949_pbu6ri_0.mp3' },
        { id: 'run', em: '🎉', nm: '득점 축하', mu: 1, max: 20, src: SND_CDN + '20261111144950_o97m30_0.mp3' },
        { id: 'so', em: '🔥', nm: '삼진 잡았다', src: 'sfx/strikeout.mp3?v=2' },
        { id: 'fight', em: '💪', nm: '파이팅', src: 'sfx/fighting.mp3?v=2' },
        { id: 'chg', em: '🔄', nm: '공수 교대', mu: 1, max: 150, src: SND_CDN + '20261111144952_iu8ad4_0.mp3' }
    ];
    const SND_FADE_MS = 1200;
    // 📢 장내 아나운서 — 「일번 타자, 유격수, 이름.」을 조각(필재 목소리)으로 이어 튼 뒤 등장곡 · 조각을 바꾸면 ANN_V 를 올린다
    //   조각 목록 announce/list.json (slot: 1~9번 타자 · pos: 포지션 · pinch: 대타 · name: 선수 이름 → 파일) · 쉼은 파일 끝에 들어 있음
    //   v2.113.0: full: 이름 → {"1"~"15": 「N번 타자, 이름.」, "0": 「대타, 이름.」} 문장 통째 파일(announce/f/) — 있으면 조각 대신 이것 한 파일 · 16~30번은 slot 조각 + 이름 조각(v2.113.1)
    const ANN_DIR = 'announce/', ANN_V = 3;
    const ANN_POS = [['p', '투수', /^(투수|P)$/i], ['c', '포수', /^(포수|C)$/i], ['1b', '1루수', /^(1루수|일루수|1B)$/i], ['2b', '2루수', /^(2루수|이루수|2B)$/i], ['3b', '3루수', /^(3루수|삼루수|3B)$/i],
        ['ss', '유격수', /^(유격수|SS)$/i], ['lf', '좌익수', /^(좌익수|LF)$/i], ['cf', '중견수', /^(중견수|CF)$/i], ['rf', '우익수', /^(우익수|RF)$/i]];   // 효과음 파일을 바꾸면 ?v= 숫자를 올린다 (기기에 받아 둔 옛 소리 대신 새 소리를 받게)
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
    // ⭐ v2.139.0: 내 목록 1·2·3 (이 기기에만 저장 · 서버 · 시트 안 씀) — 이름은 바꿀 수 있음
    const FAV_N = 3, FAV_MAX = 300;
    function FAV_DEF() { return [0, 1, 2].map(i => ({ name: '내 목록 ' + (i + 1), ids: [] })); }
    const cfg = { shuffle: false, repeat: 'all', hook: true, fadeIn: true, autoSec: 20, lineup: [], walkSong: {}, batIdx: -1, xl: false, sets: [], lyrTip: false, ann: true, bk: false, off: [], fav: FAV_DEF() };
    try {
        const j = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
        if (typeof j.shuffle === 'boolean') cfg.shuffle = j.shuffle;
        if (REPEAT_LABEL[j.repeat]) cfg.repeat = j.repeat;
        if (typeof j.hook === 'boolean') cfg.hook = j.hook;
        if (typeof j.fadeIn === 'boolean') cfg.fadeIn = j.fadeIn;
        if (j.autoSec === 0 || WALK_SECS.indexOf(j.autoSec) >= 0) cfg.autoSec = j.autoSec;
        else if (j.auto20 === false) cfg.autoSec = 0;   // 예전 설정(20초 끄기 끔)을 이어받음
        if (Array.isArray(j.lineup)) cfg.lineup = j.lineup.filter(x => typeof x === 'string').slice(0, 30);
        if (j.walkSong && typeof j.walkSong === 'object') cfg.walkSong = j.walkSong;
        if (typeof j.batIdx === 'number') cfg.batIdx = j.batIdx;
        if (typeof j.xl === 'boolean') cfg.xl = j.xl;
        if (typeof j.lyrTip === 'boolean') cfg.lyrTip = j.lyrTip;
        if (typeof j.ann === 'boolean') cfg.ann = j.ann;
        if (typeof j.bk === 'boolean') cfg.bk = j.bk;
        if (Array.isArray(j.off)) cfg.off = j.off.filter(x => typeof x === 'string').slice(0, 600);
        if (Array.isArray(j.fav)) cfg.fav = FAV_DEF().map((d, i) => { const x = j.fav[i]; return x && typeof x === 'object' ? { name: (typeof x.name === 'string' && x.name.trim() ? x.name.trim() : d.name).slice(0, 12), ids: Array.isArray(x.ids) ? Array.from(new Set(x.ids.filter(y => typeof y === 'string'))).slice(0, FAV_MAX) : [] } : d; });
        if (Array.isArray(j.sets)) cfg.sets = j.sets.filter(x => x && typeof x.name === 'string' && Array.isArray(x.lineup)).slice(0, 8).map(x => ({ name: x.name.slice(0, 12), lineup: x.lineup.filter(y => typeof y === 'string').slice(0, 30) }));
    } catch (e) {}
    function saveCfg() { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }
    // 🚫 v2.118.0: 마음에 안 드는 곡 빼기 · 다시 넣기 (시안 C, 하코 선택) — 큰 플레이어 「이 곡 빼기」 · 칩 「빠진 곡」에서 다시 넣기 · 이 기기에만 저장(cfg.off: 곡 id 「배번/이름/키」 · 서버 · 시트 안 씀)
    //   뺀 곡은 전체 재생 · 셔플 · 다음 곡 · 이전 곡 · 이어폰 · 차량 버튼에서 건너뜀 · 목록에서 직접 누른 곡과 타석 등장곡으로 고른 곡은 그대로 틂
    const offSet = new Set(cfg.off);
    let hidSet = new Set();   // 🔒 보호자가 모든 분 목록에서 숨긴 곡 (보호자 · 운영진 화면에만 남아 있음)
    const isOff = id => offSet.has(id) || hidSet.has(id);
    function setOff(ids, on) {
        ids.forEach(id => { if (on) offSet.add(id); else offSet.delete(id); });
        cfg.off = Array.from(offSet); saveCfg();
    }

    // ---------------- 상태 ----------------
    let people = [], tracks = [], byId = new Map(), sig = '';   // 명단에 보이는 선수와 곡
    let base = [], order = [], qi = -1, cur = null;             // 재생 줄(고른 목록 · 실제 순서 · 지금 자리 · 지금 곡)
    let attached = false, pendingSeek = null, fails = 0;        // 음원 붙였는지 · 붙인 뒤 옮길 자리 · 연달아 실패한 횟수
    let walk = false, walkHeard = 0, walkLast = 0, fadeTimer = 0, fadeInTimer = 0;   // 타석 곡 재생 중 · 흘러나온 시간 · 직전 자리 · 서서히 끄는 중
    let view = 'list', filter = 'all', mode = '', pickPid = ''; // 음악 탭 안: 전체 곡/타석 · 학년 걸러 보기 · 타순 정하기/곡 고르기
    let built = false, audio = null, raf = 0, seeking = false, seekF = 0;
    let lines = [], spans = null, kIdx = -2;                    // 가사 줄 · 시간표 · 지금 줄
    let bigOpen = false, lyrOpen = false, wake = null, preBusy = false, preText = '';
    const blobUrl = {};                                         // 미리 받아 둔 곡: 음원 주소 → 기기 안 주소
    const sndEl = {};                                           // 효과음 띠: 버튼마다 소리 하나
    let muOn = '', muFade = 0, muFadeEl = null, volOk = null, sndWarmed = false;   // 켜져 있는 음악 버튼 · 서서히 끄는 중 · 소리 크기를 바꿀 수 있는 기기인지
    let annMan = null, annQ = [], annDone = null, annTok = 0, annText = '', annWarmed = false, annGuard = 0;   // 장내 아나운서: 조각 목록 · 남은 조각 · 끝나면 할 일 · 안내 글

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
            const hid = window.cheerHiddenKeys ? window.cheerHiddenKeys(p) : new Set();   // 🔒 보호자가 모든 분 목록에서 숨긴 곡
            const g = parseInt(String(p.grade || '').replace(/[^0-9]/g, ''), 10) || parseInt(song.grade, 10) || 0;
            const pid = (p.no || 0) + '/' + p.name;
            let mine = false;
            try { mine = !!isParentOfPlayer(p); } catch (e) {}
            const manage = mine || canSeeHidden();   // 숨긴 곡을 보고 되돌릴 수 있는 분: 그 선수 보호자 · 코치진 · 총무 · 대표 · 개발자
            const person = { pid: pid, no: p.no || 0, name: p.name, g: g, mine: mine, manage: manage, pos: p.pos && p.pos !== '-' ? String(p.pos) : '', src: p, tracks: [] };
            vers.forEach(v => (manage || !hid.has(v.key)) && person.tracks.push({
                id: pid + '/' + v.key, pid: pid, no: person.no, name: p.name, g: g, key: v.key, hidAll: hid.has(v.key),
                title: v.title || v.label || (p.name + ' 주제곡'), src: v.src, len: v.len || '', beat: v.beat || '', vocal: v.vocal || '', lyrics: v.lyrics, times: v.times
            }));
            if (person.tracks.length) ppl.push(person);
        });
        ppl.sort((a, b) => (b.g - a.g) || (a.no - b.no) || a.name.localeCompare(b.name));
        const s = ppl.map(p => p.pid + (p.mine ? '*' : '') + '~' + p.pos + '~' + (p.src.photoLink || '') + (p.src.hidePhoto ? 'h' : '') + ':' + p.tracks.map(t => t.key + (t.hidAll ? '#' : '') + '~' + t.title + '~' + t.src.slice(-14)).join(',')).join('|');
        if (s === sig) return;
        sig = s; people = ppl; tracks = []; byId = new Map();
        ppl.forEach(p => p.tracks.forEach(t => { tracks.push(t); byId.set(t.id, t); }));
        hidSet = new Set(tracks.filter(t => t.hidAll).map(t => t.id));
        base = base.filter(id => byId.has(id)); order = order.filter(id => byId.has(id));
        if (cur) {
            if (byId.has(cur.id)) { cur = byId.get(cur.id); qi = order.indexOf(cur.id); if (qi < 0) { setQueue(tracks.map(t => t.id), cur.id); } }
            else stopAll();
        }
        const n0 = cfg.lineup.length;
        cfg.lineup = cfg.lineup.filter(pid => !!personOf(pid));
        if (cfg.lineup.length !== n0) { cfg.batIdx = -1; saveCfg(); }
        if (filter !== 'all' && filter !== 'mine' && !/^fav\d$/.test(filter) && !people.some(p => String(p.g) === String(filter))) filter = 'all';
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
        audio.addEventListener('playing', () => { if (annDone) { paintState(); return; } fails = 0; hideMsg(); paintState(); startLoop(); });
        audio.addEventListener('pause', () => { paintState(); });
        audio.addEventListener('play', () => bkKick(0));   // 🦉 소리가 나기 시작하면 「부캉아」 듣기 쉼
        audio.addEventListener('ended', () => { if (annDone) annStep(); else next(true); });
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('durationchange', () => { if (!annDone) paintTime(); });
        audio.addEventListener('loadedmetadata', () => {
            if (annDone) return;
            if (pendingSeek != null) { const at = pendingSeek; pendingSeek = null; try { if (Math.abs(audio.currentTime - at) > 0.5) audio.currentTime = at; } catch (e) {} }
            paintTime();
        });
        audio.addEventListener('error', () => { if (annDone) annFinish(); else onError(); });
        try { if (window.songStat) window.songStat.watch(audio, () => (cur && !annDone && attached) ? { id: cur.id, bat: walk } : null); } catch (e) {}   // 📊 v2.124.0: 재생 세기 (타석 등장곡은 따로)
        return audio;
    }
    function setQueue(ids, startId) {
        base = ids.filter(i => !isOff(i) || i === startId);   // 뺀 곡은 빼고 (직접 누른 곡은 넣음)
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
        if (annDone) annCancel();
        if (!attached) attach(pendingSeek || 0);
        if (!fadeInTimer) { try { audio.volume = 1; } catch (e) {} }
        if (muOn) muStop();   // 축하곡 · 공수 교대 음악이 나오던 중이면 서서히 끔
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
        if (!ids) return;
        ids = ids.filter(i => !isOff(i));
        if (!ids.length) { notify('들을 곡이 없어요', '모두 뺀 곡이에요 · 다시 넣으면 들을 수 있어요'); return; }
        cfg.shuffle = !!shuffle; saveCfg();
        const first = shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
        walk = false;
        setQueue(ids, first);
        load(byId.get(first), true);
    }
    function toggle() {
        if (!cur) { playAll(tracks.map(t => t.id), cfg.shuffle); return; }
        ensureAudio();
        if (annDone) { annCancel(); walk = false; paintState(); return; }   // 안내 중에 멈춤 → 안내만 멈춤 (다시 ▶ 하면 곡부터)
        if (audio.paused || !attached) { clearFade(); play(); } else audio.pause();
    }
    function next(auto) {
        if (!cur) return;
        if (auto && walk) { walk = false; paintState(); return; }                      // 타석 곡은 끝나면 그대로 멈춤
        if (auto && cfg.repeat === 'one') { try { audio.currentTime = 0; } catch (e) {} play(); return; }
        walk = false;
        let j = qi + 1;
        while (j < order.length && isOff(order[j])) j++;   // 뺀 곡은 건너뜀
        if (j < order.length) qi = j;
        else if (auto && cfg.repeat === 'off') { try { audio.currentTime = 0; } catch (e) {} paintState(); paintTime(); return; }   // 마지막 곡이 끝남
        else {
            base = base.filter(i => !isOff(i));
            if (!base.length) { if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} } paintState(); paintTime(); if (!auto) notify('다음에 들을 곡이 없어요', '모두 뺀 곡이에요'); return; }
            order = cfg.shuffle ? shuffled(base) : base.slice(); qi = 0;
        }
        const t = byId.get(order[qi]);
        if (t) load(t, true);
    }
    function prev() {
        if (!cur) return;
        walk = false;
        if (attached && audio.currentTime > 3) { try { audio.currentTime = 0; } catch (e) {} if (audio.paused) play(); return; }
        let j = qi;
        for (let k = 0; k < order.length; k++) { j = (j - 1 + order.length) % order.length; if (!isOff(order[j])) break; }   // 뺀 곡은 건너뜀
        qi = j;
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
        annCancel(); clearFade(); sndStopAll();
        try { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } } catch (e) {}
        cur = null; qi = -1; attached = false; walk = false; pendingSeek = null;
        closeBig(); renderNow(); paintState();
    }
    function onTime() {
        if (annDone) return;
        if (walk) {   // 타석 곡: 실제로 흘러나온 시간을 셈 (건너뛴 만큼은 안 셈 → 후렴 자리로 못 간 기기에서도 20초를 다 들려줌)
            const c = audio.currentTime, d = c - walkLast;
            walkLast = c;
            if (d > 0 && d < 1.5) walkHeard += d;
            if (cfg.autoSec && !fadeTimer && !audio.paused && walkHeard >= cfg.autoSec) fadeOut();
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
    function stopFadeIn() { if (fadeInTimer) { clearInterval(fadeInTimer); fadeInTimer = 0; } }
    function clearFade() { stopFadeIn(); if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; } try { if (audio) audio.volume = 1; } catch (e) {} paintVol(1); }
    // 서서히 시작 — 타석 곡을 작은 소리에서 키움 (실제로 소리가 나는 동안만 셈 · 아이폰은 소리 크기를 못 바꿔서 바로 시작)
    function fadeIn() {
        if (!audio) return;
        stopFadeIn();
        let heard = 0, last = Date.now();
        try { audio.volume = 0; } catch (e) { return; }
        paintVol(0);
        fadeInTimer = setInterval(() => {
            const now = Date.now(), dt = now - last; last = now;
            if (audio.paused || audio.readyState < 3) return;
            heard += dt;
            const k = Math.min(1, heard / FADE_IN_MS);
            try { audio.volume = k * k; } catch (e) {}
            paintVol(k);
            if (k >= 1) stopFadeIn();
        }, 50);
    }
    function fadeOut() {
        if (annDone) { annCancel(); walk = false; paintState(); return; }   // 안내 중이면 바로 멈춤
        if (!audio || audio.paused || fadeTimer) return;
        stopFadeIn();
        if (!canVol()) { try { audio.pause(); } catch (e) {} walk = false; paintVol(1); paintState(); return; }   // 아이폰: 소리 크기를 못 바꾸니 기다리지 않고 바로 멈춤
        let v0 = 1; try { v0 = Math.max(0.05, audio.volume); } catch (e) {}   // 서서히 시작하던 중이면 그 크기에서 줄임
        const t0 = Date.now();
        fadeTimer = setInterval(() => {
            const k = 1 - (Date.now() - t0) / FADE_MS;
            if (k <= 0) { clearInterval(fadeTimer); fadeTimer = 0; try { audio.pause(); audio.volume = 1; } catch (e) {} walk = false; paintVol(1); paintState(); }
            else { try { audio.volume = v0 * k * k; } catch (e) {} paintVol(k); }
        }, 50);
        paintState();
    }

    // 📢 장내 아나운서 — 조각을 차례로 튼 뒤 등장곡 (조각 사이 쉼은 파일 끝에 들어 있음)
    const annUrl = fn => ANN_DIR + fn + '?v=' + ANN_V;
    const ANN_NUM = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    function annPieces(person, slot) {   // slot: 1~ 타순 · 0 대타 · -1 타순 밖 (조각이 없으면 null → 안내 없이 곡만)
        const m = annMan;
        if (!m || !m.name || !m.name[person.name]) return null;
        const fu = m.full && m.full[person.name] && m.full[person.name][slot];   // v2.113.0: 「N번 타자, 이름.」 문장 통째 녹음이 있으면 그 한 파일
        if (fu) return { files: [annUrl(fu)], text: (slot === 0 ? '대타' : slot + '번 타자') + ', ' + person.name };
        const q = [], says = [];
        if (slot === 0) { if (m.pinch) { q.push(m.pinch); says.push('대타'); } }
        else if (slot >= 1 && m.slot && m.slot[slot]) { q.push(m.slot[slot]); says.push(slot + '번 타자'); }
        q.push(m.name[person.name]); says.push(person.name);   // v2.113.1: 포지션은 부르지 않음 (문장 통째와 맞춤)
        return { files: q.map(annUrl), text: says.join(', ') };
    }
    function annStart(a, done) {
        ensureAudio();
        annCancel();
        clearFade();
        annQ = a.files.slice(); annDone = done; annText = a.text; annTok++;
        const tok = annTok;
        annGuard = setTimeout(() => { if (tok === annTok && annDone) annFinish(); }, 12000);   // 무슨 일이 있어도 12초 뒤엔 곡으로
        annStep();
    }
    function annStep() {
        if (!annDone) return;
        if (!annQ.length) { annFinish(); return; }
        const u = annQ.shift(), tok = annTok;
        try { audio.volume = 1; } catch (e) {}
        audio.src = blobUrl[u] || u;
        const pr = audio.play();
        if (pr && pr.catch) pr.catch(e => { if (tok === annTok && annDone && (!e || e.name !== 'AbortError')) annFinish(); });
        paintState();
    }
    function annFinish() {   // 안내 끝 → 등장곡
        const d = annDone;
        annCancel(true);
        if (d) d();
    }
    function annCancel(keepAudio) {
        if (annGuard) { clearTimeout(annGuard); annGuard = 0; }
        if (!annDone) return;
        annDone = null; annQ = []; annText = ''; annTok++;
        if (!keepAudio) { try { audio.pause(); } catch (e) {} }
        try { audio.removeAttribute('src'); audio.load(); } catch (e) {}
        attached = false;
    }
    async function annPrep() {   // 타석 모드를 열면: 조각 목록을 받고, 켜져 있으면 조각을 기기에 받아 둠 (누르면 바로 · 신호가 약해도)
        if (!annMan) {
            try { const r = await fetch(ANN_DIR + 'list.json?v=' + ANN_V); if (r.ok) annMan = await r.json(); } catch (e) {}
            if (annMan) renderBat();
        }
        if (!annMan || !cfg.ann || annWarmed || !('caches' in window)) return;
        annWarmed = true;
        const want = [];   // 타순에 든 선수는 그 타순 문장 파일만 · 문장 녹음이 없는 선수는 예전 조각
        cfg.lineup.map(personOf).forEach((p, i) => {
            if (!p) return;
            const a = annPieces(p, i + 1);
            if (a) a.files.forEach(u => want.push(u.slice(ANN_DIR.length).split('?')[0]));
        });
        try {
            const c = await caches.open(CACHE_NAME);
            for (const fn of [...new Set(want)]) {
                const u = annUrl(fn);
                if (blobUrl[u]) continue;
                try {
                    const abs = new URL(u, location.href).href;
                    let r = await c.match(abs);
                    if (!r) { r = await fetch(abs); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(abs, r.clone()); }
                    blobUrl[u] = URL.createObjectURL(await r.blob());
                } catch (e) { annWarmed = false; }   // 못 받은 조각은 다음에 다시
            }
        } catch (e) { annWarmed = false; }
    }

    // 📣 효과음 띠 — 짧은 소리는 등장곡 위에 겹쳐 나오고, 음악(노란 버튼)은 등장곡을 서서히 끄고 나옴
    function canVol() {   // 아이폰은 웹에서 소리 크기를 못 바꿈 → 서서히 끄지 않고 바로 멈춤
        if (volOk == null) { try { const a = new Audio(); a.volume = 0.5; volOk = a.volume === 0.5; } catch (e) { volOk = false; } }
        return volOk;
    }
    function sndAudio(s) {
        let a = sndEl[s.id];
        if (a) return a;
        a = sndEl[s.id] = new Audio();
        a.preload = 'auto'; a.src = blobUrl[s.src] || s.src;
        a.addEventListener('play', () => bkKick(0));
        if (s.mu) {
            a.addEventListener('ended', () => { if (muOn === s.id) muStop(true); });
            a.addEventListener('timeupdate', () => { if (muOn === s.id && s.max && a.currentTime >= s.max) muStop(); });
        }
        a.addEventListener('error', () => { if (muOn === s.id) { muOn = ''; paintSnd(); } delete sndEl[s.id]; notify('소리를 불러오지 못했어요', '인터넷 연결을 확인해 주세요'); });
        return a;
    }
    function sndBlob(m, blob) {   // 미리 받아 둔 음악으로 바꿔 끼움 (나오는 중이면 그대로 둠)
        if (blobUrl[m.src]) return;
        blobUrl[m.src] = URL.createObjectURL(blob);
        if (sndEl[m.id] && muOn !== m.id && muFadeEl !== sndEl[m.id]) delete sndEl[m.id];
    }
    const sndUrl = s => new URL(s.src, location.href).href;
    async function sndWarm() {   // 타석 모드를 열면 짧은 효과음을 기기에 받아 둠 (누르면 바로 · 신호가 약해도 나오게)
        if (sndWarmed) return;
        sndWarmed = true;
        const fx = SND.filter(s => !s.mu);
        if (!('caches' in window)) { fx.forEach(s => { try { sndAudio(s).load(); } catch (e) {} }); return; }
        try {
            const c = await caches.open(CACHE_NAME);
            for (const s of fx) {
                if (blobUrl[s.src]) continue;
                try {
                    const u = sndUrl(s);
                    let r = await c.match(u);
                    if (!r) { r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(u, r.clone()); }
                    sndBlob(s, await r.blob());
                } catch (e) { sndWarmed = false; }   // 못 받은 소리는 다음에 타석 모드를 열 때 다시
            }
        } catch (e) { sndWarmed = false; }
    }
    function sndPlay(id) {
        const s = SND.find(x => x.id === id);
        if (!s) return;
        if (s.mu && muOn === id) { muStop(); return; }   // 음악: 한 번 더 누르면 끔
        const a = sndAudio(s);
        if (s.mu) {
            muStop(true);
            if (audio && !audio.paused) fadeOut();
            muOn = id;
        }
        try { a.pause(); a.currentTime = 0; a.volume = 1; } catch (e) {}
        const pr = a.play();
        if (pr && pr.catch) pr.catch(e => { if (e && e.name === 'AbortError') return; if (muOn === id) { muOn = ''; paintSnd(); } notify('소리를 틀지 못했어요', '한 번 더 눌러 주세요'); });
        paintSnd(s.mu ? '' : id);
    }
    function muStop(now) {   // 음악 버튼 끄기 — 서서히 (now 면 바로)
        if (muFade) { clearInterval(muFade); muFade = 0; try { muFadeEl.pause(); muFadeEl.volume = 1; } catch (e) {} muFadeEl = null; }
        const a = sndEl[muOn];
        muOn = ''; paintSnd();
        if (!a || a.paused) return;
        if (now || !canVol()) { try { a.pause(); a.volume = 1; } catch (e) {} return; }
        const t0 = Date.now(); muFadeEl = a;
        muFade = setInterval(() => {
            const k = 1 - (Date.now() - t0) / SND_FADE_MS;
            if (k <= 0) { clearInterval(muFade); muFade = 0; muFadeEl = null; try { a.pause(); a.volume = 1; } catch (e) {} }
            else { try { a.volume = k * k; } catch (e) {} }
        }, 50);
    }
    function sndStopAll() { muStop(true); Object.keys(sndEl).forEach(k => { try { sndEl[k].pause(); } catch (e) {} }); }
    function paintSnd(hit) {
        document.querySelectorAll('#plSnd button').forEach(b => {
            const on = !!muOn && b.dataset.s === muOn;
            b.classList.toggle('on', on);
            if (b.classList.contains('mu')) b.setAttribute('aria-pressed', on ? 'true' : 'false');
            if (hit && b.dataset.s === hit) { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }
        });
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
        // v2.113.2: 타석 모드(타순 있음)에선 이어폰 · 차 · 잠금 화면의 ⏭ = 다음 타자(안내 → 등장곡), ⏮ = 바로 전 타자
        const batKeys = () => view === 'bat' && cfg.lineup.length > 0;
        on('play', () => { if (cur) { clearFade(); play(); } });
        on('pause', () => { if (annDone) { annCancel(); walk = false; paintState(); } else if (audio) audio.pause(); });
        on('previoustrack', () => { if (batKeys()) prevBatter(); else prev(); });
        on('nexttrack', () => { if (batKeys()) { mode = mode === 'ph' ? '' : mode; nextBatter(); } else next(false); });
        on('seekto', d => { if (d && typeof d.seekTime === 'number') seekTo(d.seekTime); });
    }

    // 🎙 말로 하기 (v2.114.0 · 시안 A: 위 안내 바) — 버튼을 누르고 말하면 크롬 음성 인식이 글자로 바꿔 주고, 정해 둔 말(선수 이름 · 다음 · 홈런 …)을 찾아 실행 · 무료, 서버 안 씀
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null, micOn = false, micVol = -1, micTimer = 0;
    const MIC_SFX = [['clap', /박수/], ['cheer', /함성|환호|소리질러/], ['hit', /안타/], ['hr', /홈런/], ['run', /득점/], ['so', /삼진/], ['fight', /파이팅|화이팅|화이또/], ['chg', /공수교대|교대/]];
    const micNorm = s => String(s || '').replace(/[\s.,!?~·'"「」]/g, '');
    function korNum(s) {   // 「이십삼」 → 23 (1~99)
        const D = '일이삼사오육칠팔구';
        const m = /^([일이삼사오육칠팔구]?)(십?)([일이삼사오육칠팔구]?)$/.exec(s || '');
        if (!m || !(m[1] || m[2] || m[3])) return 0;
        const t = m[2] ? (m[1] ? D.indexOf(m[1]) + 1 : 1) : 0, o = m[3] ? D.indexOf(m[3]) + 1 : 0;
        if (!m[2] && m[1]) return D.indexOf(m[1]) + 1;
        return t * 10 + o;
    }
    function micNum(t, re) { const m = re.exec(t); if (!m) return 0; return /^\d+$/.test(m[1]) ? +m[1] : korNum(m[1]); }
    function micPeople(t) {   // 말 속의 선수 이름 (성 빼고 이름만 · 「~이」 붙여도) — 가장 길게 맞은 선수들
        let best = [], bl = 0;
        people.forEach(p => {
            const nm = micNorm(p.name), parts = String(p.name).trim().split(/\s+/), keys = [nm];
            if (parts.length > 1) keys.push(micNorm(parts[parts.length - 1]));
            else if (nm.length >= 3) keys.push(nm.slice(1));
            keys.forEach(k => {
                if (k.length < 2 || t.indexOf(k) < 0) return;
                if (k.length > bl) { bl = k.length; best = [p]; } else if (k.length === bl && best.indexOf(p) < 0) best.push(p);
            });
        });
        if (best.length > 1) { const inLu = best.filter(p => cfg.lineup.indexOf(p.pid) >= 0); if (inLu.length === 1) best = inLu; }
        return best;
    }
    function micParse(raw) {   // 들은 말 → 할 일 (못 찾으면 null)
        const t = micNorm(raw).replace(new RegExp('^' + BK_RE.source), '');   // 「부캉아, 다음 타자」처럼 붙여 말해도
        if (!t) return null;
        const ps = micPeople(t);
        const NUM = '(\\d+|[일이삼사오육칠팔구십]+)';
        if (ps.length > 1) {
            const no = micNum(t, new RegExp(NUM + '번(?!타자)'));
            const one = no ? ps.filter(p => +p.no === no) : [];
            if (one.length !== 1) return { say: '누구인지 헷갈려요: ' + ps.map(p => p.name + '(' + p.no + ')').join(', ') + ' — 등번호도 같이 말해 주세요' };
            ps.splice(0, ps.length, one[0]);
        }
        if (ps.length === 1) {
            const p = ps[0];
            if (/대타/.test(t)) return { say: '대타 ' + p.name, run: () => pinch(p.pid) };
            return { say: p.name + ' 등장곡', run: () => playWalk(p.pid) };
        }
        const slot = micNum(t, new RegExp(NUM + '번타자'));
        if (slot) {
            const pid = cfg.lineup[slot - 1];
            return pid ? { say: slot + '번 타자 ' + personOf(pid).name, run: () => playWalk(pid) } : { say: slot + '번 타자가 타순에 없어요' };
        }
        const no = micNum(t, new RegExp(NUM + '번'));
        if (no) {
            const p = people.find(x => +x.no === no);
            return p ? { say: no + '번 ' + p.name + ' 등장곡', run: () => playWalk(p.pid) } : { say: no + '번 선수를 못 찾았어요' };
        }
        for (const [id, re] of MIC_SFX) if (re.test(t)) { const m = SND.find(x => x.id === id); return { say: m.em + ' ' + m.nm, run: () => sndPlay(id) }; }
        if (/서서히|천천히|페이드|줄여/.test(t)) return { say: '서서히 끄기', run: () => { if (muOn) muStop(); else fadeOut(); } };
        if (/멈춰|멈춤|정지|그만|스톱|스탑|꺼|조용/.test(t)) return { say: '멈춤', run: () => { if (muOn) muStop(true); if (annDone) { annCancel(); walk = false; paintState(); } else if (audio) audio.pause(); } };
        if (/다음/.test(t)) return cfg.lineup.length ? { say: '다음 타자', run: () => { mode = mode === 'ph' ? '' : mode; nextBatter(); } } : { say: '다음 곡', run: () => next(false) };
        if (/이전|아까|앞타자|전타자|뒤로/.test(t)) return cfg.lineup.length ? { say: '바로 전 타자', run: prevBatter } : { say: '이전 곡', run: prev };
        if (/틀어|재생|시작|켜/.test(t) && cur) return { say: '재생', run: () => { clearFade(); play(); } };
        return null;
    }
    function micPaint(state, heard, said, opt) {   // 듣는 판: listen 듣는 중 · done 실행함 · fail 못 알아들음 (opt: 제목 · 아랫글 바꾸기)
        const pan = $('plMicPan');
        opt = opt || {};
        if (heard) heard = String(heard).replace(/(부캉|북항|부강|부광|부캥|북캉|북앙|부깡|푸캉|부칸|북한)\s*(이|아|야|하|가|님|씨)?/g, '부캉아');   // 「북항아」로 들려도 화면엔 「부캉아」
        if (!pan) return;
        document.querySelectorAll('[data-pl="mic"]').forEach(b => { const on = state === 'listen' && !opt.title; b.classList.toggle('rec', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        if (!state) { pan.hidden = true; return; }
        pan.hidden = false;
        pan.className = 'pl-micpan ' + state;
        pan.innerHTML = `<div class="pl-micdot" aria-hidden="true">🎙</div><div class="tx"><b>${opt.title ? esc(opt.title) : state === 'listen' ? '듣고 있어요…' : state === 'done' ? esc(said) : '잘 못 알아들었어요'}</b>` +
            `<small>${opt.sub != null ? esc(opt.sub) : heard ? '「' + esc(heard) + '」' : (state === 'listen' ? '예) 다음 타자 · 선수 이름 · 3번 타자 · 홈런 · 서서히 꺼' : '')}</small>` +
            (state === 'fail' && opt.sub == null ? `<small class="ex">${said ? esc(said) : '예) 다음 타자 · 선수 이름 · 7번 · 홈런 · 박수 · 멈춰'}</small>` : '') +
            `</div><button type="button" class="pl-sbtn" data-pl="mic-x">${state === 'listen' ? '취소' : '닫기'}</button>`;
    }
    function micDuck(on) {   // 듣는 동안 노래 소리를 줄임 (아이폰은 못 줄임)
        if (!audio || !canVol()) return;
        try {
            if (on) { if (!audio.paused && !fadeTimer) { micVol = audio.volume; audio.volume = Math.min(audio.volume, 0.25); } }
            else if (micVol >= 0) { if (!fadeTimer) audio.volume = micVol; micVol = -1; }
        } catch (e) {}
    }
    function micStop(state, heard, said) {
        micOn = false;
        if (rec) { try { rec.onresult = rec.onerror = rec.onend = null; rec.abort(); } catch (e) {} rec = null; }
        micDuck(false);
        clearTimeout(micTimer);
        micPaint(state, heard, said);
        if (state) micTimer = setTimeout(() => micPaint(''), state === 'done' ? 2200 : 4500);
        bkKick(800);
    }
    function micToggle() {
        if (micOn) { micStop(''); return; }
        if (!SpeechRec) { notify('이 기기에서는 「말로 하기」를 쓸 수 없어요', '안드로이드 크롬이나 앱에서 써 주세요'); return; }
        clearTimeout(micTimer);
        bkStop();   // 「부캉아」 듣기를 잠깐 멈추고 버튼으로 한 번 듣기
        let r;
        try { r = new SpeechRec(); } catch (e) { notify('음성 인식을 시작하지 못했어요'); return; }
        rec = r; micOn = true;
        r.lang = 'ko-KR'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
        let heard = '';
        r.onresult = ev => {
            const res = ev.results[ev.results.length - 1];
            heard = (res[0] && res[0].transcript || '').trim();
            if (!res.isFinal) { micPaint('listen', heard); return; }
            let hit = null;
            for (let i = 0; i < res.length && !hit; i++) hit = micParse(res[i].transcript);
            if (hit && hit.run) { micStop('done', heard, hit.say); try { hit.run(); } catch (e) {} }
            else micStop('fail', heard, hit ? hit.say : '');
        };
        r.onerror = ev => {
            const c = ev && ev.error;
            micStop('fail', '', c === 'not-allowed' || c === 'service-not-allowed' ? '마이크 사용을 허락해 주세요 (주소창 왼쪽 자물쇠 → 마이크)' : c === 'no-speech' ? '말소리가 안 들렸어요. 버튼을 누르고 바로 말해 주세요' : c === 'network' ? '인터넷 연결을 확인해 주세요' : '');
        };
        r.onend = () => { if (micOn) micStop(heard ? 'fail' : '', heard); };
        micDuck(true);
        micPaint('listen');
        try { r.start(); } catch (e) { micStop('fail', '', '음성 인식을 시작하지 못했어요'); }
    }

    // 🦉 「부캉아」 부르기 (시험) — v2.119.0: 휴대폰 안의 소리 분석기(bukang.js)가 「부캉아」만 기다림 → 띵 소리 없음
    //   · 「부캉아」가 들리면 마이크를 넘겨주고 「듣고 있어요」 → 명령 한 번 듣기(🎙 버튼과 같음) → 끝나면 다시 「부캉아」 기다림
    //   · 노래가 나오는 동안에도 기다림 · 화면을 끄거나 다른 앱 · 다른 탭으로 가면 멈춤 (웹은 화면이 꺼지면 마이크를 못 씀)
    //   · 「내 목소리 등록」: 「부캉아」를 3번 녹음해 이 기기에만 저장 → 내 목소리를 더 잘 알아들음
    const BK_RE = /(부캉|북항|부강|부광|부캥|북캉|북앙|부깡|푸캉|부칸|북한)(이|아|야|하|가|님|씨)?/;
    const BK_ME = 'daeyeon_bk_me';
    let bkTimer = 0, bkOn = false, bkTok = 0, bkLoading = null, bkEnrolling = false, bkReady = false;
    //   · v2.120.0: 타석 모드뿐 아니라 모든 탭에서 기다림 — 타석 모드면 지금처럼 바로 명령, 다른 탭이면 🦉 부캉이 비서 창(bukang-ai.js)이 열려 들음
    const bkaBusy = () => { try { return !!(window.BKA && window.BKA.busy()); } catch (e) { return false; } };
    const bkCan = () => !!(cfg.bk && SpeechRec && root.classList.contains('is-authenticated') && !document.hidden && !micOn && !bkEnrolling && !bkaBusy());
    const bkMeN = () => { try { const j = JSON.parse(localStorage.getItem(BK_ME) || '[]'); return Array.isArray(j) ? j.length : 0; } catch (e) { return 0; } };
    function bkKick(ms) { clearTimeout(bkTimer); if (cfg.bk) bkTimer = setTimeout(bkSync, ms || 0); }
    function bkSync() { if (bkCan()) bkStart(); else if (!micOn && !bkEnrolling) bkStop(); }
    function bkLoad() {
        if (window.BukangKWS) return Promise.resolve();
        if (!bkLoading) bkLoading = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'bukang.js?v=2.119.0'; s.async = true;
            s.onload = () => res(); s.onerror = () => { bkLoading = null; rej(new Error('load')); };
            document.head.appendChild(s);
        });
        return bkLoading;
    }
    function bkFail(e) {
        const n = e && e.name;
        cfg.bk = false; saveCfg(); bkStop(); renderBat();
        notify('「부캉아」 부르기를 껐어요', n === 'NotAllowedError' || n === 'SecurityError' ? '마이크 사용을 허락해 주세요 (주소창 왼쪽 자물쇠 → 마이크)' : n === 'NotSupported' ? '이 기기에서는 쓸 수 없어요' : '준비하지 못했어요. 인터넷 연결을 확인해 주세요');
    }
    async function bkStart() {
        if (bkOn) return;
        bkOn = true; const tok = ++bkTok, first = !bkReady;
        if (first) notify('「부캉아」 준비 중…', '처음 한 번은 약 14MB를 받아요 (와이파이 추천)');
        try {
            await bkLoad();
            if (!BukangKWS.supported()) throw { name: 'NotSupported' };
            await BukangKWS.start(bkWake);
            if (tok !== bkTok || !bkCan()) { if (tok === bkTok) bkStop(); return; }
            if (first) { bkReady = true; notify('「부캉아」를 기다리고 있어요', '「부캉아」 부르고 「듣고 있어요」가 뜨면 명령을 말해 주세요'); }
        } catch (e) { if (tok === bkTok) { bkOn = false; bkFail(e); } }
    }
    function bkStop() {
        clearTimeout(bkTimer);
        bkTok++;
        if (bkOn) { bkOn = false; try { if (window.BukangKWS) BukangKWS.stop(); } catch (e) {} }
    }
    function bkWake() {   // 「부캉아」가 들림 → 마이크를 넘겨주고 명령 한 번 듣기 (타석 모드) · 다른 곳이면 부캉이 비서 창
        bkStop();
        let bka = false;
        try { bka = !!(window.BKA && (!batShown() || window.BKA.isOpen())); } catch (e) {}
        if (bka) { setTimeout(() => { try { window.BKA.wake(); } catch (e) {} }, 120); return; }
        if (!micOn) setTimeout(() => { if (!micOn) micToggle(); }, 120);
    }
    async function bkEnroll(paint) {   // 🎤 내 목소리 등록: 「부캉아」 3번 녹음 (paint: 다른 화면(부캉이 비서)에 보여 줄 때)
        if (bkEnrolling) return;
        const mp = paint || micPaint;
        bkEnrolling = true; bkStop(); clearTimeout(micTimer);
        let ok = 0, tries = 0;
        try {
            await bkLoad();
            if (!BukangKWS.supported()) throw { name: 'NotSupported' };
            await BukangKWS.init(); bkReady = true;
            while (ok < 3 && tries < 7) {
                tries++;
                mp('listen', '', '', { title: `「부캉아」라고 한 번 말해 주세요 (${ok + 1}/3)`, sub: '평소 부르듯이 · 2초 동안 들어요' });
                const x = await BukangKWS.record(2200);
                if (await BukangKWS.enroll(x)) ok++;
                else { mp('fail', '', '', { title: '잘 안 들렸어요', sub: '조금 더 크게, 「부캉아」 한 번만 말해 주세요' }); await new Promise(r => setTimeout(r, 1300)); }
            }
            mp(ok ? 'done' : 'fail', '', '', { title: ok ? `내 목소리 ${ok}번 등록했어요` : '등록하지 못했어요', sub: ok ? '이제 「부캉아」를 더 잘 알아들어요' : '조용한 곳에서 다시 해 주세요' });
        } catch (e) {
            mp('fail', '', '', { title: '등록하지 못했어요', sub: e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? '마이크 사용을 허락해 주세요 (주소창 왼쪽 자물쇠 → 마이크)' : '다시 해 주세요' });
        } finally {
            bkEnrolling = false;
            clearTimeout(micTimer); micTimer = setTimeout(() => mp(''), 3500);
            renderBat(); bkKick(600);
            if (paint) paint('end');
        }
    }

    // 👉 아래 재생 띠를 옆으로 끝까지 밀면 사라지면서 꺼짐 (v2.117.0) — 띠 너비의 45% 넘게 밀어야 꺼짐(둔하게) · 덜 밀면 제자리로
    function miniSwipe(el) {
        let x0 = 0, y0 = 0, dx = 0, w = 1, pid = null, drag = false, arm = false, ate = false;
        const CUT = 0.45, START = 16;
        const reset = anim => {
            el.style.transition = anim ? 'transform .22s ease, opacity .22s ease' : '';
            el.style.transform = ''; el.style.opacity = ''; el.classList.remove('pl-swipe', 'arm');
        };
        el.addEventListener('pointerdown', e => {
            if (e.button > 0 || pid !== null) return;
            pid = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; drag = false; arm = false;
            w = Math.max(200, el.offsetWidth || innerWidth); el.style.transition = '';
        });
        el.addEventListener('pointermove', e => {
            if (e.pointerId !== pid) return;
            const mx = e.clientX - x0, my = e.clientY - y0;
            if (!drag) {
                if (Math.abs(my) > START && Math.abs(my) > Math.abs(mx)) { pid = null; return; }   // 위아래로 움직이면 밀기 아님
                if (Math.abs(mx) < START) return;
                drag = true; el.classList.add('pl-swipe');
                try { el.setPointerCapture(pid); } catch (er) {}
            }
            dx = mx;
            const k = Math.min(1, Math.abs(dx) / w);
            arm = k >= CUT; el.classList.toggle('arm', arm);
            el.style.transform = 'translateX(' + dx + 'px)'; el.style.opacity = String(Math.max(0.35, 1 - k * 0.9));
        });
        const end = e => {
            if (e.pointerId !== pid) return;
            pid = null;
            if (!drag) return;
            ate = true; setTimeout(() => { ate = false; }, 350);   // 민 다음 손을 뗄 때 버튼이 눌리지 않게
            if (e.type === 'pointerup' && arm) {
                el.style.transition = 'transform .2s ease, opacity .2s ease';
                el.style.transform = 'translateX(' + (dx < 0 ? -1.1 : 1.1) * w + 'px)'; el.style.opacity = '0';
                setTimeout(() => { stopAll(); remember(); reset(false); notify('노래를 껐어요', '다시 들으려면 곡을 눌러 주세요'); }, 210);
            } else reset(true);
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('click', e => { if (ate) { e.stopPropagation(); e.preventDefault(); } }, true);
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
    function walkTrack(person) { const k = cfg.walkSong[person.pid]; return person.tracks.find(t => t.key === k && !t.hidAll) || person.tracks.find(t => !isOff(t.id)) || person.tracks[0]; }   // 따로 고른 곡이 없으면 빼지 않은 첫 곡 · 🔒 고른 곡을 모두에게 숨겼으면 숨기지 않은 첫 곡
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
    function playWalk(pid, asPinch) {
        const person = personOf(pid);
        if (!person) return;
        pinchOn = !!asPinch;
        const t = walkTrack(person);
        const at = cfg.hook ? hookTime(t) : 0;
        const li = asPinch ? -1 : cfg.lineup.indexOf(pid);
        if (li >= 0 && li !== cfg.batIdx) { cfg.batIdx = li; saveCfg(); }
        setQueue(tracks.map(x => x.id), t.id);
        const ann = cfg.ann ? annPieces(person, asPinch ? 0 : li + 1) : null;
        const go = () => { walk = true; walkHeard = 0; walkLast = at; load(t, true, at); if (cfg.fadeIn) fadeIn(); renderBat(); };
        if (ann) {   // 📢 장내 아나운서 먼저 → 끝나면 등장곡 (같은 재생기로 틀어서 아이폰에서도 곡이 이어 나옴)
            load(t, false, at);
            walk = true;
            annStart(ann, go);
            renderBat();
        } else go();
    }
    function nextBatter() {
        const n = cfg.lineup.length;
        if (!n) return;
        cfg.batIdx = (cfg.batIdx + 1) % n; saveCfg();
        playWalk(cfg.lineup[cfg.batIdx]);
    }
    function prevBatter() {
        const n = cfg.lineup.length;
        if (!n) return;
        cfg.batIdx = cfg.batIdx < 0 ? 0 : (cfg.batIdx - 1 + n) % n; saveCfg();
        playWalk(cfg.lineup[cfg.batIdx]);
    }
    function pinch(pid) {   // 대타: 이번 타석만 다른 선수 곡 (타순은 그대로 · 차례는 한 칸 넘어감)
        const n = cfg.lineup.length;
        if (n) { cfg.batIdx = (cfg.batIdx + 1) % n; saveCfg(); }
        mode = '';
        playWalk(pid, true);
    }
    // 저장해 둔 타순 (A팀 · B팀 …) — 이 기기에만 저장
    const sameLu = a => a.join('|') === cfg.lineup.join('|');
    function setSave(name) {
        name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
        if (!name || !cfg.lineup.length) return;
        const k = cfg.sets.findIndex(x => x.name === name);
        if (k >= 0) cfg.sets[k].lineup = cfg.lineup.slice();
        else if (cfg.sets.length >= SET_MAX) { showMsg('타순은 ' + SET_MAX + '개까지 저장할 수 있어요. 안 쓰는 것을 지워 주세요.'); return; }
        else cfg.sets.push({ name: name, lineup: cfg.lineup.slice() });
        saveCfg(); setOpen = false;
        notify('「' + name + '」 타순을 저장했어요', cfg.lineup.length + '명');
    }
    function setLoad(i) {
        const st = cfg.sets[i];
        if (!st || sameLu(st.lineup)) return;
        if (cfg.lineup.length && !cfg.sets.some(x => sameLu(x.lineup)) && !window.confirm('지금 타순은 저장되지 않았어요.\n「' + st.name + '」 타순으로 바꿀까요?')) return;
        cfg.lineup = st.lineup.slice(); cfg.batIdx = -1; preText = ''; saveCfg(); annWarmed = false; annPrep();
        hydrate();
        notify('「' + st.name + '」 타순을 불러왔어요', st.lineup.map(personOf).filter(Boolean).length + '명');
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
            for (const m of SND) {   // 축하곡 · 공수 교대 음악도 같이 받아 둠 (실패해도 곡 수에는 안 셈)
                if (!m.mu) continue;
                try {
                    let r = await c.match(m.src);
                    if (!r) { r = await fetch(m.src, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); await c.put(m.src, r.clone()); }
                    sndBlob(m, await r.blob());
                } catch (e) { console.warn('축하곡 미리 받기 실패:', m.nm, e); }
            }
            const keep = new Set(list.map(t => t.src).concat(SND.map(m => m.mu ? m.src : sndUrl(m))));
            (await c.keys()).forEach(req => { if (!keep.has(req.url) && (req.url.indexOf('/' + ANN_DIR) < 0 || !req.url.endsWith('?v=' + ANN_V))) c.delete(req); });   // 안내 파일은 지금 판(ANN_V)만 남김
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
            for (const m of SND) { if (m.mu && !blobUrl[m.src]) { const r = await c.match(m.src); if (r) sndBlob(m, await r.blob()); } }
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
    //   · 화면을 끄거나 다른 앱에 30분 넘게 가 있었으면 미루지 않음 (돌아온 순간 원래 규칙대로)
    let holdFrom = 0, awaySince = 0;
    // 📋 타순 고르기 화면(v2.107.0): 위 타순 칸 · 아래 학년별 사진 목록 — 누르면 다음 칸에 들어감 · 칸을 먼저 누르면 그 칸으로
    let luEdit = [], luSnap = [], luFix = -1, luFilter = 'all', luAdded = false, luSnapIdx = -1;
    let setOpen = false, pinchOn = false;   // 타순 저장 판 열림 · 지금 나오는 곡이 대타 곡인지
    const SET_MAX = 8, SET_NAMES = ['A팀', 'B팀', 'C팀', '연습 경기'];
    const lockIfDue = () => setTimeout(() => { try { if (typeof window.dyLockIfDue === 'function') window.dyLockIfDue(); } catch (e) {} }, 0);
    function holdSync() {   // 타석 모드에 들어오고 나갈 때마다
        const on = batShown();
        if (on && !holdFrom) holdFrom = Date.now();
        if (!on && holdFrom) { holdFrom = 0; lockIfDue(); }   // 나가는 순간: 미뤄 둔 잠금이 있으면 바로
        bkKick(0);
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
                        return { s: t.s, e: Math.max(e, t.s + 0.3), w: t.w };   // 🎯 v2.133.0 w = 단어마다 [시작, 끝]
                    });
                }
            } catch (e) { lines = []; spans = null; }
        }
        const box = $('plLyr');
        if (!box) return;
        box.classList.toggle('plain', !spans);
        box.innerHTML = lines.length
            ? lines.map((l, i) => (l.first && l.tag ? `<span class="pl-tag">${esc(l.tag)}</span>` : '') + `<p data-li="${i}"><span>${window.cheerWordHtml(l.tx)}</span></p>`).join('')
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
            k3.innerHTML = `<span class="tag">${esc(lines[c] ? lines[c].tag : '')}</span><span class="pv">${esc(pv)}</span><span class="now"><span>${lines[c] ? window.cheerWordHtml(lines[c].tx) : ''}</span></span>` +
                `<span class="nx"><em>다음</em>${esc(nx ? nx.tx : '♪')}</span><span class="hint">가사를 누르면 전체가 크게 나와요</span>`;
            const box = $('plLyr');
            if (box) {
                const ps = box.querySelectorAll('p');
                ps.forEach((el, i) => { el.classList.toggle('now', i === a); el.classList.toggle('past', a >= 0 && i < a); if (i !== a) window.cheerClearWords(el); });
                if (lyrOpen && ps[c]) { const el = ps[c]; box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2), behavior: force ? 'auto' : 'smooth' }); }
            }
        }
        // 🎯 v2.133.0: 단어마다 따로 칠함 (단어 시간이 있으면 실제로 부르는 순간에 · 쉬는 사이엔 멈춤)
        const sp = a >= 0 ? spans[a] : null;
        const n1 = k3.querySelector('.now > span');
        if (n1) { if (sp) window.cheerPaintWords(n1, sp, sec, sp.e); else window.cheerClearWords(n1); }
        if (lyrOpen && sp) { const n2 = document.querySelector('#plLyr p.now > span'); if (n2) window.cheerPaintWords(n2, sp, sec, sp.e); }
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
                    <div class="pl-hot" id="plHot" hidden></div>
                </div>
                <div class="pl-chips" id="plChips"></div>
                <div class="pl-pinfo" id="plPinfo" hidden>🔥 지난 7일 동안 많은 가족이 들은 순서예요 · 숫자는 보여 주지 않아요</div>
                <div class="pl-rows" id="plRows"></div>
            </div>
            <div id="plBat" hidden></div>
            <div id="plStat" hidden></div>`;
        sec.addEventListener('click', onClick);

        const mini = document.createElement('div');
        mini.id = 'plMini'; mini.className = 'pl-mini'; mini.hidden = true;
        mini.innerHTML = `<i class="pl-mline"><i id="plMiniBar"></i></i>
            <button type="button" class="pl-mini-open" data-pl="open" aria-label="큰 플레이어 열기"><span id="plMiniCv"></span><span class="tx"><b id="plMiniT"></b><small id="plMiniW"></small></span></button>
            <button type="button" class="pl-ib" data-pl="toggle" id="plMiniPlay" aria-label="재생">${I.play}</button>
            <button type="button" class="pl-ib" data-pl="next" aria-label="다음 곡">${I.next}</button>`;
        mini.addEventListener('click', onClick);
        miniSwipe(mini);
        document.body.appendChild(mini);

        const snd = document.createElement('div');   // 📣 타석 모드 아래 효과음 띠
        snd.id = 'plSnd'; snd.className = 'pl-snd';
        snd.setAttribute('role', 'group'); snd.setAttribute('aria-label', '응원 효과음 · 축하곡');
        snd.innerHTML = `<div class="pl-snd-in">${SND.map(s => `<button type="button"${s.mu ? ' class="mu" aria-pressed="false"' : ''} data-pl="snd" data-s="${s.id}"><span aria-hidden="true">${s.em}</span>${s.nm}</button>`).join('')}</div>`;
        snd.addEventListener('click', onClick);
        document.body.appendChild(snd);

        const mic = document.createElement('div');   // 🎙 듣는 판
        mic.id = 'plMicPan'; mic.className = 'pl-micpan'; mic.hidden = true;
        mic.setAttribute('role', 'status'); mic.setAttribute('aria-live', 'polite');
        mic.addEventListener('click', onClick);
        document.body.appendChild(mic);

        const big = document.createElement('div');
        big.id = 'plBig'; big.className = 'pl-big'; big.hidden = true; big.dataset.tab = 'lyr'; big.dataset.ptab = 'q';
        big.setAttribute('role', 'dialog'); big.setAttribute('aria-label', '주제곡 플레이어');
        big.innerHTML = `
            <div class="pl-bhead">
                <button type="button" class="pl-close" data-pl="close" id="plClose">${I.down}<span id="plCloseTx">닫기</span></button>
                <span id="plHeadTx">지금 재생 중</span>
                <span class="cnt" id="plCnt"></span>
                <button type="button" class="pl-fs" data-pl="xl" id="plXl" hidden>가 크게</button>
            </div>
            <div class="pl-song"><button type="button" class="pl-cvgo" id="plBigCv" data-pl="goplayer" aria-label="이 선수 화면으로 가기 (곡 목록)"></button><span class="tx"><b id="plBigT"></b><small id="plBigW"></small><em id="plBigG"></em><span class="pl-fav" id="plFav"><i id="plFavTx">내 목록에 담기</i>${[0, 1, 2].map(n => `<button type="button" data-pl="fav" data-n="${n}" aria-pressed="false">${n + 1}</button>`).join('')}</span></span><span class="pl-sbtns"><button type="button" class="pl-dl" data-pl="dl" id="plDl">⬇ MP3 저장</button><button type="button" class="pl-dl pl-offb" data-pl="offcur" id="plOffB" hidden>🚫 이 곡 빼기</button></span></div>
            <div class="pl-tabs" id="plTabs" role="tablist" aria-label="가사 · 재생목록 · 내 목록"><button type="button" data-pl="ptab" data-t="lyr">가사</button><button type="button" data-pl="ptab" data-t="q">재생목록</button><button type="button" data-pl="ptab" data-t="my">⭐ 내 목록</button></div>
            <div class="pl-main" id="plMain">
                <button type="button" class="pl-k3" data-pl="lyrics" id="plK3" aria-label="가사 전체 보기"></button>
            </div>
            <div class="pl-lyr${cfg.xl ? ' xl' : ''}" id="plLyr" hidden></div>
            <div class="pl-panel" id="plPanel"></div>
            <div class="pl-coach" id="plCoach" data-pl="coach-ok" hidden><div class="pl-coach-bub" id="plCoachBub" role="dialog" aria-label="가사 보는 법"><div class="who"><i></i>부캉이</div><p>여기 <b>가사를 누르면</b> 노래 전체 가사를 크게 볼 수 있어요!</p><button type="button" data-pl="coach-ok">알겠어요</button></div></div>
            <div class="pl-prog"><div class="pl-seek" id="plSeek" role="slider" tabindex="0" aria-label="재생 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i><i id="plSeekFill"></i></i><b id="plSeekKnob"></b></div>
                <div class="pl-times"><span id="plCurT">0:00</span><span id="plDurT"></span></div></div>
            <div class="pl-ctl">
                <button type="button" class="md" data-pl="shuffle" id="plShuf" aria-label="셔플">${I.shuffle}<em></em></button>
                <button type="button" class="sk" data-pl="prev" aria-label="이전 곡">${I.prev}</button>
                <button type="button" class="pp" data-pl="toggle" id="plBigPlay" aria-label="재생">${I.play}</button>
                <button type="button" class="sk" data-pl="next" aria-label="다음 곡">${I.next}</button>
                <button type="button" class="md" data-pl="repeat" id="plRep" aria-label="반복"></button>
            </div>
            <div class="pl-msg" id="plMsg" hidden></div>
            <div class="pl-osheet" id="plOSheet" data-pl="off-x" hidden><div class="pl-osheet-in" role="dialog" aria-labelledby="plOSheetT">
                <b id="plOSheetT"></b>
                <button type="button" data-pl="off-me"><span>📱 내 휴대폰에서만 빼기</span><small>다른 학부모님은 그대로 들어요</small></button>
                <button type="button" data-pl="off-all" class="all"><span>🔒 모든 학부모 목록에서 숨기기</span><small id="plOSheetW"></small></button>
                <button type="button" data-pl="off-x" class="x">취소</button>
            </div></div>`;
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
            if (document.hidden) { remember(); awaySince = Date.now(); bkStop(); }
            else {
                const long = awaySince && Date.now() - awaySince > AWAY_MAX;
                awaySince = 0;
                if (long && holdFrom) { holdFrom = 0; lockIfDue(); setTimeout(holdSync, 50); }   // 오래 비웠다 돌아옴: 미뤄 둔 잠금부터 확인하고, 안 잠겼으면 다시 미루기 시작
                measure(); if (batShown()) wakeOn(); paintTime(); bkKick(300);
            }
        });
        setupMediaKeys();
    }
    function measure() {   // 아래 탭 막대 높이 → 띠 · 큰 플레이어가 그 바로 위에 붙음
        const t = $('mainTabs');
        const h = t && getComputedStyle(t).position === 'fixed' ? t.offsetHeight : 0;
        root.style.setProperty('--pl-tabh', h + 'px');
        const m = $('plMini'); if (m && !m.hidden && m.offsetHeight) root.style.setProperty('--pl-minih', m.offsetHeight + 'px');   // 띠 높이 → 타순 띠가 그 위에 붙음
    }
    function inFilter(t) { return filter === 'all' || filter === 'off' ? true : filter === 'hot' ? popRank.has(t.id) : /^fav\d$/.test(filter) ? favHas(+filter.slice(3), t.id) : filter === 'mine' ? (personOf(t.pid) || {}).mine : String(t.g) === String(filter); }
    // 🔥 v2.124.0: 인기곡 (서버 v2.44.0 bootstrap 의 pop = 최근 7일 많은 가족이 들은 곡 id 순서 · 숫자 없음) → 숨긴 곡 · 뺀 곡 · 없는 곡은 빼고 순위
    let popRaw = [], popIds = [], popRank = new Map();
    const POP_MIN = 3;   // 이만큼은 모여야 「인기」를 보여 줌 (처음 며칠은 안 보임)
    function popCalc() {
        popIds = popRaw.filter(id => byId.has(id) && !byId.get(id).hidAll && !isOff(id));
        if (popIds.length < POP_MIN) popIds = [];
        popRank = new Map(popIds.map((id, i) => [id, i]));
    }
    function popTag(id) {
        const r = popRank.get(id);
        if (r == null || r >= 10) return '';
        return r < 3 ? `<i class="pl-pop top">🔥 인기 ${r + 1}위</i>` : '<i class="pl-pop">🔥 인기</i>';
    }
    window.plPop = function (list) {
        popRaw = Array.isArray(list) ? list.map(String).slice(0, 40) : [];
        try { if (built) renderList(); } catch (e) {}
    };
    function listIds() {   // 지금 보이는 목록 (전체 재생 · 셔플 재생 · 줄 누르기에 씀)
        if (filter === 'off') return tracks.filter(t => isOff(t.id)).map(t => t.id);
        if (filter === 'hot') return popIds.slice();
        if (/^fav\d$/.test(filter)) return favIds(+filter.slice(3)).filter(i => !isOff(i));   // ⭐ 담은 순서대로
        const ids = tracks.filter(inFilter).map(t => t.id);
        return ids.filter(i => !isOff(i));   // 뺀 곡은 목록에서 숨김 (「빠진 곡」 칩에 모임)
    }
    function offToggle(ids, on) {   // 곡 빼기 · 다시 넣기
        ids = ids.filter(id => byId.has(id));
        if (!ids.length) return;
        if (on == null) on = !isOff(ids[0]);
        setOff(ids, on);
        if (on && cur && ids.indexOf(cur.id) >= 0 && !walk && attached && audio && !audio.paused) next(false);   // 듣던 곡을 빼면 바로 다음 곡으로
        if (filter === 'off' && !offSet.size) filter = 'all';
        renderList(); renderNow(); paintOff();
        const t = byId.get(ids[0]), nm = ids.length > 1 ? ids.length + '곡' : '「' + t.title + '」';
        if (on) notify(nm + '을 뺐어요', '전체 재생 · 셔플에서 안 나와요 · 「빠진 곡」에서 다시 넣을 수 있어요');
        else notify(nm + '을 다시 넣었어요');
    }
    // 🔒 v2.120.0: 우리 아이 곡 모든 분 목록에서 숨기기 · 다시 공개 (C안) — 화면은 바로 바꾸고 서버(setHiddenSongs, v2.43.0)에 그 선수 곡 키 전체를 보냄
    //   한 선수에 한 번에 하나씩 차례로 보냄(마지막 상태가 남게) · 못 보내면 마지막으로 저장된 상태로 되돌림 · 기기 저장본(명단)도 같이 고침
    const hidSend = {};
    function setHidAll(t, on) {
        const person = personOf(t.pid); if (!person || !person.manage) return;
        const st = hidSend[person.pid] || (hidSend[person.pid] = { busy: false, again: false, saved: Array.from(window.cheerHiddenKeys(person.src)) });
        const keys = Array.from(window.cheerHiddenKeys(person.src)), i = keys.indexOf(t.key);
        if (on && i < 0) keys.push(t.key); if (!on && i >= 0) keys.splice(i, 1);
        person.src.hideSongs = keys;
        const wasCur = on && cur && cur.id === t.id && !walk && attached && audio && !audio.paused;
        sig = ''; sync();
        if (wasCur) next(false);
        if (filter === 'off' && !offCount()) { filter = 'all'; renderList(); }
        notify(on ? '「' + t.title + '」을 모든 학부모 목록에서 숨겼어요' : '「' + t.title + '」을 다시 모든 학부모께 공개했어요', on ? person.name + ' 보호자와 운영진에게만 보여요 · 「빠진 곡」에서 다시 공개' : '다른 학부모님은 앱을 다시 열면 보여요');
        hidFlush(person, st);
    }
    function hidFlush(person, st) {
        if (st.busy) { st.again = true; return; }
        if (typeof postApi !== 'function') return;
        st.busy = true;
        const src = person.src, keys = Array.from(window.cheerHiddenKeys(src));
        postApi({ action: 'setHiddenSongs', playerNo: person.no, playerName: person.name, keys: keys })
            .then(() => {
                st.saved = keys;
                try {   // 기기 저장본(명단)도 고치고 명단 번호를 지워 다음엔 서버에서 새로 받게
                    const s = typeof snapLoad === 'function' ? snapLoad() : null;
                    const q = s && s.data.players.find(x => String(x.name || '').trim() === person.name && (parseInt(x.no, 10) || 0) === person.no);
                    if (q) { q.hideSongs = keys.slice(); snapPatch({ players: s.data.players }, 'roster', ''); }
                } catch (e) {}
            })
            .catch(err => {
                console.warn('곡 숨김 저장 실패:', err);
                st.again = false;
                src.hideSongs = st.saved.slice(); sig = ''; sync();
                notify('저장하지 못했어요', '인터넷 연결을 확인하고 다시 눌러 주세요');
            })
            .then(() => { st.busy = false; if (st.again) { st.again = false; hidFlush(personOf(person.pid) || person, st); } });
    }
    function offAsk(open) {   // 🔒 v2.120.0 C안: 우리 아이 곡(운영진은 모든 곡)이면 「내 휴대폰에서만 / 모든 분께」 고르기
        const sh = $('plOSheet'); if (!sh) return;
        if (open) { const person = personOf(cur.pid); $('plOSheetT').textContent = '「' + cur.title + '」을 어떻게 뺄까요?'; $('plOSheetW').textContent = person.name + ' 보호자와 운영진만 할 수 있어요 · 「빠진 곡」에서 다시 공개'; }
        sh.hidden = !open;
    }
    function offCount() { let n = 0; tracks.forEach(t => { if (isOff(t.id)) n++; }); return n; }
    function paintOff() {   // 큰 플레이어 「이 곡 빼기」 버튼 (타석 등장곡일 때는 숨김)
        const b = $('plOffB'); if (!b) return;
        b.hidden = !cur || walk;
        const off = !!cur && isOff(cur.id);
        b.classList.toggle('on', off);
        b.textContent = cur && cur.hidAll ? '🔓 다시 공개' : off ? '↩ 다시 넣기' : '🚫 이 곡 빼기';
        const sh = $('plOSheet'); if (sh && !sh.hidden && (!cur || walk)) sh.hidden = true;
    }
    function renderList() {
        const cnt = $('plCount');
        if (!cnt) return;
        statSeg();
        const nOff = offCount(), live = tracks.filter(t => !isOff(t.id));
        const total = live.reduce((a, t) => a + lenSec(t.len), 0), m = Math.round(total / 60);
        cnt.textContent = tracks.length ? `${live.length}곡 · 선수 ${people.length}명` + (m ? ` · 약 ${m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분'}` : '') + (nOff ? ` · ${nOff}곡 뺌` : '') : '';
        const grades = Array.from(new Set(people.map(p => p.g))).filter(Boolean).sort((a, b) => b - a);
        popCalc();
        if (filter === 'hot' && !popIds.length) filter = 'all';
        if (/^fav\d$/.test(filter) && !favIds(+filter.slice(3)).length) filter = 'all';
        const chips = popIds.length ? [['hot', '🔥 인기순'], ['all', '전체']] : [['all', '전체']];
        cfg.fav.forEach((f, n) => { const k = favIds(n).length; if (k) chips.push(['fav' + n, '⭐ ' + esc(f.name) + ' ' + k]); });   // ⭐ v2.139.0: 내 목록
        if (people.some(p => p.mine)) chips.push(['mine', '우리 아이']);
        grades.forEach(g => chips.push([String(g), g + '학년']));
        if (nOff) chips.push(['off', '🚫 빠진 곡 ' + nOff]);
        $('plChips').innerHTML = chips.map(c => `<button type="button" data-pl="chip" data-f="${c[0]}" class="${String(filter) === c[0] ? 'on' : ''}${c[0] === 'off' ? ' offc' : ''}${c[0] === 'hot' ? ' hotc' : ''}${/^fav/.test(c[0]) ? ' favc' : ''}">${c[1]}</button>`).join('');
        const hot = $('plHot'), top = popIds.length ? byId.get(popIds[0]) : null;
        if (hot) {
            hot.hidden = !top;
            if (top) hot.innerHTML = `<button type="button" class="pl-hot-tx" data-pl="chip" data-f="hot"><span class="em" aria-hidden="true">🔥</span><span class="tx">요즘 가장 많이 듣는 곡<b>${esc(top.title)} · ${esc(top.name)}</b></span></button><button type="button" class="pl-hot-go" data-pl="hotplay">${I.play}듣기</button>`;
        }
        const pin = $('plPinfo'); if (pin) pin.hidden = filter !== 'hot';
        const ids = listIds();
        const html = ids.map((id, i) => {
            const t = byId.get(id);
            const row = `<button type="button" class="pl-row${cur && cur.id === id ? ' cur' : ''}" data-pl="row" data-id="${esc(id)}"><span class="n">${i + 1}</span>${cover(t)}` +
                `<span class="t"><b>${esc(t.title)}</b><small>${t.hidAll ? '<i class="pl-htag">🔒 모든 학부모에게 숨김</i>' : ''}${popTag(id)}${esc(t.name)}${t.beat ? ' · ' + esc(t.beat) : ''}</small></span><span class="d">${esc(t.len)}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span></button>`;
            if (t.hidAll) return `<div class="pl-rw off">${row}<button type="button" class="pl-ox back hid" data-pl="unhide" data-id="${esc(id)}" aria-label="${esc(t.title)} 다시 공개">🔓 다시 공개</button></div>`;
            return isOff(id) ? `<div class="pl-rw off">${row}<button type="button" class="pl-ox back" data-pl="off" data-id="${esc(id)}" aria-label="${esc(t.title)} 다시 넣기">↩ 다시 넣기</button></div>` : row;   // 「빠진 곡」 칩에서만 보임
        }).join('');
        const nHid = filter !== 'off' ? tracks.filter(t => inFilter(t) && isOff(t.id)).length : 0;
        $('plRows').innerHTML = html ? html : `<div class="pl-empty">${tracks.length ? (nHid ? '이 목록의 곡을 모두 뺐어요<br>「🚫 빠진 곡」에서 다시 넣을 수 있어요' : '이 학년에는 아직 곡이 없어요') : '주제곡을 불러오는 중이에요.<br>잠시 뒤에도 안 보이면 인터넷 연결을 확인해 주세요.'}</div>`;
    }
    // ---------------- 📋 타순 고르기 ----------------
    const LU_MAX = 30;
    function canSeeHidden() { try { return currentRole === 'sub' || currentRole === 'general' || (typeof isSuperOrDev === 'function' && isSuperOrDev()); } catch (e) { return false; } }
    function photo(person, size) {   // 명단 탭과 같은 사진 · 사진을 숨긴 선수는 등번호 그림
        let src = '';
        try { if (!(person.src.hidePhoto && !canSeeHidden()) && typeof getPlayerPhotoUrl === 'function') src = getPlayerPhotoUrl(person.src) || ''; } catch (e) { src = ''; }
        if (!src) return `<span class="pl-ph pl-cv pl-g${person.g || 0}" style="width:${size}px;height:${size}px" aria-hidden="true">${esc(person.no || '♪')}</span>`;
        return `<img class="pl-ph" src="${esc(src)}" alt="" loading="lazy" decoding="async" width="${size}" height="${size}" onerror="try{handleImgError(this)}catch(e){this.onerror=null;this.style.visibility='hidden'}">`;
    }
    function luOpen() {
        luSnap = cfg.lineup.slice(); luSnapIdx = cfg.batIdx;
        luEdit = cfg.lineup.slice();
        luFix = -1; luFilter = 'all';
    }
    function luSave() { cfg.lineup = luEdit.slice(); cfg.batIdx = -1; preText = ''; saveCfg(); }
    function luPick(pid) {   // 목록에서 선수를 누름: 차례로 뒤에 붙음 · 다시 누르면 빠짐 · 아래 띠에서 번호를 골라 둔 때는 그 자리로
        const k = luEdit.indexOf(pid);
        if (luFix >= 0) {
            if (k >= 0) { const x = luEdit[k]; luEdit[k] = luEdit[luFix]; luEdit[luFix] = x; }
            else luEdit[luFix] = pid;
            luFix = -1;
        } else if (k >= 0) luEdit.splice(k, 1);
        else if (luEdit.length < LU_MAX) luEdit.push(pid);
        else { showMsg('타순은 ' + LU_MAX + '명까지 넣을 수 있어요.'); return; }
        luSave();
    }
    function luChip(i) {     // 아래 띠에서 번호를 누름: 두 번호를 차례로 누르면 자리가 바뀜
        if (luFix < 0) luFix = i;
        else if (luFix === i) luFix = -1;
        else { const x = luEdit[i]; luEdit[i] = luEdit[luFix]; luEdit[luFix] = x; luFix = -1; luSave(); }
    }
    function luFlag(tab) {   // 타순 정하기 화면이 보이는 동안: 떠 있는 글자 크기 버튼을 숨김 (아래 타순 띠를 가리지 않게)
        let t = tab; try { if (!t && typeof currentMainTab !== 'undefined') t = currentMainTab; } catch (e) {}
        const inBat = view === 'bat' && (!t || t === 'music');
        root.classList.toggle('pl-lu-on', mode === 'lineup' && inBat);
        const sndOn = inBat && mode !== 'lineup' && people.length > 0;   // 📣 효과음 띠: 타석 모드에서만 (타순 정하는 동안은 타순 띠가 그 자리)
        if (sndOn && !root.classList.contains('pl-snd-on')) { sndWarm(); annPrep(); }
        root.classList.toggle('pl-snd-on', sndOn);
        if (!inBat && muOn) muStop();   // 타석 모드를 벗어나면 끌 버튼이 안 보이니 음악을 끔
    }
    function renderLineup(box) {
        const n = luEdit.length;
        const guide = luFix >= 0
            ? `<b><span class="hot">${luFix + 1}번</span>과 자리를 바꿀 번호를 아래 띠에서 누르세요</b><small>같은 번호를 다시 누르면 취소 · 목록에서 선수를 누르면 그 선수로 바뀌어요</small>`
            : n >= LU_MAX ? `<b><span class="hot">${n}명</span>을 다 넣었어요</b><small>「완료」를 누르세요</small>`
            : `<b><span class="hot">${n + 1}번 타자</span>를 누르세요</b><small>1번 타자부터 차례로 누르면 끝! 다시 누르면 빠져요</small>`;
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
        const dock = luEdit.map((pid, i) => {
            const p = personOf(pid);
            return `<span class="pl-lchip${luFix === i ? ' sel' : ''}"><button type="button" class="m" data-pl="lu-chip" data-i="${i}" aria-label="${i + 1}번 타자 ${p ? esc(p.name) : ''} · 자리 바꾸기"><i>${i + 1}</i>${p ? esc(p.name) : '?'}</button>` +
                `<button type="button" class="x" data-pl="lu-x" data-i="${i}" aria-label="${i + 1}번 타자 빼기">✕</button></span>`;
        }).join('') + (n < LU_MAX ? `<span class="pl-lchip next"><i>${n + 1}</i>다음</span>` : '');
        const keep = box.querySelector('.pl-ludock-row'), sx = keep ? keep.scrollLeft : -1;
        box.innerHTML = `
            <div class="pl-lue">
                <div class="pl-lue-top">
                    <div class="pl-lue-h"><b>타순 정하기</b><small>${n}명</small>
                        <button type="button" class="pl-sbtn" data-pl="lu-cancel">취소</button>
                        <button type="button" class="pl-sbtn on" data-pl="lu-done">완료</button></div>
                    <div class="pl-lue-guide">${guide}</div>
                </div>
                <div class="pl-chips pl-lue-chips">${chips}</div>
                <div class="pl-lue-list">${list || '<div class="pl-empty">선수 명단을 불러오는 중이에요.</div>'}</div>
            </div>
            <div class="pl-ludock">
                <div class="pl-ludock-in">
                    <div class="pl-ludock-h"><b>오늘 타순 ${n}명</b><small>번호 두 개를 차례로 누르면 자리 바뀜</small><button type="button" class="pl-lnk" data-pl="lu-clear"${n ? '' : ' disabled'}>모두 지우기</button></div>
                    <div class="pl-ludock-row">${dock}</div>
                </div>
            </div>`;
        const row = box.querySelector('.pl-ludock-row');   // 새로 넣었으면 띠 끝으로 · 아니면 보던 자리 그대로
        if (row) row.scrollLeft = luAdded || sx < 0 ? row.scrollWidth : sx;
        luAdded = false;
    }

    function annRow(nxt, ord) {   // 📢 장내 아나운서 켜기/끄기 (v2.112.0 · 시안 ④ B)
        if (!annMan) return '';
        const a = nxt ? annPieces(nxt, ord) : null;
        const ex = a ? a.text : nxt ? ord + '번 타자, ' + nxt.name : '1번 타자, 선수 이름';
        return `<div class="pl-ann"><span class="tx">📢 장내 아나운서<small>${cfg.ann ? `「${esc(ex)}」 다음에 등장곡` : '꺼 둠 · 등장곡만 바로 나와요'}</small></span>` +
            `<button type="button" class="pl-sw" data-pl="ann" role="switch" aria-checked="${cfg.ann ? 'true' : 'false'}" aria-label="장내 아나운서 ${cfg.ann ? '끄기' : '켜기'}"></button></div>`;   // v2.126.1: 「부캉아로 부르기(시험)」 줄 · 내 목소리 등록 줄은 뺌 → 부캉이 비서 ⚙ 설정에서 켜고 끔
    }
    const ob = (o, v, label, on) => `<button type="button" data-pl="opt" data-o="${o}" data-v="${v}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;   // 타석 옵션: 둘 중 고르기 버튼
    function renderBat() {
        const box = $('plBat');
        luFlag();
        if (!box || view !== 'bat') return;
        if (mode === 'lineup') { renderLineup(box); paintState(); return; }
        const lu = cfg.lineup.map(personOf).filter(Boolean), n = lu.length;
        const nxt = n ? lu[(cfg.batIdx + 1) % n] : null;
        const curPid = walk && cur ? cur.pid : '';
        let lineupHtml;
        if (n) {
            const ord = (cfg.batIdx + 1) % n + 1;
            const phPanel = mode !== 'ph' ? '' : `<div class="pl-php"><div class="pl-h"><b>대타 고르기</b><small>이번 타석만 · 타순은 그대로</small><button type="button" class="pl-sbtn" data-pl="ph-close">취소</button></div><div class="pl-lue-list">` +
                [...new Set(people.map(p => p.g))].map(g => `<div class="pl-gh"><i class="pl-g${g || 0}"></i>${g ? g + '학년' : '기타'}</div>` + people.filter(p => p.g === g).map(p => {
                    const k = cfg.lineup.indexOf(p.pid);
                    return `<button type="button" class="pl-lrow${k >= 0 ? ' dim' : ''}" data-pl="ph-pick" data-pid="${esc(p.pid)}" aria-label="대타 ${esc(p.no)}번 ${esc(p.name)}">${photo(p, 32)}<span class="t"><b>${esc(p.name)}</b><small>${esc(p.no)}번</small></span>${k >= 0 ? `<span class="k">${k + 1}번</span>` : ''}</button>`;
                }).join('')).join('') + `</div></div>`;
            lineupHtml = `<div class="pl-nbrow"><button type="button" class="pl-nextbat" data-pl="nextbat">${I.play}<span><small>다음 타자 틀기</small><b>${ord}번 타자 ${esc(nxt.name)} <span style="opacity:.8">(${esc(nxt.no)})</span></b></span></button>` +
                `<button type="button" class="pl-phb${mode === 'ph' ? ' on' : ''}" data-pl="ph-open" aria-label="대타: 이번 타석만 다른 선수 곡 틀기"><span>🔁</span>대타</button>` + `</div>` + annRow(nxt, ord) + phPanel +
                `<ol class="pl-lu">${lu.map((p, i) => `<li><button type="button" data-pl="bat" data-pid="${esc(p.pid)}" class="${i === cfg.batIdx ? 'cur' : ''}" aria-label="${i + 1}번 타자 ${esc(p.name)} 곡 틀기"><i>${i + 1}</i>${esc(p.name)}</button></li>`).join('')}</ol>` +
                `<div class="pl-pre"><button type="button" class="pl-sbtn" data-pl="preload"${preBusy ? ' disabled' : ''}>⬇&nbsp;타순 곡 미리 받아 두기</button><span id="plPreTxt">${esc(preText)}</span></div>`;
        } else {
            lineupHtml = annRow(null, 0) + `<p class="pl-tip">「타순 정하기」를 누르면 선수 사진 목록에서 1번 타자부터 차례로 고를 수 있어요. 정해 두면 경기 중에는 「다음 타자」 버튼 하나만 누르면 됩니다.</p>`;
        }
        // 저장해 둔 타순: 누르면 불러옴 · 「＋ 지금 타순 저장」을 누르면 이름을 고르는 판이 열림
        const today = new Date(), dayName = (today.getMonth() + 1) + '/' + today.getDate() + ' 경기';
        const setsHtml = !(cfg.sets.length || n) ? '' : `<div class="pl-sets">${cfg.sets.map((x, i) => `<button type="button" data-pl="set-load" data-i="${i}" class="${sameLu(x.lineup) ? 'on' : ''}" aria-label="「${esc(x.name)}」 타순 불러오기">${esc(x.name)}</button>`).join('')}` +
            (n ? `<button type="button" class="add${setOpen ? ' on' : ''}" data-pl="set-open">＋ 지금 타순 저장</button>` : (cfg.sets.length ? `<button type="button" class="add${setOpen ? ' on' : ''}" data-pl="set-open">저장한 타순 정리</button>` : '')) + `</div>` +
            (!setOpen ? '' : `<div class="pl-setpan">` +
                (n ? `<b>어떤 이름으로 저장할까요? <small>지금 타순 ${n}명</small></b><div class="pl-setnames">${SET_NAMES.concat([dayName]).map(nm => `<button type="button" data-pl="set-save" data-name="${esc(nm)}">${esc(nm)}${cfg.sets.some(x => x.name === nm) ? '<small>덮어쓰기</small>' : ''}</button>`).join('')}<button type="button" data-pl="set-ask">직접 쓰기…</button></div>` : '') +
                (cfg.sets.length ? `<b>저장한 타순 지우기</b><div class="pl-setnames del">${cfg.sets.map((x, i) => `<button type="button" data-pl="set-del" data-i="${i}" aria-label="「${esc(x.name)}」 지우기">${esc(x.name)} ✕</button>`).join('')}</div>` : '') +
                `<button type="button" class="pl-sbtn" data-pl="set-close">닫기</button></div>`);
        const pick = pickPid ? personOf(pickPid) : null;
        box.innerHTML = `
            <div class="pl-batnow"><span class="tx" id="plBatTx"></span><span class="pl-vol" id="plVol" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>${SpeechRec ? '<button type="button" class="pl-mic" data-pl="mic" aria-pressed="false" aria-label="말로 하기">🎙 말로</button>' : ''}<button type="button" class="pl-fade" data-pl="fade" id="plFade">🔉 서서히 끄기</button></div>
            <div class="pl-opts">
                <div class="pl-og"><span>시작 위치</span><div class="pl-sg">${ob('hook', 0, '처음부터', !cfg.hook)}${ob('hook', 1, '후렴부터', cfg.hook)}</div></div>
                <div class="pl-og"><span>시작할 때</span><div class="pl-sg">${ob('fadeIn', 0, '바로', !cfg.fadeIn)}${ob('fadeIn', 1, '서서히 커지게', cfg.fadeIn)}</div></div>
                <div class="pl-og"><span>자동으로 끄기</span><div class="pl-sg">${ob('autoSec', 0, '안 끔', !cfg.autoSec)}${WALK_SECS.map(n => ob('autoSec', n, n + '초', cfg.autoSec === n)).join('')}</div></div>
            </div>
            <div class="pl-box">
                <div class="pl-h"><b>오늘 타순</b><button type="button" class="pl-sbtn${n ? '' : ' on'}" data-pl="lu-edit">📋 ${n ? '타순 고치기' : '타순 정하기'}</button></div>
                ${setsHtml}
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
    // ⭐ v2.139.0 (하코 선택 B + 넓은 화면 C): 큰 플레이어 탭 「가사 · 재생목록 · 내 목록」 · 제목 아래 ①②③ 한 번에 담기
    //   폰: 탭을 누르면 가사 자리에 재생목록/내 목록 · 태블릿 · PC(넓고 높은 화면): 왼쪽 가사, 오른쪽에 재생목록 · 내 목록이 늘 보임 (CSS)
    let pTab = 'lyr', favOpen = -1, favTxTimer = 0;
    const favHas = (n, id) => !!(cfg.fav[n] && cfg.fav[n].ids.indexOf(id) >= 0);
    function favSet(n, id, on) {
        const f = cfg.fav[n]; if (!f || !id) return;
        const i = f.ids.indexOf(id);
        if (on && i < 0) { if (f.ids.length >= FAV_MAX) { notify('「' + f.name + '」은 ' + FAV_MAX + '곡까지 담을 수 있어요'); return; } f.ids.push(id); }
        if (!on && i >= 0) f.ids.splice(i, 1);
        saveCfg(); paintFav(); if (built && $('plChips')) renderList();
    }
    function favToggle(n) {
        if (!cur || !cfg.fav[n]) return;
        const on = !favHas(n, cur.id);
        favSet(n, cur.id, on);
        const tx = $('plFavTx');
        if (tx) { tx.textContent = (on ? '「' + cfg.fav[n].name + '」에 담음' : '「' + cfg.fav[n].name + '」에서 뺌'); tx.classList.add('hit'); clearTimeout(favTxTimer); favTxTimer = setTimeout(() => { tx.textContent = '내 목록에 담기'; tx.classList.remove('hit'); }, 2200); }
        if (bigOpen) renderPanel();
    }
    function paintFav() {
        const box = $('plFav'); if (!box) return;
        box.querySelectorAll('button').forEach(b => { const n = +b.dataset.n, on = !!cur && favHas(n, cur.id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', (cfg.fav[n] ? cfg.fav[n].name : '') + (on ? '에서 빼기' : '에 담기')); });
    }
    const favIds = n => (cfg.fav[n] ? cfg.fav[n].ids : []).filter(id => byId.has(id));
    function favPlay(n, startId) {
        const ids = favIds(n).filter(id => !isOff(id) || id === startId);
        if (!ids.length) { notify('「' + (cfg.fav[n] || {}).name + '」에 담긴 곡이 없어요', '곡을 듣다가 제목 아래 ' + (n + 1) + ' 을 누르면 담겨요'); return; }
        if (startId) playTrack(startId, ids); else playAll(ids, false);
    }
    function favRename(n) {
        const f = cfg.fav[n]; if (!f) return;
        let v = null; try { v = window.prompt((n + 1) + '번 목록 이름 (12자까지)', f.name); } catch (e) {}
        if (v == null) return;
        v = String(v).replace(/\s+/g, ' ').trim().slice(0, 12);
        f.name = v || '내 목록 ' + (n + 1); saveCfg(); paintFav(); renderPanel(); if ($('plChips')) renderList();
    }
    function setTab(t) {
        pTab = t === 'q' || t === 'my' ? t : 'lyr';
        const big = $('plBig'); if (!big) return;
        big.dataset.tab = pTab; big.dataset.ptab = pTab === 'my' ? 'my' : 'q';
        big.querySelectorAll('#plTabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === pTab ? 'true' : 'false'));
        if (pTab !== 'lyr' && lyrOpen) setLyr(false);
        renderPanel();
        if (pTab === 'lyr') { kIdx = -2; paintLyrics(true); }
    }
    function qRow(t, i, cls, extra) {
        return `<button type="button" class="pl-qr${cls ? ' ' + cls : ''}" data-pl="qjump" data-i="${i}">${cover(t)}<span class="t"><b>${esc(t.title)}</b><small>${esc(t.name)}${t.beat ? ' · ' + esc(t.beat) : ''}</small></span>${extra || `<span class="d">${esc(t.len || '')}</span>`}</button>`;
    }
    function renderPanel() {
        const box = $('plPanel'); if (!box || !built) return;
        const big = $('plBig'), ptab = big ? big.dataset.ptab : 'q';
        if (ptab === 'my') {
            box.innerHTML = `<div class="pl-qh">내 목록 · ▶ 를 누르면 그 목록만 이어 듣기</div>` + cfg.fav.map((f, n) => {
                const ids = favIds(n), sec = ids.reduce((a, id) => a + lenSec(byId.get(id).len), 0), m = Math.round(sec / 60);
                const open = favOpen === n;
                const rows = open ? (ids.length ? ids.map(id => { const t = byId.get(id); return `<div class="pl-fr${cur && cur.id === id ? ' now' : ''}"><button type="button" class="pl-frp" data-pl="favrow" data-n="${n}" data-id="${esc(id)}">${cover(t)}<span class="t"><b>${esc(t.title)}</b><small>${esc(t.name)}</small></span><span class="d">${esc(t.len || '')}</span></button><button type="button" class="pl-frx" data-pl="favdel" data-n="${n}" data-id="${esc(id)}" aria-label="${esc(t.title)} 목록에서 빼기">✕</button></div>`; }).join('') : `<div class="pl-pempty">아직 담긴 곡이 없어요.<br>곡을 듣다가 제목 아래 <b>${n + 1}</b> 을 누르면 여기에 담겨요.</div>`) : '';
                return `<div class="pl-fc${open ? ' open' : ''}"><div class="pl-fch"><button type="button" class="pl-fcm" data-pl="favopen" data-n="${n}" aria-expanded="${open}"><span class="no">${n + 1}</span><span class="t"><b>${esc(f.name)}</b><small>${ids.length ? ids.length + '곡' + (m ? ' · 약 ' + m + '분' : '') : '비어 있음'} · ${open ? '접기 ▴' : '곡 보기 ▾'}</small></span></button><button type="button" class="pl-fce" data-pl="favname" data-n="${n}">✏ 이름</button><button type="button" class="pl-fcp" data-pl="favplay" data-n="${n}" aria-label="${esc(f.name)} 이어 듣기"${ids.length ? '' : ' disabled'}>${I.play}</button></div>${rows}</div>`;
            }).join('') + `<div class="pl-pnote">이 휴대폰에만 저장돼요 · 다른 기기에는 따로 담아 주세요</div>`;
            return;
        }
        if (!cur || !order.length) { box.innerHTML = '<div class="pl-pempty">곡을 고르면 재생목록이 여기에 나와요</div>'; return; }
        const eq = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
        let h = '';
        let pi = qi - 1; while (pi >= 0 && isOff(order[pi])) pi--;
        if (pi >= 0 && byId.get(order[pi])) h += `<div class="pl-qh">이전 곡</div>` + qRow(byId.get(order[pi]), pi, 'past');
        h += `<div class="pl-qh">지금 듣는 곡${walk ? ' · 타석 등장곡' : ''}</div>` + qRow(cur, qi, 'now', eq);
        const nx = []; for (let j = qi + 1; j < order.length && nx.length < 40; j++) if (!isOff(order[j]) && byId.get(order[j])) nx.push(j);
        let left = 0; for (let j = qi + 1; j < order.length; j++) if (!isOff(order[j])) left++;
        h += `<div class="pl-qh">다음 곡${left ? ' · ' + left + '곡 남음' : ''}${cfg.shuffle ? ' · 셔플' : ''}</div>`;
        h += nx.length ? nx.map(j => qRow(byId.get(order[j]), j, '')).join('') + (left > nx.length ? `<div class="pl-pnote">… ${left - nx.length}곡 더 있어요</div>` : '')
            : `<div class="pl-pempty">마지막 곡이에요${cfg.repeat === 'all' ? ' · 끝나면 처음부터 다시 들어요' : ''}</div>`;
        box.innerHTML = h;
    }
    // 👤 v2.138.0: 큰 플레이어 왼쪽 위 등번호를 누르면 그 선수 상세 화면 (지금 곡을 골라 두고 곡 목록으로 내려감 · 하코 요청)
    function goPlayer() {
        if (!cur) return;
        const person = personOf(cur.pid), p = person && person.src;
        if (!p || !p.grade) return;
        remember();
        window.location.href = 'player.html?path=' + encodeURIComponent(p.grade + '/' + (p.no || p.name)) + '&song=' + encodeURIComponent(cur.key);
    }
    function renderNow() {   // 지금 곡이 바뀔 때: 띠 · 큰 플레이어 · 목록 표시
        if (!built) return;
        const mini = $('plMini');
        mini.hidden = !cur;
        if (cur && mini.offsetHeight) root.style.setProperty('--pl-minih', mini.offsetHeight + 'px');
        root.classList.toggle('pl-on', !!cur);
        if (cur) {
            $('plMiniCv').innerHTML = cover(cur); $('plMiniT').textContent = cur.title; $('plMiniW').textContent = who(cur);
            $('plBigCv').innerHTML = cover(cur); $('plBigT').textContent = cur.title; $('plBigW').textContent = who(cur); $('plBigG').textContent = mood(cur);
            $('plCnt').textContent = (qi + 1) + ' / ' + order.length;
            $('plDurT').textContent = cur.len || '';
        }
        document.querySelectorAll('#plRows .pl-row').forEach(el => el.classList.toggle('cur', !!cur && el.dataset.id === cur.id));
        paintOff(); paintFav(); if (bigOpen) renderPanel();
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
        paintOff();
        ['plMiniPlay', 'plBigPlay'].forEach(id => { const b = $(id); if (b) { b.innerHTML = playing ? I.pause : I.play; b.setAttribute('aria-label', playing ? '멈춤' : '재생'); } });
        const sh = $('plShuf'); sh.classList.toggle('on', cfg.shuffle); sh.querySelector('em').textContent = cfg.shuffle ? '셔플' : '순서대로';
        const rp = $('plRep'); rp.classList.toggle('on', cfg.repeat !== 'off'); rp.innerHTML = (cfg.repeat === 'one' ? I.repeat1 : I.repeat) + `<em>${REPEAT_LABEL[cfg.repeat]}</em>`;
        if (cur) $('plCnt').textContent = (qi + 1) + ' / ' + order.length;
        const bt = $('plBatTx');
        if (bt) {
            bt.textContent = annDone ? `📢 ${annText}` : walk && cur && playing ? `${pinchOn ? '대타 ' : ''}${cur.no}번 ${cur.name} 등장곡 「${cur.title}」` : (mode === 'lineup' ? '타순을 정하는 중입니다' : '등번호를 누르면 바로 나옵니다');
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
        setLyr(false); setTab(pTab);
        kIdx = -2; paintLyrics(true); paintTime(); startLoop();
        coach(!cfg.lyrTip && lines.length > 0);
    }
    // 가사 보는 법 — 큰 플레이어를 처음 열 때 한 번만 부캉이가 알려 줌 (v2.109.0 하코 B안)
    function coach(show) {
        const c = $('plCoach'), k = $('plK3'), big = $('plBig');
        if (!c || !k) return;
        c.hidden = !show; k.classList.toggle('coach', !!show);
        if (!show) return;
        try {   // 말풍선을 가사 바로 아래에 (자리가 모자라면 위로 당김)
            const r = k.getBoundingClientRect(), b = big.getBoundingClientRect(), bub = $('plCoachBub');
            bub.style.top = Math.max(8, Math.min(r.bottom - b.top + 20, b.height - bub.offsetHeight - 12)) + 'px';
        } catch (e) {}
    }
    function coachDone() { if (!cfg.lyrTip) { cfg.lyrTip = true; saveCfg(); } coach(false); }
    function closeBig() {
        if (!built) return;
        bigOpen = false; lyrOpen = false;
        coach(false);
        $('plBig').hidden = true;
        root.classList.remove('pl-big-on');
    }
    function setLyr(open) {   // 큰 글씨 세 줄 ↔ 전체 가사
        lyrOpen = !!open;
        $('plMain').hidden = lyrOpen; $('plLyr').hidden = !lyrOpen; $('plBig').classList.toggle('lyr-on', lyrOpen);
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
            case 'hotplay': if (popIds.length) playTrack(popIds[0], popIds); break;   // 🔥 v2.124.0: 인기 1위부터 인기순으로 이어 듣기
            case 'sper': statLoad(+d.d); break;      // 📊 운영진 통계: 기간
            case 'scsv': statCsv(); break;           // 📊 엑셀(CSV) 내려받기
            case 'sall': statAll = !statAll; statRender(); break;
            case 'sretry': statLoad(statDays, true); break;
            case 'row': playTrack(d.id, listIds()); break;
            case 'playall': playAll(listIds(), false); break;
            case 'shuffleall': playAll(listIds(), true); break;
            case 'open': openBig(); break;
            case 'goplayer': goPlayer(); break;
            case 'ptab': setTab(d.t); break;
            case 'fav': favToggle(+d.n); break;
            case 'qjump': { const i = +d.i; const t = byId.get(order[i]); if (t && i !== qi) { walk = false; qi = i; load(t, true); } else if (t) toggle(); break; }
            case 'favplay': favPlay(+d.n, null); break;
            case 'favopen': favOpen = favOpen === +d.n ? -1 : +d.n; renderPanel(); break;
            case 'favrow': favPlay(+d.n, d.id); break;
            case 'favdel': favSet(+d.n, d.id, false); renderPanel(); break;
            case 'favname': favRename(+d.n); break;
            case 'close': if (lyrOpen) setLyr(false); else closeBig(); break;
            case 'toggle': toggle(); break;
            case 'next': next(false); break;
            case 'prev': prev(); break;
            case 'shuffle': toggleShuffle(); break;
            case 'repeat': cycleRepeat(); break;
            case 'lyrics': if (!$('plCoach').hidden) coachDone(); if (lines.length) setLyr(true); break;
            case 'coach-ok': coachDone(); break;
            case 'xl': cfg.xl = !cfg.xl; saveCfg(); $('plLyr').classList.toggle('xl', cfg.xl); $('plXl').textContent = cfg.xl ? '가 작게' : '가 크게'; kIdx = -2; paintLyrics(true); break;
            case 'dl': download(); break;
            case 'off': offToggle([d.id]); break;
            case 'offcur': {
                if (!cur) break;
                if (cur.hidAll) { setHidAll(cur, false); break; }
                const person = personOf(cur.pid);
                if (person && person.manage && !isOff(cur.id)) offAsk(true); else offToggle([cur.id]);
                break;
            }
            case 'off-me': offAsk(false); if (cur) offToggle([cur.id], true); break;
            case 'off-all': offAsk(false); if (cur) setHidAll(cur, true); break;
            case 'off-x': if (e.target === el || el.tagName === 'BUTTON') offAsk(false); break;
            case 'unhide': { const t = byId.get(d.id); if (t) setHidAll(t, false); break; }
            case 'fade': fadeOut(); break;
            case 'snd': sndPlay(d.s); break;
            case 'mic': micToggle(); break;
            case 'mic-x': if (micOn) micStop(''); else { clearTimeout(micTimer); micPaint(''); } break;
            case 'opt': {
                const v = +d.v;
                if (d.o === 'hook' || d.o === 'fadeIn') cfg[d.o] = v === 1;
                else if (d.o === 'autoSec' && (v === 0 || WALK_SECS.indexOf(v) >= 0)) cfg.autoSec = v;
                else break;
                saveCfg();
                el.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
                break;
            }
            case 'bk': cfg.bk = !cfg.bk; saveCfg(); bkStop(); if (cfg.bk) bkKick(0); else micPaint(''); renderBat(); break;
            case 'bk-me': bkEnroll(); break;
            case 'bk-me-x': try { if (window.BukangKWS) BukangKWS.clearMine(); else localStorage.removeItem(BK_ME); } catch (e) {} notify('내 목소리 등록을 지웠어요'); renderBat(); break;
            case 'ann': cfg.ann = !cfg.ann; saveCfg(); if (!cfg.ann) annCancel(); else annPrep(); renderBat(); break;
            case 'nextbat': mode = mode === 'ph' ? '' : mode; nextBatter(); break;
            case 'ph-open': mode = mode === 'ph' ? '' : 'ph'; pickPid = ''; renderBat(); break;
            case 'ph-close': mode = ''; renderBat(); break;
            case 'ph-pick': pinch(d.pid); break;
            case 'set-open': setOpen = !setOpen; renderBat(); break;
            case 'set-close': setOpen = false; renderBat(); break;
            case 'set-save': setSave(d.name); renderBat(); break;
            case 'set-ask': { let nm = null; try { nm = window.prompt('타순 이름을 써 주세요 (12자까지)', ''); } catch (e) {} if (nm) { setSave(nm); renderBat(); } break; }
            case 'set-del': { const st = cfg.sets[+d.i]; if (st && window.confirm('「' + st.name + '」 타순을 지울까요?')) { cfg.sets.splice(+d.i, 1); saveCfg(); if (!cfg.sets.length && !cfg.lineup.length) setOpen = false; renderBat(); } break; }
            case 'set-load': setLoad(+d.i); renderBat(); break;
            case 'preload': preload(); break;
            case 'lu-edit': luOpen(); mode = 'lineup'; pickPid = ''; renderBat(); batTop(); break;
            case 'lu-done': if (luSnap.join('|') === cfg.lineup.join('|')) { cfg.batIdx = luSnapIdx; saveCfg(); } else { annWarmed = false; annPrep(); } mode = ''; luFix = -1; hydrate(); renderBat(); batTop(); break;
            case 'lu-cancel': cfg.lineup = luSnap.slice(); cfg.batIdx = luSnapIdx; preText = ''; saveCfg(); mode = ''; luFix = -1; hydrate(); renderBat(); batTop(); break;   // 열기 전 타순으로 되돌리고 닫음
            case 'lu-clear': luEdit = []; luFix = -1; luSave(); renderBat(); break;
            case 'lu-chip': luChip(+d.i); renderBat(); break;
            case 'lu-x': luEdit.splice(+d.i, 1); luFix = -1; luSave(); renderBat(); break;
            case 'lu-f': luFilter = d.f; renderBat(); break;
            case 'lu-pick': { const n0 = luEdit.length; luPick(d.pid); luAdded = luEdit.length > n0; renderBat(); break; }
            case 'lu-del': cfg.lineup = cfg.lineup.filter(x => x !== d.pid); cfg.batIdx = -1; saveCfg(); renderBat(); break;
            case 'song-edit': mode = mode === 'song' ? '' : 'song'; pickPid = ''; renderBat(); break;
            case 'song-pick': { const t = byId.get(d.id); if (t) { cfg.walkSong[t.pid] = t.key; saveCfg(); preText = ''; renderBat(); } break; }
            case 'bat':
                if (mode === 'song') { pickPid = d.pid; renderBat(); const pk = document.querySelector('#plBat .pl-pick'); if (pk && pk.scrollIntoView) pk.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
                else playWalk(d.pid);
                break;
        }
    }
    // ---------------- 📊 운영진 재생 통계 (v2.124.0 · 서버 v2.44.0 songStats) ----------------
    //   대표 · 총무 · 코치 · 개발자에게만 「📊 통계」 단추 · 화면을 열 때만 서버에 물음(5분 안에 다시 열면 받은 것) · 서버는 10분 보관
    let statDays = 30, statAll = false, statData = {}, statSeq = 0, statLoading = false, statErr = '';
    function statSeg() {
        const seg = document.querySelector('#musicSection .pl-seg'); if (!seg) return;
        const can = canSeeHidden();
        let b = seg.querySelector('[data-v="stat"]');
        if (can && !b) seg.insertAdjacentHTML('beforeend', '<button type="button" data-pl="view" data-v="stat">📊 통계</button>');
        else if (!can && b) { b.remove(); if (view === 'stat') setView('list'); }
    }
    function statLoad(days, force) {
        statDays = [7, 30, 365].indexOf(days) >= 0 ? days : 30;
        const c = statData[statDays];
        if (c && !force && Date.now() - c.got < 5 * 60 * 1000) { statErr = ''; statRender(); return; }
        if (typeof apiGetJson !== 'function') { statErr = '통계를 불러올 수 없어요.'; statRender(); return; }
        const seq = ++statSeq, d = statDays;
        statLoading = true; statErr = ''; statRender();
        apiGetJson('action=songStats&days=' + d).then(r => {
            if (seq !== statSeq) return;
            statLoading = false;
            if (r && r.result === 'success' && Array.isArray(r.songs)) { r.got = Date.now(); statData[d] = r; }
            else statErr = (r && r.message) || '통계를 불러오지 못했어요.';
            statRender();
        }).catch(() => { if (seq !== statSeq) return; statLoading = false; statErr = '인터넷 연결을 확인하고 다시 눌러 주세요.'; statRender(); });
    }
    function statInfo(id) {   // 곡 id → 화면에 쓸 정보 (지금 목록에 없는 곡도 이름은 보여 줌)
        const t = byId.get(id);
        if (t) return { title: t.title, name: t.name, g: t.g, no: t.no, pid: t.pid, hid: !!t.hidAll, t: t };
        const a = String(id).split('/'), pid = a[0] + '/' + a[1], p = personOf(pid);
        return { title: '(지금 목록에 없는 곡)', name: a[1] || '', g: p ? p.g : 0, no: +a[0] || 0, pid: pid, hid: false, t: null, gone: true };
    }
    function hourName(h) { return h === 0 ? '밤 12시' : h < 6 ? '새벽 ' + h + '시' : h < 12 ? '오전 ' + h + '시' : h === 12 ? '낮 12시' : h < 18 ? '오후 ' + (h - 12) + '시' : '저녁 ' + (h - 12) + '시'; }
    function statRender() {
        const box = $('plStat'); if (!box || view !== 'stat') return;
        const r = statData[statDays];
        const per = [[7, '최근 7일'], [30, '30일'], [365, '1년']].map(x => `<button type="button" data-pl="sper" data-d="${x[0]}" class="${statDays === x[0] ? 'on' : ''}">${x[1]}</button>`).join('');
        let html = `<div class="pl-st"><div class="pl-st-per">${per}<button type="button" class="dl" data-pl="scsv"${r && r.songs.length ? '' : ' disabled'}>⬇ 엑셀</button></div>`;
        if (!r) {
            html += statErr ? `<div class="pl-st-empty">${esc(statErr)}<br><button type="button" data-pl="sretry">다시 불러오기</button></div>` : '<div class="pl-st-empty">통계를 불러오는 중이에요…</div>';
            box.innerHTML = html + '</div>'; return;
        }
        if (statErr) html += `<div class="pl-st-warn">${esc(statErr)} <button type="button" data-pl="sretry">다시</button></div>`;
        if (!r.songs.length) {
            box.innerHTML = html + '<div class="pl-st-empty">아직 모인 기록이 없어요.<br>학부모님들이 주제곡을 들으면 6시간 안팎으로 모이기 시작해요.</div>' + statFoot(r) + '</div>';
            return;
        }
        const pct = r.prevPlays > 0 ? Math.round((r.plays - r.prevPlays) / r.prevPlays * 100) : null;
        const peak = r.hours.reduce((a, v, i) => v > r.hours[a] ? i : a, 0), hMax = Math.max(1, Math.max.apply(null, r.hours));
        const dayAvg = Math.round(r.plays / Math.max(1, r.dataDays));
        html += `<div class="pl-st-tiles">
            <div><small>총 재생</small><b>${r.plays.toLocaleString()}회</b><i>${pct === null ? '앞 기간 기록 없음' : (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '% (앞 ' + (statDays === 365 ? '1년' : statDays + '일') + ' 대비)'}</i></div>
            <div><small>하루 평균 듣는 가족</small><b>${r.famAvg}곳</b><i>가장 많은 날 ${r.famMax}곳</i></div>
            <div><small>하루 평균 재생</small><b>${dayAvg.toLocaleString()}회</b><i>기록 있는 날 ${r.dataDays}일</i></div>
            <div><small>가장 많이 듣는 때</small><b>${r.hours[peak] ? hourName(peak) : '-'}</b><i>타석 등장곡 ${r.bat.toLocaleString()}번</i></div></div>`;
        const top = r.songs.filter(x => x[1] > 0).slice(0, 10), mx = Math.max(1, top.length ? top[0][1] : 1);
        const topHtml = top.map((x, i) => { const f = statInfo(x[0]); return `<div class="pl-st-r"><span class="n">${i + 1}</span><span class="pl-cv pl-g${f.g || 0}" aria-hidden="true">${esc(f.no || '♪')}</span><div class="t"><b>${esc(f.title)}${f.hid ? '<i class="pl-htag">🔒 숨김</i>' : ''}</b><small>${esc(f.name)}${f.g ? ' · ' + f.g + '학년' : ''}${f.no ? ' ' + f.no + '번' : ''}</small><span class="bar"><i style="width:${Math.max(2, Math.round(x[1] / mx * 100))}%"></i></span></div><span class="v"><b>${x[1].toLocaleString()}회</b>${x[2]}가족</span></div>`; }).join('');
        const hours = r.hours.map((v, i) => `<i class="${i === peak && v ? 'pk' : ''}" style="height:${Math.max(2, Math.round(v / hMax * 100))}%" title="${hourName(i)} ${v}회"></i>`).join('');
        const by = {};
        r.songs.forEach(x => { const f = statInfo(x[0]); const o = by[f.pid] || (by[f.pid] = { name: f.name, g: f.g, plays: 0 }); o.plays += x[1]; });
        const pl = Object.keys(by).map(k => by[k]).filter(o => o.plays > 0).sort((a, b) => b.plays - a.plays), pmx = Math.max(1, pl.length ? pl[0].plays : 1);
        const plShow = statAll ? pl : pl.slice(0, 12);
        const plHtml = plShow.map((o, i) => `<div class="pl-st-r pp"><span class="n">${i + 1}</span><div class="t"><b>${esc(o.name)} <small>${o.g ? o.g + '학년' : ''}</small></b><span class="bar navy"><i style="width:${Math.max(2, Math.round(o.plays / pmx * 100))}%"></i></span></div><span class="v"><b>${o.plays.toLocaleString()}</b></span></div>`).join('');
        const bat = r.songs.filter(x => x[3] > 0).sort((a, b) => b[3] - a[3]).slice(0, 5);
        const batHtml = bat.length ? bat.map((x, i) => { const f = statInfo(x[0]); return `<div class="pl-st-r"><span class="n">${i + 1}</span><span class="pl-cv pl-g${f.g || 0}" aria-hidden="true">${esc(f.no || '♪')}</span><div class="t"><b>${esc(f.title)}</b><small>${esc(f.name)}</small></div><span class="v"><b>${x[3]}번</b></span></div>`; }).join('') : '<p class="pl-st-none">이 기간에는 타석 모드에서 튼 곡이 없어요.</p>';
        html += `<div class="pl-st-grid"><div><div class="pl-st-card"><h4>🔥 많이 들은 곡 TOP 10<small>재생 · 들은 가족</small></h4>${topHtml}</div></div>
            <div><div class="pl-st-card"><h4>🕗 시간대별 재생<small>${statDays === 365 ? '1년' : statDays + '일'} 합계</small></h4><div class="pl-st-hours">${hours}</div><div class="pl-st-hx"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div></div>
            <div class="pl-st-card"><h4>👦 선수별 합계<small>${statAll ? '전체 ' + pl.length + '명' : '상위 ' + Math.min(12, pl.length) + '명'}</small></h4><div class="pl-st-pp">${plHtml}</div>${pl.length > 12 ? `<button type="button" class="pl-st-more" data-pl="sall">${statAll ? '접기' : '전체 ' + pl.length + '명 보기'}</button>` : ''}</div>
            <div class="pl-st-card"><h4>⚾ 타석 등장곡으로 쓴 곡<small>따로 셈</small></h4>${batHtml}</div></div></div>`;
        box.innerHTML = html + statFoot(r) + '</div>';
    }
    function statFoot(r) {
        return `<div class="pl-st-foot">· 운영진(대표 · 총무 · 코치 · 개발자)만 보이는 화면이에요. 학부모 화면에는 숫자 없이 「🔥 인기」만 보여요.<br>· 이름 · 전화번호 · 기기 정보는 모으지 않고 「어느 곡이 몇 번」만 세요. 30초 넘게 들은 것만 1회, 한 집이 하루에 여러 번 들어도 「1가족」이에요.<br>· 휴대폰마다 6시간에 한 번 모아 보내서 숫자는 조금 늦게 바뀌어요.${r && r.from ? ' 기간 ' + esc(r.from) + ' ~ ' + esc(r.to) + '.' : ''}</div>`;
    }
    function statCsv() {
        const r = statData[statDays]; if (!r || !r.songs.length) return;
        const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const rows = [['순위', '선수', '학년', '배번', '곡 제목', '재생', '들은 가족', '타석', '숨김']];
        r.songs.forEach((x, i) => { const f = statInfo(x[0]); rows.push([i + 1, f.name, f.g || '', f.no || '', f.title, x[1], x[2], x[3], f.hid ? '숨김' : '']); });
        const text = '﻿' + rows.map(a => a.map(q).join(',')).join('\r\n');
        try {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url; a.download = '주제곡_재생통계_' + (statDays === 365 ? '1년' : statDays + '일') + '_' + r.to + '.csv';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (e) { notify('내려받지 못했어요', '잠시 뒤 다시 눌러 주세요'); }
    }
    function batTop() {   // 타순 화면을 열고 닫을 때: 타석 모드 맨 위로
        const b = $('plBat'); if (!b) return;
        try { const y = b.getBoundingClientRect().top + window.scrollY - 70; if (window.scrollY > y) window.scrollTo(0, Math.max(0, y)); } catch (e) {}
    }
    function setView(v) {
        view = v === 'bat' ? 'bat' : v === 'stat' && canSeeHidden() ? 'stat' : 'list';
        mode = ''; pickPid = '';
        document.querySelectorAll('#musicSection .pl-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
        $('plList').hidden = view !== 'list'; $('plBat').hidden = view !== 'bat';
        const st = $('plStat'); if (st) st.hidden = view !== 'stat';
        if (view === 'stat') statLoad(statDays);   // 📊 v2.124.0
        if (view === 'bat') { renderBat(); hydrate(); wakeOn(); } else { wakeOff(); luFlag(); }
        holdSync();
    }

    // ---------------- index.html 과 맞닿는 곳 ----------------
    window.plSync = function () { try { build(); sync(); } catch (e) { console.warn('플레이리스트 준비 실패:', e); } };
    window.plTab = function (tab) {   // 탭을 바꿀 때마다 (showMainTab)
        try {
            build();
            if (bigOpen) closeBig();
            measure(); luFlag(tab);
            if (tab === 'music') { sync(); if (view === 'bat') { hydrate(); wakeOn(); } }
            else wakeOff();
            holdSync();
        } catch (e) { console.warn('플레이리스트 탭 처리 실패:', e); }
    };
    // 🦉 부캉이 비서(bukang-ai.js)가 쓰는 손잡이 (v2.120.0)
    window.plVoice = {
        inBat: () => batShown(),
        parse: t => micParse(t),                       // 타석 모드 명령 (다음 타자 · 홈런 …) → { say, run } | null
        people: () => { try { sync(); } catch (e) {} return people.slice(); },
        playing: () => !!(cur && audio && !audio.paused),
        hasCur: () => !!cur,
        playPerson: pid => { const p = personOf(pid); if (!p || !p.tracks.length) return false; playAll(p.tracks.map(t => t.id), false); return true; },
        playAllSongs: shuffle => { try { sync(); } catch (e) {} if (!tracks.length) return false; playAll(tracks.map(t => t.id), !!shuffle); return true; },
        stop: () => { if (muOn) muStop(true); if (annDone) { annCancel(); walk = false; paintState(); } else if (audio) audio.pause(); },
        fade: () => { if (muOn) muStop(); else fadeOut(); },
        resume: () => { if (cur) { clearFade(); play(); return true; } return false; },
        next: () => { if (!cur) return false; next(false); return true; },
        prev: () => { if (!cur) return false; prev(); return true; },
        duck: on => micDuck(!!on),
        goBat: () => { try { showMainTab('music'); } catch (e) {} setView('bat'); batTop(); },
        goList: () => { try { showMainTab('music'); } catch (e) {} setView('list'); },
        bkOn: () => !!cfg.bk,
        bkSet: on => { cfg.bk = !!on; saveCfg(); bkStop(); if (cfg.bk) bkKick(0); try { if (view === 'bat') renderBat(); } catch (e) {} },
        bkStop: () => bkStop(),
        bkKick: ms => bkKick(ms),
        bkMeN: () => bkMeN(),
        bkReady: () => bkReady,   // v2.127.0: 「부캉아」 엔진을 이번에 불러 썼는지 (부캉이 준비 상태 표시)
        bkClearMine: () => { try { if (window.BukangKWS) BukangKWS.clearMine(); else localStorage.removeItem(BK_ME); } catch (e) {} try { if (view === 'bat') renderBat(); } catch (e) {} },
        enroll: paint => bkEnroll(paint),
        hasMic: () => !!SpeechRec
    };
    window.plLayers = function () { return (bigOpen ? 1 : 0) + (lyrOpen ? 1 : 0); };            // 뒤로 가기로 닫을 수 있는 것 개수
    window.plBack = function () { if (lyrOpen) { setLyr(false); return true; } if (bigOpen) { closeBig(); return true; } return false; };
    window.plOnLock = function (why) {   // 잠금 · 로그아웃: 큰 플레이어는 닫음 · 「자동 잠금」이면 듣던 노래는 그대로 (직접 로그아웃하면 멈춤)
        try {
            closeBig(); wakeOff(); holdFrom = 0; bkStop();
            if (why !== '자동 잠금') { stopAll(); try { sessionStorage.removeItem(SS_KEY); } catch (e) {} }   // 로그아웃 · 앱 종료: 듣던 곡도 비움 (다음에 다른 분이 로그인해도 안 남게)
        } catch (e) {}
    };
})();
