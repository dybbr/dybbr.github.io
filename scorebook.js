// ==========================================================
// ⚾ 경기 기록 (v2.153.0) — 대표님 손기록표를 휴대폰으로
//   · 경기 중에는 이 기기(localStorage)에만 저장 → 서버 호출 0번 · 끝나고 「보내기」 한 번 (서버 v2.46.0 saveGameRecord)
//   · 입력 방식 4가지(B 기록표 칸 · A 큰 버튼 · D 누른 채 밀기 · E 한 번 터치 표) — 어느 방식이든 저장되는 건 똑같은 한 줄(타순 · 이닝 · 기호)
//   · index.html 의 players · schedEvents · postApi · apiGetUrl · escapeHtml · bkNotify 를 그대로 씀
// ==========================================================
(function () {
    'use strict';
    const LS = 'daeyeon_sb_', LSI = 'daeyeon_sb_index', LSM = 'daeyeon_sb_mode', LSO = 'daeyeon_sb_opp';
    const DIRS = ['투', '포', '1', '2', '3', '유', '좌', '중', '우'];
    const DIRNAME = { 투: '투수', 포: '포수', 1: '1루', 2: '2루', 3: '3루', 유: '유격', 좌: '좌익', 중: '중견', 우: '우익' };
    // s 붙는 글자 · d 방향 필요 · h 안타 · ab 타수 · o 아웃 · bb 4사구 · e 상대 실책 · c 색
    const KIND = {
        H1: { s: '안', n: '안타', d: 1, h: 1, ab: 1, c: 'h' }, IH: { s: '내안', n: '내야안타', d: 1, h: 1, ab: 1, c: 'h' },
        H2: { s: '2', n: '2루타', d: 1, h: 1, ab: 1, c: 'h' }, H3: { s: '3', n: '3루타', d: 1, h: 1, ab: 1, c: 'h' }, HR: { s: '홈', n: '홈런', d: 1, h: 1, ab: 1, c: 'h' },
        GO: { s: '땅', n: '땅볼', d: 1, ab: 1, o: 1, c: 'o' }, FO: { s: '플', n: '플라이', d: 1, ab: 1, o: 1, c: 'o' }, LO: { s: '직', n: '직선타', d: 1, ab: 1, o: 1, c: 'o' },
        E: { s: '실', n: '실책', d: 1, ab: 1, e: 1, c: 'e' }, SF: { s: '희플', n: '희생플', d: 1, o: 1, c: 'o' },
        BB: { s: '4구', n: '4구', bb: 1, c: 'w' }, HP: { s: '사구', n: '사구', bb: 1, c: 'w' }, K: { s: 'K', n: 'K', ab: 1, o: 1, c: 'k' },
        SH: { s: '희번', n: '희생번트', o: 1, c: 'o' }, FC: { s: '야선', n: '야수선택', ab: 1, c: 'e' }
    };
    const MODES = { B: '기록표 칸', A: '큰 버튼', D: '누른 채 밀기', E: '한 번 터치 표' };
    const WH = [['좌', -92, -150], ['중', 0, -176], ['우', 92, -150], ['3', -118, -78], ['유', -46, -104], ['2', 46, -104], ['1', 118, -78], ['투', 0, -54], ['포', 0, 52]];
    const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
    const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
    const note = (st, t, sub) => { try { bkNotify(st, t, sub); } catch (e) {} };

    let G = null;          // 지금 열린 경기
    let ui = { screen: '', pick: null, edit: null, sheetT: null, sheetOpen: false, panel: '', ro: false, msg: '' };
    let recIds = [];       // 서버에 기록표가 있는 일정 ID (bootstrap 이 알려 줌)

    // ---------- 저장 ----------
    function index() { try { return JSON.parse(lsGet(LSI) || '[]'); } catch (e) { return []; } }
    function save() {
        if (!G) return;
        G.at = Date.now();
        lsSet(LS + G.id, JSON.stringify(G));
        const ix = index().filter(x => x.id !== G.id);
        ix.unshift({ id: G.id, ev: G.ev, date: G.date, title: G.title, opp: G.tm.them.name, us: total('us'), them: total('them'), done: !!G.done, bg: !!G.begun, sent: G.sentAt || 0, at: G.at });
        lsSet(LSI, JSON.stringify(ix.slice(0, 60)));
    }
    function load(id) { try { return JSON.parse(lsGet(LS + id) || 'null'); } catch (e) { return null; } }
    function localFor(evId) { const x = index().find(r => r.ev === evId); return x ? x : null; }

    // ---------- 상대 팀 선수 명단 (팀 이름별 · 이 기기 + 서버 「상대팀」 탭 · 대표님 · 개발자만) ----------
    function oppDb() { try { return JSON.parse(lsGet(LSO) || '{}'); } catch (e) { return {}; } }
    function oppList(name) { return (oppDb()[String(name || '').trim()] || []).slice(); }
    function oppSet(name, list) { const db = oppDb(); name = String(name || '').trim(); if (!name) return; db[name] = list.slice(0, 40); lsSet(LSO, JSON.stringify(db)); }
    function oppParse(text) {   // 「9 박태윤」 「박태윤 9」 「9번 박태윤 (투수)」 줄마다
        const out = [];
        String(text || '').split(/[\n,;]+/).forEach(line => {
            const no = (line.match(/\d{1,3}/) || [''])[0], nm = (line.replace(/\d+\s*번?/g, ' ').match(/[가-힣A-Za-z]{2,10}/) || [''])[0];
            if (no || nm) out.push({ no: no, name: nm, pos: '' });
        });
        return out;
    }
    let oppFetched = false;
    async function oppFetch() {
        if (oppFetched || !canRecord()) return; oppFetched = true;
        try {
            const rj = await fetch(apiGetUrl('action=oppTeams'), { cache: 'no-store' }).then(x => x.json());
            if (rj && rj.result === 'success' && rj.teams) { const db = oppDb(); let ch = false; for (const k in rj.teams) { if (!db[k] || !db[k].length) { db[k] = rj.teams[k]; ch = true; } } if (ch) { lsSet(LSO, JSON.stringify(db)); if (G && ui.screen === 'setup') { keepSetup(); draw(); } } }
        } catch (e) { oppFetched = false; }
    }

    // ---------- 계산 ----------
    const other = t => (t === 'us' ? 'them' : 'us');
    const pas = (t) => G.log.filter(e => e.y === 'pa' && e.t === t);
    function sym(e) { const k = KIND[e.k]; return k ? (k.d ? (e.d || '') + k.s : k.s) : (e.k || ''); }
    function outs(t, inn) { return G.log.reduce((n, e) => n + ((e.t === t && e.i === inn && ((e.y === 'pa' && KIND[e.k] && KIND[e.k].o) || e.y === 'ro')) ? 1 : 0), 0); }
    function runs(t, inn) { return (G.runs[t] && G.runs[t][inn]) || 0; }
    function total(t) { let n = 0; for (const k in (G.runs[t] || {})) n += G.runs[t][k] || 0; return n; }
    function acted(t, i) { return runs(t, i) > 0 || G.log.some(e => e.t === t && e.i === i && e.y !== 'sub'); }
    function maxInn() { let m = 6; if (!G.done) m = Math.max(m, G.cur.i); G.log.forEach(e => { if (e.i > m && e.y !== 'sub' && (e.y !== 'end' || acted(e.t, e.i))) m = e.i; }); for (const t of ['us', 'them']) for (const k in (G.runs[t] || {})) if (G.runs[t][k] > 0 && +k > m) m = +k; return m; }
    function stat(t) {
        const a = G.adj[t] || {}, o = G.adj[other(t)] || {};
        let h = 0, b = 0, e = 0;
        pas(t).forEach(x => { const k = KIND[x.k]; if (k) { if (k.h) h++; if (k.bb) b++; } });
        pas(other(t)).forEach(x => { const k = KIND[x.k]; if (k && k.e) e++; });
        return { R: total(t), H: h + (a.H || 0), E: e + (a.E || 0), B: b + (a.B || 0) };
    }
    function pstat(t, slot, pi) {
        let ab = 0, h = 0, rbi = 0;
        pas(t).forEach(x => { if (x.s === slot && x.p === pi) { const k = KIND[x.k]; if (k) { if (k.ab) ab++; if (k.h) h++; } rbi += x.r || 0; } });
        return { ab, h, rbi };
    }
    function slotOf(t, s) { return G.tm[t].ln[s - 1]; }
    function curP(t, s) { const sl = slotOf(t, s); return sl && sl.ps.length ? sl.ps[sl.ps.length - 1] : { no: '', name: '' }; }
    function nSlots(t) { return G.tm[t].ln.length; }
    function halfLabel(t, i) { return i + '회' + (G.first === t ? '초' : '말'); }
    function batting() { return G.cur.t; }
    function recOn(t) { return t === 'us' || G.recThem; }

    // ---------- 기록 동작 ----------
    function snap() { return { cur: Object.assign({}, G.cur), nx: Object.assign({}, G.nx) }; }
    function push(e) { e.id = ++G.seq; e.pc = snap(); G.log.push(e); return e; }
    function advance() { const t = G.cur.t; G.cur.s = G.cur.s % nSlots(t) + 1; G.nx[t] = G.cur.s; }
    function endHalf(auto) {
        const t = G.cur.t, i = G.cur.i;
        const lp = [...G.log].reverse().find(x => (x.y === 'pa' || x.y === 'ro') && x.t === t && x.i === i);   // 「//」 는 그 회 마지막 타자 칸에
        push({ y: 'end', t: t, i: i, s: lp ? lp.s : G.cur.s, p: lp ? lp.p : 0, auto: auto ? 1 : 0 });
        const o = other(t);
        G.cur = { t: o, i: (G.first === t ? i : i + 1), s: G.nx[o] || 1 };
        ui.sheetT = null; ui.pick = null; ui.edit = null;
        if (G.first !== t && i >= 6 && !G.done) ui.panel = 'askend';   // 6회말(또는 연장)이 끝나면 「경기 끝났나요?」
    }
    function record(k, d) {
        const K = KIND[k]; if (!K) return;
        if (K.d && !d) { ui.pick = k; draw(); return; }
        if (ui.edit != null) {   // 고치기: 그 칸의 기호만 바꿈
            const e = G.log.find(x => x.id === ui.edit);
            if (e) { e.k = k; e.d = K.d ? d : ''; ui.msg = '고쳤어요 · ' + sym(e); }
            ui.edit = null; ui.pick = null; save(); draw(); return;
        }
        const t = G.cur.t;
        if (!recOn(t)) return;
        const sl = slotOf(t, G.cur.s);
        const e = push({ y: 'pa', t: t, i: G.cur.i, s: G.cur.s, p: Math.max(0, sl.ps.length - 1), k: k, d: K.d ? d : '', r: 0 });
        const who = curP(t, e.s);
        ui.msg = '✔ ' + e.s + '번 ' + (who.name || (who.no ? '#' + who.no : '')) + ' 「' + sym(e) + '」';
        ui.pick = null; ui.more = false; ui.dir = null;
        advance();
        if (outs(t, e.i) >= 3) { endHalf(true); ui.msg += ' · 3아웃, 공수교대'; }
        save(); draw();
    }
    function undo() {
        const e = G.log.pop();
        if (!e) { ui.msg = '되돌릴 기록이 없어요'; draw(); return; }
        if (e.y === 'end' && e.auto) { G.cur = e.pc.cur; G.nx = e.pc.nx; return undo(); }   // 자동 공수교대는 그 타석과 함께 되돌림
        if (e.y === 'sub') { const sl = slotOf(e.t, e.s); if (sl.ps.length > 1) sl.ps.pop(); }
        if (e.y === 'run') { G.runs[e.t][e.i] = Math.max(0, runs(e.t, e.i) - 1); if (e.ref) { const pa = G.log.find(x => x.id === e.ref); if (pa) pa.r = Math.max(0, (pa.r || 0) - 1); } }
        G.cur = e.pc.cur; G.nx = e.pc.nx;
        ui.msg = '↶ 되돌렸어요'; ui.edit = null; ui.pick = null; ui.sheetT = null;
        save(); draw();
    }
    function addRun(t) {
        const i = G.cur.t === t ? G.cur.i : lastInn(t);
        G.runs[t] = G.runs[t] || {}; G.runs[t][i] = runs(t, i) + 1;
        let ref = 0;   // 방금 친 타자의 타점으로 (실책 · 야선 · 삼진은 빼고)
        if (recOn(t)) { const last = [...G.log].reverse().find(x => x.y === 'pa' && x.t === t && x.i === i); if (last && KIND[last.k] && !KIND[last.k].e && last.k !== 'K' && last.k !== 'FC') { last.r = (last.r || 0) + 1; ref = last.id; } }
        push({ y: 'run', t: t, i: i, ref: ref });
        ui.msg = '득점 +1 · ' + G.tm[t].name + ' ' + total(t) + '점';
        save(); draw();
    }
    function lastInn(t) { return G.cur.t === t ? G.cur.i : (G.first === t ? G.cur.i : Math.max(1, G.cur.i - 1)); }
    function runnerOut() {
        const t = G.cur.t, i = G.cur.i;
        const last = [...G.log].reverse().find(x => x.y === 'pa' && x.t === t && x.i === i);
        push({ y: 'ro', t: t, i: i, s: last ? last.s : G.cur.s, p: last ? last.p : 0 });
        ui.msg = '주자 아웃 +1';
        if (outs(t, i) >= 3) { endHalf(true); ui.msg += ' · 3아웃, 공수교대'; }
        save(); draw();
    }
    function adj(t, key, n) { G.adj[t] = G.adj[t] || {}; G.adj[t][key] = (G.adj[t][key] || 0) + n; save(); draw(); }
    function setRun(t, i, n) { G.runs[t] = G.runs[t] || {}; G.runs[t][i] = Math.max(0, runs(t, i) + n); save(); draw(); }

    // ---------- 새 경기 ----------
    function staffG(g) { g = String(g || ''); return /감독|코치|지도자/.test(g); }
    function roster() { try { return (players || []).filter(q => q && q.name && q.visible !== false && !staffG(q.grade) && !(typeof isStaff === 'function' && isStaff(q.grade))).sort((a, b) => (Number(b.grade) - Number(a.grade)) || (Number(a.no) - Number(b.no))); } catch (e) { return []; } }
    function grades() { const o = []; roster().forEach(q => { const g = String(q.grade || '?'); if (o.indexOf(g) === -1) o.push(g); }); return o; }
    // 우리 팀 타순 고르기 — 학년별로 (시안 A 학년 탭 · B 학년별 묶음 · C 학년 골라 보기)
    function pickBtn(q, used) { const n = used[q.no + '|' + q.name]; return `<button type="button" data-a="lnpick" data-no="${esc(q.no)}" data-name="${esc(q.name)}" class="${n ? 'on' : ''}">${n ? `<i>${n}</i>` : ''}<b>${esc(q.no)}</b>${esc(q.name)}</button>`; }
    const LAY = (typeof window !== 'undefined' && window.SB_LAY) || 'B';   // 11-22 하코 선택: B 자주 쓰는 9개 + 「기타」 (A 기호 글자 · C 방향 먼저도 코드에 남겨 둠)
    const GV = 'B';   // 11-22 하코 선택: B 학년별 묶음 (A 학년 탭 · C 학년 골라 보기도 코드에 남겨 둠)
    function rosterPick(used) {
        const R = roster(), gs = grades(), gv = GV;
        if (!R.length) return '<p class="hint">선수 명단을 아직 못 받았어요. 앱을 한 번 새로고침해 주세요.</p>';
        const cnt = g => R.filter(q => String(q.grade) === g && used[q.no + '|' + q.name]).length;
        const gl = g => (g === '?' ? '학년 없음' : g + '학년');
        if (gv === 'B') {
            const eg = String((G && G.grades) || '').split(',').map(x => x.trim()).filter(x => gs.indexOf(x) !== -1);   // 일정의 대상 학년을 맨 위에
            if (eg.length) { gs.sort((x, y) => (eg.indexOf(x) === -1) - (eg.indexOf(y) === -1) || Number(y) - Number(x)); }
            if (!ui.gOpen) { if (eg.length === 1) { const g = eg[0], up = String(Number(g) + 1), dn = String(Number(g) - 1); ui.gOpen = [g, gs.indexOf(up) !== -1 ? up : dn]; } else ui.gOpen = eg.length ? eg.slice() : gs.slice(0, 2); }
            return gs.map(g => { const L = R.filter(q => String(q.grade) === g), op = ui.gOpen.indexOf(g) !== -1 || cnt(g) > 0;
                return `<div class="sb-gsec"><button type="button" class="gh${op ? ' op' : ''}" data-a="gopen" data-g="${esc(g)}"><b>${gl(g)}</b> ${L.length}명${cnt(g) ? ` · <em>${cnt(g)}명 골랐어요</em>` : ''}<span>${op ? '접기 ▴' : '펼치기 ▾'}</span></button>${op ? `<div class="plist pick">${L.map(q => pickBtn(q, used)).join('')}</div>` : ''}</div>`; }).join('');
        }
        if (gv === 'C') {
            if (!ui.gOn) ui.gOn = gs.slice(0, 2);
            const L = R.filter(q => ui.gOn.indexOf(String(q.grade)) !== -1);
            return `<div class="sb-gchips"><span>보일 학년</span>${gs.map(g => `<button type="button" data-a="gchip" data-g="${esc(g)}" class="${ui.gOn.indexOf(g) !== -1 ? 'on' : ''}">${gl(g)}${cnt(g) ? `<i>${cnt(g)}</i>` : ''}</button>`).join('')}</div><div class="plist pick">${L.map(q => pickBtn(q, used)).join('') || '<p class="hint">위에서 학년을 눌러 주세요</p>'}</div>`;
        }
        if (gv !== 'A') return `<div class="plist pick">${R.map(q => pickBtn(q, used)).join('')}</div>`;
        if (!ui.gTab || gs.indexOf(ui.gTab) === -1) ui.gTab = gs[0];
        return `<div class="sb-gtabs">${gs.map(g => `<button type="button" data-a="gtab" data-g="${esc(g)}" class="${ui.gTab === g ? 'on' : ''}">${gl(g)}${cnt(g) ? `<i>${cnt(g)}</i>` : ''}</button>`).join('')}</div><div class="plist pick">${R.filter(q => String(q.grade) === ui.gTab).map(q => pickBtn(q, used)).join('')}</div>`;
    }
    function newGame(ev) {
        const id = 'G' + (ev && ev.id ? String(ev.id).replace(/[^A-Za-z0-9_-]/g, '') : Date.now().toString(36));
        const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        return { v: 1, id: id, ev: ev ? ev.id : '', date: ev ? ev.date : today, title: ev ? (ev.title && ev.title !== ev.type ? ev.title : ev.type) : '', place: ev ? (ev.place || '') : '', grades: ev ? String(ev.grades || '') : '', start: ev ? (ev.start || '') : '',
            first: 'them', recThem: true, tm: { us: { name: '대연초', ln: [] }, them: { name: ev && ev.opponent ? ev.opponent : '상대', ln: [] } },
            log: [], runs: { us: {}, them: {} }, adj: { us: {}, them: {} }, cur: { t: 'them', i: 1, s: 1 }, nx: { us: 1, them: 1 }, seq: 0, done: false, sentAt: 0, begun: false };
    }
    function lastLineup() { const ix = index(); for (const r of ix) { const g = load(r.id); if (g && g.tm && g.tm.us.ln.length) return g.tm.us.ln.map(sl => ({ ps: [Object.assign({}, sl.ps[0])] })); } return null; }
    function startGame() {
        if (G.tm.us.ln.length < 1) { ui.msg = '우리 팀 타순을 한 명 이상 골라 주세요'; draw(); return; }
        while (G.tm.them.ln.length < 9) G.tm.them.ln.push({ ps: [{ no: '', name: '', pos: '' }] });
        G.cur = { t: G.first, i: 1, s: 1 }; G.nx = { us: 1, them: 1 }; G.begun = true;
        ui.screen = 'game'; save(); draw();
    }

    // ---------- 화면 ----------
    function root() {
        let r = document.getElementById('sbRoot');
        if (!r) { r = document.createElement('div'); r.id = 'sbRoot'; r.className = 'sb'; document.body.appendChild(r); bind(r); }
        return r;
    }
    function close() { const r = document.getElementById('sbRoot'); if (r) { r.style.display = 'none'; r.innerHTML = ''; } document.documentElement.classList.remove('sb-open'); G = null; try { if (typeof renderSchedule === 'function') renderSchedule(); } catch (e) {} band(); }
    function draw() {
        const r = root(); r.style.display = 'block'; document.documentElement.classList.add('sb-open');
        const keep = r.querySelector('.sb-sheetwrap'); const sx = keep ? keep.scrollLeft : null;
        r.innerHTML = ui.screen === 'setup' ? setupHtml() : ui.screen === 'view' ? viewHtml() : gameHtml();
        r.dataset.mode = G ? (lsGet(LSM) || 'B') : '';
        const cur = r.querySelector('.sb-sheetwrap td.cur');
        if (cur && ui.screen === 'game') {   // 지금 칸이 고정된 이름 칸 · 머리줄에 가리지 않게만 살짝 움직임
            r.querySelectorAll('.sb-sheetwrap').forEach(w => { const c = w.querySelector('td.cur'); if (!c) return; const nm = w.querySelector('th.nm'), L = nm ? nm.offsetLeft + nm.offsetWidth : 0, T = nm ? nm.offsetHeight : 0;
                if (sx != null) w.scrollLeft = sx;
                if (c.offsetLeft - w.scrollLeft < L) w.scrollLeft = c.offsetLeft - L; else if (c.offsetLeft + c.offsetWidth - w.scrollLeft > w.clientWidth) w.scrollLeft = c.offsetLeft + c.offsetWidth - w.clientWidth + 30;
                if (c.offsetTop - w.scrollTop < T) w.scrollTop = c.offsetTop - T - c.offsetHeight; else if (c.offsetTop + c.offsetHeight - w.scrollTop > w.clientHeight) w.scrollTop = c.offsetTop + c.offsetHeight - w.clientHeight + c.offsetHeight; });
        }
        else if (sx != null) { const w = r.querySelector('.sb-sheetwrap'); if (w) w.scrollLeft = sx; }
    }
    function mode() { const m = lsGet(LSM); return MODES[m] ? m : 'B'; }

    function topBar(title, right) {
        return `<div class="sb-top"><button type="button" class="sb-x" data-a="close" aria-label="닫기">✕</button><b>${esc(title)}</b>${right || ''}</div>`;
    }
    function boardHtml(edit) {
        const n = maxInn(), order = [G.first, other(G.first)];
        const head = Array.from({ length: n }, (_, k) => `<th>${k + 1}</th>`).join('');
        const row = t => {
            const st = stat(t);
            const cells = Array.from({ length: n }, (_, k) => {
                const i = k + 1, played = acted(t, i) || (!G.done && (i < G.cur.i || (i === G.cur.i && (G.cur.t === t || G.first === t))));
                const v = played ? runs(t, i) : '';
                return edit ? `<td class="${G.cur.t === t && G.cur.i === i ? 'now' : ''}"><button type="button" data-a="run-" data-t="${t}" data-i="${i}">−</button><b>${runs(t, i)}</b><button type="button" data-a="run+" data-t="${t}" data-i="${i}">＋</button></td>`
                    : `<td class="${!G.done && G.cur.t === t && G.cur.i === i ? 'now' : ''}">${v}</td>`;
            }).join('');
            return `<tr><td class="tm">${esc(G.tm[t].name)}</td>${cells}<td class="R">${st.R}</td><td>${st.H}</td><td>${st.E}</td><td>${st.B}</td></tr>`;
        };
        return `<div class="sb-boardwrap"><table class="sb-board${edit ? ' ed' : ''}"><tr><th class="tm">팀</th>${head}<th>R</th><th>H</th><th>E</th><th>B</th></tr>${row(order[0])}${row(order[1])}</table></div>`;
    }
    function sheetHtml(t, ro) {
        const n = maxInn(), ln = G.tm[t].ln;
        const cells = {};   // i|s|p → [entries]
        G.log.forEach(e => { if (e.t !== t) return; if (e.y === 'pa' || e.y === 'ro') (cells[e.i + '|' + e.s + '|' + e.p] = cells[e.i + '|' + e.s + '|' + e.p] || []).push(e); });
        const ends = {}; G.log.forEach(e => { if (e.y === 'end' && e.t === t) ends[e.i + '|' + e.s + '|' + (e.p || 0)] = 1; });
        let rows = '';
        ln.forEach((sl, si) => {
            const s = si + 1;
            sl.ps.forEach((p, pi) => {
                const last = pi === sl.ps.length - 1, st = pstat(t, s, pi);
                let tds = '';
                for (let i = 1; i <= n; i++) {
                    const es = cells[i + '|' + s + '|' + pi] || [];
                    const isCur = !ro && !G.done && last && G.cur.t === t && G.cur.i === i && G.cur.s === s && ui.edit == null;
                    const inner = es.map(e => e.y === 'ro' ? `<i class="ro">(주자아웃)</i>` : `<span class="sy ${KIND[e.k] ? KIND[e.k].c : ''}${ui.edit === e.id ? ' ed' : ''}" data-a="cell" data-id="${e.id}">${esc(sym(e))}${e.r ? `<sup>${e.r}</sup>` : ''}</span>`).join('')
                        + (es.length && ends[i + '|' + s + '|' + pi] ? `<span class="endm">//</span>` : '');
                    tds += `<td class="${isCur ? 'cur' : ''}"${ro ? '' : ` data-a="cellempty" data-t="${t}" data-i="${i}" data-s="${s}"`}>${inner}</td>`;
                }
                rows += `<tr class="${pi ? 'subrow' : ''}"><td class="od">${pi ? '' : s}</td><td class="nm"${ro ? '' : ` data-a="who" data-t="${t}" data-s="${s}" data-p="${pi}"`}><b>${esc(p.no)}</b> ${p.name ? esc(p.name) : (p.no === '' && !ro ? '<u>배번 넣기</u>' : '')}<small>${esc(p.pos || '')}</small></td>${tds}<td class="tt">${st.ab}</td><td class="tt">${st.h}</td><td class="tt">${st.rbi}</td></tr>`;
            });
        });
        const head = Array.from({ length: n }, (_, k) => `<th>${k + 1}회</th>`).join('');
        return `<div class="sb-sheetwrap"><table class="sb-sheet"><tr><th class="od">타순</th><th class="nm">배번 · 이름</th>${head}<th class="tt">타수</th><th class="tt">안타</th><th class="tt">타점</th></tr>${rows}</table></div>`;
    }
    function sheetTabs(t) {
        return `<div class="sb-stabs"><button type="button" data-a="sheett" data-t="us" class="${t === 'us' ? 'on' : ''}">${esc(G.tm.us.name)}</button>${G.recThem ? `<button type="button" data-a="sheett" data-t="them" class="${t === 'them' ? 'on' : ''}">${esc(G.tm.them.name)}</button>` : ''}</div>`;
    }

    // 입력 판 — 방식마다 모양만 다르고 모두 record(k, d) 를 부름
    const SHORTN = { H1: '안타', IH: '내야안타', H2: '2루타', H3: '3루타', HR: '홈런', GO: '땅볼', FO: '플라이', LO: '직선타', E: '실책', SF: '희생플', BB: '볼넷', HP: '몸에 맞음', K: '삼진', SH: '희생번트', FC: '야수선택' };
    function kb(k, cls, extra) { const K = KIND[k]; const lab = (LAY === 'A' && !extra) ? `<b class="sy2">${esc(K.s)}</b><small>${SHORTN[k]}</small>` : K.n + (extra || ''); return `<button type="button" class="kb ${K.c} ${cls || ''}${ui.pick === k ? ' sel' : ''}" data-a="k" data-k="${k}">${lab}</button>`; }
    function dirRow() { return `<div class="sb-dirs${ui.pick ? ' need' : ''}">${DIRS.map(d => `<button type="button" data-a="d" data-d="${d}">${d}</button>`).join('')}</div>`; }
    function fieldPad() { return `<div class="sb-field${ui.pick ? ' need' : ''}">${[['좌', 'lf'], ['중', 'cf'], ['우', 'rf'], ['유', 'ss'], ['2', 'b2'], ['3', 'b3'], ['투', 'pp'], ['1', 'b1'], ['포', 'cc']].map(([d, a]) => `<button type="button" style="grid-area:${a}" data-a="d" data-d="${d}">${d}</button>`).join('')}</div>`; }
    function padHtml(m) {
        if (m === 'A') return `<div class="sb-pad pa"><div class="lbl">① 결과</div><div class="g3">${kb('H1')}${kb('H2')}${kb('H3')}${kb('BB')}${kb('HP')}${kb('K')}${kb('GO')}${kb('FO')}${kb('LO')}${kb('HR')}${kb('E')}${kb('SF')}${kb('SH')}${kb('IH')}${kb('FC')}</div><div class="lbl">② 공이 간 곳${ui.pick ? ' — ' + KIND[ui.pick].n + ' 어디로?' : ''}</div>${fieldPad()}</div>`;
        if (m === 'D') return `<div class="sb-pad pd"><div class="lbl">결과를 <b>누른 채</b> 공이 간 쪽으로 밀고 떼기 · 4구 · 사구 · K는 그냥 누르기</div><div class="g3 drag">${['H1', 'H2', 'H3', 'GO', 'FO', 'LO', 'E', 'HR', 'SF', 'IH'].map(k => `<button type="button" class="kb ${KIND[k].c}" data-drag="${k}">${KIND[k].n}</button>`).join('')}${kb('BB')}${kb('HP')}${kb('K')}${kb('SH')}${kb('FC')}</div></div>`;
        if (m === 'E') {
            const cols = ['H1', 'H2', 'GO', 'FO', 'E'];
            return `<div class="sb-pad pe"><div class="q4">${kb('BB')}${kb('HP')}${kb('K')}${kb('SH')}</div><div class="mx"><span></span>${cols.map(k => `<span class="ch">${KIND[k].n}</span>`).join('')}${['좌', '중', '우', '유', '2', '3', '1', '투', '포'].map(d => `<span class="rh">${DIRNAME[d]}</span>` + cols.map(k => { const dim = (/[좌중우]/.test(d) && k === 'GO') || (/[투포123유]/.test(d) && k === 'H2'); return `<button type="button" class="${KIND[k].c}${dim ? ' dim' : ''}" data-a="kd" data-k="${k}" data-d="${d}">${d}${KIND[k].s}</button>`; }).join('')).join('')}</div><div class="more">${['H3', 'HR', 'LO', 'SF', 'IH'].map(k => kb(k, 'sm')).join('')}${kb('FC', 'sm')}</div>${ui.pick ? dirRow() : ''}</div>`;
        }
        // B: 기록표 칸 방식 — 기호 판은 작게, 기록표가 주인공
        if (LAY === 'B') {   // 자주 쓰는 10개 + 「기타」
            const more = ui.more ? `<div class="sb-more">${['H3', 'HR', 'IH', 'LO', 'SF', 'FC'].map(k => kb(k)).join('')}<button type="button" class="kb x" data-a="more">닫기</button></div>` : '';
            return `<div class="sb-pad pb lb"><div class="g5">${kb('BB')}${kb('HP')}${kb('K')}${kb('H1')}${kb('H2')}${kb('GO')}${kb('FO')}${kb('E')}${kb('SH')}<button type="button" class="kb etc${ui.more ? ' sel' : ''}" data-a="more">기타 ▴</button></div>${dirRow()}${more}</div>`;
        }
        if (LAY === 'C') {   // 방향 먼저 → 그 방향의 결과 고르기 (기호를 쓰는 순서 그대로: 좌 → 좌안)
            if (ui.dir) { const d = ui.dir; return `<div class="sb-pad pb lc"><div class="g5">${['H1', 'H2', 'H3', 'HR', 'IH', 'GO', 'FO', 'LO', 'E', 'SF'].map(k => `<button type="button" class="kb ${KIND[k].c}" data-a="kd" data-k="${k}" data-d="${d}">${d}${KIND[k].s}</button>`).join('')}</div><div class="lcbar"><span>${DIRNAME[d]} 쪽 — 결과를 누르세요</span>${kb('FC', 'sm')}<button type="button" data-a="dirx">✕ 방향 다시</button></div></div>`; }
            return `<div class="sb-pad pb lc"><div class="lbl">공이 간 곳 먼저 · 4구 · 사구 · K는 바로</div><div class="sb-dirs big">${DIRS.map(d => `<button type="button" data-a="dfirst" data-d="${d}">${d}</button>`).join('')}</div><div class="g5 nod">${kb('BB')}${kb('HP')}${kb('K')}${kb('SH')}${kb('FC')}</div></div>`;
        }
        return `<div class="sb-pad pb"><div class="g5">${kb('BB')}${kb('HP')}${kb('K')}${kb('H1')}${kb('H2')}${kb('H3')}${kb('HR')}${kb('IH')}${kb('GO')}${kb('FO')}${kb('LO')}${kb('SH')}${kb('SF')}${kb('E')}${kb('FC')}</div>${dirRow()}</div>`;
    }
    function nowLine() {
        const t = G.cur.t, p = curP(t, G.cur.s), st = pstat(t, G.cur.s, Math.max(0, slotOf(t, G.cur.s).ps.length - 1));
        if (ui.edit != null) { const e = G.log.find(x => x.id === ui.edit); const q = e ? slotOf(e.t, e.s).ps[e.p] : null; return `<div class="sb-now ed"><span><b>고치는 중</b> · ${e ? e.s + '번 ' + esc(q && (q.name || q.no) || '') + ' ' + e.i + '회 「' + esc(sym(e)) + '」' : ''} → 새 기호를 누르세요</span><button type="button" data-a="del">지우기</button><button type="button" data-a="editoff">취소</button></div>`; }
        return `<div class="sb-now"><span class="no">${esc(p.no || '?')}</span><span class="nm">${esc(p.name || (p.no ? '' : '배번 넣기'))}</span><span class="sub">${G.cur.s}번${p.pos ? ' · ' + esc(p.pos) : ''} · ${st.ab}타수 ${st.h}안타</span><button type="button" data-a="who" data-t="${t}" data-s="${G.cur.s}" data-p="${Math.max(0, slotOf(t, G.cur.s).ps.length - 1)}">선수</button></div>`;
    }
    function statusHtml() {
        const t = G.cur.t, o = outs(t, G.cur.i);
        return `<div class="sb-status"><b class="inn">${halfLabel(t, G.cur.i)}</b><button type="button" class="sc" data-a="board"><span>${esc(G.tm.us.name)} <b class="us">${total('us')}</b> : <b>${total('them')}</b> ${esc(G.tm.them.name)}</span><i>점수판 ▾</i></button><span class="outs" aria-label="${o}아웃">${[0, 1, 2].map(k => `<i class="${k < o ? 'on' : ''}"></i>`).join('')}</span></div>`;
    }
    function toolsHtml() {
        const t = G.cur.t;
        return `${LAY ? `<div class="sb-msg">${esc(ui.msg || '기록하면 여기에 표시돼요')}</div>` : `<div class="sb-undo"><span>${esc(ui.msg || '기록하면 여기에 표시돼요')}</span><button type="button" data-a="undo">↶ 되돌리기</button></div>`}
        ${LAY ? `<div class="sb-tools ic"><button type="button" class="run" data-a="run" data-t="${t}"><b>＋</b>득점</button><button type="button" data-a="ro"><b>🏃</b>주자아웃</button><button type="button" data-a="sub"><b>🔁</b>교체</button><button type="button" data-a="end"><b>⇄</b>공수교대</button><button type="button" data-a="undo" class="un"><b>↶</b>되돌리기</button><button type="button" data-a="menu"><b>⋯</b>더보기</button></div>` : `<div class="sb-tools"><button type="button" class="run" data-a="run" data-t="${t}">＋ 득점</button><button type="button" data-a="ro">🏃 주자아웃</button><button type="button" data-a="sub">🔁 교체</button><button type="button" data-a="end">공수교대</button><button type="button" data-a="menu">⋯ 더보기</button></div>`}`;
    }
    function simpleThem() {   // 상대 타자를 안 적는 경기: 숫자만
        const st = stat('them');
        const c = (lab, key, v) => `<div class="cnt"><span>${lab}</span><button type="button" data-a="adj" data-k="${key}" data-n="-1">−</button><b>${v}</b><button type="button" data-a="adj" data-k="${key}" data-n="1">＋</button></div>`;
        return `<div class="sb-pad simple"><div class="lbl">${esc(G.tm.them.name)} 공격 — 숫자만 올려요</div><div class="cnt"><span>이번 회 득점</span><button type="button" data-a="run-" data-t="them" data-i="${G.cur.i}">−</button><b>${runs('them', G.cur.i)}</b><button type="button" data-a="run+" data-t="them" data-i="${G.cur.i}">＋</button></div>${c('안타', 'H', st.H)}${c('4사구', 'B', st.B)}${c('실책', 'E', st.E)}<button type="button" class="big" data-a="end">${esc(G.tm.them.name)} 공격 끝 ▶</button></div>`;
    }
    function gameHtml() {
        const m = mode(), t = G.cur.t, on = recOn(t), st = ui.sheetT || t;
        const sheet = `<div class="sb-sheetbox">${sheetTabs(recOn(st) ? st : 'us')}${sheetHtml(recOn(st) ? st : 'us')}</div>`;
        let over = '';
        if (ui.panel === 'board') over = `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>점수판 <small>＋ − 로 이닝 점수를 고쳐요</small></h3>${boardHtml(true)}<div class="adjs">${['us', 'them'].map(x => `<div><b>${esc(G.tm[x].name)}</b> ${['H', 'E', 'B'].map(k => `<span>${k} <button type="button" data-a="adj2" data-t="${x}" data-k="${k}" data-n="-1">−</button>${stat(x)[k]}<button type="button" data-a="adj2" data-t="${x}" data-k="${k}" data-n="1">＋</button></span>`).join('')}</div>`).join('')}</div><button type="button" class="big" data-a="panel-x">닫기</button></div></div>`;
        if (ui.panel === 'menu') over = `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>${LAY ? '⚙ 설정' : '더보기'}</h3><div class="lbl">입력 방식 (기록은 그대로 이어져요)</div><div class="modes">${Object.keys(MODES).map(k => `<button type="button" data-a="mode" data-m="${k}" class="${k === m ? 'on' : ''}"><b>${k}안</b>${MODES[k]}</button>`).join('')}</div><button type="button" class="row" data-a="run" data-t="${other(t)}">＋ ${esc(G.tm[other(t)].name)} 득점</button><button type="button" class="row" data-a="togthem">${G.recThem ? '상대 타자 기록 끄기 (숫자만 올리기)' : '상대 타자도 타순별로 기록하기'}</button><button type="button" class="row" data-a="lineup">타순 · 선수 고치기</button><button type="button" class="row pri" data-a="finish">🏁 경기 끝 · 확인하고 보내기</button><button type="button" class="big" data-a="panel-x">닫기</button></div></div>`;
        if (ui.panel === 'who') over = whoPanel();
        if (ui.panel === 'finish') over = finishPanel();
        if (ui.panel === 'askend') { const pi = G.cur.i - 1; over = `<div class="sb-over"><div class="sb-panel" data-stop="1"><h3>🏁 ${pi}회말까지 끝났어요</h3><p class="fin">${esc(G.tm.us.name)} ${total('us')} : ${total('them')} ${esc(G.tm.them.name)}</p><p class="hint">경기가 끝났으면 확인하고 서버에 보내요. 연장이면 계속 기록하세요.</p><button type="button" class="big pri" data-a="finish">🏁 경기 끝 · 확인하고 보내기</button><button type="button" class="big" data-a="panel-x">연장 · 계속 기록</button></div></div>`; }
        if (ui.panel === 'sheet') over = `<div class="sb-over full"><div class="sb-panel full" data-stop="1"><h3>📋 기록표 <small>칸을 누르면 고쳐요</small></h3>${sheet}<button type="button" class="big" data-a="panel-x">닫기</button></div></div>`;
        const input = on ? `${nowLine()}${padHtml(m)}` : simpleThem();
        return `${topBar((G.title || '경기') + ' · vs ' + G.tm.them.name, `${G.done ? '' : `<button type="button" class="sb-fin" data-a="finish">🏁 경기 끝</button>`}<button type="button" class="sb-mode" data-a="menu" aria-label="설정">${LAY ? '⚙ 설정' : m + '안 ▾'}</button>`)}
        <div class="sb-body m${m}${on ? '' : ' simple'}${LAY ? ' lay' + LAY : ''}"><div class="sb-main">${G.done ? `<button type="button" class="sb-donebar" data-a="finish">🏁 경기 끝 · 다 고쳤으면 여기를 눌러 보내기</button>` : ''}${statusHtml()}${m === 'B' && on ? sheet : ''}${input}${toolsHtml()}${m !== 'B' || !on ? `<button type="button" class="sb-sheetbtn" data-a="sheet">📋 기록표 보기 · 고치기</button>` : ''}</div><div class="sb-side">${boardHtml(false)}${sheet}</div></div>${over}`;
    }
    function whoPanel() {
        const w = ui.who, sl = slotOf(w.t, w.s), p = sl.ps[w.p] || {};
        const posSel = `<select id="sbPos">${['', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'DH'].map(v => `<option value="${v}"${String(p.pos || '') === v ? ' selected' : ''}>${v ? v + (DIRPOS[v] ? ' ' + DIRPOS[v] : '') : '수비 위치'}</option>`).join('')}</select>`;
        const src = w.t === 'us' ? roster() : oppList(G.tm.them.name);
        const list = src.length ? `<div class="lbl">${w.sub ? '바꿔 들어갈 선수' : '선수 고르기'}</div><div class="plist">${src.map(q => `<button type="button" data-a="whopick" data-no="${esc(q.no)}" data-name="${esc(q.name)}"><b>${esc(q.no)}</b>${esc(q.name)}${q.grade ? `<small>${esc(q.grade)}학년</small>` : ''}</button>`).join('')}</div>` : '';
        return `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>${w.s}번 타자 ${w.sub ? '교체' : '정보'} <small>${esc(G.tm[w.t].name)}</small></h3><div class="f2"><label>배번<input id="sbNo" inputmode="numeric" maxlength="3" value="${w.sub ? '' : esc(p.no || '')}"></label><label>이름<input id="sbName" maxlength="10" value="${w.sub ? '' : esc(p.name || '')}"></label></div>${posSel}${list}<button type="button" class="big pri" data-a="whosave">${w.sub ? '교체하기' : '저장'}</button><button type="button" class="big" data-a="panel-x">취소</button></div></div>`;
    }
    const DIRPOS = { 1: '투수', 2: '포수', 3: '1루수', 4: '2루수', 5: '3루수', 6: '유격수', 7: '좌익수', 8: '중견수', 9: '우익수', DH: '지명' };
    function finishPanel() {
        const us = total('us'), th = total('them'), r = us > th ? '승' : us < th ? '패' : '무';
        return `<div class="sb-over"><div class="sb-panel" data-stop="1"><h3>🏁 경기 끝</h3><p class="fin"><b>${r === '승' ? '승리' : r === '패' ? '패배' : '무승부'}</b> ${esc(G.tm.us.name)} ${us} : ${th} ${esc(G.tm.them.name)}</p>${boardHtml(false)}<p class="hint">틀린 칸이 있으면 「기록표 고치기」에서 먼저 고친 뒤 보내세요. 보낸 뒤에 다시 고쳐서 또 보내도 돼요(덮어써요).</p><button type="button" class="big" data-a="sheet">📋 기록표 고치기</button><button type="button" class="big" data-a="board">점수판 고치기</button><button type="button" class="big pri" data-a="send">📤 서버에 보내기 (저장)</button>${G.sentAt ? (G.sentSig && G.sentSig !== sig(bodyOf()) ? `<p class="hint warn">보낸 뒤에 고친 내용이 있어요. 한 번 더 보내 주세요.</p>` : `<p class="hint ok">✔ ${G.sentAt > 1 ? new Date(G.sentAt).toLocaleString('ko-KR') + ' 에 ' : '서버에 '}보냈어요</p>`) : ''}<div class="f2"><button type="button" class="big" data-a="resume">경기로 돌아가기</button><button type="button" class="big" data-a="close">닫기</button></div></div></div>`;
    }
    function setupHtml() {
        const used = {}; G.tm.us.ln.forEach((sl, i) => { used[sl.ps[0].no + '|' + sl.ps[0].name] = i + 1; });
        const last = lastLineup();
        return `${topBar('경기 기록 준비')}<div class="sb-setup">
        <div class="card"><div class="f2"><label>대회 · 경기<input id="sbTitle" maxlength="40" value="${esc(G.title)}" placeholder="예: 공주알밤배 3R"></label><label>상대 팀<input id="sbOpp" maxlength="20" value="${esc(G.tm.them.name)}"></label></div>
        <div class="seg"><span>우리 공격</span><button type="button" data-a="first" data-f="us" class="${G.first === 'us' ? 'on' : ''}">선공 (초)</button><button type="button" data-a="first" data-f="them" class="${G.first === 'them' ? 'on' : ''}">후공 (말)</button></div>
        <div class="seg"><span>상대 타자</span><button type="button" data-a="recthem" data-v="1" class="${G.recThem ? 'on' : ''}">타순별로 기록</button><button type="button" data-a="recthem" data-v="0" class="${G.recThem ? '' : 'on'}">숫자만</button></div></div>
        <div class="card"><h3>우리 팀 타순 <small>누르는 순서대로 1번, 2번… · 다시 누르면 빠져요</small></h3>${last ? `<button type="button" class="big" data-a="lastln">지난 경기 타순 불러오기</button>` : ''}
        ${rosterPick(used)}
        ${G.tm.us.ln.length ? `<div class="lnlist">${G.tm.us.ln.map((sl, i) => `<div><i>${i + 1}</i><b>${esc(sl.ps[0].no)}</b> ${esc(sl.ps[0].name)}<select data-pos="${i}">${['', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'DH'].map(v => `<option value="${v}"${String(sl.ps[0].pos || '') === v ? ' selected' : ''}>${v ? v + ' ' + DIRPOS[v] : '수비'}</option>`).join('')}</select></div>`).join('')}</div>` : ''}</div>
        ${G.recThem ? oppSetupHtml() : ''}
        <p class="hint">${esc(ui.msg || '상대 팀 명단이 없으면 비워 두고, 경기 중에 타자가 나올 때 배번만 넣어도 돼요.')}</p>
        <button type="button" class="big pri" data-a="start">${G.begun ? '기록으로 돌아가기' : '⚾ 기록 시작'}</button></div>`;
    }
    function oppSetupHtml() {
        const name = G.tm.them.name, list = oppList(name), used = {};
        G.tm.them.ln.forEach((sl, i) => { used[sl.ps[0].no + '|' + sl.ps[0].name] = i + 1; });
        return `<div class="card"><h3>${esc(name)} 선수 명단 <small>저장해 두면 다음에 같은 팀을 만날 때 자동으로 불러와요</small></h3>
        ${list.length ? `<div class="plist pick">${list.map(q => { const n = used[q.no + '|' + q.name]; return `<button type="button" data-a="lnpick" data-t="them" data-no="${esc(q.no)}" data-name="${esc(q.name)}" class="${n ? 'on' : ''}">${n ? `<i>${n}</i>` : ''}<b>${esc(q.no)}</b>${esc(q.name)}</button>`; }).join('')}</div><p class="hint">누르는 순서대로 상대 타순이 돼요. 타순을 모르면 그냥 두고 경기 중에 넣어도 돼요.</p>` : ''}
        <label>명단 넣기 — 한 줄에 한 명 「배번 이름」<textarea id="sbOppText" rows="4" placeholder="9 박태윤&#10;14 임시호&#10;20 구하준"></textarea></label>
        <div class="f2" style="margin-top:6px"><button type="button" class="big" data-a="oppadd">명단에 더하기</button><button type="button" class="big" data-a="oppclear">명단 비우기</button></div></div>`;
    }
    function viewHtml() {
        return `${topBar('📋 ' + (G.title || '경기') + ' · vs ' + G.tm.them.name)}<div class="sb-view"><p class="hint">${esc(G.date)}${G.place ? ' · ' + esc(G.place) : ''}</p>${boardHtml(false)}<h3>${esc(G.tm.us.name)}</h3>${sheetHtml('us', true)}${G.recThem ? `<h3>${esc(G.tm.them.name)}</h3>${sheetHtml('them', true)}` : ''}<p class="hint">초록 안타 · 파랑 4구·사구 · 빨강 삼진 · 회색 아웃 · // 이닝 끝 · 작은 숫자는 타점</p>${canRecord() && ui.canEdit ? `<button type="button" class="big" data-a="reopen">✏️ 이 기록 고치기</button>` : ''}</div>`;
    }

    // ---------- 누르기 ----------
    function bind(r) {
        r.addEventListener('click', e => {
            const el = e.target.closest('[data-a]'); if (!el || !r.contains(el)) return;
            const a = el.dataset.a;
            if (a === 'panel-x') { if (e.target.closest('[data-stop]') && !e.target.closest('button[data-a="panel-x"]')) return; ui.panel = (G && G.done && (ui.panel === 'sheet' || ui.panel === 'board')) ? 'finish' : ''; ui.who = null; draw(); return; }
            act(a, el);
        });
        r.addEventListener('change', e => { const s = e.target.closest('select[data-pos]'); if (s && G) { G.tm.us.ln[+s.dataset.pos].ps[0].pos = s.value; save(); } });
        // D안: 누른 채 밀기
        let held = null, wh = null, pick = null;
        r.addEventListener('pointerdown', e => {
            const b = e.target.closest('[data-drag]'); if (!b) return;
            e.preventDefault(); held = b; b.classList.add('held'); try { b.setPointerCapture(e.pointerId); } catch (x) {}
            const pad = b.closest('.sb-pad'), rc = pad.getBoundingClientRect();
            let x = e.clientX - rc.left, y = e.clientY - rc.top; x = Math.max(165, Math.min(rc.width - 165, x));
            wh = document.createElement('div'); wh.className = 'sb-wheel'; wh.style.left = x + 'px'; wh.style.top = y + 'px';
            wh.innerHTML = '<i class="hub">' + esc(KIND[b.dataset.drag].n) + '</i>' + WH.map(w => '<span data-d="' + w[0] + '" style="left:' + w[1] + 'px;top:' + w[2] + 'px">' + w[0] + '</span>').join('') + '<em>밀어서 방향</em>';
            pad.appendChild(wh); pick = null;
        });
        r.addEventListener('pointermove', e => {
            if (!held || !wh) return; let best = null, bd = 1e9;
            wh.querySelectorAll('span').forEach(sp => { const q = sp.getBoundingClientRect(), d = Math.hypot(e.clientX - (q.left + q.width / 2), e.clientY - (q.top + q.height / 2)); if (d < bd) { bd = d; best = sp; } sp.classList.remove('hot'); });
            if (best && bd < 46) { best.classList.add('hot'); pick = best.dataset.d; wh.querySelector('em').textContent = pick + KIND[held.dataset.drag].s; } else { pick = null; wh.querySelector('em').textContent = '밀어서 방향'; }
        });
        const end = () => { if (!held) return; const k = held.dataset.drag, d = pick; held.classList.remove('held'); if (wh) wh.remove(); held = null; wh = null; pick = null; if (d) record(k, d); else { ui.msg = '누른 채 방향 쪽으로 밀고 떼면 기록돼요'; draw(); } };
        r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
    }
    function act(a, el) {
        const d = el.dataset;
        if (a === 'close') { if (ui.sending) return; if (G && ui.screen !== 'view') save(); close(); return; }
        if (!G) return;
        if (a === 'k') { const K = KIND[d.k]; if (K.d) { ui.pick = (ui.pick === d.k ? null : d.k); draw(); } else record(d.k); return; }
        if (a === 'd') { if (!ui.pick) { ui.msg = '먼저 결과(안타 · 땅볼…)를 눌러 주세요'; draw(); return; } record(ui.pick, d.d); return; }
        if (a === 'kd') { ui.dir = null; record(d.k, d.d); return; }
        if (a === 'more') { ui.more = !ui.more; draw(); return; }
        if (a === 'dfirst') { ui.dir = d.d; draw(); return; }
        if (a === 'dirx') { ui.dir = null; draw(); return; }
        if (a === 'undo') return undo();
        if (a === 'run') return addRun(d.t);
        if (a === 'ro') return runnerOut();
        if (a === 'end') { endHalf(false); ui.msg = '공수교대 · ' + halfLabel(G.cur.t, G.cur.i); save(); draw(); return; }
        if (a === 'run+' || a === 'run-') return setRun(d.t, +d.i, a === 'run+' ? 1 : -1);
        if (a === 'adj') return adj('them', d.k, +d.n);
        if (a === 'adj2') return adj(d.t, d.k, +d.n);
        if (a === 'board' || a === 'menu' || a === 'sheet' || a === 'finish') { if (a === 'finish') { G.done = true; save(); } ui.panel = a; draw(); return; }
        if (a === 'mode') { lsSet(LSM, d.m); ui.panel = ''; ui.pick = null; draw(); return; }
        if (a === 'togthem') { G.recThem = !G.recThem; if (G.recThem && !G.tm.them.ln.length) G.tm.them.ln = Array.from({ length: 9 }, () => ({ ps: [{ no: '', name: '', pos: '' }] })); ui.panel = ''; save(); draw(); return; }
        if (a === 'sheett') { ui.sheetT = d.t; draw(); return; }
        if (a === 'cell') { ui.edit = +d.id; ui.pick = null; if (ui.panel === 'sheet') ui.panel = ''; const e = G.log.find(x => x.id === ui.edit); if (e && !ui.sheetT) ui.sheetT = e.t; draw(); return; }
        if (a === 'cellempty') { if (el.querySelector('.sy')) return; if (d.t !== G.cur.t) return; G.cur.i = +d.i; G.cur.s = +d.s; G.nx[d.t] = G.cur.s; ui.edit = null; ui.msg = d.i + '회 ' + d.s + '번 칸부터 기록해요'; if (ui.panel === 'sheet') ui.panel = ''; save(); draw(); return; }
        if (a === 'editoff') { ui.edit = null; ui.pick = null; draw(); return; }
        if (a === 'del') { const ix = G.log.findIndex(x => x.id === ui.edit); if (ix >= 0) G.log.splice(ix, 1); ui.edit = null; ui.msg = '그 칸을 지웠어요'; save(); draw(); return; }
        if (a === 'who') { ui.who = { t: d.t, s: +d.s, p: +d.p, sub: false }; ui.panel = 'who'; draw(); return; }
        if (a === 'sub') { const t = G.cur.t; ui.who = { t: t, s: G.cur.s, p: slotOf(t, G.cur.s).ps.length - 1, sub: true }; ui.panel = 'who'; draw(); return; }
        if (a === 'whopick') { const n = document.getElementById('sbNo'), m = document.getElementById('sbName'); if (n) n.value = d.no; if (m) m.value = d.name; return; }
        if (a === 'whosave') {
            const w = ui.who, sl = slotOf(w.t, w.s);
            const p = { no: (document.getElementById('sbNo').value || '').replace(/[^0-9]/g, '').slice(0, 3), name: (document.getElementById('sbName').value || '').trim().slice(0, 10), pos: document.getElementById('sbPos').value };
            if (w.sub) { if (!p.no && !p.name) { ui.msg = '바꿔 들어갈 선수의 배번이나 이름을 넣어 주세요'; } else { sl.ps.push(p); push({ y: 'sub', t: w.t, s: w.s }); ui.msg = '🔁 ' + w.s + '번 교체 · ' + (p.name || '#' + p.no); } }
            else sl.ps[w.p] = p;
            if (w.t === 'them' && (p.no || p.name)) { const cur = oppList(G.tm.them.name); if (!cur.some(c => c.no === p.no && c.name === p.name)) { cur.push({ no: p.no, name: p.name, pos: '' }); oppSet(G.tm.them.name, cur); G.oppDirty = true; } }
            ui.panel = ''; ui.who = null; save(); draw(); return;
        }
        if (a === 'lineup') { ui.panel = ''; ui.screen = 'setup'; draw(); return; }
        if (a === 'send') return send();
        if (a === 'resume') { G.done = false; ui.panel = ''; save(); draw(); return; }
        if (a === 'reopen') { ui.screen = 'game'; ui.panel = 'finish'; draw(); return; }
        // 준비 화면
        if (a === 'first') { keepSetup(); G.first = d.f; draw(); return; }
        if (a === 'recthem') { keepSetup(); G.recThem = d.v === '1'; draw(); return; }
        if (a === 'gtab') { keepSetup(); ui.gTab = d.g; draw(); return; }
        if (a === 'gopen') { keepSetup(); const o = ui.gOpen || []; const k = o.indexOf(d.g); if (k === -1) o.push(d.g); else o.splice(k, 1); ui.gOpen = o; draw(); return; }
        if (a === 'gchip') { keepSetup(); const o = ui.gOn || []; const k = o.indexOf(d.g); if (k === -1) o.push(d.g); else o.splice(k, 1); ui.gOn = o; draw(); return; }
        if (a === 'lastln') { keepSetup(); const l = lastLineup(); if (l && !G.begun) G.tm.us.ln = l; draw(); return; }
        if (a === 'lnpick') {
            keepSetup();
            const tt = d.t === 'them' ? 'them' : 'us', L = G.tm[tt].ln;
            const ix = L.findIndex(sl => sl.ps[0].no === d.no && sl.ps[0].name === d.name);
            if (G.begun) { ui.msg = '경기 중에는 「🔁 교체」나 기록표의 이름 칸을 눌러 바꿔 주세요'; draw(); return; }
            if (ix >= 0) L.splice(ix, 1); else if (L.length < 12) L.push({ ps: [{ no: d.no, name: d.name, pos: '' }] });
            draw(); return;
        }
        if (a === 'oppadd') {
            keepSetup(); const ta = document.getElementById('sbOppText'), add = oppParse(ta ? ta.value : '');
            if (!add.length) { ui.msg = '「9 박태윤」처럼 한 줄에 한 명씩 적어 주세요'; draw(); return; }
            const cur = oppList(G.tm.them.name); add.forEach(q => { if (!cur.some(c => c.no === q.no && c.name === q.name)) cur.push(q); });
            cur.sort((x, y) => (Number(x.no) || 999) - (Number(y.no) || 999)); oppSet(G.tm.them.name, cur); G.oppDirty = true;
            ui.msg = G.tm.them.name + ' 선수 ' + cur.length + '명 저장했어요'; draw(); return;
        }
        if (a === 'oppclear') { keepSetup(); oppSet(G.tm.them.name, []); if (!G.begun) G.tm.them.ln = []; G.oppDirty = true; ui.msg = '명단을 비웠어요'; draw(); return;
        }
        if (a === 'start') { keepSetup(); if (G.begun) { ui.screen = 'game'; save(); draw(); } else startGame(); return; }
    }
    function keepSetup() { const t = document.getElementById('sbTitle'), o = document.getElementById('sbOpp'); if (t) G.title = t.value.trim().slice(0, 40); if (o) { const nn = o.value.trim().slice(0, 20) || '상대'; if (nn !== G.tm.them.name) { G.tm.them.name = nn; if (!G.begun) G.tm.them.ln = []; } } }

    // ---------- 보내기 ----------
    function bodyOf() { return JSON.stringify({ v: G.v, id: G.id, ev: G.ev, date: G.date, title: G.title, place: G.place, start: G.start, first: G.first, recThem: G.recThem, tm: G.tm, log: G.log.map(e => { const o = Object.assign({}, e); delete o.pc; return o; }), runs: G.runs, adj: G.adj, cur: G.cur, nx: G.nx, seq: G.seq, begun: true, done: true }); }
    function sig(b) { let h = 0; for (let k = 0; k < b.length; k++) h = (h * 31 + b.charCodeAt(k)) | 0; return b.length + ':' + h; }
    async function send() {
        if (!G || ui.sending) return;
        G.done = true; save();
        const body = bodyOf(), us = total('us'), th = total('them');
        if (body.length > 150000) { note('fail', '기록이 너무 길어서 못 보냈캉…', '개발자에게 알려 주세요.'); return; }
        ui.sending = true;
        note('saving', '경기 기록 보내는 중이캉');
        try {
            await postApi({ action: 'saveGameRecord', rec: { id: G.id, eventId: G.ev, date: G.date, title: G.title, opp: G.tm.them.name, us: us, them: th, setResult: !!G.ev, json: body, oppTeam: { name: G.tm.them.name, players: oppList(G.tm.them.name) } } });
            let ok = false;   // POST 는 답을 못 읽으니, 잠깐 뒤 읽어서 들어갔는지 확인
            for (let k = 0; k < 3 && !ok; k++) {
                await new Promise(res => setTimeout(res, 2500 + k * 2000));
                try { const rj = await fetch(apiGetUrl('action=gameRecord&id=' + encodeURIComponent(G.id)), { cache: 'no-store' }).then(x => x.json()); ok = !!(rj && rj.result === 'success' && rj.json === body); } catch (e) {}
            }
            if (!ok) throw new Error('서버 확인이 안 됐어요. 인터넷을 확인하고 다시 보내 주세요.');
            G.sentAt = Date.now(); G.sentSig = sig(body); save();
            if (G.ev && recIds.indexOf(G.ev) === -1) recIds.push(G.ev);
            try { const ev = schedEvents.find(x => x.id === G.ev); if (ev) ev.result = (us > th ? '승 ' : us < th ? '패 ' : '무 ') + us + ':' + th; } catch (e) {}
            note('done', '경기 기록 저장 완료캉! ✓');
            ui.sending = false; ui.msg = '서버에 저장했어요'; draw();
        } catch (err) { ui.sending = false; note('fail', '아직 못 보냈캉…', err.message + ' (기록은 휴대폰에 그대로 있어요)'); }
    }

    // ---------- 바깥에서 부르는 것 ----------
    function canRecord() { try { return isAuthValid() && (currentRole === 'super' || currentRole === 'dev'); } catch (e) { return false; } }
    function canView() { try { return isAuthValid(); } catch (e) { return false; } }   // v2.153.1: 학부모도 기록표를 봄 (상대 팀 이름은 서버가 빼고 줌)
    function open(evId) {
        const ev = evId ? schedEvents.find(x => x.id === evId) : null;
        const loc = evId ? localFor(evId) : null;
        ui = { screen: 'setup', pick: null, edit: null, sheetT: null, panel: '', msg: '', who: null };
        if (loc && load(loc.id)) { G = load(loc.id); G.log.forEach(e => { if (!e.pc) e.pc = { cur: Object.assign({}, G.cur), nx: Object.assign({}, G.nx) }; }); ui.screen = G.begun ? 'game' : 'setup'; if (G.done) ui.panel = 'finish'; }
        else G = newGame(ev);
        if (!G.begun && !G.tm.them.ln.length && oppList(G.tm.them.name).length === 0) { /* 명단 없음 — 서버에 있으면 가져옴 */ }
        draw(); oppFetch();
    }
    async function view(evId) {
        ui = { screen: 'view', pick: null, edit: null, sheetT: null, panel: '', msg: '', who: null, canEdit: false };
        const loc = localFor(evId);
        if (loc && loc.bg && load(loc.id)) { G = load(loc.id); ui.canEdit = true; draw(); return; }
        note('saving', '기록표 불러오는 중이캉');
        try {
            const rj = await fetch(apiGetUrl('action=gameRecord&id=' + encodeURIComponent(evId)), { cache: 'no-store' }).then(x => x.json());
            if (!rj || rj.result !== 'success') throw new Error('저장된 기록표가 없어요.');
            G = JSON.parse(rj.json); G.sentAt = G.sentAt || 1; G.sentSig = sig(rj.json); G.begun = true;
            if (canRecord()) { G.log.forEach(e => { e.pc = { cur: Object.assign({}, G.cur), nx: Object.assign({}, G.nx) }; }); save(); ui.canEdit = true; }
            note('done', '기록표 가져왔캉! ✓'); draw();
        } catch (err) { note('fail', null, err.message); G = null; }
    }
    function hasRecord(evId) { const l = localFor(evId); return !!(l && l.bg) || recIds.indexOf(evId) !== -1; }
    // 일정 상세 안 버튼
    function detailHtml(ev) {
        if (!ev || typeof isGameEvent !== 'function' || !isGameEvent(ev)) return '';
        const id = esc(ev.id), loc = localFor(ev.id), has = hasRecord(ev.id);
        let h = '';
        if (canRecord()) h += `<button type="button" class="sb-entry" onclick="closeModal('eventDetailModal');SB.open('${id}')">📝 ${loc ? (loc.done ? '기록 고치기 · 보내기' : '경기 기록 이어서 하기') : '경기 기록하기'}</button>`;
        if (has && canView()) h += `<button type="button" class="sb-entry ghost" onclick="closeModal('eventDetailModal');SB.view('${id}')">📋 기록표 보기</button>`;
        return h ? `<div class="sb-entrybox">${h}</div>` : '';
    }
    // 경기 날 맨 위 띠
    function band() {
        let el = document.getElementById('sbBand');
        try {
            if (!canRecord() || typeof schedEvents === 'undefined') { if (el) el.style.display = 'none'; return; }
            const d = new Date(), today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            const open = index().find(x => !x.sent && x.date >= today.slice(0, 8) + '01' && load(x.id) && load(x.id).begun);
            const games = schedEvents.filter(ev => ev.date === today && isGameEvent(ev)).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
            const g = games.find(ev => { const l = localFor(ev.id); return !l || !l.sent; });
            const anchor = document.getElementById('mainTabs');
            if (!anchor || (!g && !open)) { if (el) el.style.display = 'none'; return; }
            if (!el) { el = document.createElement('div'); el.id = 'sbBand'; el.className = 'sb-band'; anchor.parentNode.insertBefore(el, anchor); }
            el.style.display = anchor.style.display === 'none' ? 'none' : 'flex';
            const tgt = g ? g.id : open.ev, loc = g ? localFor(g.id) : open;
            const label = g ? ('오늘 ' + (g.start || '') + ' vs ' + (g.opponent || '경기')) : ('기록 중 · vs ' + (open.opp || ''));
            el.innerHTML = `<span>⚾ ${esc(label)}</span><button type="button" onclick="SB.open('${esc(tgt)}')">📝 ${loc ? (loc.done ? '확인 · 보내기' : '이어서 기록') : '기록 시작'}</button>`;
        } catch (e) { if (el) el.style.display = 'none'; }
    }
    function setRecIds(a) { if (Array.isArray(a)) recIds = a.slice(); }

    window.SB = { open, view, band, detailHtml, hasRecord, setRecIds, canRecord, _state: () => G };
})();
