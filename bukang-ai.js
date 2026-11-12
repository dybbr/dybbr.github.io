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

    // ---------- 비슷한 발음 (v2.122.0) — 글자를 자모로 쪼개 몇 개만 다르면 같은 말로 봄 ----------
    const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
    const SIM = { 'ㅐ': 'ㅔ', 'ㅒ': 'ㅖ', 'ㅙ': 'ㅞ', 'ㅚ': 'ㅞ', 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
    function jamo(str) {
        let o = '';
        for (const ch of String(str)) {
            const c = ch.charCodeAt(0) - 0xAC00;
            if (c < 0 || c > 11171) { o += ch; continue; }
            const a = CHO[Math.floor(c / 588)], b = JUNG[Math.floor((c % 588) / 28)], d = JONG[c % 28];
            o += (SIM[a] || a) + (SIM[b] || b) + (d === ' ' ? '' : (SIM[d] || d));
        }
        return o;
    }
    function lev(a, b) {
        if (a === b) return 0;
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[b.length];
    }
    function fuzzyDist(t, key) {   // t 안에서 key와 가장 닮은 곳의 거리 (자모 기준)
        const kl = key.length, kj = jamo(key);
        if (kl < 2) return 99;
        let best = 99;
        for (let L = Math.max(2, kl - 1); L <= kl + 1; L++)
            for (let i = 0; i + L <= t.length; i++) {
                const w = t.slice(i, i + L);
                if (/[0-9a-z]/i.test(w)) continue;
                const d = lev(jamo(w), kj);
                if (d < best) best = d;
            }
        return best;
    }
    const fuzzyOk = (d, key) => d <= (jamo(key).length >= 8 ? 2 : 1);
    function fuzzyBest(t, list, keysOf) {   // [{x, key, d}] 가장 가까운 것들 (하나면 그걸로)
        let best = [], bd = 99;
        list.forEach(x => keysOf(x).forEach(k => {
            if (!k || k.length < 2) return;
            const d = fuzzyDist(t, k);
            if (!fuzzyOk(d, k)) return;
            if (d < bd) { bd = d; best = [{ x, key: k, d }]; } else if (d === bd && !best.some(b => b.x === x)) best.push({ x, key: k, d });
        }));
        return best;
    }
    // 배운 말: 못 알아들은 말에 「이런 뜻」을 고르면 이 기기에 기억 (localStorage daeyeon_bka_learn)
    const LEARN = 'daeyeon_bka_learn';
    const learned = () => { try { return JSON.parse(localStorage.getItem(LEARN) || '{}') || {}; } catch (e) { return {}; } };
    function learn(k, q) { try { const m = learned(); m[k] = q; const ks = Object.keys(m); if (ks.length > 80) delete m[ks[0]]; localStorage.setItem(LEARN, JSON.stringify(m)); } catch (e) {} }

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
        if (!best.length && /찾|선수|누구|어디|노래|주제곡|등장곡|틀어|들려|번|이야|야$|이$|친구/.test(t)) {   // 비슷한 발음 (「도윤」 ↔ 「도윤이」 「도연」)
            const fz = fuzzyBest(t, D.players(), p => { const nm = C(p.name); return nm.length >= 3 ? [nm, nm.slice(1)] : [nm]; });
            if (fz.length) { best = fz.map(f => f.x).filter((x, i, a) => a.indexOf(x) === i); best.fuzzy = 1; }
        }
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
        if (!best && /어디|길|주소|지도|위치|구장|야구장|운동장|네비|내비/.test(t)) { const fz = fuzzyBest(t, D.venues(), venueKeys); if (fz.length === 1) best = fz[0].x; }
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
        if (!hit.length && /랑|하고|와|과|상대|vs|대회|경기|시합/i.test(t)) {
            const ops = list.filter(ev => ev.opponent);
            const fz = fuzzyBest(t, ops, ev => { const o = C(ev.opponent), b = o.replace(/(초등학교|초교|초|리틀|야구단|야구부)$/, ''); return b.length >= 2 && b !== o ? [o, b] : [o]; });
            fz.forEach(f => { if (hit.indexOf(f.x) < 0) hit.push(f.x); });
        }
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
    const ctx = { ev: null, venue: null, player: null, notice: null, turn: 0, evTurn: -1, list: null };

    // ---------- 답 만들기 ----------
    //  답 = { h, dd, l:[줄], no, items:[{h, s, fn}], btns:[{t, fn, pri, close}], say, quiet }
    function evCard(ev, q) {
        ctx.ev = ev; ctx.evTurn = ctx.turn;
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
    function evList(evs, title, sayHead, off) {
        off = off || 0;
        ctx.ev = evs[off] || null; ctx.evTurn = ctx.turn;
        ctx.list = { kind: 'ev', all: evs, off: off + 8, title, sayHead };
        const shown = evs.slice(off, off + 8);
        const items = shown.map(ev => {
            const h = (function () { try { return eventHeadline(ev); } catch (e) { return { title: ev.title || '', vs: '' }; } })();
            return { h: `${mdShort(ev.date)} ${ev.start || ''} ${typeIcon(ev.type)} ${h.title || ev.type}${h.vs ? ' ' + h.vs : ''}`, s: ev.place ? '📍 ' + vLabel(ev.place) : '', fn: () => evCard(ev) };
        });
        const first = evs.slice(0, 3).map(ev => `${mdKo(ev.date)} ${(ev.title && ev.title !== ev.type) ? ev.title : ev.type}`).join(', ');
        return { h: title, l: evs.length > 8 ? [`${evs.length}개 중 ${off + 1}~${off + shown.length}번째예요${off + 8 < evs.length ? ' · 「더 보여 줘」라고 하면 이어서 보여 드려요' : ''}`] : [], items, btns: [{ t: '📅 일정 탭 열기', close: 1, fn: () => { showMainTab('schedule'); try { setCalView('list'); } catch (e) {} } }], say: `${sayHead} ${evs.length}개예요. ${first}${evs.length > 3 ? ' 등이에요.' : '.'}` };
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
        const fz = ctx.fz; ctx.fz = false;
        return { no: p.no || (staff ? '★' : '·'), h: p.name, l: fz ? [desc, '🤔 비슷한 이름으로 찾았어요. 아니면 다시 말해 주세요'] : [desc], btns, say: `${fz ? '혹시 ' : ''}${p.no ? p.no + '번 ' : ''}${p.name}${staff ? '' : ' 선수'}${fz ? '인가요?' : '예요.'} ${desc.replace(/ · /g, ', ')}.` };
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

    // ---------- 두뇌 2세대 (v2.122.0) ----------
    //   ① 배운 말 → ② 여러 일 나누기(「캘린더에 넣고 길도 찾아 줘」) → 하나씩 think1 (앞의 답을 기억해서 다음 일에 씀)
    function splitCmd(s) {
        const parts = s.split(/\s*(?:,|그리고|그다음에|그 다음에|그러고 나서|그런 다음에?|한 다음에?|하고 나서)\s*/);
        const out = [];
        parts.forEach(p => String(p || '').replace(/(넣|찾|틀|열|켜|끄|꺼|담|주|저장하|추가하|등록하|보여 ?주|알려 ?주|읽어 ?주)고\s+/g, '$1\u0001').split('\u0001').forEach(x => { if (C(x).length >= 2) out.push(x.trim()); }));
        return out;
    }
    function think(raw) {
        const s = String(raw || '').replace(BK, ' ').replace(/\s+/g, ' ').trim();
        ctx.turn++;
        const k = C(s), lm = learned();
        if (k && lm[k]) { const a = think1(lm[k]); if (a && !a.miss) { a.l = ['「' + s + '」 → 배운 대로 「' + lm[k] + '」'].concat(a.l || []); } return a; }
        const parts = splitCmd(s);
        if (parts.length <= 1) return think1(s);
        const res = parts.map(p => { const a = think1(p); return Object.assign({ q: p }, a || { h: '「' + p + '」는 잘 못 알아들었어요', miss: 1 }); });
        return { multi: res, say: res.map(a => a.say).filter(Boolean).join(' '), miss: res.every(a => a.miss) ? 1 : 0 };
    }
    function think1(raw) {
        const s = String(raw || '').replace(BK, ' ').replace(/\s+/g, ' ').trim();
        const t = C(s);
        if (!t) return { h: '네, 말씀하세요!', l: ['🎙을 누르고 물어보세요'], say: '네, 말씀하세요.' };
        const fresh = ctx.ev && ctx.evTurn === ctx.turn;   // 같은 말 안에서 앞서 찾은 일정 (「…넣고 길도 찾아 줘」)

        // 0) 이어 묻기: 그다음 · 그 전 · 더 보여 줘
        if (ctx.list && /더보여|더알려|나머지|계속보여|다음페이지|더있어/.test(t)) {
            const L = ctx.list;
            if (L.kind === 'ev' && L.off < L.all.length) return evList(L.all, L.title, L.sayHead, L.off);
            return { h: '더 보여 드릴 게 없어요', say: '이게 전부예요.' };
        }
        if (!ctx.list && /^(더보여|더알려|나머지|계속보여|다음페이지|더있어)/.test(t)) return { h: '더 보여 드릴 게 없어요', l: ['「이번 달 일정」처럼 물어보면 여러 개를 보여 드려요'], say: '더 보여 드릴 게 없어요.' };
        if (ctx.ev && /^(그다음|다음거|다음건|그다음은|그뒤|그뒤에|그다음꺼|그담|담에는|그다음일정|그다음경기|그다음엔|다음은)/.test(t)) {
            const game = /경기|시합/.test(t) || isGame(ctx.ev);
            const list = D.events().filter(ev => (ev.date > ctx.ev.date || (ev.date === ctx.ev.date && String(ev.start || '') > String(ctx.ev.start || ''))) && (!game || isGame(ev) || /일정/.test(t)));
            return list.length ? evCard(list[0]) : { h: '그다음 일정은 아직 없어요', say: '그다음 일정은 아직 없어요.' };
        }
        if (ctx.ev && /^(그전|그전에|이전거|그앞|그앞에|전에는|그전은|그전꺼)/.test(t)) {
            const list = D.events().filter(ev => ev.date < ctx.ev.date || (ev.date === ctx.ev.date && String(ev.start || '') < String(ctx.ev.start || ''))).reverse();
            return list.length ? evCard(list[0]) : { h: '그전 일정은 없어요', say: '그전 일정은 없어요.' };
        }

        // 1) 인사 · 도움말 · 닫기
        if (/^(안녕|하이|헬로|반가워|좋은아침|굿모닝|여보세요)/.test(t)) return { h: '안녕하세요! 🦉', l: ['「오늘 브리핑」 「다음 경기 언제야」처럼 물어보세요'], say: '안녕하세요! 무엇을 도와 드릴까요?' };
        if (/뭐할수|뭘할수|뭐해줄수|뭘해줄|도움말|사용법|할수있는|할줄|명령어|기능알려/.test(t)) return help();
        if (/^(고마워|고맙|땡큐|됐어|닫아|닫기|창닫|그만해|끝|잘했어)/.test(t)) return { h: '언제든 「부캉아」 불러 주세요!', say: '언제든 불러 주세요.', run: () => setTimeout(close, 900) };

        // 2) 타석 모드에 있으면 그 명령 먼저 (다음 타자 · 홈런 …)
        if (V('inBat')) { const hit = V('parse', s); if (hit && hit.run) return { h: '⚾ ' + hit.say, say: '', quiet: 1, run: () => { close(); hit.run(); } }; }

        // 2-1) 운영진: 말로 초안 채우기 (저장 버튼은 사람이 직접)
        const draft = staffDraft(s, t, fresh);
        if (draft) return draft;
        // 2-2) 오늘 브리핑
        if (/브리핑|요약해|오늘소식|오늘뭐있|오늘무슨일|새소식|오늘어때|오늘알려|하루정리|아침소식|요즘어때/.test(t)) return briefing();
        // 2-3) 세기 · 며칠 남았는지 · 생일
        const cnt = counting(s, t);
        if (cnt) return cnt;
        // 2-4) 화면 조작
        const scr = screenCtl(t);
        if (scr) return scr;
        // 2-5) 사용법
        const how = howTo(t);
        if (how) return how;

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
        const ps = findPlayers(t); ctx.fz = !!ps.fuzzy;
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
        if (songW && /틀|들려|재생|플레이/.test(t) && !/새(노래|곡)/.test(t)) {   // 누구 노래인지 말 안 하면: 우리 아이 한 명 → 그 곡, 아니면 전체
            let u = null; try { u = getActiveUser(); } catch (e) {}
            const cs = (u && u.children) || [];
            const my = D.players().filter(p => cs.some(c => (c.no && p.no) ? Number(c.no) === Number(p.no) : C(c.name) === C(p.name)));
            if (my.length === 1 && pidOf(my[0])) return Object.assign(playP(my[0]), { run: null });
            return V('playAllSongs', true) ? { h: '🎵 전체 주제곡을 섞어서 틀었어요', l: ['「도윤이 노래 틀어 줘」처럼 이름을 말하면 그 선수 곡을 틀어요'], say: '전체 주제곡을 섞어서 틀게요.', quiet: 1 } : { h: '들을 수 있는 곡이 아직 없어요' };
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
        const routeW = /어디|길찾기|길안내|가는길|가는법|주소|네비|내비|지도|위치|구장|야구장|길(도|을|좀)?(찾|알려|안내)/.test(t);
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
            const plain = !when(t) && !typeFilter(t) && !evMatches(t, D.events()).length;
            const q = schedQuery(t), ev = ((/거기|그경기|그날|그일정/.test(t) || (fresh && plain)) && ctx.ev) ? ctx.ev : (q.evs[0] || null);
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
            if (!/다가오는|전부|모두|한꺼번|몽땅|싹다|전체/.test(t) && /다음|이번|첫/.test(t) && /경기|시합|대회|훈련|일정|연습/.test(t) && !/그거|그일정|그경기|이거|거기/.test(t)) {
                const one = schedQuery(t).evs[0];
                if (one) { ctx.ev = one; ctx.evTurn = ctx.turn; const vo = venueOfEvent(one); if (vo) ctx.venue = vo; return { h: '📆 ' + mdShort(one.date) + ' ' + ((one.title && one.title !== one.type) ? one.title : one.type) + ' 캘린더 파일을 만들었어요', l: ['열면 휴대폰 캘린더에 들어가요'], say: `${mdKo(one.date)} 일정을 캘린더 파일로 만들었어요.`, run: () => icsSaveEvent(one.id) }; }
            }
            if ((/그거|그일정|그경기|이거|거기/.test(t) || (fresh && !when(t))) && ctx.ev) return { h: '📆 캘린더 파일을 만들었어요', l: ['열면 휴대폰 캘린더에 들어가요'], say: '캘린더 파일을 만들었어요.', run: () => icsSaveEvent(ctx.ev.id) };
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
                const lb = q.range ? ({ '오늘': '오늘은', '내일': '내일은', '어제': '어제는', '모레': '모레는', '글피': '글피는' }[q.label] || q.label + '에는') : q.past ? '지난' : '다가오는';
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
        if (ps.length === 1) return playerCard(ps[0]);
        const k = C(s);
        return { h: '잘 못 알아들었어요', l: ['「' + s + '」', '혹시 아래 뜻이었나요? 고르면 다음부터 이 말을 알아들어요'],
            items: LEARN_OPTS.map(q => ({ h: '「' + q + '」', s: '', fn: () => { learn(k, q); const a = think(q); a.l = ['배웠어요! 다음부터 「' + s + '」는 「' + q + '」로 알아들을게요'].concat(a.l || []); return a; } })),
            say: '잘 못 알아들었어요. 다시 말해 주세요.', miss: 1 };
    }

    const LEARN_OPTS = ['오늘 브리핑', '다음 경기 언제야', '이번 주 일정', '지난 경기 결과', '다음 경기 어디야', '새 공지 있어', '내 당번 언제야', '전체 주제곡 틀어'];
    const canEdit = () => { try { return canEditSchedule(); } catch (e) { return false; } };
    function timeOf(s) {   // 「오후 2시 반」 「10시」 「14:30」 → "14:30"
        let m = /(\d{1,2}):(\d{2})/.exec(s);
        if (m) return String(+m[1]).padStart(2, '0') + ':' + m[2];
        m = /(오전|오후|아침|저녁|낮|밤)?\s*(\d{1,2}|[한두세네다섯여섯일곱여덟아홉열]+)\s*시\s*(반|(\d{1,2})\s*분)?/.exec(s);
        if (!m) return '';
        const KN = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12 };
        let h = /^\d+$/.test(m[2]) ? +m[2] : (KN[m[2]] || 0);
        if (!h || h > 24) return '';
        const pm = m[1] === '오후' || m[1] === '저녁' || m[1] === '밤' || (m[1] === '낮' && h < 12);
        if (pm && h < 12) h += 12;
        if (!m[1] && h >= 1 && h <= 6) h += 12;   // 「3시」 → 오후 3시 (야구부 일정은 대부분 낮)
        const mi = m[3] === '반' ? 30 : (m[4] ? +m[4] : 0);
        return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
    }
    function staffDraft(s, t, fresh) {
        const evAdd = /(일정|경기|시합|훈련|대회|행사|연습)/.test(t) && /(추가|등록|만들어|잡아|넣어줘|새로)/.test(t) && !/캘린더|달력|휴대폰에/.test(t);
        const ntAdd = /공지/.test(t) && /(써|쓰|작성|올려|등록|만들)/.test(t);
        const resAdd = /(결과|점수|스코어)/.test(t) && /(입력|기록|적어|넣어|저장|올려)/.test(t);
        if (!evAdd && !ntAdd && !resAdd) return null;
        if (!canEdit()) return { h: '대표님 · 총무님만 할 수 있어요', l: ['일정 · 공지 · 결과 바꾸기는 운영진 로그인에서만 돼요'], say: '운영진만 할 수 있어요.' };
        if (resAdd) {
            let ev = fresh ? ctx.ev : null;
            if (!ev) { const games = D.allEvents().filter(e => isGame(e) && evEnded(e)).sort((a, b) => a.date < b.date ? 1 : -1); const mt = evMatches(t, games); const w = when(t); ev = (mt.length ? mt : w ? games.filter(e => e.date >= w.from && e.date <= w.to) : games.filter(e => !resOf(e)).concat(games))[0] || null; }
            if (!ev) return { h: '결과를 넣을 경기를 못 찾았어요', l: ['「모의초 경기 결과 7대 3 승리 입력」처럼 말해 주세요'] };
            const sc = /(\d{1,2})\s*(?:대|:|-|对)\s*(\d{1,2})/.exec(s);
            let lab = /이겼|승리|승\b|이김/.test(s) ? '승' : /졌|패배|패\b|짐/.test(s) ? '패' : /비겼|무승부|무\b/.test(s) ? '무' : '';
            if (!lab && sc) lab = +sc[1] > +sc[2] ? '승' : +sc[1] < +sc[2] ? '패' : '무';
            const l = [`${mdShort(ev.date)} ${ev.opponent ? 'VS ' + ev.opponent : ev.title || ev.type}`, `결과: ${lab || '(승패 없음)'}${sc ? ' ' + sc[1] + ':' + sc[2] : ''}`, '수정 창이 열려요 · 확인하고 「저장」을 눌러 주세요'];
            return { h: '🏁 경기 결과 초안', l, say: '결과를 채웠어요. 확인하고 저장을 눌러 주세요.', run: () => { close(); openEventEditor(ev.id); setTimeout(() => { try { if (lab) setEvResult(lab); if (sc) { $('evScoreUs').value = sc[1]; $('evScoreThem').value = sc[2]; } syncEvScoreLabel(); syncEvResultRow(); } catch (e) {} }, 60); } };
        }
        if (ntAdd) {
            let body = s.replace(/^.*?공지\s*(사항)?\s*(좀|하나)?\s*(써|쓰|작성|올려|등록|만들)[가-힣]*\s*/, '');
            let title = '', cat = '';
            const cm = /(긴급|필독|에티켓|안내|일반)\s*(공지)?/.exec(body); if (cm) { cat = cm[1]; }
            const tm = /제목(?:은|:)?\s*(.+?)\s*(?:내용(?:은|:)?\s*(.+))?$/.exec(body);
            if (tm) { title = tm[1]; body = tm[2] || ''; } else { title = body.split(/[.!?。]\s*/)[0].slice(0, 40); body = body.length > title.length ? body : ''; }
            return { h: '📢 공지 초안', l: ['제목: ' + (title || '(비어 있음)'), body ? '내용: ' + body.slice(0, 80) : '내용은 창에서 적어 주세요', '확인하고 「저장」을 눌러 주세요'], say: '공지 초안을 채웠어요. 확인하고 저장을 눌러 주세요.',
                run: () => { close(); openNoticeEditor(); setTimeout(() => { try { if (title) $('ntTitle').value = title; if (body) $('ntBody').value = body; if (cat) $('ntCategory').value = cat; } catch (e) {} }, 60); } };
        }
        // 일정 추가
        const w = when(t), date = w ? w.from : '';
        const tf = /연습시합|연습경기|친선/.test(t) ? '연습시합' : /대회|리그/.test(t) ? '대회' : /훈련|연습/.test(t) ? '훈련' : /행사/.test(t) ? '행사' : /휴식/.test(t) ? '휴식' : /경기|시합/.test(t) ? '연습시합' : '기타';
        const start = timeOf(s);
        const om = /([가-힣A-Za-z]{1,12}?(?:초등학교|초교|초|리틀|중|야구단))\s*(?:랑|하고|와|과|이랑|vs|VS|상대)/.exec(s) || /(?:vs|VS|상대(?:는|팀)?)\s*([가-힣A-Za-z]{2,12})/.exec(s);
        const v = findVenueIn(t);
        const pm = !v && /([가-힣A-Za-z0-9]{2,15}(?:구장|야구장|운동장|공원))(?:에서)?/.exec(s);
        const draft = { date: date || ymd(today0()), start, type: tf, grades: '전체', opponent: om ? om[1] : '', place: v ? v.name : pm ? pm[1] : '' };
        const l = [`날짜: ${date ? mdShort(date) : '(오늘로 넣었어요 · 바꿔 주세요)'}${start ? ' ' + start : ''}`, `종류: ${tf}${draft.opponent ? ' · VS ' + draft.opponent : ''}`, draft.place ? '장소: ' + draft.place : '장소는 창에서 골라 주세요', '확인하고 「저장」을 눌러 주세요'];
        return { h: '📅 일정 추가 초안', l, say: '일정 초안을 채웠어요. 확인하고 저장을 눌러 주세요.', run: () => { close(); openEventEditor(null, draft.date, draft); } };
    }
    function briefing() {
        const T = ymd(today0()), T1 = ymd(addD(today0(), 1));
        const items = [], says = [];
        if (D.canSched()) {
            const ev = D.events();
            const td = ev.filter(e => e.date === T), tm = ev.filter(e => e.date === T1);
            const nm = e => (e.title && e.title !== e.type) ? e.title : e.type;
            td.forEach(e => items.push({ h: `오늘 ${e.start || ''} ${typeIcon(e.type)} ${nm(e)}${e.opponent ? ' VS ' + e.opponent : ''}`, s: e.place ? '📍 ' + vLabel(e.place) : '', fn: () => evCard(e) }));
            tm.forEach(e => items.push({ h: `내일 ${e.start || ''} ${typeIcon(e.type)} ${nm(e)}${e.opponent ? ' VS ' + e.opponent : ''}`, s: e.place ? '📍 ' + vLabel(e.place) : '', fn: () => evCard(e) }));
            says.push(td.length ? `오늘은 ${td.map(e => (e.start ? hmKo(e.start) + ' ' : '') + nm(e)).join(', ')}이 있어요.` : '오늘은 일정이 없어요.');
            if (tm.length) says.push(`내일은 ${tm.map(e => (e.start ? hmKo(e.start) + ' ' : '') + nm(e)).join(', ')}이에요.`);
            const ng = ev.find(e => isGame(e) && !evEnded(e) && e.date > T1);
            if (ng) { items.push({ h: `다음 경기 ${mdShort(ng.date)} ${ddOf(ng.date)} ${ng.opponent ? 'VS ' + ng.opponent : nm(ng)}`, s: ng.place ? '📍 ' + vLabel(ng.place) : '', fn: () => evCard(ng) }); says.push(`다음 경기는 ${ddOf(ng.date)}, ${mdKo(ng.date)}이에요.`); }
            try { const m = dutyMineNext(); if (m && Math.round((dOf(m.d) - today0()) / 864e5) <= 10) { items.push({ h: `🧹 우리 집 청소 ${dutyWhen(m)} ${dutyDdU(m)}`, s: '', fn: () => { close(); openDutyModal(); } }); says.push('우리 집 청소 당번이 곧 있어요.'); } } catch (e) {}
        }
        if (D.canNotice()) {
            const nn = D.notices().filter(n => { try { return isNewNotice(n) && String(n.created || '').slice(0, 10) >= ymd(addD(today0(), -3)); } catch (e) { return false; } });
            nn.slice(0, 2).forEach(n => items.push({ h: '🆕 ' + n.title, s: '새 공지', fn: () => noticeCard(n) }));
            if (nn.length) says.push(`새 공지가 ${nn.length}개 있어요.`);
        }
        try { const bd = birthdayPlayersToday(); if (bd.length) { items.push({ h: '🎂 오늘 생일: ' + bd.map(p => p.name).join(', '), s: '축하해 주세요', fn: () => playerCard(bd[0]) }); says.push(`오늘은 ${bd.map(p => p.name).join(', ')} 선수 생일이에요.`); } } catch (e) {}
        const d = today0();
        return { h: `☀️ ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일 브리핑`, l: items.length ? [] : ['오늘 · 내일은 조용해요'], items, say: says.join(' ') || '오늘은 특별한 소식이 없어요.' };
    }
    function counting(s, t) {
        if (/몇명|인원|몇분/.test(t)) {
            const all = D.players(), st = p => { try { return isStaff(p.grade); } catch (e) { return false; } };
            if (/코치|감독|스태프/.test(t)) { const n = all.filter(st).length; return { h: `👔 코칭스태프 ${n}명`, say: `코칭스태프는 ${n}명이에요.` }; }
            const gr = numOf(t, new RegExp('([1-6]|[일이삼사오육])학년'));
            const pl = all.filter(p => !st(p)), byG = {};
            pl.forEach(p => { const g = parseInt(String(p.grade).replace(/[^0-9]/g, ''), 10) || 0; byG[g] = (byG[g] || 0) + 1; });
            if (gr) return { h: `👥 ${gr}학년 ${byG[gr] || 0}명`, say: `${gr}학년은 ${byG[gr] || 0}명이에요.` };
            return { h: `👥 선수 ${pl.length}명`, l: [Object.keys(byG).filter(g => +g).sort((a, b) => b - a).map(g => `${g}학년 ${byG[g]}명`).join(' · ')], say: `선수는 모두 ${pl.length}명이에요.` };
        }
        if (/며칠|몇일|디데이|dday|얼마나남|몇밤/i.test(t)) {
            if (!D.canSched()) return deny();
            const q = schedQuery(/경기|대회|훈련|시합|행사/.test(t) ? t : t + '경기');
            const ev = q.evs[0];
            if (!ev) return { h: '다가오는 일정이 없어요' };
            const n = Math.round((dOf(ev.date) - today0()) / 864e5);
            const c = evCard(ev); c.h = n === 0 ? '오늘이에요!' : `${n}일 남았어요 (D-${n})`; c.l.unshift(`${mdShort(ev.date)} ${ev.start || ''}`); c.say = n === 0 ? '오늘이에요!' : `${n}일 남았어요. ${mdKo(ev.date)}이에요.`; return c;
        }
        if (/몇경기|경기몇개|경기몇번|몇번남|몇개남|일정몇개/.test(t)) {
            if (!D.canSched()) return deny();
            const q = schedQuery(t.replace(/몇경기|경기몇개|경기몇번/, '경기'));
            const evs = /경기|시합|대회/.test(t) ? q.evs.filter(isGame) : q.evs;
            return evList(evs.length ? evs : [], `${q.range ? q.label : q.past ? '지난' : '남은'} ${/경기|시합|대회/.test(t) ? '경기' : '일정'} ${evs.length}개`, `${q.range ? q.label : q.past ? '지난' : '남은'} ${/경기|시합|대회/.test(t) ? '경기' : '일정'}는`);
        }
        if (/생일/.test(t)) {
            let today = [], soon = [];
            try { today = birthdayPlayersToday(); soon = D.players().filter(p => !isStaff(p.grade) && isBirthdaySoon(p)).sort((a, b) => daysToBirthday(a) - daysToBirthday(b)); } catch (e) {}
            if (!today.length && !soon.length) return { h: '일주일 안에 생일인 선수가 없어요', say: '일주일 안에 생일인 선수가 없어요.' };
            const items = today.map(p => ({ h: '🎂 오늘 ' + p.name, s: '', fn: () => playerCard(p) })).concat(soon.map(p => ({ h: `🎁 ${daysToBirthday(p)}일 뒤 ${p.name}`, s: '', fn: () => playerCard(p) })));
            return { h: '🎂 다가오는 생일', items, say: today.length ? `오늘은 ${today.map(p => p.name).join(', ')} 선수 생일이에요.` : `${soon[0].name} 선수 생일이 ${daysToBirthday(soon[0])}일 남았어요.` };
        }
        return null;
    }
    function screenCtl(t) {
        const done = (h, fn) => ({ h, say: h + '.', run: () => { close(); call(fn); } });
        if (/카드(로|형|모양)?(보|바꿔|변경)|사진(으로|크게)보/.test(t)) return done('명단을 카드로 바꿨어요', () => { showMainTab('roster'); switchView('card'); });
        if (/(목록|리스트|줄)(으로|로|형)(보|바꿔|변경)/.test(t) && !/일정|달력/.test(t)) return done('명단을 목록으로 바꿨어요', () => { showMainTab('roster'); switchView('list'); });
        const gm = /([1-6]|[일이삼사오육])학년(만|들만)/.exec(t);
        if (gm && !/일정|달력/.test(t)) { const g = /\d/.test(gm[1]) ? gm[1] : String('일이삼사오육'.indexOf(gm[1]) + 1); return done(`명단에 ${g}학년만 보여 드려요`, () => { showMainTab('roster'); pickGrade(g); }); }
        if (/(코치|감독|스태프)(진|님들|님)?만/.test(t)) return done('명단에 코칭스태프만 보여 드려요', () => { showMainTab('roster'); pickGrade('staff'); });
        if (/(명단|선수).*(전체|다)(보여|로)|전체학년(보여|으로)/.test(t) && !/일정/.test(t)) return done('명단을 전체로 보여 드려요', () => { showMainTab('roster'); pickGrade('all'); });
        if (/(주간|한주씩|주별|일주일씩)(으로|로|보기|달력)?/.test(t) && /보여|바꿔|달력|일정|으로|로/.test(t)) return done('일정을 한 주씩 보여 드려요', () => { showMainTab('schedule'); setCalView('week'); });
        if (/일정|달력/.test(t) && /(목록|리스트|줄)(으로|로)/.test(t)) return done('일정을 목록으로 보여 드려요', () => { showMainTab('schedule'); setCalView('list'); });
        if (/(다음달|담달)(달력|일정보여|보여)/.test(t)) return done('다음 달 달력을 열었어요', () => { showMainTab('schedule'); setCalView('month'); calGoToday(); calMove(1); });
        if (/(지난달|저번달)(달력|일정보여|보여)/.test(t)) return done('지난달 달력을 열었어요', () => { showMainTab('schedule'); setCalView('month'); calGoToday(); calMove(-1); });
        if (/달력.*오늘로|오늘날짜로/.test(t)) return done('달력을 오늘로 옮겼어요', () => { showMainTab('schedule'); calGoToday(); });
        if (/(우리|내)(아이|애)?학년(일정)?만/.test(t)) return done('우리 아이 학년 일정만 보여 드려요', () => { showMainTab('schedule'); setCalFilter('mine'); });
        if (/(일정|달력).*(전체학년|모든학년)|전체학년일정/.test(t)) return done('모든 학년 일정을 보여 드려요', () => { showMainTab('schedule'); setCalFilter('all'); });
        if (/맨위로|위로올려|맨처음으로|꼭대기/.test(t)) return done('맨 위로 올렸어요', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        if (/맨아래|맨밑|끝까지내려/.test(t)) return done('맨 아래로 내렸어요', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
        if (/새로고침|최신으로|다시불러|업데이트해/.test(t)) return { h: '최신 일정 · 공지를 다시 받을게요', say: '최신으로 다시 받을게요.', run: () => { try { loadSchedule(true); } catch (e) {} try { loadNotices(true); } catch (e) {} } };
        return null;
    }
    const HOWTO = [
        [/설치|홈화면|바탕화면|앱으로/, '📲 앱 설치', ['로그인 화면이나 공지 탭의 「앱 설치」 안내를 따라 하면 돼요', '안드로이드는 앱(APK)도 있어요'], { t: '📲 설치 안내 열기', fn: () => { try { bkInstallNow(); } catch (e) { apkGuideOpen(); } } }],
        [/사진/, '📷 우리 아이 사진 바꾸기', ['명단에서 우리 아이 카드 → 「📷 사진」 버튼', '보호자 휴대폰 번호로 로그인해야 보여요']],
        [/정보|키|몸무게|생일|생년/, '✏️ 우리 아이 정보 고치기', ['명단에서 우리 아이 카드 → 「✏️ 정보 수정」', '키 · 몸무게 · 생일 공개 여부도 거기서 정해요']],
        [/유니폼/, '👕 유니폼 신청', ['맨 위 노란 「유니폼 주문 접수」 버튼 → 사이즈 · 이름 적고 신청', '접수 기간에만 열려요'], { t: '👕 신청 창 열기', fn: () => openUniformModal() }],
        [/타순|타석/, '⚾ 타순 정하기', ['음악 탭 → 「⚾ 타석 모드」 → 「타순 정하기」', '선수를 누른 순서대로 1번부터 들어가요'], { t: '⚾ 타석 모드 열기', fn: () => V('goBat') }],
        [/곡빼|노래빼|빼기|숨기/, '🚫 마음에 안 드는 곡 빼기', ['큰 플레이어에서 「🚫 이 곡 빼기」', '음악 탭 「빠진 곡」에서 다시 넣을 수 있어요']],
        [/저장|다운|mp3/i, '💾 주제곡 저장', ['노래를 틀고 아래 재생 띠를 눌러 큰 플레이어 → 「MP3 저장」']],
        [/캘린더|달력/, '📆 휴대폰 캘린더에 담기', ['일정을 누르면 나오는 창 → 「📅 캘린더」', '부캉이에게 「다음 경기 캘린더에 넣어 줘」라고 해도 돼요']],
        [/부캉|호출|부르/, '🦉 「부캉아」로 부르기', ['비서 창 ⚙ → 「부캉아」로 부르기 켜기', '「내 목소리 등록」을 하면 더 잘 알아들어요'], { t: '⚙ 설정 열기', fn: () => settings() }],
        [/글씨|글자/, '🔍 글씨 크기', ['오른쪽 아래 🔍 버튼 → ＋ / －', '부캉이에게 「글씨 크게」라고 해도 돼요']],
        [/로그아웃|나가기/, '🔓 로그아웃', ['맨 위 오른쪽 「로그아웃」 버튼', '앱을 완전히 닫아도 자동으로 로그아웃돼요']],
        [/당번|청소/, '🧹 청소 당번 보기 · 바꾸기', ['일정 탭 맨 위 「청소 당번」 줄을 누르면 당번표가 열려요', '바꾸기는 대표님 · 총무님께 말씀해 주세요'], { t: '🧹 당번표 열기', fn: () => openDutyModal() }]
    ];
    function howTo(t) {
        if (!/어떻게|방법|하려면|하는법|어디서해|어디있|어디에있|알려줘.*법|사용법|쓰는법/.test(t)) return null;
        for (const [re, h, l, b] of HOWTO) if (re.test(t)) {
            const a = { h, l, say: l.join('. ') + '.' };
            if (b) a.btns = [{ t: b.t, pri: 1, close: b.t.indexOf('설정') < 0 ? 1 : 0, fn: b.fn }];
            return a;
        }
        return null;
    }

    // ---------- 화면 ----------
    let pan = null, ov = null, bodyEl = null, inp = null, micB = null, stEl = null;
    let isOpenNow = false, rec = null, listening = false, viaVoice = false, enrolling = false;
    // v2.122.0 휴대폰 말풍선 (시안 A): mode 'pan' = 큰 창(태블릿 · PC · 대화 기록), 'bub' = 왼쪽 아래 부캉이 + 말풍선
    let mode = '', bub = null, fab = null, bq = null, bc = null, bst = null, bubHas = false;
    let followMode = false, pendFollow = false, followN = 0, speaking = false, folT = 0;
    const phone = () => innerWidth < 760;
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
        // 휴대폰 말풍선
        bub = document.createElement('div'); bub.className = 'bka-bub'; bub.hidden = true;
        bub.setAttribute('role', 'dialog'); bub.setAttribute('aria-label', '부캉이');
        bub.innerHTML = `<button type="button" class="bka-bx" data-b="x" aria-label="닫기">✕</button><div class="bka-bq"></div><div class="bka-bc" aria-live="polite"></div>
            <div class="bka-bf"><button type="button" class="bka-bst" data-b="mic"></button><button type="button" class="bka-blog" data-b="log">대화 기록 ›</button></div>`;
        fab = document.createElement('button'); fab.type = 'button'; fab.className = 'bka-fab'; fab.hidden = true; fab.dataset.b = 'mic';
        fab.setAttribute('aria-label', '부캉이에게 말하기'); fab.innerHTML = '<i class="bka-bk" aria-hidden="true"></i>';
        document.body.appendChild(bub); document.body.appendChild(fab);
        bq = bub.querySelector('.bka-bq'); bc = bub.querySelector('.bka-bc'); bst = bub.querySelector('.bka-bst');
        const onB = e => {
            const k = e.target.closest('[data-k]'); if (k) { const fn = acts[+k.dataset.k]; if (fn) call(fn); return; }
            const b = e.target.closest('[data-b]'); if (!b) return;
            if (b.dataset.b === 'x') close();
            else if (b.dataset.b === 'log') open(true);
            else if (b.dataset.b === 'mic') { followN = 0; listen(); }
        };
        bub.addEventListener('click', onB); fab.addEventListener('click', onB);
        // 말풍선 밖을 누르면 닫힘 (화면은 그대로 쓸 수 있음)
        document.addEventListener('pointerdown', e => {
            if (mode !== 'bub' || !isOpenNow) return;
            const el = e.target;
            if (el && el.closest && el.closest('.bka-bub,.bka-fab,.bka-bar,.bka-pan,.bka-ov')) return;
            close();
        }, true);
        setSt('');
        hello();
    }
    // 아래 탭 막대 · 재생 띠 위에 자리 잡기
    function place() {
        if (!bub) return;
        let top = innerHeight;
        ['mainTabs', 'plMini'].forEach(id => {
            const el = $(id); if (!el || !el.offsetHeight) return;
            const cs = getComputedStyle(el); if (cs.position !== 'fixed' || cs.visibility === 'hidden') return;
            const r = el.getBoundingClientRect(); if (r.bottom >= innerHeight - 40 || r.top > innerHeight * .6) top = Math.min(top, r.top);
        });
        document.documentElement.style.setProperty('--bka-gap', Math.max(0, Math.round(innerHeight - top)) + 'px');
    }
    // 말풍선 그리기: 물은 말 + 대답 카드(짧게) — 다 보려면 「대화 기록 ›」
    function bubIdle() {
        bubQ('');
        const qs = CHIPS.filter(c => c[1]).slice(0, 4);
        bc.innerHTML = `<div class="h">무엇이든 물어보세요 🦉</div><div class="l">${SR ? '부캉이를 누르고 말하거나 아래에서 골라요' : '아래에서 고르거나 글자로 적어요'}</div>
            <div class="bka-bchips">${qs.map(c => `<button type="button" data-k="${reg(() => ask(c[1], false))}">${esc(c[0])}</button>`).join('')}<button type="button" data-k="${reg(() => { open(true); setTimeout(() => { if (inp) inp.focus(); }, 60); })}">⌨ 글자로 적기</button></div>`;
        bubHas = false;
    }
    function bubQ(txt, live) { if (bq) { bq.textContent = txt || ''; bq.classList.toggle('live', !!live); } }
    function bubRender(a) {
        if (!bc || !a) return;
        let h = '';
        if (a.multi) {
            a.multi.forEach((x, i) => { const last = i === a.multi.length - 1; h += `<div class="bka-bpart${i ? ' sep' : ''}">${cardHtml(x, last ? { l: 2, items: 3, btns: 3 } : { l: 1, items: 0, btns: 0 })}</div>`; });
        } else h = cardHtml(a, { l: 3, items: 3, btns: 3 });
        bc.innerHTML = h; bc.scrollTop = 0; bubHas = true;
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
        if (fab) fab.classList.toggle('on', k === 'listen');
        if (bst) { bst.textContent = k === 'listen' ? (followMode ? '● 이어서 말하세요' : '● 듣고 있어요') : SR ? '🎙 또 물어보기' : ''; bst.classList.toggle('on', k === 'listen'); bst.hidden = !SR; }
    }
    function scrollEnd() { if (bodyEl) requestAnimationFrame(() => { bodyEl.scrollTop = bodyEl.scrollHeight; }); }
    function me(text) { const d = document.createElement('div'); d.className = 'bka-me'; d.textContent = fixBk(text); bodyEl.appendChild(d); scrollEnd(); bubQ('「' + fixBk(text) + '」'); }
    function reg(fn) { acts.push(fn); return acts.length - 1; }
    function cardHtml(a, lim) {   // lim 있으면 말풍선용으로 짧게
        const L = (a.l || []).filter(Boolean), cut = (arr, n) => lim ? arr.slice(0, n) : arr;
        const head = a.h ? `<div class="h">${esc(a.h)}${a.dd ? `<em>${esc(a.dd)}</em>` : ''}</div>` : '';
        const ls = cut(L, lim ? lim.l : 0).map(x => `<div class="l">${esc(x)}</div>`).join('');
        let h = a.no != null ? `<div class="bka-pl"><div class="bka-no">${esc(a.no)}</div><div>${head}${ls}</div></div>` : head + ls;
        const its = a.items || [], bts = a.btns || [];
        if (its.length && (!lim || lim.items)) {
            h += '<div class="bka-items">' + cut(its, lim ? lim.items : 0).map(it => `<button type="button" data-k="${reg(it.ask ? () => ask(it.ask, false) : () => { const r = it.fn(); if (r) bot(r); })}"><b>${esc(it.h)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ''}</button>`).join('') + '</div>';
            if (lim && its.length > lim.items) h += `<button type="button" class="bka-bmore" data-b="log">외 ${its.length - lim.items}개 더 · 대화 기록에서 보기 ›</button>`;
        }
        if (bts.length && (!lim || lim.btns)) h += '<div class="bka-bt">' + cut(bts, lim ? lim.btns : 0).map(b => `<button type="button" class="${b.pri ? 'pri' : 'sec'}" data-k="${reg(() => { if (b.close) close(); const r = call(b.fn); if (r && !b.close) bot(r); })}">${esc(b.t)}</button>`).join('') + '</div>';
        return h;
    }
    function bot(a, noSay, inner) {
        if (!a) return;
        if (a.multi) {   // 여러 일 한 번에: 하나씩 그리고 마지막에 한꺼번에 읽기
            a.multi.forEach((x, i) => { if (i) { const d = document.createElement('div'); d.className = 'bka-step'; d.textContent = '그리고 「' + x.q + '」'; bodyEl.appendChild(d); } bot(x, true, true); });
        } else {
            const w = document.createElement('div'); w.className = 'bka-bot';
            w.innerHTML = '<i class="bka-bk" aria-hidden="true"></i><div class="bka-card">' + cardHtml(a) + '</div>';
            bodyEl.appendChild(w); scrollEnd();
        }
        if (inner) return;
        if (mode === 'bub') bubRender(a);
        if (!noSay && a.say && opt.say && (viaVoice || a.force)) speak(a.say, afterSay);
    }
    function speak(text, done) {
        let fin = false; const end = () => { if (fin) return; fin = true; speaking = false; clearTimeout(st); V('duck', false); if (done) done(); };
        let st = 0;
        try {
            if (!window.speechSynthesis) return;
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/[·→]/g, ', '));
            u.lang = 'ko-KR'; u.rate = 1.05;
            const vs = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
            if (vs.length) u.voice = vs.find(v => /google|female|여/i.test(v.name)) || vs[0];
            V('duck', true); u.onend = u.onerror = end;
            speaking = true; st = setTimeout(end, 2500 + String(text).length * 160);   // onend 가 안 오는 기기 대비
            speechSynthesis.speak(u);
        } catch (e) { end(); }
    }
    // 이어서 말하기 (휴대폰 말풍선): 대답을 읽고 나면 몇 초 동안 다시 들음 · 조용하면 쉼
    function wantFollow(a) {
        if (mode !== 'bub' || !viaVoice || !SR || !a) return false;
        const list = a.multi || [a];
        if (list.some(x => x && (x.quiet || x.raw))) return false;   // 노래 트는 중 · 설정 화면
        if (V('playing')) return false;
        return followN < 6;
    }
    function afterSay() { if (pendFollow) { pendFollow = false; clearTimeout(folT); folT = setTimeout(follow, 350); } }
    function follow() {
        if (!isOpenNow || mode !== 'bub' || listening || enrolling || document.hidden || speaking) return;
        followN++; listen(true);
    }
    function armFollow(a) {
        pendFollow = wantFollow(a);
        if (pendFollow && !speaking) { pendFollow = false; clearTimeout(folT); folT = setTimeout(follow, 900); }
    }
    function ask(text, voice) {
        build();
        if (!isOpenNow) open();
        viaVoice = !!voice;
        if (!voice) followN = 0;
        me(text);
        let a = null;
        try { a = think(text); } catch (e) { console.warn('부캉이 비서 생각 실패:', e); a = { h: '앗, 잠깐 문제가 생겼어요', l: ['다시 말해 주세요'] }; }
        pendFollow = false;
        bot(a);
        runAll(a);
        armFollow(a);
    }
    function runAll(a) {   // 실행할 일들 (여러 일이면 차례로 · 창을 닫는 일은 맨 마지막에만)
        if (!a) return;
        const list = a.multi ? a.multi : [a];
        list.forEach((x, i) => { if (x && x.run) { const last = i === list.length - 1; if (last) call(x.run); else setTimeout(() => call(x.run), 0); } });
    }
    function askAlts(alts) {   // 받아쓰기 후보 여러 개 → 알아들은 첫 번째
        build(); if (!isOpenNow) open();
        viaVoice = true;
        let pick = alts[0], a = null;
        for (const x of alts) { try { const r = think(x); if (r && !r.miss) { pick = x; a = r; break; } } catch (e) {} }
        me(pick);
        if (!a) { try { a = think(pick); } catch (e) { a = { h: '다시 말해 주세요' }; } }
        pendFollow = false;
        bot(a);
        runAll(a);
        armFollow(a);
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
        if (mode === 'bub') open(true);
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
        if (mode === 'bub') open(true);
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
    function listen(fol) {
        build(); if (!isOpenNow) open();
        clearTimeout(folT); pendFollow = false;
        if (listening) { stopListen(); return; }
        if (enrolling) return;
        if (!SR) { if (mode === 'bub') open(true); bot({ h: '이 기기에서는 말로 물을 수 없어요', l: ['아래 칸에 글자로 적어 주세요'] }); inp.focus(); return; }
        followMode = !!fol;
        if (mode === 'bub') { if (!fol) bubQ('', false); if (!fol || !bubHas) { bc.innerHTML = '<div class="bka-blisten"><b>듣고 있어요</b><span class="bka-wave"><i></i><i></i><i></i><i></i><i></i></span><small>「다음 경기 언제야」처럼 말해 보세요</small></div>'; bubHas = false; } }
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
            if (mode === 'bub' && heard) bubQ('「' + heard + (res.isFinal ? '」' : '…」'), !res.isFinal);
            if (!res.isFinal || done) return;
            done = true;
            const alts = []; for (let i = 0; i < res.length; i++) { const x = (res[i].transcript || '').trim(); if (x && alts.indexOf(x) < 0) alts.push(x); }
            stopListen(); inp.value = '';
            askAlts(alts.length ? alts : [heard]);
        };
        r.onerror = ev => {
            const c = ev && ev.error, fol = followMode; stopListen();
            if (c === 'aborted') return;
            if (fol && (c === 'no-speech' || c === 'audio-capture')) return;   // 이어 듣기에서 조용하면 그냥 쉼
            bot({ h: c === 'not-allowed' || c === 'service-not-allowed' ? '마이크 사용을 허락해 주세요' : c === 'no-speech' ? '말소리가 안 들렸어요' : c === 'network' ? '인터넷 연결을 확인해 주세요' : '잘 못 들었어요',
                l: [c === 'not-allowed' || c === 'service-not-allowed' ? '주소창 왼쪽 자물쇠 → 마이크 허용' : '🎙을 누르고 바로 말해 주세요'] });
        };
        r.onend = () => { if (listening) { const h = heard, fol = followMode; stopListen(); inp.value = ''; if (h && !done) { done = true; ask(h, true); } else if (mode === 'bub' && !bubHas && !fol) { bubQ(''); bc.innerHTML = '<div class="h">말소리가 안 들렸어요</div><div class="l">부캉이를 누르고 바로 말해 주세요</div>'; } } };
        setSt('listen');
        try { r.start(); } catch (e) { stopListen(); bot({ h: '음성 인식을 시작하지 못했어요' }); }
    }
    function stopListen() {
        const was = listening;
        listening = false;
        if (rec) { try { rec.onresult = rec.onerror = rec.onend = null; rec.abort(); } catch (e) {} rec = null; }
        if (was) { V('duck', false); V('bkKick', 800); }
        setSt('');
        followMode = false;
        if (bq && bq.classList.contains('live')) bq.classList.remove('live');
    }
    function open(full) {
        build();
        const want = (full || !phone()) ? 'pan' : 'bub';
        if (isOpenNow && (mode === want || (mode === 'pan' && !full))) return;
        isOpenNow = true;
        if (want === 'pan') {
            if (mode === 'bub') { bub.hidden = true; fab.hidden = true; }
            mode = 'pan';
            const side = innerWidth >= 760;
            pan.classList.toggle('side', side); pan.classList.toggle('ph', !side);
            ov.hidden = false; pan.hidden = false;
            document.documentElement.classList.add('bka-open');
        } else {
            mode = 'bub'; place();
            bubIdle();
            bub.hidden = false; fab.hidden = false;
            document.documentElement.classList.add('bka-bub-on');
        }
        setSt(''); scrollEnd();
    }
    function close() {
        if (!isOpenNow) return;
        isOpenNow = false; mode = '';
        clearTimeout(folT); pendFollow = false;
        stopListen();
        try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
        speaking = false;
        V('duck', false);
        if (pan) pan.hidden = true; if (ov) ov.hidden = true;
        if (bub) bub.hidden = true; if (fab) fab.hidden = true;
        document.documentElement.classList.remove('bka-open', 'bka-bub-on');
    }
    // 뒤로가기: index.html 의 뒤로가기 지킴이(plLayers · plBack)에 끼워 넣기 — 비서 창이 열려 있으면 먼저 닫힘
    (function () {
        const L = window.plLayers, B = window.plBack;
        window.plLayers = function () { return (isOpenNow ? 1 : 0) + (typeof L === 'function' ? L() : 0); };
        window.plBack = function () { if (isOpenNow) { close(); return true; } return typeof B === 'function' ? B() : false; };
    })();
    window.addEventListener('resize', () => { if (isOpenNow && pan) { const side = innerWidth >= 760; pan.classList.toggle('side', side); pan.classList.toggle('ph', !side); } if (mode === 'bub') { if (!phone()) open(true); else place(); } });

    // 각 탭 맨 위 「부캉이에게 물어보세요」 줄
    function bars() {
        ['rosterSection', 'scheduleSection', 'noticeSection', 'venueSection'].forEach(id => {
            const sec = $(id); if (!sec || sec.querySelector(':scope > .bka-bar')) return;
            const b = document.createElement('div'); b.className = 'bka-bar';
            b.innerHTML = `<button type="button" class="bka-bar-q"><i class="bka-bk" aria-hidden="true"></i><span>부캉이에게 물어보세요</span></button>${SR ? '<button type="button" class="bka-bar-mic" aria-label="말로 묻기">🎙</button>' : ''}`;
            b.querySelector('.bka-bar-q').addEventListener('click', () => { open(); setTimeout(() => { if (!SR && inp && mode === 'pan') inp.focus(); }, 50); });
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
        mode: () => mode,
        wake: () => { if (!D.authed()) return; open(); if (!listening) listen(); }
    };
})();
