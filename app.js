/**
 * Role: 보닥 앱 클릭 프로토타입 본체 — 해시 라우터로 홈·진단·보상·상품 탭과 상세 화면을 그리고 화면 이동을 처리한다
 * Key Features: 화면 스택(밀기/돌아오기 애니메이션), 세그먼트·아코디언·칩 전환, 게이지·막대 차오름
 * Dependencies: data.js(window.BODOC), style.css, img/
 * Notes: 경로 — #home #diag #pd/{i} #cov/{i} #comp #qna #shop #item/{카테고리}/{i}
 *        ?ad=1 로 열면 광고 금지 요소(.ad-hide)를 숨긴다.
 *        진단 탭 진입 때 뜨는 바텀시트는 인앱메시지(앱 화면 아님)라 넣지 않는다 (2026-10-29 사용자 지적).
 *        실제 앱에 없는 동작(청구·문의 작성·건강 탭 등)은 토스트로 안내만 한다.
 */
(function () {
  const D = window.BODOC;
  const AD = new URLSearchParams(location.search).get('ad') === '1';
  if (AD) document.body.classList.add('ad');

  // 화면별로 유지할 선택 상태 — 다른 화면에 갔다 돌아와도 고른 탭이 남아 있게 한다
  const state = { diagSub: 'total', pdSeg: 'diag', covSeg: 'list', qnaTab: 0, shopCat: '암', chartMode: 'sex', endedOpen: false, peer: null, peerDraft: { age: '30대', sex: '남성' } };
  // 모델별 이름 — ?name=홍길동 으로 「OOO님」 자리를 바꾼다
  // 홈 화면 아이콘으로 열면 주소의 ?name= 이 빠지므로 한 번 받은 이름을 기기에 기억해 둔다
  // 모델별 프로필 — ?p=park 처럼 열면 그 프로필(이름·숨은 보험금)로 바뀌고 기기에 기억된다. ?name= 은 이름만 덮어쓴다
  const qs = new URLSearchParams(location.search);
  const qName = qs.get('name');
  const qProf = qs.get('p');
  let prof = null;
  try {
    if (qProf && D.profiles[qProf]) localStorage.setItem('bodocProfile', qProf);
    if (qName) localStorage.setItem('bodocName', qName);
    prof = D.profiles[qProf || localStorage.getItem('bodocProfile')] || null;
    D.userName = qName || (qProf && prof ? prof.name : null) || localStorage.getItem('bodocName') || (prof && prof.name) || D.userName;
  } catch (e) {
    prof = D.profiles[qProf] || null;
    D.userName = qName || (prof && prof.name) || D.userName;
  }
  // 숨은 보험금 목록 — 프로필에 있으면 그 값, 없으면 0원(조회 결과 없음)
  D.hidden = (prof && prof.hidden) || [];
  // 프로필에 적은 그 밖의 값(score·policies·updated 등)은 기본 데이터를 그대로 덮어쓴다 — 모델마다 점수·가입 보험을 다르게
  if (prof) Object.keys(prof).forEach((k) => { if (k !== 'name' && k !== 'hidden') D[k] = prof[k]; });
  const hiddenTotal = D.hidden.reduce((s, h) => s + h.amt, 0);
  const closedCats = new Set();
  let stack = [];
  let pendingAnim = null;
  let lastRoute = null;
  const scrollMemo = {};

  const $screen = document.getElementById('screen');
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const total = D.policies.reduce((s, p) => s + p.premium, 0);
  const gradeCls = { 좋음: 'g-good', 주의: 'g-warn', 나쁨: 'g-bad' }[D.score.grade] || 'g-warn';
  const pad2 = (n) => String(n).padStart(2, '0');

  // ---------- 아이콘 (Figma 에셋에 없는 것만 인라인 SVG) ----------
  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>',
    lt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21" stroke-linecap="round"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6 17V11a6 6 0 0112 0v6l1.5 2h-15L6 17z"/><path d="M10 21h4" stroke-linecap="round"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" stroke-linecap="round"/></svg>',
    link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>',
    O: '<svg width="38" height="38" viewBox="0 0 38 38"><circle cx="19" cy="19" r="15" fill="none" stroke="#16be4e" stroke-width="4"/></svg>',
    T: '<svg width="38" height="38" viewBox="0 0 38 38"><path d="M19 5L34 32H4z" fill="none" stroke="#ff9200" stroke-width="4" stroke-linejoin="round"/></svg>',
    X: '<svg width="38" height="38" viewBox="0 0 38 38"><path d="M7 7l24 24M31 7L7 31" stroke="#f34b5b" stroke-width="4.4" stroke-linecap="round"/></svg>',
    tri: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>',
    renew: '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M29 18a11 11 0 11-3.2-7.8"/><path d="M26 4v7h-7"/></svg>',
    calClock: '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="24" height="23" rx="3"/><path d="M5 13h24M11 4v5M23 4v5"/><circle cx="24" cy="25" r="6" fill="#fff"/><path d="M24 22v3l2 1.5"/></svg>',
    calLink: '<svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="26" height="22" rx="3"/><path d="M5 13h26M11 4v5M25 4v5"/><path d="M17 22h-2a2.5 2.5 0 010-5h2M21 17h2a2.5 2.5 0 010 5h-2M17 19.5h4"/></svg>',
    shieldUser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><circle cx="12" cy="10" r="2.3"/><path d="M8.5 16c.8-1.8 2-2.6 3.5-2.6s2.7.8 3.5 2.6"/></svg>',
    lockWon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4v15h11"/><rect x="11" y="10" width="10" height="8" rx="2"/><path d="M13.5 10V8.5a2.5 2.5 0 015 0V10"/></svg>',
    rate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 17L17 7M8 8h.01M16 16h.01" stroke-linecap="round" stroke-width="2.2"/></svg>',
    sort: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/></svg>',
    filter: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    // 새 화면용 — 숨은 보험금 Q&A, 병원비 청구, FAQ 카테고리, 필터
    qblue: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1e88ff"/><path d="M9.5 9.3a2.6 2.6 0 015 .9c0 1.7-2.5 2.1-2.5 3.6M12 16.8v.3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2.5l8 3v6.2c0 5-3.4 8.6-8 9.8-4.6-1.2-8-4.8-8-9.8V5.5z" fill="#1e88ff"/><path d="M12 2.5l8 3v6.2c0 5-3.4 8.6-8 9.8z" fill="#5aa9ff"/></svg>',
    pouch: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1.5 3h-3z" fill="#e0a21a"/><path d="M12 7c5 0 8 4.5 8 8.5S17 21 12 21s-8-1.5-8-5.5S7 7 12 7z" fill="#f4bf2a"/><path d="M8.6 12.3l1.3 4 1.2-3 1.2 3 1.3-4M8.4 14h7.2" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" stroke-linecap="round"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c.8-3.6 3.5-5.4 6.5-5.4s5.7 1.8 6.5 5.4"/><circle cx="16.5" cy="8.5" r="2.8"/><path d="M17.5 14.3c2.3.4 3.7 2.2 4.2 5"/></svg>',
    medkit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 6V3h8v3M12 10v7M8.5 13.5h7" stroke-linecap="round"/></svg>',
    chevC: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#16c5ff"/><path d="M10.5 8l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 14v-2a7 7 0 0114 0v2"/><rect x="3.5" y="13" width="4" height="6" rx="1.5"/><rect x="16.5" y="13" width="4" height="6" rx="1.5"/><path d="M18.5 19c0 1.5-2 2.5-5 2.5"/></svg>',
    camera: '<svg viewBox="0 0 28 24"><rect x="1" y="5" width="26" height="17" rx="2" fill="#e3f6ff" stroke="#16c5ff" stroke-width="1.5"/><path d="M9 5l2-3h6l2 3" fill="#e3f6ff" stroke="#16c5ff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="14" cy="13.5" r="5" fill="#fff" stroke="#16c5ff" stroke-width="1.5"/><circle cx="14" cy="13.5" r="2.3" fill="#16c5ff"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    f_gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9" stroke-linecap="round"/><circle cx="12" cy="12" r="7"/></svg>',
    f_pill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="6" y="6" width="12" height="15" rx="2"/><path d="M8 6V3h8v3M12 10v6M9 13h6" stroke-linecap="round"/></svg>',
    f_injury: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="4" r="2"/><path d="M10 7v6h5l2 6M7 10a6 6 0 108.5 7.5"/></svg>',
    f_hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14h4l4 2h5a1.5 1.5 0 000-3h-3M6 14V9.5L11 7h6l5 2.5M15 13l5-2.5"/></svg>',
    f_fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21a7 7 0 01-7-7c0-4 3-6 4-10 2 2 3 3 3 5 1-1 1.5-2 1.5-3 2.5 2 5.5 5 5.5 8a7 7 0 01-7 7z"/><path d="M12 21a3 3 0 01-3-3c0-2 2-3 3-5 1 2 3 3 3 5a3 3 0 01-3 3z"/></svg>',
    f_car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 17v-4l2-5h14l2 5v4z"/><path d="M3 17v2h3v-2M18 17v2h3v-2M6 13.5h2M16 13.5h2M5 8l1-3h12l1 3" stroke-linecap="round"/></svg>',
    pin: '<svg class="pin" viewBox="0 0 20 24"><path d="M10 23s8-7.5 8-13A8 8 0 002 10c0 5.5 8 13 8 13z" fill="#fff" stroke="#c9ccd1" stroke-width="1.2"/></svg>',
  };
  // 탭바 아이콘 — Figma com_* 원본 경로. 파일로 직접 열 때(file://) CSS 마스크가 막혀서 인라인으로 넣는다
  const TAB_ICONS = {"tab_home": "<g id=\"com_home\"> <path id=\"Subtract\" d=\"M10.1578 2.6278C11.2411 1.79073 12.7589 1.79073 13.8422 2.6278L19.8416 7.26377C20.5723 7.82836 20.9999 8.69678 21 9.61638V19.0197C21 20.6656 19.657 21.9998 18.0003 22H13.8362C13.8162 22 13.8 21.9838 13.8 21.9638V16.5273C13.8 15.5332 12.9941 14.7273 12 14.7273C11.0059 14.7273 10.2 15.5332 10.2 16.5273V21.9638C10.2 21.9838 10.1838 22 10.1638 22H5.99971C4.34299 21.9998 3 20.6656 3 19.0197V9.61638C3.00008 8.69678 3.42771 7.82836 4.1584 7.26377L10.1578 2.6278Z\" fill=\"currentColor\"/> </g>", "tab_chart": "<g id=\"com_chart\"> <path id=\"Vector\" d=\"M9.08406 3.62865C9.77303 3.459 10.3889 4.01999 10.3889 4.72953V13.1111C10.3889 13.3873 10.6127 13.6111 10.8889 13.6111H19.2705C19.98 13.6111 20.541 14.227 20.3714 14.9159C19.3699 18.9832 15.6974 22 11.321 22C6.173 22 2 17.827 2 12.679C2 8.30261 5.0168 4.63013 9.08406 3.62865ZM12.2531 3.3075C12.2531 2.60423 12.858 2.04588 13.5461 2.19106C17.6801 3.0632 20.936 6.31965 21.8087 10.4537C21.954 11.1418 21.3956 11.7469 20.6923 11.7469H13.4531C12.7903 11.7469 12.2531 11.2097 12.2531 10.5469V3.3075Z\" fill=\"currentColor\"/> </g>", "tab_bag": "<g id=\"com_shoppingbag\"> <path id=\"Subtract\" d=\"M17.574 2C19.2015 2 20.5322 3.29777 20.573 4.9248L20.9236 18.9248C20.9657 20.6105 19.6098 22 17.9236 22H6.09155C4.39949 22 3.04185 20.6014 3.09252 18.9102L3.51244 4.91016C3.56108 3.28906 4.88964 2 6.51147 2H17.574ZM8.07494 6.25391C7.6629 6.21285 7.29486 6.51371 7.25366 6.92578C7.16036 7.85946 7.26516 9.27293 7.92944 10.4854C8.62532 11.7552 9.91285 12.7498 11.9997 12.75C14.0869 12.75 15.3742 11.7553 16.0701 10.4854C16.6514 9.42433 16.8047 8.20955 16.7712 7.29688L16.7458 6.92578L16.7341 6.84961C16.6583 6.47723 16.3118 6.21548 15.9255 6.25391C15.5393 6.2927 15.2503 6.61798 15.2497 6.99805L15.2537 7.07422L15.2722 7.36523C15.2966 8.07604 15.172 9.00293 14.7546 9.76465C14.309 10.5779 13.5124 11.25 11.9997 11.25C10.4874 11.2498 9.69052 10.5779 9.24487 9.76465C8.76787 8.89405 8.67354 7.80706 8.74682 7.07422C8.78776 6.66233 8.48681 6.29524 8.07494 6.25391Z\" fill=\"currentColor\"/> </g>", "tab_heart": "<g id=\"com_hearth\"> <path id=\"Subtract\" d=\"M16.9502 2.08343C20.2918 2.08354 22.9998 4.80769 23 8.62152C22.9999 15.8234 15.6459 20.1114 12.5098 21.9438C12.1936 22.1284 11.8064 22.1284 11.4902 21.9438C8.94964 20.4594 3.64132 17.3636 1.7168 12.4125H6.74121C7.05203 12.4124 7.33112 12.221 7.44336 11.9311L8.15332 10.0932L10.5889 15.4838C10.7138 15.7601 10.9928 15.9344 11.2959 15.9262C11.599 15.9177 11.868 15.7276 11.9775 15.4448L13.1514 12.4125H15.8096C16.2253 12.4124 16.5624 12.0753 16.5625 11.6596C16.5625 11.2438 16.2253 10.9068 15.8096 10.9067H12.6357C12.3636 10.9067 12.1153 11.0528 11.9824 11.2836L11.9336 11.3881L11.2207 13.226L8.78711 7.83539C8.66214 7.55903 8.38329 7.38469 8.08008 7.393C7.81492 7.40042 7.57619 7.54618 7.44727 7.77191L7.39844 7.87445L6.22559 10.9067H1.25488C1.09042 10.1804 1.00001 9.41859 1 8.62152C1.00019 4.80769 3.75001 2.08354 7.0498 2.08343C9.09581 2.08343 10.9 3.17337 12 4.26312C13.1 3.17337 14.9042 2.08343 16.9502 2.08343Z\" fill=\"currentColor\"/> </g>", "tab_pouch": "<g id=\"com_moneypouch\"> <path id=\"Union\" d=\"M11.5 4.72754C16.7467 4.72754 20.9998 9.02368 21 14.3232V15.0908C21 18.9066 17.9378 22.0009 14.1602 22.001H8.83984C5.06236 22.0007 2 18.9065 2 15.0908V14.3232C2.00025 9.02374 6.25343 4.72764 11.5 4.72754ZM15.1953 10.2881C14.7979 10.1827 14.3815 10.391 14.2656 10.7539L13.8408 12.0869H12.875L12.4121 11.002C12.2999 10.7388 12.022 10.5645 11.7129 10.5645C11.4425 10.5646 11.1959 10.6978 11.0635 10.9072L11.0137 11.002L10.5508 12.0869H9.58496L9.16016 10.7539C9.04424 10.3909 8.62801 10.1824 8.23047 10.2881C7.83346 10.394 7.60456 10.7738 7.71973 11.1367L8.02246 12.0869H7.71289C7.29893 12.0872 6.96391 12.3942 6.96387 12.7725C6.9639 13.1507 7.29892 13.4578 7.71289 13.458H8.45898L9.1748 15.7051C9.26468 15.9864 9.54089 16.184 9.86133 16.1973C10.1822 16.2102 10.4771 16.0351 10.5938 15.7617L11.5762 13.458H11.8496L12.832 15.7617C12.9486 16.035 13.2437 16.21 13.5645 16.1973C13.885 16.1842 14.161 15.9864 14.251 15.7051L14.9668 13.458H15.7129C16.1271 13.458 16.4629 13.1508 16.4629 12.7725C16.4628 12.3941 16.1271 12.0869 15.7129 12.0869H15.4033L15.7061 11.1367C15.8215 10.7736 15.5927 10.3939 15.1953 10.2881ZM15.9326 0.888672C16.917 0.889092 17.5319 1.95495 17.04 2.80762L16.7979 3.22754C16.5663 3.62846 16.249 3.96237 15.8779 4.21289C14.5374 3.61973 13.0572 3.28818 11.5 3.28809C9.94168 3.28809 8.4595 3.61902 7.11816 4.21289C6.74718 3.96239 6.43074 3.62836 6.19922 3.22754L5.95703 2.80762C5.46478 1.95477 6.07969 0.888768 7.06445 0.888672H15.9326Z\" fill=\"currentColor\"/> </g>"};
  const helpIco = '<img class="help" src="img/ic_help.svg" alt="">';
  const chevR = '<img src="img/ic_chev_right.svg" alt="">';

  // ---------- 공통 조각 ----------
  // 게이지 반원 — 점수 비율만큼 호를 채운다(처음엔 비워 두고 afterRender 에서 차오르게)
  function gauge(w, r, sw) {
    const cx = w / 2, cy = r + sw / 2;
    const len = Math.PI * r;
    const d = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    return `<svg width="${w}" height="${cy + sw / 2}" viewBox="0 0 ${w} ${cy + sw / 2}">
      <path d="${d}" fill="none" stroke="#eceef1" stroke-width="${sw}" stroke-linecap="round"/>
      <path class="arc" d="${d}" fill="none" stroke="var(--g)" stroke-width="${sw}" stroke-linecap="round"
        stroke-dasharray="${len}" stroke-dashoffset="${len}" data-len="${len}"/></svg>`;
  }
  function header(title) {
    const left = title ? `<h1>${title}</h1>` : '<img class="logo" src="img/logo.svg" alt="보닥">';
    return `<div class="hdr">${left}<div class="actions">
      <button class="act" data-toast="알림"><img src="img/ic_bell.svg" alt="">알림</button>
      <button class="act" data-toast="메뉴"><img src="img/ic_menu.svg" alt="">메뉴</button></div></div>`;
  }
  function tabbar(on) {
    const tabs = [['home', '홈', 'tab_home'], ['diag', '진단', 'tab_chart'], ['shop', '상품', 'tab_bag'], ['health', '건강', 'tab_heart'], ['comp', '보상', 'tab_pouch']];
    return `<nav class="tabbar">${tabs.map(([k, l, ic]) =>
      `<button class="${k === on ? 'on' : ''}" data-tab="${k}"><svg class="ico" viewBox="0 0 24 24" fill="none">${TAB_ICONS[ic]}</svg>${l}</button>`).join('')}</nav>`;
  }
  const fab = () => '<button class="fab ad-hide" data-toast="AI 상담사"><img src="img/fab_doctor.webp" alt=""></button>';
  // 보험사 로고 — 앱 원본 파트너사 로고 이미지. 목록에 없는 보험사는 회색 원판
  const plate = (ins, size) => {
    const st = size ? ` style="width:${size}px;height:${size}px"` : '';
    const f = D.logos[ins];
    return f ? `<img class="plate" src="img/${f}.png" alt=""${st}>` : `<span class="plate"${st}></span>`;
  };

  // ---------- 홈 ----------
  function viewHome() {
    const rows = D.policies.map((p, i) => `<button class="row" style="width:100%;text-align:left" data-go="pd/${i}">${plate(p.insurer)}
      <div class="nm"><div class="a ell">${p.short}</div><div class="b">${p.insurer}</div></div><div class="pr">${won(p.premium)}</div></button>`).join('');
    return `<div class="view">${header()}
      <div class="scroll"><div class="stack">
        <div class="card home-diag ${gradeCls}">
          <div class="sec-hd"><div class="t">내 보험 종합진단${helpIco}</div><button class="more" data-tab="diag">더보기${chevR}</button></div>
          <div class="gauge home-gauge">${gauge(240, 106, 14)}
            <div class="center"><span class="badge">${D.score.grade}</span>
              <div class="score"><b>${D.score.value}</b><span>점</span></div>
              <div class="upd">${D.updated} 업데이트<img src="img/ic_refresh.svg" alt=""></div></div></div>
          <div class="pad20 ad-hide" style="align-self:stretch"><button class="btn primary" data-toast="전문가 의견 듣기">전문가 의견 듣기</button></div>
        </div>
        <div class="card premium">
          <div class="sec-hd"><div class="t">매월 내는 보험료${helpIco}</div></div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div class="kv"><div class="k"><img src="img/ic_shield.svg" alt="">보장받을 수 있는 보험</div><div class="v">${D.policies.length}건</div></div>
            <div class="kv"><div class="k"><img src="img/ic_coin.svg" alt="">매월 내는 금액(${D.policies.length}건)</div><div class="v">${won(total)}</div></div>
          </div>
          <div class="hr"></div>
          <div class="plist" style="margin-top:-10px">${rows}</div>
          <div class="pad20"><button class="btn neutral" data-tab="diag" data-sub="my">내 보험 전체보기</button></div>
        </div>
        <div class="promo lime ad-hide">
          ${hiddenTotal ? `<div class="tt">숨은 보험금<br>총 ${won(hiddenTotal)}이 있어요.<small>${D.updated} 조회</small></div>
          <img src="img/card_moneybag.png" width="100" height="80" alt="">` : `<div class="tt">현재 숨은 보험금이 없어요.<br>보험금을 잘 관리하고 계시네요.<small>${D.updated} 조회</small></div>
          <img class="clap" src="img/ns_clap.svg" width="80" height="80" alt="">`}
          <div class="pad20"><button class="btn extra" data-go="hidden">숨은 보험금 조회하기</button></div>
        </div>
        <div class="promo white ad-hide">
          <div class="tt">이런 상황일 때,<br>보험금 받을 수 있을까요?</div>
          <img src="img/card_situation.png" width="170" height="80" alt="">
          <div class="pad20"><button class="btn extra" data-go="qna">손해사정사에게 문의하기</button></div>
        </div>
        <div class="promo blue">
          <div class="tt">내 건강검진 분석 결과는?</div>
          <div class="ages">
            <div class="col"><div class="boxes"><span class="box">?</span><span class="box">?</span><span class="unit">세</span></div><span class="lb">검진 받은 나이</span></div>
            <span class="sep"></span>
            <div class="col"><div class="boxes"><span class="box hl">?</span><span class="box hl">?</span><span class="unit">세</span></div><span class="lb">생체나이</span></div>
          </div>
          <div class="pad20"><button class="btn extra" data-toast="건강정보 연결">건강정보 연결하기</button></div>
        </div>
        <button class="addbox" data-toast="내 보험 추가"><img src="img/ic_add.svg" alt=""><div><div class="a">내 보험 추가하기</div><div class="b">가입된 보험이 보이지 않는다면<br>보험을 추가해보세요</div></div></button>
      </div></div>
      ${fab()}${tabbar('home')}</div>`;
  }

  // ---------- 진단 ----------
  function verdictRow(p, i) {
    const cls = { 유지: 'keep', 조정: '', 해지: 'cut' }[p.verdict];
    return `<button class="vrow" style="width:100%;text-align:left" data-go="pd/${i}">${plate(p.insurer)}
      <div class="nm"><div class="a ell">${p.short}</div><div class="b">${p.insurer}</div><div class="c">${won(p.premium)}</div></div>
      <span class="vbadge ${cls}">${I.tri}${p.verdict}</span></button>`;
  }
  function viewDiag() {
    const sub = state.diagSub;
    const cnt = (v) => D.policies.filter((p) => p.verdict === v).length;
    const grp = (g) => D.policies.map((p, i) => [p, i]).filter(([p]) => p.group === g);
    const prot = grp('보장성'), real = grp('실손');
    const body = sub === 'total' ? `
      <div class="dg ${gradeCls}">
        <div class="sec-hd"><div class="t">내 보험 종합진단${helpIco}</div><button class="more" data-go="total">더보기${chevR}</button></div>
        <div class="dg-top"><div>
            <div class="score"><b>${D.score.value}</b><span>점</span><img src="img/ic_refresh.svg" width="22" height="22" style="margin:0 0 4px 2px" alt=""></div>
            <div class="upd" style="font-size:15px;font-weight:400;margin-top:4px">${D.updated} 업데이트</div></div>
          <div class="gauge dg-gauge">${gauge(150, 62, 12)}<span class="badge">${D.score.grade}</span></div></div>
        <p class="dg-cmt">${D.score.comment[0]}<b>${D.score.comment[1]}</b>${D.score.comment[2]}</p>
        <div class="card bars">${D.score.bars.map((b) => `
          <div class="bar-row" data-go="total"><div class="l"><small>${b.label}</small><b>${b.name} ›</b></div>
            <div class="r"><div class="track"><i class="t-${b.tone}" data-w="${b.pct}"></i></div><span class="res t-${b.tone}">${b.result}</span></div></div>`).join('')}
        </div>
        <button class="btn primary mt24 ad-hide" style="height:54px;font-size:17px" data-toast="전문가 의견 듣기">전문가 의견 듣기</button>
        <div class="divider8"></div>
        <div style="font-size:20px;font-weight:600;padding:30px 0 0">보험 상품별 진단</div>
        <div class="verdicts"><div>${I.O}유지 ${cnt('유지')}</div><div>${I.T}조정 ${cnt('조정')}</div><div>${I.X}해지 ${cnt('해지')}</div></div>
        <button class="btn neutral ad-hide" style="height:54px;font-size:17px" data-toast="궁금한점 물어보기">궁금한점 물어보기</button>
        <div class="card vg">
          <h3>보장성 보험 <em>${prot.length}</em></h3>${prot.map(([p, i]) => verdictRow(p, i)).join('')}
          <div class="sep"></div>
          <h3>실손의료 보험 <em>${real.length}</em></h3>${real.map(([p, i]) => verdictRow(p, i)).join('')}
        </div>
        <div class="card acc ${state.endedOpen ? 'open' : ''}">
          <button class="ac-hd" data-act="ended"><span>보장이 끝난 보험 <em>${D.endedCount}</em></span><span class="chev">${I.down}</span></button>
          <div class="ac-bd">${D.ended.map((p) => `<div class="vrow">${plate(p.insurer)}<div class="nm"><div class="a ell">${p.name}</div><div class="b">${p.insurer}</div><div class="c">보장 종료</div></div></div>`).join('')}</div>
        </div>
        <p class="note">가입한 보험이 보이지 않으신가요? <u>조회되는 보험 기준</u></p>
        <button class="btn primary" style="height:54px;font-size:17px" data-toast="내 보험 추가">내 보험 추가하기</button>
        <button class="addbox mt24" style="width:100%" data-toast="건강정보 연결"><span class="plus purple">+</span><div><div class="a">내 건강정보 연결하기</div><div class="b">건강정보를 기반으로 보험 보장 분석이<br>더 정밀해져요.</div></div></button>
        <div style="height:100px"></div>
      </div>` : `
      <div class="dg">
        <div class="sec-hd"><div class="t">매월 내는 보험료${helpIco}</div><button class="addlink" data-toast="내 보험 추가">내 보험 추가하기 <i>+</i></button></div>
        <div class="bigwon"><b>${total.toLocaleString('ko-KR')}</b><span>원</span></div>
        <div class="card vg" style="margin-top:0;padding-bottom:12px">
          <h3>매월 납부 중인 보험 <em>${D.policies.length}</em></h3>
          <div class="plist">${D.policies.map((p, i) => `<button class="row" style="width:100%;text-align:left;padding:14px 4px" data-go="pd/${i}">${plate(p.insurer, 48)}
            <div class="nm"><div class="a ell" style="font-size:15px">${p.short}</div><div class="b" style="font-size:13px">${p.insurer}</div></div><div class="pr" style="font-size:16px">${won(p.premium)}</div></button>`).join('')}</div>
        </div>
        <button class="addbox mt18" style="width:100%" data-toast="내 보험 추가"><img src="img/ic_add.svg" alt=""><div><div class="a">내 보험 추가하기</div><div class="b">가입된 보험이 보이지 않는다면<br>보험을 추가해보세요</div></div></button>
        <div style="height:100px"></div>
      </div>`;
    return `<div class="view">${header('진단')}
      <div class="seg-wrap"><div class="seg"><button class="${sub === 'total' ? 'on' : ''}" data-sub="total">종합 진단</button><button class="${sub === 'my' ? 'on' : ''}" data-sub="my">내 보험료</button></div></div>
      <div class="scroll">${body}</div>${fab()}${tabbar('diag')}</div>`;
  }


  // ---------- 보험 상품별 진단 (웹뷰) ----------
  function viewPD(i) {
    const p = D.policies[i];
    const n = D.policies.length;
    const pos = { 해지: 0, 조정: 50, 유지: 100 }[p.verdict];
    const lab = (x) => (x < 60 ? '나쁨' : x < 80 ? '보통' : '좋음');
    const j = p.join;
    const seg = state.pdSeg;
    const diag = `
      <div class="wv-card"><h3>상품 종합 의견</h3>
        <p class="desc">상품 진단 결과 부족한 보장범위, 금액, 기간에 대한 확인이 필요해 보입니다.</p>
        <div class="obar">보장범위<div class="tr"><i data-w="${p.scope.pct}">${lab(p.scope.pct)}</i></div></div><p class="desc">${p.scope.text}</p>
        <div class="obar">보장내용<div class="tr"><i data-w="${p.content.pct}">${lab(p.content.pct)}</i></div></div><p class="desc">${p.content.text}</p></div>
      <div class="wv-card"><h3>추가의견</h3><p class="desc">${p.opinion}</p>
        <div class="facts"><div>${I.renew}갱신정보<b>${p.renew}</b></div><div>${I.calClock}남은납입기간<b>${p.remain}</b></div><div>${I.calLink}보장만기<b>${p.until}</b></div></div></div>
      <div class="wv-card"><h3>가입 보장군</h3><div class="chips">${p.groups.map((g) => `<span>${g}</span>`).join('')}</div></div>
      <button class="btn violet" data-go="cov/${i}">보장내역 상세보기</button>`;
    const span = j.endAge - j.startAge;
    const ax = (age) => ((age - j.startAge) / (100 - j.startAge)) * 100;
    const join = `
      <div class="wv-card"><h3>가입정보</h3><div class="ji">
        <span>계약자<i>|</i>${j.contractor}</span><span>피보험자<i>|</i>${j.insured}</span>
        <span>납입주기<i>|</i>${j.cycle}</span><span>납입기간<i>|</i>${j.period}</span>
        <span class="full">갱신정보<i>|</i>${j.renew}</span></div></div>
      <div class="wv-card"><h3>납입현황(납입중)</h3>
        <div class="paybar"><span class="due" style="width:${ax(j.endAge)}%"></span><span class="done" data-w="${ax(j.startAge + span * j.payPct / 100)}"></span></div>
        <div class="payax"><span style="left:4%">${j.startAge}세</span><span class="pct" style="left:${Math.min(ax(j.startAge + span * j.payPct / 100), ax(j.endAge) - 14) + 4}%">${j.payPct}%납입</span><span style="left:${ax(j.endAge) + 2}%">${j.endAge}세</span><span style="left:95%">100세</span></div>
        <div class="rows"><span>계약일<i>|</i>${j.start}</span><span>납입완료일<i>|</i>${j.payEnd}</span><span>보험만기일<i>|</i>${j.expire}</span></div>
        <div class="rows sep"><span>주기별 납입 보험료<i>|</i>${won(p.premium)}(${j.cycle})</span><span>납입한 보험료<i>|</i>${j.paid}</span><span>남은 납입 보험료<i>|</i>${j.left}</span><span>총 납입 보험료<i>|</i>${j.total}</span></div>
        <button class="btn outline" data-toast="납입 상세">납입 상세보기</button></div>
      <div class="wv-card"><h3>상품설명</h3><div class="pdesc">
        <div><div class="t">${I.shieldUser}종합 보장</div><p class="d">질병보험, 상해보험, 운전자보험, 치매보험, 간병(인) 보험 등 종합적인 보장구성이 가능한 보험입니다.</p></div>
        <div><div class="t">${I.lockWon}보험료 고정</div><p class="d">변동되지 않는 고정된 보험료를 정해진 기간 동안 납입하고 보장기간까지 보장받는 형태입니다.</p></div>
        <div><div class="t">${I.rate}공시이율</div><p class="d">금리연동형 보험상품의 적립금에 적용하는 이율로 각 보험사에서 기준금리, 자산이익률 등을 고려하여 산정합니다.</p></div></div></div>`;
    return `<div class="view wv">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>보험 상품별 진단</h1>
        <button class="pager" data-go-replace="pd/${(i + 1) % n}"><b>${pad2(i + 1)}</b> / ${pad2(n)}<span style="width:18px;height:18px;display:inline-block">${I.down}</span></button></div>
      <div class="scroll">
        <div class="wv-card" style="margin-top:14px;padding:0 0 22px">
          <div class="prodtop">${plate(p.insurer)}<div><div class="ins">${p.insurer}</div><div class="pn">${p.name}</div><div class="pp">${p.premium.toLocaleString('ko-KR')} 원</div></div></div>
          <div class="judge"><div class="rail"></div><span style="position:absolute;left:${pos}%;top:0">${I.pin}</span>
            <div class="labels"><span class="${p.verdict === '해지' ? 'on' : ''}">해지</span><span class="${p.verdict === '조정' ? 'on' : ''}">조정</span><span class="${p.verdict === '유지' ? 'on' : ''}">유지</span></div></div></div>
        <div class="sticky-seg"><div class="pseg"><button class="${seg === 'diag' ? 'on' : ''}" data-pdseg="diag">상품진단</button><button class="${seg === 'join' ? 'on' : ''}" data-pdseg="join">가입내용</button></div></div>
        ${seg === 'diag' ? diag : join}
      </div>
      <button class="bottom-cta ad-hide" data-toast="궁금한점 물어보기">궁금한점 물어보기</button></div>`;
  }

  // ---------- 보장내역 (웹뷰) ----------
  function viewCov(i) {
    const p = D.policies[i];
    const seg = state.covSeg;
    const list = D.coverage.map((c) => `
      <div class="wv-card cv-cat ${closedCats.has(c.cat) ? 'closed' : ''}">
        <button class="hd" data-cat="${c.cat}">${c.cat}${I.up}</button>
        <div class="bd">${c.items.map((it) => `
          <div class="cv-item"><h4>${it.name}</h4>
            <div class="rows"><span>회사담보명<i>|</i>${it.co}</span><span>담보상태<i>|</i>정상</span>
              <span class="two"><span>보장금액<i>|</i>${it.amt}</span><span>만기일자<i>|</i>${D.riderExpire}</span></span></div>
            <div class="cv-bar"><i style="width:${it.pct}%"></i></div>
            <div class="cv-ax"><span>${it.amt} 설정</span><span>${it.base}</span></div></div>`).join('')}</div></div>`).join('');
    const riders = `<div class="wv-card" style="padding-top:0;padding-bottom:0">${D.riders.map((r) => `
      <div class="cv-item"><h4>${r.name}</h4><div class="rows">
        <span class="two grid"><span>특약유형<i>|</i>${r.type}</span><span>특약상태<i>|</i>정상</span></span>
        <span class="two grid"><span>보장금액<i>|</i>${r.amt}</span><span>만기일자<i>|</i>${D.riderExpire}</span></span></div></div>`).join('')}</div>`;
    return `<div class="view wv">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>보장내역</h1></div>
      <div class="scroll" data-key="cov-${i}">
        <div class="sticky-seg"><div class="pseg"><button class="${seg === 'list' ? 'on' : ''}" data-covseg="list">보장목록</button><button class="${seg === 'rider' ? 'on' : ''}" data-covseg="rider">특약목록</button></div></div>
        ${seg === 'list' ? list : riders}
      </div>
      <button class="bottom-cta ad-hide" data-toast="궁금한점 물어보기">궁금한점 물어보기</button></div>`;
  }

  // ---------- 보상 ----------
  function viewComp() {
    return `<div class="view" style="background:#f3f4f6">${header('보상').replace('class="hdr"', 'class="hdr" style="background:#fff"')}
      <div class="scroll">
        <div class="comp-top ad-hide"><h2>잠들어 있는 보험금,<br>지금 찾아보세요</h2>
          <div class="art"><img src="img/comp_vault.png" alt=""><div class="qm"><span>?</span><span>?</span><span>?</span>만원</div></div>
          <button class="btn primary" data-go="hidden">숨은 보험금 조회하기</button></div>
        <div class="comp-list"><h3>받을 수 있는 보상, 다 챙기셨나요?</h3>
          <button class="lcard" data-go="claim"><img class="ic54" src="img/comp_claim.svg" alt=""><div class="tx"><b>병원비 간편 청구하기</b><small>실손보험금 간편하게 청구하세요</small></div><span style="width:22px;color:#494d53">${I.right}</span></button>
          <button class="lcard ad-hide" data-go="qna"><img class="ic54" src="img/comp_inquiry.svg" alt=""><div class="tx"><b>보상 문의하기</b><small>손해사정사가 도와드려요</small></div><span style="width:22px;color:#494d53">${I.right}</span></button>
        </div>
        <div class="faq"><button class="lk" data-go="faq">자주 묻는 보상 질문<span>${I.right}</span></button>
          <button class="lk" data-toast="유형별 보상 사례">유형별 보상 사례<span>${I.right}</span></button></div>
        <div style="height:110px"></div>
      </div>${fab()}${tabbar('comp')}</div>`;
  }
  function viewQna() {
    const q = D.qna;
    return `<div class="view qna" style="background:#fff">
      <div class="qna-hd"><button class="back" data-act="back" style="width:24px;color:var(--accent)">${I.back}</button><h1>보상 문의</h1>
        <span style="color:#1d2024">${I.search}</span><span style="color:#1d2024">${I.bell}</span><span style="color:#1d2024">${I.person}</span></div>
      <div class="scroll">
        <div class="qchips">${q.tabs.map(([t, c], k) => `<button class="${k === state.qnaTab ? 'on' : ''}" data-qtab="${k}">${t} (${c.toLocaleString('ko-KR')})</button>`).join('')}</div>
        <div class="qsort"><span>${I.sort} 질문 최신순</span><span>${I.filter} 답변전체</span></div>
        ${q.posts.filter((_, k) => state.qnaTab === 0 || k % (state.qnaTab + 1) !== 1).map((p) => `
          <div class="post"><div class="c">${p.cat}</div><div class="t">${p.title}</div>
            <div class="m"><span>${p.who} · ${p.when} · 조회${p.views}</span><span>댓글0</span></div>
            <div class="ans ${p.answer ? 'on' : ''}"><span>답변</span><p>${p.answer || '답변을 준비 중입니다.'}</p></div></div>`).join('')}
        <div class="pages"><span class="dis">&laquo;</span><span class="dis" style="margin-right:6px">&lsaquo;</span>${[1, 2, 3, 4, 5].map((n) => `<button class="${n === 1 ? 'on' : ''}">${n}</button>`).join('')}<span style="margin-left:6px">&rsaquo;</span><span>&raquo;</span></div>
      </div>
      <div class="qna-cta"><button class="btn" data-toast="문의 작성">문의하기</button></div></div>`;
  }

  // ---------- 상품 ----------
  function viewShop() {
    const cat = state.shopCat;
    const list = D.popular[cat] || [];
    return `<div class="view" style="background:#f3f4f6">${header('상품').replace('class="hdr"', 'class="hdr" style="background:#fff"')}
      <div class="scroll">
        <div class="shop-peer"><div class="q"><button class="peer-t" data-act="filter-open"><u>${state.peer ? `${state.peer.age} ${state.peer.sex}이` : '내 또래가'}</u> <span style="display:inline-block;width:16px;vertical-align:-2px">${I.down}</span></button><br>가장 많이 가입한 보험은? ${helpIco.replace('class="help"', 'class="help" style="vertical-align:-4px"')}</div>
          <div class="carousel" data-pos="${state.peerPos || 0}">${D.peerTop.slice(-2).concat(D.peerTop, D.peerTop.slice(0, 2)).map((c) => `
            <button class="pcard" style="background-image:url(img/${c.card}.png)" data-go="peer/${c.rank - 1}"><span class="rk">${c.rank}</span>
              <div class="ins">${c.insurer}</div><div class="nm">${c.name.replace(/\(/g, '⁠(')}</div><span class="tag">${c.tag}</span></button>`).join('')}</div>
          <p class="peer-cnt">보닥 회원 <b>${D.peerTop[state.peerPos || 0].joined.toLocaleString('ko-KR')}명</b>이 가입했어요</p></div>
        <div class="shop-pop"><div class="t">카테고리별 인기 상품 모아봤어요${helpIco}</div>
          <div class="cchips">${D.categories.map((c) => `<button class="${c === cat ? 'on' : ''}" data-cat2="${c}">${c}</button>`).join('')}</div>
          ${list.map(([ins, nm], k) => `<button class="rank" data-go="item/${cat}/${k}"><span class="n">${k + 1}</span>${plate(ins)}<div class="tx"><b class="ell">${nm}</b><small>${ins}</small></div></button>`).join('')}
          <button class="more-c" data-toast="더보기">더보기<span style="width:16px;display:inline-block">${I.down}</span></button></div>
        <div class="shop-rec"><div class="t">보닥 회원만을 위한 추천 상품 ${helpIco.replace('class="help"', 'class="help" style="vertical-align:-4px"')}</div>
          <div class="recbox"><p>꼼꼼하게 비교해서<br>딱 맞는 보험 알려드려요!</p><span class="go">추천 보험 보기</span>
            <img class="mag" src="img/rec_searchemoji.png" alt=""></div></div>
        <div style="height:100px"></div>
      </div>${tabbar('shop')}</div>`;
  }
  // 상품 상세 — 카테고리 목록(#item/카테고리/순번) 또는 인기 캐러셀 카드(#peer/순번)에서 진입
  function viewItem(cat, k, peerIdx) {
    const pk = peerIdx != null ? D.peerTop[peerIdx] : null;
    const list = D.popular[pk ? pk.cat : cat] || [];
    const [ins, nm] = pk ? [pk.insurer, pk.full || pk.name] : (list[k] || ['', '']);
    const d = Object.assign({}, D.productDetail, pk && pk.detail);
    const maleHigh = d.male > d.female;
    const sex = state.chartMode === 'sex';
    const bars = sex ? [['남성', d.male, maleHigh ? 'f' : 'm'], ['여성', d.female, maleHigh ? 'm' : 'f']] : [['20대', 34, 'm'], ['30대', 78, 'f'], ['40대', 52, 'm'], ['50대', 21, 'm']];
    const title = sex ? `<em>${maleHigh ? '남성' : '여성'}</em> 가입률이<br>더 높아요` : `<em>${d.ageTop}</em> 가입률이<br>가장 높아요`;
    const sims = pk ? (pk.similar || []) : list.filter((_, x) => x !== k).slice(0, 2).map(([si, sn]) => [si, sn, cat + '보험']);
    return `<div class="view" style="background:#f3f4f6">
      <div class="pd-hd"><button data-act="back" style="width:24px">${I.lt}</button>보험 상품</div>
      <div class="scroll">
        <div class="pd-top">${pk ? `<span class="top-rk"><small>TOP</small>${pk.rank}</span>` : ''}${plate(ins)}<div class="ins">${ins}</div><div class="nm">${nm}</div>
          <div class="avg"><div class="h">보닥 회원 평균 정보</div>
            <div class="r">월 납입 금액<b>${d.avgPremium}</b></div><div class="r" style="margin-top:6px">유지 기간<b>${d.avgYears}</b></div></div>
          <div class="pd-more">상품 설명 보기 <span style="width:14px;display:inline-block;vertical-align:-2px">${I.down}</span></div></div>
        <div class="chart-sec"><div class="hd"><p>${title}</p>
            <div class="mini-seg"><button class="${sex ? 'on' : ''}" data-chart="sex">성별</button><button class="${sex ? '' : 'on'}" data-chart="age">연령대별</button></div></div>
          <div class="chart"><div class="gl" style="top:0"><span>100%</span></div><div class="gl" style="top:50%"><span>50%</span></div><div class="gl" style="top:100%"><span>0%</span></div>
            <div class="bars2" style="gap:${sex ? 90 : 34}px">${bars.map(([, v, c]) => `<span class="b ${c}" data-h="${v}"></span>`).join('')}</div></div>
          <div class="chart-ax" style="gap:${sex ? 98 : 40}px">${bars.map(([l, , c]) => `<span class="${c === 'f' ? 'on' : ''}">${l}</span>`).join('')}</div></div>
        <div class="share"><p>가족, 친구에게 추천해주세요</p><button data-toast="링크 공유">${I.link}링크 공유하기</button></div>
        <div class="similar"><div class="t">살펴본 상품과 유사한 인기 보험이에요</div>
          ${sims.map(([si, sn, tag]) => `<div class="simcard">${plate(si)}<div><small>${tag}</small><b class="ell">${sn}</b><span class="sins">${si}</span></div></div>`).join('')}
          ${pk ? `<button class="to-cat" data-tab="shop">카테고리별 인기 상품 보러가기 ›</button>` : ''}</div>
      </div></div>`;
  }

  // ---------- 보험 종합 진단 (진단 탭 「더보기」) ----------
  // 영상에서 이 흐름 중간에 뜬 「2세대 실손보험…」·「닫기 전에 한 가지만」 팝업은 인앱메시지라 넣지 않는다
  function venn(v) {
    // 원은 반투명으로 겹치고, 글자는 원 위 별도 층에 둬서 겹친 쪽 원에 가리지 않게 한다
    return `<div class="venn"><span class="c a" style="background:${v.ca}"></span><span class="c b" style="background:${v.cb}"></span><span class="lb a">${v.la}</span><span class="lb b">${v.lb}</span></div>
      <div class="vlegend"><div><small style="color:${v.ka}">${v.ka2}</small><b style="color:${v.ka}">${v.va}</b></div><div><small style="color:${v.kb}">${v.kb2}</small><b style="color:${v.kb}">${v.vb}</b></div></div>`;
  }
  function viewTotal() {
    const T = D.total;
    const tabs = [['pay', '월 납입금액'], ['scope', '보장범위'], ['content', '보장내용']];
    return `<div class="view wv">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>보험 종합 진단</h1></div>
      <div class="scroll" data-spy="1">
        <div class="sticky-seg"><div class="pseg">${tabs.map(([k, l], x) => `<button class="${x === 0 ? 'on' : ''}" data-jump="${k}">${l}</button>`).join('')}</div></div>
        ${tabs.map(([k]) => `<div class="wv-card tsec" id="sec-${k}">${venn(T[k].venn)}<h3>${T[k].title}</h3><p class="desc">${T[k].desc}</p></div>`).join('')}
        <button class="btn violet" data-go="covall">보장내역 상세보기</button>
      </div>
      <button class="bottom-cta ad-hide" data-toast="궁금한점 물어보기">궁금한점 물어보기</button></div>`;
  }
  // 전체 보장내역 — 전체/보유/필요로 거르고, 담보마다 필요(위)·보유(아래) 두 막대
  function viewCovAll() {
    const f = state.covAll || 'all';
    const pass = (it) => f === 'all' || (f === 'have' ? it.havePct > 0 : it.havePct < 100);
    const cats = D.coverAll.map((c) => ({ cat: c.cat, items: c.items.filter(pass) })).filter((c) => c.items.length);
    return `<div class="view wv">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>보장내역</h1></div>
      <div class="scroll">
        <div class="sticky-seg"><div class="pseg">${[['all', '전체'], ['have', '보유'], ['need', '필요']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-covall="${k}">${l}</button>`).join('')}</div></div>
        ${cats.map((c) => `<div class="wv-card cv-cat ${closedCats.has('A' + c.cat) ? 'closed' : ''}"><button class="hd" data-cat="A${c.cat}">${c.cat}${I.up}</button><div class="bd">
          ${c.items.map((it) => `<div class="cv-item ca"><h4>${it.name}</h4><p class="base">기본 보장금액: ${it.base}</p>
            <div class="ca-need"><span>~${it.until}</span><div class="cv-bar n"><i style="width:100%"></i></div><span>${it.need}</span></div>
            <div class="cv-bar h"><i style="width:${it.havePct}%"></i></div><div class="cv-ax"><span>${it.have}</span><span>~${it.until}</span></div></div>`).join('')}
        </div></div>`).join('')}
      </div>
      <button class="bottom-cta ad-hide" data-toast="궁금한점 물어보기">궁금한점 물어보기</button></div>`;
  }

  // ---------- 숨은 보험금 조회 (보상 탭·홈 카드에서 진입) ----------
  // 영상에서 이 화면 위에 뜬 「앞으로 받을 보험금도 확인해보세요」 팝업은 인앱메시지라 넣지 않는다
  function viewHidden() {
    const qa = [
      ['ns_question.svg', '숨은 보험금은 무엇인가요?', '보험 계약상 받을 수 있지만, 아직 청구하지 않아<br>수령하지 않은 보험금을 말해요.'],
      ['ns_shield.svg', '숨은 보험금에 포함되는 항목은?', '건강진단자금, 자녀 교육비, 축하금,<br>만기 환급금은 물론, 해지나 만기 후 돌려받지 않은<br>환급금(휴면 보험금)도 숨은 보험금에 포함돼요.'],
      ['ns_moneybag2.svg', '아직도 많은 숨은 보험금이 남아 있어요.', '최근 1년간 4조 원이 넘는 숨은 보험금이 환급되었고,<br>아직도 11조 원 이상이 남아있어요. (25년 기준)'],
      ['ns_magnifier.svg', '보닥에서 숨은 보험금을 찾으려면?', '1. 숨은 보험금 내역 조회<br>2. 해당 보험사에 문의<br>3. 해당 보험사에 보험금 지급 요청'],
      ['ns_call.svg', '관련 문의', '해당 보험사로 문의해주세요.'],
    ];
    return `<div class="view" style="background:#fff">
      <div class="pd-hd"><button data-act="back" style="width:24px">${I.lt}</button>숨은 보험금 조회</div>
      <div class="scroll">
        <div class="hid-hero"><h2>아직 청구하지 않은<br><em>숨은 보험금</em>이 있을 수 있어요.</h2><img src="img/ns_moneybag.png" alt=""></div>
        <div class="hid-qa">${qa.map(([ic, t, d]) => `<div class="it"><div class="t"><img src="img/${ic}" alt="">${t}</div><p>${d}</p></div>`).join('')}</div>
        <div class="hid-share"><p>가족, 친구도 숨은 보험금을<br>찾을 수 있게 공유해 보세요!</p><button data-toast="링크 공유">${I.link}링크 공유하기</button></div>
        <div style="height:120px"></div>
      </div>
      <div class="fixed-cta"><button class="btn primary" data-act="hidden-run">숨은 보험금 조회하기</button></div></div>`;
  }
  function viewHiddenResult() {
    return `<div class="view" style="background:#f9f9f9">
      <div class="pd-hd"><button data-act="back" style="width:24px">${I.lt}</button>숨은 보험금 조회</div>
      <div class="scroll" style="display:flex;flex-direction:column">
        <p class="hid-date">${D.updated} 조회 기준</p>
        ${hiddenTotal ? `<div class="hid-found">
          <h2>숨은 보험금<br>총 <em>${won(hiddenTotal)}</em>이 있어요.</h2>
          ${D.hidden.map((h) => `<button class="hf-item" data-toast="${h.ins} 숨은 보험금 상세">${plate(h.ins)}
            <span class="tx"><b>${h.ins}</b><small>${h.product}</small><span class="am">${won(h.amt)}${h.tags.map((t) => `<i class="${t === '휴면' ? 'g' : 'o'}">${t}</i>`).join('')}</span></span>${I.right}</button>`).join('')}
          <p class="hf-q">어떤 보험금이 조회되나요? <u data-act="hid-crit">숨은 보험금 조회 기준</u></p>
          <button class="btn outline-b pill" data-act="hidden-run">숨은 보험금 다시 조회하기</button></div>` : `<div class="hid-res"><img class="clap" src="img/ns_clap.svg" alt=""><h2>숨은 보험금이 없어요.</h2><p>보험금을 잘 관리하고 계시네요.</p>
          <button class="btn primary pill" data-tab="diag">보험 진단하기</button>
          <button class="btn outline-b pill" data-act="hidden-run">숨은 보험금 다시 조회하기</button></div>`}
        <div class="hid-note">${['숨은 보험금 조회 결과는 마이데이터 기준으로 제공되며, 일부 보험은 누락될 수 있습니다.', '표시된 금액은 아직 지급되지 않은 보험금이며, 실제 지급 가능 여부는 계약 조건 및 보험사 심사에 따라 달라질 수 있습니다.', '보험금 청구는 해당 보험사를 통해 직접 진행해야 하며, 자세한 사항은 보험사에 문의해 주세요.'].map((t) => `<p><img src="img/ic_punct.svg" alt="">${t}</p>`).join('')}</div>
      </div></div>`;
  }

  // ---------- 병원비 청구 ----------
  function viewClaim() {
    const rows = [['hospital', 'person', '병원비 청구하기'], ['dental', 'people', '치과의료비 청구하기'], ['pharmacy', 'medkit', '약제비 청구하기']];
    return `<div class="view" style="background:#fff;font-family:'Noto Sans KR',sans-serif">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>병원비 청구</h1><button class="hd-link" data-toast="청구내역">청구내역</button></div>
      <div class="scroll">
        <h2 class="clm-h">${D.userName}님,<br>실손보험금 간편하게 청구하세요.</h2>
        ${rows.map(([k, ic, t]) => `<button class="clm-row" data-go="search/${k}">${I[ic]}<span>${t}</span>${I.right}</button>`).join('')}
        <ol class="clm-note"><li>본 서비스는 제휴사(지앤넷)에서 직접 보험 청구정보 수집 및 서비스를 제공합니다.</li><li>서비스 이용관련 자세한 내용은 (주)지앤넷 고객센터(<span>1588-1709</span>)로 문의해주세요.</li></ol>
      </div>
      <div class="fixed-cta center"><button class="btn ghost-pill" data-toast="병원비 청구 안내">병원비 청구 알아보기</button></div></div>`;
  }
  function viewSearch(kind) {
    const map = { hospital: ['병원비 청구하기', '병원', '을', 'claim_hospital', '병(의)원명', '중앙의원 강서'], dental: ['치과의료비 청구하기', '치과', '를', 'claim_tooth', '치과명', '보닥치과 강서'], pharmacy: ['약제비 청구하기', '약국', '을', 'claim_medicine', '약국명', '보닥약국 강남'] };
    const k = map[kind] || map.hospital;
    return `<div class="view" style="background:#fff;font-family:'Noto Sans KR',sans-serif">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>병원비 청구</h1><button class="hd-link" data-act="claim-home">처음으로</button></div>
      <div class="scroll"><div class="srch">
        <div class="top"><span class="crumb">${I.chevC}${k[0]}</span><span class="cs">${I.headset}</span></div>
        <h2>다녀온 ${k[1]}${k[2]} 검색하세요</h2>
        <label class="box">${I.search}<input data-input="srch" placeholder="${k[1]} 검색"></label>
        <p class="hint">* ${k[4]}과 주소로 검색하시면 쉽게 찾을 수 있습니다.<br>예) ${k[5]}</p>
        <div class="def">
          <button class="pick" ${kind === 'dental' ? 'data-go="region"' : `data-toast="${k[1]}목록"`}><span><small>출력물 없이 청구 가능한 ${k[1]}</small><b>${k[1]}목록에서 선택</b></span><img src="img/${k[3]}.png" alt=""></button>
          <p class="none">검색 결과가 없나요? 사진으로 청구해 보세요.</p>
          <button class="photo" data-toast="사진으로 청구">${I.camera}${kind === 'hospital' ? '사진청구' : '사진으로 청구하기'}</button>
        </div></div></div></div>`;
  }
  function viewRegion() {
    return `<div class="view" style="background:#fff;font-family:'Noto Sans KR',sans-serif">
      <div class="pd-hd" style="justify-content:space-between"><button data-act="back" style="width:24px">${I.lt}</button><b style="font-weight:500">치과 찾기</b><span style="width:24px"></span></div>
      <p class="rg-sub">다녀온 치과를 찾고 서류없는 청구 해보세요</p>
      <div class="scroll">${D.regions.map(([r, n], x) => `<button class="rg ${x === 0 ? 'on' : ''}" data-toast="${r} 치과 목록">${r}<small>(${n})</small></button>`).join('')}</div></div>`;
  }

  // ---------- 자주 묻는 보상 질문 ----------
  // 영상에서 이 화면 위에 뜬 「자동차 사고 보상 서비스」 팝업은 인앱메시지라 넣지 않는다
  function viewFaq() {
    const top = D.faqs.slice(0, 5);
    return `<div class="view" style="background:#fff;font-family:'Noto Sans KR',sans-serif">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>자주 묻는 보상 질문</h1></div>
      <div class="scroll">
        <label class="faq-srch"><input placeholder="궁금한 점을 검색해 보세요.(예: 암)"><span>${I.search}</span></label>
        <div class="faq-sec"><b>보상별 궁금증을 해결하세요.</b><button data-go="faqcat/전체">전체보기 ›</button></div>
        <div class="faq-grid">${D.faqCats.map(([c, ic]) => `<button data-go="faqcat/${c}">${I['f_' + ic]}${c}</button>`).join('')}</div>
        <div class="faq-top"><b>자주 묻는 질문 TOP 5</b>
          ${top.map((f, x) => `<button class="fq" data-go="faqq/${D.faqs.indexOf(f)}"><span class="hd"><em>Q${x + 1}</em><small>${f.cat}|${f.sub}</small></span><span class="qq">${f.q}</span></button>`).join('')}</div>
        <div style="height:40px"></div>
      </div></div>`;
  }
  function viewFaqCat(cat) {
    const list = D.faqs.filter((f) => cat === '전체' || f.cat === cat);
    return `<div class="view" style="background:#fff;font-family:'Noto Sans KR',sans-serif">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>${cat === '전체' ? '자주 묻는 보상 질문' : cat + ' 관련 질문'}</h1></div>
      <div class="scroll">${list.map((f) => `<button class="fq-row" data-go="faqq/${D.faqs.indexOf(f)}"><small>${f.cat}|${f.sub}</small><span>${f.q}</span></button>`).join('')}</div></div>`;
  }
  function viewFaqQ(i) {
    const f = D.faqs[i] || D.faqs[0];
    const rel = D.faqs.filter((x) => x.cat === f.cat && x !== f).concat(D.faqs.filter((x) => x.cat !== f.cat)).slice(0, 3);
    return `<div class="view" style="background:#fff;font-family:'Noto Sans KR',sans-serif">
      <div class="wv-hd"><button class="back" data-act="back">${I.back}</button><h1>자주 묻는 보상 질문</h1></div>
      <div class="scroll">
        <div class="fqd"><small>${f.cat}|${f.sub}</small><h2>${f.q}</h2><p>${f.a}</p></div>
        <div class="fqr"><b>${f.cat} 관련 자주 묻는 질문</b>
          ${rel.map((r) => `<button data-go-replace="faqq/${D.faqs.indexOf(r)}">${r.q}</button>`).join('')}
          <button class="all" data-go="faqcat/${f.cat}">${f.cat} 관련 질문 모두 보기</button></div>
      </div></div>`;
  }

  // ---------- 상품 탭 필터 시트 (「내 또래가」 → 연령대·성별) ----------
  // 인앱메시지가 아니라 앱 화면 기능이라 넣는다
  function filterSheet() {
    const ages = ['20대', '30대', '40대', '50대', '60대', '70대 이상'];
    const f = state.peerDraft;
    closeFilter();
    const wrap = document.createElement('div');
    wrap.id = 'filter-layer';
    wrap.innerHTML = `<div class="dim" data-act="filter-close"></div><div class="fsheet">
      <div class="fh"><b>필터</b><button data-act="filter-close">${I.close}</button></div>
      <p class="fl">연령대</p><div class="fchips">${ages.map((a) => `<button class="${f.age === a ? 'on' : ''}" data-fage="${a}">${a}</button>`).join('')}</div>
      <div class="fsep"></div>
      <p class="fl">성별</p><div class="fchips">${['남성', '여성'].map((g) => `<button class="${f.sex === g ? 'on' : ''}" data-fsex="${g}">${g}</button>`).join('')}</div>
      <div class="fbtns"><button class="reset" data-act="filter-reset">초기화</button><button class="ok" data-act="filter-ok">확인</button></div></div>`;
    document.querySelector('.phone').appendChild(wrap);
  }
  // 숨은 보험금 조회 기준 바텀시트 — Figma [바텀시트]숨은 보험금 조회 기준(4870:56150) 문구 그대로
  function critSheet() {
    const old = document.getElementById('crit-layer'); if (old) old.remove();
    const w = document.createElement('div');
    w.id = 'crit-layer';
    w.innerHTML = `<div class="dim" data-act="crit-close"></div><div class="csheet">
      <h3>숨은 보험금, 어떻게 나뉘나요?</h3>
      <div class="cs"><b>숨은 보험금이란?</b><p>보험사 기준으로 지급 금액이 확정되었으나 찾아가지 않은 보험금입니다. 중도보험금, 만기보험금, 휴면보험금의 유형이 있습니다.</p></div>
      <div class="cs"><b>미청구 보험금</b><p><em>중도 보험금:</em> 만기는 안됐지만, 보험계약기간 중 특정 시기가 되고, 일정 조건을 만족하면 지급되는 보험금 (예시: 건강진단자금, 축하금, 자녀교육자금 등)</p><p><em>만기 보험금:</em> 만기는 지났지만 보험금 청구의 소멸시효(2~3년)가 아직 완성되기 전의 보험금</p></div>
      <div class="cs"><b>휴면 보험금</b><p>보험금 청구권 소멸 시효가 지난 후에도 찾아가지 않아 보험 회사 또는 서민금융진흥원에서 보관하고 있는 보험금</p></div>
      <button class="btn neutral" data-act="crit-close">닫기</button></div>`;
    document.querySelector('.phone').appendChild(w);
  }
  function closeFilter() { const s = document.getElementById('filter-layer'); if (s) s.remove(); }

  // ---------- 라우터 ----------
  function render(route, anim) {
    const [name, a, b] = route.split('/');
    let html;
    if (name === 'diag') html = viewDiag();
    else if (name === 'pd') html = viewPD(+a || 0);
    else if (name === 'cov') html = viewCov(+a || 0);
    else if (name === 'comp') html = viewComp();
    else if (name === 'qna') html = viewQna();
    else if (name === 'shop') html = viewShop();
    else if (name === 'item') html = viewItem(decodeURIComponent(a), +b || 0);
    else if (name === 'peer') html = viewItem(null, 0, +a || 0);
    else if (name === 'total') html = viewTotal();
    else if (name === 'covall') html = viewCovAll();
    else if (name === 'hidden') html = viewHidden();
    else if (name === 'hidden-result') html = viewHiddenResult();
    else if (name === 'claim') html = viewClaim();
    else if (name === 'search') html = viewSearch(a);
    else if (name === 'region') html = viewRegion();
    else if (name === 'faq') html = viewFaq();
    else if (name === 'faqcat') html = viewFaqCat(decodeURIComponent(a || '전체'));
    else if (name === 'faqq') html = viewFaqQ(+a || 0);
    else html = viewHome();
    // 떠나는 화면의 스크롤 위치를 적어 두었다가 뒤로 돌아올 때 되살린다 (실제 앱처럼 보던 자리 유지)
    const prev = $screen.querySelector('.scroll');
    if (prev && lastRoute) scrollMemo[lastRoute] = prev.scrollTop;
    lastRoute = route;
    $screen.innerHTML = html;
    const v = $screen.firstElementChild;
    if (anim) v.classList.add('enter-' + anim);
    if (anim === 'pop' && scrollMemo[route]) $screen.querySelector('.scroll').scrollTop = scrollMemo[route];
    afterRender(name);
  }
  // 그린 뒤 처리 — 게이지·막대를 0에서 목표값까지 차오르게 한다
  function afterRender(name) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $screen.querySelectorAll('.arc').forEach((el) => { el.style.strokeDashoffset = el.dataset.len * (1 - D.score.value / 100); });
      $screen.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
      $screen.querySelectorAll('[data-h]').forEach((el) => { el.style.height = el.dataset.h + '%'; });
    }));
    $screen.querySelectorAll('.obar i, .paybar .done').forEach((el) => { el.style.transition = 'width 1s cubic-bezier(.2,.8,.2,1) .15s'; el.style.width = '0'; });
    const spy = $screen.querySelector('.scroll[data-spy]');
    if (spy) spy.addEventListener('scroll', () => {
      // 화면 위쪽에 걸친 섹션의 탭을 켠다 — 영상처럼 내리면 「보장범위」「보장내용」으로 바뀐다
      let on = 'pay';
      spy.querySelectorAll('.tsec').forEach((sec) => { if (sec.offsetTop - 90 <= spy.scrollTop) on = sec.id.slice(4); });
      if (spy.scrollTop + spy.clientHeight >= spy.scrollHeight - 4) on = 'content';
      spy.querySelectorAll('[data-jump]').forEach((b) => b.classList.toggle('on', b.dataset.jump === on));
    }, { passive: true });
    const car = $screen.querySelector('.carousel');
    if (car) {
      // 순환 캐러셀 — 앞뒤로 2장씩 복제해 둔 목록에서 1위 카드를 가운데에 놓고 시작 (원본 앱처럼 양옆에 카드가 걸쳐 보이게)
      const n = D.peerTop.length;
      const step = () => car.children[1].offsetLeft - car.children[0].offsetLeft;
      const keep = car.dataset.pos ? +car.dataset.pos : 0;
      car.scrollLeft = (keep + 2) * step();
      // 원본 앱처럼 가운데 카드만 195px, 양옆은 60%(117px)로 줄여 보여준다 — 스크롤 위치에 따라 연속으로
      const sizeCards = () => {
        const mid = car.scrollLeft + car.clientWidth / 2;
        [...car.children].forEach((el) => {
          const d = Math.min(1, Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid) / step());
          el.style.transform = `scale(${1 - 0.4 * d})`;
        });
      };
      sizeCards();
      car.addEventListener('scroll', () => requestAnimationFrame(sizeCards), { passive: true });
      let t;
      car.addEventListener('scroll', () => {
        const idx = Math.round(car.scrollLeft / step());
        const real = ((idx - 2) % n + n) % n;
        state.peerPos = real;
        // 가운데 카드의 가입자 수로 아래 문구를 바꾼다
        $screen.querySelector('.peer-cnt b').textContent = D.peerTop[real].joined.toLocaleString('ko-KR') + '명';
        // 복제 구간에 멈추면 같은 카드의 진짜 자리로 몰래 옮겨 끝없이 넘어가게 한다
        clearTimeout(t);
        t = setTimeout(() => {
          if (idx < 2 || idx >= n + 2) {
            car.style.scrollSnapType = 'none';
            car.scrollLeft = (real + 2) * step();
            requestAnimationFrame(() => { car.style.scrollSnapType = ''; });
          }
        }, 140);
      }, { passive: true });
    }
  }
  const cur = () => location.hash.slice(1) || 'home';
  function go(route) { pendingAnim = 'push'; stack.push(route); location.hash = route; }
  function replace(route) { pendingAnim = 'fade'; stack[stack.length - 1] = route; history.replaceState(null, '', '#' + route); render(route, 'fade'); }
  function tab(name) { closeFilter(); { const c = document.getElementById('crit-layer'); if (c) c.remove(); } stack = [name]; pendingAnim = 'fade'; if (cur() === name) render(name, 'fade'); else location.hash = name; }
  function back() { if (stack.length > 1) { history.back(); } else tab('home'); }
  window.addEventListener('hashchange', () => {
    const r = cur();
    let anim = pendingAnim;
    pendingAnim = null;
    if (!anim) {
      // 브라우저 뒤로가기·우리 back 버튼 — 스택에서 하나 빼고 돌아오는 애니메이션
      if (stack.length > 1 && stack[stack.length - 2] === r) { stack.pop(); anim = 'pop'; } else { stack.push(r); anim = 'push'; }
    }
    render(r, anim);
  });

  // ---------- 클릭 위임 ----------
  let toastTimer;
  function toast(msg) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.querySelector('.phone').appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1600);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, [data-act], [data-go], [data-tab]');
    if (!el) return;
    const ds = el.dataset;
    if (ds.tab) {
      if (ds.tab === 'health') return toast('건강 탭은 프로토타입 범위 밖이에요');
      if (ds.sub) state.diagSub = ds.sub;
      else if (ds.tab === 'diag' && !el.closest('.tabbar')) state.diagSub = 'total';
      return tab(ds.tab);
    }
    if (ds.go) { if (ds.go.startsWith('pd/')) state.pdSeg = 'diag'; if (ds.go.startsWith('cov/')) { state.covSeg = 'list'; closedCats.clear(); } return go(ds.go); }
    if (ds.goReplace) return replace(ds.goReplace);
    if (ds.sub) { state.diagSub = ds.sub; return render('diag', null); }
    if (ds.pdseg) { state.pdSeg = ds.pdseg; return keepScroll(() => render(cur(), null), '.sticky-seg'); }
    if (ds.covall) { state.covAll = ds.covall; return render('covall', null); }
    if (ds.jump) { const sc = $screen.querySelector('.scroll'); const sec = sc.querySelector('#sec-' + ds.jump); sc.scrollTo({ top: sec.offsetTop - 70, behavior: 'smooth' }); return; }
    if (ds.covseg) { state.covSeg = ds.covseg; return render(cur(), null); }
    if (ds.cat) { closedCats.has(ds.cat) ? closedCats.delete(ds.cat) : closedCats.add(ds.cat); el.closest('.cv-cat').classList.toggle('closed'); return; }
    if (ds.cat2) { state.shopCat = ds.cat2; return keepScroll(() => render('shop', null)); }
    if (ds.qtab) { state.qnaTab = +ds.qtab; return keepScroll(() => render('qna', null)); }
    if (ds.chart) { state.chartMode = ds.chart; return keepScroll(() => render(cur(), null)); }
    if (ds.act === 'back') return back();
    if (ds.act === 'hidden-run') {
      // 조회 중 화면을 잠깐 보여준 뒤 결과로 — 실제 앱의 로딩 흐름 흉내
      const v = $screen.firstElementChild;
      const ld = document.createElement('div');
      ld.className = 'loading';
      ld.innerHTML = '<span class="spin"></span><p>숨은 보험금을 찾고 있어요</p>';
      v.appendChild(ld);
      setTimeout(() => { if (cur() === 'hidden-result') replace('hidden-result'); else go('hidden-result'); }, 1400);
      return;
    }
    // 「처음으로」 — 스택에서 병원비 청구 첫 화면까지 되감는다
    // 브라우저 방문 기록도 같은 수만큼 되돌려야 이후 뒤로가기가 어긋나지 않는다
    if (ds.act === 'claim-home') {
      let k = 0;
      while (stack.length > 1 && stack[stack.length - 1] !== 'claim') { stack.pop(); k++; }
      if (!k) return;
      pendingAnim = 'pop';
      return history.go(-k);
    }
    if (ds.act === 'hid-crit') return critSheet();
    if (ds.act === 'crit-close') { const c = document.getElementById('crit-layer'); if (c) c.remove(); return; }
    if (ds.act === 'filter-open') { state.peerDraft = Object.assign({}, state.peer || { age: '30대', sex: '남성' }); return filterSheet(); }
    if (ds.act === 'filter-close') return closeFilter();
    if (ds.act === 'filter-reset') { state.peerDraft = { age: '30대', sex: '남성' }; return filterSheet(); }
    if (ds.act === 'filter-ok') { state.peer = Object.assign({}, state.peerDraft); closeFilter(); return keepScroll(() => render('shop', null)); }
    if (ds.fage) { state.peerDraft.age = ds.fage; return filterSheet(); }
    if (ds.fsex) { state.peerDraft.sex = ds.fsex; return filterSheet(); }
    if (ds.act === 'ended') { state.endedOpen = !state.endedOpen; el.closest('.acc').classList.toggle('open'); return; }
    if (ds.toast) return toast(`「${ds.toast}」 화면은 프로토타입 범위 밖이에요`);
  });
  // 같은 화면을 다시 그릴 때 스크롤 위치를 지킨다 — 세그먼트가 붙어 있던 자리면 그 위치로
  function keepScroll(fn, stickySel) {
    const sc = $screen.querySelector('.scroll');
    const top = sc ? sc.scrollTop : 0;
    fn();
    const sc2 = $screen.querySelector('.scroll');
    if (!sc2) return;
    if (stickySel) {
      const st = sc2.querySelector(stickySel);
      sc2.scrollTop = Math.min(top, st ? st.offsetTop : top);
    } else sc2.scrollTop = top;
  }

  // ---------- 폰 프레임 축소 ----------
  function fit() {
    const ph = document.querySelector('.phone');
    if (innerWidth <= 480) { ph.style.transform = ''; return; }
    const s = Math.min((innerHeight - 48) / 792, (innerWidth - 48) / 360, 1.25);
    ph.style.transform = `scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  // 상태바 시계
  const clock = () => { const d = new Date(); document.getElementById('clock').textContent = `${d.getHours()}:${pad2(d.getMinutes())}`; };
  clock(); setInterval(clock, 30000);

  stack = [cur()];
  render(cur(), 'fade');
})();
