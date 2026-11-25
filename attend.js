// ==========================================================
// 🙋 일정 참석 체크 · 🚗 카풀(차량지원) 배정 (v2.159.0 · 하코 11-26 선택: A안 + C안 일부)
//   · 일정 상세 창 안 「응답 카드」: 참석 · 늦게 · 불참 → 이동(제 차로 · 태워 주세요 · 따로) → 자리 수 · 갈 때/올 때 · 짐
//   · 운영진: 인원 막대 · 불참/늦게 사유 · 미응답 이름 · 차량 배정판(자동 배정 → 눌러서 옮기기 → 확정) · 단톡방용 글 복사
//   · 여러 날 대회(같은 이름 「대회」가 이어진 날짜)는 날짜 탭으로 묶고 한 번에 응답 · 한 번에 복사 (C안)
//   · 서버 호출: 상세 창을 열 때 읽기 1번(여러 날도 1번) + 「저장」 누를 때 1번 → 평소 호출 늘지 않음 (서버 v2.49.0)
//   · index.html 의 players · schedEvents · postApi · apiGetUrl · escapeHtml · bkNotify · copyText · getActiveUser · currentRole 사용
// ==========================================================
(function () {
    'use strict';
    const ADMIN_ROLES = ['dev', 'super', 'general', 'sub'];
    const ST = { ok: '참석', late: '늦게', no: '불참' };
    const MV = { car: '제 차로', ride: '태워 주세요', self: '따로 가요' };
    const DIR = { both: '갈 때·올 때', go: '갈 때만', back: '올 때만(복귀만)' };
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const note = (st, t, sub) => { try { bkNotify(st, t, sub); } catch (e) {} };
    const isAdmin = () => { try { return ADMIN_ROLES.indexOf(currentRole) !== -1; } catch (e) { return false; } };
    const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const md = ds => { const a = String(ds).split('-').map(Number), d = new Date(a[0], a[1] - 1, a[2]); return `${a[1]}/${a[2]}(${DOW[d.getDay()]})`; };
    const key = (no, name) => (Number(no) > 0 ? 'n' + Number(no) : 'm' + name);
    const pl = () => (typeof players !== 'undefined' && Array.isArray(players)) ? players : [];
    const findP = (no, name) => pl().find(p => (Number(no) > 0 && Number(p.no) > 0) ? Number(p.no) === Number(no) : p.name === name);
    const isGame = ev => { try { return isGameEvent(ev); } catch (e) { return ev && (ev.type === '대회' || ev.type === '연습시합'); } };

    let S = null;   // { ids, cur, data:{id:{rows,cnt,cars,plan}}, draft:{id:{key:{...}}}, extra:[], dirTab, pick, plan:{id:{go,back,done}}, busy, err, same }
    const cache = {};   // id → { at, data }

    // ---------- 대상 · 묶음 ----------
    function applies(ev) {
        if (!ev || ev.type === '휴식') return false;
        try { if (typeof canViewSchedule === 'function' && !canViewSchedule()) return false; } catch (e) {}
        return String(ev.date) >= todayStr();
    }
    function siblings(ev) {   // C안: 같은 이름의 대회가 하루 간격으로 이어지면 한 묶음 (최대 7일)
        const all = (typeof schedEvents !== 'undefined' ? schedEvents : []);
        if (ev.type !== '대회' || !ev.title) return [ev];
        const same = all.filter(x => x.type === '대회' && x.title === ev.title && String(x.grades || '') === String(ev.grades || '')).sort((a, b) => a.date.localeCompare(b.date));
        const dnum = s => { const a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]) / 864e5; };
        let i = same.findIndex(x => x.id === ev.id); if (i < 0) return [ev];
        let lo = i, hi = i;
        while (lo > 0 && dnum(same[lo].date) - dnum(same[lo - 1].date) <= 1) lo--;
        while (hi < same.length - 1 && dnum(same[hi + 1].date) - dnum(same[hi].date) <= 1) hi++;
        return same.slice(lo, hi + 1).filter(x => x.date >= todayStr()).slice(0, 7);
    }
    const evOf = id => (typeof schedEvents !== 'undefined' ? schedEvents : []).find(x => x.id === id);
    function targets(ev) {   // 이 일정 대상 선수 (학년)
        const g = String(ev.grades || '전체');
        const list = pl().filter(p => p && p.name && p.visible !== false);
        if (g.indexOf('전체') !== -1 || !g.trim()) return list;
        const gs = g.split(',').map(s => s.trim()).filter(Boolean);
        return list.filter(p => gs.indexOf(String(p.grade).trim()) !== -1);
    }
    function myKids(ev) {
        let u = null; try { u = getActiveUser(); } catch (e) {}
        const kids = (u && Array.isArray(u.children)) ? u.children.filter(c => c && (c.name || c.no)) : [];
        const tg = targets(ev), inT = c => !tg.length || tg.some(p => (Number(c.no) > 0 && Number(p.no) > 0) ? Number(p.no) === Number(c.no) : p.name === c.name);
        const out = kids.filter(inT).map(c => ({ no: Number(c.no) || 0, name: c.name || (findP(c.no, '') || {}).name || '' }));
        (S && S.extra || []).forEach(x => { if (!out.some(o => key(o.no, o.name) === key(x.no, x.name))) out.push(x); });
        return out;
    }

    // ---------- 서버 ----------
    async function fetchData(ids, force) {
        const need = ids.filter(id => force || !cache[id] || Date.now() - cache[id].at > 60000);
        if (need.length) {
            const rj = await fetch(apiGetUrl('action=attend&ids=' + encodeURIComponent(need.join(','))), { cache: 'no-store' }).then(r => r.json());
            if (rj && rj.result === 'success' && !rj.ev) throw new Error('참석 응답 기능을 서버에 여는 중이에요. 조금만 기다려 주세요');   // 서버가 아직 v2.49.0 전
            if (!rj || rj.result !== 'success') throw new Error((rj && rj.message) || '응답을 불러오지 못했어요');
            need.forEach(id => { cache[id] = { at: Date.now(), data: rj.ev[id] || { rows: [], cnt: { ok: 0, late: 0, no: 0 }, cars: [], plan: '' } }; });
        }
        const o = {}; ids.forEach(id => o[id] = cache[id].data); return o;
    }
    function rowFor(id, k) { const d = S.data[id]; return d && (d.rows || []).find(r => key(r.no, r.name) === k); }
    function draftFor(id, kid) {
        const k = key(kid.no, kid.name);
        S.draft[id] = S.draft[id] || {};
        if (!S.draft[id][k]) {
            const r = rowFor(id, k);
            S.draft[id][k] = r ? { st: r.st || '', memo: r.memo || '', mv: r.mv || '', seats: Number(r.seats) || 3, dir: r.dir || 'both', bag: !!r.bag, saved: r.at || '' }
                               : { st: '', memo: '', mv: '', seats: 3, dir: 'both', bag: false, saved: '' };
        }
        return S.draft[id][k];
    }

    // ---------- 그리기 ----------
    function detailHtml(ev) {
        if (!applies(ev)) return '';
        return `<div class="at-box" id="atBox"><div class="at-loading">🙋 참석 · 이동 응답 불러오는 중…</div></div>`;
    }
    async function load(ev) {
        if (!applies(ev)) return;
        const sib = siblings(ev);
        S = { ids: sib.map(x => x.id), cur: ev.id, data: {}, draft: {}, extra: [], dirTab: 'go', pick: null, plan: {}, busy: false, err: '', same: sib.length > 1 };
        widen();
        try { S.data = await fetchData(S.ids); }
        catch (e) { S.err = e.message || '불러오지 못했어요'; }
        S.ids.forEach(id => { try { const p = S.data[id] && S.data[id].plan ? JSON.parse(S.data[id].plan) : null; if (p) S.plan[id] = p; } catch (e) {} });
        render();
    }
    function widen() {
        const mc = document.querySelector('#eventDetailModal .modal-content');
        if (mc) mc.classList.toggle('at-wide', isAdmin());
    }
    function render() {
        const box = document.getElementById('atBox');
        if (!box || !S) return;
        const ev = evOf(S.cur); if (!ev) return;
        if (S.err) { box.innerHTML = `<div class="at-loading">⚠ ${esc(S.err)} <button type="button" class="at-link" onclick="AT.reload()">다시</button></div>`; return; }
        const tabs = S.same ? `<div class="at-days">${S.ids.map(id => { const e = evOf(id); return `<button type="button" class="${id === S.cur ? 'on' : ''}" onclick="AT.day('${esc(id)}')">${esc(md(e.date))}${e.start ? '<small>' + esc(e.start) + '</small>' : ''}</button>`; }).join('')}</div>` : '';
        const left = answerHtml(ev), right = summaryHtml(ev) + (isGame(ev) ? carHtml(ev) : '');
        box.innerHTML = `${tabs}<div class="at-cols"><div>${left}</div><div>${right}</div></div>`;
    }
    function answerHtml(ev) {
        const kids = myKids(ev), id = ev.id, game = isGame(ev);
        let h = `<div class="at-card"><div class="at-h">🙋 우리 아이 응답 <span>${esc(md(ev.date))}${ev.meet ? ' · ' + esc(ev.meet) : ''}</span></div>`;
        if (!kids.length) h += `<div class="at-note">${isAdmin() ? '아래 「대신 입력」에서 선수를 고르면 응답을 대신 넣을 수 있어요.' : '이 일정 대상 학년에 등록된 자녀가 없어요.'}</div>`;
        kids.forEach(kid => {
            const d = draftFor(id, kid), k = esc(key(kid.no, kid.name)), p = findP(kid.no, kid.name) || {};
            h += `<div class="at-kid"><div class="at-kh"><span class="at-no">${esc(kid.no || '-')}</span><b>${esc(kid.name)}</b><small>${p.grade ? esc(p.grade) + '학년' : ''}</small>${d.saved ? `<em>✓ 저장됨 ${esc(String(d.saved).slice(5))}</em>` : '<em class="q">아직 안 눌렀어요</em>'}</div>
              <div class="at-seg3">${['ok', 'late', 'no'].map(s => `<button type="button" class="at-sb ${s}${d.st === s ? ' on' : ''}" onclick="AT.set('${k}','st','${s}')">${s === 'ok' ? '✓ 참석' : s === 'late' ? '⏰ 늦게' : '✕ 불참'}</button>`).join('')}</div>
              ${d.st === 'late' || d.st === 'no' ? `<input class="at-memo" maxlength="40" placeholder="${d.st === 'late' ? '도착 시간 (예: 15:00 도착)' : '사유 (선택 · 운영진만 봐요)'}" value="${esc(d.memo)}" oninput="AT.set('${k}','memo',this.value,1)">` : ''}
              ${game && d.st && d.st !== 'no' ? moveHtml(k, d) : ''}</div>`;
        });
        if (isAdmin()) {
            const tg = targets(ev).filter(p => !kids.some(x => key(x.no, x.name) === key(p.no, p.name)));
            h += `<div class="at-proxy"><select onchange="AT.proxy(this.value);this.value=''"><option value="">✍️ 대신 입력할 선수 고르기 (운영진)</option>${tg.map(p => `<option value="${esc(key(p.no, p.name))}">${esc(p.no || '')} ${esc(p.name)} (${esc(p.grade)}학년)</option>`).join('')}</select></div>`;
        }
        if (kids.length) {
            h += S.same ? `<label class="at-all"><input type="checkbox" id="atAllDays" ${S.allDays ? 'checked' : ''} onchange="AT.allDays(this.checked)"> 대회 ${S.ids.length}일 모두 똑같이 저장</label>` : '';
            h += `<button type="button" class="at-save" ${S.busy ? 'disabled' : ''} onclick="AT.save()">${S.busy ? '저장 중…' : '응답 저장'}</button><div class="at-note">출발 전까지 언제든 바꿀 수 있어요.</div>`;
        }
        return h + '</div>';
    }
    function moveHtml(k, d) {
        let h = `<div class="at-mvh">🚗 이동</div><div class="at-seg3">${['car', 'ride', 'self'].map(m => `<button type="button" class="at-sb bl${d.mv === m ? ' on' : ''}" onclick="AT.set('${k}','mv','${m}')">${m === 'car' ? '🚗 제 차로' : m === 'ride' ? '🙋 태워 주세요' : '📍 따로 가요'}<small>${m === 'car' ? '아이들 태울게요' : m === 'ride' ? '차 배정 부탁' : '현장 집합'}</small></button>`).join('')}</div>`;
        if (d.mv === 'car') h += `<div class="at-rows">
            <div class="at-row"><span>태울 수 있는 아이 <small>우리 아이 포함</small></span><div class="at-step"><button type="button" onclick="AT.seat('${k}',-1)">−</button><i>${d.seats}</i><button type="button" onclick="AT.seat('${k}',1)">+</button></div></div>
            <div class="at-row"><span>언제</span><div class="at-chk">${['both', 'go', 'back'].map(x => `<button type="button" class="${d.dir === x ? 'on' : ''}" onclick="AT.set('${k}','dir','${x}')">${x === 'both' ? '갈 때·올 때' : x === 'go' ? '갈 때만' : '복귀만'}</button>`).join('')}</div></div>
            <div class="at-row"><span>🧳 팀 짐(물·장비) 실을 수 있어요</span><button type="button" class="at-tg${d.bag ? ' on' : ''}" onclick="AT.set('${k}','bag',${!d.bag})"></button></div></div>`;
        return h;
    }
    function counts(ev) {
        const d = S.data[ev.id] || {}, tg = targets(ev);
        const c = Object.assign({ ok: 0, late: 0, no: 0 }, d.cnt || {});
        const ans = c.ok + c.late + c.no, total = Math.max(tg.length, ans);
        return { c, total, q: Math.max(0, total - ans) };
    }
    function summaryHtml(ev) {
        const { c, total, q } = counts(ev), w = n => total ? (n / total * 100).toFixed(1) : 0;
        let h = `<div class="at-card"><div class="at-h">👥 참석 현황 <span>대상 ${total}명</span></div>
          <div class="at-bar"><i class="ok" style="width:${w(c.ok)}%"></i><i class="late" style="width:${w(c.late)}%"></i><i class="no" style="width:${w(c.no)}%"></i></div>
          <div class="at-leg"><span class="ok">참석 <b>${c.ok}</b></span><span class="late">늦게 <b>${c.late}</b></span><span class="no">불참 <b>${c.no}</b></span><span class="q">미응답 <b>${q}</b></span></div>`;
        if (isAdmin()) {
            const rows = (S.data[ev.id] || {}).rows || [];
            const chip = (r, cls) => `<span class="at-chip ${cls}">${esc(r.name)}${r.memo ? ' · ' + esc(r.memo) : ''}</span>`;
            const noR = rows.filter(r => r.st === 'no'), lateR = rows.filter(r => r.st === 'late');
            const unans = unanswered(ev);
            if (noR.length || lateR.length) h += `<div class="at-chips">${noR.map(r => chip(r, 'no')).join('')}${lateR.map(r => chip(r, 'late')).join('')}</div>`;
            if (unans.length) h += `<div class="at-chips"><small>미응답</small>${unans.map(p => `<span class="at-chip w">${esc(p.name)}</span>`).join('')}</div>`;
            h += `<div class="at-btns"><button type="button" onclick="AT.copyUnans()">📋 미응답 알림 글 복사</button><button type="button" onclick="AT.copyMeal()">🍱 참석 인원 복사</button></div>`;
        } else h += `<div class="at-note">다른 아이 응답 · 사유는 운영진만 봐요.</div>`;
        return h + '</div>';
    }
    function unanswered(ev) {
        const rows = (S.data[ev.id] || {}).rows || [];
        return targets(ev).filter(p => !rows.some(r => key(r.no, r.name) === key(p.no, p.name) && r.st));
    }

    // ---------- 차량 ----------
    function drivers(id, dir) {   // 이 방향으로 가는 차
        const rows = isAdmin() ? ((S.data[id] || {}).rows || []).filter(r => r.mv === 'car' && r.st !== 'no') : ((S.data[id] || {}).cars || []);
        return rows.filter(r => !dir || r.dir === 'both' || r.dir === dir || !r.dir);
    }
    function riders(id) {   // 차가 필요한 아이 = 참석 · 늦게 중 「따로 가요」가 아닌 아이
        return ((S.data[id] || {}).rows || []).filter(r => (r.st === 'ok' || r.st === 'late') && r.mv !== 'self');
    }
    function seatSum(id, dir) { return drivers(id, dir).reduce((a, r) => a + (Number(r.seats) || 0), 0); }
    function autoPlan(id) {
        const plan = { go: [], back: [], done: false }, rs = riders(id);
        ['go', 'back'].forEach(dir => {
            const cars = drivers(id, dir).map(r => ({ d: key(r.no, r.name), dn: r.name, seats: Number(r.seats) || 1, bag: !!r.bag, kids: [] }));
            const left = rs.slice();
            cars.forEach(c => { const i = left.findIndex(r => key(r.no, r.name) === c.d); if (i >= 0) { c.kids.push({ no: left[i].no, name: left[i].name }); left.splice(i, 1); } });
            const gr = r => Number((findP(r.no, r.name) || {}).grade) || 0;
            left.sort((a, b) => gr(b) - gr(a));
            left.forEach(r => { const c = cars.filter(x => x.kids.length < x.seats).sort((a, b) => (a.kids.length / a.seats) - (b.kids.length / b.seats) || (b.seats - b.kids.length) - (a.seats - a.kids.length))[0]; if (c) c.kids.push({ no: r.no, name: r.name }); });
            plan[dir] = cars;
        });
        return plan;
    }
    function waiting(id, dir) {
        const p = S.plan[id]; if (!p) return [];
        const inCar = {}; (p[dir] || []).forEach(c => c.kids.forEach(k => inCar[key(k.no, k.name)] = 1));
        return riders(id).filter(r => !inCar[key(r.no, r.name)]);
    }
    function carHtml(ev) {
        const id = ev.id, need = isAdmin() ? riders(id).length : null;
        const go = seatSum(id, 'go'), back = seatSum(id, 'back');
        let h = `<div class="at-card"><div class="at-h">🚗 차량 ${isAdmin() ? '배정' : '모집'} <span>${S.plan[id] && S.plan[id].done ? '확정 ' + esc(String((S.data[id] || {}).planAt || '').slice(5)) : '아직 확정 전'}</span></div>`;
        const box = (lab, s) => `<div class="${need != null && s < need ? 'bad' : ''}">${lab}<b>좌석 ${s}${need != null ? ' / 필요 ' + need + '명' : '석'}${need != null && s < need ? ' ⚠' : ''}</b></div>`;
        h += `<div class="at-sum2">${box('갈 때 (학교 → 경기장)', go)}${box('올 때 (경기장 → 학교)', back)}</div>`;
        if (!isAdmin()) {
            const p = S.plan[id];
            if (p && p.done) {
                const mine = ['go', 'back'].map(dir => (p[dir] || []).map(c => `<div class="at-good">🙋 ${dir === 'go' ? '갈 때' : '올 때'}: <b>${esc(c.dn)}네 차</b> — ${c.kids.map(k => esc(k.name)).join(', ')}</div>`).join('')).join('');
                h += mine || '<div class="at-note">배정표가 나왔어요. 우리 아이 차는 운영진 공지를 봐 주세요.</div>';
            }
            const cars = drivers(id);
            h += `<div class="at-relay">${cars.length ? cars.map(r => `<div>- ${esc(r.name)}네 ${esc(r.seats)}${r.dir === 'back' ? ' <em>(복귀만)</em>' : r.dir === 'go' ? ' <em>(갈 때만)</em>' : ''}${r.bag ? ' 🧳' : ''}</div>`).join('') : '<div class="at-note">아직 올라온 차가 없어요. 「제 차로」를 눌러 올려 주세요.</div>'}</div>`;
            return h + '</div>';
        }
        if (need && Math.min(go, back) < need) h += `<div class="at-warn">⚠ ${go < need ? `갈 때 ${need - go}자리` : ''}${go < need && back < need ? ', ' : ''}${back < need ? `올 때 ${need - back}자리` : ''}가 모자라요.</div>`;
        const p = S.plan[id];
        if (!p) {
            h += `<div class="at-relay">${drivers(id).map(r => `<div>- ${esc(r.name)}네 ${esc(r.seats)}${r.dir === 'back' ? ' <em>(복귀만)</em>' : r.dir === 'go' ? ' <em>(갈 때만)</em>' : ''}${r.bag ? ' 🧳' : ''}</div>`).join('') || '<div class="at-note">아직 「제 차로」 응답이 없어요.</div>'}</div>`;
            h += `<div class="at-btns"><button type="button" class="pri" onclick="AT.auto()">✨ 자동 배정</button><button type="button" onclick="AT.copyCar()">📋 단톡방용 글 복사</button></div>`;
            return h + '</div>';
        }
        const dir = S.dirTab;
        h += `<div class="at-dtab">${['go', 'back'].map(x => `<button type="button" class="${x === dir ? 'on' : ''}" onclick="AT.dir('${x}')">${x === 'go' ? '갈 때' : '올 때'}</button>`).join('')}</div>`;
        h += `<div class="at-note">${S.pick ? '👉 옮길 차를 누르세요' : '아이 이름을 누른 뒤 다른 차를 누르면 옮겨져요.'}</div><div class="at-cars">`;
        (p[dir] || []).forEach((c, ci) => {
            h += `<div class="at-car" onclick="AT.drop(${ci})"><div class="at-ch">🚙 ${esc(c.dn)}네${c.bag ? ' 🧳' : ''}<span>${c.kids.length}/${c.seats}석</span></div><div class="at-seat">${c.kids.map(k => { const kk = key(k.no, k.name); return `<button type="button" class="${S.pick === kk ? 'pick' : ''}" onclick="event.stopPropagation();AT.pick('${esc(kk)}')">${esc(k.name)}</button>`; }).join('')}${'<i>빈자리</i>'.repeat(Math.max(0, c.seats - c.kids.length))}</div></div>`;
        });
        const w = waiting(id, dir);
        h += `</div><div class="at-wait" onclick="AT.drop(-1)"><small>아직 차 없음</small>${w.map(r => { const kk = key(r.no, r.name); return `<button type="button" class="${S.pick === kk ? 'pick' : ''}" onclick="event.stopPropagation();AT.pick('${esc(kk)}')">${esc(r.name)}${r.mv === 'ride' ? ' 🙋' : ''}</button>`; }).join('') || '<span class="at-note">없음 ✔</span>'}</div>`;
        h += `<div class="at-btns"><button type="button" onclick="AT.auto()">✨ 다시 자동 배정</button><button type="button" class="pri" ${S.busy ? 'disabled' : ''} onclick="AT.savePlan()">${p.done ? '✓ 확정됨 · 다시 저장' : '✅ 배정 확정 (학부모에게 보임)'}</button></div>
              <div class="at-btns"><button type="button" onclick="AT.copyCar()">📋 단톡방용 글 복사${S.same ? ' (' + S.ids.length + '일)' : ''}</button></div>`;
        return h + '</div>';
    }

    // ---------- 동작 ----------
    function curKid(k) { const ev = evOf(S.cur); return myKids(ev).find(x => key(x.no, x.name) === k); }
    function set(k, f, v, quiet) {
        const kid = curKid(k); if (!kid) return;
        const d = draftFor(S.cur, kid);
        d[f] = v;
        if (f === 'st' && v === 'no') d.mv = '';
        if (!quiet) render();
    }
    function seat(k, n) { const kid = curKid(k); if (!kid) return; const d = draftFor(S.cur, kid); d.seats = Math.max(1, Math.min(9, d.seats + n)); render(); }
    function proxy(k) {
        if (!k) return; const ev = evOf(S.cur), p = targets(ev).find(x => key(x.no, x.name) === k);
        if (p) { S.extra.push({ no: Number(p.no) || 0, name: p.name }); render(); }
    }
    async function save() {
        if (!S || S.busy) return;
        const ev = evOf(S.cur), kids = myKids(ev), ids = S.allDays ? S.ids : [S.cur];
        const items = [];
        for (const kid of kids) {
            const d = draftFor(S.cur, kid);
            if (!d.st) continue;
            if (isGame(ev) && d.st !== 'no' && !d.mv) { note('warn', `${kid.name}: 이동 방법을 골라 주세요`, '제 차로 · 태워 주세요 · 따로 가요'); return; }
            ids.forEach(id => items.push({ ev: id, no: kid.no, name: kid.name, st: d.st, memo: d.memo, mv: d.mv, seats: d.seats, dir: d.dir, bag: d.bag }));
        }
        if (!items.length) { note('warn', '참석 · 늦게 · 불참 중 하나를 눌러 주세요'); return; }
        S.busy = true; render();
        try {
            await postApi({ action: 'saveAttend', items: items });
            const got = await fetchData(ids, true);
            const ok = items.every(it => ((got[it.ev] || {}).rows || []).some(r => key(r.no, r.name) === key(it.no, it.name) && r.st === it.st));
            ids.forEach(id => { if (id !== S.cur) delete S.draft[id]; S.data[id] = got[id]; if (S.draft[id]) Object.keys(S.draft[id]).forEach(k => { const r = rowFor(id, k); if (r) S.draft[id][k].saved = r.at; }); });
            note(ok ? 'ok' : 'warn', ok ? '응답 저장했캉! 🙋' : '저장이 확인되지 않았어요', ok ? (ids.length > 1 ? `${ids.length}일 모두 저장` : '') : '잠시 뒤 다시 눌러 주세요');
        } catch (e) { note('warn', '저장하지 못했어요', e.message || '인터넷 연결을 확인해 주세요'); }
        S.busy = false; render();
    }
    function auto() { S.plan[S.cur] = autoPlan(S.cur); S.pick = null; render(); }
    function pick(k) { S.pick = S.pick === k ? null : k; render(); }
    function drop(ci) {
        if (!S.pick) return;
        const p = S.plan[S.cur], dir = S.dirTab, cars = p[dir] || [];
        let kid = null;
        cars.forEach(c => { const i = c.kids.findIndex(x => key(x.no, x.name) === S.pick); if (i >= 0) kid = c.kids.splice(i, 1)[0]; });
        if (!kid) { const r = riders(S.cur).find(x => key(x.no, x.name) === S.pick); if (r) kid = { no: r.no, name: r.name }; }
        if (kid && ci >= 0) {
            const c = cars[ci];
            if (c.kids.length >= c.seats) { note('warn', `${c.dn}네 차는 자리가 꽉 찼어요`); const back = cars.find(x => x.kids.length < x.seats); (back || c).kids.push(kid); }
            else c.kids.push(kid);
        }
        S.pick = null; p.done = false; render();
    }
    async function savePlan() {
        const p = S.plan[S.cur]; if (!p || S.busy) return;
        p.done = true; S.busy = true; render();
        const body = JSON.stringify(p);
        try {
            await postApi({ action: 'saveCarplan', ev: S.cur, plan: body });
            const got = await fetchData([S.cur], true);
            S.data[S.cur] = got[S.cur];
            const ok = got[S.cur] && got[S.cur].plan === body;
            note(ok ? 'ok' : 'warn', ok ? '차량 배정 확정했캉! 🚗' : '저장이 확인되지 않았어요', ok ? '학부모 화면에 우리 아이 차가 보여요' : '잠시 뒤 다시 눌러 주세요');
        } catch (e) { p.done = false; note('warn', '저장하지 못했어요', e.message || ''); }
        S.busy = false; render();
    }
    function evTitle(ev) { return `${md(ev.date)} ${ev.title || ev.type}${ev.opponent ? ' vs ' + ev.opponent : ''}`; }
    function carText(id) {
        const ev = evOf(id), p = S.plan[id], need = riders(id).length;
        let t = `🚗 ${evTitle(ev)}${ev.meet ? ' · ' + ev.meet : ev.start ? ' · ' + ev.start : ''}\n`;
        if (p) {
            ['go', 'back'].forEach(dir => {
                t += `[${dir === 'go' ? '갈 때' : '올 때'}]\n`;
                (p[dir] || []).forEach(c => { t += ` - ${c.dn}네(${c.seats}): ${c.kids.map(k => k.name).join(', ') || '빈 차'}\n`; });
                const w = waiting(id, dir); if (w.length) t += ` ※ 아직 차 없음: ${w.map(r => r.name).join(', ')}\n`;
            });
        } else {
            drivers(id).forEach(r => { t += ` - ${r.name}네 ${r.seats}${r.dir === 'back' ? ' (복귀만)' : r.dir === 'go' ? ' (갈 때만)' : ''}\n`; });
            const go = seatSum(id, 'go'), back = seatSum(id, 'back');
            t += `${Math.min(go, back) < need ? '⚠' : '✔'} 갈 때 ${go}/${need}석 · 올 때 ${back}/${need}석${Math.min(go, back) < need ? ' — 차량지원 더 부탁드려요!' : ''}\n`;
        }
        return t;
    }
    function copyCar() { const txt = S.ids.map(carText).join('\n'); try { copyText(txt, '단톡방용 글 복사했캉! 📋', '단톡방에 붙여넣기 하세요'); } catch (e) {} }
    function copyUnans() {
        const ev = evOf(S.cur), u = unanswered(ev);
        const txt = `🙋 ${evTitle(ev)} 참석 응답 부탁드립니다\n아직 안 누른 선수: ${u.map(p => p.name).join(', ') || '없음'}\n(사이트 일정 → 일정 누르기 → 참석 · 이동 응답)`;
        try { copyText(txt, '미응답 알림 글 복사했캉! 📋', '단톡방에 붙여넣기 하세요'); } catch (e) {}
    }
    function copyMeal() {
        const ev = evOf(S.cur), { c } = counts(ev);
        const txt = `🍱 ${evTitle(ev)} 참석 ${c.ok + c.late}명 (늦게 ${c.late}명 포함) · 불참 ${c.no}명`;
        try { copyText(txt, '참석 인원 복사했캉! 📋'); } catch (e) {}
    }
    function day(id) { S.cur = id; S.pick = null; render(); }
    function dirTab(x) { S.dirTab = x; S.pick = null; render(); }
    function allDays(v) { S.allDays = !!v; }
    async function reload() { const ev = evOf(S && S.cur); if (ev) load(ev); }

    window.AT = { detailHtml, load, set, seat, proxy, save, auto, pick, drop, savePlan, copyCar, copyUnans, copyMeal, day, dir: dirTab, allDays, reload, _state: () => S };
})();
