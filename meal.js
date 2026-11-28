// ==========================================================
// 🍱 동계훈련 급식당번 신청 (v2.162.0 · 하코 11-28 선택: A안 「공연장 좌석표」)
//   · 배식차가 오고 학부모 3팀이 배식을 도움 → 날짜마다 신청 칸 3개 + 후보 칸 1개 (운영진이 바꿀 수 있음)
//   · 1팀 = 선수 1명의 학부모님 · 대상 학년만 신청 (기본 5·4·3·2학년, 6학년 빼기)
//   · 달력 격자(주 × 요일)에서 빈 칸을 눌러 고르고 「신청하기」 · 우리 칸을 누르면 취소
//   · 같은 칸을 동시에 누르면 서버가 한 줄로 세워 먼저 온 신청만 받음 → 늦은 쪽엔 「방금 찼어요」 + 가까운 빈 칸
//   · 신청 칸을 취소하면 그날 후보가 자동으로 올라감
//   · 운영진(대표님 · 총무님 · 개발자): 기간 달력(시작 → 끝 누르기 · 주말 빼기 · 쉬는 날 빼기) · 칸 수 · 횟수 · 열기/마감 설정,
//     빈 칸에 선수 넣기 · 빼기, 현황판(미신청 선수 · 날짜별 표 · 단톡방 글 복사)
//   · 서버 호출: 앱을 켤 때 설정만 같이 옴(bootstrap · 시트 안 읽음) + 화면을 열 때 1번 + 누를 때 1번 (서버 v2.50.0)
//   · index.html 의 players · apiGetJson · escapeHtml · bkNotify · copyText · getActiveUser · currentRole · canEditSchedule · dutyMineNext 사용
// ==========================================================
(function () {
    'use strict';
    const ADMIN_ROLES = ['dev', 'super', 'general', 'sub'];
    const HOO = '후보';
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const note = (st, t, sub) => { try { bkNotify(st, t, sub); } catch (e) {} };
    const isAdmin = () => { try { return ADMIN_ROLES.indexOf(currentRole) !== -1; } catch (e) { return false; } };
    const canEdit = () => { try { return canEditSchedule(); } catch (e) { return false; } };
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dOf = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
    const todayStr = () => ymd(new Date());
    const md = s => { const d = dOf(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
    const mdw = s => { const d = dOf(s); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };
    const dtTxt = s => { if (!s) return ''; const [a, b] = String(s).split(' '); const d = dOf(a); const h = parseInt(b, 10), m = (b || '').slice(3, 5); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m && m !== '00' ? ' ' + m + '분' : ''}`; };
    const gnum = g => String(g || '').replace(/[^0-9]/g, '').slice(0, 1);
    const pl = () => (typeof players !== 'undefined' && Array.isArray(players)) ? players : [];
    const same = (a, b) => (Number(a.no) > 0 && Number(b.no) > 0) ? Number(a.no) === Number(b.no) : a.name === b.name;

    let CFG = null;          // bootstrap 으로 받은 설정
    let S = null;            // 열린 창 상태
    let lastBoard = null, lastAt = 0;

    // ---------- 대상 · 우리 아이 ----------
    function eligible(cfg) {
        const gs = (cfg && cfg.grades) || ['5', '4', '3', '2'];
        return pl().filter(p => p && p.name && p.visible !== false && gs.indexOf(gnum(p.grade)) !== -1)
            .sort((a, b) => (gnum(b.grade) - gnum(a.grade)) || ((Number(a.no) || 999) - (Number(b.no) || 999)));
    }
    function myKids(cfg) {
        let u = null; try { u = getActiveUser(); } catch (e) {}
        const kids = (u && Array.isArray(u.children)) ? u.children.filter(c => c && (c.name || c.no)) : [];
        const el = eligible(cfg);
        return kids.map(c => el.find(p => same(p, c))).filter(Boolean);
    }
    const isMineRow = r => r.mine || (S && S.kids.some(k => same(k, r)));

    // ---------- 칸 계산 ----------
    function slotsOf(d) {
        const c = S.cfg, rows = S.rows.filter(r => r.d === d);
        const main = []; for (let i = 1; i <= c.per; i++) main.push({ d, s: String(i), r: rows.find(r => r.s === String(i)) || null });
        const hoo = []; const hr = rows.filter(r => r.s === HOO); for (let i = 0; i < c.hoo; i++) hoo.push({ d, s: HOO, r: hr[i] || null });
        return { main, hoo, left: main.filter(x => !x.r).length };
    }
    function mineCount(k) {
        const m = S.rows.filter(r => r.s !== HOO && (k ? same(k, r) : isMineRow(r)));
        const h = S.rows.filter(r => r.s === HOO && (k ? same(k, r) : isMineRow(r)));
        return { main: m, hoo: h };
    }
    function limitNow() { const c = S.cfg; return c.max + (c.extraFrom && S.now >= c.extraFrom ? 1 : 0); }

    // ---------- 일정 탭 배너 · 관리 탭 묶음 ----------
    function setCfg(cfg) {
        CFG = cfg || null;
        renderBanner();
        renderAdminGroup();
    }
    function bannerEl() {
        let el = document.getElementById('mealBanner');
        if (!el) {
            const duty = document.getElementById('dutyBanner');
            if (!duty || !duty.parentNode) return null;
            el = document.createElement('div');
            el.id = 'mealBanner'; el.className = 'ml-banner'; el.setAttribute('role', 'button'); el.tabIndex = 0;
            el.onclick = () => open();
            duty.parentNode.insertBefore(el, duty.nextSibling);
        }
        return el;
    }
    function renderBanner() {
        const el = bannerEl(); if (!el) return;
        const c = CFG;
        let ok = false; try { ok = typeof canViewSchedule !== 'function' || canViewSchedule(); } catch (e) {}
        if (!c || !c.on || !ok || c.end < todayStr()) { el.style.display = 'none'; return; }
        const now = nowLocal(), ph = c.open && now < c.open ? 'soon' : c.close && now >= c.close ? 'closed' : 'open';
        const kids = myKids(c), staff = isAdmin();
        if (!kids.length && !staff) { el.style.display = 'none'; return; }
        const when = `${md(c.start)} ~ ${md(c.end)}`;
        const sub = ph === 'soon' ? `${dtTxt(c.open)} 신청 시작` : ph === 'open' ? (c.close ? `${dtTxt(c.close)} 마감` : '신청 받는 중') : '신청 마감 · 당번표 보기';
        el.classList.toggle('hot', ph === 'open');
        el.innerHTML = `<span class="ml-bi" aria-hidden="true">🍱</span><div class="ml-bb"><div class="ml-bt">${esc(c.title || '동계훈련 급식당번')} ${ph === 'open' ? '<em>신청 중</em>' : ph === 'soon' ? '<em class="q">곧 시작</em>' : ''}</div>
            <div class="ml-bs">${when} · 하루 ${c.per}팀${c.hoo ? ' + 후보 ' + c.hoo : ''} · ${esc(sub)}</div></div><span class="ml-ba">›</span>`;
        el.style.display = 'flex';
    }
    function nowLocal() { const d = new Date(); return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function renderAdminGroup() {
        let g = document.getElementById('adminGroupMeal');
        if (!g) {
            const anchor = document.getElementById('adminGroupOfc');
            if (!anchor || !anchor.parentNode) return;
            g = document.createElement('div');
            g.className = 'admin-group'; g.id = 'adminGroupMeal';
            anchor.parentNode.insertBefore(g, anchor);
        }
        if (!isAdmin()) { g.style.display = 'none'; return; }
        const c = CFG;
        g.innerHTML = `<div class="admin-group-title">🍱 동계훈련 급식당번</div>
            <p class="admin-role-desc" style="margin-bottom:8px">${c ? `${esc(c.title)} · ${md(c.start)} ~ ${md(c.end)} · 하루 ${c.per}팀 + 후보 ${c.hoo}${c.on ? '' : ' · <b>꺼 둠</b>'}` : '아직 신청을 만들지 않았어요. 기간을 고르면 학부모 화면에 신청 칸이 열려요.'}</p>
            <div class="admin-bar-btns"><button type="button" class="btn-sheet-link" onclick="MEAL.open()">🍱 ${c ? '당번표 · 현황판' : '보기'}</button>${canEdit() ? `<button type="button" class="btn-sheet-link" onclick="MEAL.open('set')">⚙ ${c ? '기간 · 설정' : '신청 만들기'}</button>` : ''}</div>`;
        g.style.display = '';
    }

    // ---------- 창 ----------
    function ov() {
        let o = document.getElementById('mealOv');
        if (!o) {
            o = document.createElement('div'); o.id = 'mealOv'; o.className = 'ml-ov';
            o.addEventListener('click', onClick);
            document.body.appendChild(o);
        }
        return o;
    }
    async function open(tab) {
        const o = ov();
        S = { cfg: CFG, days: [], rows: [], now: nowLocal(), phase: 'off', admin: isAdmin(), edit: canEdit(), kids: [], kid: null, sel: null, tab: tab || 'board', pop: null, busy: false, loading: true, form: null };
        S.kids = myKids(CFG || {}); S.kid = S.kids[0] || null;
        o.style.display = 'block';
        document.documentElement.classList.add('ml-lock');
        try { history.pushState({ mealOv: 1 }, ''); } catch (e) {}
        render();
        if (lastBoard && Date.now() - lastAt < 30000) apply(lastBoard);
        try {
            const r = await apiGetJson('action=mealBoard');
            if (r && r.result === 'success') apply(r); else throw new Error((r && r.message) || '못 불러왔어요');
        } catch (e) { if (!lastBoard) { S.err = String(e.message || e); } }
        S.loading = false;
        if (S.tab === 'set' && !S.form) S.form = formFrom(S.cfg);
        render();
    }
    function close() {
        const o = document.getElementById('mealOv'); if (o) o.style.display = 'none';
        document.documentElement.classList.remove('ml-lock');
        S = null;
    }
    window.addEventListener('popstate', () => { if (S) close(); });
    function apply(r) {
        lastBoard = r; lastAt = Date.now();
        if (!S) return;
        S.cfg = r.cfg || null; S.days = r.days || []; S.rows = r.rows || []; S.now = r.now || nowLocal(); S.phase = r.phase || 'off';
        S.admin = !!r.admin; S.edit = !!r.edit;
        if (r.cfg) { CFG = r.cfg; renderBanner(); renderAdminGroup(); }
        S.kids = myKids(S.cfg || {}); if (!S.kid || !S.kids.some(k => same(k, S.kid))) S.kid = S.kids[0] || null;
    }

    // ---------- 그리기 ----------
    function render() {
        if (!S) return;
        const o = ov(), c = S.cfg;
        const tabs = S.admin ? `<div class="ml-tabs">${[['board', '🎟 좌석표'], ['stat', '📊 현황판']].concat(S.edit ? [['set', '⚙ 기간 · 설정']] : []).map(([k, t]) => `<button type="button" data-act="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>` : '';
        let body = '';
        if (S.loading && !lastBoard) body = `<div class="ml-card ml-msg">급식당번 칸을 불러오는 중…</div>`;
        else if (S.err && !c) body = `<div class="ml-card ml-msg">못 불러왔어요. 잠시 뒤 다시 열어 주세요.<br><small>${esc(S.err)}</small></div>`;
        else if (S.tab === 'set' && S.edit) body = viewSet();
        else if (!c) body = `<div class="ml-card ml-msg">아직 급식당번 신청이 없어요.${S.edit ? '<br><button type="button" class="ml-btn o" data-act="tab" data-v="set" style="margin-top:12px">⚙ 신청 만들기</button>' : ''}</div>`;
        else if (S.tab === 'stat' && S.admin) body = hero() + viewStat();
        else body = hero() + viewBoard();
        o.innerHTML = `<div class="ml-top"><button type="button" class="ml-x" data-act="close" aria-label="닫기">‹</button><b>🍱 ${esc((c && c.title) || '동계훈련 급식당번')}</b>${S.admin ? '<span class="ml-tag st">운영진</span>' : ''}</div>
            <div class="ml-wrap">${tabs}${body}</div>${S.tab === 'board' && c ? stickyBar() : ''}${S.pop ? popHtml() : ''}`;
    }
    function hero() {
        const c = S.cfg, n = S.days.length;
        const ph = S.phase === 'soon' ? `⏰ ${dtTxt(c.open)}부터 신청할 수 있어요` : S.phase === 'open' ? `⏰ 신청 마감 ${c.close ? dtTxt(c.close) : '없음'} · 마감 뒤 바꾸기는 운영진에게` : S.phase === 'closed' ? '✅ 신청이 마감됐어요 · 바꾸기는 운영진에게' : '⏸ 신청을 잠시 닫아 두었어요';
        return `<div class="ml-hero"><div class="ml-hk">${dOf(c.start).getFullYear()} 동계훈련</div><div class="ml-ht">🍱 급식당번 신청</div>
            <div class="ml-hm"><span>📅 ${mdw(c.start)} ~ ${mdw(c.end)} · ${n}일</span><span>🚚 배식차 점심 · 하루 학부모 ${c.per}팀 배식 도우미${c.gather ? ' · ' + esc(c.gather) + ' 집합' : ''}</span>
            <span>🎓 ${c.grades.join('·')}학년 학부모님 (선수 1명 = 1팀)</span><span>✋ 신청 1팀 ${c.max}번${c.hoo && c.hooMax ? ' + 후보 ' + c.hooMax + '번' : ''}</span></div>
            ${c.info ? `<div class="ml-hi">${esc(c.info)}</div>` : ''}<div class="ml-hd">${ph}</div></div>`;
    }
    function mineCard() {
        if (!S.kids.length) return '';
        const k = S.kid, mc = mineCount(k), lim = limitNow(), c = S.cfg;
        const pick = S.kids.length > 1 ? `<div class="ml-kids">${S.kids.map((x, i) => `<button type="button" data-act="kid" data-v="${i}" class="${same(x, k) ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div>` : '';
        const chips = mc.main.map(r => `<span>${mdw(r.d)}</span>`).join('') + mc.hoo.map(r => `<span class="h">후보 ${mdw(r.d)}</span>`).join('')
            + (mc.main.length < lim && S.phase === 'open' ? `<span class="e">+ ${lim - mc.main.length}번 더 고를 수 있어요</span>` : '');
        let tip = '';
        try {
            const du = typeof dutyMineNext === 'function' ? dutyMineNext() : null;
            if (du && du.d >= c.start && du.d <= c.end) tip = `<div class="ml-tip">🧹 우리 집 부실 청소 당번이 <b>${mdw(du.d)}</b>예요. 그 주는 피하면 덜 바빠요.</div>`;
        } catch (e) {}
        const extra = c.extraFrom && S.now < c.extraFrom && S.phase === 'open' ? `<div class="ml-note">남은 칸이 있으면 ${dtTxt(c.extraFrom)}부터 1번 더 신청할 수 있어요.</div>` : '';
        return `<div class="ml-card"><div class="ml-mine"><div class="ml-num">${esc(k.no || '')}</div><div><div class="ml-n">${esc(k.name)} 학부모님</div><div class="ml-g">${esc(gnum(k.grade))}학년</div></div>
            <div class="ml-cnt">내 신청<b>${mc.main.length} / ${lim}</b></div></div>${pick}<div class="ml-chips">${chips || '<span class="e">아직 신청한 날이 없어요</span>'}</div>${extra}${tip}</div>`;
    }
    function seatHtml(x) {
        const r = x.r, h = x.s === HOO;
        const sel = S.sel && S.sel.d === x.d && S.sel.s === x.s && !r;
        if (r) {
            const mine = isMineRow(r);
            const nm = r.taken ? '찼음' : esc(r.name);
            return `<button type="button" class="ml-st ${h ? 'h f' : mine ? 'm' : 'f'}" data-act="seat" data-d="${x.d}" data-s="${esc(x.s)}">${h ? '<span class="ml-hl">후보&nbsp;</span>' : ''}${mine && !h ? '우리 집' : nm}</button>`;
        }
        return `<button type="button" class="ml-st ${h ? 'h' : 'e'}${sel ? ' s' : ''}" data-act="seat" data-d="${x.d}" data-s="${esc(x.s)}">${sel ? '✓ 선택' : h ? '+ 후보' : '빈 칸'}</button>`;
    }
    function weeks() {   // 월요일 기준 주 묶음
        const out = [];
        S.days.forEach(d => {
            const dt = dOf(d), mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
            const k = ymd(mon); let w = out.find(x => x.k === k);
            if (!w) { w = { k, days: [] }; out.push(w); }
            w.days.push(d);
        });
        return out;
    }
    function viewBoard() {
        const c = S.cfg, total = S.days.length * c.per, filled = S.rows.filter(r => r.s !== HOO).length;
        const cols = c.skipWe ? 5 : 7;
        const legend = `<div class="ml-legend"><span><i class="l-e"></i>빈 칸</span><span><i class="l-f"></i>찼음</span><span><i class="l-m"></i>우리 집</span><span><i class="l-s"></i>고르는 중</span>${c.hoo ? '<span><i class="l-h"></i>후보 (못 오는 팀 대신)</span>' : ''}</div>`;
        const head = `<div class="ml-stage" style="--cols:${cols}">${(c.skipWe ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0]).map(i => `<span>${DOW[i]}</span>`).join('')}</div>`;
        const grid = weeks().map((w, wi) => {
            const mon = dOf(w.k), cells = [];
            for (let i = 0; i < cols; i++) {
                const dd = new Date(mon); dd.setDate(mon.getDate() + i);
                const ds = ymd(dd);
                if (S.days.indexOf(ds) === -1) { cells.push(`<div class="ml-day off"><div class="ml-dh">${md(ds)}</div><div class="ml-offt">${ds < c.start || ds > c.end ? '' : '쉬는 날'}</div></div>`); continue; }
                const sl = slotsOf(ds), past = ds < todayStr();
                cells.push(`<div class="ml-day${sl.left ? '' : ' full'}${past ? ' past' : ''}"><div class="ml-dh">${md(ds)} <small>${DOW[dd.getDay()]}</small></div>${sl.main.map(seatHtml).join('')}${sl.hoo.map(seatHtml).join('')}<div class="ml-df">${sl.left ? '남은 ' + sl.left : '마감'}</div></div>`);
            }
            const last = w.days[w.days.length - 1];
            return `<div class="ml-wk">${wi + 1}주차 · ${md(w.days[0])} ~ ${md(last)}</div><div class="ml-grid" style="--cols:${cols}">${cells.join('')}</div>`;
        }).join('');
        const main = `<div class="ml-card"><div class="ml-h2">🎟 ${S.admin && !S.kids.length ? '칸을 눌러 선수 넣기 · 빼기' : '칸을 눌러 고르세요'} <span class="r">빈 칸 ${total - filled} / ${total}</span></div>${legend}${head}${grid}</div>`;
        const side = `<div class="ml-side">${selCard()}</div>`;
        return `<div class="ml-grid2"><div>${main}</div><div>${mineCard()}${side}</div></div>`;
    }
    function selCard() {
        const how = `<div class="ml-how"><b>둘이 동시에 누르면?</b> 서버가 한 줄로 세워서 먼저 도착한 신청만 받아요. 늦은 쪽은 「방금 찼어요」 창과 가까운 빈 칸을 바로 보여 줘요.</div>`;
        if (!S.sel) return `<div class="ml-card"><div class="ml-h2">🎟 고른 칸</div><div class="ml-note">${S.phase === 'open' || S.edit ? '좌석표에서 빈 칸을 눌러 주세요. 우리 칸을 누르면 취소할 수 있어요.' : S.phase === 'soon' ? '신청이 시작되면 칸을 고를 수 있어요.' : '신청이 끝났어요.'}</div>${how}</div>`;
        const x = S.sel, others = S.rows.filter(r => r.d === x.d && r.name).map(r => esc(r.name) + (r.s === HOO ? '(후보)' : '')).join(' · ');
        return `<div class="ml-card"><div class="ml-h2">🎟 고른 칸</div><div class="ml-big">${mdw(x.d)} · ${x.s === HOO ? '후보 칸' : x.s + '번 칸'}</div>
            <div class="ml-note">${others ? '같은 날: ' + others : '이날 첫 신청이에요'}${S.cfg.gather ? ' · ' + esc(S.cfg.gather) + ' 집합' : ''}</div>
            ${x.s === HOO ? '<div class="ml-note">후보는 신청한 팀이 못 오게 되면 그 칸으로 자동으로 올라가요.</div>' : ''}
            <button type="button" class="ml-btn o w" data-act="apply"${S.busy ? ' disabled' : ''}>${S.busy ? '신청하는 중…' : '이 칸 신청하기'}</button>${how}</div>`;
    }
    function stickyBar() {
        if (!S.sel) return '';
        const x = S.sel;
        return `<div class="ml-sticky"><div class="tx">고른 칸<b>${mdw(x.d)} · ${x.s === HOO ? '후보' : x.s + '번 칸'}</b></div><button type="button" class="ml-btn o" data-act="apply"${S.busy ? ' disabled' : ''}>${S.busy ? '신청 중…' : '신청하기'}</button></div>`;
    }
    function popHtml() {
        const p = S.pop;
        return `<div class="ml-dim" data-act="popx"></div><div class="ml-pop">${p.html}</div>`;
    }

    // ---------- 현황판 (운영진) ----------
    function viewStat() {
        const c = S.cfg, el = eligible(c), total = S.days.length * c.per, filled = S.rows.filter(r => r.s !== HOO).length;
        const cnt = p => S.rows.filter(r => r.s !== HOO && same(p, r)).length;
        const none = el.filter(p => !cnt(p)), signed = el.length - none.length;
        const rows = S.days.map(d => {
            const sl = slotsOf(d);
            return `<tr><td><b>${md(d)}</b> ${DOW[dOf(d).getDay()]}</td><td>${sl.main.map(x => x.r ? `<span class="nm">${esc(x.r.name)}</span>` : '<span class="nm e">빈 칸</span>').join('')}${sl.hoo.map(x => x.r ? `<span class="nm h">후보 ${esc(x.r.name)}</span>` : '').join('')}</td><td>${sl.left ? `<span class="tg">${sl.left} 빔</span>` : '✓'}</td></tr>`;
        }).join('');
        const byGrade = c.grades.map(g => { const a = el.filter(p => gnum(p.grade) === g); return `${g}학년 ${a.length}명`; }).join(' · ');
        return `<div class="ml-sgrid"><div><div class="ml-card"><div class="ml-h2">📊 신청 현황 <span class="r">${esc(S.now.slice(5).replace('-', '/'))} 기준</span></div>
            <div class="ml-stats"><div><b>${filled}/${total}</b>채운 칸</div><div><b>${signed}/${el.length}</b>신청한 팀</div><div><b>${total - filled}</b>빈 칸</div><div><b>${S.rows.filter(r => r.s === HOO).length}</b>후보</div></div>
            <div class="ml-bar"><i style="width:${total ? filled / total * 100 : 0}%"></i></div><div class="ml-note">대상: ${byGrade} · 선수 1명의 학부모님 = 1팀</div>
            <div class="ml-h2" style="margin-top:10px">아직 신청 안 한 팀 ${none.length}</div><div class="ml-chips">${none.map(p => `<span class="e">${esc(p.name)}</span>`).join('') || '<span>모두 신청했어요</span>'}</div>
            <div class="ml-btns"><button type="button" class="ml-btn g" data-act="copyNone">📋 미신청 알림 글 복사</button><button type="button" class="ml-btn" data-act="copyAll">📋 단톡방용 당번표 복사</button></div></div>
            <div class="ml-card"><div class="ml-h2">📋 날짜별 당번 <span class="r">좌석표에서 칸을 눌러 넣기 · 빼기</span></div><table class="ml-tb"><tr><th>날짜</th><th>당번 팀</th><th></th></tr>${rows}</table></div></div>
            <div><div class="ml-card"><div class="ml-h2">🕘 최근 신청</div><div class="ml-log">${S.rows.slice().sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 12).map(r => `<div><time>${esc((r.at || '').slice(5))}</time><span>${esc(r.name)} → ${md(r.d)} ${r.s === HOO ? '후보' : r.s + '번 칸'}${r.by ? ' (' + esc(r.by) + ' 넣음)' : ''}</span></div>`).join('') || '<div>아직 없어요</div>'}</div></div></div></div>`;
    }
    function copyNone() {
        const c = S.cfg, el = eligible(c), none = el.filter(p => !S.rows.some(r => r.s !== HOO && same(p, r)));
        const t = `[${c.title}] 아직 신청 안 하신 학부모님\n${none.map(p => p.name).join(', ')}\n사이트 일정 탭 맨 위 「급식당번」에서 빈 칸을 골라 신청해 주세요.${c.close ? '\n마감: ' + dtTxt(c.close) : ''}`;
        try { copyText(t, '미신청 알림 글을 복사했어요', '단톡방에 붙여 넣어 주세요'); } catch (e) {}
    }
    function copyAll() {
        const c = S.cfg;
        const lines = S.days.map(d => {
            const sl = slotsOf(d);
            const main = sl.main.map(x => x.r ? x.r.name : '(빈 칸)').join(', ');
            const h = sl.hoo.filter(x => x.r).map(x => x.r.name).join(', ');
            return `${mdw(d)} ${main}${h ? ' / 후보 ' + h : ''}`;
        });
        const t = `[${c.title}] ${md(c.start)} ~ ${md(c.end)}\n배식차 점심 · 하루 ${c.per}팀 배식 도우미${c.gather ? ' · ' + c.gather + ' 집합' : ''}\n\n${lines.join('\n')}`;
        try { copyText(t, '당번표를 복사했어요', '단톡방에 붙여 넣어 주세요'); } catch (e) {}
    }

    // ---------- 설정 (대표님 · 총무님 · 개발자) ----------
    function formFrom(c) {
        const y = new Date().getFullYear(), m = new Date().getMonth();
        const base = c ? JSON.parse(JSON.stringify(c)) : { on: true, title: '동계훈련 급식당번', start: '', end: '', skipWe: true, off: [], per: 3, hoo: 1, max: 2, hooMax: 1, extraDays: 3, open: '', close: '', gather: '11:20', grades: ['5', '4', '3', '2'], names: true, info: '' };
        const cm = base.start ? dOf(base.start) : new Date(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1);
        base.cy = cm.getFullYear(); base.cm = cm.getMonth(); base.pick = base.start && !base.end ? 'end' : 'start';
        return base;
    }
    function viewSet() {
        const f = S.form || (S.form = formFrom(S.cfg));
        const first = new Date(f.cy, f.cm, 1), lead = first.getDay(), dim = new Date(f.cy, f.cm + 1, 0).getDate();
        const cells = []; for (let i = 0; i < lead; i++) cells.push('<span></span>');
        for (let d = 1; d <= dim; d++) {
            const ds = ymd(new Date(f.cy, f.cm, d)), w = new Date(f.cy, f.cm, d).getDay();
            const inR = f.start && f.end && ds >= f.start && ds <= f.end, edge = ds === f.start || ds === f.end;
            const off = inR && ((f.skipWe && (w === 0 || w === 6)) || f.off.indexOf(ds) !== -1);
            cells.push(`<button type="button" data-act="cal" data-v="${ds}" class="${edge ? 'edge' : inR ? (off ? 'off' : 'in') : ''}${w === 0 ? ' sun' : ''}">${d}</button>`);
        }
        const days = f.start && f.end ? countDays(f) : 0;
        const num = (k, lo, hi, lab, unit) => `<div class="ml-row"><span class="l">${lab}</span><span class="ml-step"><button type="button" data-act="num" data-k="${k}" data-v="-1" data-lo="${lo}" data-hi="${hi}">−</button><i>${f[k]}${unit || ''}</i><button type="button" data-act="num" data-k="${k}" data-v="1" data-lo="${lo}" data-hi="${hi}">+</button></span></div>`;
        const tg = (k, lab) => `<div class="ml-row"><span class="l">${lab}</span><button type="button" class="ml-tgl${f[k] ? ' on' : ''}" data-act="tgl" data-k="${k}" aria-pressed="${f[k] ? 'true' : 'false'}"></button></div>`;
        const dt = (k, lab) => `<div class="ml-row"><span class="l">${lab}</span><input type="datetime-local" class="ml-in" data-k="${k}" value="${esc((f[k] || '').replace(' ', 'T'))}"></div>`;
        return `<div class="ml-sgrid"><div><div class="ml-card"><div class="ml-h2">📅 동계기간 고르기 <span class="r">${f.pick === 'start' ? '시작일을 눌러 주세요' : '끝날을 눌러 주세요'}</span></div>
            <div class="ml-rng"><button type="button" data-act="pick" data-v="start" class="${f.pick === 'start' ? 'on' : ''}"><small>시작</small><b>${f.start ? mdw(f.start) : '고르기'}</b></button><span>→</span><button type="button" data-act="pick" data-v="end" class="${f.pick === 'end' ? 'on' : ''}"><small>끝</small><b>${f.end ? mdw(f.end) : '고르기'}</b></button></div>
            <div class="ml-calh"><button type="button" data-act="mon" data-v="-1">‹</button><b>${f.cy}년 ${f.cm + 1}월</b><button type="button" data-act="mon" data-v="1">›</button></div>
            <div class="ml-cal">${DOW.map(x => `<span class="cw">${x}</span>`).join('')}${cells.join('')}</div>
            <div class="ml-note">기간 안의 날짜를 한 번 더 누르면 「쉬는 날」로 빠져요 (다시 누르면 돌아와요).</div>
            ${tg('skipWe', '주말 빼기')}
            <div class="ml-good">${days ? `훈련 ${days}일 × 하루 ${f.per}팀 = <b>신청 칸 ${days * f.per}개</b>${f.hoo ? ` + 후보 칸 ${days * f.hoo}개` : ''}` : '시작일과 끝날을 골라 주세요'}</div></div></div>
            <div><div class="ml-card ml-set"><div class="ml-h2">⚙ 신청 설정</div>
            <div class="ml-row"><span class="l">이름</span><input class="ml-in" data-k="title" maxlength="30" value="${esc(f.title)}"></div>
            ${num('per', 1, 6, '하루 신청 칸 (배식 도우미 팀 수)', '팀')}${num('hoo', 0, 2, '하루 후보 칸', '칸')}
            ${num('max', 1, 6, '1팀 신청 횟수', '번')}${num('hooMax', 0, 6, '1팀 후보 횟수', '번')}
            ${num('extraDays', 0, 14, '마감 며칠 전부터 남은 칸 1번 더', '일')}
            <div class="ml-row"><span class="l">대상 학년</span><span class="ml-gr">${['6', '5', '4', '3', '2', '1'].map(g => `<button type="button" data-act="grade" data-v="${g}" class="${f.grades.indexOf(g) !== -1 ? 'on' : ''}">${g}</button>`).join('')}</span></div>
            <div class="ml-note" style="margin:-4px 0 6px">${gradeCount(f)}</div>
            <div class="ml-row"><span class="l">집합 시간</span><input type="time" class="ml-in" data-k="gather" value="${esc(f.gather || '')}"></div>
            ${dt('open', '신청 열기 (비우면 바로)')}${dt('close', '신청 마감 (비우면 없음)')}
            <div class="ml-row"><span class="l">안내 한 줄</span><input class="ml-in" data-k="info" maxlength="80" placeholder="예: 배식차 11:30 도착 · 앞치마 챙겨 주세요" value="${esc(f.info || '')}"></div>
            ${tg('names', '학부모 화면에 다른 팀 이름 보이기')}${tg('on', '신청 화면 켜기')}
            <div class="ml-btns"><button type="button" class="ml-btn o" data-act="save"${S.busy ? ' disabled' : ''}>${S.busy ? '저장하는 중…' : '저장'}</button></div>
            <div class="ml-note">칸 수를 줄여도 이미 신청한 줄은 지워지지 않아요. 기간을 바꾸면 기간 밖 신청은 좌석표에서 안 보여요(시트에는 남음).</div></div></div></div>`;
    }
    function countDays(f) {
        let n = 0; const e = dOf(f.end);
        for (let d = dOf(f.start); d <= e && n < 100; d.setDate(d.getDate() + 1)) { const w = d.getDay(), s = ymd(d); if (!(f.skipWe && (w === 0 || w === 6)) && f.off.indexOf(s) === -1) n++; }
        return n;
    }
    function gradeCount(f) {
        const a = f.grades.slice().sort().reverse().map(g => `${g}학년 ${pl().filter(p => p && p.visible !== false && gnum(p.grade) === g).length}명`);
        const t = pl().filter(p => p && p.visible !== false && f.grades.indexOf(gnum(p.grade)) !== -1).length;
        return a.length ? `${a.join(' · ')} = ${t}팀` : '학년을 골라 주세요';
    }
    async function save() {
        const f = S.form;
        if (!f.start || !f.end) { note('info', '시작일과 끝날을 골라 주세요'); return; }
        if (!f.grades.length) { note('info', '대상 학년을 골라 주세요'); return; }
        const body = { on: f.on, title: f.title, start: f.start, end: f.end, skipWe: f.skipWe, off: f.off.filter(d => d >= f.start && d <= f.end), per: f.per, hoo: f.hoo, max: f.max, hooMax: f.hooMax, extraDays: f.extraDays, open: f.open || '', close: f.close || '', gather: f.gather || '', grades: f.grades, names: f.names, info: f.info || '' };
        S.busy = true; render();
        try {
            const r = await apiGetJson('action=mealCfg&cfg=' + encodeURIComponent(JSON.stringify(body)));
            if (!r || r.result !== 'success') throw new Error((r && r.message) || '저장하지 못했어요');
            apply(r); S.form = formFrom(S.cfg); S.tab = 'board';
            note('success', '급식당번 설정을 저장했어요', '학부모 화면 일정 탭 맨 위에 보여요');
        } catch (e) { note('error', '저장하지 못했어요', String(e.message || e)); }
        if (S) { S.busy = false; render(); }
    }

    // ---------- 신청 · 취소 ----------
    let clickedSlot = {};   // 누른 칸이 그날 몇 번째 후보 칸인지
    function onSeat(d, s) {
        const slots = slotsOf(d);
        const sl = s === HOO ? slots.hoo[clickedSlot.hi || 0] : slots.main.find(y => y.s === s);
        if (!sl) return;
        if (sl.r) {
            if (S.edit) return askCancel(sl.r, !isMineRow(sl.r));
            if (isMineRow(sl.r) && S.phase === 'open') return askCancel(sl.r);
            note('info', sl.r.taken ? '이미 찬 칸이에요' : `${sl.r.name} 학부모님이 신청한 칸이에요`, isMineRow(sl.r) ? '마감 뒤 바꾸기는 운영진에게 말씀해 주세요' : '빈 칸을 골라 주세요');
            return;
        }
        if (S.edit) return askAssign(d, s);   // 대표님 · 총무님 · 개발자: 아무 선수나 넣기 (우리 아이 포함)
        if (S.phase !== 'open') { note('info', S.phase === 'soon' ? '아직 신청 시작 전이에요' : '신청이 마감됐어요', S.phase === 'soon' && S.cfg.open ? dtTxt(S.cfg.open) + '부터 신청할 수 있어요' : '바꾸려면 운영진에게 말씀해 주세요'); return; }
        if (!S.kid) { note('info', '신청 대상 선수가 없어요', S.cfg.grades.join('·') + '학년 학부모님만 신청할 수 있어요'); return; }
        if (S.rows.some(q => q.d === d && same(S.kid, q))) { note('info', '이 날은 이미 신청했어요', '다른 날을 골라 주세요'); return; }
        const mc = mineCount(S.kid), lim = limitNow();
        if (s === HOO ? mc.hoo.length >= S.cfg.hooMax : mc.main.length >= lim) { note('info', s === HOO ? `후보는 ${S.cfg.hooMax}번까지예요` : `신청은 ${lim}번까지예요`, '우리 칸을 누르면 취소하고 다시 고를 수 있어요'); return; }
        S.sel = (S.sel && S.sel.d === d && S.sel.s === s) ? null : { d, s };
        render();
    }
    function askAssign(d, s) {
        const el = eligible(S.cfg), on = p => S.rows.some(r => r.d === d && same(p, r));
        const cnt = p => S.rows.filter(r => r.s !== HOO && same(p, r)).length;
        S.pop = { html: `<div class="ml-pt">${mdw(d)} · ${s === HOO ? '후보 칸' : s + '번 칸'}에 넣을 선수</div><div class="ml-ds">숫자는 지금까지 신청 횟수예요. 적은 순서대로 보여요.</div>
            <div class="ml-plist">${el.slice().sort((a, b) => cnt(a) - cnt(b)).map(p => `<button type="button" data-act="assign" data-d="${d}" data-s="${esc(s)}" data-no="${esc(p.no || 0)}" data-name="${esc(p.name)}"${on(p) ? ' disabled' : ''}><b>${esc(p.name)}</b><small>${gnum(p.grade)}학년 · ${cnt(p)}번${on(p) ? ' · 이날 있음' : ''}</small></button>`).join('')}</div>
            <div class="ml-btns"><button type="button" class="ml-btn g" data-act="popx">닫기</button></div>` };
        render();
    }
    function askCancel(r, admin) {
        const h = r.s === HOO;
        const hasHoo = !h && S.rows.some(q => q.d === r.d && q.s === HOO);
        S.pop = { html: `<div class="ml-ic">🍱</div><div class="ml-pt">${mdw(r.d)} ${h ? '후보' : r.s + '번 칸'}을 비울까요?</div>
            <div class="ml-ds">${esc(r.name)} 학부모님${admin ? ' 칸을 운영진이 빼요.' : ' 신청을 취소해요.'}${hasHoo ? '<br>이날 후보 팀이 이 칸으로 자동으로 올라가요.' : ''}</div>
            <div class="ml-btns"><button type="button" class="ml-btn g" data-act="popx">그대로 두기</button><button type="button" class="ml-btn r" data-act="cancel" data-d="${r.d}" data-s="${esc(r.s)}" data-no="${esc(r.no || 0)}" data-name="${esc(r.name)}">${admin ? '빼기' : '취소하기'}</button></div>` };
        render();
    }
    async function doApply(who) {
        const x = S.sel || who; if (!x || S.busy) return;
        const k = who && who.name ? who : S.kid;
        if (!k) return;
        S.busy = true; render();
        try {
            const r = await apiGetJson(`action=mealApply&d=${encodeURIComponent(x.d)}&s=${encodeURIComponent(x.s)}&no=${encodeURIComponent(k.no || 0)}&name=${encodeURIComponent(k.name)}`);
            if (r && r.days) apply(r);
            if (r && r.result === 'success') {
                S.sel = null; S.pop = null;
                note('success', `${mdw(x.d)} ${x.s === HOO ? '후보' : '급식당번'} 신청 완료`, `${k.name} 학부모님${S.cfg && S.cfg.gather ? ' · ' + S.cfg.gather + ' 집합' : ''}`);
            } else if (r && r.result === 'taken') {
                S.sel = null; racePop(x);
            } else throw new Error((r && r.message) || '신청하지 못했어요');
        } catch (e) { note('error', '신청하지 못했어요', String(e.message || e)); }
        if (S) { S.busy = false; render(); }
    }
    function racePop(x) {
        const alts = nearEmpty(x.d, x.s === HOO);
        S.pop = { html: `<div class="ml-ic">😅</div><div class="ml-pt">방금 다른 가족이 먼저 신청했어요</div>
            <div class="ml-ds">${mdw(x.d)} ${x.s === HOO ? '후보 칸' : '칸'}이 찼어요. 좌석표를 새로 고쳤어요.${alts.length ? '<br>가까운 빈 칸으로 바로 신청할 수 있어요.' : ''}</div>
            ${alts.length ? `<div class="ml-alt">${alts.map((a, i) => `<button type="button" data-act="alt" data-d="${a.d}" data-s="${esc(a.s)}" class="${i ? '' : 'best'}"><b>${mdw(a.d)}</b><span>${a.left}자리 남음</span></button>`).join('')}</div>` : '<div class="ml-ds">남은 빈 칸이 없어요.</div>'}
            <div class="ml-btns"><button type="button" class="ml-btn g" data-act="popx">좌석표 다시 보기</button></div>` };
    }
    function nearEmpty(d, hoo) {
        const k = S.kid;
        return S.days.filter(x => x !== d && x >= todayStr() && !(k && S.rows.some(r => r.d === x && same(k, r))))
            .map(x => { const sl = slotsOf(x), arr = hoo ? sl.hoo : sl.main, free = arr.find(y => !y.r); return free ? { d: x, s: free.s, left: arr.filter(y => !y.r).length, dist: Math.abs(dOf(x) - dOf(d)) } : null; })
            .filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 3);
    }
    async function doCancel(d, s, no, name) {
        if (S.busy) return;
        S.busy = true; S.pop = null; render();
        try {
            const r = await apiGetJson(`action=mealCancel&d=${encodeURIComponent(d)}&s=${encodeURIComponent(s)}&no=${encodeURIComponent(no || 0)}&name=${encodeURIComponent(name)}`);
            if (r && r.days) apply(r);
            if (!r || r.result !== 'success') throw new Error((r && r.message) || '취소하지 못했어요');
            note('success', `${mdw(d)} 칸을 비웠어요`, r.promoted ? `후보 ${r.promoted.name} 학부모님이 그 칸으로 올라갔어요` : '');
        } catch (e) { note('error', '취소하지 못했어요', String(e.message || e)); }
        if (S) { S.busy = false; render(); }
    }

    // ---------- 누르기 ----------
    function onClick(ev) {
        const b = ev.target.closest('[data-act]'); if (!b || !S) return;
        const a = b.dataset.act, v = b.dataset.v;
        if (a === 'close') { try { history.back(); } catch (e) { close(); } setTimeout(() => { if (S) close(); }, 300); return; }
        if (a === 'tab') { S.tab = v; S.sel = null; if (v === 'set' && !S.form) S.form = formFrom(S.cfg); render(); return; }
        if (a === 'kid') { S.kid = S.kids[Number(v)] || S.kid; S.sel = null; render(); return; }
        if (a === 'seat') {
            const day = b.closest('.ml-day'), hs = day ? Array.from(day.querySelectorAll('.ml-st.h')) : [];
            clickedSlot = { hi: Math.max(0, hs.indexOf(b)) };
            onSeat(b.dataset.d, b.dataset.s); return;
        }
        if (a === 'apply') { doApply(); return; }
        if (a === 'alt') { S.pop = null; S.sel = { d: b.dataset.d, s: b.dataset.s }; doApply(); return; }
        if (a === 'popx') { S.pop = null; render(); return; }
        if (a === 'assign') { S.pop = null; S.sel = { d: b.dataset.d, s: b.dataset.s }; doApply({ no: Number(b.dataset.no) || 0, name: b.dataset.name }); return; }
        if (a === 'cancel') { doCancel(b.dataset.d, b.dataset.s, Number(b.dataset.no) || 0, b.dataset.name); return; }
        if (a === 'copyNone') { copyNone(); return; }
        if (a === 'copyAll') { copyAll(); return; }
        // 설정
        const f = S.form; if (!f) return;
        if (a === 'pick') { f.pick = v; render(); return; }
        if (a === 'mon') { const d = new Date(f.cy, f.cm + Number(v), 1); f.cy = d.getFullYear(); f.cm = d.getMonth(); render(); return; }
        if (a === 'cal') {
            if (f.start && f.end && v > f.start && v < f.end && f.pick === 'start') {   // 기간 안 → 쉬는 날 넣기/빼기
                const i = f.off.indexOf(v); if (i === -1) f.off.push(v); else f.off.splice(i, 1);
            } else if (f.pick === 'start' || !f.start || v < f.start) { f.start = v; f.end = ''; f.pick = 'end'; }
            else { f.end = v; f.pick = 'start'; }
            render(); return;
        }
        if (a === 'num') { const k = b.dataset.k; f[k] = Math.max(Number(b.dataset.lo), Math.min(Number(b.dataset.hi), (Number(f[k]) || 0) + Number(v))); render(); return; }
        if (a === 'tgl') { f[b.dataset.k] = !f[b.dataset.k]; render(); return; }
        if (a === 'grade') { const i = f.grades.indexOf(v); if (i === -1) f.grades.push(v); else f.grades.splice(i, 1); f.grades.sort().reverse(); render(); return; }
        if (a === 'save') { readInputs(); save(); return; }
    }
    function readInputs() {
        const o = document.getElementById('mealOv'), f = S && S.form; if (!o || !f) return;
        o.querySelectorAll('.ml-in[data-k]').forEach(i => { const k = i.dataset.k; f[k] = i.type === 'datetime-local' ? String(i.value || '').replace('T', ' ').slice(0, 16) : i.value; });
    }
    document.addEventListener('input', e => { if (e.target && e.target.classList && e.target.classList.contains('ml-in')) readInputs(); });

    window.MEAL = { setCfg, open, close, refresh: () => { renderBanner(); renderAdminGroup(); } };
    // 이 파일이 bootstrap 보다 늦게 열렸으면 저장본에서 설정을 꺼내 그림
    try { if (window.MEAL_CFG_EARLY !== undefined) setCfg(window.MEAL_CFG_EARLY); } catch (e) {}
})();
