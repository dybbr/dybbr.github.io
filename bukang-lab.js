// ==========================================================
// 🧪 부캉이 실험실 (개발자 전용 · v2.132.0) — 작은 생성 AI(Qwen) 를 기기 안에서 돌려 보는 시험용
//   · 개발자로 로그인했을 때만 bukang-ai.js 가 이 파일을 불러옴 (학부모 화면에서는 받지도 않음)
//   · 모델은 Hugging Face 에서 기기로 바로 받고 브라우저 저장소(transformers-cache)에 둠 — 우리 서버(앱스 스크립트) 호출 없음
//   · 계산은 WebGPU(있으면) → 없으면 WASM(느림). 엔진: Transformers.js 4.3.2 (vendor/tjs)
//   · 평소 대화: 규칙 · 뜻 두뇌가 모를 때만 고른 모델이 2문장 안으로 짧게 지어서 답함 (걸러서)
// ==========================================================
(function () {
    'use strict';
    const VER = '2.132.0';
    const LS = 'daeyeon_bka_lab';
    const TJS = 'vendor/tjs/';
    const MODELS = [
        { id: 'q25-05', fam: 'Qwen2.5', n: 'Qwen2.5 · 0.5B', s: '2.5·0.5B', repo: 'onnx-community/Qwen2.5-0.5B-Instruct' },
        { id: 'q25-15', fam: 'Qwen2.5', n: 'Qwen2.5 · 1.5B', s: '2.5·1.5B', repo: 'onnx-community/Qwen2.5-1.5B-Instruct' },
        { id: 'q3-06', fam: 'Qwen3', n: 'Qwen3 · 0.6B', s: '3·0.6B', repo: 'onnx-community/Qwen3-0.6B-ONNX', think: 1 },
        { id: 'q3-17', fam: 'Qwen3', n: 'Qwen3 · 1.7B', s: '3·1.7B', repo: 'onnx-community/Qwen3-1.7B-ONNX', think: 1 },
        { id: 'q35-08', fam: 'Qwen3.5', n: 'Qwen3.5 · 0.8B (최신)', s: '3.5·0.8B', repo: 'onnx-community/Qwen3.5-0.8B-ONNX', think: 1 }
    ];
    const byId = id => MODELS.find(m => m.id === id) || null;
    // 한국어 20문제 — 답에 낱말 하나라도 있고 한글로 답하면 1점
    const QUIZ = [
        ['야구에서 스트라이크 세 개면 어떻게 돼?', /아웃|삼진/], ['야구는 한 팀에 몇 명이 수비해?', /9|아홉/], ['우리나라 수도는 어디야?', /서울/],
        ['7 곱하기 8은 얼마야?', /56|오십육|쉰여섯/], ['일주일은 며칠이야?', /7|칠일|일곱/], ['물이 얼면 무엇이 돼?', /얼음/],
        ['무지개는 몇 가지 색이야?', /7|일곱/], ['투수가 서서 공을 던지는 흙 언덕을 뭐라고 해?', /마운드/], ['야구공을 치는 도구 이름은?', /배트|방망이/],
        ['포수가 공을 받을 때 끼는 장갑은?', /미트|글러브|글로브/], ['한 이닝에 아웃이 세 개면 어떻게 돼?', /공수|교대|바뀌|바꿔|끝나/], ['부산이 연고지인 프로야구 팀은?', /롯데|자이언츠/],
        ['여름 다음에 오는 계절은?', /가을/], ['하루는 몇 시간이야?', /24|스물네/], ['고양이는 어떻게 울어?', /야옹|냐옹/],
        ['해는 어느 쪽에서 떠?', /동쪽/], ['운동하기 전에 무엇을 하면 좋아?', /스트레칭|준비\s*운동|몸\s*풀/], ['더운 날 운동할 때 꼭 챙겨야 하는 것은?', /물|수분|모자|그늘/],
        ['야구에서 1루, 2루, 3루를 돌고 마지막에 밟는 곳은?', /홈/], ['솔로 홈런을 치면 몇 점이 나?', /1\s*점|한\s*점/]
    ];
    const SYS = '너는 대연초등학교 야구부 도우미 「부캉이」야. 초등학생과 학부모에게 한국어 존댓말로, 쉬운 말로 1~2문장만 짧게 답해. 모르는 것은 모른다고 말해. 경기 일정 · 선수 명단 · 전화번호 · 주소 같은 정보는 지어내지 말고 「사이트의 일정 · 명단 탭을 확인해 주세요」라고 말해.';
    // 아이들용 거르기: 나쁜 말 · 개인정보 꼴 · 링크가 나오면 대답을 버림
    const BAD = /씨발|시발|ㅅㅂ|병신|ㅂㅅ|개새|좆|존나|섹스|성관계|야동|포르노|마약|자살|죽여|살인|총기|도박|담배|술 마|fuck|shit|sex|porn|kill/i;
    const PII = /\d{2,3}-\d{3,4}-\d{4}|01[016789]\s?\d{3,4}\s?\d{4}|https?:\/\/|www\.|@[a-z0-9-]+\.[a-z]/i;
    const ASK_NO = /전화번호|연락처|주소|비밀번호|비번|계좌|주민|로그인|개인정보/;

    const st = (function () { try { return Object.assign({ use: '', res: {} }, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { return { use: '', res: {} }; } })();
    const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} };
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const base = () => { try { return new URL('.', document.baseURI).href; } catch (e) { return location.origin + '/'; } };

    // ---------- 엔진 ----------
    let T = null, tP = null, gpu = null, gpuP = null;
    function tjs() {
        if (T) return Promise.resolve(T);
        return tP || (tP = import(base() + TJS + 'transformers.min.js?v=4.3.2').then(m => {
            T = m; const env = m.env;
            env.allowLocalModels = false; env.useBrowserCache = true;
            try { env.backends.onnx.wasm.wasmPaths = { mjs: base() + TJS + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: base() + TJS + 'ort-wasm-simd-threaded.asyncify.wasm' }; } catch (e) {}
            try { env.backends.onnx.wasm.numThreads = (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1); } catch (e) {}
            return m;
        }, e => { tP = null; throw e; }));
    }
    function gpuInfo() {
        if (gpu) return Promise.resolve(gpu);
        return gpuP || (gpuP = (async () => {
            try {
                if (!navigator.gpu) return (gpu = { ok: false, why: '이 브라우저는 WebGPU 없음' });
                const a = await navigator.gpu.requestAdapter();
                if (!a) return (gpu = { ok: false, why: 'WebGPU 어댑터 없음' });
                return (gpu = { ok: true, f16: a.features && a.features.has('shader-f16') });
            } catch (e) { return (gpu = { ok: false, why: 'WebGPU 오류' }); }
        })());
    }
    const dtypeFor = g => g.ok ? (g.f16 ? 'q4f16' : 'q4') : 'q4';
    let cur = null;   // { id, tok, model, dev, dtype }
    let loading = null;
    async function load(id, onp) {
        if (cur && cur.id === id) return cur;
        if (loading && loading.id === id) return loading.p;
        const m = byId(id); if (!m) throw new Error('모델 없음');
        const p = (async () => {
            const [tj, g] = await Promise.all([tjs(), gpuInfo()]);
            if (cur) { try { await cur.model.dispose(); } catch (e) {} cur = null; }
            const files = {}; let shown = 0;
            const cb = x => {
                if (!onp || !x) return;
                if (x.status === 'progress' && x.file) { files[x.file] = [x.loaded || 0, x.total || 0]; }
                if (x.status === 'done' && x.file && files[x.file]) files[x.file][0] = files[x.file][1];
                let l = 0, t = 0; Object.values(files).forEach(v => { l += v[0]; t += v[1]; });
                const now = Date.now(); if (now - shown < 200 && x.status === 'progress') return; shown = now;
                onp(t ? l / t : 0, t);
            };
            const t0 = performance.now();
            const dev = g.ok ? 'webgpu' : 'wasm', dtype = dtypeFor(g);
            const tok = await tj.AutoTokenizer.from_pretrained(m.repo, { progress_callback: cb });
            let model;
            try { model = await tj.AutoModelForCausalLM.from_pretrained(m.repo, { dtype, device: dev, progress_callback: cb }); }
            catch (e) { if (dev === 'webgpu') model = await tj.AutoModelForCausalLM.from_pretrained(m.repo, { dtype: 'q4', device: 'wasm', progress_callback: cb }); else throw e; }
            let bytes = 0; Object.values(files).forEach(v => { bytes += v[1]; });
            cur = { id, tok, model, dev: model && model.sessions ? dev : dev, dtype, loadMs: Math.round(performance.now() - t0), bytes };
            const r = st.res[id] || (st.res[id] = {}); r.load = cur.loadMs; if (bytes) r.mb = Math.round(bytes / 1048576); r.dev = dev; r.dtype = dtype; save();
            return cur;
        })();
        loading = { id, p };
        try { return await p; } finally { if (loading && loading.p === p) loading = null; }
    }
    function clean(txt, m) {
        let s = String(txt || '');
        s = s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').replace(/<\|[^>]*\|>/g, '').trim();
        s = s.replace(/[*#`>_]{1,3}/g, '').replace(/\s+/g, ' ').trim();
        const parts = s.match(/[^.!?。]+[.!?。]?/g) || [s];
        s = parts.slice(0, 2).join(' ').trim();
        if (s.length > 140) s = s.slice(0, 138).replace(/\s\S*$/, '') + '…';
        return s;
    }
    const korean = s => { const h = (s.match(/[가-힣]/g) || []).length, a = (s.match(/[A-Za-z一-龥]/g) || []).length; return h >= 4 && h >= a; };
    // 한 번 대답 — { text, raw, ms, firstMs, toks, cps, ok }
    async function gen(q, onTxt) {
        if (!cur) throw new Error('모델을 먼저 골라 주세요');
        const m = byId(cur.id), tj = T;
        const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: String(q).slice(0, 200) }];
        let prompt;
        try { prompt = cur.tok.apply_chat_template(msgs, { tokenize: false, add_generation_prompt: true, enable_thinking: false }); }
        catch (e) { prompt = cur.tok.apply_chat_template(msgs, { tokenize: false, add_generation_prompt: true }); }
        if (m.think && !/<think>/.test(prompt.slice(-40))) prompt += '<think>\n\n</think>\n\n';   // 생각 모드 끄기(템플릿이 안 넣어 줄 때)
        const ins = cur.tok(prompt);
        let out = '', first = 0, n = 0; const t0 = performance.now();
        const streamer = new tj.TextStreamer(cur.tok, { skip_prompt: true, skip_special_tokens: true, callback_function: t => { if (!first) first = performance.now() - t0; n++; out += t; if (onTxt) onTxt(clean(out, m)); } });
        await cur.model.generate(Object.assign({}, ins, { max_new_tokens: 90, do_sample: false, repetition_penalty: 1.15, streamer }));
        const ms = performance.now() - t0, text = clean(out, m);
        const ok = !!text && korean(text) && !BAD.test(text) && !PII.test(text);
        return { text: ok ? text : '', raw: out, ms: Math.round(ms), firstMs: Math.round(first), toks: n, cps: text ? +(text.length / (ms / 1000)).toFixed(1) : 0, ok };
    }
    // 평소 대화에서 부르는 곳 (bukang-ai.js) — 못 하면 null
    async function answer(q, upd) {
        if (!st.use || ASK_NO.test(q) || BAD.test(q)) return null;
        const m = byId(st.use); if (!m) return null;
        if (!cur || cur.id !== st.use) await load(st.use, f => upd && upd(`🧪 ${m.n} 준비 중… ${Math.round(f * 100)}%`));
        const r = await gen(q, t => upd && t && upd('🧪 ' + t.slice(0, 40)));
        if (!r.text) return null;
        return { text: r.text, tag: `🧪 ${m.n.replace(' (최신)', '')}가 지은 답 · ${(r.ms / 1000).toFixed(1)}초 · 틀릴 수 있어요` };
    }
    async function has(id) {
        const m = byId(id); if (!m) return false;
        try { const c = await caches.open('transformers-cache'); const ks = await c.keys(); return ks.some(k => k.url.indexOf(m.repo + '/') >= 0 && /\.onnx/.test(k.url)); } catch (e) { return false; }
    }
    async function drop(id) {
        const m = byId(id); if (!m) return;
        if (cur && cur.id === id) { try { await cur.model.dispose(); } catch (e) {} cur = null; }
        try { const c = await caches.open('transformers-cache'); const ks = await c.keys(); await Promise.all(ks.filter(k => k.url.indexOf(m.repo + '/') >= 0).map(k => c.delete(k))); } catch (e) {}
        if (st.use === id) st.use = '';
        delete st.res[id]; save();
    }
    async function quiz(id, onp) {
        await load(id, f => onp && onp(`받는 중 ${Math.round(f * 100)}%`));
        let ok = 0, ms = 0, ch = 0; const rows = [];
        for (let i = 0; i < QUIZ.length; i++) {
            if (onp) onp(`문제 ${i + 1}/${QUIZ.length}`);
            let r; try { r = await gen(QUIZ[i][0]); } catch (e) { r = { text: '', raw: String(e && e.message || e), ms: 0 }; }
            const hit = !!r.text && QUIZ[i][1].test(r.text);
            if (hit) ok++; ms += r.ms; ch += (r.text || '').length;
            rows.push([QUIZ[i][0], r.text || ('(버림) ' + String(r.raw || '').slice(0, 40)), hit]);
        }
        const res = st.res[id] || (st.res[id] = {});
        res.score = ok; res.avg = Math.round(ms / QUIZ.length); res.cps = ms ? +(ch / (ms / 1000)).toFixed(1) : 0; res.at = new Date().toISOString().slice(0, 16).replace('T', ' '); res.rows = rows; save();
        return res;
    }

    // ---------- 화면 (C안: 따로 여는 실험실 창) ----------
    let box = null, tab = 'm', busy = false;
    const gb = b => b >= 1024 ? (b / 1024).toFixed(1) + 'GB' : b + 'MB';
    function table() {
        const ks = MODELS.filter(m => st.res[m.id] && st.res[m.id].score != null);
        const best = ks.slice().sort((a, b) => (st.res[b.id].score - st.res[a.id].score) || (st.res[b.id].cps - st.res[a.id].cps))[0];
        return `<div class="bka-ltw"><table class="bka-lt"><tr><th>모델</th><th>받기</th><th>첫 로딩</th><th>답 속도</th><th>점수</th></tr>${MODELS.map(m => { const r = st.res[m.id] || {};
            return `<tr class="${best && best.id === m.id ? 'best' : ''}"><td>${esc(m.n.replace(' (최신)', ''))}${r.dev ? `<small>${r.dev === 'webgpu' ? 'GPU' : 'CPU'} · ${esc(r.dtype || '')}</small>` : ''}</td><td>${r.mb ? gb(r.mb) : '—'}</td><td>${r.load ? (r.load / 1000).toFixed(1) + '초' : '—'}</td><td>${r.cps ? r.cps + '자/초' : '—'}</td><td>${r.score != null ? r.score + '/20' : '—'}</td></tr>`; }).join('')}</table></div>
            <div class="bka-snote">이 기기에서 잰 값이에요 · 첫 로딩은 처음 받을 때 받는 시간까지 들어가요 · 점수: 한글로 답하고 정답 낱말이 들어 있으면 1점</div>`;
    }
    function paint() {
        if (!box) return;
        const bd = box.querySelector('.bd'), pick = box.querySelector('.pick'), inr = box.querySelector('.in');
        box.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
        pick.hidden = tab !== 'c'; inr.hidden = tab !== 'c';
        pick.innerHTML = MODELS.map(m => `<button type="button" data-p="${m.id}" class="${(cur && cur.id === m.id) || (!cur && st.use === m.id) ? 'on' : ''}">${esc(m.s)}${cur && cur.id === m.id ? ' ✓' : ''}</button>`).join('');
        if (tab === 'm') {
            gpuInfo().then(g => {
                Promise.all(MODELS.map(m => has(m.id))).then(hs => {
                    if (tab !== 'm') return;
                    let h = `<div class="gpu${g.ok ? '' : ' no'}">${g.ok ? `⚡ WebGPU 켜짐${g.f16 ? '' : ' (f16 없음 · q4)'} · 이 기기 안에서만 계산 (우리 서버 안 씀)` : `🐢 ${esc(g.why)} → 느린 방식(WASM)으로 돌아요`}</div>
                        <div class="r"><span>평소 대화에서 모를 때 답하기<small>${st.use ? esc(byId(st.use).n) + ' 이 짧게 지어서 답해요' : '꺼짐 · 아래에서 「쓰기」를 누르면 켜져요'}</small></span>${st.use ? '<button type="button" class="sw" data-x="off">끄기</button>' : ''}</div>`;
                    let last = '';
                    MODELS.forEach((m, i) => {
                        if (m.fam !== last) { h += `<div class="fam">${m.fam}</div>`; last = m.fam; }
                        const r = st.res[m.id] || {}, on = st.use === m.id;
                        h += `<div class="m${on ? ' on' : ''}"><div class="t"><b>${esc(m.n)}</b><small>${r.mb ? gb(r.mb) + ' · ' : ''}${on ? '✓ 평소 대화에 쓰는 중' : hs[i] ? '받아 둠' : '안 받음'}</small></div>${hs[i] ? `<button type="button" class="del" data-d="${m.id}" aria-label="지우기">🗑</button>` : ''}<button type="button" data-u="${m.id}">${on ? '쓰는 중' : hs[i] ? '쓰기' : '⬇ 받기'}</button></div>`;
                    });
                    h += '<div class="bka-snote">받는 곳: Hugging Face · 와이파이에서 받기 추천 · 1GB 넘는 모델은 휴대폰에서 느리거나 멈출 수 있어요</div><div class="prog" hidden></div>';
                    bd.innerHTML = h;
                });
            });
        } else if (tab === 't') {
            bd.innerHTML = `<div class="bka-card"><div class="h">🧪 시험표 · 한국어 20문제</div>${table()}<div class="row">${MODELS.map(m => `<button type="button" data-q="${m.id}">▶ ${esc(m.s)}</button>`).join('')}</div><div class="prog" hidden></div></div>
                ${MODELS.filter(m => st.res[m.id] && st.res[m.id].rows).map(m => `<details class="ans"><summary>${esc(m.n)} 답 보기 (${st.res[m.id].score}/20 · ${esc(st.res[m.id].at || '')})</summary>${st.res[m.id].rows.map(r => `<div class="${r[2] ? 'o' : 'x'}">${r[2] ? '⭕' : '❌'} ${esc(r[0])}<br><small>${esc(r[1])}</small></div>`).join('')}</details>`).join('')}`;
        } else if (tab === 'c' && !bd.querySelector('.chat')) {
            bd.innerHTML = '<div class="bka-snote">규칙 · 뜻 두뇌를 거치지 않고 위에서 고른 모델에게만 물어요. 처음 고를 때는 받는 시간이 걸려요.</div>';
        }
    }
    function prog(t) { const p = box && box.querySelector('.bd .prog'); if (p) { p.hidden = !t; p.textContent = t || ''; } }
    async function run(fn) {
        if (busy) return; busy = true; box.classList.add('busy');
        try { await fn(); } catch (e) { prog('⚠ ' + String(e && e.message || e).slice(0, 120)); busy = false; box.classList.remove('busy'); return; }
        busy = false; box.classList.remove('busy'); paint();
    }
    function onClick(e) {
        const b = e.target.closest('button'); if (!b || !box.contains(b)) return;
        if (b.dataset.close != null) return close();
        if (b.dataset.t) { tab = b.dataset.t; return paint(); }
        if (busy) return;
        if (b.dataset.x === 'off') { st.use = ''; save(); return paint(); }
        if (b.dataset.u) { const id = b.dataset.u; return run(async () => { prog('준비 중…'); await load(id, (f, t) => prog(`⬇ ${byId(id).n} ${Math.round(f * 100)}%${t ? ' · ' + gb(Math.round(t / 1048576)) : ''}`)); st.use = id; save(); prog(''); }); }
        if (b.dataset.d) { const id = b.dataset.d; return run(async () => { await drop(id); }); }
        if (b.dataset.q) { const id = b.dataset.q; return run(async () => { await quiz(id, t => prog(`${byId(id).n} · ${t}`)); }); }
        if (b.dataset.p) { const id = b.dataset.p; return run(async () => { const bd = box.querySelector('.bd'); bd.insertAdjacentHTML('beforeend', `<div class="bka-snote" data-l>⬇ ${esc(byId(id).n)} 준비 중…</div>`); const l = bd.lastElementChild; await load(id, (f, t) => { l.textContent = `⬇ ${byId(id).n} ${Math.round(f * 100)}%${t ? ' · ' + gb(Math.round(t / 1048576)) : ''}`; }); l.textContent = `✓ ${byId(id).n} 준비 끝 · ${(cur.loadMs / 1000).toFixed(1)}초 · ${cur.dev === 'webgpu' ? 'GPU' : 'CPU'}`; }); }
    }
    function ask(q) {
        if (!q || busy) return;
        const bd = box.querySelector('.bd');
        bd.insertAdjacentHTML('beforeend', `<div class="chat q">${esc(q)}</div><div class="chat a">…</div>`);
        const a = bd.lastElementChild; bd.scrollTop = bd.scrollHeight;
        run(async () => {
            if (!cur) { const id = st.use || MODELS[0].id; await load(id, f => { a.textContent = `⬇ ${byId(id).n} ${Math.round(f * 100)}%`; }); }
            const r = await gen(q, t => { a.textContent = t || '…'; bd.scrollTop = bd.scrollHeight; });
            const m = byId(cur.id);
            a.innerHTML = `${esc(r.text || '(걸러서 버렸어요) ' + String(r.raw).slice(0, 80))}<br><span class="bka-gen">${esc(m.s)} · 첫 글자 ${(r.firstMs / 1000).toFixed(1)}초 · 전체 ${(r.ms / 1000).toFixed(1)}초 · ${(r.text || '').length}자 · ${cur.dev === 'webgpu' ? 'GPU' : 'CPU'}</span>`;
            bd.scrollTop = bd.scrollHeight;
        }).then(() => { tab = 'c'; });
    }
    function css() {
        if (document.getElementById('bkaLabCss')) return;
        const c = document.createElement('style'); c.id = 'bkaLabCss';
        c.textContent = `.bka-labx{position:absolute;inset:0;background:#f8fafc;z-index:5;display:flex;flex-direction:column;color:#0f172a}
.bka-labx[hidden]{display:none}
.bka-labx .hd{display:flex;align-items:center;gap:8px;padding:14px;border-bottom:1px solid #e2e8f0;background:#fff}
.bka-labx .hd b{flex:1;font-size:17px}
.bka-labx button{font:inherit;cursor:pointer}
.bka-labx .hd button{border:0;border-radius:10px;background:#eef2f7;padding:8px 12px;font-weight:800}
.bka-labx .tabs{display:flex;gap:4px;margin:10px 14px 0;background:#eef2f7;border-radius:12px;padding:4px}
.bka-labx .tabs button{flex:1;border:0;border-radius:9px;padding:8px 2px;font-weight:900;font-size:13px;background:none;color:#334155}
.bka-labx .tabs button.on{background:#0b2240;color:#fff}
.bka-labx .pick{display:flex;gap:6px;overflow-x:auto;padding:10px 14px 0;overscroll-behavior:contain}
.bka-labx .pick[hidden],.bka-labx .in[hidden]{display:none}
.bka-labx .pick button{border:0;border-radius:999px;background:#eef2f7;padding:6px 11px;font-size:12.5px;font-weight:800;white-space:nowrap;color:#0f172a}
.bka-labx .pick button.on{background:#7c3aed;color:#fff}
.bka-labx .bd{flex:1;overflow:auto;padding:12px 14px;overscroll-behavior:contain;display:flex;flex-direction:column;gap:6px}
.bka-labx .gpu{font-size:12.5px;font-weight:800;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:6px 10px}
.bka-labx .gpu.no{color:#92400e;background:#fffbeb;border-color:#fde68a}
.bka-labx .r{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px}
.bka-labx .r span{flex:1;font-weight:800;font-size:14px}.bka-labx .r small{display:block;font-weight:600;color:#64748b;font-size:12px}
.bka-labx .sw{border:0;border-radius:999px;padding:7px 12px;font-weight:800;font-size:13px;background:#eef2f7;color:#0b2240}
.bka-labx .fam{font-size:11.5px;font-weight:900;color:#64748b;margin:6px 2px 0}
.bka-labx .m{display:flex;align-items:center;gap:8px;border:2px solid #e2e8f0;border-radius:14px;padding:8px 10px;background:#fff}
.bka-labx .m.on{border-color:#16a34a;background:#f0fdf4}
.bka-labx .m .t{flex:1;min-width:0}.bka-labx .m b{display:block;font-size:14px}.bka-labx .m small{display:block;font-size:12px;color:#64748b;font-weight:700}
.bka-labx .m button{border:0;border-radius:10px;padding:8px 10px;font-weight:900;font-size:12.5px;background:#0b2240;color:#fff;white-space:nowrap}
.bka-labx .m.on button{background:#dcfce7;color:#166534}.bka-labx .m button.del{background:#fee2e2;color:#b91c1c;padding:8px}
.bka-labx .prog{font-size:13px;font-weight:800;color:#7c3aed;background:#f5f3ff;border-radius:10px;padding:8px 10px}
.bka-labx .prog[hidden]{display:none}
.bka-labx.busy .m button,.bka-labx.busy .row button{opacity:.5}
.bka-labx .bka-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px 12px}
.bka-labx .bka-card .h{font-weight:900;font-size:15px}
.bka-labx .row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.bka-labx .row button{border:0;border-radius:999px;background:#7c3aed;color:#fff;padding:6px 11px;font-size:12.5px;font-weight:800}
.bka-ltw{overflow-x:auto}
.bka-lt{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}
.bka-lt th,.bka-lt td{border-bottom:1px solid #e2e8f0;padding:6px 4px;text-align:right;white-space:nowrap}
.bka-lt th:first-child,.bka-lt td:first-child{text-align:left;white-space:normal}
.bka-lt td small{display:block;font-size:10.5px;color:#64748b}
.bka-lt th{font-size:11.5px;color:#64748b}
.bka-lt tr.best td{background:#fffbeb;font-weight:800}
.bka-labx .bka-snote{font-size:12px;font-weight:700;color:#64748b;margin-top:4px}
.bka-labx details.ans{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px;font-size:13px}
.bka-labx details.ans summary{font-weight:800;cursor:pointer}
.bka-labx details.ans div{padding:5px 0;border-top:1px dashed #e2e8f0}.bka-labx details.ans small{color:#475569}
.bka-labx .chat{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px 12px;font-size:14px;max-width:88%;word-break:keep-all;overflow-wrap:anywhere}
.bka-labx .chat.q{background:#0b2240;color:#fff;align-self:flex-end}
.bka-gen{margin-top:6px;font-size:11.5px;font-weight:800;color:#7c3aed;background:#f5f3ff;border-radius:8px;padding:3px 8px;display:inline-block}
.bka-labx .in{display:flex;gap:6px;padding:10px 14px;border-top:1px solid #e2e8f0;background:#fff}
.bka-labx .in input{flex:1;min-width:0;border:2px solid #cbd5e1;border-radius:999px;padding:10px 14px;font:inherit;font-size:16px}
.bka-labx .in button{border:0;border-radius:999px;background:#7c3aed;color:#fff;padding:0 16px;font-weight:900}`;
        document.head.appendChild(c);
    }
    function open(pan) {
        if (!pan) return;
        css();
        if (box && box.parentNode === pan) { box.hidden = false; paint(); return; }
        box = document.createElement('div'); box.className = 'bka-labx'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '실험실');
        box.innerHTML = `<div class="hd"><b>🧪 실험실 (개발자만)</b><button type="button" data-close>닫기</button></div>
            <div class="tabs"><button type="button" data-t="m">모델</button><button type="button" data-t="t">시험표</button><button type="button" data-t="c">대화해 보기</button></div>
            <div class="pick" hidden></div><div class="bd"></div>
            <form class="in" hidden autocomplete="off"><input type="text" enterkeyhint="send" placeholder="Qwen 에게만 물어보기 (규칙 안 거침)"><button type="submit" aria-label="보내기">➤</button></form>`;
        pan.appendChild(box);
        box.addEventListener('click', onClick);
        box.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const i = box.querySelector('.in input'); const v = i.value.trim(); i.value = ''; ask(v); });
        tab = 'm'; paint();
    }
    function close() { if (box) box.hidden = true; }
    window.BKA_LAB = { VER, open, close, answer, isOpen: () => !!(box && !box.hidden), use: () => st.use, models: MODELS, _st: st, _load: load, _gen: gen, _quiz: quiz };
})();
