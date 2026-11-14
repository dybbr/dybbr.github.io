// ==========================================================
// 🎵 선수별 주제곡 도우미 (v2.92.0) — 명단 이미지형 카드의 🎵 표시 · 선수 상세의 「주제곡 듣기」 · 가사 · 🎤 노래방 줄 강조(v2.94.0) · 숏 · 롱 두 버전(v2.101.0) · 추가 곡 탭(v2.102.0) · 제목 붙은 플레이리스트(v2.103.0)
// ==========================================================
// 곡 목록(배번 · 이름 · MP3 주소 · 가사)은 cheer-songs.json 에 있음 → 곡 추가 · 수정은 그 파일만 고치면 됨 (이 파일 · 앱 버전은 그대로)
//   · 구글 서버 · 시트에는 묻지 않음 (GitHub 에서 바로 받음 → 학부모님이 동시에 많이 써도 서버 호출이 안 늘어남)
//   · 화면을 열 때마다 「바뀌었는지」 확인하고 받음 → 파일을 고쳐 올리면 1~2분 뒤 반영 · 인터넷이 끊기면 마지막으로 받은 목록
//   · 파일이 깨졌거나(쉼표 빠짐 등) 못 받으면 주제곡만 조용히 안 보이고 나머지 화면은 그대로
// 짝 맞추기: 배번(no) + 이름(name)이 둘 다 같아야 그 선수 곡 → 김민준 2명(5학년 8번 · 3학년 15번)처럼 이름이 같아도 안 섞이고,
//   배번이 새 선수에게 넘어가도 안 붙음 · 학년(grade)은 메모용 (새 학기에 학년이 올라가도 그대로 따라감)
// 이 파일을 고치면 index.html · player.html 의 cheer-songs.js?v=… 숫자도 같이 올리기
(function () {
    let SONGS = [], loading = null;

    const SECTION_NAMES = {
        'intro': '인트로', 'verse 1': '1절', 'verse 2': '2절', 'verse 3': '3절', 'verse': '절',
        'pre-chorus': '프리코러스', 'build up': '빌드업', 'chorus': '후렴', 'bridge': '브리지', 'break': '브레이크', 'outro': '아웃트로',
        'post-chorus': '후렴 뒤', 'final chorus': '후렴', 'instrumental break': '간주', 'inst': '간주'   // v2.144.0: 동생 곡에 있는 이름표
    };

    // cheer-songs.json 받기 (한 화면에서 한 번만) — 끝나면 곡 수를 돌려줌 (실패해도 0)
    function loadCheerSongs() {
        if (!loading) {
            loading = fetch('cheer-songs.json', { cache: 'no-cache' })
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(j => { SONGS = (j && Array.isArray(j.songs)) ? j.songs.filter(s => s && s.no && s.name && s.src) : []; return SONGS.length; })
                .catch(e => { console.warn('주제곡 목록을 못 받음:', e); SONGS = []; return 0; });
        }
        return loading;
    }

    // 이 선수의 주제곡 (없거나 아직 못 받았으면 null) — p 는 명단의 선수 { no, name, ... }
    function cheerSongFor(p) {
        if (!p || !p.no || !p.name) return null;
        const no = String(p.no), name = String(p.name).trim();
        return SONGS.find(s => String(s.no) === no && String(s.name).trim() === name) || null;
    }

    // 가사 → [{ label: '1절', lines: ['…', '…'] }, …] (lyrics 는 한 줄씩 목록 · 한 덩어리 글자 둘 다 됨)
    function cheerLyricBlocks(song) {
        const raw = song && song.lyrics;
        const lines = Array.isArray(raw) ? raw : String(raw || '').split('\n');
        const blocks = [];
        lines.forEach(l => {
            const line = String(l == null ? '' : l).trim();
            if (!line) return;
            const m = line.match(/^\[(.+)\]$/);
            if (m) { const k = m[1].trim().toLowerCase(); blocks.push({ label: SECTION_NAMES[k] || m[1].trim(), lines: [] }); return; }
            if (!blocks.length) blocks.push({ label: '', lines: [] });
            blocks[blocks.length - 1].lines.push(line);
        });
        return blocks.filter(b => b.lines.length);
    }

    // 🎤 노래방 시간표 (v2.94.0) — song.times = 가사 줄마다 [시작초, 끝초] (이름표 [Chorus] 같은 줄 · 빈 줄은 빼고 셈)
    //   → 가사 줄 순서대로 { s, e, w } 목록 (모르는 줄은 null) · 시간표가 없거나 줄 수가 안 맞으면 null (그 곡은 강조 없이 예전처럼 가사만)
    //   🎯 v2.133.0 단어 단위: [시작초, 끝초, [단어1시작, 단어1끝, 단어2시작, …]] — 줄을 띄어쓰기로 나눈 단어마다 (줄 시작에서 잰) 0.1초 단위
    //      → w = [[시작초, 끝초], …] (단어 수가 안 맞으면 w 없이 예전처럼 줄 전체를 고르게 칠함)
    //      아보카도 받아쓰기의 「단어별 시간」으로 만듦 (/mnt/project-files/cheer-songs/karaoke/wordkara.py)
    function cheerLineTimes(song) {
        const t = song && song.times;
        if (!Array.isArray(t) || !t.length) return null;
        const txt = [];
        cheerLyricBlocks(song).forEach(b => b.lines.forEach(l => txt.push(l)));
        const n = txt.length;
        if (t.length !== n) { console.warn('주제곡 시간표 줄 수가 가사와 달라 강조를 끔:', song.name, t.length, '≠', n); return null; }
        const out = t.map((v, i) => {
            const a = Array.isArray(v) ? v : [v];
            const s = Number(a[0]), e = Number(a[1]);
            if (!(isFinite(s) && a[0] !== null)) return null;
            const r = { s: s, e: isFinite(e) && a[1] !== null && e > s ? e : null };
            const w = a[2], nw = cheerWords(txt[i]).length;
            if (Array.isArray(w) && w.length === nw * 2 && nw) {
                r.w = [];
                for (let k = 0; k < nw; k++) { const ws = s + Number(w[2 * k]) / 10, we = s + Number(w[2 * k + 1]) / 10; r.w.push([ws, Math.max(we, ws + 0.05)]); }
                if (r.e == null) r.e = r.w[nw - 1][1];
            }
            return r;
        });
        return out.some(Boolean) ? out : null;
    }

    // 🎯 v2.133.0: 가사 한 줄 → 띄어쓰기로 나눈 단어 목록 (시간표 w 와 같은 순서)
    function cheerWords(line) { return String(line == null ? '' : line).trim().split(/\s+/).filter(Boolean); }
    // 가사 한 줄 → 단어마다 <span class="kw"> 로 감싼 HTML (단어마다 따로 색칠)
    function cheerWordHtml(line) {
        const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        return cheerWords(line).map(w => '<span class="kw">' + esc(w) + '</span>').join(' ');
    }
    // 지금 시각(sec)에 줄 el 안의 단어들을 칠함 — t = cheerLineTimes 의 한 줄 { s, e, w } · e 는 끝초(없으면 부르는 이가 정해 줌)
    //   단어 시간이 있으면 그 단어를 부르는 동안만 왼쪽부터 차오르고, 단어 사이에 쉬면 색칠도 멈춤
    //   없으면(예전 시간표) 줄 전체 시간을 글자 수대로 단어에 나눠 줌 (예전과 같은 속도)
    function cheerPaintWords(el, t, sec, e) {
        if (!el || !t) return;
        const ks = el.querySelectorAll('.kw');
        if (!ks.length) return;
        let w = t.w && t.w.length === ks.length ? t.w : null;
        if (!w) {
            const end = e != null ? e : (t.e != null ? t.e : t.s + 3), L = Array.from(ks).map(k => Math.max(1, k.textContent.length));
            const tot = L.reduce((a, b) => a + b, 0);
            let acc = 0; w = L.map(n => { const a = t.s + (end - t.s) * acc / tot; acc += n; return [a, t.s + (end - t.s) * acc / tot]; });
        }
        for (let i = 0; i < ks.length; i++) {
            const a = w[i][0], b = w[i][1];
            const p = sec <= a ? 0 : sec >= b ? 100 : (sec - a) / (b - a) * 100;
            const v = p.toFixed(1) + '%';
            if (ks[i]._p !== v) { ks[i]._p = v; ks[i].style.setProperty('--p', v); }
        }
    }
    function cheerClearWords(el) { if (el) el.querySelectorAll('.kw').forEach(k => { k._p = ''; k.style.removeProperty('--p'); }); }

    // 🎵 숏 · 롱 두 버전 (v2.101.0) — 곡 덩어리의 src · lyrics · times = 숏(기본), long: { src, lyrics, times, len } = 롱
    //   → [{ key: 's', label: '숏', src, lyrics, times, len }, { key: 'l', label: '롱', … }] (롱이 없으면 숏 하나만)
    //   롱은 테마 · 가사 · 장르 · 목소리가 숏과 다른 별개 곡 → long 에 beat · vocal 이 있으면 그걸 보여 주고, 없으면 숏 것을 같이 씀 · len 은 탭에 보여 줄 길이 글자 ("1:24")
    function cheerVersions(song) {
        if (!song || !song.src) return [];
        // 🎵 플레이리스트 (v2.103.0) — 곡마다 title(제목)이 있으면 그걸 이름으로 씀 · 순서는 추가 곡(more, 새 전문 작사 곡) → 숏 → 롱
        const S = { key: 's', label: song.title || '숏', title: song.title || '', src: song.src, lyrics: song.lyrics, times: song.times, len: song.len || '', beat: song.beat, vocal: song.vocal, use: song.use || '' };
        const out = [];
        // 🎵 추가 곡 (v2.102.0) — more: [{ title, label, src, len, beat, vocal, lyrics, times }, …] (곡 수 제한 없음)
        (Array.isArray(song.more) ? song.more : []).forEach((M, i) => {
            if (M && M.src) out.push({ key: 'm' + i, label: M.title || M.label || ('추가 ' + (i + 1)), title: M.title || M.label || '', src: M.src, lyrics: M.lyrics || [], times: M.times, len: M.len || '', beat: M.beat || '', vocal: M.vocal || '', use: M.use || '' });
        });
        out.push(S);
        const L = song.long;
        if (L && L.src) out.push({ key: 'l', label: L.title || '롱', title: L.title || '', src: L.src, lyrics: L.lyrics || song.lyrics, times: L.lyrics ? L.times : song.times, len: L.len || '', beat: L.beat || song.beat, vocal: L.vocal || song.vocal, use: L.use || '' });
        return out;
    }

    // 🔒 v2.120.0: 우리 아이 곡 모든 분 목록에서 숨기기 — 서버(v2.43.0) 명단의 hideSongs: ['m1', 's', …] (선수정보 시트 「숨긴주제곡」 칸) → 곡 키 묶음
    function cheerHiddenKeys(p) {
        const h = p && p.hideSongs;
        const a = Array.isArray(h) ? h : String(h || '').split(/[,\s]+/);
        return new Set(a.map(x => String(x || '').trim()).filter(Boolean));
    }

    // 🏷️ v2.135.0: 곡마다 추천 상황 (cheer-songs.json 의 use) — 하코 선택 B안: 곡 목록 장르 줄 앞에 「🏏 타석 등장 · 」
    //   정하는 규칙: /mnt/project-files/cheer-songs/situation/classify.py (등장곡 · 숏 = 타석 등장, 떼창 = 다 같이 응원, 나머지는 장르 · 빠르기)
    const CHEER_USE = { bat: ['🏏', '타석 등장'], cheer: ['📣', '다 같이 응원'], hype: ['🔥', '경기 전'], work: ['💪', '훈련·몸 풀 때'], ride: ['🚗', '이동할 때'], rest: ['🌙', '경기 끝나고'] };
    function cheerUseText(u) { const x = CHEER_USE[u]; return x ? x[0] + ' ' + x[1] : ''; }
    window.CHEER_USE = CHEER_USE;
    // 🗓️ v2.136.0: 곡 만든 날 — 곡 주소(…_20261114032231_…)에 남은 아보카도 생성 시각(세계 표준시)을 한국 시각으로
    //   → { ts(정렬용 ms), mo, d, txt: '11.14' } · 주소에 시각이 없으면 null
    function cheerMade(src) {
        const m = /_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/.exec(String(src || ''));
        if (!m) return null;
        const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), k = new Date(ts + 9 * 3600e3);
        const mo = k.getUTCMonth() + 1, d = k.getUTCDate();
        return { ts: ts, mo: mo, d: d, txt: mo + '.' + String(d).padStart(2, '0') };
    }
    window.cheerMade = cheerMade;
    window.cheerUseText = cheerUseText;
    window.cheerHiddenKeys = cheerHiddenKeys;
    window.loadCheerSongs = loadCheerSongs;
    window.cheerVersions = cheerVersions;
    window.cheerSongFor = cheerSongFor;
    window.cheerLyricBlocks = cheerLyricBlocks;
    window.cheerLineTimes = cheerLineTimes;
    window.cheerWords = cheerWords;
    window.cheerWordHtml = cheerWordHtml;
    window.cheerPaintWords = cheerPaintWords;
    window.cheerClearWords = cheerClearWords;
})();
