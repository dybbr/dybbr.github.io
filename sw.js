// ==========================================================
// ⚾ 대연초 야구부 명단 - 서비스워커 (앱 설치/APK 변환용)
// ==========================================================
// 원칙: "항상 최신 화면" 우선 (네트워크 우선).
//   - 같은 사이트(dybbr.github.io)의 파일은 매번 네트워크에서 새로 받고,
//     인터넷이 끊겼을 때만 마지막으로 받아둔 화면을 보여준다.
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
    if (url.pathname.indexOf('/audio/') === 0) return;                 // 🎵 배경음악 mp3는 브라우저가 직접 받으며 재생 (캐시에 안 담음)
    if (url.searchParams.has('vcheck')) return;                        // 🆕 새 버전 확인(맨 앞 몇 KB만 읽음)은 그대로 통과 — 저장 안 함

    event.respondWith(
        fetch(req, { cache: 'no-store' }).then(function (res) {
            if (res && res.ok) {
                const copy = res.clone();
                // 화면(페이지)은 주소 뒤 ?… 를 떼고 한 칸에만 저장 (player.html?path=… 마다 따로 쌓이지 않게)
                const key = req.mode === 'navigate' ? url.origin + url.pathname : req;
                caches.open(CACHE_NAME).then(function (c) { c.put(key, copy); }).catch(function () {});
            }
            return res;
        }).catch(function () {
            return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (cached) {
                if (cached) return cached;
                if (req.mode === 'navigate') {
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
        })
    );
});
