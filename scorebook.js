// ==========================================================
// ⚾ 경기 기록 (v2.153.0) — 대표님 손기록표를 휴대폰으로
//   · 경기 중에는 이 기기(localStorage)에만 저장 → 서버 호출 0번 · 끝나고 「보내기」 한 번 (서버 v2.46.0 saveGameRecord)
//   · 입력 방식 4가지(B 기록표 칸 · A 큰 버튼 · D 누른 채 밀기 · E 한 번 터치 표) — 어느 방식이든 저장되는 건 똑같은 한 줄(타순 · 이닝 · 기호)
//   · index.html 의 players · schedEvents · postApi · apiGetUrl · escapeHtml · bkNotify 를 그대로 씀
// ==========================================================
(function () {
    'use strict';
    const LS = 'daeyeon_sb_', LSI = 'daeyeon_sb_index', LSM = 'daeyeon_sb_mode', LSO = 'daeyeon_sb_opp';
    const DIRS = ['투', '포', '1', '2', '3', '유', '좌', '좌중', '중', '우중', '우'];   // v2.154.0: 외야 5방향 (좌중 · 우중 추가)
    const DIRNAME = { 투: '투수', 포: '포수', 1: '1루', 2: '2루', 3: '3루', 유: '유격', 좌: '좌익', 좌중: '좌중간', 중: '중견', 우중: '우중간', 우: '우익' };
    // s 붙는 글자 · d 방향 필요 · h 안타 · ab 타수 · o 아웃 · bb 4사구 · e 상대 실책 · c 색
    const KIND = {
        H1: { s: '안', n: '안타', d: 1, h: 1, ab: 1, c: 'h' }, IH: { s: '내안', n: '내야안타', d: 1, h: 1, ab: 1, c: 'h' },
        H2: { s: '2', n: '2루타', d: 1, h: 1, ab: 1, c: 'h' }, H3: { s: '3', n: '3루타', d: 1, h: 1, ab: 1, c: 'h' }, HR: { s: '홈', n: '홈런', d: 1, h: 1, ab: 1, c: 'h' },
        GO: { s: '땅', n: '땅볼', d: 1, ab: 1, o: 1, c: 'o' }, FO: { s: '플', n: '플라이', d: 1, ab: 1, o: 1, c: 'o' }, LO: { s: '직', n: '직선타', d: 1, ab: 1, o: 1, c: 'o' },
        E: { s: '실', n: '실책', d: 1, ab: 1, e: 1, c: 'e' }, SF: { s: '희플', n: '희생플라이', d: 1, o: 1, c: 'o' },
        BB: { s: '4구', n: '4구', bb: 1, c: 'w' }, HP: { s: '사구', n: '사구', bb: 1, c: 'w' }, K: { s: 'K', n: 'K', ab: 1, o: 1, c: 'k' },
        SH: { s: '희번', n: '희생번트', o: 1, c: 'o' }, FC: { s: '야선', n: '야수선택', ab: 1, c: 'e' },
        IHR: { s: 'GH', n: '그라운드 홈런', d: 1, h: 1, ab: 1, c: 'h' }, FF: { s: '파플', n: '파울플라이', d: 1, ab: 1, o: 1, c: 'o' },   // v2.154.0 대표님 요청
        // v2.156.0 대표님 요청: 낫아웃 두 가지(둘 다 삼진) · 병살타(타자 아웃 + 주자 1명 아웃 = 2아웃)
        KN: { s: 'K(낫아웃)', n: '낫아웃 아웃', ab: 1, o: 1, c: 'k', kk: 1 }, KR: { s: 'K(낫아웃 출루)', n: '낫아웃 출루', ab: 1, c: 'k', kk: 1, rb: 1 },
        DP: { s: '병살', n: '병살타', d: 1, ab: 1, o: 1, c: 'o' }
    };
    const NEW = (typeof window !== 'undefined' && window.SB_NEW) || 'B';   // 11-25 하코 선택 B안 · v2.156.0 낫아웃 · 병살타 · 10~12번 타자 시안 (A 기타에 모으기 · B K 갈래 + 병살 버튼 · C 기록 뒤 물어보기)
    const MODES = { B: '기록표 칸', A: '큰 버튼', D: '누른 채 밀기', E: '한 번 터치 표' };
    const WH = [['좌', -116, -128], ['좌중', -62, -176], ['중', 0, -192], ['우중', 62, -176], ['우', 116, -128], ['3', -118, -62], ['유', -50, -108], ['2', 50, -108], ['1', 118, -62], ['투', 0, -50], ['포', 0, 52]];
    const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
    const lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };
    const note = (st, t, sub) => { try { bkNotify(st, t, sub); } catch (e) {} };

    let G = null;          // 지금 열린 경기
    let ui = { screen: '', pick: null, edit: null, sheetT: null, sheetOpen: false, panel: '', ro: false, msg: '' };
    let recIds = Array.isArray(window.SB_REC_IDS) ? window.SB_REC_IDS.slice() : [];       // 서버에 기록표가 있는 일정 ID (bootstrap 이 알려 줌)

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
    function sym(e) { const k = KIND[e.k]; return k ? (k.d ? (e.d || '') + (e.w ? '월' : '') + (e.n ? '선' : '') + k.s : k.s) : (e.k || ''); }
    const OFD = ['좌', '좌중', '중', '우중', '우'];   // v2.154.0 「월」: 외야수 키를 넘긴 안타 · 홈런 (예: 우월2 · 우월홈)
    const LND = ['좌', '우'];   // v2.156.0 「선」: 좌익 · 우익 라인에 붙은 안타 (예: 우선2 = 우익선상 2루타 · 좌선3)
    function nOK(k, d) { return !!(KIND[k] && KIND[k].h && LND.indexOf(d) !== -1); }
    function wOK(k, d) { return !!(KIND[k] && KIND[k].h && OFD.indexOf(d) !== -1); }
    function outs(t, inn) { return G.log.reduce((n, e) => n + ((e.t === t && e.i === inn && ((e.y === 'pa' && KIND[e.k] && KIND[e.k].o) || e.y === 'ro' || e.y === 'cs')) ? 1 : 0), 0); }
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
        let ab = 0, h = 0, rbi = 0, r = 0, sb = 0;
        G.log.forEach(x => {
            if (x.t !== t) return;
            if (x.y === 'pa' && x.s === slot && x.p === pi) { const k = KIND[x.k]; if (k) { if (k.ab) ab++; if (k.h) h++; } rbi += x.r || 0; }
            else if (x.y === 'run' && x.sc && x.sc.s === slot && x.sc.p === pi) r++;
            else if (x.y === 'sb' && x.s === slot && x.p === pi) sb++;
        });
        return { ab, h, rbi, r, sb };
    }
    // 지금 회에 나가 있는 주자 (타격 결과로 1 · 2 · 3루 · 앞 주자는 밀어 줌 · 도루로 한 루씩 · 득점 · 아웃 · 홈런이면 빠짐)
    function onBase(t, i) {
        let L = [];
        G.log.forEach(e => {
            if (e.t !== t || e.i !== i) return;
            if (e.y === 'pa') { const K = KIND[e.k]; L = L.filter(x => !(x.s === e.s && x.p === e.p)); if (e.k === 'HR' || e.k === 'IHR') L = [];   // 홈런이면 주자 모두 들어옴
                else if (K && (K.h || K.bb || K.e || K.rb || e.k === 'FC')) {   // v2.154.0: 타자가 간 루까지 앞 주자를 밀어 줌 (세 번째 루에서 멈춤)
                    let cur = e.k === 'H2' ? 2 : e.k === 'H3' ? 3 : 1; const nb = cur;
                    L.slice().sort((x, y) => x.b - y.b).forEach(q => { if (q.b <= cur) { q.b = Math.min(3, cur + 1); } cur = Math.max(cur, q.b); });
                    L.push({ s: e.s, p: e.p, b: nb });
                } }
            else if (e.y === 'sb') { const q = L.find(x => x.s === e.s && x.p === e.p); if (q) q.b = Math.min(3, q.b + 1); }
            else if (e.y === 'ro' || e.y === 'cs' || (e.y === 'run' && e.sc)) { const w = e.y === 'run' ? e.sc : e; L = L.filter(x => !(x.s === w.s && x.p === w.p)); }
        });
        return L.reverse();
    }
    function pName(t, s, p) { const sl = slotOf(t, s), q = sl && sl.ps[p] ? sl.ps[p] : {}; return q.name || (q.no ? '#' + q.no : s + '번'); }
    function slotOf(t, s) { return G.tm[t].ln[s - 1]; }
    function curP(t, s) { const sl = slotOf(t, s); return sl && sl.ps.length ? sl.ps[sl.ps.length - 1] : { no: '', name: '' }; }
    function nSlots(t) { return G.tm[t].ln.length; }
    function halfLabel(t, i) { return i + '회' + (G.first === t ? '초' : '말'); }
    function batting() { return G.cur.t; }
    function recOn(t) { return t === 'us' || G.recThem; }

    // ---------- ⚾ v2.158.0 투수 관리 (11-25 하코 · 추천안: 회마다 「이번 회 투수」만 고르기 · 투구 수는 넣어도 되고 안 넣어도 됨) ----------
    //   시안 window.SB_PIT: A 회 시작 때 한 줄로 묻기 · B 점수 줄에 투수 칩만 · C 회 시작 때 팝업
    //   기록: log {y:'pit', t:'them', i, no, name} = 이 회(상대 공격)부터 던지는 우리 투수 · 투구 수 G.pcnt['배번|이름'] (비워도 됨)
    const PITV = (typeof window !== 'undefined' && window.SB_PIT) || 'A';
    const pkey = q => String(q.no || '') + '|' + String(q.name || '');
    function curPit() { let p = null; G.log.forEach(e => { if (e.y === 'pit') p = e; }); return p; }
    function pitHalf() { return G.log.some(e => e.y === 'pit' && e.t === 'them' && e.i === G.cur.i); }
    function playedHalf() { return G.log.some(e => e.t === 'them' && e.i === G.cur.i && e.y !== 'pit') || runs('them', G.cur.i) > 0; }
    function defending() { return !!G && !G.done && G.begun && G.cur.t === 'them'; }
    function pitAsk() { return defending() && !pitHalf() && !playedHalf(); }
    function pitLabel(q) { return q ? (q.no ? '#' + q.no + ' ' : '') + (q.name || '') : ''; }
    function setPit(q) {
        push({ y: 'pit', t: 'them', i: G.cur.i, no: q.no || '', name: q.name || '' });
        ui.msg = '⚾ ' + halfLabel('them', G.cur.i) + ' 투수 · ' + pitLabel(q);
    }
    function pitStats(g) {
        g = g || G;
        const P = {}, order = [], pend = { outs: 0, bf: 0, h: 0, bb: 0, k: 0, r: 0 }, startP = {}, logR = {};
        let cur = null;
        const get = e => { const k = pkey(e); if (!P[k]) { P[k] = { no: e.no || '', name: e.name || '', outs: 0, bf: 0, h: 0, bb: 0, k: 0, r: 0, inn: [] }; order.push(k); } return P[k]; };
        const halfOuts = (i) => g.log.reduce((n, e) => n + ((e.t === 'them' && e.i === i && ((e.y === 'pa' && KIND[e.k] && KIND[e.k].o) || e.y === 'ro' || e.y === 'cs')) ? 1 : 0), 0);
        g.log.forEach(e => {
            if (e.t !== 'them') return;
            if (e.y === 'pit') { const x = get(e); if (!cur) for (const k in pend) { x[k] += pend[k]; pend[k] = 0; } cur = x; if (x.inn.indexOf(e.i) === -1) x.inn.push(e.i); }
            if (!(e.i in startP)) startP[e.i] = cur;
            const w = cur || pend;
            if (e.y === 'pa') { const K = KIND[e.k] || {}; w.bf++; if (K.h) w.h++; if (K.bb) w.bb++; if (K.c === 'k') w.k++; if (K.o) w.outs++; if (cur && cur.inn.indexOf(e.i) === -1) cur.inn.push(e.i); }
            else if (e.y === 'ro' || e.y === 'cs') w.outs++;
            else if (e.y === 'run') { w.r++; logR[e.i] = (logR[e.i] || 0) + 1; }
            else if (e.y === 'end') { w.outs += Math.max(0, 3 - halfOuts(e.i)); if (cur && cur.inn.indexOf(e.i) === -1) cur.inn.push(e.i); }
        });
        if (!order.length) return [];
        for (const i in (g.runs.them || {})) { const d = (g.runs.them[i] || 0) - (logR[i] || 0); if (d > 0) (startP[i] || P[order[0]]).r += d; }
        const pc = g.pcnt || {};
        return order.map(k => Object.assign(P[k], { pc: pc[k] > 0 ? pc[k] : 0, recBf: !!g.recThem }));
    }
    const ipTxt = o => Math.floor(o / 3) + (o % 3 ? ' ' + (o % 3) + '/3' : '');
    function pitRest(q) { try { return window.PS && window.PS.pitRest ? window.PS.pitRest(q, G && G.date) : null; } catch (e) { return null; } }
    function pitBadge(q) {
        const today = (G.pcnt || {})[pkey(q)];
        const r = pitRest(q);
        if (r && r.wait) return `<em class="rest no">${esc(r.next.slice(5).replace('-', '.'))}부터</em>`;
        if (r && r.last) return `<em class="rest ok">가능</em>`;
        return today ? `<em class="rest">${today}구</em>` : '';
    }
    function pitChip() {   // B · C: 점수 줄 옆 투수 칩
        if (!defending() || PITV === 'A') return '';
        const p = curPit();
        return p ? `<button type="button" class="pitchip" data-a="pit"><i class="pl">투수 </i><b>${p.no ? `<i class="pn">#${esc(p.no)} </i>` : ''}${esc(p.name || '#' + p.no)}</b> ▾</button>` : `<button type="button" class="pitchip need" data-a="pit">⚾ 투수?</button>`;
    }
    function pitBar() {   // A: 상대 공격이 시작될 때 한 줄로 「이번 회 투수」
        if (PITV !== 'A' || !pitAsk()) return '';
        const p = curPit();
        return `<div class="sb-now ask pitask"><span>⚾ <b>${halfLabel('them', G.cur.i)}</b> 우리 투수${p ? '는?' : '를 골라 주세요'}</span>${p ? `<button type="button" class="pri" data-a="pitsame">${esc(pitLabel(p))} 그대로</button><button type="button" data-a="pit">바꾸기</button>` : `<button type="button" class="pri" data-a="pit">투수 고르기</button>`}</div>`;
    }
    function pitPanel() {
        const p = curPit(), ask = pitAsk();
        const used = {}, lnPit = [], lnOther = [];
        G.tm.us.ln.forEach(sl => sl.ps.forEach(q => { const k = pkey(q); if (used[k]) return; used[k] = 1; (String(q.pos) === '1' ? lnPit : lnOther).push(q); }));
        G.log.forEach(e => { if (e.y === 'pit' && !used[pkey(e)]) { used[pkey(e)] = 1; lnPit.push(e); } });
        const bench = roster().filter(q => !used[pkey(q)]);
        const btn = q => `<button type="button" data-a="pitpick" data-no="${esc(q.no)}" data-name="${esc(q.name)}" class="${p && pkey(p) === pkey(q) ? 'on' : ''}"><b>${esc(q.no)}</b>${esc(q.name)}${pitBadge(q)}</button>`;
        const sec = (lab, L) => L.length ? `<div class="lbl">${lab}</div><div class="plist pits">${L.map(btn).join('')}</div>` : '';
        const st = p ? pitStats().find(x => pkey(x) === pkey(p)) : null, pcv = p ? (G.pcnt || {})[pkey(p)] || '' : '';
        const cur = p ? `<div class="pitcur"><div><small>지금 투수</small><b>${esc(pitLabel(p))}</b><span>${st ? ipTxt(st.outs) + '이닝' + (G.recThem ? ' · 타자 ' + st.bf + '명' : '') + ' · 실점 ' + st.r : ''}</span></div>
            <label class="pcbox">투구 수 <small>몰라도 돼요</small><span><button type="button" data-a="pcn" data-n="-5">−5</button><input data-pc="${esc(pkey(p))}" inputmode="numeric" maxlength="3" placeholder="모름" value="${pcv}"><button type="button" data-a="pcn" data-n="5">+5</button></span></label></div>
            ${ask ? `<button type="button" class="big pri" data-a="pitsame">${esc(pitLabel(p))} 그대로 던져요 ▶</button>` : ''}` : '';
        return `<div class="sb-over" data-a="panel-x"><div class="sb-panel pitp" data-stop="1"><h3>⚾ ${halfLabel('them', G.cur.i)} 우리 투수 <small>${p ? '바뀌면 새 투수를 누르세요' : '누르면 바로 정해져요'}</small></h3>${cur}
            ${sec('오늘 투수 (수비 1번)', lnPit)}${sec('오늘 타순', lnOther)}${sec('벤치', bench)}
            <p class="hint">「가능」 · 「11.27부터」는 지난 경기 투구 수(모르면 상대 타자 수로 짐작)로 계산한 쉬는 날이에요. 기준은 📊 선수 기록 → ⚾ 투수에서 바꿔요.</p>
            <button type="button" class="big" data-a="panel-x">${ask ? '나중에 · 그대로 두기' : '닫기'}</button></div></div>`;
    }
    function pitTable(ro) {   // 경기 끝 · 기록 보기: 투수별 이닝 · 투구 수
        const L = pitStats(); if (!L.length) return ro ? '' : `<p class="hint">⚾ 투수를 안 골랐어요. 투수 기록이 필요하면 「경기로 돌아가기」 → 상대 공격 때 투수를 골라 주세요.</p>`;
        return `<div class="pitt"><div class="lbl">⚾ 우리 투수 ${ro ? '' : '<small>투구 수는 알면 넣고, 모르면 비워 두세요</small>'}</div><table><tr><th>투수</th><th>이닝</th>${G.recThem ? '<th>타자</th><th>안타</th><th>4사구</th><th>삼진</th>' : ''}<th>실점</th><th>투구 수</th></tr>${L.map(q => `<tr><td class="nm"><b>${esc(q.no)}</b> ${esc(q.name)}</td><td>${ipTxt(q.outs)}</td>${G.recThem ? `<td>${q.bf}</td><td>${q.h}</td><td>${q.bb}</td><td>${q.k}</td>` : ''}<td>${q.r}</td><td>${ro ? (q.pc || '-') : `<input data-pc="${esc(pkey(q))}" inputmode="numeric" maxlength="3" placeholder="모름" value="${q.pc || ''}">`}</td></tr>`).join('')}</table></div>`;
    }

    // ---------- 기록 동작 ----------
    function snap() { return { cur: Object.assign({}, G.cur), nx: Object.assign({}, G.nx) }; }
    function push(e) { e.id = ++G.seq; e.pc = snap(); G.log.push(e); return e; }
    function advance() { const t = G.cur.t; G.cur.s = G.cur.s % nSlots(t) + 1; G.nx[t] = G.cur.s; }
    function endHalf(auto) {
        const t = G.cur.t, i = G.cur.i;
        const lp = [...G.log].reverse().find(x => (x.y === 'pa' || (x.y === 'ro' && !x.dp)) && x.t === t && x.i === i);   // 「//」 는 그 회 마지막 타자 칸에
        push({ y: 'end', t: t, i: i, s: lp ? lp.s : G.cur.s, p: lp ? lp.p : 0, auto: auto ? 1 : 0 });
        const o = other(t);
        G.cur = { t: o, i: (G.first === t ? i : i + 1), s: G.nx[o] || 1 };
        ui.sheetT = null; ui.pick = null; ui.edit = null;
        if (G.first !== t && i >= 6 && !G.done) ui.panel = 'askend';   // 6회말(또는 연장)이 끝나면 「경기 끝났나요?」
        else if (PITV === 'C' && o === 'them' && !G.done) ui.panel = 'pit';   // C안: 상대 공격 시작 → 투수 팝업
    }
    function record(k, d) {
        const K = KIND[k]; if (!K) return;
        if (K.d && !d) { ui.pick = k; draw(); return; }
        if (ui.edit != null) {   // 고치기: 그 칸의 기호만 바꿈
            const e = G.log.find(x => x.id === ui.edit);
            if (e) { e.k = k; e.d = K.d ? d : ''; if (ui.wol && wOK(k, d)) e.w = 1; else delete e.w; if (ui.sen && nOK(k, d)) e.n = 1; else delete e.n; ui.msg = '고쳤어요 · ' + sym(e); }
            ui.edit = null; ui.pick = null; ui.wol = false; ui.sen = false; save(); draw(); return;
        }
        const t = G.cur.t;
        if (!recOn(t)) return;
        if (k === 'DP' && !ui.dpr) {   // 병살타: 지금 나가 있는 주자 중 누가 아웃됐는지 (한 명이면 바로)
            const on = onBase(t, G.cur.i);
            if (!on.length) { ui.msg = '주자가 없어서 병살타가 안 돼요 · 땅볼로 적어 주세요'; ui.pick = null; draw(); return; }
            if (outs(t, G.cur.i) >= 2) { ui.msg = '이미 2아웃이라 병살이 아니에요 · 땅볼로 적어 주세요'; ui.pick = null; draw(); return; }
            if (on.length > 1) { ui.dpk = { d: d }; ui.panel = 'dp'; draw(); return; }
            ui.dpr = { s: on[0].s, p: on[0].p };
        }
        ui.ask = null;
        const runnersBefore = onBase(t, G.cur.i).length, outsBefore = outs(t, G.cur.i);
        const sl = slotOf(t, G.cur.s);
        const e = push({ y: 'pa', t: t, i: G.cur.i, s: G.cur.s, p: Math.max(0, sl.ps.length - 1), k: k, d: K.d ? d : '', r: 0 });
        if (ui.wol && wOK(k, d)) e.w = 1;
        if (ui.sen && nOK(k, d)) e.n = 1;
        ui.wol = false; ui.sen = false;
        const who = curP(t, e.s);
        ui.msg = '✔ ' + e.s + '번 ' + (who.name || (who.no ? '#' + who.no : '')) + ' 「' + sym(e) + '」';
        ui.pick = null; ui.more = false; ui.dir = null;
        advance();
        if (k === 'HR' || k === 'IHR') { G.runs[t] = G.runs[t] || {}; G.runs[t][e.i] = runs(t, e.i) + 1; e.r = (e.r || 0) + 1; push({ y: 'run', t: t, i: e.i, sc: { s: e.s, p: e.p }, ref: e.id, auto: 1 }); ui.msg += ' · 득점 +1 (자동)'; }
        if (k === 'DP' && ui.dpr) { const r = ui.dpr; push({ y: 'ro', t: t, i: e.i, s: r.s, p: r.p, dp: 1, ref: e.id, auto: 1 }); ui.msg += ' · 주자 ' + pName(t, r.s, r.p) + ' 아웃 (2아웃)'; }
        ui.dpr = null; ui.dpk = null;
        const ended = outs(t, e.i) >= 3;
        if (ended) { endHalf(true); ui.msg += ' · 3아웃, 공수교대'; }
        if (NEW === 'C' && k === 'K') ui.ask = { y: 'K', id: e.id };   // C안: 기록한 뒤 한 줄로 물어보기 (안 누르면 그대로)
        else if (NEW === 'C' && k === 'GO' && runnersBefore && outsBefore < 2 && !ended) ui.ask = { y: 'GO', id: e.id };
        else if (NEW === 'A' || NEW === 'C') {   // A(추천) · C안: 상대 9번이 치면 「10번 타자 있나요?」
            if (t === 'them' && !ended && G.cur.t === t && G.cur.s === 1 && e.s === nSlots(t) && nSlots(t) < 12 && G.slotAsked !== nSlots(t)) { G.slotAsked = nSlots(t); ui.ask = { y: 'slot' }; }
        }
        save(); draw();
    }
    // C안: 방금 기록을 낫아웃 · 병살타로 바꾸기
    function convertLast(id, k) {
        const e = G.log.find(x => x.id === id); if (!e) return;
        ui.ask = null;
        if (k === 'KN') { e.k = 'KN'; ui.msg = '고쳤어요 · ' + sym(e); }
        else if (k === 'KR') {   // 아웃이 하나 줄어듦 — 이 삼진으로 공수교대가 됐으면 되돌림
            const last = G.log[G.log.length - 1];
            if (last && last.y === 'end' && last.auto && last.t === e.t && last.i === e.i) { G.log.pop(); G.cur = last.pc.cur; G.nx = last.pc.nx; ui.panel = ''; }
            e.k = 'KR'; ui.msg = '고쳤어요 · ' + sym(e) + ' · 1루 출루';
        } else if (k === 'DP') {
            const on = onBase(e.t, e.i);
            if (!on.length) { ui.msg = '주자가 없어요'; draw(); return; }
            if (on.length > 1 && !ui.dpr) { ui.dpk = { conv: id }; ui.panel = 'dp'; draw(); return; }
            const r = ui.dpr || { s: on[0].s, p: on[0].p }; ui.dpr = null; ui.dpk = null;
            e.k = 'DP'; push({ y: 'ro', t: e.t, i: e.i, s: r.s, p: r.p, dp: 1, ref: e.id, auto: 1 });
            ui.msg = '고쳤어요 · ' + sym(e) + ' · 주자 ' + pName(e.t, r.s, r.p) + ' 아웃';
            if (G.cur.t === e.t && outs(e.t, e.i) >= 3) { endHalf(true); ui.msg += ' · 3아웃, 공수교대'; }
        }
        save(); draw();
    }
    // 연습경기: 상대 타순 10 · 11 · 12번 늘리기 / 빈 마지막 타순 빼기
    function addSlot(t) {
        const ln = G.tm[t].ln;
        if (ln.length >= 12) { ui.msg = '타순은 12번까지예요'; return; }
        const prevLast = ln.length;
        ln.push({ ps: [{ no: '', name: '', pos: '' }] });
        const lp = [...G.log].reverse().find(x => x.y === 'pa' && x.t === t);
        if (G.cur.t === t && G.cur.s === 1 && lp && lp.s === prevLast) { G.cur.s = ln.length; G.nx[t] = ln.length; }   // 방금 9번이 쳤으면 다음은 10번
        else if (G.cur.t !== t && G.nx[t] === 1 && lp && lp.s === prevLast) G.nx[t] = ln.length;
        ui.msg = G.tm[t].name + ' ' + ln.length + '번 타자를 더했어요';
    }
    function dropSlot(t) {
        const ln = G.tm[t].ln, s = ln.length;
        if (s <= 1) return;
        if (G.log.some(e => e.t === t && (e.s === s || (e.sc && e.sc.s === s)))) { ui.msg = s + '번은 기록이 있어서 뺄 수 없어요 · 먼저 그 칸을 지워 주세요'; return; }
        ln.pop();
        if (G.cur.t === t && G.cur.s > ln.length) G.cur.s = 1;
        if (G.nx[t] > ln.length) G.nx[t] = 1;
        ui.msg = s + '번 타순을 뺐어요';
    }
    function undo() {
        const e = G.log.pop();
        if (!e) { ui.msg = '되돌릴 기록이 없어요'; draw(); return; }
        if (e.y === 'end' && e.auto) { G.cur = e.pc.cur; G.nx = e.pc.nx; return undo(); }   // 자동 공수교대는 그 타석과 함께 되돌림
        if (e.y === 'ro' && e.auto) { const pa = G.log.find(x => x.id === e.ref); if (pa && pa.k === 'DP' && G.log[G.log.length - 1] !== pa) { pa.k = 'GO'; G.cur = e.pc.cur; G.nx = e.pc.nx; ui.msg = '↶ 병살타를 땅볼로 되돌렸어요'; save(); draw(); return; } G.cur = e.pc.cur; G.nx = e.pc.nx; return undo(); }   // 병살타 주자 아웃은 그 타석과 함께
        ui.ask = null;
        if (e.y === 'sub') { const sl = slotOf(e.t, e.s); if (sl.ps.length > 1) sl.ps.pop(); }
        if (e.y === 'run') { G.runs[e.t][e.i] = Math.max(0, runs(e.t, e.i) - 1); if (e.ref) { const pa = G.log.find(x => x.id === e.ref); if (pa) pa.r = Math.max(0, (pa.r || 0) - 1); } if (e.auto) { G.cur = e.pc.cur; G.nx = e.pc.nx; return undo(); } }   // 홈런 자동 득점은 그 타석과 함께
        G.cur = e.pc.cur; G.nx = e.pc.nx;
        ui.msg = '↶ 되돌렸어요'; ui.edit = null; ui.pick = null; ui.sheetT = null;
        save(); draw();
    }
    function addRun(t) {
        const i = G.cur.t === t ? G.cur.i : lastInn(t);
        G.runs[t] = G.runs[t] || {}; G.runs[t][i] = runs(t, i) + 1;
        let ref = 0;   // 방금 친 타자의 타점으로 (실책 · 야선 · 삼진은 빼고)
        if (recOn(t)) { const last = [...G.log].reverse().find(x => x.y === 'pa' && x.t === t && x.i === i); if (last && KIND[last.k] && !KIND[last.k].e && !KIND[last.k].kk && last.k !== 'K' && last.k !== 'FC') { last.r = (last.r || 0) + 1; ref = last.id; } }
        push({ y: 'run', t: t, i: i, ref: ref });
        ui.msg = '득점 +1 · ' + G.tm[t].name + ' ' + total(t) + '점';
        save(); draw();
    }
    // 주자 기록: 득점(타점 있음 · 없음) · 도루 · 도루 실패 · 주자 아웃 — 누가 했는지까지
    function runnerAct(t, s, p, act) {
        const i = G.cur.t === t ? G.cur.i : lastInn(t), nm = pName(t, s, p);
        if (act === 'run' || act === 'run0') {
            G.runs[t] = G.runs[t] || {}; G.runs[t][i] = runs(t, i) + 1;
            let ref = 0;
            if (act === 'run') { const last = [...G.log].reverse().find(x => x.y === 'pa' && x.t === t && x.i === i); if (last) { last.r = (last.r || 0) + 1; ref = last.id; } }
            push({ y: 'run', t: t, i: i, sc: { s: s, p: p }, ref: ref });
            ui.msg = '득점 +1 · ' + nm + (ref ? ' (타점 ' + pName(t, G.log.find(x => x.id === ref).s, G.log.find(x => x.id === ref).p) + ')' : ' (타점 없음)') + ' · ' + G.tm[t].name + ' ' + total(t) + '점';
        } else {
            push({ y: act, t: t, i: i, s: s, p: p });
            ui.msg = (act === 'sb' ? '도루 · ' : act === 'cs' ? '도루 실패 · ' : '주자 아웃 · ') + nm;
            if ((act === 'cs' || act === 'ro') && G.cur.t === t && outs(t, i) >= 3) { endHalf(true); ui.msg += ' · 3아웃, 공수교대'; }
        }
        ui.panel = ''; ui.rn = null; save(); draw();
    }
    function rbiBatter(t) { const i = G.cur.t === t ? G.cur.i : lastInn(t); return [...G.log].reverse().find(x => x.y === 'pa' && x.t === t && x.i === i) || null; }
    function runnerPanel() {   // ① 누가? ② 무엇을?
        const t = (ui.rn && ui.rn.t) || G.cur.t, i = G.cur.t === t ? G.cur.i : lastInn(t);
        if (ui.rn && ui.rn.s) {
            const r = ui.rn, lb = rbiBatter(t), lbn = lb ? pName(t, lb.s, lb.p) : '';
            const self = lb && lb.s === r.s && lb.p === r.p;
            return `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>🏃 ${esc(pName(t, r.s, r.p))} <small>${r.s}번 · ${i}회</small></h3><div class="ract">
            <button type="button" class="big pri" data-a="ract" data-x="run">⚾ 득점${lb && !self ? ` <small>타점 ${esc(lbn)}</small>` : ''}</button>
            <button type="button" class="big" data-a="ract" data-x="run0">득점 <small>타점 없음 (도루 · 실책 · 폭투 · 보크)</small></button>
            <div class="f2"><button type="button" class="big sbb" data-a="ract" data-x="sb">🏃 도루</button><button type="button" class="big csb" data-a="ract" data-x="cs">도루 실패</button></div>
            <button type="button" class="big" data-a="ract" data-x="ro">주자 아웃 (견제 · 주루사)</button></div>
            <button type="button" class="big" data-a="panel-x">취소</button></div></div>`;
        }
        const on = onBase(t, i), ln = G.tm[t].ln;
        const btn = (s, p, lab) => `<button type="button" data-a="rpick" data-t="${t}" data-s="${s}" data-p="${p}">${lab}</button>`;
        const all = ln.map((sl, k) => { const p = sl.ps.length - 1; return btn(k + 1, p, `<b>${k + 1}</b>${esc(pName(t, k + 1, p))}`); }).join('');
        return `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>🏃 어느 주자? <small>${esc(G.tm[t].name)} · ${i}회</small></h3>
        ${on.length ? `<div class="lbl">지금 나가 있는 주자</div><div class="plist rn">${on.map(q => btn(q.s, q.p, `<i>${q.b}루</i>${esc(pName(t, q.s, q.p))}`)).join('')}</div><div class="lbl">다른 선수</div>` : `<div class="lbl">타순에서 고르기</div>`}
        <div class="plist">${all}</div><button type="button" class="big" data-a="panel-x">취소</button></div></div>`;
    }
    function baseHtml() {   // 출루자 칩(B) · 다이아몬드(C)
        const t = G.cur.t; if (!recOn(t)) return '';
        const on = onBase(t, G.cur.i);
        if (RUN === 'B') return on.length ? `<div class="sb-runners"><span>주자</span>${on.map(q => `<button type="button" data-a="rpick" data-t="${t}" data-s="${q.s}" data-p="${q.p}"><i>${q.b}루</i>${esc(pName(t, q.s, q.p))}</button>`).join('')}</div>` : '';
        if (RUN === 'C') { const at = b => on.filter(q => q.b === b); const cell = b => { const q = at(b); return `<button type="button" class="bs b${b}${q.length ? ' on' : ''}" ${q.length ? `data-a="rpick" data-t="${t}" data-s="${q[0].s}" data-p="${q[0].p}"` : 'disabled'}><span>${q.length ? esc(pName(t, q[0].s, q[0].p)) + (q.length > 1 ? ' +' + (q.length - 1) : '') : b + '루'}</span></button>`; };
            return `<div class="sb-dia">${cell(2)}${cell(3)}${cell(1)}<i class="hp"></i></div>`; }
        return '';
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
    const TAB = (typeof window !== 'undefined' && window.SB_TAB) || '3';   // 11-22 하코 선택: 3 방향 맞춤 (태블릿 세로 = 위아래, 가로 · PC = 좌우)
    const RUN = (typeof window !== 'undefined' && window.SB_RUN) || 'B';
    const DLAY = (typeof window !== 'undefined' && window.SB_DLAY) || 'B';   // v2.155.1 D안 바퀴 시안 (A 위아래 바꿈 · B 화면 안 맞춤 · C 가운데 고정)   // 주자 기록 시안 (A 창에서 고르기 · B 주자 칩 · C 다이아몬드)
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
        ui.screen = 'game'; if (PITV === 'C' && G.first === 'them') ui.panel = 'pit'; save(); draw();
    }

    // ---------- 화면 ----------
    function root() {
        let r = document.getElementById('sbRoot');
        if (!r) { r = document.createElement('div'); r.id = 'sbRoot'; r.className = 'sb'; document.body.appendChild(r); bind(r); }
        return r;
    }
    // ⏳ v2.155.2: 기록하는 동안 30분 자동 잠금을 미루고(최대 5시간) 화면이 꺼지지 않게 (타석 모드와 같은 방식)
    let holdAt = 0, wlock = null;
    function recording() { let r = ''; try { r = currentRole; } catch (e) {} return !!(G && ui && ui.screen !== 'view' && (r === 'super' || r === 'dev') && document.documentElement.classList.contains('sb-open')); }   // 로그인 시간이 지나도 기록 화면은 계속 (보내기 때만 다시 로그인)
    window.sbHold = function () { return recording() && holdAt > 0 && Date.now() - holdAt < 5 * 3600 * 1000; };
    function wakeOn() { try { if (!wlock && navigator.wakeLock && document.visibilityState === 'visible' && recording()) navigator.wakeLock.request('screen').then(l => { wlock = l; l.addEventListener('release', () => { wlock = null; }); }).catch(() => {}); } catch (e) {} }
    function wakeOff() { try { if (wlock) wlock.release(); } catch (e) {} wlock = null; }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeOn(); });
    function close() { const r = document.getElementById('sbRoot'); if (r) { r.style.display = 'none'; r.innerHTML = ''; } document.documentElement.classList.remove('sb-open'); G = null; holdAt = 0; wakeOff(); try { if (window.dyLockIfDue) setTimeout(window.dyLockIfDue, 0); } catch (e) {} try { if (typeof renderSchedule === 'function') renderSchedule(); } catch (e) {} band(); }
    function draw() {
        const r = root(); r.style.display = 'block'; document.documentElement.classList.add('sb-open');
        if (recording()) { if (!holdAt) holdAt = Date.now(); wakeOn(); }
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
        G.log.forEach(e => { if (e.t !== t) return; let w = null; if (e.y === 'pa' || e.y === 'ro' || e.y === 'sb' || e.y === 'cs') w = e; else if (e.y === 'run' && e.sc && !e.auto) w = e.sc; if (w) (cells[e.i + '|' + w.s + '|' + w.p] = cells[e.i + '|' + w.s + '|' + w.p] || []).push(e); });
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
                    const RL = { ro: '주자아웃', sb: '도루', cs: '도루실패', run: '득점' };
                    const inner = es.map(e => RL[e.y] ? `<i class="ro rk-${e.y}"${ro ? '' : ` data-a="rmark" data-id="${e.id}"`}>(${e.dp ? '병살' : RL[e.y]})</i>` : `<span class="sy ${KIND[e.k] ? KIND[e.k].c : ''}${sym(e).length > 5 ? ' lg' : ''}${ui.edit === e.id ? ' ed' : ''}" data-a="cell" data-id="${e.id}">${esc(sym(e))}${e.r ? `<sup>${e.r}</sup>` : ''}</span>`).join('')
                        + (es.length && ends[i + '|' + s + '|' + pi] ? `<span class="endm">//</span>` : '');
                    tds += `<td class="${isCur ? 'cur' : ''}"${ro ? '' : ` data-a="cellempty" data-t="${t}" data-i="${i}" data-s="${s}"`}>${inner}</td>`;
                }
                rows += `<tr class="${pi ? 'subrow' : ''}"><td class="od">${pi ? '' : s}</td><td class="nm"${ro ? '' : ` data-a="who" data-t="${t}" data-s="${s}" data-p="${pi}"`}><b>${esc(p.no)}</b> ${p.name ? esc(p.name) : (p.no === '' && !ro ? '<u>배번 넣기</u>' : '')}<small>${esc(p.pos || '')}</small></td>${tds}<td class="tt">${st.ab}</td><td class="tt">${st.h}</td><td class="tt">${st.rbi}</td><td class="tt">${st.r || 0}</td><td class="tt">${st.sb || 0}</td></tr>`;
            });
        });
        if (!ro && NEW === 'B' && !G.done) rows += `<tr class="addrow"><td colspan="${n + 7}">${ln.length < 12 ? `<button type="button" data-a="slot+" data-t="${t}">＋ ${ln.length + 1}번 타자 추가 <small>연습경기 · 12번까지</small></button>` : ''}${ln.length > 9 ? `<button type="button" class="dim" data-a="slot-" data-t="${t}">− ${ln.length}번 빼기</button>` : ''}</td></tr>`;
        const head = Array.from({ length: n }, (_, k) => `<th>${k + 1}회</th>`).join('');
        return `<div class="sb-sheetwrap"><table class="sb-sheet"><tr><th class="od">타순</th><th class="nm">배번 · 이름</th>${head}<th class="tt">타수</th><th class="tt">안타</th><th class="tt">타점</th><th class="tt">득점</th><th class="tt">도루</th></tr>${rows}</table></div>`;
    }
    function sheetTabs(t) {
        return `<div class="sb-stabs"><button type="button" data-a="sheett" data-t="us" class="${t === 'us' ? 'on' : ''}">${esc(G.tm.us.name)}</button>${G.recThem ? `<button type="button" data-a="sheett" data-t="them" class="${t === 'them' ? 'on' : ''}">${esc(G.tm.them.name)}</button>` : ''}</div>`;
    }

    // 입력 판 — 방식마다 모양만 다르고 모두 record(k, d) 를 부름
    const SHORTN = { KN: '낫아웃 아웃', KR: '낫아웃 출루', DP: '병살타', IHR: '그라운드 홈런', FF: '파울플라이', H1: '안타', IH: '내야안타', H2: '2루타', H3: '3루타', HR: '홈런', GO: '땅볼', FO: '플라이', LO: '직선타', E: '실책', SF: '희생플라이', BB: '볼넷', HP: '몸에 맞는 공', K: '삼진', SH: '희생번트', FC: '야수선택' };
    function kb(k, cls, extra) { const K = KIND[k]; const lab = (LAY === 'A' && !extra) ? `<b class="sy2">${esc(K.s)}</b><small>${SHORTN[k]}</small>` : K.n + (extra || ''); return `<button type="button" class="kb ${K.c} ${cls || ''}${ui.pick === k ? ' sel' : ''}" data-a="k" data-k="${k}">${lab}</button>`; }
    function dirRow() { return `<div class="sb-dirs d11${ui.pick ? ' need' : ''}">${DIRS.map(d => `<button type="button"${d.length > 1 || /[좌중우]/.test(d) ? ' class="of"' : ''} data-a="d" data-d="${d}">${d}</button>`).join('')}</div>`; }
    function fieldPad() { return `<div class="sb-field${ui.pick ? ' need' : ''}">${[['좌', 'lf'], ['좌중', 'lc'], ['중', 'cf'], ['우중', 'rc'], ['우', 'rf'], ['유', 'ss'], ['2', 'b2'], ['3', 'b3'], ['투', 'pp'], ['1', 'b1'], ['포', 'cc']].map(([d, a]) => `<button type="button" style="grid-area:${a}" data-a="d" data-d="${d}">${d}</button>`).join('')}</div>`; }
    function padHtml(m) {
        if (m === 'A') return `<div class="sb-pad pa"><div class="lbl">① 결과</div><div class="g3">${kb('H1')}${kb('H2')}${kb('H3')}${kb('BB')}${kb('HP')}${kb('K')}${kb('GO')}${kb('FO')}${kb('LO')}${kb('HR')}${kb('IHR')}${kb('E')}${kb('SF')}${kb('FF')}${kb('SH')}${kb('IH')}${kb('FC')}${kb('KN')}${kb('KR')}${kb('DP')}</div><div class="lbl">② 공이 간 곳${ui.pick ? ' — ' + KIND[ui.pick].n + ' 어디로?' : ''}</div>${fieldPad()}</div>`;
        if (m === 'D') { const dk = k => `<button type="button" class="kb ${KIND[k].c}" data-drag="${k}">${KIND[k].n}</button>`;
            if (DLAY === 'A') return `<div class="sb-pad pd da"><div class="g5 tap">${kb('BB')}${kb('HP')}${kb('K')}${kb('SH')}${kb('FC')}${kb('KN')}${kb('KR')}</div><div class="g3 drag">${['IHR', 'FF', 'SF', 'HR', 'E', 'LO', 'GO', 'FO', 'IH', 'H1', 'H2', 'H3', 'DP'].map(dk).join('')}</div><div class="lbl">↑ 결과를 <b>누른 채</b> 공이 간 쪽으로 밀고 떼기 · 4구 · 사구 · K는 그냥 누르기</div></div>`;
            return `<div class="sb-pad pd"><div class="lbl">결과를 <b>누른 채</b> 공이 간 쪽으로 밀고 떼기 · 4구 · 사구 · K는 그냥 누르기</div><div class="g3 drag">${['H1', 'H2', 'H3', 'GO', 'FO', 'LO', 'E', 'HR', 'SF', 'IH', 'IHR', 'FF', 'DP'].map(dk).join('')}${kb('BB')}${kb('HP')}${kb('K')}${kb('SH')}${kb('FC')}${kb('KN')}${kb('KR')}</div></div>`; }
        if (m === 'E') {
            const cols = ['H1', 'H2', 'GO', 'FO', 'E'];
            return `<div class="sb-pad pe"><div class="q4">${kb('BB')}${kb('HP')}${kb('K')}${kb('SH')}</div><div class="mx"><span></span>${cols.map(k => `<span class="ch">${KIND[k].n}</span>`).join('')}${['좌', '좌중', '중', '우중', '우', '유', '2', '3', '1', '투', '포'].map(d => `<span class="rh">${DIRNAME[d]}</span>` + cols.map(k => { const dim = (/[좌중우]/.test(d) && k === 'GO') || (/[투포123유]/.test(d) && k === 'H2'); return `<button type="button" class="${KIND[k].c}${dim ? ' dim' : ''}" data-a="kd" data-k="${k}" data-d="${d}">${d}${KIND[k].s}</button>`; }).join('')).join('')}</div><div class="more">${['H3', 'HR', 'IHR', 'LO', 'SF', 'FF', 'IH', 'DP', 'KN', 'KR'].map(k => kb(k, 'sm')).join('')}${kb('FC', 'sm')}</div>${ui.pick ? dirRow() : ''}</div>`;
        }
        // B: 기록표 칸 방식 — 기호 판은 작게, 기록표가 주인공
        if (LAY === 'B') {   // 자주 쓰는 10개 + 「기타」
            const ex = NEW === 'B' ? ['KN', 'KR'] : ['KN', 'KR', 'DP'];   // 낫아웃 · 병살타 (B안은 K 갈래 · 병살 버튼이 따로 있지만 고치기용으로 기타에도)
            const more = ui.more ? `<div class="sb-more${NEW === 'A' ? ' wide' : ''}">${['H3', 'HR', 'IHR', 'IH', 'LO', 'FF', 'SF', 'FC'].concat(ex).map(k => kb(k)).join('')}<button type="button" class="kb x" data-a="more">닫기</button></div>` : '';
            if (NEW === 'B') return `<div class="sb-pad pb lb"><div class="g5 g6">${kb('BB')}${kb('HP')}${kb('K', '', ' ▾')}${kb('H1')}${kb('H2')}${kb('GO')}${kb('FO')}${kb('E')}${kb('SH')}${kb('DP')}<button type="button" class="kb etc${ui.more ? ' sel' : ''}" data-a="more">기타 ▴</button></div>${dirRow()}${more}</div>`;
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
        if (ui.edit != null) { const e = G.log.find(x => x.id === ui.edit); const q = e ? slotOf(e.t, e.s).ps[e.p] : null; return `<div class="sb-now ed"><span><b>고치는 중</b> · ${e ? e.s + '번 ' + esc(q && (q.name || q.no) || '') + ' ' + e.i + '회 「' + esc(sym(e)) + '」' : ''} → 새 기호를 누르세요</span><button type="button" data-a="del">지우기</button>${wolBtn()}<button type="button" data-a="editoff">취소</button></div>`; }
        if (ui.ask) { const a = ui.ask, e = a.id ? G.log.find(x => x.id === a.id) : null;
            if (a.y === 'slot') return `<div class="sb-now ask"><span><b>${esc(G.tm.them.name)}</b> 다음 타자가 ${nSlots('them') + 1}번인가요? <small>연습경기</small></span><button type="button" class="pri" data-a="slot+" data-t="them">＋ ${nSlots('them') + 1}번 추가</button><button type="button" data-a="askx">아니요, 1번</button></div>`;
            if (e && a.y === 'K') return `<div class="sb-now ask"><span>방금 <b>K</b> · ${e.s}번 ${esc(pName(e.t, e.s, e.p))} — 낫아웃이었나요?</span><button type="button" data-a="conv" data-k="KN">K(낫아웃)</button><button type="button" data-a="conv" data-k="KR">출루</button><button type="button" data-a="askx">✕</button></div>`;
            if (e && a.y === 'GO') return `<div class="sb-now ask"><span>방금 <b>${esc(sym(e))}</b> · ${esc(pName(e.t, e.s, e.p))} — 병살타였나요?</span><button type="button" class="pri" data-a="conv" data-k="DP">병살타</button><button type="button" data-a="askx">✕</button></div>`; }
        return `<div class="sb-now"><span class="no">${esc(p.no || '?')}</span><span class="nm">${esc(p.name || (p.no ? '' : '배번 넣기'))}</span><span class="sub">${G.cur.s}번${p.pos ? ' · ' + esc(p.pos) : ''} · ${st.ab}타수 ${st.h}안타</span><button type="button" data-a="who" data-t="${t}" data-s="${G.cur.s}" data-p="${Math.max(0, slotOf(t, G.cur.s).ps.length - 1)}">선수</button>${wolBtn()}</div>`;
    }
    function wolBtn() { return `<button type="button" class="wol${ui.wol ? ' on' : ''}" data-a="wol" title="외야수 키를 넘긴 타구">${ui.wol ? '✓ 월' : '월'}</button><button type="button" class="wol sen${ui.sen ? ' on' : ''}" data-a="sen" title="파울 라인 따라 간 타구">${ui.sen ? '✓ 선' : '선'}</button>`; }
    function statusHtml() {
        const t = G.cur.t, o = outs(t, G.cur.i);
        return `<div class="sb-status${defending() && PITV !== 'A' ? ' haspit' : ''}"><b class="inn">${halfLabel(t, G.cur.i)}</b>${pitChip()}<button type="button" class="sc" data-a="board"><span>${esc(G.tm.us.name)} <b class="us">${total('us')}</b> : <b>${total('them')}</b> ${esc(G.tm.them.name)}</span><i>점수판 ▾</i></button><span class="outs" aria-label="${o}아웃">${[0, 1, 2].map(k => `<i class="${k < o ? 'on' : ''}"></i>`).join('')}</span></div>`;
    }
    function toolsHtml() {
        const t = G.cur.t;
        return `${LAY ? `<div class="sb-msg">${esc(ui.msg || '기록하면 여기에 표시돼요')}</div>` : `<div class="sb-undo"><span>${esc(ui.msg || '기록하면 여기에 표시돼요')}</span><button type="button" data-a="undo">↶ 되돌리기</button></div>`}
        ${LAY ? `<div class="sb-tools ic"><button type="button" class="run" data-a="run" data-t="${t}"><b>＋</b>득점</button><button type="button" data-a="ro"><b>🏃</b>주자 · 도루</button><button type="button" data-a="sub"><b>🔁</b>교체</button><button type="button" data-a="end"><b>⇄</b>공수교대</button><button type="button" data-a="undo" class="un"><b>↶</b>되돌리기</button><button type="button" data-a="menu"><b>⋯</b>더보기</button></div>` : `<div class="sb-tools"><button type="button" class="run" data-a="run" data-t="${t}">＋ 득점</button><button type="button" data-a="ro">🏃 주자아웃</button><button type="button" data-a="sub">🔁 교체</button><button type="button" data-a="end">공수교대</button><button type="button" data-a="menu">⋯ 더보기</button></div>`}`;
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
        if (ui.panel === 'menu') over = `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>${LAY ? '⚙ 설정' : '더보기'}</h3><div class="lbl">입력 방식 (기록은 그대로 이어져요)</div><div class="modes">${Object.keys(MODES).map(k => `<button type="button" data-a="mode" data-m="${k}" class="${k === m ? 'on' : ''}"><b>${k}안</b>${MODES[k]}</button>`).join('')}</div><button type="button" class="row" data-a="run" data-t="${other(t)}">＋ ${esc(G.tm[other(t)].name)} 득점</button><button type="button" class="row" data-a="togthem">${G.recThem ? '상대 타자 기록 끄기 (숫자만 올리기)' : '상대 타자도 타순별로 기록하기'}</button><button type="button" class="row" data-a="lineup">타순 · 선수 고치기</button>${defending() ? `<button type="button" class="row" data-a="pit">⚾ 우리 투수 바꾸기 · 투구 수</button>` : ''}${['us', 'them'].filter(x => x === 'us' || G.recThem).map(x => (nSlots(x) < 12 ? `<button type="button" class="row" data-a="slot+" data-t="${x}">＋ ${esc(G.tm[x].name)} ${nSlots(x) + 1}번 타자 추가 (연습경기)</button>` : '') + (nSlots(x) > 9 ? `<button type="button" class="row" data-a="slot-" data-t="${x}">− ${esc(G.tm[x].name)} ${nSlots(x)}번 타순 빼기</button>` : '')).join('')}<button type="button" class="row pri" data-a="finish">🏁 경기 끝 · 확인하고 보내기</button><button type="button" class="big" data-a="panel-x">닫기</button></div></div>`;
        if (ui.panel === 'who') over = whoPanel();
        if (ui.panel === 'dp') { const tt = ui.dpk && ui.dpk.conv ? (G.log.find(x => x.id === ui.dpk.conv) || {}).t || t : t, ii = ui.dpk && ui.dpk.conv ? (G.log.find(x => x.id === ui.dpk.conv) || {}).i || G.cur.i : G.cur.i, on = onBase(tt, ii);
            over = `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>병살타 · 같이 아웃된 주자는?</h3><div class="plist rn">${on.map(q => `<button type="button" data-a="dpr" data-s="${q.s}" data-p="${q.p}"><i>${q.b}루</i>${esc(pName(tt, q.s, q.p))}</button>`).join('')}</div><p class="hint">예: 1루 주자가 2루에서 아웃(6-4-3) → 1루 주자를 누르세요</p><button type="button" class="big" data-a="panel-x">취소</button></div></div>`; }
        if (ui.panel === 'kpick') over = `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>삼진 · 어떤 K인가요?</h3><div class="kpick"><button type="button" class="big k" data-a="k2" data-k="K"><b>K</b>삼진 아웃</button><button type="button" class="big k" data-a="k2" data-k="KN"><b>K(낫아웃)</b>공 빠졌지만 1루 송구 · 태그로 아웃</button><button type="button" class="big k" data-a="k2" data-k="KR"><b>K(낫아웃 출루)</b>1루 살아서 출루 · 아웃 안 늘어요</button></div><button type="button" class="big" data-a="panel-x">취소</button></div></div>`;
        if (ui.panel === 'runner') over = runnerPanel();
        if (ui.panel === 'rdel') { const e = G.log.find(x => x.id === ui.rdel); const w = e && (e.y === 'run' ? e.sc : e); over = `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>주자 기록 지우기</h3><p class="fin">${e && w ? esc(pName(e.t, w.s, w.p)) + ' · ' + e.i + '회 · ' + ({ ro: '주자아웃', sb: '도루', cs: '도루실패', run: '득점' })[e.y] : ''}</p><button type="button" class="big pri" data-a="rdel" data-id="${ui.rdel}">지우기</button><button type="button" class="big" data-a="panel-x">취소</button></div></div>`; }
        if (ui.panel === 'finish') over = finishPanel();
        if (ui.img) over += imgPanel();
        if (ui.panel === 'conflict') { let sv = null; try { sv = JSON.parse(ui.srv); } catch (e) {} const su = sv ? Object.values(sv.runs.us || {}).reduce((a, b) => a + (+b || 0), 0) : 0, st = sv ? Object.values(sv.runs.them || {}).reduce((a, b) => a + (+b || 0), 0) : 0;
            over = `<div class="sb-over"><div class="sb-panel" data-stop="1"><h3>⚠ 서버에 더 자세한 기록이 있어요</h3><p class="fin">서버 기록: 타석 <b>${paCount(sv)}</b>개 · ${esc(G.tm.us.name)} ${su} : ${st}<br>이 휴대폰 기록: 타석 <b>${paCount(G)}</b>개 · ${total('us')} : ${total('them')}</p><p class="fin">다른 휴대폰(대표님 등)에서 먼저 보낸 기록이에요. 이대로 보내면 그 기록이 지워져요.</p><button type="button" class="big pri" data-a="srvtake">📥 서버 기록 가져오기 (권장)</button><button type="button" class="big" data-a="panel-x">취소</button>${ui.forceAsk ? `<button type="button" class="big sbdanger" data-a="srvforce">정말 덮어쓰기 — 서버 기록이 지워져요</button>` : `<button type="button" class="big sbghost" data-a="srvforce">그래도 이 기록으로 덮어쓰기</button>`}</div></div>`; }
        if (ui.panel === 'askend') { const pi = G.cur.i - 1; over = `<div class="sb-over"><div class="sb-panel" data-stop="1"><h3>🏁 ${pi}회말까지 끝났어요</h3><p class="fin">${esc(G.tm.us.name)} ${total('us')} : ${total('them')} ${esc(G.tm.them.name)}</p><p class="hint">경기가 끝났으면 확인하고 서버에 보내요. 연장이면 계속 기록하세요.</p><button type="button" class="big pri" data-a="finish">🏁 경기 끝 · 확인하고 보내기</button><button type="button" class="big" data-a="panel-x">연장 · 계속 기록</button></div></div>`; }
        if (ui.panel === 'sheet') over = `<div class="sb-over full"><div class="sb-panel full" data-stop="1"><h3>📋 기록표 <small>칸을 누르면 고쳐요</small></h3>${sheet}<button type="button" class="big" data-a="panel-x">닫기</button></div></div>`;
        if (ui.panel === 'pit') over = pitPanel();
        const input = pitBar() + (on ? `${nowLine()}${baseHtml()}${padHtml(m)}` : simpleThem());
        return `${topBar((G.title || '경기') + ' · vs ' + G.tm.them.name, `${G.done ? '' : `<button type="button" class="sb-fin" data-a="finish">🏁 경기 끝</button>`}<button type="button" class="sb-mode" data-a="menu" aria-label="설정">${LAY ? '⚙ 설정' : m + '안 ▾'}</button>`)}
        <div class="sb-body m${m}${on ? '' : ' simple'}${LAY ? ' lay' + LAY : ''}${TAB ? ' tab' + TAB : ''}"><div class="sb-main">${G.done ? `<button type="button" class="sb-donebar" data-a="finish">🏁 경기 끝 · 다 고쳤으면 여기를 눌러 보내기</button>` : ''}${statusHtml()}${m === 'B' && on ? sheet : ''}${input}${toolsHtml()}${m !== 'B' || !on ? `<button type="button" class="sb-sheetbtn" data-a="sheet">📋 기록표 보기 · 고치기</button>` : ''}</div><div class="sb-side">${boardHtml(false)}${sheet}</div></div>${over}`;
    }
    function whoPanel() {
        const w = ui.who, sl = slotOf(w.t, w.s), p = sl.ps[w.p] || {};
        const posSel = `<select id="sbPos">${['', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'DH'].map(v => `<option value="${v}"${String(p.pos || '') === v ? ' selected' : ''}>${v ? v + (DIRPOS[v] ? ' ' + DIRPOS[v] : '') : '수비 위치'}</option>`).join('')}</select>`;
        const src0 = w.t === 'us' ? roster() : oppList(G.tm.them.name);
        const inLn = {}; G.tm[w.t].ln.forEach(x => { const q = x.ps[x.ps.length - 1]; inLn[q.no + '|' + q.name] = 1; });
        const src = w.sub ? src0.filter(q => !inLn[q.no + '|' + q.name]) : src0;   // 교체: 지금 뛰는 선수는 빼고 (벤치만)
        if (w.sub) {   // v2.154.0 빠른 교체: 팀 · 타순 고르고 선수를 한 번 누르면 바로 교체
            const chips = G.tm[w.t].ln.map((x, k) => `<button type="button" data-a="subslot" data-s="${k + 1}" class="${w.s === k + 1 ? 'on' : ''}"><b>${k + 1}</b>${esc(pName(w.t, k + 1, x.ps.length - 1))}</button>`).join('');
            const tsw = G.recThem ? `<div class="seg"><button type="button" data-a="subteam" data-t="us" class="${w.t === 'us' ? 'on' : ''}">${esc(G.tm.us.name)}</button><button type="button" data-a="subteam" data-t="them" class="${w.t === 'them' ? 'on' : ''}">${esc(G.tm.them.name)}</button></div>` : '';
            return `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>🔁 선수 교체 <small>대타 · 대주자 · 수비 교체 모두</small></h3>${defending() ? `<button type="button" class="big pitsub" data-a="pit">⚾ 투수 바꾸기${curPit() ? ' · 지금 ' + esc(pitLabel(curPit())) : ''}</button>` : ''}${tsw}<div class="lbl">① 누구를 바꿀까요? (타순)</div><div class="plist subs">${chips}</div><div class="lbl">② 들어갈 선수를 누르면 바로 바뀌어요</div><div class="plist">${src.map(q => `<button type="button" data-a="subnow" data-no="${esc(q.no)}" data-name="${esc(q.name)}"><b>${esc(q.no)}</b>${esc(q.name)}${q.grade ? `<small>${esc(q.grade)}학년</small>` : ''}</button>`).join('') || '<p class="hint">벤치 선수가 없어요. 아래에 배번 · 이름을 넣어 주세요.</p>'}</div>
            <details class="subman"><summary>명단에 없는 선수 직접 넣기</summary><div class="f2"><label>배번<input id="sbNo" inputmode="numeric" maxlength="3"></label><label>이름<input id="sbName" maxlength="10"></label></div>${posSel}<button type="button" class="big pri" data-a="whosave">교체하기</button></details>
            <button type="button" class="big" data-a="panel-x">닫기</button></div></div>`;
        }
        const list = src.length ? `<div class="lbl">${w.sub ? '바꿔 들어갈 선수' : '선수 고르기'}</div><div class="plist">${src.map(q => `<button type="button" data-a="whopick" data-no="${esc(q.no)}" data-name="${esc(q.name)}"><b>${esc(q.no)}</b>${esc(q.name)}${q.grade ? `<small>${esc(q.grade)}학년</small>` : ''}</button>`).join('')}</div>` : '';
        return `<div class="sb-over" data-a="panel-x"><div class="sb-panel" data-stop="1"><h3>${w.s}번 타자 ${w.sub ? '교체' : '정보'} <small>${esc(G.tm[w.t].name)}</small></h3><div class="f2"><label>배번<input id="sbNo" inputmode="numeric" maxlength="3" value="${w.sub ? '' : esc(p.no || '')}"></label><label>이름<input id="sbName" maxlength="10" value="${w.sub ? '' : esc(p.name || '')}"></label></div>${posSel}${list}<button type="button" class="big pri" data-a="whosave">${w.sub ? '교체하기' : '저장'}</button><button type="button" class="big" data-a="panel-x">취소</button></div></div>`;
    }
    const DIRPOS = { 1: '투수', 2: '포수', 3: '1루수', 4: '2루수', 5: '3루수', 6: '유격수', 7: '좌익수', 8: '중견수', 9: '우익수', DH: '지명' };
    function finishPanel() {
        const us = total('us'), th = total('them'), r = us > th ? '승' : us < th ? '패' : '무';
        return `<div class="sb-over"><div class="sb-panel" data-stop="1"><h3>🏁 경기 끝</h3><p class="fin"><b>${r === '승' ? '승리' : r === '패' ? '패배' : '무승부'}</b> ${esc(G.tm.us.name)} ${us} : ${th} ${esc(G.tm.them.name)}</p>${boardHtml(false)}${pitTable(false)}<p class="hint">틀린 칸이 있으면 「기록표 고치기」에서 먼저 고친 뒤 보내세요. 보낸 뒤에 다시 고쳐서 또 보내도 돼요(덮어써요).</p><button type="button" class="big" data-a="sheet">📋 기록표 고치기</button><button type="button" class="big" data-a="board">점수판 고치기</button><button type="button" class="big pri" data-a="send">📤 서버에 보내기 (저장)</button><button type="button" class="big" data-a="img">🖼 기록표 이미지 · 인쇄</button>${G.sentAt ? (G.sentSig && G.sentSig !== sig(bodyOf()) ? `<p class="hint warn">보낸 뒤에 고친 내용이 있어요. 한 번 더 보내 주세요.</p>` : `<p class="hint ok">✔ ${G.sentAt > 1 ? new Date(G.sentAt).toLocaleString('ko-KR') + ' 에 ' : '서버에 '}보냈어요</p>`) : ''}<div class="f2"><button type="button" class="big" data-a="resume">경기로 돌아가기</button><button type="button" class="big" data-a="close">닫기</button></div></div></div>`;
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
    // ---------- 🖼 v2.157.0 기록표 이미지 · 인쇄 (캔버스로 그림 · 서버 안 씀) ----------
    //   시안 window.SB_IMG: A 종이 기록표(가로) · B 공유 카드(남색) · C 선수별 요약표
    // 11-25 하코: 종이 기록표(A) · 남색 카드(B) 두 모양 × A4 가로 · 세로 — 이미지 창에서 고름 (마지막 고른 것 기억)
    const LSIMG = 'daeyeon_sb_img';
    function imgPref() { let v = {}; try { v = JSON.parse(lsGet(LSIMG) || '{}') || {}; } catch (e) {} return { s: v.s === 'B' ? 'B' : 'A', o: v.o === 'P' ? 'P' : 'L' }; }
    function teamRows(t) {
        const cells = {}, ends = {};
        G.log.forEach(e => { if (e.t !== t) return; let w = null; if (e.y === 'pa' || e.y === 'ro' || e.y === 'sb' || e.y === 'cs') w = e; else if (e.y === 'run' && e.sc && !e.auto) w = e.sc; if (w) (cells[e.i + '|' + w.s + '|' + w.p] = cells[e.i + '|' + w.s + '|' + w.p] || []).push(e); if (e.y === 'end') ends[e.i + '|' + e.s + '|' + (e.p || 0)] = 1; });
        const RL = { ro: '주자아웃', sb: '도루', cs: '도루실패', run: '득점' }, out = [];
        G.tm[t].ln.forEach((sl, si) => sl.ps.forEach((p, pi) => {
            const s = si + 1, st = pstat(t, s, pi), cs = {};
            for (let i = 1; i <= maxInn(); i++) { const es = cells[i + '|' + s + '|' + pi] || []; cs[i] = { m: es.filter(e => !RL[e.y]).map(e => ({ t: sym(e) + (e.r ? '·' + e.r : ''), c: KIND[e.k] ? KIND[e.k].c : '' })), r: es.filter(e => RL[e.y]).map(e => e.dp ? '병살' : RL[e.y]), end: !!(es.length && ends[i + '|' + s + '|' + pi]) }; }
            out.push({ s: pi ? '' : s, sub: !!pi, no: p.no || '', name: t === 'them' && !(ui.img && ui.img.nm) ? '' : (p.name || ''), pos: p.pos || '', cs, st });
        }));
        if (t === 'them') while (out.length > 1 && !out[out.length - 1].no && !Object.values(out[out.length - 1].cs).some(c => c.m.length || c.r.length)) out.pop();   // 상대 팀: 안 친 빈 타순은 뺌
        return out;
    }
    function imgCanvas(style, orient) {
        const n = maxInn(), us = total('us'), th = total('them'), res = G.done ? (us > th ? '승' : us < th ? '패' : '무') : '';
        const teams = ['us'].concat(G.recThem ? ['them'] : []), rows = {}; teams.forEach(t => { rows[t] = teamRows(t); });
        const F = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
        const dark = style === 'B';
        const P = dark ? { bg: '#0b1a33', card: '#122647', ink: '#ffffff', sub: '#b9c6dc', line: 'rgba(255,255,255,.14)', head: '#1b3563', h: '#4ade80', o: '#cbd5e1', w: '#7cb3ff', k: '#ff6b81', e: '#fdba74', gold: '#f5c542', r: '#ff6b81' }
            : { bg: '#ffffff', card: '#ffffff', ink: '#0f172a', sub: '#5b6577', line: '#b8c3d3', head: '#eef2f7', h: '#15803d', o: '#475569', w: '#2563eb', k: '#c8102e', e: '#c2620a', gold: '#0b2240', r: '#c8102e' };
        const W = orient === 'P' ? 1240 : 1754;
        const cv = document.createElement('canvas'), x = cv.getContext('2d');
        const font = (w, s) => { x.font = `${w} ${s}px ${F}`; };
        const text = (t, X, Y, col, al, w, s) => { if (w) font(w, s); x.fillStyle = col; x.textAlign = al || 'left'; x.fillText(String(t), X, Y); };
        const fitf = (t, w, s, mx) => { font(w, s); while (s > 9 && x.measureText(t).width > mx) { s -= 1; font(w, s); } return s; };
        const line = (x1, y1, x2, y2, c, lw) => { x.strokeStyle = c; x.lineWidth = lw || 1; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); };
        const M = style === 'A' ? 44 : 36;
        // 높이 계산 (먼저 한 번 재고 그림)
        const RH = style === 'A' ? 50 : style === 'B' ? 46 : 58, HDR = style === 'A' ? 150 : 250, BOARD = 130;
        let H = M + HDR + BOARD + 30;
        teams.forEach(t => { H += 56 + 40 + rows[t].length * RH + 24; });
        H += 80 + M;
        cv.width = W; cv.height = H;
        x.fillStyle = P.bg; x.fillRect(0, 0, W, H); x.textBaseline = 'middle';
        // ── 머리
        let y = M;
        const title = (G.title || '경기') + '  vs ' + G.tm.them.name, meta = [G.date, G.start, G.place].filter(Boolean).join(' · ');
        if (style === 'A') {
            text('경기 기록표', M, y + 22, P.sub, 'left', 700, 24);
            fitf(title, 900, 46, W - 2 * M - 420); text(title, M, y + 70, P.ink, 'left');
            text(meta, M, y + 118, P.sub, 'left', 600, 26);
            const sc = `${G.tm.us.name} ${us} : ${th} ${G.tm.them.name}${res ? '  ' + (res === '승' ? '승리' : res === '패' ? '패배' : '무승부') : ''}`;
            fitf(sc, 900, 44, 420); text(sc, W - M, y + 70, res === '패' ? P.o : P.r, 'right');
            y += HDR;
        } else {
            fitf(G.title || '경기', 900, 48, W - 2 * M); text(G.title || '경기', W / 2, y + 40, dark ? P.gold : P.ink, 'center');
            text(meta + ' · 경기 기록', W / 2, y + 92, P.sub, 'center', 600, 26);
            font(900, 92); const a = String(us), b = String(th);
            text(a, W / 2 - 40, y + 175, res === '패' ? P.o : (dark ? '#fff' : P.r), 'right'); text(':', W / 2, y + 168, P.sub, 'center', 900, 60); text(b, W / 2 + 40, y + 175, res === '승' ? P.o : P.ink, 'left', 900, 92);
            fitf(G.tm.us.name, 900, 34, 300); text(G.tm.us.name, W / 2 - 170, y + 175, P.ink, 'right'); fitf(G.tm.them.name, 900, 34, 300); text(G.tm.them.name, W / 2 + 170, y + 175, P.sub, 'left');
            if (res) { const lb = res === '승' ? '승리' : res === '패' ? '패배' : '무승부'; text(lb, W / 2, y + 232, res === '승' ? P.r : P.sub, 'center', 900, 30); }
            y += HDR;
        }
        // ── 점수판
        {
            const order = [G.first, other(G.first)], cols = n + 5, nameW = style === 'A' ? 260 : 190, cw = (W - 2 * M - nameW) / (n + 4), bh = 40;
            x.fillStyle = P.head; x.fillRect(M, y, W - 2 * M, bh);
            text('팀', M + 14, y + bh / 2, P.sub, 'left', 700, 22);
            for (let i = 1; i <= n; i++) text(i, M + nameW + (i - .5) * cw, y + bh / 2, P.sub, 'center', 700, 22);
            ['R', 'H', 'E', 'B'].forEach((k, j) => text(k, M + nameW + (n + j + .5) * cw, y + bh / 2, k === 'R' ? P.r : P.sub, 'center', 800, 22));
            order.forEach((t, r) => { const yy = y + bh * (r + 1), st = stat(t); line(M, yy, W - M, yy, P.line);
                fitf(G.tm[t].name, 800, 24, nameW - 20); text(G.tm[t].name, M + 14, yy + bh / 2, P.ink, 'left');
                for (let i = 1; i <= n; i++) { const pl = acted(t, i) || runs(t, i) > 0; text(pl ? runs(t, i) : '', M + nameW + (i - .5) * cw, yy + bh / 2, P.ink, 'center', 700, 24); }
                [st.R, st.H, st.E, st.B].forEach((v, j) => text(v, M + nameW + (n + j + .5) * cw, yy + bh / 2, j ? P.ink : P.r, 'center', 900, 24)); });
            x.strokeStyle = P.line; x.lineWidth = 1.5; x.strokeRect(M, y, W - 2 * M, bh * 3);
            y += bh * 3 + 30 + (BOARD - bh * 3 - 30 > 0 ? BOARD - bh * 3 - 30 : 0) + 20;
        }
        const colOf = c => ({ h: P.h, o: P.o, w: P.w, k: P.k, e: P.e })[c] || P.ink;
        // ── 팀 기록표
        teams.forEach(t => {
            const R = rows[t];
            text(G.tm[t].name + (t === 'them' && !(ui.img && ui.img.nm) ? '  (배번만)' : ''), M, y + 26, dark ? P.gold : P.ink, 'left', 900, 30); y += 56;
            if (style === 'C') {   // 선수별 요약: 결과를 순서대로 한 줄 + 타수 안타 타점 득점 도루
                const sx = W - M - 5 * 70, hd = ['타수', '안타', '타점', '득점', '도루'];
                x.fillStyle = P.head; x.fillRect(M, y, W - 2 * M, 40);
                text('타순 · 선수', M + 12, y + 20, P.sub, 'left', 700, 21); text('타석 결과 (회 순서)', M + 290, y + 20, P.sub, 'left', 700, 21);
                hd.forEach((h, j) => text(h, sx + (j + .5) * 70, y + 20, P.sub, 'center', 700, 21)); y += 40;
                R.forEach(r => { line(M, y, W - M, y, P.line);
                    text(r.s, M + 22, y + RH / 2, P.sub, 'center', 800, 24);
                    const nm = (r.no ? r.no + ' ' : '') + r.name; fitf(nm, r.sub ? 600 : 800, 26, 200); text(nm, M + 48, y + RH / 2, P.ink, 'left');
                    let xx = M + 290; for (let i = 1; i <= n; i++) r.cs[i].m.forEach(m => { const s0 = fitf(m.t, 800, 24, 140); const w = x.measureText(m.t).width; if (xx + w > sx - 10) return; text(m.t, xx, y + RH / 2, colOf(m.c), 'left'); xx += w + 18; });
                    [r.st.ab, r.st.h, r.st.rbi, r.st.r || 0, r.st.sb || 0].forEach((v, j) => text(v, sx + (j + .5) * 70, y + RH / 2, j === 1 && v ? P.h : P.ink, 'center', 800, 26));
                    y += RH; });
                x.strokeStyle = P.line; x.lineWidth = 1.5; x.strokeRect(M, y - R.length * RH - 40, W - 2 * M, R.length * RH + 40); y += 24; return;
            }
            const stc = style === 'A' ? ['타수', '안타', '타점', '득점', '도루'] : ['타수', '안타', '타점'];
            const odW = 44, nmW = style === 'A' ? 250 : 170, stW = style === 'A' ? 64 : 58, cw = (W - 2 * M - odW - nmW - stc.length * stW) / n;
            const top = y;
            x.fillStyle = P.head; x.fillRect(M, y, W - 2 * M, 40);
            text('타순', M + odW / 2, y + 20, P.sub, 'center', 700, 19); text('배번 · 이름', M + odW + 10, y + 20, P.sub, 'left', 700, 20);
            for (let i = 1; i <= n; i++) text(i + '회', M + odW + nmW + (i - .5) * cw, y + 20, P.sub, 'center', 700, 20);
            stc.forEach((h, j) => text(h, W - M - (stc.length - j - .5) * stW, y + 20, P.sub, 'center', 700, 19)); y += 40;
            R.forEach(r => {
                line(M, y, W - M, y, r.sub ? P.line : P.line, r.sub ? .6 : 1);
                text(r.s, M + odW / 2, y + RH / 2, P.sub, 'center', 800, 22);
                const nm = (r.no ? r.no + ' ' : '') + r.name; fitf(nm, r.sub ? 600 : 800, 23, nmW - 30); text(nm, M + odW + 10, y + RH / 2 - (r.pos ? 6 : 0), P.ink, 'left');
                if (r.pos) text(r.pos, M + odW + 10, y + RH - 9, P.sub, 'left', 600, 14);
                for (let i = 1; i <= n; i++) { const c = r.cs[i], cx = M + odW + nmW + (i - .5) * cw; const ms = c.m.map(m => m.t);
                    if (ms.length) { const ln1 = []; c.m.forEach(m => { font(800, 22); const k = m.t.indexOf('('); if (k > 0 && x.measureText(m.t).width > cw - 10) { ln1.push({ t: m.t.slice(0, k), c: m.c }); ln1.push({ t: m.t.slice(k), c: m.c }); } else ln1.push(m); });   // 「K(낫아웃 출루)」처럼 긴 기호는 두 줄로
                        let yy = y + RH / 2 - (c.r.length ? 7 : 0) - (ln1.length - 1) * 9; ln1.forEach(m => { fitf(m.t, 800, 22, cw - 10); text(m.t, cx, yy, colOf(m.c), 'center'); yy += 18; }); }
                    if (c.r.length) { const rt = '(' + c.r.join(',') + ')'; fitf(rt, 600, 13, cw - 6); text(rt, cx, y + RH - 9, P.sub, 'center'); }
                    if (c.end) { line(cx + cw / 2 - 16, y + RH - 6, cx + cw / 2 - 8, y + 6, P.r, 2); line(cx + cw / 2 - 9, y + RH - 6, cx + cw / 2 - 1, y + 6, P.r, 2); } }
                [r.st.ab, r.st.h, r.st.rbi, r.st.r || 0, r.st.sb || 0].slice(0, stc.length).forEach((v, j) => text(v, W - M - (stc.length - j - .5) * stW, y + RH / 2, j === 1 && v ? P.h : P.ink, 'center', 800, 23));
                y += RH;
            });
            // 세로줄
            line(M + odW, top, M + odW, y, P.line); line(M + odW + nmW, top, M + odW + nmW, y, P.line, 2);
            for (let i = 1; i < n; i++) line(M + odW + nmW + i * cw, top, M + odW + nmW + i * cw, y, P.line, .8);
            line(W - M - stc.length * stW, top, W - M - stc.length * stW, y, P.line, 2);
            x.strokeStyle = P.line; x.lineWidth = 1.5; x.strokeRect(M, top, W - 2 * M, y - top); y += 24;
        });
        // ── 아래 설명 · 학교
        const lg = '초록 안타 · 파랑 4사구 · 빨강 삼진 · 회색 아웃 · // 이닝 끝 · 「우선2·1」의 ·1 = 타점 · GH 그라운드 홈런 · 월 외야수 키 넘김 · 선 라인 선상';
        fitf(lg, 600, 18, W - 2 * M); text(lg, M, y + 18, P.sub, 'left');
        text('대연초등학교 야구부 · dybbr.github.io', W - M, y + 54, P.sub, 'right', 700, 22);
        // A4 비율 종이에 맞춤 (넘치면 통째로 줄이고, 남으면 아래를 비움)
        const AH = Math.round(orient === 'P' ? W * 1.4142 : W / 1.4142), out = document.createElement('canvas'), o = out.getContext('2d');
        out.width = W; out.height = AH; o.fillStyle = P.bg; o.fillRect(0, 0, W, AH);
        const k = Math.min(1, AH / H); o.drawImage(cv, (W - W * k) / 2, 0, W * k, H * k);
        if (dark) { o.strokeStyle = 'rgba(245,197,66,.55)'; o.lineWidth = 3; o.strokeRect(18, 18, W - 36, AH - 36); }
        return out;
    }
    function imgBlob(style, orient) { return new Promise((res, rej) => { try { imgCanvas(style, orient).toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png'); } catch (e) { rej(e); } }); }
    function imgName() { const im = ui.img || {}; return `daeyeon-scoresheet-${G.date || 'game'}-${im.s === 'B' ? 'card' : 'paper'}-${im.o === 'P' ? 'portrait' : 'landscape'}${G.tm && G.tm.them ? '-' + G.tm.them.name : ''}.png`; }
    let imgUrl = '';
    function imgOpen() { const pf = imgPref(); ui.img = { url: '', s: pf.s, o: pf.o, nm: '' }; imgMake(); }
    function imgMake() { const want = ui.img; if (!want) return; want.url = ''; want.blob = null; draw();
        imgBlob(want.s, want.o).then(b => { if (ui.img !== want) return; if (imgUrl) URL.revokeObjectURL(imgUrl); imgUrl = URL.createObjectURL(b); want.url = imgUrl; want.blob = b; draw(); }).catch(() => note('fail', '이미지를 못 만들었캉', '잠시 후 다시 해 주세요')); }
    function imgPanel() {
        const im = ui.img, u = im && im.url, canShare = !!(navigator.canShare && navigator.share);
        const seg = (lab, key, opts) => `<div class="seg"><span>${lab}</span>${opts.map(([v, t]) => `<button type="button" data-a="imgopt" data-k="${key}" data-v="${v}" class="${im[key] === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
        return `<div class="sb-over" data-a="imgx"><div class="sb-panel wide sb-imgp" data-stop="1"><h3>🖼 기록표 이미지 <small>${im.nm ? '상대 팀 이름도 들어가요 · 단톡방에 올릴 땐 꺼 주세요' : '상대 팀은 배번만 들어가요'}</small></h3>${seg('모양', 's', [['A', '📄 종이 기록표'], ['B', '🌙 남색 카드']])}${seg('A4', 'o', [['L', '가로'], ['P', '세로']])}${G.recThem && canRecord() ? seg('상대 이름', 'nm', [['', '빼기'], ['1', '넣기 (보관용)']]) : ''}<div class="sb-imgbox ${im.o === 'P' ? 'pt' : 'ls'}">${u ? `<img src="${u}" alt="기록표 이미지">` : '<p class="hint">만드는 중…</p>'}</div>
        <div class="f3"><button type="button" class="big pri" data-a="imgsave"${u ? '' : ' disabled'}>💾 저장</button>${canShare ? `<button type="button" class="big" data-a="imgshare"${u ? '' : ' disabled'}>📤 공유</button>` : ''}<button type="button" class="big" data-a="imgprint"${u ? '' : ' disabled'}>🖨 인쇄</button></div><button type="button" class="big" data-a="imgx">닫기</button></div></div>`;
    }
    function imgSave() { const b = ui.img && ui.img.blob; if (!b) return; const url = URL.createObjectURL(b), a = document.createElement('a'); a.href = url; a.download = imgName(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); note('done', '기록표 이미지 저장했캉! 🖼️', '안 보이면 이미지를 길게 눌러 저장해 주세요'); }
    async function imgShare() { const b = ui.img && ui.img.blob; if (!b) return; const f = new File([b], imgName(), { type: 'image/png' }); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: (G.title || '경기') + ' 기록표 · 대연초 야구부' }); else imgSave(); } catch (e) {} }
    function imgPrint() {   // 인쇄: 이미지 한 장만 종이에 (가로 기록표는 A4 가로)
        const u = ui.img && ui.img.url; if (!u) return;
        let box = document.getElementById('sbPrint'); if (!box) { box = document.createElement('div'); box.id = 'sbPrint'; document.body.appendChild(box); }
        let st = document.getElementById('sbPrintCss'); if (!st) { st = document.createElement('style'); st.id = 'sbPrintCss'; document.head.appendChild(st); }
        st.textContent = `#sbPrint{display:none}@media print{@page{size:A4 ${ui.img.o === 'P' ? 'portrait' : 'landscape'};margin:8mm}html,body{height:auto!important;overflow:visible!important;background:#fff!important}body>*:not(#sbPrint){display:none!important}#sbPrint{display:block!important}#sbPrint img{width:100%;height:auto;max-height:${ui.img.o === 'P' ? '277mm' : '190mm'};object-fit:contain;display:block;margin:0 auto}}`;
        box.innerHTML = `<img src="${u}" alt="">`;
        const im = box.querySelector('img'), go = () => { try { window.print(); } catch (e) { note('fail', '이 기기는 인쇄가 안 되캉', '이미지를 저장해서 인쇄해 주세요'); } };
        if (im.complete) setTimeout(go, 50); else im.onload = () => setTimeout(go, 50);
    }
    function viewHtml() {
        return `${topBar('📋 ' + (G.title || '경기') + ' · vs ' + G.tm.them.name)}<div class="sb-view"><p class="hint">${esc(G.date)}${G.place ? ' · ' + esc(G.place) : ''}</p>${boardHtml(false)}<h3>${esc(G.tm.us.name)}</h3>${sheetHtml('us', true)}${G.recThem ? `<h3>${esc(G.tm.them.name)}</h3>${sheetHtml('them', true)}` : ''}${pitTable(true)}<p class="hint">초록 안타 · 파랑 4구·사구 · 빨강 삼진 · 회색 아웃 · // 이닝 끝 · 작은 숫자는 타점 · 홈 = 라인(라바콘) 넘긴 홈런 · GH = 그라운드 홈런 · K(낫아웃) = 낫아웃 아웃 · K(낫아웃 출루) = 낫아웃으로 1루 출루 (둘 다 삼진) · 병살 = 병살타 · 파플 = 파울플라이 · 월 = 외야수 키를 넘긴 타구 (우월2 = 우익수 키 넘긴 2루타) · 선 = 파울 라인 따라 간 타구 (좌선2 = 좌익선상 2루타)</p><button type="button" class="big pri" data-a="img">🖼 기록표 이미지 · 인쇄</button>${canRecord() && ui.canEdit ? `<button type="button" class="big" data-a="reopen">✏️ 이 기록 고치기</button>` : ''}</div>${ui.img ? imgPanel() : ''}`;
    }

    // ---------- 누르기 ----------
    function bind(r) {
        r.addEventListener('click', e => {
            const el = e.target.closest('[data-a]'); if (!el || !r.contains(el)) return;
            const a = el.dataset.a;
            if (a === 'panel-x') { if (e.target.closest('[data-stop]') && !e.target.closest('button[data-a="panel-x"]')) return; ui.panel = (G && G.done && (ui.panel === 'sheet' || ui.panel === 'board')) ? 'finish' : ''; ui.who = null; ui.dpr = null; ui.dpk = null; draw(); return; }
            if (a === 'imgx' && e.target.closest('[data-stop]') && !e.target.closest('button[data-a="imgx"]')) return;
            act(a, el);
        });
        r.addEventListener('change', e => { const s = e.target.closest('select[data-pos]'); if (s && G) { G.tm.us.ln[+s.dataset.pos].ps[0].pos = s.value; save(); } });
        r.addEventListener('input', e => { const s = e.target.closest('input[data-pc]'); if (!s || !G) return; const v = Math.min(200, parseInt(String(s.value).replace(/[^0-9]/g, ''), 10) || 0); G.pcnt = G.pcnt || {}; if (v) G.pcnt[s.dataset.pc] = v; else delete G.pcnt[s.dataset.pc]; save(); });   // ⚾ 투구 수 (비워도 됨)
        // D안: 누른 채 밀기
        let held = null, wh = null, pick = null;
        r.addEventListener('pointerdown', e => {
            const b = e.target.closest('[data-drag]'); if (!b) return;
            e.preventDefault(); held = b; b.classList.add('held'); try { b.setPointerCapture(e.pointerId); } catch (x) {}
            const pad = b.closest('.sb-pad'), rc = pad.getBoundingClientRect();
            // v2.155.1: 바퀴가 제목 줄 · 화면 밖으로 넘치지 않게 (떼는 곳은 손가락에서 가장 가까운 방향이라 바퀴가 옮겨져도 됨)
            const tb = document.querySelector('.sb .sb-top'), topY = (tb ? tb.getBoundingClientRect().bottom : 0) + 8, vh = window.innerHeight || 800;
            let cx = e.clientX, cy = e.clientY;
            if (DLAY === 'C') { cx = rc.left + rc.width / 2; cy = topY + 222; }
            else cy = Math.max(topY + 222, Math.min(vh - 90, cy));
            let x = cx - rc.left, y = cy - rc.top; x = Math.max(165, Math.min(rc.width - 165, x));
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
        if (a === 'k' && d.k === 'K' && NEW === 'B') { ui.panel = 'kpick'; draw(); return; }
        if (a === 'k2') { ui.panel = ''; record(d.k); return; }
        if (a === 'pit') { if (!defending()) return; ui.panel = 'pit'; ui.who = null; draw(); return; }
        if (a === 'pitsame') { const p = curPit(); if (p && defending()) setPit(p); ui.panel = ''; save(); draw(); return; }
        if (a === 'pitpick') { if (!defending()) return; setPit({ no: d.no, name: d.name }); ui.panel = ''; save(); draw(); return; }
        if (a === 'pcn') { const p = curPit(); if (!p) return; G.pcnt = G.pcnt || {}; const k = pkey(p); G.pcnt[k] = Math.max(0, Math.min(200, (G.pcnt[k] || 0) + (+d.n))); if (!G.pcnt[k]) delete G.pcnt[k]; save(); draw(); return; }
        if (a === 'dpr') { ui.dpr = { s: +d.s, p: +d.p }; ui.panel = ''; const dk = ui.dpk || {}; if (dk.conv) return convertLast(dk.conv, 'DP'); return record('DP', dk.d); }
        if (a === 'conv') return convertLast(ui.ask && ui.ask.id, d.k);
        if (a === 'askx') { ui.ask = null; draw(); return; }
        if (a === 'slot+') { const n0 = nSlots(d.t); addSlot(d.t); ui.ask = null; ui.panel = ''; if (d.t === 'us' && nSlots('us') > n0) { ui.who = { t: 'us', s: nSlots('us'), p: 0, sub: false }; ui.panel = 'who'; } save(); draw(); return; }
        if (a === 'slot-') { dropSlot(d.t); ui.panel = ''; save(); draw(); return; }
        if (a === 'k') { const K = KIND[d.k]; if (K.d) { ui.pick = (ui.pick === d.k ? null : d.k); draw(); } else record(d.k); return; }
        if (a === 'd') { if (!ui.pick) { ui.msg = '먼저 결과(안타 · 땅볼…)를 눌러 주세요'; draw(); return; } record(ui.pick, d.d); return; }
        if (a === 'kd') { ui.dir = null; record(d.k, d.d); return; }
        if (a === 'more') { ui.more = !ui.more; draw(); return; }
        if (a === 'dfirst') { ui.dir = d.d; draw(); return; }
        if (a === 'dirx') { ui.dir = null; draw(); return; }
        if (a === 'undo') return undo();
        if (a === 'run') { if (!recOn(d.t) || d.t !== G.cur.t) return addRun(d.t); ui.rn = { t: d.t }; ui.panel = 'runner'; draw(); return; }
        if (a === 'ro') { ui.rn = { t: G.cur.t }; ui.panel = 'runner'; draw(); return; }
        if (a === 'rpick') { ui.rn = { t: d.t, s: +d.s, p: +d.p }; ui.panel = 'runner'; draw(); return; }
        if (a === 'ract') { const r = ui.rn; if (r && r.s) runnerAct(r.t, r.s, r.p, d.x); return; }
        if (a === 'rdel') { ui.panel = ''; const ix = G.log.findIndex(x => x.id === +d.id); if (ix >= 0) { const e = G.log[ix]; if (e.y === 'run') { G.runs[e.t][e.i] = Math.max(0, runs(e.t, e.i) - 1); if (e.ref) { const pa = G.log.find(x => x.id === e.ref); if (pa) pa.r = Math.max(0, (pa.r || 0) - 1); } } G.log.splice(ix, 1); ui.msg = '그 주자 기록을 지웠어요'; save(); draw(); } return; }
        if (a === 'end') { endHalf(false); ui.msg = '공수교대 · ' + halfLabel(G.cur.t, G.cur.i); save(); draw(); return; }
        if (a === 'run+' || a === 'run-') return setRun(d.t, +d.i, a === 'run+' ? 1 : -1);
        if (a === 'adj') return adj('them', d.k, +d.n);
        if (a === 'adj2') return adj(d.t, d.k, +d.n);
        if (a === 'board' || a === 'menu' || a === 'sheet' || a === 'finish') { if (a === 'finish') { G.done = true; save(); } ui.panel = a; draw(); return; }
        if (a === 'mode') { lsSet(LSM, d.m); ui.panel = ''; ui.pick = null; draw(); return; }
        if (a === 'togthem') { G.recThem = !G.recThem; if (G.recThem && !G.tm.them.ln.length) G.tm.them.ln = Array.from({ length: 9 }, () => ({ ps: [{ no: '', name: '', pos: '' }] })); ui.panel = ''; save(); draw(); return; }
        if (a === 'sheett') { ui.sheetT = d.t; draw(); return; }
        if (a === 'cell') { ui.edit = +d.id; ui.pick = null; if (ui.panel === 'sheet') ui.panel = ''; const e = G.log.find(x => x.id === ui.edit); ui.wol = !!(e && e.w); ui.sen = !!(e && e.n); if (e && !ui.sheetT) ui.sheetT = e.t; draw(); return; }
        if (a === 'cellempty') { if (el.querySelector('.sy')) return; if (d.t !== G.cur.t) return; G.cur.i = +d.i; G.cur.s = +d.s; G.nx[d.t] = G.cur.s; ui.edit = null; ui.msg = d.i + '회 ' + d.s + '번 칸부터 기록해요'; if (ui.panel === 'sheet') ui.panel = ''; save(); draw(); return; }
        if (a === 'editoff') { ui.edit = null; ui.pick = null; draw(); return; }
        if (a === 'del') { const ix = G.log.findIndex(x => x.id === ui.edit); if (ix >= 0) G.log.splice(ix, 1); ui.edit = null; ui.msg = '그 칸을 지웠어요'; save(); draw(); return; }
        if (a === 'who') { ui.who = { t: d.t, s: +d.s, p: +d.p, sub: false }; ui.panel = 'who'; draw(); return; }
        if (a === 'sub') { const t = G.cur.t; ui.who = { t: t, s: G.cur.s, p: slotOf(t, G.cur.s).ps.length - 1, sub: true }; ui.panel = 'who'; draw(); return; }
        if (a === 'subslot') { ui.who.s = +d.s; ui.who.p = slotOf(ui.who.t, ui.who.s).ps.length - 1; draw(); return; }
        if (a === 'subteam') { ui.who = { t: d.t, s: 1, p: slotOf(d.t, 1).ps.length - 1, sub: true }; draw(); return; }
        if (a === 'subnow') { const w = ui.who, sl = slotOf(w.t, w.s), q = { no: d.no, name: d.name, pos: (sl.ps[sl.ps.length - 1] || {}).pos || '' }; sl.ps.push(q); push({ y: 'sub', t: w.t, s: w.s }); ui.msg = '🔁 ' + w.s + '번 교체 · ' + (q.name || '#' + q.no); ui.panel = ''; ui.who = null; save(); draw(); return; }
        if (a === 'rmark') { const e = G.log.find(x => x.id === +d.id); if (!e) return; ui.rdel = e.id; ui.panel = 'rdel'; draw(); return; }
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
        if (a === 'img') return imgOpen();
        if (a === 'imgopt') { if (!ui.img) return; if (d.k === 'nm' && !canRecord()) return; ui.img[d.k] = d.v; lsSet(LSIMG, JSON.stringify({ s: ui.img.s, o: ui.img.o })); return imgMake(); }
        if (a === 'imgx') { ui.img = null; draw(); return; }
        if (a === 'imgsave') return imgSave();
        if (a === 'imgshare') return imgShare();
        if (a === 'imgprint') return imgPrint();
        if (a === 'sen') { ui.sen = !ui.sen; if (ui.sen) ui.wol = false; ui.msg = ui.sen ? '「선」 켜짐 · 다음 안타를 좌 · 우 방향으로 넣으면 「우선2」 「좌선3」처럼 적혀요' : ''; draw(); return; }
        if (a === 'wol') { ui.wol = !ui.wol; if (ui.wol) ui.sen = false; ui.msg = ui.wol ? '「월」 켜짐 · 다음 안타 · 홈런을 외야 방향으로 넣으면 「우월2」처럼 적혀요' : ''; draw(); return; }
        if (a === 'srvtake') { try { adopt(ui.srv); ui.srv = null; ui.forceAsk = false; ui.panel = G.done ? 'finish' : ''; ui.screen = 'game'; ui.msg = '서버 기록을 가져왔어요'; note('done', '서버 기록 가져왔캉! ✓'); draw(); } catch (e) { note('fail', '못 가져왔캉…', e.message); } return; }
        if (a === 'srvforce') { if (!ui.forceAsk) { ui.forceAsk = true; draw(); return; } ui.forceAsk = false; ui.force = true; ui.panel = 'finish'; ui.srv = null; return send(); }
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
    function bodyOf() { return JSON.stringify({ v: G.v, id: G.id, ev: G.ev, date: G.date, title: G.title, place: G.place, start: G.start, first: G.first, recThem: G.recThem, tm: G.tm, log: G.log.map(e => { const o = Object.assign({}, e); delete o.pc; return o; }), runs: G.runs, adj: G.adj, cur: G.cur, nx: G.nx, seq: G.seq, pcnt: G.pcnt || {}, pit: pitStats().map(q => ({ no: q.no, name: q.name, outs: q.outs, bf: q.recBf ? q.bf : null, h: q.recBf ? q.h : null, bb: q.recBf ? q.bb : null, k: q.recBf ? q.k : null, r: q.r, pc: q.pc || 0, inn: q.inn })), begun: true, done: true }); }
    function sig(b) { let h = 0; for (let k = 0; k < b.length; k++) h = (h * 31 + b.charCodeAt(k)) | 0; return b.length + ':' + h; }
    // 🛡 v2.154.0: 서버에 있는 기록을 다른 기기의 빈 기록으로 덮어쓰지 않게
    function paCount(g) { return g && Array.isArray(g.log) ? g.log.filter(e => e.y === 'pa').length : 0; }
    async function serverRec(id) {
        const rj = await fetch(apiGetUrl('action=gameRecord&id=' + encodeURIComponent(id)), { cache: 'no-store' }).then(x => x.json());
        if (rj && rj.result === 'success' && rj.json) return rj.json;
        if (rj && rj.result === 'none') return '';
        if (rj && rj.result === 'error' && /없/.test(rj.message || '')) return '';
        throw new Error((rj && rj.message) || '서버 확인 실패');
    }
    function adopt(json) {
        G = JSON.parse(json); G.sentAt = G.sentAt || 1; G.sentSig = sig(json); G.begun = true;
        G.log.forEach(e => { e.pc = { cur: Object.assign({}, G.cur), nx: Object.assign({}, G.nx) }; });
        save();
    }
    async function send() {
        if (!G || ui.sending) return;
        if (!canRecord()) { note('fail', '로그인 시간이 지났캉…', '기록은 휴대폰에 그대로 있어요. 다시 로그인한 뒤 「경기 기록 이어서 하기」에서 보내 주세요.'); return; }   // v2.155.2
        if (!ui.force) {   // 보내기 전에 서버 기록과 비교 — 서버 쪽 타석이 더 많으면 멈춤
            ui.sending = true; note('saving', '서버 기록과 맞춰 보는 중이캉');
            let sj = null;
            try { sj = await serverRec(G.id); } catch (e) { ui.sending = false; note('fail', '서버 확인이 안 됐캉…', '인터넷을 확인하고 다시 보내 주세요. (기록은 휴대폰에 그대로 있어요)'); return; }
            ui.sending = false;
            let sv = null; try { sv = sj ? JSON.parse(sj) : null; } catch (e) {}
            if (sv && paCount(sv) > paCount(G) && sig(sj) !== G.sentSig) { ui.srv = sj; ui.panel = 'conflict'; draw(); return; }
        }
        ui.force = false;
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
        try { const left = parseInt(localStorage.getItem('daeyeon_auth_expire') || '0', 10) - Date.now(); if (canRecord() && left < 2 * 3600 * 1000) note('info', '로그인 시간이 ' + Math.max(1, Math.round(left / 60000)) + '분 남았캉', '경기 중에 끝나도 기록은 계속돼요. 보낼 때만 다시 로그인하면 돼요.'); } catch (e) {}
        if (evId && paCount(G) === 0 && canRecord()) {   // 🛡 v2.154.0: 이 기기에 기록이 없으면 서버 기록부터 확인 (다른 기기에서 보낸 것)
            const want = G;
            serverRec(evId).then(sj => { if (!sj || G !== want) return; adopt(sj); ui.screen = 'game'; if (G.done) ui.panel = 'finish'; ui.msg = '서버에 저장된 기록을 불러왔어요'; note('done', '서버 기록 불러왔캉! ✓'); draw(); }).catch(() => {});
        }
    }
    async function view(evId) {
        ui = { screen: 'view', pick: null, edit: null, sheetT: null, panel: '', msg: '', who: null, canEdit: false };
        const loc = localFor(evId);
        if (loc && loc.bg && load(loc.id) && paCount(load(loc.id)) > 0) { G = load(loc.id); ui.canEdit = true; draw(); return; }   // v2.154.0: 빈 기록이면 서버 것을 봄
        note('saving', '기록표 불러오는 중이캉');
        try {
            const rj = await fetch(apiGetUrl('action=gameRecord&id=' + encodeURIComponent(evId)), { cache: 'no-store' }).then(x => x.json());
            if (!rj || rj.result !== 'success') throw new Error('저장된 기록표가 없어요.');
            if (canRecord()) { adopt(rj.json); ui.canEdit = true; }
            else { G = JSON.parse(rj.json); G.sentAt = G.sentAt || 1; G.sentSig = sig(rj.json); G.begun = true; }
            note('done', '기록표 가져왔캉! ✓'); draw();
        } catch (err) { note('fail', null, err.message); G = null; }
    }
    function hasRecord(evId) { const l = localFor(evId); return !!(l && l.bg && paCount(load(l.id)) > 0) || recIds.indexOf(evId) !== -1 || (Array.isArray(window.SB_REC_IDS) && window.SB_REC_IDS.indexOf(evId) !== -1); }
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
