// ==========================================================
// 🎵 대연초 야구부 명단 - 배경음악 (v2.36.0) · index.html / player.html 공용
// ==========================================================
// - audio/001.mp3 ~ audio/100.mp3 중 "실제로 있는 파일만" 골라 셔플 재생 (파일 번호가 비어 있어도 됨)
//   · audio/list.json 이 있으면 그 목록을 우선 사용: { "tracks": [ { "file": "001.mp3", "title": "곡 제목" }, ... ] }
// - 셔플 = 모든 곡을 한 번씩 다 튼 뒤 다시 섞음 (같은 곡이 연달아 나오지 않음)
// - 처음엔 꺼짐. 🎵 버튼으로 기기마다 켜고 끔 (localStorage 'daeyeon_bgm' = 'on')
// - 휴대폰 규칙상 화면을 한 번 누른 뒤부터 소리가 남 → 켜 둔 기기는 첫 터치 때 자동으로 시작
// - 다른 앱/탭으로 가면 잠시 멈추고, 돌아오면 이어서 재생
// - 명단 ↔ 선수 상세 화면을 오가도 같은 곡의 같은 위치에서 이어서 재생
// - 효과음(🔊/🔇)과는 따로 동작
// ==========================================================
(function () {
    'use strict';
    var MAX_NO = 100, VOL = 0.45, FADE_IN = 1200, FADE_OUT = 1800, PRELOAD_SEC = 30;
    var K_ON = 'daeyeon_bgm', K_STATE = 'daeyeon_bgm_state', K_LIST = 'daeyeon_bgm_list';

    var tracks = null, bag = [], cur = null, lastFile = '';
    var audio = null, unlocked = false, playing = false, pausedByHide = false;
    var fadeTimer = null, fadingOut = false, preloaded = '', resumeAt = 0, labelTimer = null;

    function isOn() { try { return localStorage.getItem(K_ON) === 'on'; } catch (e) { return false; } }
    function setOn(v) { try { localStorage.setItem(K_ON, v ? 'on' : 'off'); } catch (e) {} }
    function authed() {   // 명단 화면은 로그인한 뒤에만, 선수 상세 화면은 들어온 것 자체가 로그인 상태
        return !document.getElementById('lockOverlay') || document.documentElement.classList.contains('is-authenticated');
    }
    function sfx(n) { try { if (typeof window.bkSfx === 'function') window.bkSfx(n); } catch (e) {} }
    function notify(s, t, sub) { try { if (typeof window.bkNotify === 'function') window.bkNotify(s, t, sub); } catch (e) {} }
    function pad3(n) { return String(n).padStart(3, '0'); }
    function titleOf(t) { return (t && t.title) ? t.title : (t ? t.file.replace(/\.mp3$/i, '') + '번 곡' : ''); }

    // 아주 짧은 무음 WAV — 아이폰은 "누른 순간"에 한 번 재생해 둬야 나중에 곡을 바꿔도 소리가 남
    function silentWav() {
        var n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer), s = 'RIFF____WAVEfmt ____';
        var w = function (o, str) { for (var i = 0; i < str.length; i++) b[o + i] = str.charCodeAt(i); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
        v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true);
        v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true); for (var i = 0; i < n; i++) b[44 + i] = 128;
        var bin = ''; for (var j = 0; j < b.length; j++) bin += String.fromCharCode(b[j]);
        return 'data:audio/wav;base64,' + btoa(bin);
    }

    function getAudio() {
        if (audio) return audio;
        audio = new Audio();
        audio.preload = 'auto';
        audio.addEventListener('ended', function () { if (!unlockingNow) playNext(); });
        audio.addEventListener('error', function () {
            if (unlockingNow || !cur || !audio.src || audio.src.indexOf('data:') === 0) return;
            // 깨진/없는 파일은 이번 목록에서 빼고 다음 곡으로
            tracks = (tracks || []).filter(function (t) { return t.file !== cur.file; });
            bag = bag.filter(function (t) { return t.file !== cur.file; });
            try { sessionStorage.removeItem(K_LIST); } catch (e) {}
            if (tracks.length) playNext(); else { stopPlay(); notify('fail', '음악 파일을 못 읽었캉…', 'audio 폴더의 mp3 파일을 확인해 주세요'); }
        });
        audio.addEventListener('timeupdate', onTime);
        return audio;
    }
    var unlockingNow = false;
    function unlock() {   // 반드시 "누른 순간" 안에서 부름
        var a = getAudio();
        if (unlocked) return;
        unlocked = true;
        if (a.src && a.src.indexOf('data:') !== 0) return;
        try { unlockingNow = true; a.src = silentWav(); a.volume = 0; var p = a.play(); if (p && p.then) p.then(function () { if (a.src.indexOf('data:') === 0) a.pause(); unlockingNow = false; }, function () { unlockingNow = false; unlocked = false; }); else unlockingNow = false; } catch (e) { unlockingNow = false; unlocked = false; }
    }

    // ---- 파일 찾기: list.json → 없으면 001~100.mp3 중 있는 것 ----
    function discover() {
        if (tracks && tracks.length) return Promise.resolve(tracks);
        try { var c = JSON.parse(sessionStorage.getItem(K_LIST) || 'null'); if (c && c.length) { tracks = c; return Promise.resolve(c); } } catch (e) {}
        return fetch('audio/list.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
            if (j && Array.isArray(j.tracks) && j.tracks.length) {
                return j.tracks.map(function (t) { return typeof t === 'string' ? { file: t } : t; }).filter(function (t) { return t && /^[\w\-.가-힣 ]+\.mp3$/i.test(String(t.file || '')); });
            }
            var ps = [];
            for (var i = 1; i <= MAX_NO; i++) {
                (function (f) {
                    ps.push(fetch('audio/' + f, { method: 'HEAD', cache: 'no-cache' }).then(function (r) { return r.ok ? { file: f } : null; }).catch(function () { return null; }));
                })(pad3(i) + '.mp3');
            }
            return Promise.all(ps).then(function (l) { return l.filter(Boolean); });
        }).then(function (l) {
            tracks = l || [];
            if (tracks.length) { try { sessionStorage.setItem(K_LIST, JSON.stringify(tracks)); } catch (e) {} }   // 빈 목록은 기억하지 않음 (파일을 올리면 바로 잡히게)
            return tracks;
        });
    }

    // ---- 셔플: 한 바퀴 다 돌면 다시 섞기, 바로 전 곡이 첫 곡이 되지 않게 ----
    function refill() {
        bag = tracks.slice();
        for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
        if (bag.length > 1 && bag[0].file === lastFile) { var x = bag.shift(); bag.push(x); }
    }
    function pickNext() { if (!bag.length) refill(); return bag.shift(); }
    function peekNext() { if (!bag.length) refill(); return bag[0]; }

    function fadeTo(target, ms, done) {
        clearInterval(fadeTimer);
        var a = getAudio(), from = a.volume, t0 = Date.now();
        fadeTimer = setInterval(function () {
            var k = Math.min(1, (Date.now() - t0) / ms);
            try { a.volume = Math.max(0, Math.min(1, from + (target - from) * k)); } catch (e) {}
            if (k >= 1) { clearInterval(fadeTimer); if (done) done(); }
        }, 60);
    }

    function startTrack(t, at) {
        var a = getAudio();
        cur = t; lastFile = t.file; fadingOut = false; preloaded = '';
        a.src = 'audio/' + encodeURIComponent(t.file);
        try { a.volume = 0; } catch (e) {}
        if (at > 0) {
            var seek = function () { try { a.currentTime = at; } catch (e) {} a.removeEventListener('loadedmetadata', seek); };
            a.addEventListener('loadedmetadata', seek);
        }
        var p = a.play();
        playing = true; updateBtn();
        if (p && p.then) p.then(function () { fadeTo(VOL, FADE_IN); showLabel(); }, function () { playing = false; updateBtn(); waitGesture(); });
        else { fadeTo(VOL, FADE_IN); showLabel(); }
    }
    function playNext() {
        if (!tracks || !tracks.length) return;
        startTrack(pickNext(), 0);
    }
    function onTime() {
        var a = audio; if (!a || !cur || !a.duration || !isFinite(a.duration)) return;
        var left = a.duration - a.currentTime;
        if (left < PRELOAD_SEC && tracks && tracks.length > 1) {   // 다음 곡을 미리 받아 둠 (끊김 줄이기)
            var n = peekNext();
            if (n && preloaded !== n.file) { preloaded = n.file; try { fetch('audio/' + encodeURIComponent(n.file), { priority: 'low' }).catch(function () {}); } catch (e) {} }
        }
        if (left < FADE_OUT / 1000 && !fadingOut) { fadingOut = true; fadeTo(0, Math.max(300, left * 1000)); }
    }

    function stopPlay() {
        clearInterval(fadeTimer);
        playing = false;
        if (audio) { try { audio.pause(); } catch (e) {} }
        updateBtn();
    }

    // ---- 켜기/끄기 · 다음 곡 ----
    function begin(fromGesture) {
        if (!isOn() || !authed()) return;
        if (fromGesture) unlock();
        if (tracks && tracks.length) proceed(tracks, fromGesture);   // 목록을 이미 알면 "누른 순간" 안에서 바로 재생 (아이폰)
        else discover().then(function (l) { proceed(l, fromGesture); });
    }
    function proceed(l, fromGesture) {
            if (!l.length) {
                if (fromGesture) notify('info', '아직 배경음악 파일이 없캉!', 'audio 폴더에 001.mp3 ~ 100.mp3 를 올리면 재생돼요');
                setOn(false); updateBtn(); return;
            }
            if (playing && audio && !audio.paused) return;
            if (cur && audio && audio.src && audio.src.indexOf('data:') !== 0) {   // 멈춰 있던 곡을 그 자리에서 이어서
                var p = audio.play(); playing = true; updateBtn();
                if (p && p.then) p.then(function () { fadeTo(VOL, FADE_IN); showLabel(); }, function () { playing = false; updateBtn(); waitGesture(); });
                return;
            }
            var st = loadState();
            if (st) {
                var t = l.filter(function (x) { return x.file === st.file; })[0];
                if (t) { if (st.bag) bag = st.bag.map(function (f) { return l.filter(function (x) { return x.file === f; })[0]; }).filter(Boolean); startTrack(t, st.t || 0); return; }
            }
            playNext();
    }
    function toggleBgm() {
        var on = !isOn();
        setOn(on); clearState();
        if (on) { sfx('tap'); begin(true); }
        else { if (audio && playing) fadeTo(0, 400, stopPlay); else stopPlay(); }
        updateBtn();
    }
    function nextBgm() {
        if (!isOn()) return;
        unlock(); sfx('tap');
        if (!tracks || !tracks.length) { begin(true); return; }
        if (tracks.length < 2) { notify('info', '곡이 하나뿐이캉!', 'audio 폴더에 mp3를 더 올리면 섞어서 틀어줘요'); return; }
        fadeTo(0, 300, playNext);
    }

    // 켜 둔 기기는 첫 터치 때 시작 (휴대폰 자동재생 규칙)
    var gestureArmed = false;
    function waitGesture() {
        if (gestureArmed) return; gestureArmed = true;
        var h = function (ev) {
            if (ev && ev.target && ev.target.closest && ev.target.closest('#bgmToggle, #bgmNext')) return;   // 버튼은 자기 일을 함
            if (!isOn() || !authed()) return;
            ['pointerdown', 'touchend', 'keydown'].forEach(function (n) { document.removeEventListener(n, h, true); });
            gestureArmed = false;
            begin(true);
        };
        ['pointerdown', 'touchend', 'keydown'].forEach(function (n) { document.addEventListener(n, h, true); });
    }

    // ---- 화면 이동 때 곡·위치 기억 (명단 ↔ 선수 상세) ----
    function saveState() {
        if (!isOn() || !cur || !audio) return;
        try { sessionStorage.setItem(K_STATE, JSON.stringify({ file: cur.file, t: audio.currentTime || 0, bag: bag.map(function (x) { return x.file; }), ts: Date.now() })); } catch (e) {}
    }
    function loadState() {
        try { var s = JSON.parse(sessionStorage.getItem(K_STATE) || 'null'); sessionStorage.removeItem(K_STATE); if (s && s.file && Date.now() - s.ts < 120000) return s; } catch (e) {}
        return null;
    }
    function clearState() { try { sessionStorage.removeItem(K_STATE); } catch (e) {} }
    window.addEventListener('pagehide', saveState);

    // 다른 앱/탭으로 가면 멈추고, 돌아오면 이어서
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (playing && audio && !audio.paused) { saveState(); pausedByHide = true; try { audio.pause(); } catch (e) {} } }
        else if (pausedByHide) { pausedByHide = false; clearState(); if (isOn() && audio) { var p = audio.play(); if (p && p.catch) p.catch(waitGesture); } }
    });

    // 화면 잠금(로그아웃) 되면 멈춤
    try {
        new MutationObserver(function () { if (!authed() && playing) stopPlay(); else if (authed() && isOn() && !playing) waitGesture(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}

    // ---- 버튼 (🔊 위에 🎵, 켜져 있을 때만 ⏭) ----
    function showLabel() {
        var el = document.getElementById('bgmLabel'); if (!el || !cur) return;
        el.textContent = '🎵 ' + titleOf(cur); el.classList.add('show');
        clearTimeout(labelTimer); labelTimer = setTimeout(function () { el.classList.remove('show'); }, 3500);
    }
    function updateBtn() {
        var b = document.getElementById('bgmToggle'), n = document.getElementById('bgmNext'); if (!b) return;
        var on = isOn();
        b.textContent = on ? '🎶' : '🎵';
        b.classList.toggle('off', !on); b.classList.toggle('playing', on && playing);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.title = on ? '배경음악 켜짐 (누르면 끔)' : '배경음악 꺼짐 (누르면 켬)';
        if (n) n.style.display = on ? '' : 'none';
    }
    function mount() {
        var ctrl = document.getElementById('uiZoomCtrl'); if (!ctrl || document.getElementById('bgmToggle')) return;
        var css = document.createElement('style');
        css.textContent =
            '.ui-zoom-ctrl #bgmToggle,.ui-zoom-ctrl #bgmNext{height:34px;font-size:16px;border-bottom:1px solid rgba(255,255,255,0.2)}' +
            '.ui-zoom-ctrl #bgmNext{font-size:14px}' +
            '.ui-zoom-ctrl #bgmToggle.off{opacity:0.6}' +
            '.ui-zoom-ctrl #bgmToggle.playing{animation:bgmBeat 1.6s ease-in-out infinite}' +
            '@keyframes bgmBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}' +
            '.bgm-label{position:fixed;right:64px;bottom:22px;z-index:100000;max-width:min(62vw,280px);padding:7px 12px;border-radius:18px;background:rgba(11,34,64,0.95);color:#fff;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 14px rgba(0,0,0,0.25);opacity:0;transform:translateX(8px);transition:opacity .25s,transform .25s;pointer-events:none}' +
            '.bgm-label.show{opacity:1;transform:none}' +
            '@media (prefers-reduced-motion: reduce){.ui-zoom-ctrl #bgmToggle.playing{animation:none}}';
        document.head.appendChild(css);
        var b = document.createElement('button');
        b.type = 'button'; b.id = 'bgmToggle'; b.setAttribute('aria-label', '배경음악 켜기/끄기'); b.onclick = toggleBgm;
        var n = document.createElement('button');
        n.type = 'button'; n.id = 'bgmNext'; n.setAttribute('aria-label', '다음 곡'); n.title = '다음 곡'; n.textContent = '⏭'; n.onclick = nextBgm;
        ctrl.insertBefore(n, ctrl.firstChild); ctrl.insertBefore(b, ctrl.firstChild);
        var lab = document.createElement('div'); lab.className = 'bgm-label'; lab.id = 'bgmLabel'; lab.setAttribute('aria-live', 'polite');
        document.body.appendChild(lab);
        updateBtn();
        if (isOn()) { var p = loadState(); if (p) { try { sessionStorage.setItem(K_STATE, JSON.stringify(p)); } catch (e) {} } begin(false); waitGesture(); }
    }
    window.toggleBgm = toggleBgm; window.nextBgm = nextBgm;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
