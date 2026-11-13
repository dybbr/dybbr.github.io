// 🦉 부캉이 비서 (v2.120.0 시안 C 대화형 창 · v2.122.0 휴대폰 말풍선 + 두뇌 2세대 · v2.123.0 두뇌 3세대: 대화 · 날씨 · 위치 · 놀이 · 목소리 · v2.125.0 두뇌 4세대: 야구 용어 사전 · 짧은 생활 말 · 직접 가르치기)
//   · 「부캉아」 부르거나(playlist.js 의 호출어 엔진) 🎙 누르거나 글자로 물으면, 앱에 이미 받아 둔 자료
//     (일정 · 경기 결과 · 구장 · 선수 · 공지 · 당번 · 주제곡)를 휴대폰 안에서 찾아 답하고 바로 실행
//   · 서버 · AI 서비스를 부르지 않음 (무료 · 빠름) — 받아쓰기는 휴대폰 기본 음성 인식
//   · 이어 묻기: 방금 말한 일정 · 구장 · 선수를 기억 → 「거기 길찾기」 「그 선수 노래 틀어 줘」
//   · 주문 · 삭제처럼 바뀌는 일은 바로 하지 않고 그 화면을 열어 줌
(function () {
    'use strict';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const LS = 'daeyeon_bka';
    const VER = '2.127.2';
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
    const ctx = { ev: null, venue: null, player: null, notice: null, turn: 0, evTurn: -1, list: null, game: null, lastSay: '', again: null, ag: null, prevQ: '', curQ: '', term: null, re: 0 };

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
        const son = isSon1(p) && String(p.grade).replace(/[^0-9]/g, '') === String(FAM.son1.grade);
        return { no: p.no || (staff ? '★' : '·'), h: p.name, l: (fz ? [desc, '🤔 비슷한 이름으로 찾았어요. 아니면 다시 말해 주세요'] : [desc]).concat(son ? ['🛠 부캉이를 만든 개발자님의 첫째 아들이에요'] : []), btns, say: `${fz ? '혹시 ' : ''}${p.no ? p.no + '번 ' : ''}${p.name}${staff ? '' : ' 선수'}${fz ? '인가요?' : '예요.'} ${desc.replace(/ · /g, ', ')}.` };
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
    const HELP = ['오늘 날씨', '스트라이크가 뭐야', '야구 용어 사전', '끝말잇기 하자', '수수께끼 내 줘', '올해 경기 분석', '오늘의 운세', '다음 경기 언제야', '이번 주 일정', '토요일에 뭐 있어', '지난 경기 결과', '올해 전적', '다음 경기 어디야, 길찾기', '7번 선수 찾아줘', '6학년 명단', '새 공지 있어', '내 당번 언제야', '전체 주제곡 틀어', '타석 모드 열어', '글씨 크게'];
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
        ctx.turn++; ctx.prevQ = ctx.curQ; ctx.curQ = s; ctx.ag = ctx.again; ctx.again = null;
        if (!ctx.game) { const tc = teach(s) || taught(C(s)); if (tc) return tc; }   // 직접 가르친 말이 먼저
        if (ctx.game || /기억해|알아둬|외워둬|외워줘|따라해|따라말해/.test(C(s))) return think1(s);   // 놀이 중 · 「기억해 줘, …」는 통째로
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
        if (ctx.game) { const g = gameTurn(s, t); if (g) return g; }   // 놀이 중이면 놀이가 먼저
        const qk = quick(s, t); if (qk) return qk;                     // 그만 · 중지 · 취소 · 잘 가 · 고마워 · 하나 더 · 그게 아니야
        if (/준비하기|처음준비|다시준비/.test(t) && /부캉|준비/.test(t)) return prepCard();
        if (/소리시험|소리테스트|목소리시험|소리확인|소리가?안나|목소리가?안나|대답소리|말을?안해|대답을?안해|음성대답/.test(t)) return /안나|안해|안들/.test(t) ? noSoundTips() : soundTest();
        if (/^(상태|준비상태|네상태|너상태|상태어때|상태보여줘|상태알려줘)$/.test(t)) return readyCard();
        if (/준비상태|부캉이?상태|다운로드|받았어|받았나|버전|엔진/.test(t) && /부캉|준비|다운로드|받았|버전|엔진|두뇌/.test(t) && !/일정|경기|공지|노래|곡|앱업데이트/.test(t)) return readyCard();
        const p3 = pre3(s, t); if (p3) return p3;                      // 시간 · 날짜 · 계산 · 생일 축하

        // 0) 이어 묻기: 그다음 · 그 전 · 더 보여 줘
        if (ctx.list && /더보여|더알려|나머지|계속보여|다음페이지|더있어/.test(t)) {
            const L = ctx.list;
            if (L.kind === 'ev' && L.off < L.all.length) return evList(L.all, L.title, L.sayHead, L.off);
            if (L.kind === 'term' && DATA) return termList(L.cat, L.off);
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
        if (/^(고마워|고맙|땡큐|됐어|닫아|닫기|창닫|그만해|끝$|끝내|잘했어$)/.test(t)) return { h: '언제든 「부캉아」 불러 주세요!', say: '언제든 불러 주세요.', run: () => setTimeout(close, 900) };

        // 2) 타석 모드에 있으면 그 명령 먼저 (다음 타자 · 홈런 …)
        if (V('inBat')) { const hit = V('parse', s); if (hit && hit.run) return { h: '⚾ ' + hit.say, say: '', quiet: 1, run: () => { close(); hit.run(); } }; }

        // 2-1) 운영진: 말로 초안 채우기 (저장 버튼은 사람이 직접)
        const draft = staffDraft(s, t, fresh);
        if (draft) return draft;
        // 2-2) 오늘 브리핑
        if (/브리핑|요약해|오늘소식|오늘뭐있|오늘무슨일|새소식|오늘어때|오늘알려|하루정리|아침소식|요즘어때/.test(t)) return briefing();
        // 2-3) 세기 · 며칠 남았는지 · 생일
        if (/몇명/.test(t) && /야구|한팀|수비|시합|이서/.test(t)) { if (!DATA && !ctx.re) return needData(s); const fq = faq4(t); if (fq) return fq; }   // 「야구는 몇 명이 해」는 규칙 질문
        const cnt = counting(s, t);
        if (cnt) return cnt;
        // 2-4) 화면 조작
        const scr = screenCtl(t);
        if (scr) return scr;
        // 2-5) 사용법
        const how = howTo(t);
        if (how) return how;

        const b3 = brain3(s, t, fresh); if (b3) return b3;   // 두뇌 3세대: 목소리 · 기억 · 놀이 · 날씨 · 위치 · 분석 · 컨디션 · 가족 · 일상 대화
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
        if (/(멈춰|멈추|정지|일시정지|중지|중단|스톱|스탑|조용|그만틀|노래꺼|음악꺼|노래끄|음악끄|소리꺼)/.test(t) && !ps.length) return V('hasCur') ? { h: '⏸ 노래를 멈췄어요', run: () => V('stop'), quiet: 1 } : { h: '지금 나오는 노래가 없어요' };
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
                return list.length ? playerList(list, `👥 ${gr ? gr + '학년' : ''}${gr && POS ? ' ' : ''}${POS ? POS[1] : ''}`) : ((DATA && !gr && terms4(s, t, true)) || { h: '찾는 선수가 없어요', say: '찾는 선수가 없어요.' });
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
        const mr = memRecall(t, 2); if (mr) return mr;
        if (!DATA && !ctx.re) return needData(s);                      // 자료(용어 · 대화)를 아직 안 받았으면 받고 다시
        const t4 = terms4(s, t, true) || faq4(t) || talkAns(t); if (t4) return t4;
        return missAns(s);
    }
    function missAns(s) {
        const k = C(s); logMiss(s);
        const tell = opt.share !== false && (opt.shareN || 0) < 3;
        if (tell) { opt.shareN = (opt.shareN || 0) + 1; saveOpt(); }
        return { h: '잘 못 알아들었어요', l: ['「' + s + '」'].concat(tell ? ['📮 이런 말은 이름 없이 모아 부캉이 공부에 써요 (⚙ 설정에서 끌 수 있어요)'] : [], ['혹시 아래 뜻이었나요? 고르면 다음부터 이 말을 알아들어요', '또는 「' + s + '라고 하면 ○○라고 대답해」로 가르쳐 주세요']),
            items: LEARN_OPTS.map(q => ({ h: '「' + q + '」', s: '', fn: () => { learn(k, q); const a = think(q); a.l = ['배웠어요! 다음부터 「' + s + '」는 「' + q + '」로 알아들을게요'].concat(a.l || []); return a; } })),
            say: '잘 못 알아들었어요. 다시 말해 주세요.', miss: 1 };
    }

    const LEARN_OPTS = ['오늘 브리핑', '다음 경기 언제야', '이번 주 일정', '오늘 날씨', '놀자', '지난 경기 결과', '다음 경기 어디야', '새 공지 있어', '내 당번 언제야', '전체 주제곡 틀어'];
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

    // ---------- 두뇌 3세대 (v2.123.0) — 일상 대화 · 날씨 · 위치 · 놀이 · 경기 분석 · 기억 ----------
    //   · 날씨만 밖(Open-Meteo, 무료 · 열쇠 없음)에서 받아 옴 — 보내는 건 구장(또는 허락받은 내 위치) 좌표를 약 1km 단위로 뭉갠 값뿐
    //   · 놀이 · 상식 자료(bukang-data.js)는 처음 쓸 때 한 번만 받음
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = b[i]; b[i] = b[j]; b[j] = x; } return b; };
    const hasJong = w => { const c = String(w).slice(-1).charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 ? c % 28 !== 0 : /[013678]$/.test(String(w)); };
    const jo = (w, a, b) => w + (hasJong(w) ? a : b);
    let DATA = window.BKA_DATA || null, dataP = null;
    function loadData() {
        if (DATA) return Promise.resolve(DATA);
        if (dataP) return dataP;
        dataP = new Promise((res, rej) => {
            const sc = document.createElement('script'); sc.src = 'bukang-data.js?v=' + DATA_VER;
            sc.onload = () => { DATA = window.BKA_DATA || null; if (DATA) res(DATA); else rej(new Error('nodata')); };
            sc.onerror = () => rej(new Error('load'));
            document.head.appendChild(sc);
        });
        dataP.catch(() => { dataP = null; });
        return dataP;
    }
    const withData = fn => DATA ? fn() : { h: '🦉 잠깐만요, 준비하고 있어요…', wait: () => loadData().then(fn) };
    const FAIL = () => ({ h: '앗, 못 받아 왔어요', l: ['인터넷 연결을 확인하고 다시 물어봐 주세요'], say: '못 받아 왔어요. 조금 뒤에 다시 물어봐 주세요.' });

    // ----- 숫자 말 (「스물다섯」 「이십오」 「25」) -----
    function anyNum(str) {
        const s = C(str);
        const dm = /\d+/.exec(s); if (dm) return +dm[0];
        const core = s.replace(/(번째|번|개|명|살|이요|요|입니다|이에요|예요|인가|일까)+$/, '');
        const sino = x => { const km = /^(백|[일이삼사오육칠팔구]백)?([일이삼사오육칠팔구십]*)$/.exec(x); if (!km || !(km[1] || km[2])) return 0; const h = km[1] ? (km[1].length > 1 ? '일이삼사오육칠팔구'.indexOf(km[1][0]) + 1 : 1) * 100 : 0; return h + (km[2] ? korNum(km[2]) : 0); };
        if (/^[일이삼사오육칠팔구십백]+$/.test(core)) return sino(core);
        const T10 = { 열: 10, 스물: 20, 스무: 20, 서른: 30, 마흔: 40, 쉰: 50, 예순: 60, 일흔: 70, 여든: 80, 아흔: 90 };
        const U = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
        const nm = /(열|스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔)?(하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉)?$/.exec(core);
        if (nm && (nm[1] || nm[2])) return (nm[1] ? T10[nm[1]] : 0) + (nm[2] ? U[nm[2]] : 0);
        if (core === '백') return 100;
        const sm = /[일이삼사오육칠팔구십백]+/.exec(core);
        return sm ? sino(sm[0]) : 0;
    }

    // ----- 가족 (하코 요청 · 본인이 공개 선택 2026-11-13) -----
    const FAM = { dev: { name: '김동욱', b: [1983, 8, 11] }, wife: { name: '김나현', b: [1985, 1, 16] }, son1: { name: '김승원', grade: 5, no: 30 }, kids: [{ name: '김원우', age: 7, y: 2026, ord: '둘째' }, { name: '김우진', age: 3, y: 2026, ord: '셋째' }] };
    const ageOf = b => { const d = new Date(); let a = d.getFullYear() - b[0]; if (d.getMonth() + 1 < b[1] || (d.getMonth() + 1 === b[1] && d.getDate() < b[2])) a--; return a; };
    const kidAge = k => k.age + (new Date().getFullYear() - k.y);
    const isSon1 = p => p && p.name === FAM.son1.name && +p.no === FAM.son1.no;
    function famToday() {
        const d = new Date(), m = d.getMonth() + 1, dd = d.getDate(), out = [];
        if (FAM.dev.b[1] === m && FAM.dev.b[2] === dd) out.push('부캉이를 만든 ' + FAM.dev.name + ' 개발자님');
        if (FAM.wife.b[1] === m && FAM.wife.b[2] === dd) out.push('개발자님의 아내 ' + FAM.wife.name + ' 님');
        return out;
    }
    function family(s, t) {
        const inRoster = nm => D.players().some(p => p.name === nm && !isSon1(p));
        const rp = findPlayers(t), hit = rp.length && !rp.fuzzy;   // 명단에 같은 이름 선수가 있으면 그 선수가 먼저
        const has = nm => t.indexOf(nm) >= 0 || (!hit && t.indexOf(nm.slice(1)) >= 0);
        const kid = FAM.kids.find(k => has(k.name) && !inRoster(k.name));
        if (kid) return { h: `👦 ${kid.name}`, l: [`부캉이를 만든 개발자님의 ${kid.ord} 아들이에요`, `${kidAge(kid)}살이에요`], say: `${jo(kid.name, '은', '는')} 개발자님의 ${kid.ord} 아들, ${kidAge(kid)}살이에요.` };
        if (t.indexOf(FAM.son1.name) >= 0 && !hit) return { no: FAM.son1.no, h: FAM.son1.name, l: [`${FAM.son1.grade}학년 · ${FAM.son1.no}번`, '🛠 부캉이를 만든 개발자님의 첫째 아들이에요'], say: `${jo(FAM.son1.name, '은', '는')} ${FAM.son1.grade}학년 ${FAM.son1.no}번 선수예요. 부캉이를 만든 개발자님의 첫째 아들이에요.` };
        if ((has(FAM.wife.name) && !inRoster(FAM.wife.name)) || (/아내|와이프|부인|사모님/.test(t) && /개발자|만든|하코/.test(t)))
            return { h: `💐 ${FAM.wife.name} 님`, l: ['부캉이를 만든 개발자님의 아내예요', `생일은 ${FAM.wife.b[1]}월 ${FAM.wife.b[2]}일이에요`], say: `${FAM.wife.name} 님은 개발자님의 아내예요. 생일은 ${FAM.wife.b[1]}월 ${FAM.wife.b[2]}일이에요.` };
        const devName = has(FAM.dev.name) && !inRoster(FAM.dev.name);
        const devAsk = /누가만들|누가만든|만든사람|만든분|개발자|제작자|누가개발|하코/.test(t);
        if (!devName && !devAsk) return null;
        if (/가족|아들|자녀|아이들|애들|식구/.test(t))
            return { h: '👨‍👩‍👦‍👦 개발자님 가족', l: [`아빠 ${FAM.dev.name} · 엄마 ${FAM.wife.name}`, `첫째 ${FAM.son1.name} (${FAM.son1.grade}학년 ${FAM.son1.no}번)`].concat(FAM.kids.map(k => `${k.ord} ${k.name} (${kidAge(k)}살)`)), say: `개발자님 가족은 다섯 명이에요. 첫째 ${FAM.son1.name}, 둘째 ${FAM.kids[0].name}, 셋째 ${jo(FAM.kids[1].name, '이', '가')} 있어요.` };
        if (/생일/.test(t)) return { h: `🎂 ${FAM.dev.name} 개발자님 생일`, l: [`${FAM.dev.b[1]}월 ${FAM.dev.b[2]}일이에요`], say: `개발자님 생일은 ${FAM.dev.b[1]}월 ${FAM.dev.b[2]}일이에요.` };
        if (/몇살|나이/.test(t)) return { h: `${FAM.dev.name} 개발자님은 ${ageOf(FAM.dev.b)}살`, l: [`${FAM.dev.b[0]}년생이에요`], say: `개발자님은 ${ageOf(FAM.dev.b)}살이에요.` };
        return { h: '🛠 부캉이를 만든 사람', l: [`${FAM.son1.grade}학년 ${FAM.son1.no}번 ${FAM.son1.name} 선수 아버님, ${FAM.dev.name} 개발자님이에요`, `첫째 ${FAM.son1.name} · 둘째 ${FAM.kids[0].name}(${kidAge(FAM.kids[0])}살) · 셋째 ${FAM.kids[1].name}(${kidAge(FAM.kids[1])}살)`], say: `${FAM.son1.grade}학년 ${FAM.son1.no}번 ${FAM.son1.name} 선수 아버님, ${FAM.dev.name} 개발자님이 만들었어요.` };
    }

    // ----- 시간 · 날짜 · 계산 · 생일 축하 (다른 뜻과 헷갈리기 전에 먼저) -----
    function calcOf(s) {
        const e = String(s).replace(/(\d)\s*[xX]\s*(\d)/g, '$1×$2');
        const tk = e.match(/\d+(?:\.\d+)?|더하기|플러스|\+|빼기|마이너스|−|곱하기|×|\*|나누기|÷/g);
        if (!tk || tk.length < 3 || tk.length % 2 === 0) return null;
        const op = x => /더하기|플러스|\+/.test(x) ? '+' : /빼기|마이너스|−/.test(x) ? '-' : /곱하기|×|\*/.test(x) ? '×' : /나누기|÷/.test(x) ? '÷' : '';
        const seq = [];
        for (let i = 0; i < tk.length; i++) { if (i % 2 === 0) { if (!/^\d/.test(tk[i])) return null; seq.push(+tk[i]); } else { const o = op(tk[i]); if (!o) return null; seq.push(o); } }
        const shown = seq.join(' ');
        const a = seq.slice();
        for (let i = 1; i < a.length; i += 2) if (a[i] === '×' || a[i] === '÷') { if (a[i] === '÷' && a[i + 1] === 0) return { h: '0으로는 나눌 수 없어요', say: '0으로는 나눌 수 없어요.' }; const v = a[i] === '×' ? a[i - 1] * a[i + 1] : a[i - 1] / a[i + 1]; a.splice(i - 1, 3, v); i -= 2; }
        let v = a[0]; for (let i = 1; i < a.length; i += 2) v = a[i] === '+' ? v + a[i + 1] : v - a[i + 1];
        const out = Math.round(v * 1000) / 1000;
        return { h: `🧮 ${shown} = ${out}`, say: `${out}${hasJong(String(out)) ? '이에요' : '예요'}.` };
    }
    function bdayParty(ps) {
        const p = ps[0], nm = ps.map(x => x.name).join(', ');
        const a = { h: `🎉 ${nm} 선수, 생일 축하해요!`, l: ['🎂 오늘 하루 주인공이에요', '건강하게 쑥쑥 자라서 멋진 선수가 되길 부캉이가 응원해요!'], say: `${nm} 선수, 생일 축하해요! 건강하게 쑥쑥 자라서 멋진 선수가 되길 부캉이가 응원할게요.`, btns: [{ t: '👤 선수 화면', pri: 1, close: 1, fn: () => goToPlayer(playerPath(p)) }] };
        if (pidOf(p)) a.btns.push({ t: '🎵 주제곡 틀어 주기', fn: () => playP(p) });
        return a;
    }
    function pre3(s, t) {
        if (!/경기|일정|시합|대회|훈련|당번|집합|모여|끝나|시작|수업/.test(t) && !when(t)) {
            if (/(지금|현재)?몇시(야|예요|에요|니|지|인지|냐|임|죠|인가요)?$|현재시간|지금시간|시간알려|몇시몇분/.test(t)) {
                const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
                return { h: `🕐 지금은 ${hmKo(hm)}`, l: [`${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`], say: `지금은 ${hmKo(hm)}이에요.` };
            }
        }
        if (/며칠이야|며칠이에요|며칠이지|며칠이니|며칠인가|몇일이야|며칠이죠|날짜알려|몇월며칠|무슨요일/.test(t) && !/남았|까지|경기|일정|시합|대회|훈련|당번|생일/.test(t)) {
            const w = when(t), d = w ? dOf(w.from) : today0(), lb = w ? w.label : '오늘';
            return { h: `📆 ${jo(lb, '은', '는')} ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`, say: `${jo(lb, '은', '는')} ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일이에요.` };
        }
        if (!/대\s*\d|[:：]|월|일|시|번|학년/.test(s) || /더하기|빼기|곱하기|나누기|플러스|마이너스/.test(s)) { const c = calcOf(s); if (c) return c; }
        if (/생일/.test(t) && /축하/.test(t)) {
            let bd = []; try { bd = birthdayPlayersToday(); } catch (e) {}
            const named = findPlayers(t).filter(p => bd.indexOf(p) >= 0);
            if (named.length || bd.length) return bdayParty(named.length ? named : bd);
            const ft = famToday(); if (ft.length) return { h: `🎉 ${ft.join(', ')}, 생일 축하해요!`, l: ['🎂 부캉이가 제일 크게 축하해요'], say: `${ft.join(', ')}, 생일 축하해요!` };
            const ps = findPlayers(t);
            if (ps.length === 1) return { h: `🎂 ${ps[0].name} 선수 생일은 오늘이 아니에요`, l: ['그래도 미리 축하해요! 🎉'], say: `오늘은 ${ps[0].name} 선수 생일이 아니지만, 미리 축하해요!` };
            return { h: '🎂 오늘 생일인 선수는 없어요', l: ['「생일인 사람」이라고 하면 다가오는 생일을 알려 드려요'], say: '오늘 생일인 선수는 없어요.' };
        }
        return family(s, t);
    }

    // ----- 날씨 (Open-Meteo) · 위치 -----
    const SCHOOL = { lat: 35.135, lng: 129.095, label: '학교 근처 (부산 남구)' };
    const WX = c => c === 0 ? ['☀️', '맑음'] : c === 1 ? ['🌤', '대체로 맑음'] : c === 2 ? ['⛅', '구름 조금'] : c === 3 ? ['☁️', '흐림'] : c <= 48 ? ['🌫', '안개'] : c <= 57 ? ['🌦', '이슬비'] : c <= 67 ? ['🌧', '비'] : c <= 77 ? ['🌨', '눈'] : c <= 82 ? ['🌦', '소나기'] : c <= 86 ? ['🌨', '눈'] : ['⛈', '천둥번개'];
    const fetchJ = (u, ms) => new Promise((res, rej) => {
        const ac = window.AbortController ? new AbortController() : null;
        const to = setTimeout(() => { try { if (ac) ac.abort(); } catch (e) {} rej(new Error('timeout')); }, ms || 9000);
        fetch(u, ac ? { signal: ac.signal } : {}).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(d => { clearTimeout(to); res(d); }, e => { clearTimeout(to); rej(e); });
    });
    const wxCache = {};
    function wxFetch(lat, lng) {
        const la = (+lat).toFixed(2), lo = (+lng).toFixed(2), k = la + ',' + lo, c = wxCache[k];
        if (c && Date.now() - c.t < 20 * 60000) return Promise.resolve(c.d);
        const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=10';
        const air = fetchJ('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + la + '&longitude=' + lo + '&current=pm10,pm2_5&timezone=Asia%2FSeoul', 6000).then(d => d && d.current, () => null);
        return fetchJ(u).then(d => air.then(a => { d.air = a; wxCache[k] = { t: Date.now(), d }; return d; }));
    }
    function geoNow() {
        return new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error('nogeo'));
            navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), e => rej(e || new Error('geo')), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        });
    }
    const geoFail = () => ({ h: '📍 위치를 알 수 없어요', l: ['휴대폰 위치(GPS)를 켜고, 「위치 사용」을 허락해 주세요', '주소창 왼쪽 자물쇠 → 위치 허용'], say: '위치를 알 수 없어요. 위치 사용을 허락해 주세요.' });
    const vPos = v => { try { return venueLatLng(v); } catch (e) { return Promise.reject(e); } };
    const pmG = (v, a, b, c) => v <= a ? '좋음' : v <= b ? '보통' : v <= c ? '나쁨' : '매우 나쁨';
    function wxAnswer(d, o) {   // o = { label, date(ymd|null), hour, rangeTo, ask }
        const r = n => Math.round(n), dl = (d && d.daily) || {}, days = dl.time || [];
        if (!days.length) return FAIL();
        const T = ymd(today0()), src = '날씨 자료: Open-Meteo';
        const dayLine = i => { const w = WX(dl.weather_code[i]); return { w, lo: r(dl.temperature_2m_min[i]), hi: r(dl.temperature_2m_max[i]), pp: dl.precipitation_probability_max ? dl.precipitation_probability_max[i] : null }; };
        const tip = x => (x.pp != null && x.pp >= 60) ? '☔ 우산을 챙기세요' : (x.pp != null && x.pp >= 30) ? '🌂 작은 우산이 있으면 좋아요' : x.lo <= 0 ? '🧤 아주 추워요. 장갑과 두꺼운 겉옷을 챙기세요' : x.lo <= 5 ? '🧥 아침저녁이 추워요. 겉옷을 챙기세요' : x.hi >= 30 ? '🥤 더워요. 물을 넉넉히 챙기세요' : '';
        const more = [{ t: '내일 날씨', fn: () => weather('내일 날씨', '내일날씨') }, { t: '이번 주 날씨', fn: () => weather('이번 주 날씨', '이번주날씨') }];
        if (o.rangeTo) {   // 여러 날
            const idx = days.map((x, i) => i).filter(i => days[i] >= o.date && days[i] <= o.rangeTo);
            if (!idx.length) return { h: '그때 날씨는 아직 안 나왔어요', l: ['예보는 열흘 뒤까지만 나와요'], say: '그때 날씨는 아직 안 나왔어요.' };
            const rain = idx.filter(i => (dayLine(i).pp || 0) >= 60);
            return { h: `🌤 ${o.rangeLabel} 날씨`, l: ['📍 ' + o.label, src], all: 1, items: idx.map(i => { const x = dayLine(i); return { h: `${mdShort(days[i])} ${x.w[0]} ${x.w[1]}`, s: `${x.lo}° ~ ${x.hi}°${x.pp != null ? ' · 비 ' + x.pp + '%' : ''}`, fn: () => wxAnswer(d, { label: o.label, date: days[i] }) }; }), say: `${o.rangeLabel} 날씨예요. ${rain.length ? rain.map(i => mdKo(days[i]).replace(/^\d+월 /, '')).join(', ') + '에 비 소식이 있어요.' : '비 소식은 없어요.'}` };
        }
        const date = o.date || T;
        if (date < T) return { h: '지난 날씨는 볼 수 없어요', say: '지난 날씨는 볼 수 없어요.' };
        const i = days.indexOf(date);
        if (i < 0) return { h: `${mdShort(date)} 날씨는 아직 안 나왔어요`, l: ['예보는 열흘 뒤까지만 나와요. 날짜가 가까워지면 다시 물어봐 주세요'], say: '그날 날씨는 아직 안 나왔어요. 예보는 열흘 뒤까지만 나와요.' };
        const x = dayLine(i), l = ['📍 ' + o.label], dayLb = date === T ? '오늘' : date === ymd(addD(today0(), 1)) ? '내일' : mdKo(date);
        let h, say;
        if (date === T && d.current && o.hour == null) {
            const c = d.current, w = WX(c.weather_code);
            h = `${w[0]} 지금 ${r(c.temperature_2m)}° ${w[1]}`;
            l.push(`오늘 ${x.lo}° ~ ${x.hi}°${x.pp != null ? ' · 비 올 확률 ' + x.pp + '%' : ''}`, `체감 ${r(c.apparent_temperature)}° · 바람 ${r(c.wind_speed_10m)}m/s`);
            if (d.air && d.air.pm10 != null) l.push(`😷 미세먼지 ${pmG(d.air.pm10, 30, 80, 150)}(${r(d.air.pm10)})${d.air.pm2_5 != null ? ' · 초미세먼지 ' + pmG(d.air.pm2_5, 15, 35, 75) + '(' + r(d.air.pm2_5) + ')' : ''}`);
            say = `지금 ${r(c.temperature_2m)}도, ${w[1]}${hasJong(w[1]) ? '이에요' : '예요'}. 오늘 최고 ${x.hi}도, 최저 ${x.lo}도${x.pp != null ? ', 비 올 확률은 ' + x.pp + '퍼센트' : ''}예요.`;
            if (o.ask === 'dust' && d.air && d.air.pm10 != null) say = `미세먼지는 ${pmG(d.air.pm10, 30, 80, 150)}${d.air.pm2_5 != null ? ', 초미세먼지는 ' + pmG(d.air.pm2_5, 15, 35, 75) : ''}이에요.`;
        } else {
            h = `${x.w[0]} ${dayLb} ${x.w[1]} ${x.lo}° ~ ${x.hi}°`;
            if (x.pp != null) l.push(`비 올 확률 ${x.pp}%`);
            say = `${dayLb} 날씨는 ${x.w[1]}, 최저 ${x.lo}도, 최고 ${x.hi}도${x.pp != null ? ', 비 올 확률은 ' + x.pp + '퍼센트' : ''}예요.`;
            if (o.hour != null && d.hourly && d.hourly.time) {
                const k = d.hourly.time.indexOf(date + 'T' + String(o.hour).padStart(2, '0') + ':00');
                if (k >= 0) { const hw = WX(d.hourly.weather_code[k]), pp = d.hourly.precipitation_probability ? d.hourly.precipitation_probability[k] : null; l.push(`⚾ ${o.hourLabel || o.hour + '시'} ${hw[0]} ${r(d.hourly.temperature_2m[k])}° ${hw[1]}${pp != null ? ' · 비 ' + pp + '%' : ''}`); say += ` ${o.hourLabel || o.hour + '시'}에는 ${r(d.hourly.temperature_2m[k])}도, ${hw[1]}${hasJong(hw[1]) ? '이에요' : '예요'}.`; }
            }
        }
        if (o.ask === 'rain') say = (x.pp != null ? `${dayLb} 비 올 확률은 ${x.pp}퍼센트예요. ` : '') + (x.pp >= 60 ? '우산을 챙기세요.' : x.pp >= 30 ? '작은 우산이 있으면 좋아요.' : '우산은 없어도 될 것 같아요.');
        if (o.ask === 'temp') say = `${dayLb} 최저 ${x.lo}도, 최고 ${x.hi}도예요. ` + (x.lo <= 5 ? '추우니까 겉옷을 챙기세요.' : x.hi >= 30 ? '더우니까 물을 넉넉히 챙기세요.' : '활동하기 괜찮아요.');
        const tp = tip(x); if (tp) l.push(tp);
        l.push(src);
        return { h, l, btns: more, say };
    }
    function weather(s, t) {
        const wt = t.replace(/준비|비교|비밀|비용|수비|눈치|눈물|눈높이/g, '');
        if (!/날씨|기온|온도|미세먼지|초미세|비와|비오|비올|비가|눈와|눈오|눈올|눈이와|우산|추워|추울|춥|더워|더울|덥|쌀쌀|바람불/.test(wt) || /글씨|글자|화면/.test(t)) return null;
        const w = when(t);
        let loc = null, ev = null;
        const vIn = findVenueIn(t.replace(/어디|위치/g, ''));
        if (/여기|내위치|현재위치|지금위치|우리동네|이근처|이곳/.test(t)) loc = { geo: 1, label: '지금 있는 곳' };
        else if (vIn) loc = { v: vIn, label: vLabel(vIn.name) };
        else if (D.canSched() && (/경기|시합|대회|훈련|일정|연습/.test(t) || (/그날|그때|거기|그경기|그일정/.test(t) && ctx.ev))) {
            ev = (/그날|그때|거기|그경기|그일정/.test(t) && ctx.ev) ? ctx.ev : (schedQuery(t).evs[0] || null);
            if (ev) { const vo = venueOfEvent(ev); loc = vo ? { v: vo.v, label: vLabel(ev.place) } : null; }
        }
        if (!loc) { const sv = D.venues().find(v => /대연초|학교/.test(v.name || '')); loc = sv ? { v: sv, label: vLabel(sv.name) } : { pos: SCHOOL, label: SCHOOL.label }; }
        const ask = /미세먼지|초미세|공기/.test(t) ? 'dust' : /비와|비오|비올|비가|우산|눈와|눈오|눈올/.test(t) ? 'rain' : /추워|추울|춥|더워|더울|덥|쌀쌀|기온|온도|몇도/.test(t) ? 'temp' : '';
        const o = { label: loc.label, ask };
        if (ev) { o.date = ev.date; const hh = /^(\d{1,2}):/.exec(ev.start || ''); if (hh) { o.hour = +hh[1]; o.hourLabel = '시작하는 ' + hmKo(ev.start); } o.label = `${loc.label} · ${mdShort(ev.date)} ${(ev.title && ev.title !== ev.type) ? ev.title : ev.type}`; ctx.ev = ev; }
        else if (w) { o.date = w.from; if (w.to !== w.from) { o.rangeTo = w.to; o.rangeLabel = w.label; if (o.date < ymd(today0())) o.date = ymd(today0()); } }
        else if (/일주일|주간|이번주|한주/.test(t)) { o.date = ymd(today0()); o.rangeTo = ymd(addD(today0(), 6)); o.rangeLabel = '일주일'; }
        const pos = loc.geo ? geoNow() : loc.pos ? Promise.resolve(loc.pos) : vPos(loc.v).catch(() => SCHOOL);
        return { h: '🌤 날씨를 알아보고 있어요…', wait: () => pos.then(p => wxFetch(p.lat, p.lng).then(d => wxAnswer(d, o), () => FAIL()), () => geoFail()) };
    }
    const distKm = (a, b) => { const R = 6371, q = x => x * Math.PI / 180, dLa = q(b.lat - a.lat), dLo = q(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(q(a.lat)) * Math.cos(q(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const kmTxt = k => k < 1 ? Math.round(k * 1000 / 10) * 10 + 'm' : (k < 10 ? k.toFixed(1) : Math.round(k)) + 'km';
    const carMin = k => { const road = k * 1.35, sp = road < 5 ? 22 : road < 20 ? 32 : 60; return Math.max(2, Math.round(road / sp * 60 / 5) * 5 || 2); };
    function venueDists(me) {
        return Promise.all(D.venues().map(v => vPos(v).then(p => ({ v, km: distKm(me, p) }), () => null))).then(a => a.filter(Boolean).sort((x, y) => x.km - y.km));
    }
    function whereAmI() {
        return geoNow().then(me => {
            const addr = new Promise(res => {
                try { loadKakaoMaps().then(k => { new k.maps.services.Geocoder().coord2Address(me.lng, me.lat, (r, st) => { const x = r && r[0]; res(st === k.maps.services.Status.OK && x ? ((x.road_address && x.road_address.address_name) || (x.address && x.address.address_name) || '') : ''); }); }, () => res('')); } catch (e) { res(''); }
                setTimeout(() => res(''), 6000);
            });
            return Promise.all([addr, venueDists(me)]).then(a => {
                const near = a[1][0], l = [];
                if (near) l.push(`가장 가까운 구장: ${vLabel(near.v.name)} (${kmTxt(near.km)})`);
                if (!a[0]) l.push('주소는 못 찾았어요');
                const ans = { h: a[0] ? '📍 ' + a[0] : '📍 지금 위치를 찾았어요', l, say: (a[0] ? `지금 ${a[0]} 근처예요. ` : '') + (near ? `가장 가까운 구장은 ${vLabel(near.v.name)}, 약 ${kmTxt(near.km).replace('km', '킬로미터').replace('m', '미터')}예요.` : '') };
                if (near) ans.btns = [{ t: `🗺 ${vLabel(near.v.name)} 길찾기`, fn: () => routeCard({ name: near.v.name, v: near.v }) }];
                return ans;
            });
        }, () => geoFail());
    }
    function place3(s, t, fresh) {
        if (/내위치|현재위치|지금위치|여기어디|여기가어디|내가어디|여긴어디|지금어디/.test(t)) return { h: '📍 위치를 찾고 있어요…', wait: whereAmI };
        if (/(가까운|가까이|근처)(에)?(있는)?(구장|야구장|운동장)|(구장|야구장|운동장).*(가까운|가깝)/.test(t))
            return { h: '📍 가까운 구장을 찾고 있어요…', wait: () => geoNow().then(me => venueDists(me).then(ds => ds.length ? { h: '📍 가까운 구장', all: 1, items: ds.slice(0, 6).map(x => ({ h: `${vLabel(x.v.name)} · ${kmTxt(x.km)}`, s: `차로 약 ${carMin(x.km)}분쯤 (어림)`, fn: () => routeCard({ name: x.v.name, v: x.v }) })), say: `가장 가까운 구장은 ${vLabel(ds[0].v.name)}, 약 ${kmTxt(ds[0].km).replace('km', '킬로미터').replace('m', '미터')}예요.` } : { h: '구장 위치를 못 찾았어요' }), () => geoFail()) };
        if (/얼마나걸|얼마나멀|몇분걸|몇분거리|몇킬로|몇키로|거리가|거리는|멀어|가까워/.test(t)) {
            let vo = null; const vIn = findVenueIn(t);
            if (vIn) vo = { name: vIn.name, v: vIn };
            else if ((/거기|그곳|그구장/.test(t) || fresh) && ctx.venue) vo = ctx.venue;
            else if (D.canSched()) { const ev = (/그경기|그날/.test(t) && ctx.ev) ? ctx.ev : schedQuery(t).evs[0]; if (ev) { vo = venueOfEvent(ev); if (vo) ctx.ev = ev; } }
            if (!vo && ctx.venue) vo = ctx.venue;
            if (!vo) return { h: '어디까지인지 알려 주세요', l: ['「가상야구장까지 얼마나 걸려」 「다음 경기장까지 얼마나 멀어」처럼요'], say: '어디까지인지 알려 주세요.' };
            const nm = vLabel(vo.name || vo.v.name);
            return { h: `📍 ${nm}까지 재 보고 있어요…`, wait: () => geoNow().then(me => vPos(vo.v).then(p => { const km = distKm(me, p), c = routeCard(vo); c.h = `📍 ${nm}까지 약 ${kmTxt(km)}`; c.l.unshift(`차로 약 ${carMin(km)}분쯤 (곧은 거리로 어림한 값)`, '정확한 시간은 길찾기 버튼으로 확인해 주세요'); c.say = `${nm}까지 곧은 거리로 약 ${kmTxt(km).replace('km', '킬로미터').replace('m', '미터')}, 차로 ${carMin(km)}분쯤이에요.`; return c; }, () => ({ h: `${nm} 위치를 못 찾았어요` })), () => geoFail()) };
        }
        return null;
    }

    // ----- 경기 분석 · 승률 고찰 · 컨디션 -----
    function seasonGames() {
        const yr = String(new Date().getFullYear());
        return D.allEvents().filter(ev => String(ev.date).slice(0, 4) === yr && isGame(ev) && resOf(ev)).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.start || '') < String(b.start || '') ? -1 : 1)
            .map(ev => { const r = resOf(ev), m = /^(\d+):(\d+)$/.exec(r.score || ''); return { ev, k: r.k, us: m ? +m[1] : null, them: m ? +m[2] : null }; });
    }
    function tally(gs) { const w = gs.filter(g => g.k === 'win').length, l = gs.filter(g => g.k === 'lose').length, d = gs.length - w - l; return { w, l, d, n: gs.length, txt: `${w}승${d ? ' ' + d + '무' : ''} ${l}패`, rate: (w + l) ? Math.round(w / (w + l) * 100) : 0 }; }
    function analysis(s, t) {
        if (!/분석|고찰|통계|흐름|전망|이길수|이길까|이기겠|승산|요즘어때|분위기|승률|기대승률/.test(t) || /전적만|노래|주제곡/.test(t)) return null;
        if (!D.canSched()) return deny();
        const gs = seasonGames();
        // 다음(오늘) 경기 미리 보기
        const nx = D.events().find(ev => isGame(ev) && !evEnded(ev));
        const wantNext = /다음경기|오늘경기|이번경기|현재경기|지금경기|내일경기|이길|승산|전망|상대/.test(t) && nx;
        if (wantNext) {
            ctx.ev = nx; ctx.evTurn = ctx.turn; const vo = venueOfEvent(nx); if (vo) ctx.venue = vo;
            const opp = nx.opponent || '', l = [`${mdShort(nx.date)} ${nx.start || ''} ${ddOf(nx.date)}${opp ? ' · VS ' + opp : ''}${nx.place ? ' · ' + vLabel(nx.place) : ''}`], says = [];
            const h2h = opp ? gs.filter(g => C(g.ev.opponent) === C(opp)) : [];
            if (h2h.length) { const tl = tally(h2h), last = h2h[h2h.length - 1]; l.push(`${opp} 상대 올해 ${tl.txt} · 지난 만남 ${mdShort(last.ev.date)} ${resOf(last.ev).label}${last.us != null ? ' ' + last.us + ':' + last.them : ''}`); says.push(`${opp}와는 올해 ${tl.txt}예요.`); }
            else if (opp) { l.push(`${opp}와는 올해 처음 만나요`); says.push(`${opp}와는 올해 처음 만나요.`); }
            if (gs.length) {
                const tl = tally(gs), rec = gs.slice(-5), form = rec.map(g => g.k === 'win' ? '승' : g.k === 'lose' ? '패' : '무').join(' ');
                l.push(`올해 ${tl.txt} (승률 ${tl.rate}%) · 최근 ${rec.length}경기 ${form}`);
                const rw = rec.filter(g => g.k === 'win').length;
                says.push(rw >= 4 ? '요즘 분위기가 아주 좋아요.' : rw >= 3 ? '최근 흐름이 좋은 편이에요.' : rw <= 1 && rec.length >= 3 ? '최근엔 조금 아쉬웠지만, 이번이 분위기를 바꿀 기회예요.' : '최근엔 이기고 지고를 반복하고 있어요.');
            }
            l.push('승부는 해 봐야 알아요. 부캉이는 대연초를 응원해요! 📣');
            says.push('승부는 해 봐야 알지만, 부캉이는 대연초를 응원해요!');
            return { h: `🔎 ${ddOf(nx.date) === '오늘' ? '오늘' : '다음'} 경기 미리 보기`, l, btns: [{ t: '📅 일정 보기', pri: 1, close: 1, fn: () => { showMainTab('schedule'); openEventDetail(nx.id); } }, { t: '🌤 그날 날씨', fn: () => weather('그 경기 날씨', '그경기날씨') }, { t: '📊 올해 분석', fn: () => analysis('올해 분석', '올해분석') }], say: says.join(' ') };
        }
        if (!gs.length) return { h: '올해 기록된 경기 결과가 아직 없어요', l: ['결과가 쌓이면 흐름과 승률을 분석해 드려요'], say: '올해 경기 결과가 아직 없어요.' };
        const tl = tally(gs), sc = gs.filter(g => g.us != null), l = [], says = [`올해 ${tl.n}경기 ${tl.txt}, 승률 ${tl.rate}퍼센트예요.`];
        l.push(`승률 ${tl.rate}% · 최근 ${Math.min(5, gs.length)}경기 ${gs.slice(-5).map(g => g.k === 'win' ? '승' : g.k === 'lose' ? '패' : '무').join(' ')}`);
        let st = 1; for (let i = gs.length - 2; i >= 0 && gs[i].k === gs[gs.length - 1].k; i--) st++;
        if (st >= 2 && gs[gs.length - 1].k !== 'draw') { l.push(`🔥 지금 ${st}연${gs[gs.length - 1].k === 'win' ? '승' : '패'} 중`); says.push(gs[gs.length - 1].k === 'win' ? `지금 ${st}연승 중이에요.` : `지금 ${st}연패지만, 다음 경기가 반등 기회예요.`); }
        if (sc.length) {
            const rs = sc.reduce((a, g) => a + g.us, 0), ra = sc.reduce((a, g) => a + g.them, 0), af = rs / sc.length, aa = ra / sc.length;
            l.push(`⚾ 경기당 평균 ${af.toFixed(1)}점 내고 ${aa.toFixed(1)}점 줌 (득실 ${rs - ra >= 0 ? '+' : ''}${rs - ra})`);
            says.push(`경기마다 평균 ${af.toFixed(1)}점을 내고 ${aa.toFixed(1)}점을 줬어요.`);
            if (rs + ra > 0 && sc.length >= 3) {
                const py = Math.round(rs * rs / (rs * rs + ra * ra) * 100);
                l.push(`📐 득실점으로 본 기대 승률 ${py}% (실제 ${tl.rate}%)`);
                says.push(py - tl.rate >= 10 ? '점수로 보면 더 이길 수 있었어요. 아깝게 놓친 경기가 있었네요.' : tl.rate - py >= 10 ? '점수 차에 비해 많이 이겼어요. 접전에 강한 팀이에요.' : '점수만큼 정직하게 이기고 있어요.');
            }
            const close = sc.filter(g => Math.abs(g.us - g.them) <= 1 && g.k !== 'draw');
            if (close.length >= 2) { const cw = close.filter(g => g.k === 'win').length; l.push(`🤏 1점 차 승부 ${cw}승 ${close.length - cw}패`); }
            const big = sc.filter(g => g.k === 'win').sort((a, b) => (b.us - b.them) - (a.us - a.them))[0];
            if (big) l.push(`🏅 가장 크게 이긴 경기: ${mdShort(big.ev.date)} ${big.us}:${big.them} VS ${big.ev.opponent || ''}`);
            l.push(af >= 6 && aa <= 4 ? '💬 타선도 수비도 든든해요' : af >= 6 ? '💬 타선이 활발해요. 실점만 줄이면 더 좋아져요' : aa <= 3.5 ? '💬 수비와 투수가 든든해요. 한 점만 더 내면 돼요' : '💬 한 경기씩 배우며 자라는 중이에요');
        }
        const kinds = {}; gs.forEach(g => { const k = g.ev.type || '경기'; (kinds[k] = kinds[k] || []).push(g); });
        const ks = Object.keys(kinds); if (ks.length > 1) l.push(ks.map(k => `${k} ${tally(kinds[k]).txt}`).join(' · '));
        return { h: `📊 올해 ${tl.n}경기 ${tl.txt}`, l, btns: [{ t: '🏆 경기 결과 보기', fn: () => think1('올해 전적') }, { t: '🔎 다음 경기 미리 보기', fn: () => analysis('다음 경기 분석', '다음경기분석') }], say: says.join(' ') };
    }
    function condition(s, t) {
        if (!/컨디션|몸관리|몸상태|준비운동|스트레칭|뭐먹|잠은|푹자|체력|부상|안다치/.test(t)) return null;
        return withData(() => {
            const c = DATA.cond, nx = D.canSched() ? D.events().find(ev => isGame(ev) && !evEnded(ev)) : null;
            const n = nx ? Math.round((dOf(nx.date) - today0()) / 864e5) : 99, key = n === 0 ? 'd0' : n === 1 ? 'd1' : n <= 3 ? 'd3' : 'gen';
            const l = c[key].slice(0, 4), m = new Date().getMonth() + 1;
            if (m >= 11 || m <= 2) l.push('🧥 ' + c.cold); else if (m >= 6 && m <= 8) l.push('🥤 ' + c.hot);
            return { h: `💪 컨디션 조절${nx && n <= 3 ? ` · ${n === 0 ? '오늘 경기' : '경기 ' + n + '일 전'}` : ''}`, l, btns: nx ? [{ t: '🌤 경기 날 날씨', fn: () => { ctx.ev = nx; return weather('그 경기 날씨', '그경기날씨'); } }] : [], say: (nx && n <= 3 ? (n === 0 ? '오늘은 경기 날이에요. ' : `경기 ${n}일 전이에요. `) : '') + l.slice(0, 2).join(' ') };
        });
    }

    // ----- 「기억해 줘」 (이 휴대폰에만 저장) -----
    const MEMK = 'daeyeon_bka_mem';
    const memAll = () => { try { return JSON.parse(localStorage.getItem(MEMK) || '[]') || []; } catch (e) { return []; } };
    const memSave = a => { try { localStorage.setItem(MEMK, JSON.stringify(a.slice(-60))); } catch (e) {} };
    function memory(s, t) {
        if (/기억(하는|한|하고있는)(거|것|게)|뭐기억|기억목록|기억하고있어/.test(t)) {
            const a = memAll();
            return a.length ? { h: `🧠 기억하고 있는 것 ${a.length}개`, all: 1, items: a.slice(-12).reverse().map(m => ({ h: m.k, s: m.v, fn: () => ({ h: m.k, l: [m.v], say: `${jo(m.k, '은', '는')} ${m.v}${hasJong(m.v) ? '이에요' : '예요'}.` }) })), l: ['이 휴대폰에만 저장돼요 · 「○○ 잊어 줘」로 지워요'], say: `${a.length}개를 기억하고 있어요.` } : { h: '🧠 아직 기억한 게 없어요', l: ['「기억해 줘, 우리 집 강아지 이름은 뽀삐야」처럼 가르쳐 주세요'], say: '아직 기억한 게 없어요.' };
        }
        if (/잊어|지워|까먹어/.test(t) && /기억|잊어줘|잊어버려/.test(t)) {
            const a = memAll(), key = C(s.replace(/기억|잊어\s*줘|잊어버려|잊어|지워\s*줘|지워|에 대해|에대해|은|는|을|를/g, ''));
            if (/다|전부|모두|싹/.test(key) && key.length <= 3) { memSave([]); return { h: '🧠 기억을 모두 지웠어요', say: '모두 잊었어요.' }; }
            const i = a.findIndex(m => key && (C(m.k).indexOf(key) >= 0 || key.indexOf(C(m.k)) >= 0));
            if (i >= 0) { const m = a.splice(i, 1)[0]; memSave(a); return { h: `🧠 「${m.k}」 잊었어요`, say: `${m.k}, 잊었어요.` }; }
            return { h: '그건 기억한 적이 없어요', say: '그건 기억한 적이 없어요.' };
        }
        if (/기억해|기억해줘|기억해둬|기억하고있어줘|알아둬|외워둬|외워줘|저장해둬/.test(t)) {
            const body = s.replace(/(,|\s)*(꼭\s*)?(기억해\s*(줘|둬|놔|주세요)?|알아\s*둬|외워\s*(둬|줘)|저장해\s*둬)[\s,.!]*/g, ' ').trim();
            const m = /^(.+?)(?:은|는|이|가)\s+(.+?)(?:이라고|라고)?(?:이야|야|이에요|예요|입니다|이다|임|이고|이래|래)?[.!]?$/.exec(body);
            if (!m || C(m[1]).length < 1 || C(m[2]).length < 1) return { h: '🧠 어떻게 기억할까요?', l: ['「기억해 줘, ○○은 △△야」처럼 말해 주세요', '예: 「기억해 줘, 우리 집 강아지 이름은 뽀삐야」'], say: '무엇은 무엇이다, 이렇게 말해 주세요.' };
            const k = m[1].trim(), v = m[2].trim(), a = memAll().filter(x => C(x.k) !== C(k));
            a.push({ k, v, t: Date.now() }); memSave(a);
            return { h: '🧠 기억했어요', l: [`${jo(k, '은', '는')} ${v}`, '이 휴대폰에만 저장돼요'], say: `${jo(k, '은', '는')} ${v}. 기억했어요.` };
        }
        return null;
    }
    function memRecall(t, min) {   // 가르쳐 준 것 중에 있는지 (min = 열쇠 말 최소 글자 수)
        const a = memAll(); let best = null;
        if (min > 2) { a.forEach(m => { const k = C(m.k); if (k.length >= min && t.indexOf(k) >= 0 && (!best || k.length > C(best.k).length)) best = m; }); return best ? { h: `🧠 ${jo(best.k, '은', '는')} ${best.v}`, l: ['전에 가르쳐 주신 거예요'], say: `${jo(best.k, '은', '는')} ${best.v}${hasJong(best.v) ? '이에요' : '예요'}.` } : null; }
        a.forEach(m => { const k = C(m.k); if (k.length >= 2 && t.indexOf(k) >= 0 && (!best || k.length > C(best.k).length)) best = m; });
        if (!best) { const mine = t.replace(/^(내|나의|제)/, ''); a.forEach(m => { const k = C(m.k).replace(/^(내|나의|제|우리)/, ''); if (k.length >= 2 && mine.indexOf(k) >= 0 && !best) best = m; }); }
        return best ? { h: `🧠 ${jo(best.k, '은', '는')} ${best.v}`, l: ['전에 가르쳐 주신 거예요'], say: `${jo(best.k, '은', '는')} ${best.v}${hasJong(best.v) ? '이에요' : '예요'}.` } : null;
    }

    // ----- 일상 대화 -----
    const hash = str => { let h = 7; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 1000003; return h; };
    const userName = () => { try { const u = getActiveUser(); return (u && u.name) || ''; } catch (e) { return ''; } };
    function lotto() {
        const pick = () => shuffle(Array.from({ length: 45 }, (_, i) => i + 1)).slice(0, 6).sort((a, b) => a - b);
        const a = pick(), b = pick();
        return { h: '🎱 ' + a.join(' · '), l: ['하나 더: ' + b.join(' · '), '무작위로 뽑은 번호예요. 재미로만 봐 주세요 😊'], btns: [{ t: '🔄 다시 뽑기', fn: lotto }], say: `부캉이가 뽑은 번호는 ${a.join(', ')}이에요. 재미로만 봐 주세요.` };
    }
    function news() {
        const go = u => () => { try { window.open(u, '_blank', 'noopener'); } catch (e) { location.href = u; } };
        return { h: '📰 오늘의 주요 뉴스', l: ['버튼을 누르면 뉴스 화면이 열려요', '부캉이가 제목을 직접 읽어 주는 건 아직 준비 중이에요'], btns: [{ t: '네이버 뉴스', pri: 1, fn: go('https://news.naver.com/') }, { t: '다음 뉴스', fn: go('https://news.daum.net/') }, { t: '⚾ 야구 뉴스', fn: go('https://m.sports.naver.com/kbaseball/index') }], say: '뉴스 화면을 열 수 있는 버튼을 보여 드릴게요.' };
    }
    function oneShot(t) {
        if (/동전/.test(t) && /던져|던지|뒤집|앞뒤|골라/.test(t)) { const r = Math.random() < 0.5 ? '앞면' : '뒷면'; return { h: `🪙 ${r}!`, btns: [{ t: '🔄 다시', fn: () => oneShot('동전던져') }], say: `${r}이에요!` }; }
        if (/주사위/.test(t)) { const r = 1 + Math.floor(Math.random() * 6); return { h: `🎲 ${r}`, btns: [{ t: '🔄 다시', fn: () => oneShot('주사위') }], say: `${r}${hasJong(String(r)) ? '이' : ''} 나왔어요!` }; }
        if (/로또|행운의번호|복권/.test(t)) return lotto();
        if (/(아무나|한명|누구|선수).*(뽑아|골라|찍어)|제비뽑기|오늘의선수/.test(t)) {
            const ps = D.players().filter(p => { try { return !isStaff(p.grade); } catch (e) { return true; } });
            if (!ps.length) return null;
            const p = rnd(ps), c = playerCard(p); c.l.unshift('🎯 부캉이가 뽑은 선수예요!'); c.say = `부캉이가 뽑은 선수는 ${p.no ? p.no + '번 ' : ''}${p.name} 선수예요!`; c.btns.unshift({ t: '🔄 다시 뽑기', fn: () => oneShot('아무나뽑아') });
            return c;
        }
        const pm = /(\d+)(부터|에서)(\d+)(까지|사이)?/.exec(t);
        if (pm && /뽑아|골라|아무|랜덤|숫자/.test(t)) { const a = +pm[1], b = +pm[3], r = Math.min(a, b) + Math.floor(Math.random() * (Math.abs(b - a) + 1)); return { h: `🎯 ${r}`, l: [`${Math.min(a, b)}부터 ${Math.max(a, b)}까지에서 뽑았어요`], say: `${r}!` }; }
        return null;
    }
    const TALK = [
        [/^(넌|너|니|네가|너는|당신은?)?(이름이?뭐|누구야|누구니|누구세요|누구예요|정체가)|자기소개|너에대해/, ['저는 대연초 야구부 마스코트 부캉이예요! 일정, 선수, 노래, 날씨에 놀이까지 도와 드려요.', '부캉이예요! 대연초 야구부를 제일 좋아하는 꼬마 비서랍니다.']],
        [/(너|넌|부캉이는?)?몇살|나이가(몇|어떻게)/, ['마음은 언제나 초등학교 6학년이에요!', '야구부랑 같이 자라는 중이에요. 나이는 비밀!']],
        [/사람이야|로봇이야|에이아이야|ai야|인공지능이야|진짜야|살아있/i, ['휴대폰 안에서 일하는 꼬마 비서예요. 인터넷 AI가 아니라서 모르는 것도 많지만, 열심히 배우고 있어요.']],
        [/뭐해|뭐하고있|뭐하니|뭐하냐/, ['「부캉아」 하고 불러 주시길 기다리고 있었어요!', '다음 경기 응원 연습을 하고 있었어요. 📣']],
        [/사랑해|좋아해|최고야|최고다|짱이야|귀여워|귀엽|똑똑|잘한다|잘했어|멋져|멋있|예뻐|착해/, ['헤헤, 고마워요! 저도 정말 좋아해요. 🦉💛', '칭찬받으니까 날개가 들썩들썩해요!', '고마워요! 더 열심히 할게요.']],
        [/바보|멍청|못생|싫어|미워|짜증나|답답해|못알아듣|쓸모없/, ['앗, 미안해요. 더 열심히 배울게요. 「기억해 줘」로 가르쳐 주셔도 돼요.', '속상하게 해서 미안해요. 조금만 더 쉬운 말로 말해 주세요.']],
        [/잘자|굿나잇|자러갈게|잘게|졸려|자야겠/, ['안녕히 주무세요! 푹 자야 내일 힘이 나요. 🌙', '좋은 꿈 꾸세요. 내일 또 만나요!']],
        [/잘잤|좋은아침|굿모닝|일어났어/, ['좋은 아침이에요! 「오늘 브리핑」이라고 하면 오늘 할 일을 알려 드려요.']],
        [/배고파|배고프|뭐먹지|뭐먹을까|밥먹었/, ['저는 응원 소리를 먹고 살아요! 선수들은 골고루 든든하게 먹어야 해요. 🍚', '든든하게 먹고 힘내요! 경기 전에는 너무 기름진 음식은 피해요.']],
        [/힘들어|힘들다|지쳤|피곤해|피곤하|우울|슬퍼|속상|기분안좋|기분나빠|짜증/, ['오늘 많이 힘들었군요. 크게 숨 한 번 쉬고, 물 한 잔 마셔요. 부캉이가 응원할게요. 💛', '그럴 때도 있어요. 조금 쉬어 가도 괜찮아요. 내일은 더 좋은 날이 될 거예요.']],
        [/기분좋|신나|행복해|기뻐|재밌어|재밌다|즐거워/, ['저도 덩달아 신나요! 🎉', '그 기분 그대로 오늘도 파이팅이에요!']],
        [/심심|놀아줘|놀자|뭐하고놀|게임하자|게임할래|게임뭐|놀이/, () => gameMenu()],
        [/긴장돼|긴장되|떨려|떨린다|무서워|걱정돼|걱정이야/, ['떨리는 건 잘하고 싶어서 그래요. 크게 숨을 세 번 쉬고, 연습한 대로만 하면 돼요. 💪', '괜찮아요. 긴장은 준비가 됐다는 신호예요. 부캉이가 옆에서 응원할게요!']],
        [/응원해|응원한마디|응원의말|응원좀|파이팅|화이팅|힘내라|힘을줘|기운줘|용기/, () => cheer()],
        [/(누가|우리가|대연초가)?이길(까|수있)|이겨라|우승할/, ['당연히 대연초죠! 끝까지 응원할게요. 📣', '승부는 해 봐야 알지만, 부캉이 마음속 1등은 언제나 대연초예요!']],
        [/야구좋아|야구가좋|좋아하는(운동|스포츠)/, ['야구가 세상에서 제일 좋아요! 딱 하고 공 맞는 소리가 최고예요. ⚾']],
        [/좋아하는(음식|과자|거|것)|뭐좋아해|뭘좋아해/, ['선수들 응원가랑 홈런 소리를 제일 좋아해요!']],
        [/어디살아|집이어디|어디서왔/, ['대연초 야구부 앱 안에 살아요. 「부캉아」 부르면 바로 나와요!']],
        [/노래해|노래불러/, () => ({ h: '🎵 노래는 선수 주제곡으로 대신할게요!', btns: [{ t: '🎵 전체 주제곡 틀기', pri: 1, fn: () => think1('전체 주제곡 틀어') }], say: '노래는 선수 주제곡으로 대신할게요!' })],
        [/수수께끼|알쏭달쏭/, () => riddle()],
        [/농담|웃겨|웃긴|개그|재밌는얘기|재미있는얘기|유머|아재개그|넌센스|웃겨줘|웃기는/, () => joke()],
        [/명언|좋은말|좋은글|한마디해|오늘의한마디|격언|힘이되는말/, () => quote()],
        [/속담/, () => proverb()],
        [/밸런스|양자택일/, () => balance()],
        [/운세|오늘운|행운|점봐/, () => fortune()],
        [/뉴스|소식지|신문|헤드라인/, () => news()],
        [/신기한(거|얘기|이야기|사실)|재밌는사실|놀라운(사실|이야기|얘기)|토막상식|잡학|(동물|과학|우주|자연)(상식|이야기|얘기)/, () => funfact()],
        [/야구상식|상식알려|상식하나|야구지식|야구얘기|야구이야기|야구토막/, () => fact()],
        [/^(응|어|네|예|그래|알았어|알겠어|오케이|ㅇㅋ|좋아|굿)$/, ['네! 더 궁금한 게 있으면 말해 주세요.', '좋아요! 또 물어보세요.']],
        [/^(아니|아니야|아냐|됐거든|노)$/, ['알겠어요. 다른 걸 물어봐 주세요.']],
        [/미안|죄송/, ['괜찮아요! 부캉이는 금방 잊어요. 😊']],
        [/보고싶|반가워|오랜만/, ['저도 보고 싶었어요! 오늘은 뭘 도와 드릴까요?']],
        [/ㅋㅋ|ㅎㅎ|하하|헤헤|웃음/, ['헤헤, 저도 웃음이 나요! 😄']],
        [/날아|날수있|부엉이|올빼미/, ['부캉이는 부엉이라서 밤눈이 밝아요. 야간 경기도 문제없어요! 🦉']]
    ];
    function chat(s, t) {
        if (/따라해|따라말해/.test(t)) { const x = s.replace(/.*따라\s*(해|말해)\s*(봐|줘|보세요)?[\s,:]*/, '').trim(); return x ? { h: '🦜 ' + x, say: x, force: 1 } : { h: '따라 할 말을 뒤에 붙여 주세요', l: ['「따라 해 봐, 대연초 파이팅」'], say: '따라 할 말을 말해 주세요.' }; }
        if (/다시말해|뭐라고|못들었|한번더말/.test(t) && ctx.lastSay) return { h: '🔁 다시 말할게요', l: [ctx.lastSay], say: ctx.lastSay, force: 1 };
        const one = oneShot(t); if (one) return one;
        if (/일정|경기|공지|당번|선수|명단|구장|주제곡|캘린더/.test(t) && !/이길|이겨|응원|파이팅|화이팅|뉴스|상식|퀴즈|운세|농담/.test(t)) return null;
        for (let i = 0; i < TALK.length; i++) { const row = TALK[i]; if (row[0].test(t)) { if (typeof row[1] === 'function') return row[1](); const r2 = talk2(t), x = r2 ? bag('t2_' + r2.i, r2.a) : bag('talk' + i, row[1]); return { h: x, say: sayOf(x) }; } }
        return null;
    }

    // ----- 놀이: 끝말잇기 · 숫자 맞히기 · 가위바위보 · 퀴즈 · 초성 · 구구단 -----
    function gameMenu() {
        return { h: '🎮 뭐 하고 놀까요?', all: 1, items: [['🔤 끝말잇기', '낱말을 이어 말해요', '끝말잇기 하자'], ['🔢 숫자 맞히기', '1부터 100 · 업 다운', '숫자 맞히기 하자'], ['✌️ 가위바위보', '', '가위바위보 하자']].map(x => ({ h: x[0], s: x[1], ask: x[2] })).concat([{ h: '❓ 퀴즈', s: '야구 · 용어 · 상식 · OX · 수도 · 영어 · 초성 · 구구단 · 암산', fn: quizMenu }, { h: '🤔 수수께끼', s: '알쏭달쏭 문제', fn: riddle }, { h: '⚖️ 밸런스 게임', s: '둘 중에 하나 고르기', fn: balance }]), l: ['「그만」이라고 하면 언제든 끝나요'], say: '끝말잇기, 숫자 맞히기, 가위바위보, 퀴즈, 수수께끼, 밸런스 게임이 있어요. 뭐 할까요?' };
    }
    function quizMenu() {
        return { h: '❓ 어떤 퀴즈를 할까요?', all: 1, items: Object.keys(QN).map(k => ({ h: QN[k], s: QSUB[k] || '', ask: QASK[k] })), l: ['5문제씩 내요 · 「힌트」 「패스」 「그만」'], say: '야구, 용어, 상식, 오엑스, 수도, 영어, 초성, 구구단, 암산 퀴즈가 있어요.' };
    }
    const hiK = 'daeyeon_bka_hi';
    const hiGet = k => { try { return (JSON.parse(localStorage.getItem(hiK) || '{}') || {})[k] || 0; } catch (e) { return 0; } };
    const hiSet = (k, v) => { try { const o = JSON.parse(localStorage.getItem(hiK) || '{}') || {}; if (v > (o[k] || 0)) { o[k] = v; localStorage.setItem(hiK, JSON.stringify(o)); return true; } } catch (e) {} return false; };
    const again = (t, q) => ({ t, pri: 1, fn: () => think1(q) });
    // 끝말잇기
    let WC = null;
    function wcInit() { if (WC) return; const list = DATA.words.split(' '), by = {}; list.forEach(w => { (by[w[0]] = by[w[0]] || []).push(w); }); WC = { set: new Set(list), by }; }
    function dueum(ch) {   // 두음법칙: 「력」→「역」, 「라」→「나」, 「녀」→「여」
        const c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return [ch];
        const i = Math.floor(c / 588), v = Math.floor((c % 588) / 28), f = c % 28, Y = [2, 6, 7, 12, 17, 20], out = [ch];
        const mk = ii => String.fromCharCode(0xAC00 + ii * 588 + v * 28 + f);
        if (i === 5) out.push(mk(Y.indexOf(v) >= 0 ? 11 : 2));
        if (i === 2 && Y.indexOf(v) >= 0) out.push(mk(11));
        return out;
    }
    const roJ = w => { const c = String(w).slice(-1).charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 !== 0 && c % 28 !== 8 ? '으로' : '로'; };   // 「일」→ 로, 「름」→ 으로
    const wcCands = (ch, used) => { let a = []; dueum(ch).forEach(x => { a = a.concat(WC.by[x] || []); }); return a.filter(w => !used[w]); };
    function wcPick(ch, used, n) {
        const c = wcCands(ch, used); if (!c.length) return '';
        const open = c.filter(w => wcCands(w[w.length - 1], Object.assign({ [w]: 1 }, used)).length >= 1);
        if (open.length && (n < 8 || Math.random() < 0.8)) return rnd(open);
        return rnd(c);
    }
    function wcStart() {
        return withData(() => {
            wcInit();
            const first = rnd(['야구', '사과', '나무', '바다', '가방', '모자', '우산', '학교', '운동', '선수', '도서관', '자전거']);
            ctx.game = { type: 'wc', used: { [first]: 1 }, last: first[first.length - 1], n: 1, word: first };
            return { h: `🔤 끝말잇기 시작! 「${first}」`, l: [`「${first[first.length - 1]}」${roJ(first)} 시작하는 낱말을 말해 주세요`, '두 글자 넘는 낱말 · 한 번 쓴 낱말은 안 돼요 · 「그만」 하면 끝나요'], say: `끝말잇기 시작! 제가 먼저 할게요. ${first}! ${first[first.length - 1]}${roJ(first)} 시작하는 낱말을 말해 주세요.` };
        });
    }
    function wcEnd(g, win, why) {
        ctx.game = null; const best = hiSet('wc', g.n);
        const l = [why, `모두 ${g.n}개 낱말을 이었어요${best ? ' · 🏅 새 기록!' : ' · 최고 기록 ' + hiGet('wc') + '개'}`].filter(Boolean);
        return { h: win === null ? '🔤 끝말잇기 끝! 재미있었어요' : win ? '🎉 졌어요! 정말 잘하시네요' : '🦉 이번엔 부캉이가 이겼어요!', l, btns: [again('🔤 한 판 더', '끝말잇기 하자'), { t: '🎮 다른 놀이', fn: gameMenu }], say: (win === null ? '끝말잇기 끝! 재미있었어요. ' : win ? '제가 졌어요! 정말 잘하시네요. ' : '이번엔 제가 이겼어요! ') + `모두 ${g.n}개를 이었어요.` };
    }
    function wcTurn(g, s, t) {
        const eu = ch => { const d = dueum(ch), last = d[d.length - 1]; return d.map(x => `「${x}」`).join(' 또는 ') + roJ(last); };
        if (/^(모르겠|몰라|생각안나|생각이안나|졌어|내가졌|못하겠|패스|항복|포기)/.test(t)) { const ex = wcPick(g.last, g.used, 0); return wcEnd(g, false, ex ? `예를 들면 「${ex}」${hasJong(ex) ? '이' : '가'} 있었어요` : ''); }
        if (/^힌트/.test(t)) { const ex = wcPick(g.last, g.used, 0); return ex ? { h: `💡 힌트: 「${ex[0]}${'○'.repeat(ex.length - 1)}」`, l: [`${ex.length}글자 낱말이에요`], say: `${ex.length}글자 낱말이에요.` } : { h: '💡 저도 생각이 안 나요…', say: '저도 생각이 안 나요.' }; }
        let w = t.replace(/(이요|입니다|이에요|예요|이야)$/, '');
        if (w.length < 2 && t.length >= 2) w = t;
        if (!/^[가-힣]+$/.test(w)) return { h: '한글 낱말로 말해 주세요', l: [`${eu(g.last)} 시작하는 낱말이에요`], say: '한글 낱말로 말해 주세요.', miss: 1 };
        if (w.length < 2) return { h: '두 글자 넘는 낱말로 해 주세요', l: [`${eu(g.last)} 시작하는 낱말이에요`], say: '두 글자 넘는 낱말로 해 주세요.', miss: 1 };
        if (dueum(g.last).indexOf(w[0]) < 0) return { h: `${eu(g.last)} 시작해야 해요`, l: [`제 낱말은 「${g.word}」였어요 · 「힌트」라고 해도 돼요`], say: `${g.last}${roJ(g.last)} 시작해야 해요.`, miss: 1 };
        if (g.used[w]) return { h: `「${w}」${hasJong(w) ? '은' : '는'} 이미 나왔어요`, l: [`${eu(g.last)} 시작하는 다른 낱말을 말해 주세요`], say: `${w}, 이미 나온 낱말이에요.`, miss: 1 };
        const known = WC.set.has(w);
        if (!known && w.length > 5) return { h: '너무 긴 말이에요', l: ['낱말 하나만 말해 주세요'], say: '낱말 하나만 말해 주세요.', miss: 1 };
        g.used[w] = 1; g.n++;
        const mine = wcPick(w[w.length - 1], g.used, g.n);
        if (!mine) return wcEnd(g, true, `「${w[w.length - 1]}」${roJ(w)} 시작하는 낱말이 생각나지 않아요`);
        g.used[mine] = 1; g.n++; g.word = mine; g.last = mine[mine.length - 1];
        return { h: `🦉 「${mine}」`, l: [`${known ? '' : `「${w}」 처음 듣는 말이지만 믿을게요 😊 · `}${eu(g.last)} 시작하는 낱말!`, `${g.n}번째 · 「힌트」 「그만」`], say: `${mine}! ${g.last}!` };
    }
    // 숫자 맞히기
    function udStart() { ctx.game = { type: 'ud', n: 1 + Math.floor(Math.random() * 100), tries: 0, lo: 1, hi: 100 }; return { h: '🔢 숫자 맞히기 시작!', l: ['1부터 100 사이 숫자 하나를 생각했어요', '숫자를 말하면 「업」「다운」으로 알려 드려요'], say: '1부터 100 사이 숫자 하나를 생각했어요. 맞혀 보세요!' }; }
    function udTurn(g, s, t) {
        if (/^(모르겠|몰라|포기|항복|패스|정답알려|답알려)/.test(t)) { ctx.game = null; return { h: `정답은 ${g.n}이었어요`, btns: [again('🔢 한 판 더', '숫자 맞히기 하자')], say: `정답은 ${g.n}이었어요.` }; }
        const v = anyNum(s);
        if (!v || v < 1 || v > 100) return { h: '1부터 100 사이 숫자를 말해 주세요', l: [`지금까지 ${g.lo}~${g.hi} 사이로 좁혔어요`], say: '1부터 100 사이 숫자를 말해 주세요.', miss: 1 };
        g.tries++;
        if (v === g.n) { ctx.game = null; const best = hiSet('ud', 100 - g.tries); return { h: `🎉 정답! ${g.n}`, l: [`${g.tries}번 만에 맞혔어요${best ? ' · 🏅 새 기록!' : ''}`], btns: [again('🔢 한 판 더', '숫자 맞히기 하자'), { t: '🎮 다른 놀이', fn: gameMenu }], say: `정답! ${g.tries}번 만에 맞혔어요.` }; }
        if (v < g.n) { g.lo = Math.max(g.lo, v + 1); return { h: `⬆️ 업! ${v}보다 커요`, l: [`${g.lo}~${g.hi} 사이 · ${g.tries}번째`], say: `업! ${v}보다 커요.` }; }
        g.hi = Math.min(g.hi, v - 1); return { h: `⬇️ 다운! ${v}보다 작아요`, l: [`${g.lo}~${g.hi} 사이 · ${g.tries}번째`], say: `다운! ${v}보다 작아요.` };
    }
    // 가위바위보
    const RPS = ['가위', '바위', '보'], RPSI = ['✌️', '✊', '🖐'];
    const rpsOf = t0 => { const t = String(t0).replace(/가위바위보|묵찌빠/g, ''); return /가위|찌/.test(t) ? 0 : /바위|주먹|묵/.test(t) ? 1 : /보자기|빠|^보|보$/.test(t) ? 2 : -1; };
    function rpsStart(t) { ctx.game = { type: 'rps', w: 0, l: 0, d: 0 }; const m = rpsOf(t); if (m >= 0) return rpsTurn(ctx.game, t, t); return { h: '✌️ 가위바위보!', l: ['가위, 바위, 보 중에 하나를 말해 주세요'], items: RPS.map((x, i) => ({ h: RPSI[i] + ' ' + x, ask: x })), all: 1, say: '가위, 바위, 보! 하나를 말해 주세요.' }; }
    function rpsTurn(g, s, t) {
        const me = rpsOf(t);
        if (me < 0) return { h: '가위, 바위, 보 중에 말해 주세요', items: RPS.map((x, i) => ({ h: RPSI[i] + ' ' + x, ask: x })), all: 1, say: '가위, 바위, 보 중에 말해 주세요.', miss: 1 };
        const bk = Math.floor(Math.random() * 3), r = (me - bk + 3) % 3;   // 1 = 내가 이김
        if (r === 1) g.w++; else if (r === 2) g.l++; else g.d++;
        return { h: `${RPSI[me]} vs ${RPSI[bk]} · ${r === 1 ? '이겼어요! 🎉' : r === 2 ? '부캉이 승! 🦉' : '비겼어요!'}`, l: [`나 ${RPS[me]} · 부캉이 ${RPS[bk]}`, `지금까지 ${g.w}승 ${g.d}무 ${g.l}패 · 또 내려면 가위, 바위, 보!`], items: RPS.map((x, i) => ({ h: RPSI[i] + ' ' + x, ask: x })), all: 1, say: `저는 ${RPS[bk]}! ${r === 1 ? '졌네요. 이기셨어요!' : r === 2 ? '제가 이겼어요!' : '비겼어요!'} 한 번 더?` };
    }
    // 퀴즈 (야구 · 상식 · 수도 · 초성 · 구구단)
    const QN = { base: '⚾ 야구 퀴즈', term: '📖 야구 용어 퀴즈', gk: '💡 상식 퀴즈', ox: '⭕ OX 퀴즈', cap: '🌍 수도 퀴즈', eng: '🔤 영어 낱말 퀴즈', cho: '🧩 선수 초성 퀴즈', gugu: '✖️ 구구단', calc: '➕ 암산' };
    const QASK = { base: '야구 퀴즈', term: '용어 퀴즈', gk: '상식 퀴즈', ox: '오엑스 퀴즈', cap: '수도 퀴즈', eng: '영어 퀴즈', cho: '초성 퀴즈', gugu: '구구단 게임', calc: '암산 게임' };
    const QSUB = { base: '규칙 · 기록 · 선수', term: '풀이를 듣고 낱말 맞히기', gk: '과학 · 역사 · 동물', ox: '맞으면 O, 틀리면 X', cap: '나라별 수도', eng: '낱말 뜻 맞히기', cho: '우리 팀 선수 이름', gugu: '', calc: '더하기 · 빼기' };
    const choOf = nm => Array.from(nm).map(ch => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch; }).join('');
    function quizStart(type) {
        const make = () => {
            let qs = [];
            const take = (key, arr, n) => { const out = []; for (let k = 0; k < n * 3 && out.length < n && out.length < arr.length; k++) { const x = bag(key, arr); if (out.indexOf(x) < 0) out.push(x); } return out; };
            const mk = q => { const ans = q.c[q.a], c = q.c.length > 2 ? shuffle(q.c) : q.c; return { q: q.q, c, a: c.indexOf(ans), e: q.e || '' }; };
            if (type === 'base' || type === 'gk') qs = take('q_' + type, DATA[type], 5).map(mk);
            else if (type === 'ox') qs = take('q_ox', DATA.base.concat(DATA.gk).filter(q => q.c.length === 2), 5).map(mk);
            else if (type === 'term') qs = take('q_term', DATA.terms.filter(x => x[3].length <= 110), 5).map(x => {
                const name = tTitle(x), c = shuffle([name].concat(shuffle(DATA.terms.filter(y => y[0] === x[0] && y !== x)).slice(0, 2).map(tTitle)));
                let q = (/^.*?요\./.exec(x[3]) || [x[3]])[0]; [name].concat(name.split(/\s+|·/), x[1].split('|')).filter(k => k && k.length >= 2).sort((a, b) => b.length - a.length).forEach(k => { q = q.split(k).join('○○'); });
                return { q: '이 야구 용어는? ' + q.replace(/(○○\s*)+/g, '○○ ').replace(/○○ (?=[가-힣])/g, '○○'), c, a: c.indexOf(name) };
            });
            else if (type === 'eng') qs = take('q_eng', DATA.eng, 5).map(x => {
                const rev = Math.random() < 0.35, k = rev ? 0 : 1, c = shuffle([x[k]].concat(shuffle(DATA.eng.filter(y => y[0] !== x[0] && y[1] !== x[1])).slice(0, 2).map(y => y[k])));
                return rev ? { q: `「${x[1]}」${hasJong(x[1]) ? '은' : '는'} 영어로?`, c, a: c.indexOf(x[0]) } : { q: `영어 낱말 「${x[0]}」의 뜻은?`, c, a: c.indexOf(x[1]) };
            });
            else if (type === 'calc') qs = Array.from({ length: 5 }, () => { const plus = Math.random() < 0.5, a = 10 + Math.floor(Math.random() * 80), b = 2 + Math.floor(Math.random() * (plus ? 60 : Math.min(a - 2, 60))); return plus ? { q: `${a} + ${b} = ?`, sayQ: `${a} 더하기 ${jo(String(b), '은', '는')}?`, num: a + b } : { q: `${a} − ${b} = ?`, sayQ: `${a} 빼기 ${jo(String(b), '은', '는')}?`, num: a - b }; });
            else if (type === 'cap') qs = take('q_cap', DATA.caps, 5).map(x => { const c = shuffle([x[1]].concat(shuffle(DATA.caps.filter(y => y[1] !== x[1])).slice(0, 2).map(y => y[1]))); return { q: `${x[0]}의 수도는 어디일까요?`, c, a: c.indexOf(x[1]) }; });
            else if (type === 'cho') {
                const ps = D.players().filter(p => { try { return !isStaff(p.grade) && /^[가-힣]{2,4}$/.test(p.name); } catch (e) { return false; } });
                if (ps.length < 3) return { h: '선수 명단을 아직 못 불러왔어요', say: '선수 명단을 아직 못 불러왔어요.' };
                qs = shuffle(ps).slice(0, 5).map(p => ({ q: `초성 「${choOf(p.name)}」 · ${/^\d+$/.test(String(p.grade)) ? p.grade + '학년' : p.grade}${p.pos && p.pos !== '-' && p.pos !== '정보없음' ? ' ' + p.pos : ''}`, free: p.name, hint: p.no ? `등번호 ${p.no}번이에요` : `성은 「${p.name[0]}」이에요`, p }));
            } else qs = Array.from({ length: 5 }, () => { const a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8); return { q: `${a} × ${b} = ?`, sayQ: `${a} 곱하기 ${jo(String(b), '은', '는')}?`, num: a * b }; });
            ctx.game = { type: 'quiz', kind: type, qs, i: 0, score: 0 };
            const a = quizAsk(ctx.game); a.l.unshift('5문제를 낼게요 · 「힌트」 「패스」 「그만」'); a.say = `${QN[type].replace(/^\S+ /, '')} 시작! ` + a.say;
            return a;
        };
        return (type === 'cho' || type === 'gugu' || type === 'calc') ? make() : withData(make);
    }
    function quizAsk(g, head) {
        const q = g.qs[g.i], a = { h: (head ? head.h + ' ' : '') + `❓ ${g.i + 1}/${g.qs.length}`, l: (head ? head.l : []).concat([q.q]), all: 1, say: (head ? head.say + ' ' : '') + (q.sayQ || q.q.replace(/[「」·]/g, ' ')) };
        if (q.c) { a.items = q.c.map((c, k) => ({ h: q.c.length === 2 ? c : `${k + 1}번 ${c}`, ask: q.c.length === 2 ? c : `${k + 1}번` })); if (q.c.length > 2) a.say += ' ' + q.c.map((c, k) => `${k + 1}번 ${c}`).join(', ') + '.'; }
        return a;
    }
    function quizEnd(g, head) {
        ctx.game = null; const n = g.qs.length, best = hiSet('quiz_' + g.kind, g.score);
        const msg = g.score === n ? '만점이에요! 대단해요 🎉' : g.score >= n - 1 ? '거의 다 맞혔어요! 👏' : g.score >= n / 2 ? '잘했어요!' : '다음엔 더 잘할 수 있어요!';
        return { h: (head ? head.h + ' ' : '') + `🏁 ${n}문제 중 ${g.score}개 정답`, l: (head ? head.l : []).concat([msg + (best && g.score ? ' · 🏅 새 기록!' : '')]), btns: [again('🔄 한 번 더', QASK[g.kind]), { t: '🎮 다른 놀이', fn: gameMenu }], say: (head ? head.say + ' ' : '') + `${n}문제 중 ${g.score}개 맞혔어요. ${msg.replace(/ [🎉👏]/g, '')}` };
    }
    function quizTurn(g, s, t) {
        const q = g.qs[g.i]; let ok = null;
        const ansTxt = q.c ? (q.c.length === 2 ? q.c[q.a] : `${q.a + 1}번 ${q.c[q.a]}`) : q.free || String(q.num);
        if (/^힌트/.test(t)) {
            if (q.hint) return { h: '💡 ' + q.hint, l: [q.q], say: q.hint };
            if (q.c && q.c.length > 2) { const wrong = q.c.map((c, k) => k).filter(k => k !== q.a)[0]; return { h: `💡 ${wrong + 1}번 ${q.c[wrong]}${hasJong(q.c[wrong]) ? '은' : '는'} 아니에요`, l: [q.q], say: `${wrong + 1}번은 아니에요.` }; }
            return { h: '💡 이 문제는 힌트가 없어요', l: [q.q], say: '이 문제는 힌트가 없어요.' };
        }
        if (/^(모르겠|몰라|패스|넘어가|다음문제|정답알려|답알려|포기)/.test(t)) ok = false;
        else if (q.c) {
            let pick = -1;
            if (q.c.length === 2) pick = /^(o|오|동그라미|맞아|맞다|맞아요|맞습니다|예|네|응|참)/i.test(t) ? 0 : /^(x|엑스|가위표|틀려|틀렸|틀립니다|아니|아냐|땡|거짓)/i.test(t) ? 1 : -1;
            else {
                const m = /^([1-3]|일|이|삼|첫|두|세|하나|둘|셋)\s*(번|번째|째)?/.exec(t);
                if (m && (/번|째/.test(t) || t.length <= 2)) pick = { 1: 0, 2: 1, 3: 2, 일: 0, 이: 1, 삼: 2, 첫: 0, 두: 1, 세: 2, 하나: 0, 둘: 1, 셋: 2 }[m[1]];
                if (pick == null || pick < 0) { pick = -1; q.c.forEach((c, k) => { const cc = C(c); if (pick < 0 && (t.indexOf(cc) >= 0 || (cc.indexOf(t) >= 0 && t.length >= 2) || (anyNum(c) && /\d/.test(c) && anyNum(s) === anyNum(c) && !/번$/.test(t)))) pick = k; }); }
            }
            if (pick < 0 || pick >= q.c.length) return Object.assign(quizAsk(g), { h: q.c.length === 2 ? 'O 또는 X로 답해 주세요' : '번호나 답을 말해 주세요', miss: 1, say: q.c.length === 2 ? '오 또는 엑스로 답해 주세요.' : '번호나 답을 말해 주세요.' });
            ok = pick === q.a;
        } else if (q.free) { const nm = C(q.free); ok = t.indexOf(nm) >= 0 || (nm.length >= 3 && t.indexOf(nm.slice(1)) >= 0); if (!ok && !/[가-힣]{2,}/.test(t)) return Object.assign(quizAsk(g), { h: '선수 이름을 말해 주세요', miss: 1, say: '선수 이름을 말해 주세요.' }); }
        else { const v = anyNum(s); if (!v) return Object.assign(quizAsk(g), { h: '숫자로 답해 주세요', miss: 1, say: '숫자로 답해 주세요.' }); ok = v === q.num; }
        if (ok) g.score++;
        const head = { h: ok ? '⭕ 정답!' : '❌ 아쉬워요', l: [ok ? `정답 ${ansTxt}${q.e ? ' · ' + q.e : ''}` : `정답은 ${ansTxt}${q.e ? ' · ' + q.e : ''}`], say: ok ? '정답!' : `아쉬워요. 정답은 ${ansTxt}${hasJong(ansTxt) ? '이에요' : '예요'}.` };
        g.i++;
        return g.i >= g.qs.length ? quizEnd(g, head) : quizAsk(g, head);
    }
    function gameStart(s, t) {
        if (/수수께끼/.test(t)) return riddle();
        if (/밸런스|양자택일|둘중에(하나)?(골라|고르)/.test(t)) return balance();
        if (/암산|덧셈|뺄셈|더하기빼기|계산(게임|놀이|퀴즈|문제)/.test(t)) return quizStart('calc');
        if (/^(오엑스|ox|오x)$/i.test(t) || (/오엑스|ox|동그라미엑스/i.test(t) && /퀴즈|문제|게임|놀이|하자/.test(t))) return quizStart('ox');
        if (/영어/.test(t) && /퀴즈|문제|게임|놀이|낱말|단어/.test(t)) return quizStart('eng');
        if (/용어/.test(t) && /퀴즈|문제|게임|맞히기|맞추기/.test(t)) return quizStart('term');
        if (/^(퀴즈|퀴즈하자|퀴즈내줘|퀴즈할래|퀴즈풀자|퀴즈놀이|퀴즈종류|무슨퀴즈|퀴즈뭐있어)$/.test(t)) return quizMenu();
        if (/끝말잇기|끝말있기|끝말이끼|끝말잇끼|끝말이기|끝말놀이|끝말/.test(t)) return wcStart();
        if (/숫자(맞히기|맞추기|게임|놀이)|업다운|업앤다운/.test(t)) return udStart();
        if (/가위바위보|묵찌빠/.test(t)) return rpsStart(t);
        if (/구구단/.test(t)) return quizStart('gugu');
        if (/초성/.test(t)) return quizStart('cho');
        if (/수도/.test(t) && /퀴즈|문제|맞히기|맞추기|게임|놀이/.test(t)) return quizStart('cap');
        if (/상식|넌센스/.test(t) && /퀴즈|문제/.test(t)) return quizStart(/야구/.test(t) ? 'base' : 'gk');
        if (/퀴즈|문제내|문제줘|문제하나/.test(t)) return quizStart(/수도|나라/.test(t) ? 'cap' : /상식|일반/.test(t) ? 'gk' : 'base');
        return null;
    }
    function gameTurn(s, t) {
        const g = ctx.game; if (!g) return null;
        if (/^(이제)?(그만|그만해|그만할래|그만하자|그만둘래|그만할게|끝|끝내|끝내자|게임끝|게임그만|안해|안할래|스톱|종료|나갈래|닫아|닫기)(요|줘)?$/.test(t)) {
            ctx.game = null;
            if (g.type === 'wc') return wcEnd(g, null, '');
            if (g.type === 'rid') return { h: '🤔 수수께끼를 마칠게요', l: ['정답은 ' + g.a], btns: [{ t: '🎮 다른 놀이', fn: gameMenu }], say: '정답은 ' + g.a + '.' };
            if (g.type === 'bal') return { h: '⚖️ 밸런스 게임을 마칠게요', btns: [{ t: '🎮 다른 놀이', fn: gameMenu }], say: '네, 그만할게요.' };
            if (g.type === 'quiz') return quizEnd(g);
            if (g.type === 'rps') return { h: `✌️ 가위바위보 끝! ${g.w}승 ${g.d}무 ${g.l}패`, btns: [{ t: '🎮 다른 놀이', fn: gameMenu }], say: `가위바위보 끝! ${g.w}승 ${g.d}무 ${g.l}패였어요.` };
            return { h: `🔢 그만할게요. 정답은 ${g.n}이었어요`, btns: [{ t: '🎮 다른 놀이', fn: gameMenu }], say: `정답은 ${g.n}이었어요.` };
        }
        if (g.type === 'rid' && /^(정답|답|모르|몰라|포기|패스|힌트|알려줘|답알려|정답알려|뭐야|뭔데)/.test(t)) return ridTurn(g, s, t);
        const other = gameStart(s, t); if (other && !(g.type === 'rps' && /가위바위보/.test(t))) return other;   // 다른 놀이로 바꾸기
        const cmd = /(언제야|어디야|알려줘|보여줘|틀어줘|찾아줘|열어줘|길찾기|브리핑|날씨)/.test(t) || (/\s/.test(s.trim()) && t.length >= 8 && g.type !== 'quiz');
        if (cmd || (g.type !== 'wc' && /일정|경기|공지|당번|명단/.test(t) && g.type !== 'quiz')) { ctx.game = null; return null; }   // 다른 일을 시키면 놀이는 끝
        if (g.type === 'rid') return ridTurn(g, s, t);
        if (g.type === 'bal') return balTurn(g, s, t);
        if (g.type === 'wc') return wcTurn(g, s, t);
        if (g.type === 'ud') return udTurn(g, s, t);
        if (g.type === 'rps') return rpsTurn(g, s, t);
        return quizTurn(g, s, t);
    }

    // ----- 부캉이 목소리 (휴대폰 내장 목소리 + 높낮이 · 빠르기) -----
    const VOICES = [['bk', '🦉 부캉이', 1.4, 1.08, '밝고 귀엽게'], ['baby', '🐣 아기 부캉이', 1.8, 1.1, '더 높고 앙증맞게'], ['brave', '💪 씩씩한 부캉이', 1.15, 1.2, '또랑또랑 빠르게'], ['calm', '🎙 차분한 아나운서', 0.8, 0.95, '낮고 또박또박'], ['slow', '🐢 천천히', 1.25, 0.82, '어르신 · 아이도 듣기 쉽게'], ['plain', '📱 휴대폰 원래 목소리', 1, 1.05, '아무것도 안 바꿈']];
    const voiceNow = () => VOICES.find(v => v[0] === opt.voice) || VOICES[0];
    const koVoices = () => { try { return speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang)); } catch (e) { return []; } };
    function voiceSet(k, quiet) {
        if (!VOICES.some(v => v[0] === k)) return null;
        opt.voice = k; saveOpt(); const v = voiceNow();
        return { h: `${v[1]} 목소리로 바꿨어요`, l: [v[4], '⚙ 설정 → 부캉이 목소리에서 언제든 바꿀 수 있어요'], say: quiet ? '' : '안녕하세요, 부캉이예요! 이 목소리 어때요?', force: 2 };
    }
    function voiceTalk(s, t) {
        if (!/목소리|말투|말하는속도|말속도|천천히말|빨리말|빠르게말|느리게말/.test(t)) return null;
        if (/등록|내목소리/.test(t)) return null;
        const k = /아기|애기|더귀엽|앙증/.test(t) ? 'baby' : /귀엽|귀여운|부캉이목소리|밝게|높게/.test(t) ? 'bk' : /씩씩|또랑|빠르게|빨리/.test(t) ? 'brave' : /차분|아나운서|낮게|굵게|어른/.test(t) ? 'calm' : /천천히|느리게|느린/.test(t) ? 'slow' : /원래|기본|휴대폰|그냥/.test(t) ? 'plain' : '';
        if (k) return voiceSet(k);
        return { h: '🗣 부캉이 목소리 고르기', l: [`지금: ${voiceNow()[1]}`, '누르면 바로 바뀌고 미리 들려 드려요'], all: 1, items: VOICES.map(v => ({ h: v[1] + (v[0] === voiceNow()[0] ? ' ✓' : ''), s: v[4], fn: () => voiceSet(v[0]) })).concat(koVoices().length > 1 ? koVoices().slice(0, 6).map((v, i) => ({ h: `🔈 휴대폰 목소리 ${i + 1}${opt.vuri === v.voiceURI ? ' ✓' : ''}`, s: v.name, fn: () => { opt.vuri = v.voiceURI; saveOpt(); return { h: '휴대폰 목소리를 바꿨어요', l: [v.name], say: '안녕하세요, 부캉이예요! 이 목소리 어때요?', force: 2 }; } })) : []), say: '원하는 목소리를 골라 주세요.' };
    }

    function brain3(s, t, fresh) {
        const t4 = terms4(s, t, false); if (t4) return t4;   // 「보크가 뭐야」처럼 뜻을 묻는 말은 용어 사전이 먼저
        return voiceTalk(s, t) || memory(s, t) || memRecall(t, 3) || gameStart(s, t) || weather(s, t) || place3(s, t, fresh) || analysis(s, t) || condition(s, t) || faq4(t) || chat(s, t);
    }

    // ============================================================
    // 🧠 두뇌 4세대 (v2.125.0) — 짧은 생활 말 · 야구 용어 사전 · 직접 가르치기 · 같은 말 되풀이 안 하기
    // ============================================================
    // 가방: 다 쓸 때까지 한 번씩만 뽑는다 (같은 농담 · 같은 대답이 연달아 안 나오게)
    const BAG = {};
    function bag(key, arr) {
        if (!arr || !arr.length) return undefined;
        let b = BAG[key];
        if (!b || !b.length) { b = BAG[key] = shuffle(arr.map((_, i) => i)); if (b.length > 1 && b[b.length - 1] === BAG['~' + key]) b.unshift(b.pop()); }
        const i = b.pop(); BAG['~' + key] = i; return arr[i];
    }
    const sayOf = x => String(x).replace(/[「」]/g, '');
    const hush = () => { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {} };
    const musicOn = () => { try { return !!V('hasCur'); } catch (e) { return false; } };
    // 자료가 아직 없으면 받아 온 뒤 같은 말을 다시 생각한다
    function needData(s) {
        const again = () => { ctx.re = 1; try { return think1(s); } finally { ctx.re = 0; } };
        return { h: '🦉 잠깐만요, 찾아보고 있어요…', wait: () => loadData().then(again, again) };
    }

    // ----- 짧은 생활 말: 그만 · 중지 · 취소 · 잘 가 · 고마워 · 하나 더 · 그게 아니야 -----
    const STOPW = /^(이제|자|그럼|부캉아|부캉이|좀|그냥)*(그만|그만해|그만하자|그만할래|그만할게|그만해도돼|그만말해|그만얘기해|그만읽어|멈춰|멈춰봐|멈추자|멈춰라|중지|중지해|중단|중단해|정지|정지해|스톱|스탑|취소|취소해|취소할게|됐어|됐다|됐어요|됐습니다|이제됐어|충분해|꺼|꺼줘|꺼라|꺼져|끄자|닫아|닫아줘|닫기|창닫아|창닫기|조용|조용히|조용히해|조용히해줘|쉿|시끄러|시끄러워|말하지마|읽지마|나가|나가기|나갈래|끝|끝내|끝내자|종료|종료해|들어가|들어가봐|가봐|그만둬|관둬|됐고|아니야됐어|아니됐어)(요|줘|라|해|해줘|해요)?$/;
    const BYEW = /^(그럼|이제|부캉아|부캉이|나)*(안녕히가세요|안녕히계세요|안녕히|잘가|잘가요|잘있어|잘있어요|바이|바이바이|빠이|빠이빠이|굿바이|또봐|또보자|또만나|또올게|다음에봐|다음에보자|다음에또봐|내일봐|내일보자|내일또봐|내일만나|나중에봐|나중에보자|이따봐|이따가봐|갈게|가볼게|먼저갈게|들어갈게|간다|나간다|안녕잘가|안녕내일봐|담에봐)(요|용)?$/;
    const THXW = /^(정말|진짜|너무|아주|오늘|부캉아|부캉이)*(고마워|고맙다|고맙습니다|고마웠어|땡큐|감사|감사해|감사합니다|수고했어|수고했다|수고많았어|수고하셨습니다|고생했어|고생많았어|애썼어|잘했어|잘했다)(요)?$/;
    const AGAINW = /^(하나더|하나만더|한개더|한번더|한번만더|또|또해줘|또해|또줘|더해줘|더줘|다른거|다른것|다른걸로|다음거|계속|계속해|다시|다시해줘|하나더해줘|또들려줘|또알려줘|다른거알려줘)(요|줘)?$/;
    const WRONGW = /^(아니|아니야|아냐|아니아니)*(그게아니|그거아니|그게아닌데|그거아닌데|그거말고|그게아니고|그게아니라|틀렸어|틀렸잖아|틀렸는데|잘못알아들|잘못들었|잘못이해|엉뚱한|동문서답|딴소리|이상한소리|무슨소리|그말이아니|내말은그게|못알아듣네|못알아들었)/;
    function quick(s, t) {
        if (STOPW.test(t)) {
            if (musicOn() && /멈춰|멈추|정지|스톱|스탑|중지|중단|^꺼|^끄|조용|시끄/.test(t)) return { h: '⏸ 노래를 멈췄어요', run: () => V('stop'), quiet: 1 };
            hush();
            return { h: bag('stop', ['네, 그만할게요', '알겠어요, 멈출게요', '네, 여기까지 할게요', '넵, 조용히 있을게요']), l: ['언제든 「부캉아」 하고 불러 주세요'], quiet: 1, bye: 1 };
        }
        if (BYEW.test(t)) { const x = bag('bye', /내일/.test(t) ? ['네, 내일 또 만나요! 👋', '내일 봐요! 푹 쉬세요.', '내일 또 불러 주세요!'] : ['안녕히 가세요! 또 불러 주세요. 👋', '다음에 또 봐요!', '조심히 가세요! 부캉이는 여기 있을게요.', '또 만나요! 언제든 「부캉아」 하고 불러 주세요.']); return { h: x, say: sayOf(x), bye: 1 }; }
        if (THXW.test(t)) { const x = bag('thx', ['별말씀을요! 언제든 불러 주세요.', '도움이 됐다니 기뻐요!', '헤헤, 부캉이도 고마워요.', '천만에요! 또 물어보세요. 😊', '칭찬받으니 날개가 들썩여요!']); return { h: x, say: sayOf(x), bye: 1 }; }
        if (AGAINW.test(t) && ctx.ag) return ctx.ag();
        if (WRONGW.test(t)) return fixAns();
        if (/^(안녕|안녕하세요|안녕하십니까|하이|헬로|헬로우|ㅎㅇ|부캉아안녕|안녕부캉아|안녕부캉이|부캉이안녕)(요)?$/.test(t)) {
            const h = new Date().getHours(), part = h < 5 ? '늦은 밤이에요' : h < 11 ? '좋은 아침이에요' : h < 17 ? '좋은 오후예요' : h < 21 ? '좋은 저녁이에요' : '편안한 밤이에요';
            const x = bag('hi', ['안녕하세요! 🦉 무엇을 도와 드릴까요?', `안녕하세요, ${part}!`, '반가워요! 오늘은 뭘 알려 드릴까요?', '안녕하세요! 부캉이 여기 있어요.', `${part}! 「오늘 브리핑」이라고 하면 오늘 소식을 알려 드려요.`]);
            return { h: x, l: ['「다음 경기 언제야」 「오늘 날씨」 「놀자」처럼 말해 보세요'], say: sayOf(x) };
        }
        return null;
    }
    // 「그게 아니야」: 방금 한 말을 무슨 뜻이었는지 다시 묻고, 고르면 배운다
    function fixAns() {
        const q = ctx.prevQ;
        if (!q) return { h: '앗, 미안해요', l: ['조금만 다르게 다시 말해 주세요'], say: '미안해요. 다시 말해 주세요.' };
        const a = missAns(q);
        a.h = '앗, 미안해요. 제가 잘못 알아들었어요'; a.l = ['「' + q + '」', '아래에서 뜻을 고르면 다음부터 그렇게 알아들어요', '또는 「' + q + '라고 하면 ○○라고 대답해」로 가르쳐 주세요'];
        a.say = '미안해요. 무슨 뜻이었는지 골라 주세요.'; a.miss = 0;
        return a;
    }

    // ----- 직접 가르치기: 「○○라고 하면 △△라고 대답해」 (이 휴대폰에만 기억) -----
    const TEACH = 'daeyeon_bka_teach';
    const teachAll = () => { try { return JSON.parse(localStorage.getItem(TEACH) || '{}') || {}; } catch (e) { return {}; } };
    const teachSave = m => { try { localStorage.setItem(TEACH, JSON.stringify(m)); } catch (e) {} };
    const TEACHRE = /^(.{1,40}?)\s*(?:이라고|라고|하고|라|이라)\s*(?:하면|말하면|물으면|물어보면|그러면|묻거든|하거든)\s*(.{1,120}?)\s*(?:이라고|라고)?\s*(?:대답해\s*줘|대답해|대답하는\s*거야|말해\s*줘|말해|답해\s*줘|답해|해\s*줘|해|하는\s*거야|하면\s*돼)[.!~]*$/;
    function teach(s) {
        const t = C(s);
        if (/(가르친|배운|가르쳐준)(거|것|말|내용)/.test(t) && /잊어|지워|삭제|초기화|없애/.test(t)) { teachSave({}); try { localStorage.removeItem(LEARN); } catch (e) {} return { h: '🧽 가르쳐 주신 말을 모두 잊었어요', say: '가르쳐 주신 말을 모두 잊었어요.' }; }
        if (/(가르친|배운|가르쳐준)(거|것|말|내용)|뭐배웠|뭘배웠|배운게뭐/.test(t) && /보여|알려|뭐|목록|있어/.test(t)) {
            const m = teachAll(), ks = Object.keys(m), lm = learned(), lk = Object.keys(lm);
            if (!ks.length && !lk.length) return { h: '🎓 아직 배운 말이 없어요', l: ['「배고파라고 하면 밥 먹자라고 대답해」처럼 가르쳐 주세요'], say: '아직 배운 말이 없어요.' };
            return { h: `🎓 배운 말 ${ks.length + lk.length}개`, all: 1, items: ks.slice(-8).reverse().map(k => ({ h: '「' + m[k].q + '」', s: '→ ' + m[k].a })).concat(lk.slice(-4).reverse().map(k => ({ h: '「' + k + '」', s: '→ 「' + lm[k] + '」로 알아들음' }))), l: ['이 휴대폰에만 저장돼요 · 「가르친 거 다 잊어」로 지워요'], say: `${ks.length + lk.length}개를 배웠어요.` };
        }
        // 하나만 잊기: 「배고파 잊어」 「배고파는 지워 줘」
        const fg = /^(.{1,40}?)\s*(?:이라고|라고|이라는|라는|은|는|을|를)?\s*(?:말|거|것)?\s*(?:은|는|을|를)?\s*(?:잊어버려|잊어\s*줘|잊어|지워\s*줘|지워|삭제해\s*줘|삭제해)[.!~]*$/.exec(s.trim());
        if (fg) {
            const all = teachAll(), k = C(fg[1].replace(/[「」"']/g, ''));
            if (all[k]) { const q = all[k].q; delete all[k]; teachSave(all); return { h: '🧽 잊었어요', l: [`「${q}」에 가르쳐 주신 대답을 지웠어요`], say: `${q}에 가르쳐 주신 대답을 잊었어요.` }; }
        }
        const m = TEACHRE.exec(s.trim());
        if (!m) return null;
        const q = m[1].replace(/^(부캉아|내가|누가|만약|만약에)\s*/, '').replace(/[「」"']/g, '').trim(), a = m[2].replace(/[「」"']/g, '').trim();
        if (C(q).length < 1 || !a) return null;
        const all = teachAll(), ks = Object.keys(all); if (ks.length >= 200) delete all[ks[0]];
        all[C(q)] = { q, a }; teachSave(all);
        return { h: '🎓 배웠어요!', l: [`「${q}」라고 하면 → 「${a}」`, '이 휴대폰에만 기억해요 · 「가르친 거 보여 줘」'], say: `배웠어요! ${q}라고 하면 ${a}라고 대답할게요.`, btns: [{ t: '▶ 해 보기', fn: () => taught(C(q)) }] };
    }
    function taught(k) { const m = teachAll()[k]; return m ? { h: m.a, l: ['🎓 가르쳐 주신 대답이에요'], say: m.a } : null; }
    // 못 알아들은 말 적어 두기 → 하루에 한 번 묶어서 서버로 (v2.126.0 · 서버 v2.45.0 bkaMiss)
    //   · 누가 보냈는지는 안 보냄 · 선수 이름은 ○○○ 로 가림 · 긴 숫자나 비밀번호 같은 낱말이 든 말은 안 적음 · ⚙ 설정에서 끌 수 있음
    //   · 서버가 이 기능을 안다고 알려 준 뒤에만 보냄 (bootstrap 답의 bka → daeyeon_bka_srv)
    const MISSK = 'daeyeon_bka_miss', MISS_GAP = 20 * 60 * 60 * 1000;
    function missClean(v) {
        let q = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!q || /\d{3,}/.test(q) || /비밀번호|비번|암호|패스워드|인증번호|로그인코드|계좌/.test(C(q))) return '';
        try { D.players().forEach(p => { const n = String(p.name || '').trim(); if (n.length >= 2) { q = q.split(n).join('○○○'); if (n.length >= 3) q = q.split(n.slice(1)).join('○○'); } }); } catch (e) {}
        return C(q).length >= 2 ? q : '';
    }
    function missLoad() { try { const a = JSON.parse(localStorage.getItem(MISSK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function logMiss(s) {
        try {
            const q = missClean(s), k = C(q); if (!k) return;
            const a = missLoad(), f = a.find(x => x.k === k);
            if (f) f.n = Math.min(99, (f.n || 0) + 1); else a.push({ k, q, n: 1, u: 0 });
            while (a.length > 60) a.shift();
            localStorage.setItem(MISSK, JSON.stringify(a));
        } catch (e) {}
    }
    function missFlush() {
        try {
            if (opt.share === false || navigator.onLine === false) return;
            if (localStorage.getItem('daeyeon_bka_srv') !== '1') return;   // 서버가 받을 줄 알 때만 (bootstrap 답에서 확인)
            if (Date.now() - (Number(localStorage.getItem(MISSK + '_t')) || 0) < MISS_GAP) return;
            const a = missLoad(), d = [];
            a.forEach(x => { const n = (x.n || 0) - (x.u || 0), q = missClean(x.q); if (n > 0 && q && d.length < 30) d.push({ x, q, n: Math.min(n, 20) }); });
            if (!d.length) return;
            let url = '', key = '', tok = '';
            try { url = GOOGLE_SCRIPT_UNIFORM_API_URL; key = API_KEY; tok = getToken(); } catch (e) { return; }
            if (!url || !key || !tok) return;
            const text = JSON.stringify({ key, token: tok, action: 'bkaMiss', v: VER, d: d.map(o => [o.q, o.n]) });
            let ok = false;
            try { ok = !!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([text], { type: 'text/plain;charset=utf-8' }))); } catch (e) {}
            if (!ok) { try { fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text }).catch(() => {}); ok = true; } catch (e) {} }
            if (!ok) return;
            d.forEach(o => { o.x.u = o.x.n; });
            localStorage.setItem(MISSK, JSON.stringify(a));
            localStorage.setItem(MISSK + '_t', String(Date.now()));
        } catch (e) {}
    }
    // 앱을 내리거나 닫을 때 (하루에 한 번 · 보낼 것이 있을 때만)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') missFlush(); });
    window.addEventListener('pagehide', missFlush);

    // ----- 야구 용어 사전 -----
    let TIDX = null;
    function termIdx() {
        if (TIDX || !DATA) return TIDX;
        TIDX = { ex: {}, keys: [] };
        DATA.terms.forEach(x => x[1].split('|').forEach(k => { if (!TIDX.ex[k]) TIDX.ex[k] = x; TIDX.keys.push([k, x]); }));
        TIDX.keys.sort((a, b) => b[0].length - a[0].length);
        return TIDX;
    }
    const TDEF = /뭐야|뭐예요|뭐에요|뭐지|뭐죠|뭔데|뭐니|뭐냐|뭘까|뭡니까|무엇|뭔지|뭔가요|무슨뜻|무슨말|무슨의미|뜻|의미|설명|이란\??$|란\??$|어떤거|어떤뜻|차이|다른점|다른게|알아\??$|아니\??$|알고있|아세요|아시나요|궁금/;
    const TASK = /알려줘|알려줄|알려주|가르쳐|말해줘|얘기해줘/;
    const tSubj = t => t.toLowerCase().replace(/^(부캉아|부캉이|혹시|그럼|그러면|근데|그런데|그리고|너|넌|야구에서|야구할때|야구용어중에|야구용어|야구의|야구에|용어)+/, '');
    const tCut = x => x.replace(/(도대체|대체|정확히|좀)?(뭐야|뭐예요|뭐에요|뭐지|뭐죠|뭔데|뭐니|뭐냐|뭘까|뭡니까|무엇|뭔지|뭔가요|무슨|뜻|의미|설명|알려|가르쳐|말해줘|얘기해줘|궁금|어떤|알아\??$|아니\??$|알고있|아세요|아시나요|에대해|이란\??$|란\??$).*$/, '');
    const tPart = x => x.replace(/(이라는게|라는게|이라는건|라는건|이라는말|라는말|이라는|라는|이라고|라고|에대해서|에대해|이가|이|가|은|는|을|를|도|요)$/, '');
    function termLook(sub, loose) {
        const I = termIdx(); if (!I || !sub) return null;
        const PT = ['이라는게', '라는게', '이라는건', '라는건', '이라는말', '라는말', '이라는', '라는', '이라고', '라고', '에대해서', '에대해', '이가', '이', '가', '은', '는', '을', '를', '도', '요', '이요'];
        const cand = [sub]; PT.forEach(p => { if (sub.length > p.length && sub.endsWith(p)) cand.push(sub.slice(0, -p.length)); });
        cand.sort((a, b) => b.length - a.length);
        for (const c of cand) if (I.ex[c]) return { x: I.ex[c] };
        const base = tPart(sub) || sub;
        // 낱말이 안에 들어 있는지 (긴 것부터) — 엄격할 때는 말의 대부분이 그 낱말이어야
        for (const [k, x] of I.keys) { if (k.length < 2 || base.indexOf(k) < 0) continue; if (loose ? (k.length >= 3 || base.length <= k.length + 2) : k.length * 10 >= base.length * 6) return { x }; }
        // 비슷한 소리 (자모 기준)
        if (base.length >= 3 && /^[가-힣]+$/.test(base)) {
            const bj = jamo(base); let best = null, bd = 99;
            for (const [k, x] of I.keys) {
                if (k.length < 3 || Math.abs(k.length - base.length) > 1 || !/^[가-힣]+$/.test(k)) continue;
                const d = lev(bj, jamo(k)), lim = bj.length >= 12 ? 3 : bj.length >= 8 ? 2 : 1;
                if (d <= lim && d < bd) { bd = d; best = x; }
            }
            if (best) return { x: best, fz: 1 };
        }
        if (loose && base.length >= 4) { const f = fuzzyBest(base, DATA.terms, x => x[1].split('|').filter(k => k.length >= 4 && /^[가-힣]+$/.test(k))); if (f && f.length === 1) return { x: f[0].x, fz: 1 }; }
        return null;
    }
    const tTitle = x => x[2].replace(/\s*\(.*?\)/, '');
    function termCard(x, note) {
        ctx.term = x; ctx.again = termRandom;
        const me = tTitle(x), nm = y => tTitle(y);
        // 🔗 관련 용어: 풀이 글에 나오는 낱말 → 이 낱말이 나오는 풀이 → 같은 분류
        const rel = [];
        const add = y => { if (y !== x && rel.length < 3 && !rel.includes(y)) rel.push(y); };
        shuffle(DATA.terms.filter(y => nm(y).length >= 2 && x[3].includes(nm(y)))).forEach(add);
        if (me.length >= 2) shuffle(DATA.terms.filter(y => y[3].includes(me))).forEach(add);
        shuffle(DATA.terms.filter(y => y[0] === x[0])).forEach(add);
        return { h: '📖 ' + x[2], l: (note ? [note] : []).concat([x[3], DATA.cats[x[0]] || '']), btns: rel.map(r => ({ t: tTitle(r), fn: () => termCard(r) })).concat([{ t: '📚 용어 사전', fn: termMenu }]), say: `${jo(tTitle(x), '은', '는')} ${x[3]}` };
    }
    function termRandom() { return withData(() => termCard(bag('term', DATA.terms), '🎲 오늘의 야구 용어')); }
    function termMenu() {
        return withData(() => {
            const cs = Object.keys(DATA.cats);
            return { h: '📚 야구 용어 사전', l: [`모두 ${DATA.terms.length}개 · 「보크가 뭐야」처럼 물어보세요`], all: 1, items: cs.map(c => ({ h: DATA.cats[c], s: DATA.terms.filter(x => x[0] === c).length + '개', fn: () => termList(c, 0) })), btns: [{ t: '🎲 아무거나 하나', fn: termRandom }, { t: '❓ 용어 퀴즈', fn: () => quizStart('term') }], say: `야구 용어 ${DATA.terms.length}개를 알고 있어요. 궁금한 낱말을 말해 보세요.` };
        });
    }
    function termList(c, off) {
        const all = DATA.terms.filter(x => x[0] === c), page = all.slice(off, off + 10), more = off + 10 < all.length;
        ctx.list = more ? { kind: 'term', cat: c, off: off + 10 } : null;
        return { h: `${DATA.cats[c]} ${all.length}개`, l: [`${off + 1}~${off + page.length}번째${more ? ' · 「더 보여 줘」' : ''}`], all: 1, items: page.map(x => ({ h: tTitle(x), s: x[3].length > 26 ? x[3].slice(0, 26) + '…' : x[3], fn: () => termCard(x) })), btns: (more ? [{ t: '더 보기', fn: () => termList(c, off + 10) }] : []).concat([{ t: '📚 분류 보기', fn: termMenu }]), say: `${DATA.cats[c].replace(/^\S+ /, '')} 용어 ${all.length}개예요.` };
    }
    function termCompare(sub) {
        const parts = sub.replace(/(의|은|는|이|가)?(차이|다른점|다른게|차이점).*$/, '').split(/이랑|랑|하고|과|와|,|vs|대(?=[가-힣])/).map(p => p.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const a = termLook(parts[0], true), b = termLook(parts[1], true);
        if (!a || !b || a.x === b.x) return null;
        return { h: `📖 ${tTitle(a.x)} · ${tTitle(b.x)}`, l: [`▪ ${tTitle(a.x)}: ${a.x[3]}`, `▪ ${tTitle(b.x)}: ${b.x[3]}`], btns: [{ t: '📚 용어 사전', fn: termMenu }], say: `${jo(tTitle(a.x), '은', '는')} ${a.x[3]} ${jo(tTitle(b.x), '은', '는')} ${b.x[3]}` };
    }
    const CATW = [['R', /규칙|룰/], ['C', /판정|심판|카운트/], ['P', /포지션|사람/], ['B', /타격|타자|방망이/], ['T', /투구|투수|구종|변화구/], ['J', /주루|도루|주자/], ['S', /수비/], ['K', /기록|숫자/], ['G', /구장|장비|경기장|야구장/], ['Y', /유소년|리틀|어린이/], ['E', /훈련|연습/], ['L', /대회|리그|프로/]];
    // strict = 다른 일보다 먼저 볼 때 (뜻을 묻는 말만) · loose = 아무것도 못 알아들었을 때
    function terms4(s, t, loose) {
        if (/야구용어|용어사전|야구사전|용어목록|용어모음|야구낱말|^용어$|용어(알려|보여|가르|뭐있|종류)/.test(t) && !/퀴즈|문제|게임|맞히기|맞추기/.test(t)) {
            if (!DATA) return needData(s);
            const cw = CATW.find(c => c[1].test(t.replace(/야구|용어|사전/g, '')));
            return cw ? termList(cw[0], 0) : /하나|아무|랜덤|오늘/.test(t) ? termRandom() : termMenu();
        }
        if (/오늘의용어|용어하나|아무용어|랜덤용어/.test(t)) return termRandom();
        const def = TDEF.test(t), ask = TASK.test(t);
        if (!loose && !def) return null;
        if (!loose && /누구|명단|찾아|몇명|전화|연락처|주소|언제|어디|몇시|며칠/.test(t)) return null;
        if (!DATA) return ctx.re ? null : needData(s);
        const sub0 = tSubj(t);
        if (/차이|다른점|다른게|차이점/.test(sub0)) { const cp = termCompare(sub0); if (cp) return cp; }
        const sub = (def || ask) ? tCut(sub0) : sub0;
        const hit = termLook(sub, loose);
        if (hit) {
            if (!loose && hit.x[0] === 'P' && !/뭐야|뭐예요|뭐에요|뭐지|뭔데|뭐니|뭐냐|무슨|뜻|의미|설명|이란|란\??$|어떤/.test(t)) return null;   // 「투수 알아?」는 선수 찾기일 수 있음
            return termCard(hit.x, hit.fz ? `혹시 「${tTitle(hit.x)}」 말씀이세요?` : '');
        }
        return null;
    }
    function faq4(t) {
        if (!DATA || !DATA.faq) return null;
        for (const r of DATA.faq) { if (new RegExp(r[0]).test(t)) return { h: '⚾ ' + r[1], l: [r[2]], btns: [{ t: '📚 용어 사전', fn: termMenu }, { t: '❓ 야구 퀴즈', fn: () => think1('야구 퀴즈') }], say: r[2] }; }
        return null;
    }

    // ----- 가짓수 늘린 한마디들: 수수께끼 · 명언 · 속담 · 신기한 이야기 · 밸런스 게임 -----
    function joke() { ctx.again = joke; return withData(() => { const j = bag('joke', DATA.jokes); return { h: '😄 ' + j[0], l: ['👉 ' + j[1]], btns: [{ t: '😆 하나 더', fn: joke }, { t: '🤔 수수께끼', fn: riddle }], say: `${j[0]} ${j[1]}` }; }); }
    function fact() { ctx.again = fact; return withData(() => { const f = bag('fact', DATA.facts); return { h: '⚾ 야구 상식', l: [f], btns: [{ t: '하나 더', fn: fact }, { t: '❓ 야구 퀴즈', fn: () => think1('야구 퀴즈') }], say: f }; }); }
    function cheer() { ctx.again = cheer; return withData(() => { const c = bag('cheer', DATA.cheers); return { h: '📣 ' + c, btns: [{ t: '📣 하나 더', fn: cheer }], say: c }; }); }
    function funfact() { ctx.again = funfact; return withData(() => { const f = bag('fun', DATA.funfacts); return { h: '🔎 신기한 이야기', l: [f], btns: [{ t: '하나 더', fn: funfact }, { t: '💡 상식 퀴즈', fn: () => think1('상식 퀴즈') }], say: f }; }); }
    function quote() { ctx.again = quote; return withData(() => { const q = bag('quote', DATA.quotes); return { h: '✨ ' + q[0], l: ['— ' + q[1]], btns: [{ t: '하나 더', fn: quote }], say: `${q[0]} ${q[1].replace(/\(.*?\)/, '')}의 말이에요.` }; }); }
    function proverb() { ctx.again = proverb; return withData(() => { const p = bag('prov', DATA.proverbs); return { h: '📜 ' + p[0], l: [p[1]], btns: [{ t: '하나 더', fn: proverb }], say: `${p[0]}. ${p[1]}` }; }); }
    function riddle() {
        ctx.again = riddle;
        return withData(() => {
            const r = bag('rid', DATA.riddles);
            ctx.game = { type: 'rid', q: r[0], a: r[1], n: 0 };
            return { h: '🤔 ' + r[0], l: ['답을 말해 보세요 · 「힌트」 「정답」 「그만」'], btns: [{ t: '💡 정답 보기', fn: () => ridEnd(ctx.game && ctx.game.type === 'rid' ? ctx.game : { q: r[0], a: r[1] }, null) }], say: r[0] };
        });
    }
    function ridEnd(g, ok) {
        ctx.game = null; ctx.again = riddle;
        return { h: (ok ? '⭕ 정답! ' : '💡 정답은 ') + g.a, l: [g.q], btns: [{ t: '🤔 하나 더', fn: riddle }, { t: '😄 농담', fn: joke }], say: ok ? `정답! ${g.a}!` : `정답은 ${g.a}${hasJong(g.a.replace(/\s*\(.*$/, '')) ? '이에요' : '예요'}.` };
    }
    function ridTurn(g, s, t) {
        const ans = C(g.a.replace(/\(.*?\)/g, ''));
        if (/^(정답|답|모르겠|몰라|포기|패스|알려줘|답알려|정답알려|뭐야|뭔데)/.test(t)) return ridEnd(g, null);
        if (/^힌트/.test(t)) { const a0 = g.a.replace(/\s*\(.*$/, ''); return { h: `💡 ${a0.length}글자 · 「${a0[0]}」로 시작해요`, l: [g.q], say: `${a0.length}글자예요.` }; }
        if (ans && (t.indexOf(ans) >= 0 || (ans.length >= 2 && ans.indexOf(t) >= 0 && t.length >= Math.ceil(ans.length * 0.6)))) return ridEnd(g, true);
        if (/운세|날씨|일정|경기|공지|당번|놀자|농담|웃긴|상식|용어|퀴즈|뭐야|알려줘|틀어|열어|보여|몇시|며칠/.test(t)) { ctx.game = null; return null; }   // 다른 일을 시키면 수수께끼는 끝
        g.n++;
        if (g.n >= 3) return ridEnd(g, null);
        return { h: bag('ridno', ['땡! 다시 생각해 보세요', '아쉬워요, 한 번 더!', '음, 그건 아니에요']), l: [g.q, '「힌트」 「정답」이라고 해도 돼요'], say: '땡! 다시 생각해 보세요.', miss: 1 };
    }
    function balance() {
        ctx.again = balance;
        return withData(() => {
            const b = bag('bal', DATA.balance);
            ctx.game = { type: 'bal', a: b[0], b: b[1] };
            return { h: `⚖️ ${b[0]} 🆚 ${b[1]}`, l: ['둘 중에 하나를 골라 주세요'], all: 1, items: [{ h: b[0], ask: b[0] }, { h: b[1], ask: b[1] }], say: `${b[0]}, ${b[1]}! 둘 중에 뭐가 좋아요?` };
        });
    }
    function balTurn(g, s, t) {
        const a = C(g.a), b = C(g.b);
        let pick = t.indexOf(a) >= 0 && t.indexOf(b) < 0 ? g.a : t.indexOf(b) >= 0 && t.indexOf(a) < 0 ? g.b : /^(1번|일번|첫|앞|전자|하나)/.test(t) ? g.a : /^(2번|이번|두번|둘째|뒤|후자|둘$)/.test(t) ? g.b : '';
        ctx.game = null; ctx.again = balance;
        const btns = [{ t: '⚖️ 하나 더', fn: balance }, { t: '🎮 다른 놀이', fn: gameMenu }];
        if (!pick) { if (/둘다|다좋|모두|전부/.test(t)) return { h: '😆 욕심쟁이! 둘 다 좋죠', btns, say: '욕심쟁이! 둘 다 좋죠.' }; if (/몰라|모르겠|글쎄|어려워|못고르/.test(t)) return { h: '🤔 어렵죠? 부캉이도 못 고르겠어요', btns, say: '어렵죠? 저도 못 고르겠어요.' }; return null; }   // 다른 말을 하면 놀이를 끝내고 그 말을 듣는다
        const x = bag('balre', [`오, ${pick}! 저도 같은 생각이에요.`, `${pick} 좋죠! 부캉이도 한 표.`, `역시 ${pick}! 취향이 멋져요.`, `저는 반대였는데, 듣고 보니 ${pick}도 좋네요.`, `${pick}! 이유가 궁금해지는걸요.`]);
        return { h: '⚖️ ' + x, btns, say: x };
    }
    // 오늘의 운세 (여러 조각을 짜 맞춤 · 같은 날 같은 사람에게는 같은 운세)
    function fortune() {
        return withData(() => {
            const d = today0(), h = hash(ymd(d) + '|' + userName()), pick = (a, k) => a[(Math.floor(h / k) + h) % a.length];
            const main = pick(DATA.fortune, 1), adv = pick(DATA.fadvice, 7), item = pick(DATA.fitem, 13), food = pick(DATA.ffood, 17), pos = pick(DATA.fpos, 19), col = pick(DATA.colors, 23), no = h % 99 + 1, star = '★'.repeat(3 + h % 3) + '☆'.repeat(2 - h % 3);
            return { h: `🔮 ${d.getMonth() + 1}월 ${d.getDate()}일 오늘의 운세 ${star}`, l: [main, `🍀 행운의 등번호 ${no}번 · 색 ${col} · 포지션 ${pos}`, `🎒 행운의 물건 ${item} · 음식 ${food}`, `💡 ${adv}`, '재미로만 봐 주세요 😊'], btns: [{ t: '🎱 로또 번호', fn: lotto }, { t: '✨ 오늘의 한마디', fn: quote }], say: `${main} 행운의 등번호는 ${no}번, 행운의 색은 ${col}이에요. ${adv}` };
        });
    }
    // 자료에 든 일상 대화 (아무것도 못 알아들었을 때 마지막으로 살펴봄)
    let TALK2 = null;
    function talk2(t) {
        if (!DATA || !DATA.talk) return null;
        if (!TALK2) TALK2 = DATA.talk.map(r => { try { return [new RegExp(r[0], 'i'), r[1]]; } catch (e) { return null; } }).filter(Boolean);
        for (let i = 0; i < TALK2.length; i++) if (TALK2[i][0].test(t)) return { i, a: TALK2[i][1] };
        return null;
    }
    function talkAns(t) { const r = talk2(t); if (!r) return null; const x = bag('t2_' + r.i, r.a); return { h: x, say: sayOf(x) }; }

    // ---------- 📦 부캉이 준비 상태 (v2.127.0 · 하코 선택 B + C) ----------
    //   · B: 부캉이 이름 아래 「✓ 준비 완료 · 두뇌 v…」 배지 (휴대폰은 부캉이 얼굴에 ✓ 점) — 누르면 자세히
    //   · C: 처음 한 번 「부캉이 준비하기」 ① 두뇌 자료 ② 「부캉아」 엔진(선택, 진행 %) ③ 소리 시험 ④ 마이크 허락 → 「✓ 준비 끝 · 버전」
    //   · 받았는지는 앱 저장본(sw.js 의 caches)을 보고 앎 · 우리 서버는 안 씀
    const DATA_VER = '2.125.0', READY = 'daeyeon_bka_ready';
    const ENGINE = [['vendor/ort/ort.wasm.min.js?v=1.22.0', 48327], ['vendor/ort/ort-wasm-simd-threaded.mjs', 20856], ['vendor/ort/ort-wasm-simd-threaded.wasm', 11210254], ['kws/melspectrogram.onnx', 1087958], ['kws/embedding_model.onnx', 1326578], ['kws/templates.json', 57390]];
    const ENG_MB = (ENGINE.reduce((t, x) => t + x[1], 0) / 1048576).toFixed(1);
    const rdGet = () => { try { return JSON.parse(localStorage.getItem(READY) || 'null') || {}; } catch (e) { return {}; } };
    const rdSet = o => { try { localStorage.setItem(READY, JSON.stringify(Object.assign(rdGet(), o))); } catch (e) {} };
    const appVer = () => { try { return String(APP_VERSION).split('·')[0].trim(); } catch (e) { return ''; } };
    let rdLast = null;
    async function inCache(u) {
        try {
            if (!window.caches) return null;
            const href = new URL(u, location.href).href;
            return !!((await caches.match(href)) || (await caches.match(href, { ignoreSearch: true })));
        } catch (e) { return null; }
    }
    async function micState() { try { return (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) { return ''; } }
    async function rdState() {
        const dataC = await inCache('bukang-data.js?v=' + DATA_VER);
        const eng = await Promise.all(ENGINE.map(x => inCache(x[0])));
        const vs = koVoices();
        const s = {
            data: !!DATA || !!dataC, terms: DATA && DATA.terms ? DATA.terms.length : 0,
            eng: eng.every(Boolean) || !!V('bkReady'), engSome: eng.some(Boolean), bkOn: !!V('bkOn'),
            voices: vs.length, voice: vs.length ? (((opt.vuri && vs.find(v => v.voiceURI === opt.vuri)) || vs.find(v => /google|female|여/i.test(v.name)) || vs[0]).name) : '',
            mic: SR ? await micState() : 'none', heard: rdGet().heard, tts: ttsLog.err
        };
        s.warn = !s.data ? '⬇ 두뇌 자료 받기 전' : s.tts && s.tts !== 'interrupted' ? '! 소리 확인 필요' : s.mic === 'denied' ? '! 마이크 막힘' : s.bkOn && !s.eng ? '! 「부캉아」 엔진 받기 전' : rdGet().heard === 0 ? '! 소리가 안 들렸어요' : !s.voices && rdGet().heard !== 1 ? '! 한국어 목소리 확인' : '';
        rdLast = s; return s;
    }
    function rdBadge() {   // 이름 아래 배지 · 휴대폰 부캉이 점
        rdState().then(s => {
            const ok = !s.warn, txt = ok ? `✓ 준비 완료 · 두뇌 v${DATA_VER}` : s.warn;
            const b = $('bkaRd'); if (b) { b.textContent = txt; b.className = 'bka-rd' + (ok ? '' : ' w'); b.hidden = false; }
            if (fab) { let d = fab.querySelector('.bka-dot'); if (!d) { d = document.createElement('span'); d.className = 'bka-dot'; d.setAttribute('aria-hidden', 'true'); fab.appendChild(d); } d.textContent = ok ? '✓' : '!'; d.classList.toggle('w', !ok); }
            const bb = bc && bc.querySelector('.bka-rd'); if (bb) { bb.textContent = txt + (ok ? ' · 앱 ' + appVer() : ''); bb.className = 'bka-rd' + (ok ? '' : ' w'); }
        }).catch(() => {});
    }
    const ck = (st, t, sub, id) => `<div class="bka-ck ${st}"${id ? ` id="${id}"` : ''}><span class="ic">${st === 'ok' ? '✓' : st === 'w' ? '!' : st === 'no' ? '·' : '…'}</span><span class="tx">${esc(t)}<small>${esc(sub)}</small></span></div>`;
    function rdList(s) {
        return ck(s.data ? 'ok' : 'w', '두뇌 자료', s.data ? `v${DATA_VER}${s.terms ? ' · 야구 용어 ' + s.terms + '개' : ''} · 약 180KB 받음` : '아직 안 받음 · 「⬇ 다시 받기」를 눌러 주세요')
            + ck(s.eng ? 'ok' : s.bkOn ? 'w' : 'no', '「부캉아」 엔진', s.eng ? `약 ${ENG_MB}MB 받음 · 이 기기에 저장됨` : s.bkOn ? `「부캉아」가 켜져 있는데 아직 안 받음 (약 ${ENG_MB}MB)` : `안 받음 · 「부캉아」로 부를 때만 필요해요 (약 ${ENG_MB}MB)`)
            + ck((s.voices || s.heard === 1) ? (s.tts ? 'w' : 'ok') : 'w', '한국어 목소리', !s.voices && s.heard === 1 ? '휴대폰 기본 목소리 · 소리 확인함' : s.voices ? `휴대폰 목소리 「${s.voice}」 · ${voiceNow()[1]}${s.tts ? ' · 마지막 읽기 실패(' + s.tts + ')' : s.heard ? ' · 소리 확인함' : ''}` : '휴대폰에 한국어 읽기 목소리가 없어요 · 아래 「🔊 소리 시험」으로 확인')
            + ck(s.mic === 'granted' ? 'ok' : s.mic === 'denied' ? 'w' : s.mic === 'none' ? 'no' : 'no', '마이크', s.mic === 'granted' ? '허락됨' : s.mic === 'denied' ? '막혀 있어요 · 주소창 왼쪽 자물쇠 → 마이크 허용' : s.mic === 'none' ? '이 기기에서는 말로 묻기를 못 써요' : '처음 말로 물을 때 허락을 물어요');
    }
    function readyCard() {
        if (mode === 'bub') open(true);
        return { h: '📦 부캉이 준비 상태', l: [`앱 ${appVer()} · 두뇌 v${DATA_VER}`], wait: () => loadData().catch(() => {}).then(rdState).then(s => ({
            h: '📦 부캉이 준비 상태', dd: appVer(), l: [s.warn ? s.warn.replace(/^[!⬇] /, '확인할 것: ') : '모두 준비됐어요'],
            html: `<div class="bka-cks">${rdList(s)}</div>`,
            btns: [{ t: '🔊 소리 시험', pri: 1, fn: soundTest }, { t: '⬇ 다시 받기', fn: reget }, { t: '🦉 처음 준비하기 다시', fn: prepCard }],
            say: s.warn ? '확인할 것이 있어요. ' + s.warn.replace(/^[!⬇] /, '') : '부캉이는 모두 준비됐어요.'
        })) };
    }
    function soundTest() {
        speak('안녕하세요, 부캉이예요. 제 목소리가 들리나요?');
        return { h: '🔊 소리가 들렸나요?', l: ['「안녕하세요, 부캉이예요」가 들려야 해요'], btns: [
            { t: '👍 들려요', pri: 1, fn: () => { rdSet({ heard: 1 }); rdBadge(); return { h: '좋아요! 소리는 잘 나와요', l: ['말로 물으면 대답을 읽어 드려요'] }; } },
            { t: '👎 안 들려요', fn: () => { rdSet({ heard: 0 }); rdBadge(); return noSoundTips(); } }] };
    }
    function noSoundTips() {
        const e = ttsLog.err;
        return { h: '이렇게 해 보세요', l: [
            '① 휴대폰 옆 소리 버튼으로 「미디어 소리」를 키워요 (벨소리 말고)',
            '② 아이폰은 옆 무음 스위치 · 무음 모드를 꺼요',
            '③ 블루투스 이어폰 · 차에 연결돼 있으면 그쪽으로 나가요',
            '④ 안드로이드: 설정 → 일반 → 텍스트 음성 변환(TTS) → 한국어 음성 데이터 설치',
            '⑤ 「목소리 바꿔 줘」 → 「휴대폰 원래 목소리」로 바꿔 보기'
        ].concat(e ? ['기록: 마지막 읽기 실패 「' + e + '」'] : [], koVoices().length ? [] : ['이 휴대폰에서 한국어 목소리를 못 찾았어요 → ④ 를 먼저 해 주세요']),
            btns: [{ t: '🔊 다시 들어 보기', pri: 1, fn: soundTest }, { t: '🗣 목소리 바꾸기', fn: () => voiceTalk('목소리', '목소리') }] };
    }
    // 파일 하나 받기 (진행 % 알림) — 앱 저장본(sw.js)이 지나가면서 저장해 둠
    async function getFile(u, size, onp) {
        const r = await fetch(u, { cache: 'reload' });
        if (!r.ok) throw new Error('받기 실패 ' + r.status);
        if (!r.body || !r.body.getReader) { await r.arrayBuffer(); onp(size); return; }
        const rd = r.body.getReader(); let got = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; onp(Math.min(got, size)); }
    }
    async function getEngine(onp) {
        const tot = ENGINE.reduce((t, x) => t + x[1], 0); let base = 0;
        for (const [u, n] of ENGINE) {
            if (!(await inCache(u))) await getFile(u, n, g => onp((base + g) / tot));
            base += n; onp(base / tot);
        }
    }
    function reget() {
        if (mode === 'bub') open(true);
        return { h: '⬇ 다시 받는 중…', wait: async () => {
            try {
                if (window.caches) { const c = await caches.keys(); for (const k of c) { const ca = await caches.open(k); for (const [u] of ENGINE.concat([['bukang-data.js?v=' + DATA_VER]])) await ca.delete(new URL(u, location.href).href, { ignoreSearch: true }); } }
                DATA = null; dataP = null; await loadData();
                const engWas = !!V('bkOn') || rdGet().eng;
                if (engWas) await getEngine(() => {});
                rdBadge();
                return readyCard().wait();
            } catch (e) { return { h: '다시 받지 못했어요', l: ['인터넷 연결을 확인하고 다시 해 주세요', String(e && e.message || e).slice(0, 60)] }; }
        } };
    }
    // C: 처음 준비하기 (단계 카드가 그 자리에서 바뀜)
    let prepId = 0;
    function prepCard() {
        if (mode === 'bub') open(true);
        const id = 'bkaPrep' + (++prepId), $p = k => document.getElementById(id + k);
        const set = (k, st, t, sub) => { const el = $p(k); if (el) el.outerHTML = ck(st, t, sub, id + k); };
        const btns = html => { const el = $p('b'); if (el) el.innerHTML = html; };
        const B = (t, fn, cls) => `<button type="button" class="${cls || 'sec'}" data-k="${reg(() => { const r = call(fn); if (r && !r.then) bot(r); })}">${esc(t)}</button>`;
        let heard = null;
        const finish = () => {
            rdSet({ v: appVer(), at: Date.now(), done: 1 });
            const el = $p('d'); if (el) { el.hidden = false; el.textContent = `✓ 준비 끝! 앱 ${appVer()} · 두뇌 v${DATA_VER}`; }
            btns(''); rdBadge();
            if (opt.say) speak('준비 끝! 이제 무엇이든 물어보세요.');
        };
        const stepMic = () => {
            set('4', 'run', '④ 마이크 허락', '말로 물어보려면 필요해요 · 휴대폰이 물어보면 「허용」');
            if (!SR || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { set('4', 'no', '④ 마이크', '이 기기에서는 말로 묻기를 못 써요 · 글자로 물어보세요'); finish(); return; }
            btns(B('🎤 허락하기', () => {
                navigator.mediaDevices.getUserMedia({ audio: true }).then(st => { st.getTracks().forEach(t => t.stop()); set('4', 'ok', '④ 마이크', '허락됨'); if (rdGet().eng && !V('bkOn')) { V('bkSet', true); } finish(); },
                    () => { set('4', 'w', '④ 마이크', '허락이 안 됐어요 · 주소창 왼쪽 자물쇠 → 마이크 허용'); finish(); });
            }, 'pri') + B('건너뛰기', () => { set('4', 'no', '④ 마이크', '건너뜀 · 처음 말로 물을 때 다시 물어요'); finish(); }));
        };
        const stepSound = () => {
            set('3', 'run', '③ 소리 시험', '「안녕하세요, 부캉이예요」가 들리면 「들려요」');
            speak('안녕하세요, 부캉이예요. 제 목소리가 들리나요?');
            btns(B('👍 들려요', () => { heard = 1; rdSet({ heard: 1 }); set('3', 'ok', '③ 소리 시험', '잘 들려요 · ' + voiceNow()[1]); stepMic(); }, 'pri')
                + B('👎 안 들려요', () => { heard = 0; rdSet({ heard: 0 }); set('3', 'w', '③ 소리 시험', '안 들림 · 끝나고 「이렇게 해 보세요」를 볼게요'); bot(noSoundTips(), true); stepMic(); })
                + B('🔊 다시', () => speak('안녕하세요, 부캉이예요. 제 목소리가 들리나요?')));
        };
        const stepEng = async () => {
            const has = (await Promise.all(ENGINE.map(x => inCache(x[0])))).every(Boolean);
            if (has) { rdSet({ eng: 1 }); set('2', 'ok', '② 「부캉아」 엔진', `약 ${ENG_MB}MB · 이미 받아 있어요`); stepSound(); return; }
            if (!SR) { set('2', 'no', '② 「부캉아」 엔진', '이 기기에서는 「부캉아」 부르기를 못 써요'); stepSound(); return; }
            set('2', 'run', '② 「부캉아」 엔진 받기 (선택)', `「부캉아」로 손 안 대고 부르려면 필요해요 · 약 ${ENG_MB}MB · 와이파이 추천`);
            btns(B(`⬇ 받기 (${ENG_MB}MB)`, async () => {
                btns('');
                try {
                    await getEngine(f => { const p = Math.round(f * 100); set('2', 'run', `② 「부캉아」 엔진 받는 중 · ${p}%`, `약 ${ENG_MB}MB 중 ${(f * ENG_MB).toFixed(1)}MB`); const el = $p('2'); if (el) el.querySelector('.tx').insertAdjacentHTML('beforeend', `<span class="bka-prog"><i style="width:${p}%"></i></span>`); });
                    rdSet({ eng: 1 }); set('2', 'ok', '② 「부캉아」 엔진', `약 ${ENG_MB}MB 받음 · 이 기기에 저장됨`);
                } catch (e) { set('2', 'w', '② 「부캉아」 엔진', '받지 못했어요 · 나중에 ⚙ 에서 다시 받을 수 있어요'); }
                stepSound();
            }, 'pri') + B('나중에', () => { set('2', 'no', '② 「부캉아」 엔진', '안 받음 · 「부캉아」를 켤 때 받아요'); stepSound(); }));
        };
        const start = () => {
            loadData().then(() => { set('1', 'ok', '① 두뇌 자료', `v${DATA_VER} · 야구 용어 ${DATA.terms.length}개 · 약 180KB 받음`); stepEng(); },
                () => { set('1', 'w', '① 두뇌 자료', '받지 못했어요 · 인터넷 연결을 확인해 주세요'); btns(B('🔄 다시', start, 'pri') + B('나중에 하기', later)); });
        };
        const later = () => { rdSet({ later: Date.now() }); btns(''); const el = $p('d'); if (el) { el.hidden = false; el.textContent = '언제든 「부캉이 준비하기」라고 말하면 다시 해요'; } };
        setTimeout(start, 50);
        return { h: '🦉 부캉이 준비하기 (처음 한 번)', l: ['받은 것과 소리 · 마이크를 차례로 확인해요'],
            html: `<div class="bka-cks">${ck('run', '① 두뇌 자료 받기', '받는 중…', id + '1')}${ck('no', '② 「부캉아」 엔진 (선택)', '「부캉아」로 손 안 대고 부를 때만', id + '2')}${ck('no', '③ 소리 시험', '부캉이 목소리가 들리는지', id + '3')}${ck('no', '④ 마이크 허락', '말로 물어보려면', id + '4')}</div><div class="bka-bt" id="${id}b">${B('나중에 하기', later)}</div><div class="bka-done" id="${id}d" hidden></div>`,
            say: '처음 한 번, 부캉이 준비를 같이 해요.' };
    }

    // ---------- 화면 ----------
    let pan = null, ov = null, bodyEl = null, inp = null, micB = null, stEl = null;
    let isOpenNow = false, rec = null, listening = false, viaVoice = false, enrolling = false;
    let waitN = 0, quietTill = 0;   // v2.126.2: 받아 오는 답 수 · 이 시각까지는 「부캉아」 마이크를 쉬게 함
    // v2.122.0 휴대폰 말풍선 (시안 A): mode 'pan' = 큰 창(태블릿 · PC · 대화 기록), 'bub' = 왼쪽 아래 부캉이 + 말풍선
    let mode = '', bub = null, fab = null, bq = null, bc = null, bst = null, bubHas = false;
    let followMode = false, pendFollow = false, followN = 0, speaking = false, folT = 0;
    const phone = () => innerWidth < 760;
    const acts = [];
    const CHIPS = [['📅 다음 경기', '다음 경기 언제야'], ['🌤 날씨', '오늘 날씨'], ['🎮 놀이', '놀자'], ['🗓 이번 주 일정', '이번 주 일정'], ['🏆 지난 경기', '지난 경기 결과'], ['🏟 길찾기', '다음 경기 어디야'], ['👥 선수 찾기', ''], ['📢 새 공지', '새 공지 있어'], ['🧹 내 당번', '내 당번 언제야'], ['🎵 주제곡 틀기', '전체 주제곡 틀어'], ['⚾ 타석 모드', '타석 모드 열어'], ['❓ 할 수 있는 일', '뭐 할 수 있어']];
    function build() {
        if (pan) return;
        ov = document.createElement('div'); ov.className = 'bka-ov'; ov.hidden = true; ov.addEventListener('click', close);
        pan = document.createElement('div'); pan.className = 'bka-pan'; pan.hidden = true;
        pan.setAttribute('role', 'dialog'); pan.setAttribute('aria-label', '부캉이 비서');
        pan.innerHTML = `<div class="bka-hd"><i class="bka-bk" aria-hidden="true"></i><div class="bka-tt"><b>부캉이</b><small id="bkaSt"></small><button type="button" id="bkaRd" class="bka-rd" data-a="rd" hidden></button></div>
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
        const bl = bdayLine();
        bc.innerHTML = `<div class="h">${bl ? esc(bl) : '무엇이든 물어보세요 🦉'}</div><button type="button" class="bka-rd" data-k="${reg(() => bot(readyCard()))}">준비 상태 보는 중…</button><div class="l">${SR ? '부캉이를 누르고 말하거나 아래에서 골라요' : '아래에서 고르거나 글자로 적어요'}</div>
            <div class="bka-bchips">${bl ? `<button type="button" data-k="${reg(() => ask('생일 축하해', false))}">🎉 축하하기</button>` : ''}${qs.map(c => `<button type="button" data-k="${reg(() => ask(c[1], false))}">${esc(c[0])}</button>`).join('')}<button type="button" data-k="${reg(() => { open(true); setTimeout(() => { if (inp) inp.focus(); }, 60); })}">⌨ 글자로 적기</button></div>`;
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
    function bdayLine() {
        let bd = []; try { bd = birthdayPlayersToday(); } catch (e) {}
        const who = bd.map(p => p.name + ' 선수').concat(famToday());
        return who.length ? `🎂 오늘은 ${who.join(', ')} 생일이에요!` : '';
    }
    function hello() {
        const bl = bdayLine();
        if (bl) bot({ h: bl, l: ['「생일 축하해」라고 말해 보세요 🎉'], btns: [{ t: '🎉 축하하기', pri: 1, fn: () => think1('생일 축하해') }] }, true);
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
        if (a.html && !lim) h += a.html;   // v2.127.0: 준비 상태 · 준비하기 체크 목록 (우리가 만든 글만 · esc 거침)
        else if (a.html) h += '<button type="button" class="bka-bmore" data-b="log">자세히 보기 ›</button>';
        const its = a.items || [], bts = a.btns || [];
        if (lim && a.all && lim.items) lim = Object.assign({}, lim, { items: 12 });
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
        if (a.say && !a.force) ctx.lastSay = a.say;
        const byeA = (a.multi || [a]).some(x => x && x.bye);
        if (!noSay && a.say && ((opt.say && (viaVoice || a.force)) || a.force === 2)) speak(a.say, () => { afterSay(); if (byeA) setTimeout(close, 250); });
        else if (byeA) setTimeout(close, a.say ? 1600 : 900);
        // 밖에서 받아 오는 답(날씨 · 위치 · 처음 받는 놀이 자료): 「알아보는 중…」을 먼저 보여 주고, 오면 바꿔 그림
        const ws = (a.multi || [a]).filter(x => x && x.wait);
        if (ws.length) {
            const node = a.multi ? null : bodyEl.lastElementChild;
            ws.forEach(x => {
                const w = x.wait; x.wait = null; x.pending = 1; waitN++;
                Promise.resolve().then(w).catch(e => { console.warn('부캉이 비서:', e); return FAIL(); }).then(r => {
                    waitN = Math.max(0, waitN - 1); if (!waitN) V('bkKick', 1200);
                    if (node && node.parentNode) node.remove();
                    if (!r || !isOpenNow) return;
                    bot(r); runAll(r); armFollow(r);
                });
            });
        }
    }
    // 🔊 v2.126.2: 크롬 소리 삼킴 막기 — ① 읽는 중일 때만 멈추고 잠깐 쉰 뒤 말하기 ② 멈춰 있으면 resume ③ 긴 글은 문장으로 나눠 읽기(크롬 15초 끊김)
    //   · 마지막 결과를 ttsLog 에 남겨 「부캉이 상태」에서 보여 줌 (ok · error 이름 · 목소리)
    const ttsLog = { n: 0, ok: 0, err: '', at: 0, voice: '' };
    function chunks(t) {
        const out = []; let cur = '';
        (String(t).match(/[^.!?]+[.!?]*\s*/g) || [String(t)]).forEach(p => {   // 문장 끝(. ! ?)에서 나눔 (옛 아이폰 때문에 뒤돌아보기 정규식은 안 씀)
            if ((cur + ' ' + p).trim().length > 110 && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + ' ' + p).trim();
        });
        if (cur) out.push(cur);
        return out.length ? out : [String(t)];
    }
    let spkTok = 0;
    function speak(text, done) {
        const tok = ++spkTok;
        let fin = false; const end = () => { if (fin) return; fin = true; if (tok === spkTok) { speaking = false; quietTill = Date.now() + 700; V('bkKick', 900); } clearTimeout(st); V('duck', false); if (done) done(); };
        let st = 0;
        try {
            if (!window.speechSynthesis) { ttsLog.err = 'no-tts'; return; }
            const clean = String(text).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/[·→]/g, ', ');
            const busy = speechSynthesis.speaking || speechSynthesis.pending;
            if (busy) speechSynthesis.cancel();
            const vp = voiceNow(), vs = koVoices();
            const vo = vs.length ? ((opt.vuri && vs.find(v => v.voiceURI === opt.vuri)) || vs.find(v => /google|female|여/i.test(v.name)) || vs[0]) : null;
            const parts = chunks(clean);
            V('duck', true); speaking = true; ttsLog.n++; ttsLog.at = Date.now(); ttsLog.voice = vo ? vo.name : '(기본)';
            st = setTimeout(end, 2500 + clean.length * 170);   // onend 가 안 오는 기기 대비
            const go = () => {
                if (tok !== spkTok) return;
                try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) {}
                parts.forEach((p, k) => {
                    const u = new SpeechSynthesisUtterance(p);
                    u.lang = 'ko-KR'; u.pitch = vp[2]; u.rate = vp[3]; if (vo) { try { u.voice = vo; } catch (e) {} }
                    if (k === 0) u.onstart = () => { ttsLog.ok++; ttsLog.err = ''; };
                    u.onerror = e => { const er = (e && e.error) || 'error'; if (er !== 'interrupted' && er !== 'canceled') ttsLog.err = er; if (k === parts.length - 1 || er !== 'interrupted') end(); };
                    if (k === parts.length - 1) u.onend = end;
                    speechSynthesis.speak(u);
                });
            };
            if (busy) setTimeout(go, 120); else go();
        } catch (e) { ttsLog.err = String(e && e.message || e).slice(0, 40); end(); }
    }
    // 이어서 말하기 (휴대폰 말풍선): 대답을 읽고 나면 몇 초 동안 다시 들음 · 조용하면 쉼
    function wantFollow(a) {
        if (mode !== 'bub' || !viaVoice || !SR || !a) return false;
        const list = a.multi || [a];
        if (list.some(x => x && (x.quiet || x.raw || x.pending || x.bye))) return false;   // 노래 트는 중 · 설정 화면 · 아직 받아 오는 중
        if (V('playing')) return false;
        return followN < (ctx.game ? 80 : 6);   // 놀이 중에는 계속 주고받기
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
        if (voice) quietTill = Date.now() + 1500;   // 생각하고 말하기 시작할 때까지 「부캉아」 마이크는 쉼
        me(text);
        let a = null;
        try { a = think(text); } catch (e) { console.warn('부캉이 비서 생각 실패:', e); a = { h: '앗, 잠깐 문제가 생겼어요', l: ['다시 말해 주세요'] }; }
        pendFollow = false;
        bot(a);
        runAll(a);
        armFollow(a);
        if (voice && !speaking && !waitN) V('bkKick', 1700);   // 소리 없이 끝난 대답이면 쉼이 끝난 뒤 「부캉아」 다시 기다림
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
        else if (a === 'rd') bot(readyCard());
        else if (a === 'bk') { const on = !V('bkOn'); V('bkSet', on); bot({ h: on ? '「부캉아」 부르기를 켰어요' : '「부캉아」 부르기를 껐어요', l: on ? ['처음 한 번은 약 14MB를 받아요 (와이파이 추천)', '화면이 켜져 있을 때 어느 탭에서든 들어요'] : [] }); setSt(''); }
        else if (a === 'say') { opt.say = !opt.say; saveOpt(); bot({ h: opt.say ? '말로 물으면 대답을 소리로 읽어 드려요' : '대답을 소리로 읽지 않아요' }); }
        else if (a === 'share') { opt.share = opt.share === false; saveOpt(); bot({ h: opt.share ? '못 알아들은 말을 부캉이 공부에 보태요' : '못 알아들은 말을 보내지 않아요', l: opt.share ? ['누가 한 말인지는 보내지 않아요 · 선수 이름은 가려요'] : ['이 휴대폰에만 남아요'] }); }
        else if (a === 'voice') bot(voiceTalk('목소리', '목소리'));
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
                <div class="r"><span>🗣 부캉이 목소리<small>${esc(voiceNow()[1])} · ${esc(voiceNow()[4])}</small></span><button type="button" class="sw" data-a="voice">바꾸기</button></div>
                <div class="r"><span>🔊 대답 읽어 주기<small>말로 물었을 때만 읽어요</small></span><button type="button" class="sw${opt.say ? ' on' : ''}" data-a="say" role="switch" aria-checked="${opt.say}">${opt.say ? '켜짐' : '꺼짐'}</button></div>
                <div class="r"><span>📦 준비 상태<small>앱 ${esc(appVer())} · 두뇌 v${DATA_VER} · 받은 것 · 소리 시험</small></span><button type="button" class="sw" data-a="rd">보기</button></div>
                <div class="r"><span>📮 못 알아들은 말 보태기<small>이름 없이 모아 부캉이를 더 똑똑하게 해요</small></span><button type="button" class="sw${opt.share !== false ? ' on' : ''}" data-a="share" role="switch" aria-checked="${opt.share !== false}">${opt.share !== false ? '켜짐' : '꺼짐'}</button></div></div>`);
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
        build(); if (!DATA) loadData().catch(() => {});   // 용어 · 대화 자료를 미리 받아 둠
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
        rdBadge();
        if (!prepShown && !wakeOpen) { const r = rdGet(); if (!r.done && !r.later && D.authed()) { prepShown = true; setTimeout(() => bot(prepCard(), true), 300); } }
        wakeOpen = false;
    }
    let prepShown = false, wakeOpen = false;   // 처음 준비하기는 손으로 열었을 때 한 번만 (「부캉아」로 열면 바로 듣기)
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
        busy: () => listening || enrolling || speaking || waitN > 0 || Date.now() < quietTill,   // v2.126.2: 대답을 읽는 중 · 받아 오는 중에도 「부캉아」 마이크를 다시 켜지 않음 (켜면 안드로이드가 소리를 끔)
        mode: () => mode,
        wake: () => { if (!D.authed()) return; wakeOpen = true; open(); if (!listening) listen(); }
    };
})();
