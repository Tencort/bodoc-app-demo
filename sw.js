/**
 * Role: 서비스워커 — 안드로이드 크롬이 이 사이트를 「앱 설치」 대상으로 인식하게 해서, 설치 후 주소창 없이 전체 화면으로 열리게 한다
 * Key Features: 네트워크 우선 + 실패 시 캐시 (수정 배포가 바로 반영되고, 촬영 중 잠깐 끊겨도 화면 유지)
 * Dependencies: 없음 (index.html 에서 등록)
 * Notes: 캐시를 우선하면 재배포해도 모델 휴대폰에 옛 화면이 남으므로 네트워크를 먼저 쓴다.
 */
const CACHE = 'bodoc-demo-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 같은 사이트 파일만 캐시에 담아 두었다가 오프라인일 때 꺼내 쓴다
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
