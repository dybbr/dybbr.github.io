// ==========================================================
// ⚾ 대연초 야구부 명단 - 서비스워커 (앱 설치/APK 변환용)
// ==========================================================
// 원칙 (v2.110.0 부터): "저장된 화면 먼저, 확인은 뒤에서".
//   - 화면(index.html · player.html)과 그림 · 글꼴 같은 파일: 받아 둔 것이 있으면 그것부터 바로 보여 주고,
//     뒤에서 서버에 "바뀌었는지" 물어 바뀐 것만 새로 받아 둔다 → 다음에 열 때 새 화면 (야구장처럼 신호가 약해도 바로 뜸).
//     새 버전이 있으면 사이트가 연 직후 스스로 알아채고(index.html 의 버전 확인) 「?r=」 주소로 다시 열어 바로 적용한다.
//   - 「?r=」 로 여는 화면(새 버전 적용 · 새로고침)과 데이터 파일(.json — 곡 목록 등)은 예전처럼 서버 먼저 (늘 최신).
//   - 받아 둔 것이 없거나 인터넷이 끊겼을 때는 예전과 같다 (서버에서 받기 → 실패하면 마지막 저장본 → 「인터넷 연결이 필요합니다」).
//   - 구글 시트 / 앱스 스크립트 / 구글 드라이브 사진 등 외부 주소는 절대 건드리지 않는다
//     (명단·비밀번호·주문 데이터가 캐시에 남아 옛날 값이 보이는 일을 막기 위함).
// 사이트를 수정해서 올릴 때 이 파일은 바꿀 필요 없음. 캐시 구조를 바꿀 때만 버전을 올린다.
const CACHE_NAME = 'daeyeon-roster-v2';   // v2 (2026-10-07): 주소 뒤 ?… 가 다른 페이지가 따로따로 쌓이던 저장본 정리

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;                                  // POST(사진 등록/주문 등)는 그대로 통과
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;                   // 외부(구글) 요청은 그대로 통과
    if (url.searchParams.has('vcheck')) return;                        // 🆕 새 버전 확인(맨 앞 몇 KB만 읽음)은 그대로 통과 — 저장 안 함
    if (/\.(mp4|m4v|webm|mov)$/i.test(url.pathname)) return;         // 🎬 v2.100.0: 영상 파일은 그대로 통과 (나눠 받기 · 휴대폰 저장 공간 아끼기)
    if (/\.(mp3|m4a|wav|ogg)$/i.test(url.pathname)) return;           // 📣 v2.111.0: 소리 파일도 그대로 통과 (나눠 받기 요청에 통째 저장본을 주면 아이폰에서 안 나옴 · 효과음은 playlist.js 가 따로 받아 둠)

    // 🧠 v2.128.0: 부캉이 「뜻」 두뇌 큰 파일(sem/<단계>/model.onnx.N · index.bin) — 한 번 받으면 저장본만 씀 (뒤에서 다시 받지 않음)
    //   주소 뒤 ?v=(파일 지문)이 바뀌면 새 파일로 받음 · 브라우저 기본 저장소에는 두 번 저장하지 않음(no-store) · 저장은 bukang-ai.js
    if (/\/sem\/[^/]+\/(model\.onnx\.\d+|index\.bin)$/.test(url.pathname)) {
        event.respondWith(caches.match(req).then(function (hit) {
            return hit || fetch(req, { cache: 'no-store' });   // 저장은 bukang-ai.js 가 다 받은 뒤에 직접 함
        }));
        return;
    }
    const isNav = req.mode === 'navigate';
    // 화면(페이지)은 주소 뒤 ?… 를 떼고 한 칸에만 저장 (player.html?path=… 마다 따로 쌓이지 않게)
    const key = isNav ? url.origin + url.pathname : req;
    const store = function (res) {
        if (res && res.ok && !(isNav && res.redirected)) {
            const copy = res.clone();
            return caches.open(CACHE_NAME).then(function (c) { return c.put(key, copy); }).catch(function () {});
        }
        return Promise.resolve();
    };
    const fromNet = function () {   // 서버에 "바뀌었는지" 물어보고 받음 (안 바뀌었으면 짧은 답만) + 받아 둠
        return fetch(req, { cache: 'no-cache' }).then(function (res) { store(res); return res; });
    };
    const fromCache = function () {
        return caches.match(key, { ignoreSearch: isNav }).then(function (hit) { return (hit && !(isNav && hit.redirected)) ? hit : null; });
    };
    const offline = function () {
        return fromCache().then(function (cached) {
            if (cached) return cached;
            if (isNav) {
                return new Response(
                    '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                    '<title>오프라인</title></head><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#0b2240;background:#f4f6f9">' +
                    '<div style="font-size:48px">⚾</div><h2>인터넷 연결이 필요합니다</h2>' +
                    '<p style="color:#64748b">대연초 야구부 명단은 실시간으로 불러옵니다.<br>연결 후 다시 시도해 주세요.</p>' +
                    '<button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;border:none;border-radius:8px;background:#0b2240;color:#fff;font-weight:700">다시 시도</button>' +
                    '</body></html>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            }
            return Response.error();
        });
    };

    // ① 서버 먼저 (예전 방식): 새 버전 적용 · 새로고침(?r=) 화면, 데이터 파일(.json)
    if ((isNav && url.searchParams.has('r')) || /\.json$/i.test(url.pathname)) {
        event.respondWith(fromNet().catch(offline));
        return;
    }
    // ② 저장본 먼저 + 뒤에서 확인: 화면과 나머지 파일 (?v= 가 붙은 파일도 — 숫자를 안 올리고 고친 경우에도 다음에 열 때는 새것이 되게)
    event.respondWith(fromCache().then(function (hit) {
        if (!hit) return fromNet().catch(offline);
        event.waitUntil(fetch(req, { cache: 'no-cache' }).then(store).catch(function () {}));
        return hit;
    }));
});
