// ==========================================================
// 🎵 선수별 주제곡 도우미 (v2.92.0) — 명단 이미지형 카드의 🎵 표시 · 선수 상세의 「주제곡 듣기」 · 가사 · 🎤 노래방 줄 강조(v2.94.0)
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
        'pre-chorus': '프리코러스', 'build up': '빌드업', 'chorus': '후렴', 'bridge': '브리지', 'break': '브레이크', 'outro': '아웃트로'
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
    //   → 가사 줄 순서대로 { s, e } 목록 (모르는 줄은 null) · 시간표가 없거나 줄 수가 안 맞으면 null (그 곡은 강조 없이 예전처럼 가사만)
    function cheerLineTimes(song) {
        const t = song && song.times;
        if (!Array.isArray(t) || !t.length) return null;
        const n = cheerLyricBlocks(song).reduce((a, b) => a + b.lines.length, 0);
        if (t.length !== n) { console.warn('주제곡 시간표 줄 수가 가사와 달라 강조를 끔:', song.name, t.length, '≠', n); return null; }
        const out = t.map(v => {
            const a = Array.isArray(v) ? v : [v];
            const s = Number(a[0]), e = Number(a[1]);
            return isFinite(s) && a[0] !== null ? { s: s, e: isFinite(e) && a[1] !== null && e > s ? e : null } : null;
        });
        return out.some(Boolean) ? out : null;
    }

    window.loadCheerSongs = loadCheerSongs;
    window.cheerSongFor = cheerSongFor;
    window.cheerLyricBlocks = cheerLyricBlocks;
    window.cheerLineTimes = cheerLineTimes;
})();
