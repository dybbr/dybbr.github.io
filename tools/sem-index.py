# 부캉이 「뜻」 두뇌 찾아보기 표 만들기 — bukang-data.js 를 고치면 다시 돌리기
# 사용: python sem-index.py <저장소 폴더> <emb.py 폴더> <모델 이름...>   (모델 폴더 sem/<이름>/model.onnx.* · vocab.json)
#  결과: sem/index.json (줄마다 [글, 대상]) + sem/<이름>/index.bin (줄마다 int8 벡터, 끝에 float32 배율)
import sys, os, json, re, subprocess, numpy as np
repo, embdir, models = sys.argv[1], sys.argv[2], sys.argv[3:]
sys.path.insert(0, embdir); from emb import Emb
src = json.loads(subprocess.check_output(['node', '-e', "global.window={};require(process.argv[1]);const D=window.BKA_DATA;console.log(JSON.stringify({terms:D.terms.map(t=>[t[1],t[2],t[3]]),faq:D.faq.map(f=>[f[1],f[2]])}))", os.path.join(repo, 'bukang-data.js')]))
it = []
for line in open(os.path.join(repo, 'tools/sem-cmds.txt'), encoding='utf8'):
    ps = [p for p in line.strip().split('|') if p]
    it += [(p, 'C:' + ps[0]) for p in ps]
for keys, title, defin in src['terms']:
    t = 'T:' + title; base = title.split(' (')[0]
    for k in sorted(set([title] + keys.split('|')[:3])): it.append((k, t))
    it.append((base + '이 뭐야', t)); it.append((defin, t))
    first = re.split(r'(?<=[.!?])\s', defin)[0]
    if first != defin: it.append((first, t))
for title, ans in src['faq']: it += [(title, 'F:' + title), (ans, 'F:' + title)]
for line in open(os.path.join(repo, 'tools/sem-extra.txt'), encoding='utf8'):
    line = line.strip()
    if line and not line.startswith('#') and '|' in line: q, g = line.rsplit('|', 1); it.append((q, g))
dv = re.search(r"DATA_VER = '([^']+)'", open(os.path.join(repo, 'bukang-ai.js'), encoding='utf8').read()).group(1)
json.dump({'dv': dv, 'n': len(it), 'rows': it}, open(os.path.join(repo, 'sem/index.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
for m in models:
    d = os.path.join(repo, 'sem', m); tmp = os.path.join(embdir, '_' + m)
    os.makedirs(tmp, exist_ok=True)
    man = json.load(open(os.path.join(d, 'manifest.json')))
    with open(os.path.join(tmp, 'model.onnx'), 'wb') as f:
        for p in man['parts']: f.write(open(os.path.join(d, p), 'rb').read())
    import shutil; shutil.copy(os.path.join(repo, 'sem/vocab.json'), os.path.join(tmp, 'vocab.json'))
    X = Emb(tmp)([t for t, g in it], 'query: ').astype(np.float32)
    sc = np.abs(X).max(1) / 127.0
    q = np.round(X / sc[:, None]).astype(np.int8)
    with open(os.path.join(d, 'index.bin'), 'wb') as f: f.write(q.tobytes()); f.write(sc.astype(np.float32).tobytes())
    print(m, X.shape, os.path.getsize(os.path.join(d, 'index.bin')) // 1000, 'KB')
print('rows', len(it), 'dv', dv)
