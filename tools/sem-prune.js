// 부캉이 「뜻」 두뇌 줄이기 (의존성 없음 · Node 18+)
// 사용: node tools/sem-prune.js <model_quantized.onnx> <tokenizer.json> <출력 폴더> [영어 조각 수=30000] [나눌 크기 MB=45]
// 한국어 조각 전부 + 영어 조각 상위 N개 + 한 글자 기호만 남기고, 낱말 표(word_embeddings)에서 그 줄만 남김.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [mp, tp, out, akS, mbS] = process.argv.slice(2);
if (!mp || !tp || !out) { console.error('사용: node sem-prune.js model.onnx tokenizer.json outdir [30000] [45]'); process.exit(1); }
const AK = +(akS || 30000), PART = (+(mbS || 45)) * 1e6;
fs.mkdirSync(out, { recursive: true });
// ---- 1) 낱말 고르기 (sem/prune.py 와 같은 규칙)
const V = JSON.parse(fs.readFileSync(tp, 'utf8')).model.vocab;
const HAN = /[가-힣ㄱ-ㆎ]/, ASC = /^[▁\x20-\x7e]+$/, SYM = /^[▁]?[·…‘-”、-】！-～~·]$/;
const keep = new Set([0, 1, 2, 3]), asc = [];
V.forEach(([p, s], i) => {
  const bare = p.replace(/▁/g, '');
  if (HAN.test(p)) keep.add(i);
  else if (ASC.test(p)) { if ([...bare].length <= 1) keep.add(i); else asc.push([s, i]); }
  else if ([...bare].length === 1 && SYM.test(p)) keep.add(i);
});
asc.sort((a, b) => b[0] - a[0] || b[1] - a[1]); asc.slice(0, AK).forEach(([, i]) => keep.add(i));
const ids = [...keep].sort((a, b) => a - b);
console.log('keep', ids.length, 'of', V.length);
// ---- 2) protobuf 최소 읽기 · 쓰기
function rv(b, o) { let x = 0n, s = 0n, c; do { c = b[o++]; x |= BigInt(c & 127) << s; s += 7n; } while (c & 128); return [x, o]; }
function wv(x) { x = BigInt(x); const a = []; do { let c = Number(x & 127n); x >>= 7n; if (x) c |= 128; a.push(c); } while (x); return Buffer.from(a); }
function fields(b) {
  const f = []; let o = 0;
  while (o < b.length) {
    const st = o; let k; [k, o] = rv(b, o); const no = Number(k >> 3n), wt = Number(k & 7n); let v;
    if (wt === 0) { [v, o] = rv(b, o); f.push({ no, wt, v, raw: b.subarray(st, o) }); }
    else if (wt === 2) { let n; [n, o] = rv(b, o); n = Number(n); f.push({ no, wt, d: b.subarray(o, o + n), raw: b.subarray(st, o + n) }); o += n; }
    else if (wt === 5) { o += 4; f.push({ no, wt, raw: b.subarray(st, o) }); }
    else if (wt === 1) { o += 8; f.push({ no, wt, raw: b.subarray(st, o) }); }
    else throw new Error('wire type ' + wt);
  }
  return f;
}
const ld = (no, d) => Buffer.concat([wv((no << 3) | 2), wv(d.length), d]);
const ESZ = { 1: 4, 2: 1, 3: 1, 10: 2, 16: 2 };
function pruneTensor(t) {
  const f = fields(t); let name = '', dims = [], dt = 0, raw = null;
  for (const x of f) {
    if (x.no === 8) name = x.d.toString('utf8');
    if (x.no === 1) { if (x.wt === 0) dims.push(Number(x.v)); else { let o = 0; while (o < x.d.length) { let v; [v, o] = rv(x.d, o); dims.push(Number(v)); } } }
    if (x.no === 2) dt = Number(x.v);
    if (x.no === 9) raw = x.d;
  }
  if (!name.startsWith('embeddings.word_embeddings.weight') || dims.length !== 2 || !raw) return null;
  const es = ESZ[dt]; if (!es) throw new Error('data type ' + dt);
  const row = dims[1] * es; if (raw.length !== dims[0] * row) throw new Error('raw size');
  const nr = Buffer.alloc(ids.length * row); ids.forEach((id, k) => raw.copy(nr, k * row, id * row, id * row + row));
  console.log('pruned', name, dims, '->', [ids.length, dims[1]]);
  const parts = [];
  for (const x of f) {
    if (x.no === 1) continue; if (x.no === 9) continue;
    parts.push(x.raw);
  }
  return Buffer.concat([Buffer.concat([wv(1 << 3), wv(ids.length), wv(1 << 3), wv(dims[1])]), ...parts, ld(9, nr)]);
}
const M = fs.readFileSync(mp); let hit = 0;
const mOut = fields(M).map(x => {
  if (x.no !== 7) return x.raw;
  const g = fields(x.d).map(y => { if (y.no !== 5) return y.raw; const nt = pruneTensor(y.d); if (!nt) return y.raw; hit++; return ld(5, nt); });
  return ld(7, Buffer.concat(g));
});
if (hit !== 1) throw new Error('word_embeddings 를 찾지 못함: ' + hit);
const model = Buffer.concat(mOut);
// ---- 3) 저장 (GitHub 100MB 제한 때문에 나눠 저장)
const sha = crypto.createHash('sha256').update(model).digest('hex');
const n = Math.ceil(model.length / PART), files = [];
for (let i = 0; i < n; i++) { const fn = 'model.onnx.' + i; fs.writeFileSync(path.join(out, fn), model.subarray(i * PART, Math.min(model.length, (i + 1) * PART))); files.push(fn); }
fs.writeFileSync(path.join(out, 'vocab.json'), JSON.stringify({ v: ids.map(i => [V[i][0], Math.round(V[i][1] * 1e4) / 1e4]) }));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ bytes: model.length, sha256: sha, parts: files, vocab: ids.length, source: path.basename(mp) }, null, 1));
console.log('model', (model.length / 1e6).toFixed(1), 'MB', n, 'parts', 'sha256', sha);
