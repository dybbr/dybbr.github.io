// ==========================================================
// 📊 선수 기록 (v2.155.0 · 하코 선택 A+B) — 대표님이 보낸 경기 기록으로 타율 · 출루율 · 장타율 · OPS 계산
//   A: 선수 화면(player.html) 안 「시즌 기록」 카드 — 로그인한 사람 모두
//   B: 관리 탭 「📊 선수 기록」 팀 순위표 — 운영진(대표님 · 개발자 · 코치진 · 총무님)만
//   서버 v2.47.0 gameStats 한 번에 받음 → 기기에 저장, 서버 번호(gameRecVer)가 같으면 다시 안 물음
//   서버가 아직 v2.46.0 이면 경기마다 gameRecord 로 받아서 계산 (경기 수만큼 요청 · 처음 한 번)
// ==========================================================
(function () {
    'use strict';
    const LS = 'daeyeon_ps_cache';
    const HIT = { H1: 1, IH: 1, H2: 2, H3: 3, HR: 4, IHR: 4 }, NOAB = { BB: 1, HP: 1, SF: 1, SH: 1 };
    const SY = { H1: '안', IH: '내안', H2: '2', H3: '3', HR: '홈', IHR: 'GH', BB: '4구', HP: '사구', K: 'K', GO: '땅', FO: '플', LO: '직', E: '실', SF: '희플', SH: '희번', FC: '야선', FF: '파플', KN: 'K(낫아웃)', KR: 'K(낫아웃 출루)', DP: '병살' };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const f3 = x => x >= 1 ? x.toFixed(3) : x.toFixed(3).slice(1);
    function role() { try { return localStorage.getItem('daeyeon_admin_role') || sessionStorage.getItem('daeyeon_admin_role') || ''; } catch (e) { return ''; } }
    function isStaff() { const r = (typeof currentRole !== 'undefined' && currentRole) || role(); return ['super', 'dev', 'sub', 'general'].indexOf(r) !== -1; }
    function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) {} }
    function snapData() { try { const s = JSON.parse(localStorage.getItem('daeyeon_snap') || 'null'); return s && s.data ? s.data : {}; } catch (e) { return {}; } }
    function curVer() { const d = snapData(); return { ver: d.gameRecVer || '', ids: Array.isArray(window.SB_REC_IDS) ? window.SB_REC_IDS : (Array.isArray(d.gameRecs) ? d.gameRecs : []) }; }

    // 예전 서버: 경기마다 받아서 같은 모양으로
    function slim(id, j) {
        const g = JSON.parse(j);
        return { id: g.id || id, ev: g.ev, date: g.date, title: g.title, opp: (g.tm && g.tm.them && g.tm.them.name) || '', ln: ((g.tm && g.tm.us && g.tm.us.ln) || []).map(sl => ({ ps: (sl.ps || []).map(q => ({ no: q.no, name: q.name })) })), log: (g.log || []).filter(e => e.t === 'us' && e.y !== 'end') };
    }
    let loading = null;
    function load(force) {
        const v = curVer(), c = lsGet();
        if (!force && c && Array.isArray(c.recs) && (v.ver ? c.ver === v.ver : (c.ids || []).join() === v.ids.join() && c.recs.length)) return Promise.resolve(c.recs);
        if (loading) return loading;
        loading = apiGetJson('action=gameStats').then(r => {
            if (r && r.result === 'success' && Array.isArray(r.recs)) { lsSet({ ver: r.ver || v.ver, ids: v.ids, recs: r.recs }); return r.recs; }
            if (r && r.result === 'error' && /로그인|권한|인증/.test(r.message || '')) throw new Error(r.message);   // 일반 열람자 등
            // 서버 v2.46.0 — 경기마다
            const ids = v.ids.slice(), old = (c && c.recs) || [];
            return Promise.all(ids.map(id => apiGetJson('action=gameRecord&id=' + encodeURIComponent(id)).then(x => (x && x.result === 'success') ? slim(id, x.json) : null).catch(() => old.find(o => o.ev === id) || null)))
                .then(list => { const recs = list.filter(Boolean); lsSet({ ver: v.ver, ids: ids, recs: recs }); return recs; });
        }).finally(() => { loading = null; });
        return loading;
    }

    function calc(recs) {
        const P = {};
        recs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((g, gi) => {
            const who = (s, p) => { const sl = g.ln[s - 1]; const q = sl && sl.ps && sl.ps[p]; return q ? q : null; };
            const get = q => { const key = String(q.no || '') + '|' + String(q.name || ''); return P[key] = P[key] || { no: q.no || '', name: q.name || '', pa: 0, ab: 0, h: 0, h2: 0, h3: 0, hr: 0, ihr: 0, rbi: 0, r: 0, sb: 0, cs: 0, bb: 0, hp: 0, k: 0, sf: 0, tb: 0, dirs: {}, games: [] }; };
            const gm = q => { const x = get(q); let r = x.games.find(y => y.id === g.id); if (!r) { r = { id: g.id, date: g.date, opp: g.opp, ab: 0, h: 0, rbi: 0, r: 0, res: [] }; x.games.push(r); } return r; };
            (g.log || []).forEach(e => {
                if (e.y === 'pa') {
                    const q = who(e.s, e.p); if (!q || (!q.no && !q.name)) return;
                    const x = get(q), G = gm(q), k = e.k;
                    x.pa++; x.rbi += e.r || 0; G.rbi += e.r || 0;
                    if (!NOAB[k]) { x.ab++; G.ab++; }
                    if (HIT[k]) { x.h++; G.h++; x.tb += HIT[k]; if (k === 'H2') x.h2++; if (k === 'H3') x.h3++; if (k === 'HR') x.hr++; if (k === 'IHR') x.ihr++; if (e.d) x.dirs[e.d] = (x.dirs[e.d] || 0) + 1; }
                    if (k === 'BB') x.bb++; if (k === 'HP') x.hp++; if (k === 'K' || k === 'KN' || k === 'KR') x.k++; if (k === 'SF') x.sf++;
                    G.res.push({ t: (SY[k] && ['BB', 'HP', 'K', 'KN', 'KR'].indexOf(k) === -1 ? (e.d || '') + (e.w ? '월' : '') + (e.n ? '선' : '') : '') + (SY[k] || k), h: !!HIT[k] });
                } else if (e.y === 'run' && e.sc) { const q = who(e.sc.s, e.sc.p); if (q) { get(q).r++; gm(q).r++; } }
                else if (e.y === 'sb' || e.y === 'cs') { const q = who(e.s, e.p); if (q) get(q)[e.y]++; }
            });
        });
        Object.values(P).forEach(q => {
            q.avg = q.ab ? q.h / q.ab : 0;
            const den = q.ab + q.bb + q.hp + q.sf; q.obp = den ? (q.h + q.bb + q.hp) / den : 0;
            q.slg = q.ab ? q.tb / q.ab : 0; q.ops = q.obp + q.slg; q.hrAll = q.hr + q.ihr;
        });
        return { players: Object.values(P), nGames: recs.length };
    }

    // ---------- A: 선수 카드 ----------
    function field(dirs) {
        const pos = { 좌: [70, 70], 좌중: [120, 40], 중: [170, 30], 우중: [220, 40], 우: [270, 70], 유: [125, 118], 3: [95, 150], 2: [215, 118], 1: [245, 150], 투: [170, 160], 포: [170, 200] };
        const mx = Math.max(1, ...Object.values(dirs));
        let s = '<svg class="ps-fld" viewBox="0 0 340 232" role="img" aria-label="타구 방향"><path d="M170 215 L20 75 Q170 -40 320 75 Z" class="g"/><path d="M170 215 L95 145 L170 75 L245 145 Z" class="d"/>';
        for (const d in pos) { const [x, y] = pos[d], n = dirs[d] || 0, r = n ? 12 + 14 * n / mx : 9; s += `<circle cx="${x}" cy="${y}" r="${r}" class="${n ? 'on' : 'off'}" style="${n ? 'fill-opacity:' + (0.4 + 0.5 * n / mx).toFixed(2) : ''}"/><text x="${x}" y="${y + 5}" text-anchor="middle" class="${n ? 'on' : 'off'}">${n || d}</text>`; }
        return s + '<text x="170" y="230" text-anchor="middle" class="cap">숫자 = 그 방향 안타 수</text></svg>';
    }
    function cardHtml(q, nG) {
        if (!q || !q.pa) return `<div class="ps-card"><div class="ps-h">📊 시즌 기록</div><p class="ps-empty">아직 기록된 타석이 없어요. 대표님이 경기 기록을 보내면 여기에 저절로 쌓여요.</p></div>`;
        const gl = q.games.slice().reverse().map(g => `<tr><td>${esc(String(g.date).slice(5).replace('-', '.'))}</td><td>${esc(g.opp)}</td><td class="n">${g.ab}-${g.h}</td><td class="n">${g.rbi}</td><td class="rs">${g.res.map(r => `<span class="${r.h ? 'h' : ''}">${esc(r.t)}</span>`).join('')}</td></tr>`).join('');
        return `<div class="ps-card"><div class="ps-h">📊 시즌 기록 <small>${q.games.length}경기 · ${q.pa}타석</small></div>
            <div class="ps-big"><div class="m"><span>타율</span><b>${f3(q.avg)}</b></div><div><span>출루율</span><b>${f3(q.obp)}</b></div><div><span>장타율</span><b>${f3(q.slg)}</b></div><div><span>OPS</span><b>${f3(q.ops)}</b></div></div>
            <div class="ps-cnt"><div><b>${q.h}</b>안타</div><div><b>${q.h2}</b>2루타</div><div><b>${q.h3}</b>3루타</div><div><b>${q.hrAll}</b>홈런${q.ihr ? `<i>GH ${q.ihr}</i>` : ''}</div><div><b>${q.rbi}</b>타점</div><div><b>${q.r}</b>득점</div><div><b>${q.sb}</b>도루</div><div><b>${q.bb + q.hp}</b>4사구</div></div>
            <div class="ps-sub">타구 방향</div>${field(q.dirs)}
            <div class="ps-sub">경기별 기록</div><div class="ps-tw"><table class="ps-gl"><tr><th>날짜</th><th>상대</th><th>타수-안타</th><th>타점</th><th>타석 결과</th></tr>${gl}</table></div>
            <p class="ps-note">타율 = 안타 ÷ 타수 · OPS = 출루율 + 장타율. 득점 · 도루는 11월 23일 이후 기록부터 세요.</p></div>`;
    }
    function findP(st, no, name) { return st.players.find(q => String(q.no) === String(no) && q.name === name) || st.players.find(q => q.name === name) || null; }
    function mountCard(box, p) {
        if (!box || !p) return;
        if (role() === 'guest' || !(typeof getToken === 'function' && getToken())) return;
        box.innerHTML = '<div class="ps-card"><div class="ps-h">📊 시즌 기록</div><p class="ps-empty">불러오는 중…</p></div>';
        load(false).then(recs => { const st = calc(recs); box.innerHTML = cardHtml(findP(st, p.no, p.name), st.nGames); })
            .catch(() => { box.innerHTML = ''; });
    }

    // ---------- B: 팀 순위표 (운영진) ----------
    const SORTS = [['avg', '타율', 1], ['ops', 'OPS', 1], ['rbi', '타점', 0], ['h', '안타', 0], ['obp', '출루율', 1], ['r', '득점', 0], ['sb', '도루', 0], ['hrAll', '홈런', 0]];
    let rk = { sort: 'avg', st: null, open: null };
    function rankHtml() {
        const st = rk.st, reg = st.nGames * 2, sd = SORTS.find(x => x[0] === rk.sort) || SORTS[0];
        const rate = sd[2];
        const L = st.players.slice().sort((a, b) => (rate ? (b.pa >= reg) - (a.pa >= reg) : 0) || b[sd[0]] - a[sd[0]] || b.pa - a.pa);
        let n = 0;
        const cols = [['avg', '타율', 1], ['g', '경기'], ['pa', '타석'], ['ab', '타수'], ['h', '안타'], ['h2', '2루타'], ['h3', '3루타'], ['hrAll', '홈런'], ['rbi', '타점'], ['r', '득점'], ['sb', '도루'], ['bbhp', '4사구'], ['k', '삼진'], ['obp', '출루율', 1], ['slg', '장타율', 1], ['ops', 'OPS', 1]];
        const val = (q, c) => c[0] === 'g' ? q.games.length : c[0] === 'bbhp' ? q.bb + q.hp : c[2] ? f3(q[c[0]]) : q[c[0]];
        const rows = L.map(q => { const ok = !rate || q.pa >= reg; if (ok) n++; return `<tr class="${ok ? '' : 'low'}" data-ps="${esc(q.no + '|' + q.name)}"><td class="rn">${ok ? n : '-'}</td><td class="st">${esc(q.no)} ${esc(q.name)}</td>${cols.map(c => `<td class="${c[0] === rk.sort ? 'srt' : ''}">${val(q, c)}</td>`).join('')}</tr>`; }).join('');
        const open = rk.open ? st.players.find(q => q.no + '|' + q.name === rk.open) : null;
        return `<div class="ps-top"><button type="button" data-ps-x="1" aria-label="닫기">✕</button><b>📊 선수 기록</b><small>${st.nGames}경기 · 운영진만 보여요</small></div>
            <div class="ps-body"><div class="ps-tabs">${SORTS.map(s => `<button type="button" class="${s[0] === rk.sort ? 'on' : ''}" data-ps-s="${s[0]}">${s[1]}</button>`).join('')}</div>
            ${st.players.length ? `<div class="ps-tw"><table class="ps-rk"><tr><th></th><th class="st">선수</th>${cols.map(c => `<th class="${c[0] === rk.sort ? 'srt' : ''}">${c[1]}${c[0] === rk.sort ? ' ▼' : ''}</th>`).join('')}</tr>${rows}</table></div>` : '<p class="ps-empty">아직 보낸 경기 기록이 없어요.</p>'}
            <p class="ps-note">${rate ? `비율 기록(타율 · 출루율 · OPS)은 경기당 2타석 이상(${reg}타석)인 선수만 순위를 매기고, 나머지는 흐리게 보여요. ` : ''}이름을 누르면 그 선수 카드가 열려요. 학부모님 화면에는 순위표가 없고, 선수 화면에 우리 아이 카드만 보여요.</p>
            ${open ? `<div class="ps-pop" data-ps-c="1"><div class="ps-popin"><div class="ps-poph"><b>${esc(open.no)} ${esc(open.name)}</b><button type="button" data-ps-c="1">닫기</button></div>${cardHtml(open, st.nGames)}</div></div>` : ''}</div>`;
    }
    function drawRank() { const el = document.getElementById('psRank'); if (el && rk.st) el.innerHTML = rankHtml(); }
    function openRank() {
        let el = document.getElementById('psRank');
        if (!el) {
            el = document.createElement('div'); el.id = 'psRank'; el.className = 'ps-rank'; document.body.appendChild(el);
            el.addEventListener('click', ev => {
                const t = ev.target.closest('[data-ps-x],[data-ps-s],[data-ps-c],tr[data-ps]');
                if (!t) return;
                if (t.dataset.psX) { el.remove(); document.body.classList.remove('ps-open'); return; }
                if (t.dataset.psS) { rk.sort = t.dataset.psS; drawRank(); return; }
                if (t.dataset.psC) { if (t.classList.contains('ps-pop') && ev.target.closest('.ps-popin') && !ev.target.closest('button')) return; rk.open = null; drawRank(); return; }
                if (t.dataset.ps) { rk.open = t.dataset.ps; drawRank(); }
            });
        }
        document.body.classList.add('ps-open');
        el.innerHTML = '<div class="ps-top"><button type="button" data-ps-x="1">✕</button><b>📊 선수 기록</b></div><div class="ps-body"><p class="ps-empty">불러오는 중…</p></div>';
        load(false).then(recs => { rk.st = calc(recs); rk.open = null; drawRank(); })
            .catch(err => { el.querySelector('.ps-body').innerHTML = '<p class="ps-empty">기록을 못 받았어요. 인터넷을 확인하고 다시 열어 주세요.</p>'; });
    }

    window.PS = { load, calc, mountCard, openRank, isStaff, _cardHtml: cardHtml };
})();
