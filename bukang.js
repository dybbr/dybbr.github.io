// ==========================================================
// 🦉 「부캉아」 호출어 듣기 (v2.119.0) — 휴대폰 안에서만 소리를 분석해 「부캉아」를 찾음 (띵 소리 없음 · 서버 · 가입 · 키 없음)
//   · 소리 → 멜 스펙트로그램 → 음성 특징(96칸, 0.08초마다) 을 만들어, 미리 등록한 「부캉아」 본보기(최근 0.64초)와 얼마나 닮았는지 잼
//   · 본보기: 타입캐스트 여러 목소리로 만든 기본 14개(kws/templates.json) + 「내 목소리 등록」으로 녹음한 것(이 기기에만 저장)
//   · 모델: openWakeWord 의 melspectrogram.onnx · embedding_model.onnx (CC BY-NC-SA 4.0, 비영리 사용) · 실행기: onnxruntime-web 1.22 (MIT)
//   · 처음 켤 때 약 14MB 를 받음 (이후엔 기기에 저장된 것을 씀) · playlist.js 가 필요할 때만 이 파일을 불러옴
// ==========================================================
window.BukangKWS = (function () {
    'use strict';
    const ORT = 'vendor/ort/', KWS = 'kws/';
    const HOP = 1280, WIN = 12800, W = 8, D = 96, SR = 16000;
    const ME_KEY = 'daeyeon_bk_me';           // 내 목소리 본보기 (이 기기에만)
    let readyP = null, melS = null, embS = null;
    let base = [], mine = [], TH = 0.13, TH_ME = 0.13;
    let ctx = null, stream = null, srcNode = null, proc = null, sink = null;
    let running = false, onWake = null, onChunk = null, busy = false, cool = 0;
    const buf = new Float32Array(WIN);        // 최근 0.8초 소리
    let E = [];                               // 최근 음성 특징 W개
    let last = { d: 1, at: 0 };

    function loadScript(src) {
        return new Promise((res, rej) => {
            if (window.ort) { res(); return; }
            const s = document.createElement('script');
            s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + src));
            document.head.appendChild(s);
        });
    }
    function b64f32(b64) {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Float32Array(u.buffer);
    }
    function f32b64(f) {
        const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let s = '';
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return btoa(s);
    }
    function loadMine() {
        mine = [];
        try {
            const j = JSON.parse(localStorage.getItem(ME_KEY) || '[]');
            if (Array.isArray(j)) j.forEach(b => { const f = b64f32(b); if (f.length === W * D) mine.push(f); });
        } catch (e) {}
    }
    function saveMine() { try { localStorage.setItem(ME_KEY, JSON.stringify(mine.map(f32b64))); } catch (e) {} }

    function init() {
        if (readyP) return readyP;
        readyP = (async () => {
            await loadScript(ORT + 'ort.wasm.min.js?v=1.22.0');
            const ort = window.ort;
            ort.env.wasm.wasmPaths = new URL(ORT, location.href).href;
            ort.env.wasm.numThreads = 1;
            const opt = { executionProviders: ['wasm'] };
            melS = await ort.InferenceSession.create(KWS + 'melspectrogram.onnx', opt);
            embS = await ort.InferenceSession.create(KWS + 'embedding_model.onnx', opt);
            const tj = await (await fetch(KWS + 'templates.json')).json();
            const all = b64f32(tj.t);
            base = [];
            for (let i = 0; i + W * D <= all.length; i += W * D) base.push(all.slice(i, i + W * D));
            if (tj.th) TH = tj.th;
            loadMine();
        })();
        readyP.catch(() => { readyP = null; });
        return readyP;
    }
    // 0.8초 소리 → 음성 특징 1개 (96칸, 길이 1로 맞춤)
    async function feat(win) {
        const ort = window.ort;
        const mo = await melS.run({ [melS.inputNames[0]]: new ort.Tensor('float32', win, [1, WIN]) });
        const m = mo[melS.outputNames[0]].data;           // [1,1,T,32]
        const T = m.length / 32, from = (T - 76) * 32;
        const x = new Float32Array(76 * 32);
        for (let i = 0; i < x.length; i++) x[i] = m[from + i] / 10 + 2;
        const eo = await embS.run({ [embS.inputNames[0]]: new ort.Tensor('float32', x, [1, 76, 32, 1]) });
        const e = Float32Array.from(eo[embS.outputNames[0]].data);
        let n = 0; for (let i = 0; i < D; i++) n += e[i] * e[i];
        n = Math.sqrt(n) + 1e-6; for (let i = 0; i < D; i++) e[i] /= n;
        return e;
    }
    function distTo(T) {   // 최근 W개 특징 ↔ 본보기: 1 - 평균 닮음 (0 = 똑같음)
        let s = 0;
        for (let r = 0; r < W; r++) { const e = E[r], o = r * D; for (let i = 0; i < D; i++) s += e[i] * T[o + i]; }
        return 1 - s / W;
    }
    function best() {
        let d = 9, me = false;
        for (const t of base) { const v = distTo(t); if (v < d) d = v; }
        for (const t of mine) { const v = distTo(t); if (v < d) { d = v; me = true; } }
        return { d, me };
    }
    const Q = [];   // 아직 계산 못 한 소리 칸 (순서대로 다 계산해야 특징이 이어짐)
    async function pushChunk(c) {   // 새 소리 0.08초
        Q.push(c);
        if (Q.length > 12) { Q.splice(0, Q.length - 1); E = []; }   // 1초 넘게 밀리면(느린 기기) 쌓인 것은 버리고 새로 시작
        if (busy) return;
        busy = true;
        try {
            while (Q.length && running) {
                const ch = Q.shift();
                buf.copyWithin(0, HOP); buf.set(ch, WIN - HOP);
                const e = await feat(buf.slice());
                E.push(e); if (E.length > W) E.shift();
                if (E.length === W && running) {
                    const b = best(); last = { d: b.d, at: Date.now() };
                    if (b.d < (b.me ? TH_ME : TH) && Date.now() > cool) {
                        cool = Date.now() + 2500; E = []; Q.length = 0;
                        if (onWake) try { onWake(b); } catch (er) {}
                    }
                }
            }
        } catch (er) { console.warn('부캉아 계산 실패', er); }
        busy = false;
    }
    const WORKLET = `class P extends AudioWorkletProcessor{constructor(o){super();this.r=o.processorOptions.ratio;this.b=new Float32Array(${HOP});this.n=0;this.t=0}
process(i){const c=i[0]&&i[0][0];if(!c)return true;for(let k=0;k<c.length;k++){this.t+=1;if(this.t>=this.r){this.t-=this.r;this.b[this.n++]=c[k];if(this.n===${HOP}){this.port.postMessage(this.b.slice());this.n=0}}}return true}}
registerProcessor('bk-cap',P);`;
    async function openMic(cb) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
        try { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }); }
        catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
        const ratio = ctx.sampleRate / SR;   // 16000 이 안 되는 기기: 단순히 솎아 냄
        srcNode = ctx.createMediaStreamSource(stream);
        sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
        if (ctx.audioWorklet) {
            const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
            await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
            proc = new AudioWorkletNode(ctx, 'bk-cap', { processorOptions: { ratio } });
            proc.port.onmessage = ev => cb(ev.data);
        } else {
            proc = ctx.createScriptProcessor(4096, 1, 1);
            const b = new Float32Array(HOP); let n = 0, t = 0;
            proc.onaudioprocess = ev => { const c = ev.inputBuffer.getChannelData(0); for (let k = 0; k < c.length; k++) { t += 1; if (t >= ratio) { t -= ratio; b[n++] = c[k]; if (n === HOP) { cb(b.slice()); n = 0; } } } };
        }
        srcNode.connect(proc); proc.connect(sink);
    }
    function closeMic() {
        try { if (proc) { proc.disconnect(); if (proc.port) proc.port.onmessage = null; } } catch (e) {}
        try { if (srcNode) srcNode.disconnect(); } catch (e) {}
        try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        try { if (ctx) ctx.close(); } catch (e) {}
        proc = srcNode = stream = ctx = sink = null;
    }
    async function start(cb) {
        await init();
        if (running) { onWake = cb; return; }
        onWake = cb; buf.fill(0); E = []; cool = Date.now() + 800;
        running = true;
        try { await openMic(c => { if (onChunk) onChunk(c); else if (running) pushChunk(c); }); }
        catch (e) { running = false; closeMic(); throw e; }
        if (!running) closeMic();   // 여는 사이에 꺼짐
    }
    function stop() { running = false; onWake = null; onChunk = null; closeMic(); E = []; Q.length = 0; }

    // 녹음 한 토막(약 2초) → 「부캉아」 본보기 (말소리 부분만 잘라 앞 0.5초 · 뒤 1초 조용함을 붙여 같은 방식으로 계산)
    async function templateFrom(x) {
        await init();
        let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
        if (peak < 0.02) return null;   // 너무 작음
        const thr = 0.12 * peak; let a = 0, b = x.length - 1;
        while (a < b && Math.abs(x[a]) < thr) a++;
        while (b > a && Math.abs(x[b]) < thr) b--;
        const w = x.slice(a, b + 1), len = w.length / SR;
        if (len < 0.25 || len > 1.6) return null;   // 「부캉아」 길이가 아님
        const pre = Math.round(0.5 * SR), post = SR, clip = new Float32Array(pre + w.length + post);
        clip.set(w, pre);
        const saveE = E, saveBuf = buf.slice(), feats = [];
        buf.fill(0);
        const n = Math.floor(clip.length / HOP);
        for (let k = 0; k < n; k++) { buf.copyWithin(0, HOP); buf.set(clip.subarray(k * HOP, (k + 1) * HOP), WIN - HOP); feats.push(await feat(buf.slice())); }
        buf.set(saveBuf); E = saveE;
        let lastI = Math.ceil((0.5 + len + 0.1) * SR / HOP) - 1;
        lastI = Math.min(feats.length - 1, Math.max(W - 1, lastI));
        const t = new Float32Array(W * D);
        for (let r = 0; r < W; r++) t.set(feats[lastI - W + 1 + r], r * D);
        return t;
    }
    // 시험용: 소리 한 토막에서 가장 닮은 값
    async function scoreClip(x) {
        await init();
        const saveE = E, saveBuf = buf.slice(); buf.fill(0); E = [];
        let dmin = 9;
        const n = Math.floor(x.length / HOP);
        for (let k = 0; k < n; k++) {
            buf.copyWithin(0, HOP); buf.set(x.subarray(k * HOP, (k + 1) * HOP), WIN - HOP);
            E.push(await feat(buf.slice())); if (E.length > W) E.shift();
            if (E.length === W) dmin = Math.min(dmin, best().d);
        }
        buf.set(saveBuf); E = saveE;
        return dmin;
    }
    // 내 목소리 녹음: ms 동안 마이크 소리를 모아 돌려줌 (듣기는 잠깐 멈춤)
    async function record(ms) {
        await init();
        const wasRunning = running, cb = onWake;
        if (wasRunning) stop();
        const parts = [];
        await openMic(c => { if (onChunk) onChunk(c); });
        onChunk = c => parts.push(c);
        await new Promise(r => setTimeout(r, ms));
        onChunk = null; closeMic();
        const x = new Float32Array(parts.length * HOP); parts.forEach((p, i) => x.set(p, i * HOP));
        if (wasRunning) start(cb).catch(() => {});
        return x;
    }
    async function enroll(x) { const t = await templateFrom(x); if (!t) return false; mine.push(t); if (mine.length > 6) mine.shift(); saveMine(); return true; }
    function clearMine() { mine = []; try { localStorage.removeItem(ME_KEY); } catch (e) {} }
    function mineCount() { if (!readyP) loadMine(); return mine.length; }
    const supported = () => !!(window.WebAssembly && (window.AudioContext || window.webkitAudioContext) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    return { supported, init, start, stop, record, enroll, clearMine, mineCount, scoreClip, templateFrom, isRunning: () => running, last: () => last, _th: () => ({ TH, TH_ME }) };
})();
