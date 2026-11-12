// 🦉 부캉이 비서 (v2.120.0 · 시안 C: 대화형 비서 창)
//   · 「부캉아」 부르거나(playlist.js 의 호출어 엔진) 🎙 누르거나 글자로 물으면, 앱에 이미 받아 둔 자료
//     (일정 · 경기 결과 · 구장 · 선수 · 공지 · 당번 · 주제곡)를 휴대폰 안에서 찾아 답하고 바로 실행
//   · 서버 · AI 서비스를 부르지 않음 (무료 · 빠름) — 받아쓰기는 휴대폰 기본 음성 인식
//   · 이어 묻기: 방금 말한 일정 · 구장 · 선수를 기억 → 「거기 길찾기」 「그 선수 노래 틀어 줘」
//   · 주문 · 삭제처럼 바뀌는 일은 바로 하지 않고 그 화면을 열어 줌
(function () {
    'use strict';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const LS = 'daeyeon_bka';
    const opt = (function () { try { return Object.assign({ say: true }, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { return { say: true }; } })();
    const saveOpt = () => { try { localStorage.setItem(LS, JSON.stringify(opt)); } catch (e) {} };
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = id => document.getElementById(id);
    const V = (k, ...a) => { try { const pv = window.plVoice; return pv && typeof pv[k] === 'function' ? pv[k](...a) : undefined; } catch (e) { return undefined; } };
    const call = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { console.warn('부캉이 비서:', e); return undefined; } };

    // ---------- index.html 자료 (없으면 빈 값) ----------
    const D = {
        players: () => { try { return (players || []).filter(p => p && p.name && p.visible !== false); } catch (e) { return []; } },
        events: () => { try { return visibleEvents(); } catch (e) { return []; } },
        allEvents: () => { try { return schedEvents.slice(); } catch (e) { return []; } },
        venues: () => { try { return schedVenues.slice(); } catch (e) { return []; } },
        notices: () => { try { return sortedNotices(); } catch (e) { return []; } },
        canSched: () => { try { return canViewSchedule(); } catch (e) { return false; } },
        canNotice: () => { try { return canViewNotice(); } catch (e) { return false; } },
        authed: () => document.documentElement.classList.contains('is-authenticated'),
        tab: () => { try { return currentMainTab; } catch (e) { return ''; } }
    };
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dOf = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
    const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
    const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const C = s => String(s || '').replace(/[\s.,!?~·'"「」()（）\-]/g, '');
    const BK = /(부캉|북항|부강|부광|부캥|북캉|북앙|부깡|푸캉|부칸|북한)\s*(이|아|야|하|가|님|씨)?[\s,.!~]*/g;
    const fixBk = s => String(s || '').replace(/(부캉|북항|부강|부광|부캥|북캉|북앙|부깡|푸캉|부칸|북한)\s*(이|아|야|하|가|님|씨)?/g, '부캉아');
    function korNum(s) {   // 「이십삼」 → 23
        const N = '일이삼사오육칠팔구';
        const m = /^([일이삼사오육칠팔구]?)(십?)([일이삼사오육칠팔구]?)$/.exec(s || '');
        if (!m || !(m[1] || m[2] || m[3])) return 0;
        if (!m[2]) return m[1] ? N.indexOf(m[1]) + 1 : 0;
        return (m[1] ? N.indexOf(m[1]) + 1 : 1) * 10 + (m[3] ? N.indexOf(m[3]) + 1 : 0);
    }
    const NUM = '(\\d+|[일이삼사오육칠팔구십]+)';
    const numOf = (t, re) => { const m = re.exec(t); if (!m) return 0; return /^\d+$/.test(m[1]) ? +m[1] : korNum(m[1]); };
    function hmKo(hm) {   // 「14:30」 → 오후 2시 30분
        const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); if (!m) return '';
        let h = +m[1]; const mi = +m[2], ap = h < 12 ? '오전' : '오후';
        if (h > 12) h -= 12; if (h === 0) h = 12;
        return `${ap} ${h}시${mi ? ' ' + mi + '분' : ''}`;
    }
    const mdKo = ds => { const d = dOf(ds); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };
    const mdShort = ds => { const d = dOf(ds); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };
    const ddOf = ds => { const n = Math.round((dOf(ds) - today0()) / 864e5); return n === 0 ? '오늘' : n === 1 ? '내일' : n > 0 ? 'D-' + n : ''; };
    const vLabel = s => { try { return venueLabel(s); } catch (e) { return String(s || ''); } };
    const typeIcon = t => { try { return typeMeta(t).i; } catch (e) { return '📌'; } };
    const isGame = ev => { try { return isGameEvent(ev); } catch (e) { return ev && (ev.type === '대회' || ev.type === '연습시합'); } };
    const resOf = ev => { try { return parseResult(ev); } catch (e) { return null; } };
    const evEnded = ev => { const t = ymd(today0()); if (ev.date < t) return true; if (ev.date > t) return false; const e = ev.end || ev.start; return !!(e && e < nowHM()); };

    // ---------- 날짜 말 알아듣기 ----------
    function when(t) {
        const T = today0(), dow = T.getDay();
        const mon = addD(T, dow === 0 ? -6 : 1 - dow);   // 이번 주 월요일
        const rng = (a, b, label) => ({ from: ymd(a), to: ymd(b), label });
        const wm = /(이번주|금주|다음주|담주|다다음주|지난주|저번주)?(월|화|수|목|금|토|일)요일/.exec(t);
        if (wm) {
            const k = '월화수목금토일'.indexOf(wm[2]);   // 0 = 월
            let base = mon, lab = '';
            if (/다다음주/.test(wm[1] || '')) { base = addD(mon, 14); lab = '다다음 주 '; }
            else if (/다음주|담주/.test(wm[1] || '')) { base = addD(mon, 7); lab = '다음 주 '; }
            else if (/지난주|저번주/.test(wm[1] || '')) { base = addD(mon, -7); lab = '지난주 '; }
            let d = addD(base, k);
            if (!wm[1] && d < T) d = addD(d, 7);   // 「토요일」만 → 다가오는 토요일
            return rng(d, d, lab + wm[2] + '요일');
        }
        const md = /(\d{1,2}|[일이삼사오육칠팔구십]+)월(\d{1,2}|[일이삼사오육칠팔구십]+)일/.exec(t);
        if (md) {
            const m = /^\d+$/.test(md[1]) ? +md[1] : korNum(md[1]), dd = /^\d+$/.test(md[2]) ? +md[2] : korNum(md[2]);
            if (m >= 1 && m <= 12 && dd >= 1 && dd <= 31) {
                let y = T.getFullYear(); const d0 = new Date(y, m - 1, dd);
                if ((T - d0) / 864e5 > 200) y++;
                const d = new Date(y, m - 1, dd); return rng(d, d, `${m}월 ${dd}일`);
            }
        }
        if (/오늘/.test(t)) return rng(T, T, '오늘');
        if (/내일/.test(t) && !/내일모레/.test(t)) return rng(addD(T, 1), addD(T, 1), '내일');
        if (/모레/.test(t)) return rng(addD(T, 2), addD(T, 2), '모레');
        if (/글피/.test(t)) return rng(addD(T, 3), addD(T, 3), '글피');
        if (/그저께|그제/.test(t)) return rng(addD(T, -2), addD(T, -2), '그저께');
        if (/어제/.test(t)) return rng(addD(T, -1), addD(T, -1), '어제');
        if (/(다음주|담주)주말/.test(t)) return rng(addD(mon, 12), addD(mon, 13), '다음 주 주말');
        if (/주말/.test(t)) { const s = addD(mon, 5); return rng(dow === 0 ? T : s, addD(mon, 6), '이번 주말'); }
        if (/다다음주/.test(t)) return rng(addD(mon, 14), addD(mon, 20), '다다음 주');
        if (/다음주|담주/.test(t)) return rng(addD(mon, 7), addD(mon, 13), '다음 주');
        if (/지난주|저번주/.test(t)) return rng(addD(mon, -7), addD(mon, -1), '지난주');
        if (/이번주|금주|요번주/.test(t)) return rng(T, addD(mon, 6), '이번 주');
        if (/다음달|담달/.test(t)) { const a = new Date(T.getFullYear(), T.getMonth() + 1, 1); return rng(a, new Date(a.getFullYear(), a.getMonth() + 1, 0), (a.getMonth() + 1) + '월'); }
        if (/지난달|저번달/.test(t)) { const a = new Date(T.getFullYear(), T.getMonth() - 1, 1); return rng(a, new Date(a.getFullYear(), a.getMonth() + 1, 0), (a.getMonth() + 1) + '월'); }
        if (/이번달|금월/.test(t)) return rng(T, new Date(T.getFullYear(), T.getMonth() + 1, 0), '이번 달');
        const mo = /(\d{1,2}|[일이삼사오육칠팔구십]+)월/.exec(t);
        if (mo) {
            const m = /^\d+$/.test(mo[1]) ? +mo[1] : korNum(mo[1]);
            if (m >= 1 && m <= 12) {
                let y = T.getFullYear(); if (m - 1 < T.getMonth() - 5) y++;
                return rng(new Date(y, m - 1, 1), new Date(y, m, 0), m + '월');
            }
        }
        const dm = /(\d{1,2})일/.exec(t);
        if (dm && +dm[1] >= 1 && +dm[1] <= 31) { let d = new Date(T.getFullYear(), T.getMonth(), +dm[1]); if (d < addD(T, -7)) d = new Date(T.getFullYear(), T.getMonth() + 1, +dm[1]); return rng(d, d, `${d.getMonth() + 1}월 ${d.getDate()}일`); }
        return null;
    }

    // ---------- 찾기 ----------
    function findPlayers(t) {   // 말 속 선수 이름 (성 빼도 · 「~이」 붙여도) — 가장 길게 맞은 사람들
        let best = [], bl = 0;
        D.players().forEach(p => {
            const nm = C(p.name), keys = [nm];
            if (nm.length >= 3) keys.push(nm.slice(1));
            keys.forEach(k => {
                if (k.length < 2 || t.indexOf(k) < 0) return;
                if (k.length > bl) { bl = k.length; best = [p]; } else if (k.length === bl && best.indexOf(p) < 0) best.push(p);
            });
        });
        return best;
    }
    function venueKeys(v) {
        let ns = [];
        try { ns = venueNames(v); } catch (e) { ns = [v.name]; }
        const out = [];
        ns.forEach(n => { const c = C(n); if (c.length >= 2) out.push(c); const b = c.replace(/(리틀)?(야구장|구장|운동장|스포츠타운|공원)$/, ''); if (b.length >= 2 && b !== c) out.push(b); });
        return out;
    }
    function findVenueIn(t) {
        let best = null, bl = 0;
        D.venues().forEach(v => venueKeys(v).forEach(k => { if (t.indexOf(k) >= 0 && k.length > bl) { bl = k.length; best = v; } }));
        return best;
    }
    function venueOfEvent(ev) {
        if (!ev || !ev.place) return null;
        let v = null; try { v = findVenue(ev.place); } catch (e) {}
        return v ? { name: ev.place, v } : null;
    }
    function evMatches(t, list) {   // 상대 팀 · 장소 · 제목 낱말이 들어 있는 일정
        const hit = [];
        list.forEach(ev => {
            const keys = [];
            if (ev.opponent) { const o = C(ev.opponent); keys.push(o); const b = o.replace(/(초등학교|초교|초|리틀|야구단|야구부)$/, ''); if (b.length >= 2) keys.push(b); }
            if (ev.title && ev.title !== ev.type) keys.push(C(ev.title));
            if (ev.place) { const p = C(vLabel(ev.place)); keys.push(p); }
            if (keys.some(k => k.length >= 2 && t.indexOf(k) >= 0)) hit.push(ev);
        });
        return hit;
    }
    function typeFilter(t) {
        if (/연습시합|연습경기|친선/.test(t)) return ev => ev.type === '연습시합';
        if (/대회|리그|토너먼트/.test(t)) return ev => ev.type === '대회';
        if (/경기|시합|게임|매치/.test(t)) return ev => isGame(ev);
        if (/훈련|연습|트레이닝/.test(t)) return ev => ev.type === '훈련';
        if (/행사/.test(t)) return ev => ev.type === '행사';
        if (/휴식|쉬는날|쉬어/.test(t)) return ev => ev.type === '휴식';
        return null;
    }
    function schedQuery(t) {
        let list = D.events();
        const tf = typeFilter(t); if (tf) list = list.filter(tf);
        const mt = evMatches(t, list); if (mt.length) list = mt;
        const w = when(t);
        if (w) { list = list.filter(ev => ev.date >= w.from && ev.date <= w.to); return { evs: list, label: w.label, range: true }; }
        if (/지난|저번|최근|마지막|아까/.test(t)) { list = list.filter(ev => evEnded(ev)).reverse(); return { evs: list, label: '지난', past: true }; }
        list = list.filter(ev => !evEnded(ev));
        return { evs: list, label: '다가오는' };
    }

    // ---------- 대화 기억 ----------
    const ctx = { ev: null, venue: null, player: null, notice: null };

    // ---------- 답 만들기 ----------
    //  답 = { h, dd, l:[줄], no, items:[{h, s, fn}], btns:[{t, fn, pri, close}], say, quiet }
    function evCard(ev, q) {
        ctx.ev = ev;
        const vo = venueOfEvent(ev); if (vo) ctx.venue = vo;
        const h = (function () { try { return eventHeadline(ev); } catch (e) { return { title: ev.title || '', vs: ev.opponent ? 'VS ' + ev.opponent : '' }; } })();
        const r = resOf(ev);
        const l = [`${typeIcon(ev.type)} ${h.title || ev.type}${h.vs ? ' ' + h.vs : ''}`];
        if (ev.place) l.push('📍 ' + vLabel(ev.place) + (ev.meet ? ' · ' + ev.meet : ''));
        else if (ev.meet) l.push('🕘 ' + ev.meet);
        if (ev.dress) l.push('👕 ' + ev.dress);
        if (r) l.push(`🏁 ${r.label === '승' ? '승리' : r.label === '패' ? '패배' : '무승부'}${r.score ? ' ' + r.score : ''}`);
        let target = ''; try { target = targetText(ev); } catch (e) {}
        if (target && target !== '전체') l.push('👥 ' + target);
        const btns = [{ t: '📅 일정 보기', pri: 1, close: 1, fn: () => { showMainTab('schedule'); openEventDetail(ev.id); } }];
        if (vo) btns.push({ t: '🗺 길찾기', fn: () => routeCard(vo) });
        if (!evEnded(ev)) btns.push({ t: '📆 캘린더에 담기', fn: () => { icsSaveEvent(ev.id); return { h: '캘린더 파일을 만들었어요', l: ['열면 휴대폰 캘린더에 들어가요'], say: '캘린더 파일을 만들었어요.' }; } });
        if (r) btns.push({ t: '📤 결과 공유', fn: () => { gcShare(ev.id); } });
        const time = ev.start ? hmKo(ev.start) : '';
        let say = `${mdKo(ev.date)}${time ? ' ' + time : ''}, ${h.title || ev.type}${ev.opponent ? ', ' + ev.opponent + '와 경기' : ''}${ev.place ? ', 장소는 ' + vLabel(ev.place) : ''}이에요.`;
        if (q === 'dress') say = ev.dress ? `${mdKo(ev.date)} 복장은 ${ev.dress}이에요.` : `${mdKo(ev.date)} 일정엔 복장이 안 적혀 있어요.`;
        if (q === 'meet') say = ev.meet ? `${mdKo(ev.date)}, ${ev.meet}이에요.` : (ev.start ? `${mdKo(ev.date)} ${hmKo(ev.start)} 시작이에요. 모이는 시간은 따로 안 적혀 있어요.` : '모이는 시간이 안 적혀 있어요.');
        if (r) say = `${mdKo(ev.date)} ${ev.opponent || ''} 경기는 ${r.label === '승' ? '이겼어요' : r.label === '패' ? '아쉽게 졌어요' : '비겼어요'}${r.score ? ', ' + r.score.replace(':', ' 대 ') : ''}.`;
        return { h: `${mdShort(ev.date)} ${ev.start ? ev.start + (ev.end ? '~' + ev.end : '') : '종일'}`, dd: ddOf(ev.date), l, btns, say };
    }
    function evList(evs, title, sayHead) {
        ctx.ev = evs[0] || null;
        const items = evs.slice(0, 8).map(ev => {
            const h = (function () { try { return eventHeadline(ev); } catch (e) { return { title: ev.title || '', vs: '' }; } })();
            return { h: `${mdShort(ev.date)} ${ev.start || ''} ${typeIcon(ev.type)} ${h.title || ev.type}${h.vs ? ' ' + h.vs : ''}`, s: ev.place ? '📍 ' + vLabel(ev.place) : '', fn: () => evCard(ev) };
        });
        const first = evs.slice(0, 3).map(ev => `${mdKo(ev.date)} ${(ev.title && ev.title !== ev.type) ? ev.title : ev.type}`).join(', ');
        return { h: title, l: evs.length > 8 ? [`${evs.length}개 중 앞 8개예요`] : [], items, btns: [{ t: '📅 일정 탭 열기', close: 1, fn: () => { showMainTab('schedule'); try { setCalView('list'); } catch (e) {} } }], say: `${sayHead} ${evs.length}개예요. ${first}${evs.length > 3 ? ' 등이에요.' : '.'}` };
    }
    function routeCard(vo) {
        ctx.venue = vo;
        const v = vo.v, nm = vLabel(vo.name || v.name);
        const set = () => { try { plCur = { name: vo.name || v.name, v }; } catch (e) {} };
        return {
            h: '🏟 ' + nm, l: [v.addr ? '📍 ' + v.addr : '주소가 아직 없어요'],
            btns: [
                { t: '🚗 카카오맵 길찾기', pri: 1, fn: () => { set(); plRoute('kakao'); } },
                { t: '🧭 네이버지도', fn: () => { set(); plRoute('naver'); } },
                { t: '🗺 지도 크게', close: 1, fn: () => { set(); plOpenMap(); } },
                { t: '📋 주소 복사', fn: () => { set(); plCopyAddr(); } }
            ],
            say: `${nm}${v.addr ? ', 주소는 ' + v.addr : ''}이에요. 길찾기 버튼을 누르면 지도 앱이 열려요.`
        };
    }
    function playerPath(p) { return `${p.grade}/${p.no || p.name}`; }
    function pidOf(p) { const ps = V('people') || []; const x = ps.find(q => q.name === p.name && String(q.no || 0) === String(p.no || 0)); return x ? x.pid : ''; }
    function playerCard(p) {
        ctx.player = p;
        let staff = false; try { staff = isStaff(p.grade); } catch (e) {}
        const pos = p.pos && p.pos !== '-' && p.pos !== '정보없음' ? String(p.pos) : '';
        const desc = staff ? [String(p.grade || ''), pos].filter(Boolean).join(' · ') : [/^\d+$/.test(String(p.grade)) ? p.grade + '학년' : String(p.grade || ''), p.no ? p.no + '번' : '', pos].filter(Boolean).join(' · ');
        const pid = staff ? '' : pidOf(p);
        const btns = [{ t: '👤 선수 화면', pri: 1, close: 1, fn: () => goToPlayer(playerPath(p)) }];
        if (pid) btns.push({ t: '🎵 주제곡 듣기', fn: () => playP(p) });
        btns.push({ t: '📋 명단에서 보기', close: 1, fn: () => { showMainTab('roster'); const si = $('searchInput'); if (si) si.value = p.name; handleSearchInput(p.name); } });
        return { no: p.no || (staff ? '★' : '·'), h: p.name, l: [desc], btns, say: `${p.no ? p.no + '번 ' : ''}${p.name}${staff ? '' : ' 선수'}예요. ${desc.replace(/ · /g, ', ')}.` };
    }
    function playerList(ps, title) {
        return { h: title, items: ps.slice(0, 30).map(p => ({ h: `${p.no ? p.no + '번 ' : ''}${p.name}`, s: [/^\d+$/.test(String(p.grade)) ? p.grade + '학년' : p.grade, p.pos && p.pos !== '-' ? p.pos : ''].filter(Boolean).join(' · '), fn: () => playerCard(p) })), say: `${title}, ${ps.length}명이에요.` };
    }
    function playP(p) {
        const pid = pidOf(p);
        if (pid && V('playPerson', pid)) return { h: `🎵 ${p.name} 주제곡을 틀었어요`, l: ['아래 재생 띠에서 멈추거나 넘길 수 있어요'], say: `${p.name} 선수 주제곡을 틀게요.`, quiet: 1 };
        return { h: `${p.name} 선수는 아직 주제곡이 없어요`, say: '아직 주제곡이 없어요.' };
    }
    function noticeOpen(n) {
        showMainTab('notice');
        try { noticeOpenId = n.id; renderNotices(); } catch (e) {}
    }
    function noticeText(n) { return String(n.body || '').replace(/\s+/g, ' ').trim(); }
    function noticeCard(n, read) {
        ctx.notice = n;
        const body = noticeText(n);
        return { h: '📢 ' + (n.title || '공지'), l: [String(n.created || '').slice(0, 10) + (n.cat ? ' · ' + n.cat : ''), body.length > 160 ? body.slice(0, 160) + '…' : body],
            btns: [{ t: '📢 공지 열기', pri: 1, close: 1, fn: () => noticeOpen(n) }, { t: '🔊 읽어 줘', fn: () => ({ h: '읽어 드릴게요', say: (n.title || '') + '. ' + body.slice(0, 400), force: 1 }) }],
            say: read ? (n.title || '') + '. ' + body.slice(0, 400) : `${n.title || '공지'}. 공지 열기를 누르면 전체를 볼 수 있어요.`, force: read ? 1 : 0 };
    }
    const HELP = ['다음 경기 언제야', '이번 주 일정', '토요일에 뭐 있어', '지난 경기 결과', '올해 전적', '다음 경기 어디야, 길찾기', '7번 선수 찾아줘', '6학년 명단', '새 공지 있어', '내 당번 언제야', '전체 주제곡 틀어', '타석 모드 열어', '글씨 크게'];
    function help() {
        return { h: '이런 걸 물어보세요', l: ['말이 조금 달라도 알아들어요. 「부캉아」 부르고 말하거나 🎙 누르거나 아래 칸에 적어도 돼요.'], items: HELP.map(q => ({ h: '「' + q + '」', s: '', ask: q })), say: '일정, 경기 결과, 구장 길찾기, 선수, 공지, 당번, 노래를 물어보세요.' };
    }
    const deny = () => ({ h: '보호자 로그인 후에 볼 수 있어요', l: ['일정 · 공지 · 당번은 휴대폰 번호로 로그인하면 보여요'], say: '보호자 로그인 후에 볼 수 있어요.' });

    // ---------- 두뇌: 말 → 답 ----------
    function think(raw) {
        const s = String(raw || '').replace(BK, ' ').replace(/\s+/g, ' ').trim();
        const t = C(s);
        if (!t) return { h: '네, 말씀하세요!', l: ['🎙을 누르고 물어보세요'], say: '네, 말씀하세요.' };

        // 1) 도움말 · 닫기
        if (/뭐할수|뭘할수|뭐해줄수|뭘해줄|도움말|사용법|할수있는|할줄|명령어|기능알려/.test(t)) return help();
        if (/^(고마워|고맙|땡큐|됐어|닫아|닫기|창닫|그만해|끝|잘했어)/.test(t)) return { h: '언제든 「부캉아」 불러 주세요!', say: '언제든 불러 주세요.', run: () => setTimeout(close, 900) };

        // 2) 타석 모드에 있으면 그 명령 먼저 (다음 타자 · 홈런 …)
        if (V('inBat')) { const hit = V('parse', s); if (hit && hit.run) return { h: '⚾ ' + hit.say, say: '', quiet: 1, run: () => { close(); hit.run(); } }; }

        if (/날씨|기온|미세먼지|비와|비오|비올|눈와|눈오/.test(t)) return { h: '날씨는 아직 알 수 없어요', l: ['일정 · 경기 결과 · 구장 · 선수 · 공지 · 당번 · 노래를 물어보세요'], say: '날씨는 아직 알 수 없어요.' };
        // 3) 설정
        if (/글씨|글자|화면/.test(t) && /크게|키워|크게해|확대/.test(t)) return { h: '글씨를 크게 했어요', say: '글씨를 크게 했어요.', run: () => changeUiZoom(1) };
        if (/글씨|글자|화면/.test(t) && /작게|줄여|축소/.test(t)) return { h: '글씨를 작게 했어요', say: '글씨를 작게 했어요.', run: () => changeUiZoom(-1) };
        if (/글씨|글자/.test(t) && /원래|보통|기본/.test(t)) return { h: '글씨를 원래 크기로 했어요', run: () => resetUiZoom() };
        if (/목소리등록|내목소리/.test(t)) return { h: '내 목소리 등록', run: () => enroll() };
        if (/(대답|답|소리)(을|를)?(읽|말)/.test(t) && /꺼|끄|그만|하지마/.test(t)) { opt.say = false; saveOpt(); return { h: '이제 대답을 소리로 읽지 않아요', l: ['⚙ 설정에서 다시 켤 수 있어요'] }; }
        if (/(대답|답|소리)(을|를)?(읽|말)/.test(t) && /켜|해줘|읽어/.test(t)) { opt.say = true; saveOpt(); return { h: '이제 대답을 소리로 읽어 드려요', say: '이제 대답을 읽어 드릴게요.' }; }
        if (/설정/.test(t)) return settings();

        // 4) 노래
        const ps = findPlayers(t);
        const songW = /노래|주제곡|등장곡|응원가|음악|틀어|들려|재생|플레이/.test(t);
        if (/타석모드|타석화면|등장곡모드/.test(t)) return { h: '⚾ 타석 모드를 열었어요', say: '타석 모드를 열게요.', run: () => { close(); V('goBat'); } };
        if (/서서히|천천히|페이드/.test(t) && /꺼|끄|줄|멈/.test(t)) return V('hasCur') ? { h: '🔉 서서히 끌게요', run: () => V('fade'), quiet: 1 } : { h: '지금 나오는 노래가 없어요' };
        if (/(멈춰|정지|일시정지|스톱|스탑|조용|그만틀|노래꺼|음악꺼|노래끄|음악끄|소리꺼)/.test(t) && !ps.length) return V('hasCur') ? { h: '⏸ 노래를 멈췄어요', run: () => V('stop'), quiet: 1 } : { h: '지금 나오는 노래가 없어요' };
        if (/다음(곡|노래)|넘겨|스킵/.test(t)) return V('next') ? { h: '⏭ 다음 곡', quiet: 1 } : { h: '지금 나오는 노래가 없어요' };
        if (/이전(곡|노래)|앞(곡|노래)/.test(t)) return V('prev') ? { h: '⏮ 이전 곡', quiet: 1 } : { h: '지금 나오는 노래가 없어요' };
        if (/(전체|모든|전부|다)(주제곡|노래|곡|응원가)|셔플|랜덤|섞어/.test(t) && songW) {
            const sh = /셔플|랜덤|섞어|무작위/.test(t);
            return V('playAllSongs', sh) ? { h: `🎵 전체 주제곡을 ${sh ? '섞어서 ' : ''}틀었어요`, l: ['아래 재생 띠에서 멈추거나 넘길 수 있어요'], say: '전체 주제곡을 틀게요.', quiet: 1 } : { h: '들을 수 있는 곡이 아직 없어요' };
        }
        if (/새(노래|곡|주제곡)/.test(t)) return { h: '🎵 음악 탭을 열었어요', l: ['새로 들어온 곡은 곡 이름 옆에 NEW가 붙어 있어요'], run: () => { close(); V('goList'); } };
        if (/(다시|계속|이어)(틀|재생|들)/.test(t)) return V('resume') ? { h: '▶ 다시 틀었어요', quiet: 1 } : { h: '이어서 들을 곡이 없어요' };

        // 5) 우리 아이
        let mine = [];
        if (/우리(아이|애|아들|딸|자녀)|내(아이|아들|딸)|울애|우리얘/.test(t)) {
            let u = null; try { u = getActiveUser(); } catch (e) {}
            const cs = (u && u.children) || [];
            mine = D.players().filter(p => cs.some(c => (c.no && p.no) ? Number(c.no) === Number(p.no) : C(c.name) === C(p.name)));
        }
        const thatP = /그선수|그친구|그아이|걔|그애/.test(t) && ctx.player ? [ctx.player] : [];
        let byNo = [];
        if (!ps.length && !mine.length && !thatP.length && songW) {
            const n0 = numOf(t, new RegExp(NUM + '번(?!째|타자)'));
            if (n0) byNo = D.players().filter(p => +p.no === n0 && !(function () { try { return isStaff(p.grade); } catch (e) { return false; } })());
        }
        const who = ps.length ? ps : mine.length ? mine : thatP.length ? thatP : byNo;

        if (who.length && songW) {
            if (who.length > 1) return playerList(who, '누구 노래를 틀까요?');
            return Object.assign(playP(who[0]), { run: null });
        }

        // 6) 당번
        if (/당번|청소/.test(t)) {
            let ok = false; try { ok = dutyOk(); } catch (e) {}
            if (!ok) return D.canSched() ? { h: '당번표가 아직 없어요', say: '당번표가 아직 없어요.' } : deny();
            const up = (function () { try { return dutyAgenda(); } catch (e) { return []; } })();
            const m = (function () { try { return dutyMineNext(); } catch (e) { return null; } })();
            const ww = u => { try { return dutyWhen(u); } catch (e) { return u.d; } };
            const dd = u => { try { return dutyDdU(u); } catch (e) { return ''; } };
            const whoT = u => { try { return dutyWhoText(u.p); } catch (e) { return ''; } };
            const items = up.slice(0, 4).map(u => ({ h: `${ww(u)} ${dd(u)}`, s: whoT(u), fn: () => { close(); openDutyModal(); } }));
            if (/우리|내|제|저희|울/.test(t) || m) {
                return { h: m ? `🧹 우리 집 차례: ${ww(m)}` : '🧹 우리 집 차례가 아직 없어요', dd: m ? dd(m) : '', l: m ? [whoT(m)] : [], items, btns: [{ t: '🧹 당번표 보기', pri: 1, close: 1, fn: () => openDutyModal() }],
                    say: m ? `우리 집 청소 당번은 ${ww(m).replace(/\((.)\)/g, ' $1요일')}이에요.` : '다가오는 당번 중에 우리 집 차례는 없어요.' };
            }
            const f = up[0];
            return { h: '🧹 다가오는 청소 당번', items, btns: [{ t: '🧹 당번표 보기', pri: 1, close: 1, fn: () => openDutyModal() }], say: f ? `다음 청소는 ${ww(f).replace(/\((.)\)/g, ' $1요일')}, ${whoT(f)}이에요.` : '다가오는 당번이 없어요.' };
        }

        // 7) 공지
        if (/공지|알림장|안내문|소식|준비물|공문|가정통신/.test(t)) {
            if (!D.canNotice()) return deny();
            let ns = D.notices();
            if (!ns.length) return { h: '공지가 아직 없어요', say: '공지가 아직 없어요.' };
            const kw = s.split(' ').map(C).filter(w => w.length >= 2 && !/공지|알려|보여|있어|읽어|최근|새로|새|뭐야|찾아|좀|사항|확인|부캉/.test(w));
            const hit = kw.length ? ns.filter(n => kw.some(w => C(n.title + n.body).indexOf(w) >= 0)) : [];
            const isNew = n => { try { return isNewNotice(n); } catch (e) { return false; } };
            if (/준비물/.test(t)) { const h2 = ns.filter(n => /준비물|챙겨|지참/.test(n.title + n.body)); if (h2.length) ns = h2; }
            else if (hit.length) ns = hit;
            else if (/새|최근|최신|오늘/.test(t)) { const nn = ns.filter(isNew); if (nn.length) ns = nn; else return { h: '최근 7일 동안 새 공지는 없어요', items: ns.slice(0, 3).map(n => ({ h: n.title, s: String(n.created || '').slice(0, 10), fn: () => noticeCard(n) })), say: '최근 일주일 동안 새 공지는 없어요.' }; }
            const read = /읽어|들려|말해/.test(t);
            if (read && !hit.length) ns = ns.slice().sort((a, b) => String(a.created || '') < String(b.created || '') ? 1 : -1);
            if (ns.length === 1 || read) return noticeCard(ns[0], read);
            return { h: `📢 공지 ${ns.length}개`, items: ns.slice(0, 6).map(n => ({ h: (n.pinned === 'Y' ? '📌 ' : '') + (isNew(n) ? '🆕 ' : '') + n.title, s: String(n.created || '').slice(0, 10), fn: () => noticeCard(n) })),
                btns: [{ t: '📢 공지 탭 열기', close: 1, fn: () => showMainTab('notice') }], say: `공지 ${ns.length}개예요. 맨 위는 ${ns[0].title}이에요.` };
        }

        // 8) 유니폼 접수
        if (/유니폼/.test(t) && /주문|신청|접수|사이즈|치수|구매|살래/.test(t)) return { h: '👕 유니폼 신청 창을 열게요', say: '유니폼 신청 창을 열게요.', run: () => { close(); openUniformModal(); } };

        // 9) 일정이 필요한 질문들
        const schedW = /일정|스케줄|경기|대회|시합|훈련|연습|행사|휴식|언제|몇시|뭐있|뭐해|뭐하|모여|집합|출발|복장|뭐입|입고|상대|어디서|결과|이겼|졌|몇대몇|스코어|점수|전적|성적|몇승|승률|mvp|수훈/i.test(t);
        const routeW = /어디|길찾기|길안내|가는길|가는법|주소|네비|내비|지도|위치|구장|야구장/.test(t);
        const dateW = !!when(t);
        if ((schedW || dateW || routeW) && !D.canSched() && !(routeW && !schedW && findVenueIn(t))) return deny();

        // 9-1) 경기 결과 · 전적 · 수훈
        if (/전적|성적|몇승|승률|시즌기록|올해기록/.test(t)) {
            const yr = String(new Date().getFullYear());
            const games = D.allEvents().filter(ev => String(ev.date).slice(0, 4) === yr && isGame(ev) && resOf(ev));
            const tl = (function () { try { return gcTally(games); } catch (e) { return { n: games.length, text: '' }; } })();
            if (!games.length) return { h: '올해 기록된 경기 결과가 아직 없어요', say: '올해 경기 결과가 아직 없어요.' };
            const recent = games.slice().sort((a, b) => a.date < b.date ? 1 : -1);
            return { h: `🏆 올해 ${tl.n}경기 ${tl.text}`, items: recent.slice(0, 5).map(ev => { const r = resOf(ev); return { h: `${mdShort(ev.date)} ${r.label}${r.score ? ' ' + r.score : ''} VS ${ev.opponent || ''}`, s: (ev.title && ev.title !== ev.type) ? ev.title : ev.type, fn: () => evCard(ev) }; }),
                btns: [{ t: '📅 일정 탭에서 보기', close: 1, fn: () => showMainTab('schedule') }], say: `올해 ${tl.n}경기, ${tl.text}예요.` };
        }
        if (/결과|이겼|졌|몇대몇|스코어|점수|mvp|수훈/i.test(t)) {
            let games = D.allEvents().filter(ev => isGame(ev) && resOf(ev)).sort((a, b) => a.date < b.date ? 1 : -1);
            const mt = evMatches(t, games); if (mt.length) games = mt;
            const w = when(t); if (w) games = games.filter(ev => ev.date >= w.from && ev.date <= w.to);
            if (/mvp|수훈/i.test(t)) games = games.filter(ev => ev.mvp);
            if (!games.length) return { h: '찾는 경기 결과가 없어요', l: ['결과는 대표님 · 총무님이 일정에 적으면 보여요'], say: '찾는 경기 결과가 없어요.' };
            const ev = games[0];
            if (/mvp|수훈/i.test(t)) {
                let mv = null; try { mv = gcMvp(ev); } catch (e) {}
                if (mv) { const c = evCard(ev); c.h = `⭐ ${mv.no ? mv.no + '번 ' : ''}${mv.name}`; c.l = [`${mdShort(ev.date)} VS ${ev.opponent || ''} 수훈 선수`].concat(mv.note ? [mv.note] : []); c.say = `${mdKo(ev.date)} 경기 수훈 선수는 ${mv.name}이에요.${mv.note ? ' ' + mv.note : ''}`; if (mv.p) c.btns.unshift({ t: '👤 선수 화면', close: 1, fn: () => goToPlayer(playerPath(mv.p)) }); return c; }
            }
            return evCard(ev);
        }

        // 9-2) 구장 · 길찾기
        const vIn = findVenueIn(t);
        if (routeW && !(/일정|언제|몇시/.test(t) && !/어디|길|주소|지도|위치/.test(t))) {
            if (vIn && !/경기|대회|시합|훈련|일정/.test(t)) return routeCard({ name: vIn.name, v: vIn });
            if (/거기|그곳|그구장|그장소|그데/.test(t) && ctx.venue) return routeCard(ctx.venue);
            if (/구장목록|구장들|구장다|구장리스트|야구장목록/.test(t)) {
                const vs = D.venues();
                return { h: `🏟 구장 ${vs.length}곳`, items: vs.slice(0, 20).map(v => ({ h: vLabel(v.name), s: v.addr || '', fn: () => routeCard({ name: v.name, v }) })), btns: [{ t: '🏟 구장 탭 열기', close: 1, fn: () => showMainTab('venue') }], say: `구장 ${vs.length}곳이에요.` };
            }
            const q = schedQuery(t), ev = (/거기|그경기|그날|그일정/.test(t) && ctx.ev) ? ctx.ev : (q.evs[0] || null);
            if (ev) {
                const vo = venueOfEvent(ev);
                if (vo) { const c = routeCard(vo); c.l.unshift(`${mdShort(ev.date)} ${ev.start || ''} ${(ev.title && ev.title !== ev.type) ? ev.title : ev.type}`); c.say = `${mdKo(ev.date)} 일정은 ${vLabel(ev.place)}에서 해요. ` + c.say; ctx.ev = ev; return c; }
                if (ev.place) return { h: '📍 ' + ev.place, l: ['이 장소는 구장 목록에 없어 지도를 바로 못 열어요'], say: `${ev.place}이에요.` };
            }
            if (vIn) return routeCard({ name: vIn.name, v: vIn });
            return { h: '어느 곳인지 못 찾았어요', l: ['「다음 경기 어디야」 「(구장 이름) 길찾기」처럼 말해 주세요'], say: '어느 곳인지 못 찾았어요.' };
        }

        // 9-3) 캘린더에 담기 · 달력 보기
        if (/캘린더|달력/.test(t) && /넣|저장|담|추가|등록/.test(t)) {
            if (/그거|그일정|그경기|이거/.test(t) && ctx.ev) return { h: '📆 캘린더 파일을 만들었어요', l: ['열면 휴대폰 캘린더에 들어가요'], say: '캘린더 파일을 만들었어요.', run: () => icsSaveEvent(ctx.ev.id) };
            return { h: '📆 다가오는 일정을 캘린더 파일로 만들었어요', l: ['열면 휴대폰 캘린더에 한꺼번에 들어가요'], say: '다가오는 일정을 캘린더 파일로 만들었어요.', run: () => icsSaveUpcoming() };
        }
        if (/달력으로|달력보|월간|한달/.test(t)) return { h: '📅 달력을 열었어요', run: () => { close(); showMainTab('schedule'); setCalView('month'); } };

        // 9-4) 선수 찾기 (일정 말이 없을 때)
        const no = numOf(t, new RegExp(NUM + '번(?!째|타자)'));
        const gr = numOf(t, new RegExp('([1-6]|[일이삼사오육])학년'));
        const POS = /(투수|포수|1루수|2루수|3루수|일루수|이루수|삼루수|유격수|내야수|외야수|좌익수|중견수|우익수)/.exec(t);
        if (!schedW || who.length) {
            if (who.length > 1) {
                if (no) { const one = who.filter(p => +p.no === no); if (one.length === 1) return playerCard(one[0]); }
                return playerList(who, '이름이 같은 사람이 있어요');
            }
            if (who.length === 1 && !dateW) return playerCard(who[0]);
            if (no && !dateW) {
                const p = D.players().find(x => +x.no === no && !(function () { try { return isStaff(x.grade); } catch (e) { return false; } })());
                return p ? playerCard(p) : { h: `${no}번 선수를 못 찾았어요`, say: `${no}번 선수를 못 찾았어요.` };
            }
            if (/코치|감독|지도자|코칭스태프/.test(t)) return playerList(D.players().filter(p => { try { return isStaff(p.grade); } catch (e) { return false; } }), '👔 코칭스태프');
            if (gr || POS) {
                let list = D.players().filter(p => { try { return !isStaff(p.grade); } catch (e) { return true; } });
                if (gr) list = list.filter(p => (parseInt(String(p.grade).replace(/[^0-9]/g, ''), 10) || 0) === gr);
                if (POS) { const pk = POS[1].replace('일루', '1루').replace('이루', '2루').replace('삼루', '3루'); list = list.filter(p => String(p.pos || '').indexOf(pk.replace(/수$/, '')) >= 0); }
                list.sort((a, b) => (+a.no || 999) - (+b.no || 999));
                return list.length ? playerList(list, `👥 ${gr ? gr + '학년' : ''}${gr && POS ? ' ' : ''}${POS ? POS[1] : ''}`) : { h: '찾는 선수가 없어요', say: '찾는 선수가 없어요.' };
            }
            if (/명단|선수(들|목록)|전체선수/.test(t)) return { h: '👥 명단을 열었어요', run: () => { close(); showMainTab('roster'); } };
        }

        // 9-5) 일정
        if (schedW || dateW || evMatches(t, D.events()).length) {
            if ((/그거|그경기|그날|그일정/.test(t) || (!dateW && !typeFilter(t) && /복장|뭐입|모여|집합|출발|몇시까지/.test(t) && ctx.ev && !/다음/.test(t))) && ctx.ev) {
                return evCard(ctx.ev, /복장|뭐입|입고/.test(t) ? 'dress' : /모여|집합|출발|몇시까지/.test(t) ? 'meet' : '');
            }
            const q = schedQuery(t);
            const want = /복장|뭐입|입고/.test(t) ? 'dress' : /모여|집합|출발|몇시까지/.test(t) ? 'meet' : '';
            if (!q.evs.length) {
                const lb = q.range ? q.label + '에는' : q.past ? '지난' : '다가오는';
                return { h: `${lb} ${typeFilter(t) ? '해당' : ''} 일정이 없어요`.replace(/\s+/g, ' '), btns: [{ t: '📅 일정 탭 열기', close: 1, fn: () => showMainTab('schedule') }], say: `${lb} 일정이 없어요.` };
            }
            const single = want || (!q.range && /다음|언제|몇시|가장가까운|제일가까운|곧/.test(t)) || q.evs.length === 1 || (q.past && !/일정들|목록/.test(t));
            if (single) return evCard(q.evs[0], want);
            return evList(q.evs, `📅 ${q.range ? q.label : q.past ? '지난' : '다가오는'} 일정 ${q.evs.length}개`, `${q.range ? q.label : q.past ? '지난' : '다가오는'} 일정은`);
        }

        // 10) 탭 열기
        const TABS = [['schedule', /일정|달력|캘린더/], ['notice', /공지/], ['roster', /명단|선수/], ['music', /음악|노래|주제곡/], ['venue', /구장/]];
        for (const [tab, re] of TABS) if (re.test(t) && /탭|화면|열어|보여|가자|가줘|이동/.test(t)) return { h: '열었어요', run: () => { close(); if (tab === 'music') V('goList'); else showMainTab(tab); } };
        if (/앱설치|설치방법|설치해|홈화면/.test(t)) return { h: '📲 앱 설치 안내를 열게요', run: () => { close(); try { bkInstallNow(); } catch (e) { apkGuideOpen(); } } };

        // 11) 선수 이름만 · 구장 이름만
        if (vIn) return routeCard({ name: vIn.name, v: vIn });
        return { h: '잘 못 알아들었어요', l: ['「' + s + '」', '아래처럼 물어보세요'], items: HELP.slice(0, 6).map(q => ({ h: '「' + q + '」', s: '', ask: q })), say: '잘 못 알아들었어요. 다시 말해 주세요.', miss: 1 };
    }

    // ---------- 화면 ----------
    let pan = null, ov = null, bodyEl = null, inp = null, micB = null, stEl = null;
    let isOpenNow = false, rec = null, listening = false, viaVoice = false, enrolling = false;
    const acts = [];
    const CHIPS = [['📅 다음 경기', '다음 경기 언제야'], ['🗓 이번 주 일정', '이번 주 일정'], ['🏆 지난 경기', '지난 경기 결과'], ['🏟 길찾기', '다음 경기 어디야'], ['👥 선수 찾기', ''], ['📢 새 공지', '새 공지 있어'], ['🧹 내 당번', '내 당번 언제야'], ['🎵 주제곡 틀기', '전체 주제곡 틀어'], ['⚾ 타석 모드', '타석 모드 열어'], ['❓ 할 수 있는 일', '뭐 할 수 있어']];
    function build() {
        if (pan) return;
        ov = document.createElement('div'); ov.className = 'bka-ov'; ov.hidden = true; ov.addEventListener('click', close);
        pan = document.createElement('div'); pan.className = 'bka-pan'; pan.hidden = true;
        pan.setAttribute('role', 'dialog'); pan.setAttribute('aria-label', '부캉이 비서');
        pan.innerHTML = `<div class="bka-hd"><i class="bka-bk" aria-hidden="true"></i><div class="bka-tt"><b>부캉이</b><small id="bkaSt"></small></div>
              <button type="button" class="bka-hb" data-a="set" aria-label="설정">⚙</button><button type="button" class="bka-hb" data-a="x">닫기</button></div>
            <div class="bka-body" id="bkaBody" aria-live="polite"></div>
            <div class="bka-chips">${CHIPS.map((c, i) => `<button type="button" data-chip="${i}">${c[0]}</button>`).join('')}</div>
            <form class="bka-in" autocomplete="off"><button type="button" class="bka-mic" data-a="mic" aria-label="말로 묻기">🎙</button>
              <input id="bkaInp" type="text" enterkeyhint="send" placeholder="여기 적거나 🎙 눌러 물어보세요"><button type="submit" class="bka-send" aria-label="보내기">➤</button></form>`;
        document.body.appendChild(ov); document.body.appendChild(pan);
        // v2.121.1: 창을 끌 때 뒤 화면이 같이 움직이지 않게 — 창 안에서 실제로 움직일 수 있는 곳(대화 · 추천 버튼 줄)만 끌림
        let ty = 0, tx = 0;
        const canScroll = (el, dy, dx) => {
            for (; el && el !== pan; el = el.parentElement) {
                if (el.classList.contains('bka-body')) { if (el.scrollHeight > el.clientHeight + 1 && Math.abs(dy) >= Math.abs(dx)) { if (dy > 0 && el.scrollTop <= 0) return false; if (dy < 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1) return false; return true; } return false; }
                if (el.classList.contains('bka-chips')) return Math.abs(dx) > Math.abs(dy) && el.scrollWidth > el.clientWidth + 1;
            }
            return false;
        };
        const onTs = e => { const t = e.touches[0]; if (t) { ty = t.clientY; tx = t.clientX; } };
        const onTm = e => { const t = e.touches[0]; if (!t || e.touches.length > 1) return; if (!canScroll(e.target, t.clientY - ty, t.clientX - tx) && e.cancelable) e.preventDefault(); };
        [ov, pan].forEach(x => { x.addEventListener('touchstart', onTs, { passive: true }); x.addEventListener('touchmove', onTm, { passive: false }); x.addEventListener('wheel', e => { if (!e.target.closest || !e.target.closest('.bka-body')) e.preventDefault(); }, { passive: false }); });
        bodyEl = $('bkaBody'); inp = $('bkaInp'); stEl = $('bkaSt'); micB = pan.querySelector('.bka-mic');
        if (!SR) micB.hidden = true;
        pan.addEventListener('click', onClick);
        pan.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; inp.value = ''; ask(v, false); });
        setSt('');
        hello();
    }
    function hello() {
        bot({ h: '안녕하세요, 부캉이예요! 🦉', l: ['일정 · 경기 결과 · 구장 길찾기 · 선수 · 공지 · 당번 · 주제곡을 물어보세요.', V('bkOn') ? '「부캉아」 부르면 어느 탭에서든 바로 들어요.' : '⚙ 설정에서 「부캉아」 부르기를 켜면 손 안 대고 부를 수 있어요.'] }, true);
    }
    function setSt(k, txt) {
        if (!stEl) return;
        const st = k === 'listen' ? '● 듣고 있어요' : k === 'think' ? '생각하는 중…' : txt || (V('bkOn') ? '「부캉아」 기다리는 중' : '무엇이든 물어보세요');
        stEl.textContent = st; stEl.className = k === 'listen' ? 'on' : '';
        if (micB) { micB.classList.toggle('rec', k === 'listen'); micB.setAttribute('aria-pressed', k === 'listen' ? 'true' : 'false'); }
        pan && pan.classList.toggle('listening', k === 'listen');
    }
    function scrollEnd() { if (bodyEl) requestAnimationFrame(() => { bodyEl.scrollTop = bodyEl.scrollHeight; }); }
    function me(text) { const d = document.createElement('div'); d.className = 'bka-me'; d.textContent = fixBk(text); bodyEl.appendChild(d); scrollEnd(); }
    function reg(fn) { acts.push(fn); return acts.length - 1; }
    function bot(a, noSay) {
        if (!a) return;
        const w = document.createElement('div'); w.className = 'bka-bot';
        let h = '<i class="bka-bk" aria-hidden="true"></i><div class="bka-card">';
        const head = a.h ? `<div class="h">${esc(a.h)}${a.dd ? `<em>${esc(a.dd)}</em>` : ''}</div>` : '';
        if (a.no != null) h += `<div class="bka-pl"><div class="bka-no">${esc(a.no)}</div><div>${head}${(a.l || []).map(x => `<div class="l">${esc(x)}</div>`).join('')}</div></div>`;
        else h += head + (a.l || []).filter(Boolean).map(x => `<div class="l">${esc(x)}</div>`).join('');
        if (a.items && a.items.length) h += '<div class="bka-items">' + a.items.map(it => `<button type="button" data-k="${reg(it.ask ? () => ask(it.ask, false) : () => { const r = it.fn(); if (r) bot(r); })}"><b>${esc(it.h)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ''}</button>`).join('') + '</div>';
        if (a.btns && a.btns.length) h += '<div class="bka-bt">' + a.btns.map(b => `<button type="button" class="${b.pri ? 'pri' : 'sec'}" data-k="${reg(() => { if (b.close) close(); const r = call(b.fn); if (r && !b.close) bot(r); })}">${esc(b.t)}</button>`).join('') + '</div>';
        h += '</div>';
        w.innerHTML = h; bodyEl.appendChild(w); scrollEnd();
        if (!noSay && a.say && opt.say && (viaVoice || a.force)) speak(a.say);
    }
    function speak(text) {
        try {
            if (!window.speechSynthesis) return;
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text).replace(/[🦉📅📍👕🏁👥🏆🗺📆📤🎵⏸⏭⏮▶⚾🧹📢🆕📌⭐🏟🚗🧭📋👤]/gu, ''));
            u.lang = 'ko-KR'; u.rate = 1.05;
            const vs = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
            if (vs.length) u.voice = vs.find(v => /google|female|여/i.test(v.name)) || vs[0];
            V('duck', true); u.onend = u.onerror = () => V('duck', false);
            speechSynthesis.speak(u);
        } catch (e) {}
    }
    function ask(text, voice) {
        build();
        if (!isOpenNow) open();
        viaVoice = !!voice;
        me(text);
        let a = null;
        try { a = think(text); } catch (e) { console.warn('부캉이 비서 생각 실패:', e); a = { h: '앗, 잠깐 문제가 생겼어요', l: ['다시 말해 주세요'] }; }
        bot(a);
        if (a && a.run) call(a.run);
    }
    function askAlts(alts) {   // 받아쓰기 후보 여러 개 → 알아들은 첫 번째
        build(); if (!isOpenNow) open();
        viaVoice = true;
        let pick = alts[0], a = null;
        for (const x of alts) { try { const r = think(x); if (r && !r.miss) { pick = x; a = r; break; } } catch (e) {} }
        me(pick);
        if (!a) { try { a = think(pick); } catch (e) { a = { h: '다시 말해 주세요' }; } }
        bot(a);
        if (a && a.run) call(a.run);
    }
    function onClick(e) {
        const k = e.target.closest('[data-k]'); if (k) { const fn = acts[+k.dataset.k]; if (fn) call(fn); return; }
        const c = e.target.closest('[data-chip]');
        if (c) { const ch = CHIPS[+c.dataset.chip]; if (ch[1]) ask(ch[1], false); else { inp.value = ''; inp.placeholder = '선수 이름이나 등번호를 적어 보세요'; inp.focus(); } return; }
        const b = e.target.closest('[data-a]'); if (!b) return;
        const a = b.dataset.a;
        if (a === 'x') close();
        else if (a === 'mic') listen();
        else if (a === 'set') bot(settings());
        else if (a === 'bk') { const on = !V('bkOn'); V('bkSet', on); bot({ h: on ? '「부캉아」 부르기를 켰어요' : '「부캉아」 부르기를 껐어요', l: on ? ['처음 한 번은 약 14MB를 받아요 (와이파이 추천)', '화면이 켜져 있을 때 어느 탭에서든 들어요'] : [] }); setSt(''); }
        else if (a === 'say') { opt.say = !opt.say; saveOpt(); bot({ h: opt.say ? '말로 물으면 대답을 소리로 읽어 드려요' : '대답을 소리로 읽지 않아요' }); }
        else if (a === 'me') enroll();
        else if (a === 'me-x') { V('bkClearMine'); bot({ h: '내 목소리 등록을 지웠어요' }); }
    }
    function settings() {
        const n = V('bkMeN') || 0, on = !!V('bkOn');
        const w = { h: '⚙ 부캉이 설정', l: [] };
        w.raw = 1;
        setTimeout(() => {
            const last = bodyEl.lastElementChild && bodyEl.lastElementChild.querySelector('.bka-card');
            if (!last) return;
            last.insertAdjacentHTML('beforeend', `<div class="bka-set">
                ${V('hasMic') ? `<div class="r"><span>🦉 「부캉아」로 부르기<small>${on ? '켜짐 · 어느 탭에서든 기다려요' : '꺼짐 · 켜면 휴대폰이 「부캉아」를 기다려요'}</small></span><button type="button" class="sw${on ? ' on' : ''}" data-a="bk" role="switch" aria-checked="${on}">${on ? '켜짐' : '꺼짐'}</button></div>` : '<div class="r"><span>이 기기에서는 「부캉아」 부르기를 쓸 수 없어요<small>글자로 물어볼 수 있어요</small></span></div>'}
                ${on ? `<div class="r"><span>🎤 내 목소리 등록<small>${n ? n + '개 등록됨' : '「부캉아」 3번 녹음 · 더 잘 알아들어요'}</small></span><button type="button" class="sw" data-a="me">${n ? '다시 하기' : '등록'}</button>${n ? '<button type="button" class="sw" data-a="me-x">지우기</button>' : ''}</div>` : ''}
                <div class="r"><span>🔊 대답 읽어 주기<small>말로 물었을 때만 읽어요</small></span><button type="button" class="sw${opt.say ? ' on' : ''}" data-a="say" role="switch" aria-checked="${opt.say}">${opt.say ? '켜짐' : '꺼짐'}</button></div></div>`);
            scrollEnd();
        }, 0);
        return w;
    }
    function enroll() {
        if (enrolling) return;
        if (!V('hasMic')) { bot({ h: '이 기기에서는 쓸 수 없어요' }); return; }
        enrolling = true; stopListen();
        const w = document.createElement('div'); w.className = 'bka-bot';
        w.innerHTML = '<i class="bka-bk" aria-hidden="true"></i><div class="bka-card bka-enr"><div class="h">🎤 내 목소리 등록</div><div class="l">준비 중…</div></div>';
        bodyEl.appendChild(w); scrollEnd();
        const card = w.querySelector('.bka-card');
        V('enroll', (state, heard, said, o) => {
            if (state === 'end') { enrolling = false; setSt(''); return; }
            if (!state || !o) return;
            card.className = 'bka-card bka-enr ' + state;
            card.innerHTML = `<div class="h">${esc(o.title || '')}</div><div class="l">${esc(o.sub || '')}</div>`;
            setSt(state === 'listen' ? 'listen' : '');
            scrollEnd();
        });
    }
    function listen() {
        build(); if (!isOpenNow) open();
        if (listening) { stopListen(); return; }
        if (enrolling) return;
        if (!SR) { bot({ h: '이 기기에서는 말로 물을 수 없어요', l: ['아래 칸에 글자로 적어 주세요'] }); inp.focus(); return; }
        try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
        listening = true; V('bkStop'); V('duck', true);
        let r; try { r = new SR(); } catch (e) { listening = false; V('duck', false); V('bkKick', 800); bot({ h: '음성 인식을 시작하지 못했어요' }); return; }
        rec = r;
        r.lang = 'ko-KR'; r.interimResults = true; r.maxAlternatives = 4; r.continuous = false;
        let heard = '', done = false;
        r.onresult = ev => {
            const res = ev.results[ev.results.length - 1];
            heard = fixBk((res[0] && res[0].transcript || '').trim());
            inp.value = heard;
            if (!res.isFinal || done) return;
            done = true;
            const alts = []; for (let i = 0; i < res.length; i++) { const x = (res[i].transcript || '').trim(); if (x && alts.indexOf(x) < 0) alts.push(x); }
            stopListen(); inp.value = '';
            askAlts(alts.length ? alts : [heard]);
        };
        r.onerror = ev => {
            const c = ev && ev.error; stopListen();
            if (c === 'aborted') return;
            bot({ h: c === 'not-allowed' || c === 'service-not-allowed' ? '마이크 사용을 허락해 주세요' : c === 'no-speech' ? '말소리가 안 들렸어요' : c === 'network' ? '인터넷 연결을 확인해 주세요' : '잘 못 들었어요',
                l: [c === 'not-allowed' || c === 'service-not-allowed' ? '주소창 왼쪽 자물쇠 → 마이크 허용' : '🎙을 누르고 바로 말해 주세요'] });
        };
        r.onend = () => { if (listening) { const h = heard; stopListen(); inp.value = ''; if (h && !done) { done = true; ask(h, true); } } };
        setSt('listen');
        try { r.start(); } catch (e) { stopListen(); bot({ h: '음성 인식을 시작하지 못했어요' }); }
    }
    function stopListen() {
        const was = listening;
        listening = false;
        if (rec) { try { rec.onresult = rec.onerror = rec.onend = null; rec.abort(); } catch (e) {} rec = null; }
        if (was) { V('duck', false); V('bkKick', 800); }
        setSt('');
    }
    function open() {
        build();
        if (isOpenNow) return;
        isOpenNow = true;
        const side = innerWidth >= 760;
        pan.classList.toggle('side', side); pan.classList.toggle('ph', !side);
        ov.hidden = false; pan.hidden = false;
        document.documentElement.classList.add('bka-open');
        setSt(''); scrollEnd();
    }
    function close() {
        if (!isOpenNow) return;
        isOpenNow = false;
        stopListen();
        try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
        V('duck', false);
        if (pan) pan.hidden = true; if (ov) ov.hidden = true;
        document.documentElement.classList.remove('bka-open');
    }
    // 뒤로가기: index.html 의 뒤로가기 지킴이(plLayers · plBack)에 끼워 넣기 — 비서 창이 열려 있으면 먼저 닫힘
    (function () {
        const L = window.plLayers, B = window.plBack;
        window.plLayers = function () { return (isOpenNow ? 1 : 0) + (typeof L === 'function' ? L() : 0); };
        window.plBack = function () { if (isOpenNow) { close(); return true; } return typeof B === 'function' ? B() : false; };
    })();
    window.addEventListener('resize', () => { if (isOpenNow && pan) { const side = innerWidth >= 760; pan.classList.toggle('side', side); pan.classList.toggle('ph', !side); } });

    // 각 탭 맨 위 「부캉이에게 물어보세요」 줄
    function bars() {
        ['rosterSection', 'scheduleSection', 'noticeSection', 'venueSection'].forEach(id => {
            const sec = $(id); if (!sec || sec.querySelector(':scope > .bka-bar')) return;
            const b = document.createElement('div'); b.className = 'bka-bar';
            b.innerHTML = `<button type="button" class="bka-bar-q"><i class="bka-bk" aria-hidden="true"></i><span>부캉이에게 물어보세요</span></button>${SR ? '<button type="button" class="bka-bar-mic" aria-label="말로 묻기">🎙</button>' : ''}`;
            b.querySelector('.bka-bar-q').addEventListener('click', () => { open(); setTimeout(() => { if (!SR && inp) inp.focus(); }, 50); });
            const mb = b.querySelector('.bka-bar-mic'); if (mb) mb.addEventListener('click', () => { open(); listen(); });
            sec.insertBefore(b, sec.firstChild);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bars); else bars();
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopListen(); });

    window.BKA = {
        open, close, ask: t => ask(t, false), think,
        isOpen: () => isOpenNow,
        busy: () => listening || enrolling,
        wake: () => { if (!D.authed()) return; open(); if (!listening) listen(); }
    };
})();
