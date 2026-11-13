// 부캉이 「뜻」 두뇌 낱말 쪼개기 (SentencePiece Unigram · 줄인 낱말 표 vocab.json 용) — sem/emb.py 의 Tok 와 똑같이 동작
(function (G) {
    'use strict';
    function SemTok(vocab) {
        this.id = new Map(); this.sc = new Float32Array(vocab.length); let mx = 1;
        vocab.forEach((v, i) => { this.id.set(v[0], i); this.sc[i] = v[1]; const L = Array.from(v[0]).length; if (L > mx) mx = L; });
        this.maxlen = Math.min(mx, 24);
    }
    SemTok.prototype.encode = function (text, maxt) {
        maxt = maxt || 64;
        let t = String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
        const ch = Array.from('▁' + t.replace(/ /g, '▁')), n = ch.length;
        const bs = new Float64Array(n + 1).fill(-1e18), bp = new Int32Array(n + 1).fill(-1), bj = new Int32Array(n + 1).fill(-1);
        bs[0] = 0;
        for (let i = 0; i < n; i++) {
            if (bs[i] <= -1e17) continue;
            let hit = false, piece = '';
            for (let L = 1; L <= Math.min(this.maxlen, n - i); L++) {
                piece += ch[i + L - 1];
                const j = this.id.get(piece);
                if (j !== undefined) { hit = true; const s = bs[i] + this.sc[j]; if (s > bs[i + L]) { bs[i + L] = s; bp[i + L] = i; bj[i + L] = j; } }
            }
            if (!hit || bs[i + 1] <= -1e17) { const s = bs[i] - 10; if (s > bs[i + 1]) { bs[i + 1] = s; bp[i + 1] = i; bj[i + 1] = 3; } }
        }
        const ids = []; for (let k = n; k > 0; k = bp[k]) ids.push(bj[k]);
        ids.reverse();
        const out = []; for (const j of ids) { if (j === 3 && out.length && out[out.length - 1] === 3) continue; out.push(j); }
        return [0].concat(out.slice(0, maxt - 2), [2]);
    };
    G.SemTok = SemTok;
})(typeof window !== 'undefined' ? window : globalThis);
