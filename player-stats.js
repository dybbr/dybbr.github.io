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
    const HIT = { H1: 1, IH: 1, H2: 2, H3: 3, HR: 4, IHR: 4, BH: 1 }, NOAB = { BB: 1, HP: 1, SF: 1, SH: 1 };
    const SY = { H1: '안', IH: '내안', H2: '2', H3: '3', HR: '홈', IHR: 'GH', BB: '4구', HP: '사구', K: 'K', GO: '땅', FO: '플', LO: '직', E: '실', SF: '희플', SH: '희번', FC: '야선', FF: '파플', KN: 'K(낫아웃)', KR: 'K(낫아웃 출루)', DP: '병살', BH: '번안', BO: '번아' };
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
        return { id: g.id || id, ev: g.ev, date: g.date, title: g.title, opp: (g.tm && g.tm.them && g.tm.them.name) || '', ln: ((g.tm && g.tm.us && g.tm.us.ln) || []).map(sl => ({ ps: (sl.ps || []).map(q => ({ no: q.no, name: q.name })) })), log: (g.log || []).filter(e => e.t === 'us' && e.y !== 'end'), pit: g.pit || [] };
    }
    let loading = null;
    function load(force) {
        const v = curVer(), c = lsGet();
        if (!force && c && Array.isArray(c.recs) && (c.pv || !c.recs.length) && (v.ver ? c.ver === v.ver : (c.ids || []).join() === v.ids.join() && c.recs.length)) return Promise.resolve(c.recs);
        if (loading) return loading;
        loading = apiGetJson('action=gameStats').then(r => {
            if (r && r.result === 'success' && Array.isArray(r.recs)) { lsSet({ ver: r.ver || v.ver, ids: v.ids, recs: r.recs, pv: r.recs.some(g => 'pit' in g) ? 2 : 0 }); return r.recs; }   // pv: 투수 기록(서버 v2.48.0)이 들어 있는 저장본
            if (r && r.result === 'error' && /로그인|권한|인증/.test(r.message || '')) throw new Error(r.message);   // 일반 열람자 등
            // 서버 v2.46.0 — 경기마다
            const ids = v.ids.slice(), old = (c && c.recs) || [];
            return Promise.all(ids.map(id => apiGetJson('action=gameRecord&id=' + encodeURIComponent(id)).then(x => (x && x.result === 'success') ? slim(id, x.json) : null).catch(() => old.find(o => o.ev === id) || null)))
                .then(list => { const recs = list.filter(Boolean); lsSet({ ver: v.ver, ids: ids, recs: recs, pv: 2 }); return recs; });
        }).finally(() => { loading = null; });
        return loading;
    }

    function calc(recs) {
        const P = {};
        recs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((g, gi) => {
            const who = (s, p) => { const sl = g.ln[s - 1]; const q = sl && sl.ps && sl.ps[p]; return q ? q : null; };
            const get = q => { const key = String(q.no || '') + '|' + String(q.name || ''); return P[key] = P[key] || { no: q.no || '', name: q.name || '', pa: 0, ab: 0, h: 0, h2: 0, h3: 0, hr: 0, ihr: 0, rbi: 0, r: 0, sb: 0, cs: 0, bb: 0, hp: 0, k: 0, sf: 0, sh: 0, tb: 0, dirs: {}, games: [] }; };
            const gm = q => { const x = get(q); let r = x.games.find(y => y.id === g.id); if (!r) { r = { id: g.id, date: g.date, opp: g.opp, ab: 0, h: 0, rbi: 0, r: 0, res: [] }; x.games.push(r); } return r; };
            (g.log || []).forEach(e => {
                if (e.y === 'pa') {
                    const q = who(e.s, e.p); if (!q || (!q.no && !q.name)) return;
                    const x = get(q), G = gm(q), k = e.k;
                    x.pa++; x.rbi += e.r || 0; G.rbi += e.r || 0;
                    if (!NOAB[k]) { x.ab++; G.ab++; }
                    if (HIT[k]) { x.h++; G.h++; x.tb += HIT[k]; if (k === 'H2') x.h2++; if (k === 'H3') x.h3++; if (k === 'HR') x.hr++; if (k === 'IHR') x.ihr++; if (e.d) x.dirs[e.d] = (x.dirs[e.d] || 0) + 1; }
                    if (k === 'BB') x.bb++; if (k === 'HP') x.hp++; if (k === 'K' || k === 'KN' || k === 'KR') x.k++; if (k === 'SF') x.sf++; if (k === 'SH') x.sh++;
                    G.res.push({ t: (SY[k] && ['BB', 'HP', 'K', 'KN', 'KR'].indexOf(k) === -1 ? (e.d || '') + (e.w ? '월' : '') + (e.n ? '선' : '') : '') + (SY[k] || k), h: !!HIT[k] });
                } else if (e.y === 'run' && e.sc) { const q = who(e.sc.s, e.sc.p); if (q) { get(q).r++; gm(q).r++; } }
                else if (e.y === 'sb' || e.y === 'cs') { const q = who(e.s, e.p); if (q) get(q)[e.y]++; }
            });
        });
        Object.values(P).forEach(q => {
            q.avg = q.ab ? q.h / q.ab : 0;
            const den = q.ab + q.bb + q.hp + q.sf; q.obp = den ? (q.h + q.bb + q.hp) / den : 0;
            q.slg = q.ab ? q.tb / q.ab : 0; q.ops = q.obp + q.slg; q.hrAll = q.hr + q.ihr;
            // v2.168.0 프로 지표 (지금 기록만으로 계산)
            const bip = q.ab - q.k - q.hrAll + q.sf, h1 = q.h - q.h2 - q.h3 - q.hrAll, wd = q.ab + q.bb + q.sf + q.hp;
            q.babip = bip > 0 ? (q.h - q.hrAll) / bip : 0; q.iso = q.slg - q.avg; q.xbh = q.h2 + q.h3 + q.hrAll;
            q.kp = q.pa ? q.k / q.pa : 0; q.bbp = q.pa ? (q.bb + q.hp) / q.pa : 0; q.bbk = q.k ? (q.bb + q.hp) / q.k : (q.bb + q.hp);
            q.woba = wd ? (0.69 * q.bb + 0.72 * q.hp + 0.89 * h1 + 1.27 * q.h2 + 1.62 * q.h3 + 2.1 * q.hrAll) / wd : 0;
            q.sbp = q.sb + q.cs ? q.sb / (q.sb + q.cs) : -1;
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
    const pc = x => Math.round(x * 100) + '%';
    const ad = (v, t, e) => `<div><b>${v}</b>${t}<i>${e}</i></div>`;
    // v2.168.0 더 깊은 타격 지표 — 같은 카드 모양, 칸 아래 쉬운 설명
    function advHtml(q) {
        return `<div class="ps-sub">더 깊은 기록 <small>프로야구 지표</small></div>
            <div class="ps-cnt ps-adv">${ad(f3(q.babip), 'BABIP', '앞으로 친 공이 안타 된 비율')}${ad(f3(q.iso), '순수장타율', '장타율 − 타율 · 멀리 치는 힘')}${ad(f3(q.woba), 'wOBA', '출루를 값어치대로 매긴 점수')}${ad(q.k ? q.bbk.toFixed(2) : String(q.bbk), '볼넷/삼진', '1 넘으면 눈이 좋은 타자')}
            ${ad(pc(q.kp), '삼진 비율', '타석 100번 중 삼진')}${ad(pc(q.bbp), '4사구 비율', '타석 100번 중 4사구')}${ad(q.xbh, '장타', '2루타 + 3루타 + 홈런')}${ad(q.sbp < 0 ? '-' : pc(q.sbp), '도루 성공률', `도루 ${q.sb} · 실패 ${q.cs}`)}</div>`;
    }
    function pitCard(x) {
        if (!x) return '';
        const ip = x.outs / 3, era = x.outs ? ((x.er || 0) * 9 / ip).toFixed(2) : '-', hbI = x.hbOuts / 3, kI = x.kOuts / 3;
        const whip = x.hbOuts ? ((x.hS + x.bbS) / hbI).toFixed(2) : '-', k9 = x.kOuts ? (x.kS * 9 / kI).toFixed(1) : '-', bb9 = x.hbOuts ? (x.bbS * 9 / hbI).toFixed(1) : '-';
        const oav = x.bfS - x.bfBB > 0 ? f3(x.bfH / (x.bfS - x.bfBB)) : '-', ppa = x.pcBf ? (x.pcN / x.pcBf).toFixed(1) : '-';
        return `<div class="ps-sub">⚾ 투수 기록 <small>${x.apps.length}경기 · ${ipT(x.outs)} 이닝</small></div>
            <div class="ps-big"><div class="m"><span>평균자책</span><b>${era}</b></div><div><span>WHIP</span><b>${whip}</b></div><div><span>피안타율</span><b>${oav}</b></div><div><span>9이닝 삼진</span><b>${k9}</b></div></div>
            <div class="ps-cnt ps-adv">${ad(ipT(x.outs), '이닝', '아웃 3개 = 1이닝')}${ad(x.pcK ? x.pcK : '-', '투구 수', x.pcK ? '넣은 경기만' : '아직 안 넣음')}${ad(x.bfS || '-', '상대 타자', '마주한 타자 수')}${ad(x.kOuts ? x.kS : '-', '삼진', '잡아낸 삼진')}
            ${ad(x.hbOuts ? x.bbS : '-', '4사구', '볼넷 + 몸에 맞는 공')}${ad(x.hbOuts ? x.hS : '-', '피안타', '맞은 안타')}${ad(x.r + ' / ' + (x.er || 0), '실점 / 자책', '자책 = 투수 책임 점수')}${ad(bb9, '9이닝 4사구', '적을수록 제구 좋음')}</div>
            <p class="ps-note">평균자책 = 9이닝 동안 내줄 자책점(실책 때문에 난 점수는 뺌). 11월 28일 전 경기는 실책 구분이 없어 모든 실점으로 셌어요. WHIP = 이닝마다 내보낸 주자(안타 + 4사구) · 1.30 아래면 좋은 편. 피안타율 = 상대 타자가 친 타율. 9이닝 삼진 = 9이닝 동안 잡을 삼진 수.${ppa !== '-' ? ` 타자 1명에 평균 ${ppa}구.` : ''}</p>`;
    }
    function cardHtml(q, nG, recs) {
        const pp = recs ? (q ? pitchers(recs).find(x => String(x.no) === String(q.no) && x.name === q.name) : null) : null;
        if (!q || !q.pa) return `<div class="ps-card"><div class="ps-h">📊 시즌 기록</div><p class="ps-empty">아직 기록된 타석이 없어요. 대표님이 경기 기록을 보내면 여기에 저절로 쌓여요.</p>${pitCard(pp)}</div>`;
        const gl = q.games.slice().reverse().map(g => `<tr><td>${esc(String(g.date).slice(5).replace('-', '.'))}</td><td>${esc(g.opp)}</td><td class="n">${g.ab}-${g.h}</td><td class="n">${g.rbi}</td><td class="rs">${g.res.map(r => `<span class="${r.h ? 'h' : ''}">${esc(r.t)}</span>`).join('')}</td></tr>`).join('');
        return `<div class="ps-card"><div class="ps-h">📊 시즌 기록 <small>${q.games.length}경기 · ${q.pa}타석</small></div>
            <div class="ps-big"><div class="m"><span>타율</span><b>${f3(q.avg)}</b></div><div><span>출루율</span><b>${f3(q.obp)}</b></div><div><span>장타율</span><b>${f3(q.slg)}</b></div><div><span>OPS</span><b>${f3(q.ops)}</b></div></div>
            <div class="ps-cnt"><div><b>${q.h}</b>안타</div><div><b>${q.h2}</b>2루타</div><div><b>${q.h3}</b>3루타</div><div><b>${q.hrAll}</b>홈런${q.ihr ? `<i>GH ${q.ihr}</i>` : ''}</div><div><b>${q.rbi}</b>타점</div><div><b>${q.r}</b>득점</div><div><b>${q.sb}</b>도루</div><div><b>${q.bb + q.hp}</b>4사구</div></div>
            ${advHtml(q)}${pitCard(pp)}
            <div class="ps-sub">타구 방향</div>${field(q.dirs)}
            <div class="ps-sub">경기별 기록</div><div class="ps-tw"><table class="ps-gl"><tr><th>날짜</th><th>상대</th><th>타수-안타</th><th>타점</th><th>타석 결과</th></tr>${gl}</table></div>
            <p class="ps-note">타율 = 안타 ÷ 타수 · OPS = 출루율 + 장타율. 득점 · 도루는 11월 23일 이후 기록부터 세요. 타석이 적을 땐 비율 지표가 크게 흔들려요.</p></div>`;
    }
    function findP(st, no, name) { return st.players.find(q => String(q.no) === String(no) && q.name === name) || st.players.find(q => q.name === name) || null; }
    function mountCard(box, p) {
        if (!box || !p) return;
        if (role() === 'guest' || !(typeof getToken === 'function' && getToken())) return;
        box.innerHTML = '<div class="ps-card"><div class="ps-h">📊 시즌 기록</div><p class="ps-empty">불러오는 중…</p></div>';
        load(false).then(recs => { const st = calc(recs); box.innerHTML = cardHtml(findP(st, p.no, p.name) || { no: p.no, name: p.name, pa: 0 }, st.nGames, recs); })
            .catch(() => { box.innerHTML = ''; });
    }


    // ---------- ⚾ v2.158.0 투수 · 쉬는 날 (투구 수를 넣었으면 그 수로, 안 넣었으면 상대 타자 수 × 4 · 이닝 × 16 으로 짐작) ----------
    //   대한유소년야구연맹 · KBSA 초등부 공식 투구 수 규정이 없어(2026 기준) 기준은 고칠 수 있게 — 처음 값은 리틀야구(9~12세) 표를 참고
    const LSR = 'daeyeon_pit_rule';
    const RULE0 = { b: [20, 35, 50, 65], max: 75, ppa: 4, pin: 16 };
    function rule() { try { const r = JSON.parse(localStorage.getItem(LSR) || 'null'); if (r && Array.isArray(r.b) && r.b.length === 4) return Object.assign({}, RULE0, r); } catch (e) {} return Object.assign({}, RULE0); }
    function restDays(n, R) { for (let i = 0; i < 4; i++) if (n <= R.b[i]) return i; return 4; }
    const ymd = t => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    function addDays(d, n) { const t = new Date(String(d).slice(0, 10) + 'T00:00:00'); if (isNaN(t)) return ''; t.setDate(t.getDate() + n); return ymd(t); }
    const today = () => ymd(new Date());
    const md = d => String(d || '').slice(5, 10).replace('-', '.');
    function pitchers(recs) {
        const R = rule(), P = {};
        recs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(g => (g.pit || []).forEach(p => {
            const key = String(p.no || '') + '|' + String(p.name || '');
            const x = P[key] = P[key] || { no: p.no || '', name: p.name || '', apps: [], days: {}, outs: 0, bf: 0, h: 0, bb: 0, k: 0, r: 0, pcs: 0, bfKnown: true, hbOuts: 0, hS: 0, bbS: 0, kOuts: 0, kS: 0, bfS: 0, bfH: 0, bfBB: 0, pcK: 0, pcN: 0, pcBf: 0 };
            const est = !(p.pc > 0), n = p.pc > 0 ? +p.pc : (p.bf != null ? p.bf * R.ppa : Math.round((p.outs || 0) / 3 * R.pin));
            x.apps.push({ date: String(g.date).slice(0, 10), opp: g.opp, outs: p.outs || 0, bf: p.bf, r: p.r || 0, pc: p.pc || 0, n, est });
            const d = String(g.date).slice(0, 10); x.days[d] = x.days[d] || { n: 0, est: false }; x.days[d].n += n; x.days[d].est = x.days[d].est || est;
            x.outs += p.outs || 0; x.r += p.r || 0; x.er = (x.er || 0) + Math.max(0, (p.r || 0) - (p.ue || 0)); x.pcs += n;
            if (p.bf == null) x.bfKnown = false; else { x.bf += p.bf; x.h += p.h || 0; x.bb += p.bb || 0; x.k += p.k || 0; }
            if (p.h != null && p.bb != null) { x.hbOuts += p.outs || 0; x.hS += p.h; x.bbS += p.bb; }
            if (p.k != null) { x.kOuts += p.outs || 0; x.kS += p.k; }
            if (p.bf != null) { x.bfS += p.bf; x.bfH += p.h || 0; x.bfBB += p.bb || 0; }
            if (p.pc > 0) { x.pcK += +p.pc; if (p.bf != null) { x.pcN += +p.pc; x.pcBf += p.bf; } }
        }));
        const td = today();
        return Object.values(P).map(x => {
            const last = Object.keys(x.days).sort().pop(), dd = x.days[last], rest = restDays(dd.n, R), next = addDays(last, rest + 1);
            return Object.assign(x, { last, lastN: dd.n, lastEst: dd.est, rest, next, wait: next > td, left: Math.max(0, Math.round((new Date(next + 'T00:00:00') - new Date(td + 'T00:00:00')) / 864e5)), over: dd.n > R.max });
        }).sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
    }
    // 경기 기록 화면(투수 고르기)에서 바로 씀 — 기기에 저장된 기록만 (서버에 안 물음)
    function pitRest(q, onDate) {
        const c = lsGet(); if (!c || !Array.isArray(c.recs)) return null;
        const x = pitchers(c.recs).find(p => String(p.no) === String(q.no || '') && p.name === (q.name || ''));
        if (!x) return null;
        const d = String(onDate || today()).slice(0, 10);
        return { last: x.last, n: x.lastN, est: x.lastEst, next: x.next, wait: x.next > d && x.last < d };
    }
    const ipT = o => Math.floor(o / 3) + (o % 3 ? ' ' + (o % 3) + '/3' : '');
    function pitHtml() {
        const L = pitchers(rk.recs || []), R = rule();
        const card = x => `<div class="pt-card ${x.wait ? 'wait' : 'ok'}"><div class="pt-h"><b>${esc(x.no)}</b> ${esc(x.name)}<span class="pt-st">${x.wait ? `${md(x.next)}부터 · ${x.left}일 남음` : '오늘 가능'}</span></div>
            <div class="pt-l">마지막 ${md(x.last)} · <b>${x.lastN}구</b>${x.lastEst ? '<i>짐작</i>' : ''} → ${x.rest}일 쉬기${x.over ? ` <em>하루 ${R.max}구 넘음</em>` : ''}</div></div>`;
        const rows = L.map(x => `<tr><td class="st">${esc(x.no)} ${esc(x.name)}</td><td>${x.apps.length}</td><td>${ipT(x.outs)}</td><td>${x.pcs}${x.apps.some(a => a.est) ? '<i>*</i>' : ''}</td><td>${x.bfS || '-'}${x.bfS && !x.bfKnown ? '<i>*</i>' : ''}</td><td>${x.hbOuts ? x.hS : '-'}</td><td>${x.hbOuts ? x.bbS : '-'}</td><td>${x.kOuts ? x.kS : '-'}</td><td>${x.r}</td><td>${x.er || 0}</td><td>${x.outs ? ((x.er || 0) * 27 / x.outs).toFixed(2) : '-'}</td><td>${x.hbOuts ? ((x.hS + x.bbS) * 3 / x.hbOuts).toFixed(2) : '-'}</td><td>${x.bfS - x.bfBB > 0 ? f3(x.bfH / (x.bfS - x.bfBB)) : '-'}</td><td>${x.kOuts ? (x.kS * 27 / x.kOuts).toFixed(1) : '-'}</td><td>${x.hbOuts ? (x.bbS * 27 / x.hbOuts).toFixed(1) : '-'}</td></tr>`).join('');
        const rl = ['1', String(R.b[0] + 1), String(R.b[1] + 1), String(R.b[2] + 1), String(R.b[3] + 1)];
        return `<div class="pt-sec">⚾ 투수 쉬는 날 <small>오늘 ${md(today())} 기준</small></div>
            ${L.length ? `<div class="pt-grid">${L.map(card).join('')}</div>` : '<p class="ps-empty">아직 투수 기록이 없어요. 경기 기록 화면에서 상대 공격 때 「이번 회 투수」를 고르면 여기에 쌓여요.</p>'}
            ${L.length ? `<div class="pt-sec">시즌 투수 기록</div><div class="ps-tw"><table class="ps-rk pt-rk"><tr><th class="st">투수</th><th>경기</th><th>이닝</th><th>투구 수</th><th>상대 타자</th><th>안타</th><th>4사구</th><th>삼진</th><th>실점</th><th>자책</th><th>평균자책</th><th>WHIP</th><th>피안타율</th><th>9이닝 삼진</th><th>9이닝 4사구</th></tr>${rows}</table></div>` : ''}
            <details class="pt-rule"><summary>쉬는 날 기준 보기 · 고치기</summary>
            <div class="pt-rt">${[0, 1, 2, 3, 4].map(i => `<div><span>${i < 4 ? `<input data-pr="${i}" inputmode="numeric" value="${R.b[i]}">구까지` : `${rl[4]}구 이상`}</span><b>${i}일</b></div>`).join('')}</div>
            <div class="pt-rt2"><label>하루 최대 <input data-pr="max" inputmode="numeric" value="${R.max}">구</label><label>투구 수 모를 때 타자 1명 = <input data-pr="ppa" inputmode="numeric" value="${R.ppa}">구</label></div>
            <div class="pt-btns"><button type="button" data-ps-rule="save">이 기준으로 저장</button><button type="button" data-ps-rule="reset">처음 값으로</button></div>
            <p class="ps-note">대한유소년야구연맹 · KBSA 초등부는 투구 수 · 휴식일 공식 규정이 아직 없어요. 처음 값은 리틀야구(9~12세) 표를 참고했어요. 기준은 이 휴대폰에만 저장돼요. 투구 수를 안 넣은 경기는 상대 타자 수 × ${R.ppa}구(타자 기록도 없으면 이닝 × ${R.pin}구)로 짐작해서 「짐작」 · * 표시가 붙어요. 상대 타자 * = 숫자만 화면으로 기록한 경기는 빠진 수예요. 평균자책 = 9이닝 동안 내줄 자책점 · WHIP = 이닝마다 내보낸 주자 · 피안타율 = 상대 타자 타율.</p></details>`;
    }

    // ---------- B: 팀 순위표 (운영진) ----------
    const SORTS = [['avg', '타율', 1], ['ops', 'OPS', 1], ['rbi', '타점', 0], ['h', '안타', 0], ['obp', '출루율', 1], ['r', '득점', 0], ['sb', '도루', 0], ['hrAll', '홈런', 0], ['woba', 'wOBA', 1], ['iso', '순수장타율', 1]];
    let rk = { sort: 'avg', st: null, open: null, tab: 'bat', recs: null };
    function rankHtml() {
        const st = rk.st, reg = st.nGames * 2, sd = SORTS.find(x => x[0] === rk.sort) || SORTS[0];
        const rate = sd[2];
        const L = st.players.slice().sort((a, b) => (rate ? (b.pa >= reg) - (a.pa >= reg) : 0) || b[sd[0]] - a[sd[0]] || b.pa - a.pa);
        let n = 0;
        const cols = [['avg', '타율', 1], ['g', '경기'], ['pa', '타석'], ['ab', '타수'], ['h', '안타'], ['h2', '2루타'], ['h3', '3루타'], ['hrAll', '홈런'], ['rbi', '타점'], ['r', '득점'], ['sb', '도루'], ['bbhp', '4사구'], ['k', '삼진'], ['obp', '출루율', 1], ['slg', '장타율', 1], ['ops', 'OPS', 1], ['babip', 'BABIP', 1], ['iso', '순수장타율', 1], ['woba', 'wOBA', 1], ['kp', '삼진 비율', 2], ['bbp', '4사구 비율', 2]];
        const val = (q, c) => c[0] === 'g' ? q.games.length : c[0] === 'bbhp' ? q.bb + q.hp : c[2] === 2 ? pc(q[c[0]]) : c[2] ? f3(q[c[0]]) : q[c[0]];
        const rows = L.map(q => { const ok = !rate || q.pa >= reg; if (ok) n++; return `<tr class="${ok ? '' : 'low'}" data-ps="${esc(q.no + '|' + q.name)}"><td class="rn">${ok ? n : '-'}</td><td class="st">${esc(q.no)} ${esc(q.name)}</td>${cols.map(c => `<td class="${c[0] === rk.sort ? 'srt' : ''}">${val(q, c)}</td>`).join('')}</tr>`; }).join('');
        const open = rk.open ? st.players.find(q => q.no + '|' + q.name === rk.open) : null;
        return `<div class="ps-top"><button type="button" data-ps-x="1" aria-label="닫기">✕</button><b>📊 선수 기록</b><small>${st.nGames}경기 · 운영진만 보여요</small></div>
            <div class="ps-body"><div class="ps-seg"><button type="button" class="${rk.tab === 'bat' ? 'on' : ''}" data-ps-tab="bat">🏏 타자</button><button type="button" class="${rk.tab === 'pit' ? 'on' : ''}" data-ps-tab="pit">⚾ 투수 · 쉬는 날</button></div>${rk.tab === 'pit' ? pitHtml() + '</div>' : `<div class="ps-tabs">${SORTS.map(s => `<button type="button" class="${s[0] === rk.sort ? 'on' : ''}" data-ps-s="${s[0]}">${s[1]}</button>`).join('')}</div>
            ${st.players.length ? `<div class="ps-tw"><table class="ps-rk"><tr><th></th><th class="st">선수</th>${cols.map(c => `<th class="${c[0] === rk.sort ? 'srt' : ''}">${c[1]}${c[0] === rk.sort ? ' ▼' : ''}</th>`).join('')}</tr>${rows}</table></div>` : '<p class="ps-empty">아직 보낸 경기 기록이 없어요.</p>'}
            <p class="ps-note">${rate ? `비율 기록(타율 · 출루율 · OPS)은 경기당 2타석 이상(${reg}타석)인 선수만 순위를 매기고, 나머지는 흐리게 보여요. ` : ''}이름을 누르면 그 선수 카드가 열려요. 학부모님 화면에는 순위표가 없고, 선수 화면에 우리 아이 카드만 보여요.</p>
            `}${open ? `<div class="ps-pop" data-ps-c="1"><div class="ps-popin"><div class="ps-poph"><b>${esc(open.no)} ${esc(open.name)}</b><button type="button" data-ps-c="1">닫기</button></div>${cardHtml(open, st.nGames, rk.recs)}</div></div>` : ''}</div>`;
    }
    function drawRank() { const el = document.getElementById('psRank'); if (el && rk.st) el.innerHTML = rankHtml(); }
    function openRank() {
        let el = document.getElementById('psRank');
        if (!el) {
            el = document.createElement('div'); el.id = 'psRank'; el.className = 'ps-rank'; document.body.appendChild(el);
            el.addEventListener('click', ev => {
                const t = ev.target.closest('[data-ps-x],[data-ps-s],[data-ps-c],[data-ps-tab],[data-ps-rule],tr[data-ps]');
                if (!t) return;
                if (t.dataset.psTab) { rk.tab = t.dataset.psTab; drawRank(); return; }
                if (t.dataset.psRule) {
                    if (t.dataset.psRule === 'reset') { try { localStorage.removeItem(LSR); } catch (e) {} drawRank(); return; }
                    const v = k => parseInt((el.querySelector('[data-pr="' + k + '"]') || {}).value, 10);
                    const b = [0, 1, 2, 3].map(v), R = { b, max: v('max'), ppa: v('ppa') };
                    if (b.some(x => !(x > 0)) || b.some((x, i) => i && x <= b[i - 1]) || !(R.max > 0) || !(R.ppa > 0)) { try { bkNotify('fail', '숫자를 작은 수부터 차례로 넣어 주세요'); } catch (e) {} return; }
                    try { localStorage.setItem(LSR, JSON.stringify(R)); } catch (e) {}
                    drawRank(); return;
                }
                if (t.dataset.psX) { el.remove(); document.body.classList.remove('ps-open'); return; }
                if (t.dataset.psS) { rk.sort = t.dataset.psS; drawRank(); return; }
                if (t.dataset.psC) { if (t.classList.contains('ps-pop') && ev.target.closest('.ps-popin') && !ev.target.closest('button')) return; rk.open = null; drawRank(); return; }
                if (t.dataset.ps) { rk.open = t.dataset.ps; drawRank(); }
            });
        }
        document.body.classList.add('ps-open');
        el.innerHTML = '<div class="ps-top"><button type="button" data-ps-x="1">✕</button><b>📊 선수 기록</b></div><div class="ps-body"><p class="ps-empty">불러오는 중…</p></div>';
        load(false).then(recs => { rk.st = calc(recs); rk.recs = recs; rk.open = null; drawRank(); })
            .catch(err => { el.querySelector('.ps-body').innerHTML = '<p class="ps-empty">기록을 못 받았어요. 인터넷을 확인하고 다시 열어 주세요.</p>'; });
    }

    window.PS = { load, calc, mountCard, openRank, isStaff, pitRest, pitchers, _cardHtml: cardHtml };
})();
