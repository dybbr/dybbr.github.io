// ==========================================================
// ⚾ 대연초 야구부 관리 시스템 통합 백엔드 API (v2.36.0)
// ==========================================================
// ★ API_KEY 는 코드에 적지 않고 「프로젝트 설정 → 스크립트 속성」의 API_KEY 에 넣어 둡니다 (v2.36.0~).
//   값은 index.html / player.html 의 API_KEY 와 "같은 값"이어야 합니다. 속성이 비어 있으면 모든 요청을 거절합니다.
var API_KEY = PropertiesService.getScriptProperties().getProperty("API_KEY") || null;

var ALLOWED_POST_ACTIONS = ["login", "logout", "uploadPhoto", "deletePhoto", "submitOrder", "registerContact", "setUniformActive", "setJerseyColors", "changeAdminPw", "updatePlayerInfo", "saveEvents", "deleteEvent", "saveNotice", "deleteNotice", "saveVenue", "deleteVenue"];   // v2.14.0: 실시간 접속 알림(presence) 없앰 · v2.15.0: 보안 활동 로그(logActivity) 없앰 · v2.20.0: 공지 읽음(viewNotice) 없앰
var ALLOWED_ORDER_ITEMS = ["모자", "바지 (허리)", "바지 (기장)", "유니폼상의", "여름훈련티", "겨울훈련티", "바람막이", "풀오버", "겨울점퍼"];

// ★ 1. 드라이브 권한 및 폴더 생성 테스트 함수
function testDriveAuth() {
  DriveApp.getRootFolder();
  var folderName = "대연초_선수사진";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  Logger.log("✅ 드라이브 연동 정상 동작 확인!");
}

// ★ 2. GID로 시트 찾기 헬퍼
function getSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(gid)) return sheets[i];
  }
  return null;
}

// ★ 3. 선수 명단 시트 스마트 탐색 (GID: 1653839889)
function getRosterSheet(ss) {
  return getSheetByGid(ss, "1653839889") ||
         ss.getSheetByName("명단") ||
         ss.getSheetByName("선수명단") ||
         ss.getSheetByName("대연초 야구부 명단 데이터") ||
         ss.getSheets()[0];
}

// ★ 4. 유니폼 시트 스마트 탐색 (GID: 1881893260)
function getUniformSheet(ss) {
  return getSheetByGid(ss, "1881893260") ||
         ss.getSheetByName("유니폼 의류 신청정보") ||
         ss.getSheetByName("유니폼_주문접수") ||
         ss.getSheetByName("유니폼의류신청정보") ||
         (ss.getSheets().length >= 2 ? ss.getSheets()[1] : null);
}

// ★ 5. 비상연락망 시트 스마트 탐색 (GID: 812608822)
function getContactSheet(ss) {
  return getSheetByGid(ss, "812608822") ||
         ss.getSheetByName("학부모 비상연락망") ||
         ss.getSheetByName("학부모비상연락망") ||
         (ss.getSheets().length >= 3 ? ss.getSheets()[2] : null);
}

// ★ 6. 헤더 컬럼 유연 매칭 (띄어쓰기 무시)
function findColIdx(headers, targetNames) {
  if (!Array.isArray(targetNames)) targetNames = [targetNames];
  for (var i = 0; i < headers.length; i++) {
    var cleanHeader = String(headers[i] || '').replace(/\s+/g, '');
    for (var j = 0; j < targetNames.length; j++) {
      var cleanTarget = String(targetNames[j] || '').replace(/\s+/g, '');
      if (cleanHeader === cleanTarget) return i;
    }
  }
  return -1;
}

// ★ 7. 공통 헬퍼
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 🔢 v2.23.0: 묶음(명단 · 일정 · 공지)마다 「번호」 = 보내는 내용으로 만든 지문 (한 글자만 바뀌어도 번호가 바뀜)
//   사이트가 기기에 저장해 둔 묶음의 번호(vr · vs · vn)를 보내고, 지금 번호와 같으면 그 묶음은 보내지 않고 same 에 이름만 넣음
//   → 바뀐 것이 없으면 수십 KB 대신 몇백 바이트 · 역할마다 걸러진 내용으로 만들어서 다른 사람 저장본과 섞이지 않음
function dataVer(o) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(o), Utilities.Charset.UTF_8), s = "";
  for (var i = 0; i < 8; i++) { var b = (d[i] + 256) % 256; s += (b < 16 ? "0" : "") + b.toString(16); }
  return s;
}
// 🔒 v2.24.0: 일정 · 공지는 보호자 · 관리자만 (1922 일반 열람자는 명단만 — 사이트에서도 탭이 안 보임)
function canSeeBoard(role) { return !!role && role !== "guest"; }
function verGroup(out, p, name, param, payload) {
  var v = dataVer(payload);
  out.ver[name] = v;
  if (p && p[param] && String(p[param]) === v) { out.same.push(name); return true; }
  for (var k in payload) out[k] = payload[k];
  return false;
}

// 시트에 쓰기 전 사용자 입력 정리 (길이 제한 + 수식 주입 방지)
function cleanText(v, maxLen) {
  var s = String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim();
  if (s.length > (maxLen || 100)) s = s.substring(0, maxLen || 100);
  // "-5cm" 같은 신체치수 표기는 수식이 아니므로 그대로 둔다
  if (/^[+\-]\d+(\.\d+)?cm/i.test(s)) return s;
  // 수식 주입 방지: 선행 = + - @ (및 그 사이 공백)을 모두 제거해 "+=1+1" 같은 우회를 막는다
  while (/^[=+\-@\s]/.test(s)) s = s.replace(/^[=+\-@\s]+/, "");
  return s;
}

// ID 전용 정리: 영문/숫자/_/- 만 허용 → onclick 등에 끼워 넣어도 안전 (XSS/주입 차단)
function cleanId(v, maxLen) {
  return String(v == null ? "" : v).replace(/[^A-Za-z0-9_\-]/g, "").substring(0, maxLen || 30);
}

// 생년월일을 숫자만 추출 (날짜형 셀도 처리). "2015.09.18" / "20150918" / Date → "20150918"
function birthDigits(v) {
  if (v && typeof v.getFullYear === "function") return Utilities.formatDate(v, "Asia/Seoul", "yyyyMMdd");
  return String(v == null ? "" : v).replace(/[^0-9]/g, "");
}

function digitsOnly(v, maxLen) {
  return String(v == null ? "" : v).replace(/[^0-9.]/g, "").substring(0, maxLen || 6);
}

function getUniformActive() {
  return PropertiesService.getScriptProperties().getProperty("UNIFORM_ACTIVE") !== "false";
}

function setUniformActive(active) {
  PropertiesService.getScriptProperties().setProperty("UNIFORM_ACTIVE", active ? "true" : "false");
}

// 👕 학년별·코치진·감독님 유니폼(등번호 배지) 색 — v2.4.5 (감독님 head 추가). Script Properties "JERSEY_COLORS" 에 JSON으로 저장, 대표님·개발자만 변경
//   값은 "#rrggbb" (예전 red/navy/sky/white 도 받아서 색 코드로 바꿈). 키: "6"~"1" 학년, "staff" 코치진
var JERSEY_NAMED = { red: "#e0202a", navy: "#0b2240", sky: "#29a8e0", white: "#ffffff" };
var JERSEY_COLORS_DEFAULT = { "6": "#e0202a", "5": "#29a8e0", "4": "#ffffff", "3": "#ffffff", "2": "#ffffff", "1": "#ffffff", "staff": "#0b2240", "head": "#0b2240" };   // v2.4.5: head = 감독님
function normJerseyColor(v) {
  v = String(v == null ? "" : v).trim().toLowerCase();
  if (JERSEY_NAMED[v]) return JERSEY_NAMED[v];
  return /^#[0-9a-f]{6}$/.test(v) ? v : "";
}
function getJerseyColors() {
  var out = {}; for (var k in JERSEY_COLORS_DEFAULT) out[k] = JERSEY_COLORS_DEFAULT[k];
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("JERSEY_COLORS");
    if (raw) { var o = JSON.parse(raw); for (var g in out) { var c = normJerseyColor(o && o[g]); if (c) out[g] = c; } }
  } catch (e) {}
  return out;
}
function setJerseyColors(colors) {
  var cur = getJerseyColors();
  if (colors && typeof colors === "object") for (var g in cur) { var c = normJerseyColor(colors[g]); if (c) cur[g] = c; }
  PropertiesService.getScriptProperties().setProperty("JERSEY_COLORS", JSON.stringify(cur));
  return cur;
}

// 관리자(최고/보조/일반) 비밀번호. Script Properties(서버)에 저장되어 모든 기기에 동일하게 적용된다.
// 값이 없으면 최초 기본값(0000/1111/2222)을 쓴다 — "비밀번호 관리"에서 바꾸면 그 즉시 여기 값이 바뀐다.
function getAdminPasswords() {
  var props = PropertiesService.getScriptProperties();
  return {
    super: props.getProperty("ADMIN_PW_SUPER") || "11111111",
    sub: props.getProperty("ADMIN_PW_SUB") || "22222222",
    general: props.getProperty("ADMIN_PW_GENERAL") || "33333333",
    // v2.27.0: 부대표님 · 부총무님 — 기본값 없음. 대표님(또는 개발자)이 「비밀번호 관리」에서 넣어야 로그인할 수 있다.
    vsuper: props.getProperty("ADMIN_PW_VSUPER") || "",
    vgeneral: props.getProperty("ADMIN_PW_VGENERAL") || ""
  };
}

// 개발자 로그인용 날짜 코드 (한국시간 기준). "일+월+년" 순서만, 자리수만 다른 2가지만 허용.
//   예) 2026-10-02 → "02102026"(8자리: ddmmyyyy), "021026"(6자리: ddmmyy)
function devDateCodes() {
  var now = new Date();
  var yyyy = Utilities.formatDate(now, "Asia/Seoul", "yyyy");
  var yy = yyyy.slice(-2);
  var mm = Utilities.formatDate(now, "Asia/Seoul", "MM");   // 두 자리(월)
  var dd = Utilities.formatDate(now, "Asia/Seoul", "dd");   // 두 자리(일)
  return [dd + mm + yyyy, dd + mm + yy];
}

// ==========================================================
// 🔐 세션 토큰 (로그인 후 서버가 발급 → CacheService 에 저장)
//   - 모든 읽기/쓰기는 이 토큰이 있어야 하고, 토큰에 담긴 역할(role)/자녀범위(scope)로 서버가 직접 권한을 검사한다.
//   - 토큰은 추측 불가능한 UUID. 만료되면 캐시에서 자동 삭제된다(최대 6시간).
// ==========================================================
function sessionCache() { return CacheService.getScriptCache(); }
function roleName(r) { return ({ dev: "개발자", super: "대표님", sub: "코치진", general: "총무님", vsuper: "부대표님", vgeneral: "부총무님", parent: "보호자", guest: "일반 열람자" })[r] || r; }
function roleTtl(r) { return ({ dev: 18000, super: 18000, sub: 18000, general: 18000, vsuper: 18000, vgeneral: 18000, parent: 18000, guest: 1800 })[r] || 600; } // 초 단위 (캐시 최대 21600=6h) · v2.18.0: 일반 10분 · 보호자 · 코치진 1시간 · 총무님 · 대표님 · 개발자 5시간
// v2.26.0: 일반 30분 · 보호자 · 코치진 · 총무님 · 대표님 · 개발자 5시간 (최대 한도) — 그 안에서는 사이트가 「10분 안 쓰면 잠금」(쓰는 동안 자동 연장)
function isAdminRole(r) { return r === "super" || r === "dev" || r === "sub" || r === "general"; }
function canEditScheduleRole(r) { return r === "super" || r === "dev" || r === "general"; }
// v2.27.0: 👥 부대표님 · 부총무님 — 비상연락망 보기 + 본인 비밀번호 변경만 (나머지는 보호자처럼: 일정 · 공지 · 구장 보기, 숨긴 정보는 안 보임)
function isContactOnlyRole(r) { return r === "vsuper" || r === "vgeneral"; }
function canSeeContactsRole(r) { return r === "super" || r === "dev" || r === "general" || isContactOnlyRole(r); }
function canChangePwRole(r) { return isAdminRole(r) || isContactOnlyRole(r); }

function issueSession(role, name, scope, extra) {
  var token = Utilities.getUuid();
  var ttl = roleTtl(role);
  var obj = { role: role, name: name || roleName(role), scope: scope || [], exp: Date.now() + ttl * 1000 };
  if (extra && extra.rel) obj.rel = extra.rel;   // v2.11.0: 접속 알림에 「김승원 아버님」
  sessionCache().put("S_" + token, JSON.stringify(obj), ttl);
  var out = { result: "success", token: token, role: role, name: obj.name, scope: obj.scope, exp: obj.exp };
  if (extra) for (var k in extra) out[k] = extra[k];
  return json(out);
}
function resolveSession(token) {
  token = String(token || "");
  if (!token) return null;
  var raw = sessionCache().get("S_" + token);
  if (!raw) return null;
  try { var o = JSON.parse(raw); if (o.exp && Date.now() > o.exp) return null; return o; } catch (e) { return null; }
}
function dropSession(token) { if (token) sessionCache().remove("S_" + String(token)); }

// ⚡ v2.13.0: 시트에서 읽은 결과를 캐시에 보관 (명단 · 졸업생 · 일정 · 구장 · 공지)
//   - v2.16.0: 보관 시간 1분 → 10분 (1분이 지나면 다음 사람이 시트를 다시 읽느라 서버에서만 4~6초 걸렸음 · 보관본이 있으면 1초 남짓)
//   - 앱에서 저장 · 삭제하면 바뀐 부분만 바로 비움 (DATA_DROP) · 시트 화면에서 칸을 직접 고쳐도 그 탭만 바로 비움 (아래 onEdit)
//   - 줄 넣기 · 지우기처럼 칸 값이 아닌 변경은 최대 10분 뒤에 보임
//   - 캐시 한 칸은 100KB 한도 → 3만 자씩 나눠 담고 「_n」 칸에 몇 조각인지 적음
//   - v2.20.0: 공지 조회수 · 읽은 사람 기능을 없앰 (조회수 칸 C_NVIEWS 도 없음)
var DATA_CACHE_TTL = 600;
var DATA_TTL = {};   // 칸마다 따로 정한 보관 시간 (초) — 없으면 DATA_CACHE_TTL
var DATA_KEYS = ["C_ROSTER", "C_GRADS", "C_EVENTS", "C_VENUES", "C_NOTICES", "C_OFFICERS", "C_DUTY"];   // v2.28.0: 📞 집행부 번호 (C_OFFICERS) · v2.31.0: 🧹 청소 당번 (C_DUTY)
var DATA_DROP = {   // (구장 이름을 바꿔 일정 장소까지 바뀌면 handleSaveVenue 가 일정 칸도 따로 비움)
  uploadPhoto: ["C_ROSTER", "C_GRADS"], deletePhoto: ["C_ROSTER", "C_GRADS"], updatePlayerInfo: ["C_ROSTER", "C_DUTY"], registerContact: ["C_ROSTER", "C_OFFICERS", "C_DUTY"],
  saveEvents: ["C_EVENTS"], deleteEvent: ["C_EVENTS"], saveVenue: ["C_VENUES"], deleteVenue: ["C_VENUES"],
  saveNotice: ["C_NOTICES"], deleteNotice: ["C_NOTICES"]
};
function cacheGetBig(key) {
  try {
    var c = sessionCache(), n = Number(c.get(key + "_n") || 0);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + "_" + i);
    var parts = c.getAll(keys) || {}, s = "";
    for (var j = 0; j < n; j++) { var p = parts[key + "_" + j]; if (p == null) return null; s += p; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function cachePutBig(key, obj, ttl) {
  try {
    var s = JSON.stringify(obj), size = 30000, n = Math.max(1, Math.ceil(s.length / size)), o = {};
    if (n > 30) return;
    for (var i = 0; i < n; i++) o[key + "_" + i] = s.substr(i * size, size);
    o[key + "_n"] = String(n);
    sessionCache().putAll(o, ttl);
  } catch (e) {}
}
// v2.16.0: 이번 요청에 필요한 보관본을 한꺼번에 꺼내 둠 (예전엔 칸마다 두 번씩 → 앱을 켤 때 캐시를 12번 물었음 → 이제 2번)
//   _dataMemo[k]: 꺼낸 값 · null 이면 「보관본 없음」(시트에서 읽어야 함) · 요청마다 doGet/doPost 맨 앞에서 비움
var _dataMemo = null;
function prefetchData(keys) {
  _dataMemo = _dataMemo || {};
  try {
    var c = sessionCache(), ns = c.getAll(keys.map(function (k) { return k + "_n"; })) || {}, want = [], plan = {};
    keys.forEach(function (k) {
      var n = Number(ns[k + "_n"] || 0);
      if (n > 0 && n <= 30) { plan[k] = n; for (var i = 0; i < n; i++) want.push(k + "_" + i); }
      else _dataMemo[k] = null;
    });
    var parts = want.length ? (c.getAll(want) || {}) : {};
    Object.keys(plan).forEach(function (k) {
      var s = "";
      for (var i = 0; i < plan[k]; i++) { var p = parts[k + "_" + i]; if (p == null) { s = null; break; } s += p; }
      try { _dataMemo[k] = s === null ? null : JSON.parse(s); } catch (e) { _dataMemo[k] = null; }
    });
  } catch (e) { _dataMemo = null; }
}
function cachedData(key, producer) {
  var v;
  if (_dataMemo && Object.prototype.hasOwnProperty.call(_dataMemo, key)) v = _dataMemo[key];   // 미리 꺼내 둔 것 (null = 없음 확인됨)
  else v = cacheGetBig(key);
  if (v !== null && v !== undefined) return v;
  v = producer();
  cachePutBig(key, v, DATA_TTL[key] || DATA_CACHE_TTL);
  if (_dataMemo) _dataMemo[key] = v;
  return v;
}
function dropDataCache(keys) {
  if (!keys || !keys.length) return;
  if (_dataMemo) keys.forEach(function (k) { delete _dataMemo[k]; });
  try { sessionCache().removeAll(keys.map(function (k) { return k + "_n"; })); } catch (e) {}
}

// 🔥 v2.16.0: 로그인 화면에서 앱이 미리 부름 — 비번을 치는 동안 명단 · 일정 · 공지를 시트에서 읽어 보관만 함 (데이터는 안 돌려줌 · 이미 있으면 바로 끝)
//   v2.17.0: 6칸을 한 번에 읽으면 7초 넘게 걸려서(로그인이 그보다 빠르면 소용없음) 앱이 세 묶음(part)으로 나눠 동시에 부름 → 2~3초
//            읽는 동안은 「W_칸이름」 표시를 남겨, 그 사이 들어온 명단 요청이 같은 시트를 또 읽지 않고 기다렸다 씀 (waitForWarm)
var WARM_PARTS = { roster: ["C_ROSTER", "C_GRADS", "C_OFFICERS"], sched: ["C_EVENTS", "C_VENUES", "C_DUTY"], notice: ["C_NOTICES"] };

// 🔎 v2.19.0: 로그인 화면에서 먼저 하나만 물어봄 — 「어느 묶음이 비어 있나」만 캐시에서 한 번에 확인하고 바로 답함 (시트는 안 읽음)
//   앱은 비어 있는 묶음만 나눠서 미리 읽게 함 → 보관본이 다 있으면(사람이 많을 때 대부분) 요청 3개 → 1개
//   다른 사람이 이미 읽는 중인 묶음(W_ 표시)은 비어 있어도 빼서, 같은 시트를 여럿이 동시에 읽지 않게 함
var WARM_CHECK = { roster: ["C_ROSTER", "C_GRADS", "C_OFFICERS"], sched: ["C_EVENTS", "C_VENUES", "C_DUTY"], notice: ["C_NOTICES"] };
function warmCheck() {
  var keys = [];
  Object.keys(WARM_CHECK).forEach(function (p) { keys = keys.concat(WARM_CHECK[p]); });
  var got = {};
  try { got = sessionCache().getAll(keys.map(function (k) { return k + "_n"; }).concat(keys.map(function (k) { return "W_" + k; }))) || {}; } catch (e) {}
  var cold = Object.keys(WARM_CHECK).filter(function (p) {
    return WARM_CHECK[p].some(function (k) { return !got[k + "_n"] && !got["W_" + k]; });
  });
  return { result: "success", warmed: 0, cold: cold };
}
function warmData(ss, part) {
  var keys = WARM_PARTS[part] || DATA_KEYS;
  prefetchData(keys);
  var miss = keys.filter(function (k) { return !_dataMemo || _dataMemo[k] == null; });
  if (!miss.length) return { result: "success", warmed: 0 };
  var c = sessionCache(), flags = {};
  miss.forEach(function (k) { flags["W_" + k] = "1"; });
  try { c.putAll(flags, 30); } catch (e0) {}
  try {
    var has = function (k) { return miss.indexOf(k) !== -1; };
    if (has("C_ROSTER")) { try { readRosterRaw(ss); } catch (e1) {} }
    if (has("C_GRADS")) { try { readGradRaw(ss); } catch (e2) {} }
    if (has("C_EVENTS")) { try { readEvents(ss); } catch (e3) {} }
    if (has("C_VENUES")) { try { readVenues(ss); } catch (e4) {} }
    if (has("C_NOTICES")) { try { readNotices(ss); } catch (e5) {} }
    if (has("C_OFFICERS")) { try { readOfficers(ss); } catch (e7) {} }
    if (has("C_DUTY")) { try { readDuty(ss); } catch (e8) {} }   // 🧹 v2.31.0
  } finally { try { c.removeAll(Object.keys(flags)); } catch (e6) {} }
  return { result: "success", warmed: miss.length };
}

// ⏳ v2.17.0: 미리 데우기가 지금 그 칸을 읽는 중이면(로그인을 빨리 한 경우) 같은 시트를 처음부터 또 읽지 말고
//   끝날 때까지 기다렸다가 그 결과를 씀 (최대 8초 · 0.25초마다 확인 · 미리 데우기가 없으면 바로 넘어감)
function waitForWarm(keys) {
  if (!_dataMemo) return;
  var miss = keys.filter(function (k) { return _dataMemo[k] == null; });
  if (!miss.length) return;
  try {
    var c = sessionCache();
    var flagKeys = miss.map(function (k) { return "W_" + k; });
    var f0 = c.getAll(flagKeys) || {};
    if (!flagKeys.some(function (fk) { return !!f0[fk]; })) return;
    var until = Date.now() + 8000;
    while (Date.now() < until) {
      Utilities.sleep(250);
      var got = c.getAll(miss.map(function (k) { return k + "_n"; }).concat(flagKeys)) || {};
      var waiting = miss.some(function (k) { return !got[k + "_n"] && !!got["W_" + k]; });
      if (!waiting) break;
    }
    miss.forEach(function (k) { delete _dataMemo[k]; });
    prefetchData(miss);
  } catch (e) {}
}

// ✏️ v2.16.0: 시트 화면에서 칸 내용을 직접 고치면 그 탭의 보관본을 바로 비움 → 앱에 바로 보임
//   (구글 시트가 알아서 부르는 함수 · 줄 넣기 · 지우기는 이 신호가 안 와서 최대 10분 뒤에 보임)
function onEdit(e) {
  try {
    var sh = e && e.range ? e.range.getSheet() : null;
    if (!sh) return;
    var name = sh.getName(), keys = [];
    if (String(sh.getSheetId()) === "1653839889") keys = ["C_ROSTER", "C_DUTY"];   // v2.31.0: 이름 · 학년이 바뀌면 청소 당번도
    else if (name === GRAD_ROSTER_SHEET) keys = ["C_GRADS"];
    else if (name === SCHEDULE_SHEET_NAME) keys = ["C_EVENTS"];
    else if (name === VENUE_SHEET_NAME) keys = ["C_VENUES"];
    else if (name === NOTICE_SHEET_NAME) keys = ["C_NOTICES"];
    else if (String(sh.getSheetId()) === "812608822") keys = ["C_OFFICERS", "C_DUTY"];   // v2.28.0: 비상연락망에서 번호를 고치면 집행부 단축 버튼도 바로 · v2.32.0: 청소 당번 가족(형제) 묶기도
    else if (name === DUTY_SHEET_NAME || String(sh.getSheetId()) === String(DUTY_SHEET_GID)) keys = ["C_DUTY"];   // 🧹 v2.31.0: 「당번」 탭
    if (keys.length) dropDataCache(keys);
  } catch (err) {}
}

// 📞 v2.28.0: 집행부 단축 버튼 — 헤더 유니폼 버튼 양옆 (왼쪽 대표님 · 부대표님 / 오른쪽 총무님 · 부총무님)
//   번호는 「학부모 비상연락망」 시트에서 선수 이름(없으면 배번) + 아버님 · 어머님 칸으로 찾음 → 시트 번호가 바뀌면 버튼도 따라감
//   보호자 · 관리자에게만 보냄 (1922 일반 열람자에게는 안 보냄) · 집행부가 바뀌면 Script Properties 「OFFICERS」(JSON)로 덮어쓰기 가능
var OFFICERS_DEFAULT = [
  { key: "super", label: "대표님", player: "류태영", no: 47, rel: "아버님" },
  { key: "vsuper", label: "부대표님", player: "이하준", no: 36, rel: "아버님" },
  { key: "general", label: "총무님", player: "김승원", no: 30, rel: "어머님" },
  { key: "vgeneral", label: "부총무님", player: "이하성", no: 24, rel: "어머님" }
];
// v2.29.0: 대표님 · 개발자가 관리 탭에서 바꿈 → Script Properties 「OFFICERS」(맡는 분) · 「OFFICERS_AT」(언제 · 누가 · 어느 자리)
//   자리는 늘 넷 (대표님 · 부대표님 · 총무님 · 부총무님) · 비워 두면 그 버튼만 숨김
//   선수 이름이 맞아야 찾음 (같은 이름이 둘이면 배번으로 가림) — 졸업 등으로 이름이 없어지면 「못 찾음」 (배번만으로는 안 찾음: 새 선수가 같은 번호를 받을 수 있어서)
var OFFICER_SLOTS = [["super", "대표님"], ["vsuper", "부대표님"], ["general", "총무님"], ["vgeneral", "부총무님"]];
var OFFICER_RELS = ["아버님", "어머님", "기타"];
function officerConfig() {
  var list = OFFICERS_DEFAULT;
  try { var raw = PropertiesService.getScriptProperties().getProperty("OFFICERS"); if (raw) { var o = JSON.parse(raw); if (Array.isArray(o) && o.length) list = o; } } catch (e) {}
  var byKey = {};
  list.forEach(function (o) { if (o && o.key) byKey[o.key] = o; });
  return OFFICER_SLOTS.map(function (sl) {
    var o = byKey[sl[0]] || { empty: true };
    var empty = !!o.empty || !o.player;
    return { key: sl[0], label: sl[1], player: empty ? "" : String(o.player), no: empty ? 0 : (Number(o.no) || 0), rel: empty ? "" : String(o.rel || ""), empty: empty };
  });
}
function fmtPhone(d) {
  d = String(d || "").replace(/[^0-9]/g, "");
  if (/^1[0-9]{9}$/.test(d)) d = "0" + d;   // 시트가 숫자로 저장해 앞 0이 빠진 경우
  if (d.length === 11) return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  return d;
}
function okPhone(p) { return String(p || "").replace(/[^0-9]/g, "").length >= 9; }
function officerSheetData(ss) {
  var cSheet = getContactSheet(ss);
  if (!cSheet) return null;
  var v = cSheet.getDataRange().getValues();
  var H = v[0].map(function (h) { return String(h).trim(); });
  return { v: v, noCol: findColIdx(H, ["배번", "등번호", "번호"]), nameCol: findColIdx(H, ["선수이름", "이름", "선수명"]), gradeCol: findColIdx(H, ["학년", "구분"]),
           rel: { "아버님": findColIdx(H, ["아버님", "아버지"]), "어머님": findColIdx(H, ["어머님", "어머니"]), "기타": findColIdx(H, ["기타연락처", "기타", "추가연락처"]) } };
}
function officerRow(d, o) {
  var v = d.v, name = String(o.player || "").trim(), no = Number(o.no) || 0, i;
  if (!name || d.nameCol === -1) return -1;
  var nm = function (r) { return String(v[r][d.nameCol] || "").trim() === name; };
  var nb = function (r) { return d.noCol !== -1 && no > 0 && (parseInt(v[r][d.noCol], 10) || 0) === no; };
  for (i = 1; i < v.length; i++) if (nm(i) && nb(i)) return i;   // 이름 + 배번
  for (i = 1; i < v.length; i++) if (nm(i)) return i;            // 이름만
  return -1;
}
function officerPhone(d, o) {
  if (!d || !o || o.empty) return "";
  var col = d.rel[o.rel]; if (col === undefined || col === -1) return "";
  var row = officerRow(d, o); if (row === -1) return "";
  var p = fmtPhone(d.v[row][col]);
  return okPhone(p) ? p : "";
}
function readOfficers(ss) {
  return cachedData("C_OFFICERS", function () {
    var d = officerSheetData(ss);
    if (!d) return [];
    var out = [];
    officerConfig().forEach(function (o) { var ph = officerPhone(d, o); if (ph) out.push({ key: o.key, label: o.label, phone: ph }); });
    return out;
  });
}
// 관리 탭 화면용 (대표님 · 개발자만): 자리 넷의 상태 + 고를 수 있는 선수 · 보호자 번호 + 마지막 변경
function officerAdminView(ss) {
  var d = officerSheetData(ss);
  var slots = officerConfig().map(function (o) {
    var ph = d ? officerPhone(d, o) : "";
    return { key: o.key, label: o.label, player: o.player, no: o.no, rel: o.rel, phone: ph, status: o.empty ? "empty" : (ph ? "ok" : "missing") };
  });
  var cand = [];
  if (d && d.nameCol !== -1) for (var i = 1; i < d.v.length; i++) {
    var name = String(d.v[i][d.nameCol] || "").trim(); if (!name) continue;
    var phones = {};
    OFFICER_RELS.forEach(function (r) { var c = d.rel[r]; if (c !== undefined && c !== -1) { var p = fmtPhone(d.v[i][c]); if (okPhone(p)) phones[r] = p; } });
    cand.push({ no: d.noCol !== -1 ? (parseInt(d.v[i][d.noCol], 10) || 0) : 0, name: name, grade: d.gradeCol !== -1 ? String(d.v[i][d.gradeCol] || "").trim() : "", phones: phones });
  }
  var at = null;
  try { at = JSON.parse(PropertiesService.getScriptProperties().getProperty("OFFICERS_AT") || "null"); } catch (e) {}
  return { result: "success", slots: slots, candidates: cand, changed: at };
}
function saveOfficer(ss, session, p) {
  var key = String(p.slot || ""), slot = null;
  OFFICER_SLOTS.forEach(function (sl) { if (sl[0] === key) slot = sl; });
  if (!slot) return { result: "error", message: "바꿀 자리를 모르겠어요." };
  var next;
  if (String(p.empty || "") === "1") next = { key: key, label: slot[1], empty: true };
  else {
    var rel = String(p.rel || "");
    if (OFFICER_RELS.indexOf(rel) === -1) return { result: "error", message: "아버님 · 어머님 · 기타 중에서 골라 주세요." };
    var player = cleanText(p.player, 30), no = parseInt(p.no, 10) || 0;
    if (!player) return { result: "error", message: "선수를 골라 주세요." };
    next = { key: key, label: slot[1], player: player, no: no, rel: rel };
    if (!officerPhone(officerSheetData(ss), next)) return { result: "error", message: "비상연락망에서 그 분 번호를 못 찾았어요. 시트에 번호가 있는지 확인해 주세요." };
  }
  var out = officerConfig().map(function (o) {
    if (o.key === key) return next;
    return o.empty ? { key: o.key, label: o.label, empty: true } : { key: o.key, label: o.label, player: o.player, no: o.no, rel: o.rel };
  });
  var props = PropertiesService.getScriptProperties();
  props.setProperty("OFFICERS", JSON.stringify(out));
  props.setProperty("OFFICERS_AT", JSON.stringify({ at: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm"), by: roleName(session.role), slot: slot[1] }));
  dropDataCache(["C_OFFICERS"]);
  var view = officerAdminView(ss);
  view.officers = readOfficers(ss);
  return view;
}

// 토큰의 자녀범위(scope)에 해당 선수가 있는지 (대표/개발자는 항상 true)
function scopeHasPlayer(session, no, name) {
  if (!session) return false;
  if (session.role === "super" || session.role === "dev") return true;
  var list = session.scope || [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (no > 0 && c.no > 0) { if (Number(c.no) === Number(no)) return true; }
    else if (name && String(c.name) === String(name)) return true;
  }
  return false;
}

// 간단 레이트리밋 (bucket 기준 windowSec 안에 max 회 초과 시 false)
function rateOk(bucket, max, windowSec) {
  try {
    var c = sessionCache(), k = "R_" + bucket;
    var n = Number(c.get(k) || 0) + 1;
    c.put(k, String(n), windowSec);
    return n <= max;
  } catch (e) { return true; }
}

// ==========================================================
// 🔐 로그인 (관리자 비번 / 개발자 비번 / 익명코드 / 학부모 휴대폰)
//   - 비번은 서버(Script Properties)에만 있고, 성공해야만 토큰을 돌려준다.
//   - 휴대폰 로그인: 최소 8자리 + 뒷자리 일치. (끝 4자리 추측 로그인 차단)
//   - clientId 기준 레이트리밋으로 비번/번호 대입을 막는다.
// ==========================================================
// 로그인 "실패" 횟수 제한: 같은 기기에서 첫 실패 후 10분 안에 10번 틀리면 남은 시간 동안 잠금.
//   - 성공한 로그인은 횟수에 안 들어가고, 성공하면 바로 초기화된다.
//   - 잠금은 첫 실패 시점부터 정확히 10분 뒤 자동 해제 (계속 눌러도 시간이 늘어나지 않음).
var LOGIN_FAIL_MAX = 10, LOGIN_FAIL_WINDOW = 600;
function loginFailState(clientId) {
  try { var o = JSON.parse(sessionCache().get("LF2_" + clientId) || "null"); if (o && Date.now() < o.until) return o; } catch (e) {}
  return null;
}
function loginFailAdd(clientId) {
  var o = loginFailState(clientId) || { n: 0, until: Date.now() + LOGIN_FAIL_WINDOW * 1000 };
  o.n++;
  var left = Math.max(1, Math.ceil((o.until - Date.now()) / 1000));
  sessionCache().put("LF2_" + clientId, JSON.stringify(o), left);
}
function loginFailClear(clientId) { sessionCache().remove("LF2_" + clientId); }

function handleLogin(ss, data) {
  var clientId = cleanText(data.clientId, 40) || "-";
  var fs = loginFailState(clientId);
  if (fs && fs.n >= LOGIN_FAIL_MAX) {
    var mins = Math.max(1, Math.ceil((fs.until - Date.now()) / 60000));
    return json({ result: "error", locked: true, message: "로그인을 " + LOGIN_FAIL_MAX + "번 틀려 잠시 잠겼습니다. 약 " + mins + "분 뒤 다시 시도해 주세요." });
  }
  var res = handleLoginInner(ss, data);
  try {
    var body = JSON.parse(res.getContent ? res.getContent() : JSON.stringify(res));
    if (body && body.result === "success") loginFailClear(clientId);
    else {
      loginFailAdd(clientId);
    }
  } catch (e) {}
  return res;
}

function handleLoginInner(ss, data) {
  var code = String(data.code || "").trim();
  if (!code) return json({ result: "error", message: "입력값이 없습니다." });

  var props = PropertiesService.getScriptProperties();
  var pws = getAdminPasswords();
  var devPw = props.getProperty("ADMIN_PW_DEV");   // 선택: 고정 개발자 비번도 쓰고 싶을 때

  var role = null;
  if ((devPw && code === devPw) || devDateCodes().indexOf(code) !== -1) role = "dev";   // 개발자: 고정 비번 또는 오늘 날짜(일/월/년) 코드
  else if (code === pws.super) role = "super";
  else if (code === pws.sub) role = "sub";
  else if (code === pws.general) role = "general";
  else if (pws.vsuper && code === pws.vsuper) role = "vsuper";       // v2.27.0: 부대표님
  else if (pws.vgeneral && code === pws.vgeneral) role = "vgeneral"; // v2.27.0: 부총무님
  if (role) return issueSession(role, roleName(role), []);

  var guestCode = props.getProperty("GUEST_CODE") || "1922";
  if (code === guestCode) return issueSession("guest", "일반 열람자", []);

  var digits = code.replace(/[^0-9]/g, "");
  if (digits.length >= 8) {
    var m = matchParents(ss, digits);
    if (m) return issueSession("parent", m.name, m.scope, { phone: m.phone, rel: m.role });   // v2.11.0: rel = 아버님 · 어머님 · 기타 · 학생
    if (isGradParentPhone(ss, digits)) return json({ result: "error", grad: true, message: "🎓 졸업한 선수의 보호자 번호예요. 졸업 처리가 끝나 더 이상 들어올 수 없어요. 그동안 함께해 주셔서 고마워요!" });   // v2.9.0
  }
  return json({ result: "error", message: "등록된 휴대폰 번호 또는 비밀번호가 아닙니다." });
}

// 휴대폰 뒷자리로 비상연락망에서 학부모(및 형제자매) 찾기
function matchParents(ss, digits) {
  var cSheet = getContactSheet(ss);
  if (!cSheet) return null;
  var v = cSheet.getDataRange().getValues();
  var H = v[0].map(function (h) { return String(h).trim(); });
  var noCol = findColIdx(H, ["배번", "등번호", "번호"]);
  var nameCol = findColIdx(H, ["선수이름", "이름", "선수명"]);
  var cols = [[findColIdx(H, ["아버님", "아버지"]), "아버님"], [findColIdx(H, ["어머님", "어머니"]), "어머님"],
              [findColIdx(H, ["기타연락처", "기타", "추가연락처"]), "기타"], [findColIdx(H, ["학생연락처", "선수연락처"]), "학생"]];
  var matches = [];
  for (var i = 1; i < v.length; i++) {
    for (var j = 0; j < cols.length; j++) {
      var col = cols[j][0]; if (col === -1) continue;
      var d = String(v[i][col] || "").replace(/[^0-9]/g, "");
      if (d && d.length >= 8 && d.slice(-digits.length) === digits) {
        matches.push({ no: noCol !== -1 ? (parseInt(v[i][noCol], 10) || 0) : 0, name: nameCol !== -1 ? String(v[i][nameCol] || "").trim() : "", role: cols[j][1], phone: d });
        break;
      }
    }
  }
  if (!matches.length) return null;
  var primary = matches[0];
  var sibs = matches.filter(function (m) { return m.phone === primary.phone; });
  return { name: sibs.map(function (s) { return s.name; }).join("·"), role: primary.role, phone: primary.phone,
           scope: sibs.map(function (s) { return { no: s.no, name: s.name }; }) };
}

// 역할에 맞게 걸러낸 선수 명단 (비공개 항목/숨김 선수/비공개 사진 서버에서 차단)
// ⚡ v2.13.0: 명단 시트를 읽고 정리한 결과(누가 보든 같은 부분)는 캐시 → 역할 · 자녀범위에 맞게 거르는 것만 매번
function readRosterRaw(ss) {
  return cachedData("C_ROSTER", function () {
    var pSheet = getRosterSheet(ss);
    var vals = pSheet.getDataRange().getValues();
    var H = vals[0];
    var c = {
      seq: findColIdx(H, ["순번"]), no: findColIdx(H, ["배번", "등번호", "번호"]), name: findColIdx(H, ["이름", "선수이름", "성명", "지도자명"]),
      grade: findColIdx(H, ["구분", "학년", "직책"]), pos: findColIdx(H, ["포지션", "역할"]), bt: findColIdx(H, ["투타", "투/타"]),
      birth: findColIdx(H, ["생년월일", "생일"]), height: findColIdx(H, ["키", "신장"]), weight: findColIdx(H, ["몸무게", "체중"]),
      visible: findColIdx(H, ["노출여부"]), photo: findColIdx(H, ["사진공개", "사진노출"]), birthOpen: findColIdx(H, ["생년월일공개", "생일공개"]),
      heightOpen: findColIdx(H, ["키공개"]), weightOpen: findColIdx(H, ["몸무게공개"]), link: findColIdx(H, ["사진링크", "드라이브사진", "사진URL"])
    };
    var g = function (row, idx, fb) { var t = idx !== -1 ? idx : fb; return (t !== undefined && t < row.length) ? String(row[t] || "").trim() : ""; };
    var off = function (val) { val = String(val || "").toUpperCase().trim(); return val === "OFF" || val === "비공개"; };
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var row = vals[i];
      var name = g(row, c.name, 2); if (!name) continue;
      var no = parseInt(g(row, c.no, 1), 10); no = (!isNaN(no) && no > 0) ? no : 0;
      var birthIdx = c.birth !== -1 ? c.birth : 6;
      var birthCell = birthIdx < row.length ? row[birthIdx] : "";
      var birth = (birthCell && typeof birthCell.getFullYear === "function") ? Utilities.formatDate(birthCell, "Asia/Seoul", "yyyy-MM-dd") : String(birthCell || "").trim();
      out.push({ id: parseInt(g(row, c.seq, 0), 10) || i, no: no, name: name, grade: g(row, c.grade, 3), pos: g(row, c.pos, 4) || "-",
                 bt: g(row, c.bt, 5) || "-", birth: birth, height: g(row, c.height, 7), weight: g(row, c.weight, 8),
                 visible: g(row, c.visible, 9).toUpperCase() !== "OFF",
                 hidePhoto: off(g(row, c.photo, 10)), hideBirth: off(g(row, c.birthOpen, 11)), hideHeight: off(g(row, c.heightOpen, 12)), hideWeight: off(g(row, c.weightOpen, 13)),
                 photoLink: g(row, c.link, 14) });
    }
    return out;
  });
}
function buildRosterPayload(ss, session) {
  var role = session ? session.role : "guest";
  var admin = isAdminRole(role);
  var canPhoto = (role === "sub" || role === "general" || role === "super" || role === "dev");
  var raw = readRosterRaw(ss), out = [];
  for (var i = 0; i < raw.length; i++) {
    var r = raw[i];
    if (!r.visible && !(role === "super" || role === "dev")) continue;   // 숨김 선수는 대표/개발자만
    var mine = admin || scopeHasPlayer(session, r.no, r.name);   // 관리자 또는 본인 자녀면 원본 값 제공(수정화면용)
    var birth = r.birth, height = r.height, weight = r.weight, link = r.photoLink;
    var hB = r.hideBirth, hH = r.hideHeight, hW = r.hideWeight;
    if (role === "guest") { hB = hH = hW = true; }   // 🔒 v2.25.0: 1922 일반 열람자에게는 생년월일 · 키 · 몸무게를 늘 비공개 (선수별 공개 설정과 상관없이)
    if (!mine) { if (hB) birth = ""; if (hH) height = ""; if (hW) weight = ""; }
    if (r.hidePhoto && !canPhoto) link = "";   // 비공개 사진 링크는 열람권자만
    out.push({ id: r.id, no: r.no, name: r.name, grade: r.grade, pos: r.pos,
               bt: r.bt, birth: birth, height: height, weight: weight, visible: r.visible,
               hidePhoto: r.hidePhoto, hideBirth: hB, hideHeight: hH, hideWeight: hW, photoLink: link });
  }
  return out;
}

// 명단/연락망 시트에서 선수 행 찾기 (배번 우선, 없으면 이름)
function findPlayerRow(values, noCol, nameCol, no, name) {
  for (var i = 1; i < values.length; i++) {
    var rNo = noCol !== -1 ? (parseInt(values[i][noCol], 10) || 0) : 0;
    var rName = nameCol !== -1 ? String(values[i][nameCol] || '').trim() : '';
    if ((no > 0 && rNo === no) || (no === 0 && rName === name)) return i;
  }
  return -1;
}


// ==========================================================
// 🚀 [POST 요청 처리]
// ==========================================================
function doPost(e) {
  _dataMemo = null;
  // 없어진 기능을 예전 앱이 보내면 잠금 없이 바로 끝냄 (실시간 접속 · 활동 로그 · 공지 읽음) — 사진 · 일정 저장을 막지 않게
  try {
    var pd = JSON.parse(e && e.postData ? e.postData.contents : "{}");
    if (pd && pd.action === "presence") return json({ result: "success" });   // v2.14.0: 실시간 접속 알림 없앰 — 예전 앱이 보내도 잠금 없이 바로 끝냄
    if (pd && pd.action === "logActivity") return json({ result: "success" });   // v2.15.0: 보안 활동 로그 없앰 — 예전 앱이 보내도 시트에 안 쓰고 바로 끝냄
    if (pd && pd.action === "viewNotice") return json({ result: "success" });   // v2.20.0: 공지 조회수 · 읽은 사람 없앰 — 예전 앱이 보내도 시트에 안 쓰고 바로 끝냄
  } catch (err0) {}

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(30000);

  try {
    if (!locked) return json({ result: "error", message: "서버가 바쁩니다. 잠시 후 다시 시도해 주세요." });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData ? e.postData.contents : "{}");

    if (data.key !== API_KEY) return json({ result: "error", message: "unauthorized" });
    if (ALLOWED_POST_ACTIONS.indexOf(data.action) === -1) return json({ result: "error", message: "unknown action" });

    // ---- 로그인/로그아웃: 토큰 발급·폐기 ----
    if (data.action === "login")  return handleLogin(ss, data);
    if (data.action === "logout") { dropSession(data.token); return json({ result: "success" }); }

    // ---- 그 외 모든 쓰기 요청: 토큰(세션)으로 역할·자녀범위를 서버에서 직접 검사 ----
    var session = resolveSession(data.token);
    var role = session ? session.role : null;
    var a = data.action;

    if (a === "saveEvents" || a === "deleteEvent" || a === "saveNotice" || a === "deleteNotice") {
      if (!canEditScheduleRole(role)) return json({ result: "error", message: "일정/공지를 수정할 권한이 없습니다." });
    } else if (a === "saveVenue" || a === "deleteVenue") {   // v2.7.0: 🏟️ 구장 정보는 대표님 · 개발자만
      if (!(role === "super" || role === "dev")) return json({ result: "error", message: "구장 정보는 대표님만 수정할 수 있습니다." });
    } else if (a === "setUniformActive" || a === "setJerseyColors") {
      if (!(role === "super" || role === "dev")) return json({ result: "error", message: "권한이 없습니다." });
    } else if (a === "uploadPhoto" || a === "deletePhoto" || a === "updatePlayerInfo") {
      var _no = parseInt(data.playerNo, 10) || 0, _nm = cleanText(data.playerName, 30);
      if (!scopeHasPlayer(session, _no, _nm)) return json({ result: "error", message: "본인 자녀 정보만 수정할 수 있습니다." });
    } else if (a === "submitOrder") {
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      if (!(role === "super" || role === "dev")) data.asAdmin = false;   // 관리자만 마감 후/대리 접수 가능
    } else if (a === "changeAdminPw") {
      if (!canChangePwRole(role)) return json({ result: "error", message: "권한이 없습니다." });
    } else if (a === "registerContact") {
      if (!rateOk("reg_" + cleanText(data.clientId, 40), 10, 600)) return json({ result: "error", message: "잠시 후 다시 시도해 주세요." });
    }

    var _res = (function () { switch (data.action) {
      case "uploadPhoto":       return handleUploadPhoto(ss, data);
      case "deletePhoto":       return handleDeletePhoto(ss, data);
      case "updatePlayerInfo":  return handleUpdatePlayerInfo(ss, data);
      case "saveEvents":        return handleSaveEvents(ss, data);
      case "deleteEvent":       return handleDeleteEvent(ss, data);
      case "saveVenue":         return handleSaveVenue(ss, data);     // v2.6.0: 📍 구장 등록/수정
      case "deleteVenue":       return handleDeleteVenue(ss, data);
      case "saveNotice":        return handleSaveNotice(ss, data);
      case "deleteNotice":      return handleDeleteNotice(ss, data);
      case "submitOrder":       return handleSubmitOrder(ss, data);
      case "registerContact":   return handleRegisterContact(ss, data);
      case "setUniformActive":
        setUniformActive(data.active === true || data.active === "true");
        return json({ result: "success", uniformActive: getUniformActive() });
      case "setJerseyColors":
        return json({ result: "success", jerseyColors: setJerseyColors(data.colors) });
      case "verifyAdminPw":       return handleVerifyAdminPw(ss, data);
      case "changeAdminPw":       return handleChangeAdminPw(ss, data);
    }
    return json({ result: "error", message: "unhandled" }); })();
    dropDataCache(DATA_DROP[data.action] || []);   // ⚡ v2.13.0: 바뀐 부분만 캐시 비움
    return _res;
  } catch (err) {
    return json({ result: "error", message: err.toString() });
  } finally {
    if (locked) lock.releaseLock();
  }
}

// v2.11.1 — 줄 지우기 (안전하게)
//   구글 시트는 고정 줄(맨 위 제목 줄)만 남기고 나머지 줄을 전부 지우는 걸 막는다 (「고정되지 않은 행을 모두 삭제할 수 없습니다」)
//   → 탭이 빈 줄 없이 꽉 찬 상태에서 남은 줄을 다 지우면 전체 삭제가 거절됐음
//   → 그렇게 될 때만 맨 아래에 빈 줄 하나를 먼저 붙여 두고 지운다
function safeDeleteRows(sh, start, count) {
  if (!(count > 0)) return;
  var max = sh.getMaxRows(), frozen = sh.getFrozenRows();
  if (max - count <= frozen) sh.insertRowsAfter(max, 1);
  sh.deleteRows(start, count);
}

// [2] 사진 업로드 (1MB 이하 JPEG만)
function handleUploadPhoto(ss, data) {
  var no = parseInt(data.playerNo, 10) || 0;
  var name = cleanText(data.playerName, 30);
  if (!name) return json({ result: "error", message: "선수 이름이 없습니다." });

  var b64 = String(data.base64Data || "");
  if (!b64 || b64.length > 1400000) return json({ result: "error", message: "사진 용량이 너무 큽니다. (1MB 이하)" });

  var bytes;
  try { bytes = Utilities.base64Decode(b64); }
  catch (e1) { return json({ result: "error", message: "사진 데이터 형식 오류" }); }
  // JPEG 시그니처 (FF D8) - Apps Script 바이트는 부호 있는 값
  if (bytes.length < 4 || bytes[0] !== -1 || bytes[1] !== -40) {
    return json({ result: "error", message: "JPEG 사진만 등록할 수 있습니다." });
  }

  var pSheet = getRosterSheet(ss);
  var pValues = pSheet.getDataRange().getValues();
  var headers = pValues[0];
  var noCol = findColIdx(headers, ["배번", "등번호", "번호"]);
  var nameCol = findColIdx(headers, ["이름", "선수이름", "성명"]);
  var linkCol = findColIdx(headers, ["사진링크", "드라이브사진", "사진URL"]);

  var rowIdx = findPlayerRow(pValues, noCol, nameCol, no, name);
  if (rowIdx === -1) return json({ result: "error", message: "명단에 없는 선수입니다." });

  var folderName = "대연초_선수사진";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var filename = "No_" + no + "_" + name + ".jpg";
  var blob = Utilities.newBlob(bytes, "image/jpeg", filename);
  var oldFiles = folder.getFilesByName(filename);
  while (oldFiles.hasNext()) oldFiles.next().setTrashed(true);

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();

  if (linkCol === -1) {
    linkCol = headers.length;
    pSheet.getRange(1, linkCol + 1).setValue("사진링크");
  }
  pSheet.getRange(rowIdx + 1, linkCol + 1).setValue(directUrl);

  return json({ result: "success", url: directUrl });
}

// [3] 사진 삭제 (기본 이미지 복원)
function handleDeletePhoto(ss, data) {
  var no = parseInt(data.playerNo, 10) || 0;
  var name = cleanText(data.playerName, 30);
  if (!name) return json({ result: "error", message: "선수 이름이 없습니다." });

  var folders = DriveApp.getFoldersByName("대연초_선수사진");
  if (folders.hasNext()) {
    var folder = folders.next();
    var oldFiles = folder.getFilesByName("No_" + no + "_" + name + ".jpg");
    while (oldFiles.hasNext()) oldFiles.next().setTrashed(true);
  }

  var pSheet = getRosterSheet(ss);
  var pValues = pSheet.getDataRange().getValues();
  var headers = pValues[0];
  var noCol = findColIdx(headers, ["배번", "등번호", "번호"]);
  var nameCol = findColIdx(headers, ["이름", "선수이름", "성명"]);
  var linkCol = findColIdx(headers, ["사진링크", "드라이브사진", "사진URL"]);

  if (linkCol !== -1) {
    var rowIdx = findPlayerRow(pValues, noCol, nameCol, no, name);
    if (rowIdx !== -1) pSheet.getRange(rowIdx + 1, linkCol + 1).setValue("");
  }
  return json({ result: "success" });
}

// [3-1] 학부모 본인 선수 정보 수정 (투타/생년월일/키(신장)/몸무게 + 공개여부)
//   ⚠️ uploadPhoto/deletePhoto와 동일한 보안 모델: 서버는 "진짜 그 선수의 학부모인지"를
//   구분할 방법이 없고, API_KEY만 맞으면 누구나 호출 가능하다. 클라이언트(index.html/player.html)에서
//   isParentOfPlayer() 로 화면상 접근을 막아 두었을 뿐이니, 참고할 것.
function handleUpdatePlayerInfo(ss, data) {
  var no = parseInt(data.playerNo, 10) || 0;
  var name = cleanText(data.playerName, 30);
  if (!name) return json({ result: "error", message: "선수 이름이 없습니다." });

  var pSheet = getRosterSheet(ss);
  var pValues = pSheet.getDataRange().getValues();
  var headers = pValues[0];
  var noCol = findColIdx(headers, ["배번", "등번호", "번호"]);
  var nameCol = findColIdx(headers, ["이름", "선수이름", "성명"]);

  var rowIdx = findPlayerRow(pValues, noCol, nameCol, no, name);
  if (rowIdx === -1) return json({ result: "error", message: "명단에 없는 선수입니다." });

  var btCol = findColIdx(headers, ["투타", "투/타"]);
  var birthCol = findColIdx(headers, ["생년월일", "생일"]);
  var heightCol = findColIdx(headers, ["키", "신장"]);
  var weightCol = findColIdx(headers, ["몸무게", "체중"]);
  var birthOpenCol = findColIdx(headers, ["생년월일공개", "생일공개"]);
  var heightOpenCol = findColIdx(headers, ["키공개"]);
  var weightOpenCol = findColIdx(headers, ["몸무게공개"]);

  var sheetRow = rowIdx + 1;
  var bt = cleanText(data.bt, 10);
  var birth = cleanText(data.birth, 20);
  var height = digitsOnly(data.height, 6);
  var weight = digitsOnly(data.weight, 6);

  if (btCol !== -1) pSheet.getRange(sheetRow, btCol + 1).setNumberFormat("@").setValue(bt);
  if (birthCol !== -1) pSheet.getRange(sheetRow, birthCol + 1).setNumberFormat("@").setValue(birth);
  if (heightCol !== -1) pSheet.getRange(sheetRow, heightCol + 1).setValue(height);
  if (weightCol !== -1) pSheet.getRange(sheetRow, weightCol + 1).setValue(weight);
  if (birthOpenCol !== -1) pSheet.getRange(sheetRow, birthOpenCol + 1).setValue(data.hideBirth === true || data.hideBirth === "true" ? "OFF" : "ON");
  if (heightOpenCol !== -1) pSheet.getRange(sheetRow, heightOpenCol + 1).setValue(data.hideHeight === true || data.hideHeight === "true" ? "OFF" : "ON");
  if (weightOpenCol !== -1) pSheet.getRange(sheetRow, weightOpenCol + 1).setValue(data.hideWeight === true || data.hideWeight === "true" ? "OFF" : "ON");

  return json({ result: "success" });
}

// [4] 유니폼 주문 접수 (동명이인은 배번 우선, 배번이 없으면 이름+학년)
function handleSubmitOrder(ss, data) {
  if (!getUniformActive() && data.asAdmin !== true) {
    return json({ result: "error", message: "현재는 유니폼 접수 기간이 아닙니다." });
  }

  var ordSheet = getUniformSheet(ss);
  if (!ordSheet) return json({ result: "error", message: "유니폼 시트를 찾을 수 없습니다." });

  var values = ordSheet.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });

  var nameIdx = findColIdx(headers, ["선수이름", "이름", "성명"]);
  var noIdx = findColIdx(headers, ["배번", "등번호", "번호"]);
  var gradeIdx = findColIdx(headers, ["학년", "구분"]);
  var hIdx = findColIdx(headers, ["키", "신장"]);
  var wIdx = findColIdx(headers, ["몸무게", "체중"]);
  var dateIdx = findColIdx(headers, ["신청날짜", "접수일자"]);

  var reqNo = parseInt(data.playerNo, 10) || 0;
  var reqName = cleanText(data.playerName, 30);
  var reqGrade = String(data.playerGrade || '').replace(/[^0-9]/g, '');
  var height = digitsOnly(data.height, 5);
  var weight = digitsOnly(data.weight, 5);
  if (!reqName) return json({ result: "error", message: "선수 이름이 없습니다." });

  var targetRow = -1;
  for (var i = 1; i < values.length; i++) {
    var rName = nameIdx !== -1 ? String(values[i][nameIdx] || '').trim() : '';
    var rNo = noIdx !== -1 ? (parseInt(values[i][noIdx], 10) || 0) : 0;
    var rGrade = gradeIdx !== -1 ? String(values[i][gradeIdx] || '').replace(/[^0-9]/g, '') : '';

    var isTarget = false;
    if (reqNo > 0 && rNo > 0) {
      if (reqNo === rNo) isTarget = true;
    } else if (rName === reqName) {
      if (!reqGrade || !rGrade || reqGrade === rGrade) isTarget = true;
    }
    if (isTarget) { targetRow = i + 1; break; }
  }

  // 허용된 품목만 통과
  var rawItems = data.items || {};
  var items = {};
  for (var k in rawItems) {
    if (ALLOWED_ORDER_ITEMS.indexOf(k) === -1) continue;
    var v = cleanText(rawItems[k], 40);
    if (v && v !== "-") items[k] = v;
  }

  var dateStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy. MM. dd. HH:mm");

  if (targetRow !== -1) {
    if (height && hIdx !== -1) ordSheet.getRange(targetRow, hIdx + 1).setValue(height);
    if (weight && wIdx !== -1) ordSheet.getRange(targetRow, wIdx + 1).setValue(weight);
    for (var key in items) {
      var colIdx = findColIdx(headers, key);
      if (colIdx !== -1) ordSheet.getRange(targetRow, colIdx + 1).setValue(items[key]);
    }
    if (dateIdx !== -1) ordSheet.getRange(targetRow, dateIdx + 1).setValue(dateStr);
  } else {
    var newRow = new Array(headers.length);
    for (var c = 0; c < headers.length; c++) newRow[c] = "-";

    var seqIdx = findColIdx(headers, ["순번", "No"]);
    if (seqIdx !== -1) newRow[seqIdx] = values.length;
    if (noIdx !== -1) newRow[noIdx] = reqNo > 0 ? reqNo : "-";
    if (nameIdx !== -1) newRow[nameIdx] = reqName;
    if (gradeIdx !== -1) newRow[gradeIdx] = reqGrade || "-";
    if (hIdx !== -1) newRow[hIdx] = height || "-";
    if (wIdx !== -1) newRow[wIdx] = weight || "-";
    for (var key2 in items) {
      var ci = findColIdx(headers, key2);
      if (ci !== -1) newRow[ci] = items[key2];
    }
    if (dateIdx !== -1) newRow[dateIdx] = dateStr;
    ordSheet.appendRow(newRow);
  }

  return json({ result: "success" });
}

// [5] 최초 등록 → 학부모 비상연락망 시트에 저장
//   - 공식 명단에 있는 선수만 허용
//   - 해당 관계(아버님/어머님/기타) 칸이 비어 있을 때만 기록 (기존 번호는 덮어쓰지 않음)
//   - 웹으로 등록된 칸은 노란 배경 + 메모로 표시 (관리자가 확인 후 배경색 제거)
function handleRegisterContact(ss, data) {
  var slotMap = {
    "아버님": ["아버님", "아버지"],
    "어머님": ["어머님", "어머니"],
    "기타": ["기타연락처", "기타", "추가연락처"],
    "학생": ["학생연락처", "선수연락처"]
  };
  var role = String(data.role || "");
  var slot = slotMap[role];
  if (!slot) return json({ result: "error", message: "보호자 관계 오류" });

  var digits = String(data.phone || "").replace(/[^0-9]/g, "");
  if (digits.length !== 10 && digits.length !== 11) return json({ result: "error", message: "휴대폰 번호 오류" });
  var formatted = digits.length === 11
    ? digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")
    : digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");

  var reqNo = parseInt(data.playerNo, 10) || 0;
  var reqName = cleanText(data.playerName, 30);

  // 공식 명단 대조
  var rSheet = getRosterSheet(ss);
  var rValues = rSheet.getDataRange().getValues();
  var rHeaders = rValues[0];
  var rNoCol = findColIdx(rHeaders, ["배번", "등번호", "번호"]);
  var rNameCol = findColIdx(rHeaders, ["이름", "선수이름", "성명"]);
  var rGradeCol = findColIdx(rHeaders, ["구분", "학년", "직책"]);
  var rIdx = findPlayerRow(rValues, rNoCol, rNameCol, reqNo, reqName);
  var nsp = function (x) { return String(x || "").replace(/\s+/g, ""); };   // v2.30.0: 띄어쓰기는 무시 (「킬브라이드 이든」 = 「킬브라이드이든」)
  if (rIdx === -1 && reqNo === 0 && rNameCol !== -1) for (var ri = 1; ri < rValues.length; ri++) if (nsp(rValues[ri][rNameCol]) === nsp(reqName)) { rIdx = ri; break; }
  if (rIdx === -1) return json({ result: "error", message: isGradPlayer(ss, reqNo, reqName) ? "🎓 졸업한 선수라 새로 등록할 수 없어요." : "명단에 없는 선수입니다." });   // v2.9.0

  var rGrade = rGradeCol !== -1 ? String(rValues[rIdx][rGradeCol] || "").replace(/[^0-9]/g, "") : "";
  var rNo = rNoCol !== -1 ? (parseInt(rValues[rIdx][rNoCol], 10) || 0) : 0;
  var rName = String(rValues[rIdx][rNameCol] || "").trim();

  // ✅ 본인 확인: 이름뿐 아니라 "생년월일"도 명단과 일치해야 등록 허용 (학부모 아닌 사람의 무단 등록 차단)
  //   - 입력/명단 모두 숫자만 뽑아 비교하므로 "20150918" 과 "2015.09.18"(점·하이픈) 어느 쪽이든 통과된다.
  //   - 명단 칸이 날짜형으로 자동 변환돼 저장돼 있어도 정확히 비교한다.
  var rBirthCol = findColIdx(rHeaders, ["생년월일", "생일"]);
  var rBirth = birthDigits(rBirthCol !== -1 ? rValues[rIdx][rBirthCol] : "");
  var reqBirth = birthDigits(data.birth);
  if (!rBirth) return json({ result: "error", message: "명단에 생년월일이 없어 자동 등록이 어렵습니다. 관리자에게 문의해 주세요." });
  // 🔒 v2.30.0: 선수마다 확인 실패를 셈 — 5번 틀리면 1시간 동안 그 선수는 등록 막음 (기기 바꿔 가며 생년월일 맞히기 차단)
  var failKey = "RGF_" + (rNo > 0 ? "n" + rNo : "m" + nsp(rName)), fCache = sessionCache(), fails = 0;
  try { fails = Number(fCache.get(failKey) || 0); } catch (eF) {}
  if (fails >= 5) return json({ result: "error", message: "확인이 여러 번 틀려서 이 선수는 1시간 동안 등록할 수 없어요. 대표님 · 총무님께 문의해 주세요." });
  // v2.30.0: 배번으로 찾았어도 이름이 다르면 거절 (예전엔 배번이 있으면 이름을 안 봤음)
  if (reqBirth.length < 6 || reqBirth !== rBirth || (reqName && nsp(reqName) !== nsp(rName))) {
    try { fCache.put(failKey, String(fails + 1), 3600); } catch (eF2) {}
    return json({ result: "error", message: "이름 또는 생년월일이 명단과 일치하지 않습니다." });
  }
  try { fCache.remove(failKey); } catch (eF3) {}

  var cSheet = getContactSheet(ss);
  if (!cSheet) return json({ result: "error", message: "비상연락망 시트를 찾을 수 없습니다." });

  var cValues = cSheet.getDataRange().getValues();
  var cHeaders = cValues[0].map(function (h) { return String(h).trim(); });
  var cSeqCol = findColIdx(cHeaders, ["순번", "No"]);
  var cNoCol = findColIdx(cHeaders, ["배번", "등번호", "번호"]);
  var cNameCol = findColIdx(cHeaders, ["선수이름", "이름", "선수명"]);
  var cGradeCol = findColIdx(cHeaders, ["학년", "구분"]);
  var cSlotCol = findColIdx(cHeaders, slot);
  if (cSlotCol === -1) return json({ result: "error", message: "연락처 열을 찾을 수 없습니다." });

  var row = -1;
  for (var i = 1; i < cValues.length; i++) {
    var cNo = cNoCol !== -1 ? (parseInt(cValues[i][cNoCol], 10) || 0) : 0;
    var cName = cNameCol !== -1 ? String(cValues[i][cNameCol] || "").trim() : "";
    var cGrade = cGradeCol !== -1 ? String(cValues[i][cGradeCol] || "").replace(/[^0-9]/g, "") : "";

    var match = false;
    if (rNo > 0 && cNo > 0) match = (cNo === rNo);
    else if (cName === rName) match = (!rGrade || !cGrade || rGrade === cGrade);

    if (match) { row = i + 1; break; }
  }

  var stamp = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy. MM. dd. HH:mm");

  if (row === -1) {
    var newRow = new Array(cHeaders.length);
    for (var c = 0; c < cHeaders.length; c++) newRow[c] = "";
    if (cSeqCol !== -1) newRow[cSeqCol] = cValues.length;
    if (cNoCol !== -1 && rNo > 0) newRow[cNoCol] = rNo;
    if (cNameCol !== -1) newRow[cNameCol] = rName;
    if (cGradeCol !== -1 && rGrade) newRow[cGradeCol] = rGrade;
    cSheet.appendRow(newRow);
    row = cSheet.getLastRow();
  } else {
    var curDigits = String(cSheet.getRange(row, cSlotCol + 1).getValue() || "").replace(/[^0-9]/g, "");
    if (curDigits === digits) return json({ result: "success", note: "already" });
    if (curDigits) return json({ result: "exists", message: "이미 다른 번호가 등록되어 있습니다." });
  }

  cSheet.getRange(row, cSlotCol + 1)
        .setNumberFormat("@")
        .setValue(formatted)
        .setBackground("#fef9c3")
        .setNote("웹 최초등록 " + stamp + " (확인 후 배경색 제거)");

  return json({ result: "success" });
}

// [6] 관리자 비밀번호 검증
//   - 입력값을 최고/보조/일반 비밀번호와 대조해 일치하는 등급만 돌려준다.
//   - verifyAdminPw 자체는 역할(role)만 돌려주고 값은 내려보내지 않는다.
//     (단, "getAdminPasswordsRaw" 액션은 예외로 값을 그대로 반환한다 — doGet의 [0-2] 참고)
function handleVerifyAdminPw(ss, data) {
  var pw = String(data.password || "");
  if (!pw) return json({ result: "error" });

  var pws = getAdminPasswords();
  var role = null;
  if (pw === pws.super) role = "super";
  else if (pw === pws.sub) role = "sub";
  else if (pw === pws.general) role = "general";
  else if (pws.vsuper && pw === pws.vsuper) role = "vsuper";
  else if (pws.vgeneral && pw === pws.vgeneral) role = "vgeneral";

  if (!role) return json({ result: "error" });
  return json({ result: "success", role: role });
}

// [7] 관리자 비밀번호 변경
//   - 반드시 "현재 대표님 비밀번호"를 함께 보내야 하고, 이게 일치할 때만 변경을 허용한다.
//     (총무님 · 부대표님 · 부총무님은 본인 현재 비밀번호로 본인 비밀번호만 — v2.27.0)
//   - Script Properties(서버)에 저장되므로 저장 즉시 모든 기기에 동일하게 적용된다.
function handleChangeAdminPw(ss, data) {
  var pws = getAdminPasswords();
  var curPw = String(data.currentPw || "");
  var updates = data.updates || {};
  // 대표님 비밀번호: 모든 등급 변경 가능 / 총무님 · 부대표님 · 부총무님 비밀번호: 본인 비밀번호만 변경 가능
  var roleKeys = { super: "ADMIN_PW_SUPER", sub: "ADMIN_PW_SUB", general: "ADMIN_PW_GENERAL", vsuper: "ADMIN_PW_VSUPER", vgeneral: "ADMIN_PW_VGENERAL" };
  if (!curPw) return json({ result: "error", message: "현재 비밀번호가 일치하지 않습니다." });
  if (curPw !== pws.super) {
    var owner = curPw === pws.general ? "general" : (pws.vsuper && curPw === pws.vsuper) ? "vsuper" : (pws.vgeneral && curPw === pws.vgeneral) ? "vgeneral" : null;
    if (!owner) return json({ result: "error", message: "현재 비밀번호가 일치하지 않습니다." });
    for (var uk in roleKeys) {
      if (uk !== owner && (uk in updates) && updates[uk]) {
        return json({ result: "error", message: roleName(owner) + "은 " + roleName(owner) + " 비밀번호만 변경할 수 있습니다." });
      }
    }
  }

  var props = PropertiesService.getScriptProperties();
  var changed = [];

  // v2.4.6 — 바꾼 뒤의 최종 비밀번호들을 먼저 계산해서 "겹치는 번호"가 있으면 저장하지 않는다.
  //   로그인은 개발자 → 대표님 → 코치진 → 총무님 → 부대표님 → 부총무님 → 일반 열람용 → 학부모 휴대폰 순서로 확인하므로,
  //   번호가 겹치면 뒤쪽 역할(예: 일반 열람용)로는 영영 로그인이 안 된다.
  var finalPws = { super: pws.super, sub: pws.sub, general: pws.general, vsuper: pws.vsuper, vgeneral: pws.vgeneral };
  for (var role in roleKeys) {
    if (!(role in updates)) continue;
    var v = String(updates[role] || "").trim();
    if (!v) continue;
    if (v.length < 4 || v.length > 20) {
      return json({ result: "error", message: roleName(role) + " 비밀번호는 4~20자로 입력해 주세요." });
    }
    finalPws[role] = v;
    changed.push(role);
  }
  if (changed.length === 0) return json({ result: "error", message: "변경할 비밀번호를 입력해 주세요." });

  var others = [];   // [표시 이름, 값]
  var guestCode = props.getProperty("GUEST_CODE") || "1922";   // 로그인과 같은 기본값
  var devPw = props.getProperty("ADMIN_PW_DEV");
  for (var i = 0; i < changed.length; i++) {
    var r = changed[i], val = finalPws[r];
    for (var r2 in finalPws) {
      if (r2 !== r && finalPws[r2] === val) {
        return json({ result: "error", message: roleName(r) + " 비밀번호가 " + roleName(r2) + " 비밀번호와 같습니다. 역할마다 다른 번호로 정해 주세요." });
      }
    }
    if (guestCode && val === guestCode) {
      return json({ result: "error", message: roleName(r) + " 비밀번호가 일반 열람용 비밀번호와 같습니다. 이대로면 열람용으로 로그인이 안 되니 다른 번호로 정해 주세요." });
    }
    if ((devPw && val === devPw) || devDateCodes().indexOf(val) !== -1) {
      return json({ result: "error", message: roleName(r) + " 비밀번호로 쓸 수 없는 번호입니다. 다른 번호로 정해 주세요." });
    }
  }
  for (var j = 0; j < changed.length; j++) props.setProperty(roleKeys[changed[j]], finalPws[changed[j]]);

  return json({ result: "success", changed: changed });
}


// ==========================================================
// 🚀 [GET 요청 처리] - 설정, 비상연락망, 유니폼 접수 조회
// ==========================================================
function doGet(e) {
  _dataMemo = null;
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    if (p.key !== API_KEY) return json({ error: "unauthorized" });

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (p.action === "warm") return json(p.part === "check" ? warmCheck() : warmData(ss, String(p.part || "")));   // 🔥 v2.16.0: 로그인 화면에서 미리 데워 두기 (v2.17.0: 세 묶음으로 나눠 동시에)

    // 🔐 로그인/로그아웃: GET으로 호출된다(앱스 스크립트는 읽을 수 있는 응답이 GET에서 안정적이라서).
    if (p.action === "login")  return handleLogin(ss, { code: p.code, clientId: p.clientId });
    if (p.action === "logout") { dropSession(p.token); return json({ result: "success" }); }

    // ✍️ v2.30.0: 최초 등록을 GET 으로도 받음 → 앱이 결과(성공 · 이름/생년월일 불일치 · 이미 다른 번호)를 읽고 그대로 안내
    //   (예전 POST 는 앱이 답을 못 읽어서, 이미 연락망에 있는 번호면 생년월일이 틀려도 로그인돼 「등록 완료」처럼 보였음)
    if (p.action === "registerContact") {
      if (!rateOk("reg_" + cleanText(p.clientId, 40), 10, 600)) return json({ result: "error", message: "잠시 후 다시 시도해 주세요." });
      var rgLock = LockService.getScriptLock();
      if (!rgLock.tryLock(20000)) return json({ result: "error", message: "서버가 바쁩니다. 잠시 후 다시 시도해 주세요." });
      try { var rgOut = handleRegisterContact(ss, p); dropDataCache(DATA_DROP.registerContact || []); return rgOut; } finally { rgLock.releaseLock(); }
    }

    // 🔐 토큰(세션)으로 역할 확인 — 아래 모든 조회는 로그인(토큰)이 있어야 하고 역할에 따라 걸러진다.
    var session = resolveSession(p.token);
    var role = session ? session.role : null;

    // [0] 공용 설정 (유니폼 접수 ON/OFF) — 로그인한 사람만
    if (p.action === "getSettings") {
      if (!session) return json({ error: "auth", uniformActive: false });
      return json({ uniformActive: getUniformActive(), jerseyColors: getJerseyColors() });
    }

    // [0-1] 관리자 비밀번호 변경 (로그인한 관리자만. 현재 비번도 서버에서 재확인)
    if (p.action === "changeAdminPw") {
      if (!canChangePwRole(role)) return json({ result: "error", message: "권한이 없습니다." });
      var pwUpdates = {};
      if (p.newSuper) pwUpdates.super = p.newSuper;
      if (p.newSub) pwUpdates.sub = p.newSub;
      if (p.newGeneral) pwUpdates.general = p.newGeneral;
      if (p.newVsuper) pwUpdates.vsuper = p.newVsuper;       // v2.27.0: 부대표님
      if (p.newVgeneral) pwUpdates.vgeneral = p.newVgeneral; // v2.27.0: 부총무님
      return handleChangeAdminPw(ss, { currentPw: p.currentPw, updates: pwUpdates });
    }

    // [0-1b] 현재 관리자 비밀번호 보기 — 로그인 토큰의 역할을 서버가 확인
    //   개발자: 대표님·코치진·총무님·부대표님·부총무님 전부 / 대표님: 대표님 빼고 전부 / 그 외: 불가
    //   (부대표님 · 부총무님은 아직 안 정했으면 "" — 사이트가 「아직 없음」으로 표시)
    if (p.action === "getAdminPwView") {
      var curPws = getAdminPasswords();
      if (role === "dev") return json({ result: "success", super: curPws.super, sub: curPws.sub, general: curPws.general, vsuper: curPws.vsuper, vgeneral: curPws.vgeneral });
      if (role === "super") return json({ result: "success", sub: curPws.sub, general: curPws.general, vsuper: curPws.vsuper, vgeneral: curPws.vgeneral });
      return json({ result: "error", message: "권한이 없습니다." });
    }

    // [0-2] 👥 선수 명단 (역할에 맞게 서버에서 걸러서 제공)
    if (p.action === "getRoster") {
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      prefetchData(["C_ROSTER", "C_GRADS"]); waitForWarm(["C_ROSTER", "C_GRADS"]);
      var ro = { result: "success", role: role, ver: {}, same: [] };
      verGroup(ro, p, "roster", "vr", { players: buildRosterPayload(ss, session), grads: buildGradPayload(ss, session), season: seasonCurrent() });   // v2.9.0: 🎓 졸업생 · 학년도 · v2.23.0: 번호가 같으면 생략
      return json(ro);
    }

    // [0-2b] 🚀 v2.12.0: 앱을 켤 때 한 번에 — 명단 · 졸업생 · 학년도 + 설정 + 일정 · 구장 + 공지 (요청 4개 → 1개)
    //   일정 · 공지를 못 읽어도 명단은 그대로 보냄 (빠진 것은 사이트가 따로 다시 받음)
    if (p.action === "bootstrap") {
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      prefetchData(DATA_KEYS);   // ⚡ v2.16.0: 보관본 6칸을 한 번에
      waitForWarm(DATA_KEYS);    // ⏳ v2.17.0: 미리 데우기가 읽는 중이면 기다렸다 씀
      var bo = { result: "success", role: role, settings: { uniformActive: getUniformActive(), jerseyColors: getJerseyColors() }, ver: {}, same: [] };
      // 🔢 v2.23.0: 사이트 저장본과 번호가 같은 묶음은 빼고 보냄 (same)
      verGroup(bo, p, "roster", "vr", { players: buildRosterPayload(ss, session), grads: buildGradPayload(ss, session), season: seasonCurrent() });
      if (canSeeBoard(role)) {   // 🔒 v2.24.0: 일반 열람자에게는 일정 · 공지를 보내지 않음
        try { verGroup(bo, p, "sched", "vs", { events: readEvents(ss), venues: readVenues(ss) }); } catch (eB1) {}
        try { verGroup(bo, p, "notice", "vn", { notices: readNotices(ss) }); } catch (eB2) {}
        try { bo.officers = readOfficers(ss); } catch (eB3) {}   // 📞 v2.28.0: 집행부 단축 버튼 (보호자 · 관리자만)
        try { bo.duty = dutyPublic(readDuty(ss)); } catch (eB4) {}   // 🧹 v2.31.0: 부실 청소 당번 (보호자 · 관리자만)
      }
      return json(bo);
    }

    // [0-3] 📅 일정 / 📢 공지사항 조회 (로그인한 사람만)
    if (p.action === "getSchedule") {
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      if (!canSeeBoard(role)) return json({ result: "error", message: "보호자 · 관리자만 볼 수 있습니다." });   // 🔒 v2.24.0
      prefetchData(["C_EVENTS", "C_VENUES", "C_DUTY", "C_ROSTER"]); waitForWarm(["C_EVENTS", "C_VENUES", "C_DUTY"]);
      var so = { result: "success", ver: {}, same: [] };
      verGroup(so, p, "sched", "vs", { events: readEvents(ss), venues: readVenues(ss) });   // v2.6.0: 구장 목록도 함께 · v2.23.0: 번호가 같으면 생략
      try { so.duty = dutyPublic(readDuty(ss)); } catch (eSD) {}   // 🧹 v2.31.0: 일정을 새로 받을 때 당번도 새로
      return json(so);
    }
    if (p.action === "getNotices") {
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      if (!canSeeBoard(role)) return json({ result: "error", message: "보호자 · 관리자만 볼 수 있습니다." });   // 🔒 v2.24.0
      prefetchData(["C_NOTICES"]); waitForWarm(["C_NOTICES"]);
      var no = { result: "success", ver: {}, same: [] };
      verGroup(no, p, "notice", "vn", { notices: readNotices(ss) });   // v2.23.0: 번호가 같으면 생략
      return json(no);
    }
    // 📞 v2.29.0: 집행부(맡는 분) 보기 · 바꾸기 — 대표님 · 개발자만
    if (p.action === "getOfficerAdmin" || p.action === "saveOfficer") {
      if (!(role === "super" || role === "dev")) return json({ result: "error", message: "대표님만 바꿀 수 있습니다." });
      if (p.action === "getOfficerAdmin") return json(officerAdminView(ss));
      var oLock = LockService.getScriptLock();
      if (!oLock.tryLock(10000)) return json({ result: "error", message: "서버가 바쁩니다. 잠시 후 다시 시도해 주세요." });
      try { return json(saveOfficer(ss, session, p)); } finally { oLock.releaseLock(); }
    }
    if (p.action === "getOfficers") {   // 📞 v2.28.0: 집행부 단축 버튼 번호만 (앱이 저장본으로 켜져 bootstrap 을 건너뛴 경우)
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      if (!canSeeBoard(role)) return json({ result: "error", message: "보호자 · 관리자만 볼 수 있습니다.", officers: [] });
      prefetchData(["C_OFFICERS"]);
      return json({ result: "success", officers: readOfficers(ss) });
    }
    // 🧹 v2.31.0: 부실 청소 당번 — 보기(보호자 · 관리자) · 관리(대표님 · 총무님 · 개발자: 쉬기 · 바꾸기)
    if (p.action === "getDuty") {
      if (!session) return json({ result: "error", message: "인증이 필요합니다." });
      if (!canSeeBoard(role)) return json({ result: "error", message: "보호자 · 관리자만 볼 수 있습니다." });
      prefetchData(["C_DUTY", "C_ROSTER"]);
      return json({ result: "success", duty: dutyPublic(readDuty(ss)) });
    }
    if (p.action === "getDutyAdmin" || p.action === "dutySkip" || p.action === "dutySwap" || p.action === "dutyOrder") {   // v2.32.0: 🔀 순서 · 가족 편집
      if (!canEditScheduleRole(role)) return json({ result: "error", message: "대표님 · 총무님만 바꿀 수 있습니다." });
      if (p.action !== "getDutyAdmin") {
        var dLock = LockService.getScriptLock();
        if (!dLock.tryLock(10000)) return json({ result: "error", message: "서버가 바쁩니다. 잠시 후 다시 시도해 주세요." });
        var dRes;
        try { dRes = p.action === "dutySkip" ? dutySetSkip(ss, session, p) : p.action === "dutyOrder" ? dutySaveOrder(ss, session, p) : dutySwap(ss, session, p); }
        finally { dLock.releaseLock(); dropDataCache(["C_DUTY"]); }
        if (!dRes || dRes.result !== "success") return json(dRes || { result: "error", message: "저장에 실패했습니다." });
      }
      prefetchData(["C_DUTY", "C_ROSTER"]);
      var dv = readDuty(ss);
      return json({ result: "success", duty: dv, pub: dutyPublic(dv) });
    }
    if (p.action === "getNoticeReaders") return json({ result: "error", message: "읽은 사람 기능은 없어졌습니다.", readers: [] });   // v2.20.0

    // [0-4] 유니폼 신청 원본 행 (대표/개발자만) — 관리자 집계 화면용
    if (p.action === "getUniformRows") {
      if (!(role === "super" || role === "dev")) return json({ result: "error", rows: [] });
      var uSheet = getUniformSheet(ss);
      return json({ result: "success", rows: uSheet ? uSheet.getDataRange().getValues() : [] });
    }

    // v2.14.0: 🟢 실시간 접속 알림 없앰 — 예전 개발자 앱이 물어도 시트를 안 읽고 바로 끝냄
    if (p.action === "presenceFeed") return json({ result: "error", message: "실시간 접속 알림은 없어졌습니다." });

    // [0-5] 🎓 새 학년도 넘기기 (v2.9.0) — 대표님 · 개발자만 (미리보기 · 실행 · 졸업생 연락망 삭제)
    if (p.action === "seasonStatus" || p.action === "seasonPreview" || p.action === "seasonRollover" || p.action === "seasonPurge") {
      if (!(role === "super" || role === "dev")) return json({ result: "error", message: "권한이 없습니다." });
      if (p.action === "seasonStatus") return json(seasonStatus(ss));
      if (p.action === "seasonPreview") return json(seasonPreviewData(ss));
      var sLock = LockService.getScriptLock();
      if (!sLock.tryLock(30000)) return json({ result: "error", message: "서버가 바쁩니다. 잠시 후 다시 시도해 주세요." });
      try {
        if (p.action === "seasonPurge") { var gi = seasonGradContactsInfo(ss, true); return json({ result: "success", deleted: gi.deleted, left: gi.total }); }
        return json(seasonRollover(ss, session, p));
      } finally { sLock.releaseLock(); dropDataCache(["C_ROSTER", "C_GRADS", "C_OFFICERS", "C_DUTY"]); }   // ⚡ v2.13.0: 명단이 바뀌었으니 캐시 비움 (v2.31.0: 청소 당번도)
    }

    // v2.15.0: 📜 보안 활동 로그 없앰 — 예전 개발자 앱이 물어도 시트를 안 읽고 바로 끝냄
    if (p.action === "getLogs" || p.action === "logs") return json({ logs: [] });
    if (p.action === "deleteLogs") return json({ result: "error", message: "보안 활동 로그는 없어졌습니다." });

    // [2] 학부모 비상연락망 — 대표/총무/부대표/부총무/개발자만 (v2.27.0: 부대표님 · 부총무님 추가)
    if (p.action === "getContacts" || p.action === "contacts") {
      if (!canSeeContactsRole(role)) return json({ error: "권한이 없습니다.", contacts: [] });
      var contactSheet = getContactSheet(ss);
      if (!contactSheet) return json({ contacts: [] });

      var cValues = contactSheet.getDataRange().getValues();
      var cHeaders = cValues[0].map(function (h) { return String(h).trim(); });
      var contacts = [];
      for (var r = 1; r < cValues.length; r++) {
        if (!cValues[r].join("").trim()) continue;
        var item = {};
        for (var j = 0; j < cHeaders.length; j++) {
          item[cHeaders[j]] = String(cValues[r][j] !== undefined && cValues[r][j] !== null ? cValues[r][j] : "").trim();
        }
        contacts.push(item);
      }
      return json({ headers: cHeaders, contacts: contacts });
    }

    // [3] 유니폼 주문 현황 (기본 동작) — 대표/개발자만
    if (!(role === "super" || role === "dev")) return json({ orders: [] });
    var ordSheet = getUniformSheet(ss);
    if (!ordSheet) return json({ orders: [] });

    var rows = ordSheet.getDataRange().getValues();
    var headers = rows[0].map(function (h) { return String(h).trim(); });

    var nameCol = findColIdx(headers, ["선수이름", "이름", "성명"]);
    var noCol = findColIdx(headers, ["배번", "등번호", "번호"]);
    var gradeCol = findColIdx(headers, ["학년", "구분"]);
    var hCol = findColIdx(headers, ["키", "신장"]);
    var wCol = findColIdx(headers, ["몸무게", "체중"]);
    var dateCol = findColIdx(headers, ["신청날짜", "접수일자"]);

    var orders = [];
    for (var o = 1; o < rows.length; o++) {
      var row = rows[o];
      var pName = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
      if (!pName) continue;

      var pNo = noCol !== -1 ? String(row[noCol] || '').trim() : '-';
      var pGrade = gradeCol !== -1 ? String(row[gradeCol] || '').trim() : '-';
      var pH = hCol !== -1 ? String(row[hCol] || '').trim() : '-';
      var pW = wCol !== -1 ? String(row[wCol] || '').trim() : '-';
      var pDate = dateCol !== -1 ? String(row[dateCol] || '').trim() : '';

      var rowItems = {};
      var hasOrder = false;
      for (var k = 0; k < ALLOWED_ORDER_ITEMS.length; k++) {
        var key = ALLOWED_ORDER_ITEMS[k];
        var cIdx = findColIdx(headers, key);
        var val = cIdx !== -1 ? String(row[cIdx] || '').trim() : '-';
        rowItems[key] = (val && val !== '-' && val !== '0') ? val : '-';
        if (rowItems[key] !== '-') hasOrder = true;
      }

      orders.push({
        id: o,
        playerNo: pNo,
        playerName: pName,
        playerGrade: pGrade,
        height: pH,
        weight: pW,
        items: rowItems,
        hasOrder: hasOrder,   // 날짜가 없어도 사이즈가 있으면 신청함
        date: pDate || (hasOrder ? "신청완료" : "-")
      });
    }
    return json({ orders: orders });
  } catch (err) {
    return json({ error: err.toString() });
  }
}


// ==========================================================
// 📅 일정 / 📢 공지사항 (v2.15.0)
// ==========================================================
// - 시트가 없으면 처음 조회할 때 자동으로 만들고, 카카오톡 공지방 내용으로 초기 데이터를 채운다.
// - 날짜/시간은 구글 시트가 자동으로 날짜형으로 바꾸지 않도록 "텍스트(@)" 서식으로 저장한다.
// - 보안 모델은 다른 기능과 동일: API_KEY 만 확인하고, 누가 수정할 수 있는지는 화면(index.html)에서 막는다.
//   (수정: 대표님·총무님·개발자 / 조회: 학부모 인증자·관리자)
var SCHEDULE_SHEET_NAME = "일정";
var SCHEDULE_HEADERS = ["ID", "날짜", "시작", "종료", "구분", "제목", "장소", "상대", "대상학년", "대상메모", "집합/출발", "복장", "메모", "수정일시", "결과"];   // v2.4.2: 결과(승/패/무 + 점수) — 사이트의 부캉이 표정·승리 축하에 씀
var SCHEDULE_KEYS    = ["id", "date", "start", "end", "type", "title", "place", "opponent", "grades", "target", "meet", "dress", "memo", "updated", "result"];

var NOTICE_SHEET_NAME = "공지사항";
var NOTICE_HEADERS = ["ID", "고정", "분류", "제목", "내용", "작성자", "작성일시", "수정일시"];
var NOTICE_KEYS    = ["id", "pinned", "category", "title", "body", "author", "created", "updated"];

function nowKst() { return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm"); }

// 여러 줄 입력 정리 (줄바꿈은 유지, 수식 주입 방지)
function cleanMultiline(v, maxLen) {
  var s = String(v == null ? "" : v).replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
  if (s.length > (maxLen || 3000)) s = s.substring(0, maxLen || 3000);
  s = s.replace(/^[=@+\-]+/, "");
  return s;
}

function cellToText(v, kind) {
  if (v instanceof Date) {
    if (kind === "date") return Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd");
    if (kind === "time") return Utilities.formatDate(v, "Asia/Seoul", "HH:mm");
    return Utilities.formatDate(v, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  }
  return String(v == null ? "" : v);
}

function ensureSheet(ss, name, headers, seedRows) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sh = ss.getSheetByName(name);
    if (sh) return sh;
    sh = ss.insertSheet(name, ss.getSheets().length);
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 500), headers.length).setNumberFormat("@");
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground("#0b2240").setFontColor("#ffffff").setFontWeight("bold");
    sh.setFrozenRows(1);
    if (typeof seedRows === "function") seedRows = seedRows();   // v2.13.0: 초기 데이터는 시트를 새로 만들 때만 계산
    if (seedRows && seedRows.length) sh.getRange(2, 1, seedRows.length, headers.length).setValues(seedRows);
    return sh;
  } finally {
    lock.releaseLock();
  }
}

function readTable(sh, keys, kinds) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, keys.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i][0] || "").trim()) continue;
    var o = {};
    for (var k = 0; k < keys.length; k++) o[keys[k]] = cellToText(vals[i][k], kinds[keys[k]]);
    out.push(o);
  }
  return out;
}

function findRowById(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function writeRow(sh, rowNum, row) {
  var rng = sh.getRange(rowNum, 1, 1, row.length);
  rng.setNumberFormat("@");
  rng.setValues([row]);
}

// ==========================================================
// 🧹 v2.31.0: 부실 청소 당번 — 시트 「당번」 탭 (설정 1~5줄 · 7줄 머리글 · 순서표 A:F · 바뀐 날 H:L)
//   · 차례: 청소 횟수가 적은 가정부터, 같으면 순서 번호(입단 순서) 순 → 한 바퀴 돌면 다시 1번부터
//   · 날짜: 시작일부터 간격(주)마다 · 바뀐 날 표 — 「쉼」 그날 건너뜀(차례는 다음 회로) · 「옮김」 옮길 날짜로 · 「지정」 그날은 그 선수 가정
//   · 날짜가 지나면 그날 당번의 「청소 횟수 +1 · 마지막 청소 = 그날」을 서버가 시트에 적음
//     → 나중에 순서표를 고치거나 졸업으로 줄이 빠져도 지난 차례는 그대로 (Script Properties 「DUTY_UPTO」에 어디까지 적었는지도 남김)
//   · 선수 명단에 없는 이름(졸업 · 오타)과 비고에 「빼기」인 줄은 차례에서 빠짐
//   · v2.32.0: 가족 단위 — 비상연락망에서 아버님 · 어머님 번호가 같은 선수는 한 가족(형제)으로 묶음 · 한 가족은 한 줄만 차례에 들어감
//     관리 탭에서 순서 바꾸기 · 빼기 · 가족 추가 · 시작일 · 안내 문구 (dutyOrder) — 시트를 직접 안 고쳐도 됨
//   · 보호자 · 관리자에게만 보냄 (1922 일반 열람자 X) · 쉬기 · 바꾸기는 대표님 · 총무님 · 개발자
//   · v2.33.0: 청소 날 = 매달 2 · 4번째 토요일과 그 다음 날 일요일을 한 칸(주말)으로 — 경기가 있으면 토 · 일 중 하루 편한 날
//     시작일은 「이 날부터」(그 뒤 첫 청소 주말부터 차례 시작) · 몇 번째 주말인지는 시트 「청소 주」 칸 (기본 2 · 4)
//     칸 열쇠는 그 주말 토요일 · 주말 일요일이 지나야 「청소함」으로 적음 · 바뀐 날 표에 일요일을 적어도 그 주말로 봄
//   · v2.34.0: 청소 주기 고르기 — 매주 · 격주(2·4 / 1·3) · 한 달에 한 번(1~4번째) · 시트 「청소 주」 드롭다운 = 관리 탭 편집 창
//     칸 글자에서 숫자(1~5)만 읽음 → 「격주 (2·4번째 주말)」 = 2 · 4번째 · 주기를 바꿔도 청소 횟수 적은 가족부터 이어서 돎
//   · v2.35.0: 관리 탭 「가족 추가」 때 배번도 늘 적음 (예전엔 같은 이름이 있을 때만)
// ==========================================================
var DUTY_SHEET_NAME = "당번";
var DUTY_SHEET_GID = 2026102;
var DUTY_MAX_UP = 60;   // 다가오는 차례는 최대 60회 (한 바퀴가 다 보일 때까지)
// 📅 v2.34.0: 청소 주기 고르기 (시트 드롭다운 글자와 똑같이 · 글자 안 숫자가 몇 번째 주말인지)
var DUTY_WK_PRESET = [
  { k: "1,2,3,4,5", t: "매주 (1·2·3·4·5번째 주말)" },
  { k: "2,4", t: "격주 (2·4번째 주말)" },
  { k: "1,3", t: "격주 (1·3번째 주말)" },
  { k: "1", t: "한 달에 한 번 (1번째 주말)" },
  { k: "2", t: "한 달에 한 번 (2번째 주말)" },
  { k: "3", t: "한 달에 한 번 (3번째 주말)" },
  { k: "4", t: "한 달에 한 번 (4번째 주말)" }
];
function dutyWkKey(v) { var o = {}; (String(v == null ? "" : v).match(/[1-5]/g) || []).forEach(function (x) { o[+x] = 1; }); return Object.keys(o).map(Number).sort(function (a, b) { return a - b; }).join(","); }

function dutySheet(ss) {
  var sh = ss.getSheetByName(DUTY_SHEET_NAME);
  if (sh) return sh;
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (String(all[i].getSheetId()) === String(DUTY_SHEET_GID)) return all[i];
  return null;
}
function dutyTz(ss) { try { return ss.getSpreadsheetTimeZone() || "Asia/Seoul"; } catch (e) { return "Asia/Seoul"; } }
function dutyOkYmd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  var t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return "";
  return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
}
// 칸 값 → "yyyy-MM-dd" (날짜 칸은 시트 시간대 기준으로 보이는 날짜 · 글자는 숫자만 골라 읽음)
function dutyYmd(v, tz) {
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, tz || "Asia/Seoul", "yyyy-MM-dd");
  var s = String(v == null ? "" : v).trim(), m;
  if (!s) return "";
  if ((m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/))) return dutyOkYmd(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return dutyOkYmd(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/))) return dutyOkYmd(m[3], m[1], m[2]);
  return "";
}
function dutyAdd(ymd, days) {
  var a = String(ymd).split("-"), d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]) + days * 86400000);
  return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
}
function dutyToday() { return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd"); }
// 📅 v2.33.0: 주말 한 칸 — 요일 (0 일 ~ 6 토) · 일요일이면 앞 토요일로 · 토요일이면 다음 날 일요일이 끝
function dutyDow(ymd) { var a = String(ymd).split("-"); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay(); }
function dutySatKey(ymd) { return ymd && dutyDow(ymd) === 0 ? dutyAdd(ymd, -1) : ymd; }
function dutyWkEnd(ymd) { return ymd && dutyDow(ymd) === 6 ? dutyAdd(ymd, 1) : ""; }
function dutyNthOf(ymd) { return Math.floor((parseInt(String(ymd).slice(8), 10) - 1) / 7) + 1; }   // 그 달 몇 번째 같은 요일인지
// 청소 주말(토요일) 목록 — from 이후 (그 주말 일요일이 from 이상) · to 까지
function dutySlotDays(wk, from, to) {
  var out = [], a = String(from).split("-"), y = +a[0], m = +a[1];
  for (var k = 0; k < 40; k++) {
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), sat1 = 1 + (6 - first + 7) % 7;
    for (var n = 1; n <= 5; n++) {
      if (wk.indexOf(n) === -1) continue;
      var day = sat1 + (n - 1) * 7, ymd = dutyOkYmd(y, m, day);
      if (!ymd) continue;
      if (ymd > to) return out;
      if (dutyAdd(ymd, 1) >= from) out.push(ymd);
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function dutyIsSlot(cfg, ymd) {   // 이 날(토 · 일)이 청소 주말인가
  var s = dutySatKey(ymd);
  return !!s && dutyDow(s) === 6 && cfg.wk.indexOf(dutyNthOf(s)) !== -1 && (!cfg.start || dutyAdd(s, 1) >= cfg.start);
}
function dutyNsp(x) { return String(x || "").replace(/\s+/g, ""); }
function dutyWho(s) {   // 「이름」 또는 「이름(배번)」
  s = String(s || "").trim();
  var m = s.match(/^(.*?)\s*\((\d{1,3})\)\s*$/);
  return m ? { name: dutyNsp(m[1]), no: parseInt(m[2], 10) || 0 } : { name: dutyNsp(s), no: 0 };
}

// 탭 모양 (v2.31.0) — 위 1~5줄: 설정 (A열 이름 · C열 값) · 7줄: 머리글 (A:F 순서표 · H:L 바뀐 날) · 8줄부터 내용
//   (설정을 순서표와 다른 줄에 둬서, 순서표 줄을 지우거나 정렬해도 설정이 안 날아감 · 머리글 줄은 「순서」로 찾음)
function readDutySheet(ss) {
  var sh = dutySheet(ss);
  if (!sh) return null;
  var tz = dutyTz(ss), last = sh.getLastRow();
  var vals = last >= 1 ? sh.getRange(1, 1, last, 12).getValues() : [];
  var rows = [], ex = [], cfg = { start: "", weeks: 2, wk: [2, 4], per: 1, info: "" }, seen = {}, hdr = -1, cfgRow = {};
  for (var i = 0; i < vals.length; i++) {
    var a0 = String(vals[i][0] == null ? "" : vals[i][0]).replace(/\s+/g, "");
    if (a0 === "순서") { hdr = i; break; }
    var val = vals[i][2];
    if (/^시작/.test(a0) && !seen.s) { seen.s = 1; cfg.start = dutyYmd(val, tz); cfgRow.start = i + 1; }
    else if (/^간격/.test(a0) && !seen.w) { seen.w = 1; var w = parseInt(val, 10); if (w >= 1 && w <= 8) cfg.weeks = w; }
    else if (/^청소주/.test(a0) && !seen.k) {   // v2.33.0: 「청소 주」 — 매달 몇 번째 주말 (예: 2·4)
      seen.k = 1; cfgRow.wk = i + 1;
      var ks = {}; (String(val == null ? "" : val).match(/[1-5]/g) || []).forEach(function (x) { ks[+x] = 1; });
      var kl = Object.keys(ks).map(Number).sort(function (x, y) { return x - y; });
      if (kl.length) cfg.wk = kl;
    }
    else if (/^회당/.test(a0) && !seen.p) { seen.p = 1; var pp = parseInt(val, 10); if (pp >= 1 && pp <= 5) cfg.per = pp; }
    else if (/^안내/.test(a0) && !seen.i) { seen.i = 1; cfg.info = String(val == null ? "" : val).replace(/\s+/g, " ").trim().slice(0, 60); cfgRow.info = i + 1; }
  }
  if (hdr === -1) hdr = 6;   // 머리글을 못 찾으면 원래 자리(7줄)
  for (var j = hdr + 1; j < vals.length; j++) {
    var v = vals[j], name = String(v[1] || "").trim();
    if (name) {
      var ord = parseFloat(String(v[0]).replace(/[^\d.]/g, ""));
      rows.push({ r: j + 1, order: isFinite(ord) ? ord : null, name: name, no: parseInt(v[2], 10) || 0, note: String(v[3] || "").trim(),
                  count: Math.max(0, parseInt(v[4], 10) || 0), last: dutyYmd(v[5], tz) });
    }
    var exd = dutyYmd(v[7], tz), kind = String(v[8] || "").trim();
    if (exd && kind) ex.push({ r: j + 1, date: exd, kind: kind, to: dutyYmd(v[9], tz), who: String(v[10] || "").trim(), memo: String(v[11] || "").trim() });
  }
  return { sh: sh, gid: sh.getSheetId(), rows: rows, ex: ex, cfg: cfg, hdr: hdr + 1, cfgRow: cfgRow };
}

// 👨‍👩‍👧 v2.32.0: 가족 묶기 — 「학부모 비상연락망」에서 아버님 · 어머님 번호가 같은 선수끼리 한 가족 (형제)
//   번호는 서버 안에서만 씀 (앱에는 이름 · 학년 · 배번만 감) · 못 읽으면 선수마다 따로 한 가족
function dutyPk(p) { return (p.no || 0) + "|" + dutyNsp(p.name); }
function dutyFamilies(ss, roster) {
  var players = (roster || []).filter(function (p) { return /^[1-6]$/.test(String(p.grade).trim()); });
  var par = {}, find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  players.forEach(function (p) { par[dutyPk(p)] = dutyPk(p); });
  try {
    var d = officerSheetData(ss);
    if (d && d.nameCol !== -1) {
      var byPhone = {};
      for (var i = 1; i < d.v.length; i++) {
        var nm = dutyNsp(d.v[i][d.nameCol]);
        if (!nm) continue;
        var no = d.noCol !== -1 ? (parseInt(d.v[i][d.noCol], 10) || 0) : 0, p = null;
        players.forEach(function (x) { if (!p && dutyNsp(x.name) === nm && (!no || !x.no || x.no === no)) p = x; });
        if (!p) continue;
        ["아버님", "어머님"].forEach(function (rel) {
          var c = d.rel[rel];
          if (c === undefined || c === -1) return;
          var ph = String(d.v[i][c] || "").replace(/[^0-9]/g, "");
          if (ph.length < 9) return;
          if (byPhone[ph]) { var a = find(byPhone[ph]), b = find(dutyPk(p)); if (a !== b) par[b] = a; }
          else byPhone[ph] = dutyPk(p);
        });
      }
    }
  } catch (eF) {}
  var idOf = {}, mem = {};
  players.forEach(function (p) { var r = find(dutyPk(p)); idOf[dutyPk(p)] = r; (mem[r] = mem[r] || []).push(p); });
  return { idOf: idOf, mem: mem };
}

// 순수 계산 (시트를 안 건드림) — raw: readDutySheet 결과 · roster: readRosterRaw · today: "yyyy-MM-dd" · upto: 이미 적어 둔 마지막 날
function dutyCompute(raw, roster, today, upto, fam) {
  var cfg = raw.cfg;
  fam = fam || { idOf: {}, mem: {} };
  var fidOf = function (p) { return fam.idOf[dutyPk(p)] || dutyPk(p); };
  var memOf = function (p) { return fam.mem[fidOf(p)] || [p]; };
  var gnum = function (p) { return parseInt(String(p.grade).trim(), 10) || 9; };
  var sibOf = function (p) { return memOf(p).filter(function (x) { return dutyPk(x) !== dutyPk(p); }).map(function (x) { return { n: x.name, no: x.no, g: String(x.grade).trim() }; }); };
  var out = { ok: false, reason: "", today: today, start: cfg.start, weeks: cfg.weeks, wk: cfg.wk, per: cfg.per, info: cfg.info, gid: raw.gid,
              upcoming: [], recent: [], rows: [], notInList: [], cands: [], writes: [], newUpto: "" };
  // ① 순서표 줄마다 선수 명단에서 찾기 (1~6학년만)
  var byName = {};
  (roster || []).forEach(function (p) { if (/^[1-6]$/.test(String(p.grade).trim())) { var k = dutyNsp(p.name); (byName[k] = byName[k] || []).push(p); } });
  var used = {}, entries = [], famUsed = {}, covered = {};
  raw.rows.forEach(function (row) {
    var cands = byName[dutyNsp(row.name)] || [], p = null, st = "ok";
    if (row.no > 0) { cands.forEach(function (c) { if (!p && c.no === row.no) p = c; }); if (!p && cands.length === 1) p = cands[0]; if (!p && cands.length) st = "ambig"; }
    else if (cands.length === 1) p = cands[0];
    else if (cands.length > 1) st = "ambig";
    if (!p && st === "ok") st = "missing";
    var key = p ? dutyPk(p) : "", dupOf = "";
    if (p && used[key]) st = "dup";
    if (p && st === "ok") used[key] = true;
    if (st === "ok" && /빼기|제외|빠짐/.test(row.note)) st = "out";
    if (p && st === "ok") { var fid = fidOf(p); if (famUsed[fid]) { st = "famdup"; dupOf = famUsed[fid]; } else famUsed[fid] = p.name; }   // v2.32.0: 같은 가족은 한 줄만
    if (p) covered[fidOf(p)] = true;
    var e = { row: row, p: p, st: st, dupOf: dupOf, count: row.count, last: row.last, rc: row.count, rl: row.last, ord: row.order === null ? Infinity : row.order, fixAt: [] };   // rc · rl: 시트에 적힌(적을) 횟수 · 마지막 청소
    entries.push(e);
  });
  // 순서표에 없는 가족 — 막내를 대표로 (막내까지 6학년인 가족은 곧 졸업이라 「빠진 가족」 알림에서는 뺌 · 추가 목록에는 보임)
  var seenFam = {};
  (roster || []).forEach(function (p) {
    if (!/^[1-6]$/.test(String(p.grade).trim())) return;
    var fid = fidOf(p);
    if (covered[fid] || seenFam[fid]) return;
    seenFam[fid] = true;
    var ms = memOf(p).slice().sort(function (a, b) { return gnum(a) - gnum(b) || (a.no || 0) - (b.no || 0); }), main = ms[0];
    var c = { n: main.name, no: main.no, g: String(main.grade).trim(), sib: sibOf(main), six: gnum(main) >= 6 ? 1 : 0 };
    out.cands.push(c);
    if (!c.six) out.notInList.push(c);
  });
  out.cands.sort(function (a, b) { return a.six - b.six || (parseInt(b.g, 10) || 0) - (parseInt(a.g, 10) || 0) || (a.no || 0) - (b.no || 0); });
  var active = entries.filter(function (e) { return e.st === "ok"; });
  var view = function (e) { if (!e.p) return { n: e.row.name, no: e.row.no, g: "" }; var v = { n: e.p.name, no: e.p.no, g: String(e.p.grade).trim() }, sb = sibOf(e.p); if (sb.length) v.sib = sb; return v; };
  var finish = function () {
    out.rows = entries.map(function (e) { return { r: e.row.r, order: e.row.order, name: e.row.name, no: e.p ? e.p.no : e.row.no, g: e.p ? String(e.p.grade).trim() : "",
      note: e.row.note, st: e.st, dupOf: e.dupOf || "", sib: e.p ? sibOf(e.p) : [], count: e.rc, last: e.rl, next: e.next || "" }; });
    var byDate = {};
    entries.forEach(function (e) { if (e.rl && e.rl < today) (byDate[e.rl] = byDate[e.rl] || []).push(view(e)); });
    out.recent = Object.keys(byDate).sort().reverse().slice(0, 8).map(function (d) { var o = { d: d, p: byDate[d] }, e2 = dutyWkEnd(d); if (e2) o.e = e2; return o; });
    return out;
  };
  if (!cfg.start) { out.reason = "nostart"; return finish(); }
  if (!active.length) { out.reason = "empty"; return finish(); }
  out.ok = true;

  // ② 바뀐 날 (원래 청소 날 기준)
  var skip = {}, move = {}, fix = {};
  var findActive = function (who) {
    var w = dutyWho(who), hit = null;
    active.forEach(function (e) { if (!hit && dutyNsp(e.p.name) === w.name && (!w.no || e.p.no === w.no)) hit = e; });
    return hit;
  };
  raw.ex.forEach(function (x) {
    var k = dutySatKey(x.date);   // v2.33.0: 일요일을 적어도 그 주말
    if (/^(쉼|쉬)/.test(x.kind)) skip[k] = x.memo || skip[k] || "";
    else if (/^옮/.test(x.kind) && x.to) move[k] = x.to;
    else if (/^지정/.test(x.kind) && x.who) { var e = findActive(x.who); if (e) (fix[k] = fix[k] || []).push(e); }
  });
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  // ③ 청소 날 목록 (v2.33.0: 시작일 뒤 매달 2 · 4번째 주말 · 오늘 + 800일까지) — 옮김이 토 · 일이면 그 주말 한 칸, 평일이면 그날 하루
  var end = dutyAdd(today, 800), slots = [];
  dutySlotDays(cfg.wk, cfg.start, end).forEach(function (o) {
    var d = has(move, o) ? dutySatKey(move[o]) : o;
    slots.push({ o: o, d: d, e: dutyWkEnd(d), skip: has(skip, o), memo: has(skip, o) ? skip[o] : "", fix: fix[o] || [] });
  });
  slots.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.o < b.o ? -1 : 1); });
  slots.forEach(function (s, i) { if (!s.skip) s.fix.forEach(function (e) { e.fixAt.push(i); }); });

  // ④ 이미 적어 둔 날까지는 지난 기록 — 마지막 청소 칸 중 오늘 전 날짜의 가장 늦은 날 · DUTY_UPTO 중 늦은 쪽
  var done = upto && upto < today ? upto : "";
  entries.forEach(function (e) { if (e.last && e.last < today && e.last > done) done = e.last; });

  var cmp = function (a, b) { return (a.count - b.count) || (a.ord - b.ord) || (a.row.r - b.row.r); };
  var wr = {}, nUp = 0, shown = {}, nShown = 0;
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i], en = s.e || s.d;   // v2.33.0: 주말은 일요일까지 「다가오는」
    if (s.d <= done) continue;
    if (s.skip) {
      if (en >= today) out.upcoming.push({ d: s.d, e: s.e, o: s.o !== s.d ? s.o : "", s: 1, m: s.memo, p: [] });
      continue;
    }
    var ch = [];
    s.fix.forEach(function (e) { if (ch.length < cfg.per && ch.indexOf(e) === -1) ch.push(e); });
    var later = function (e) { return e.fixAt.some(function (j) { return j > i; }); };
    var cands = active.filter(function (e) { return ch.indexOf(e) === -1 && !later(e); }).sort(cmp);
    while (ch.length < cfg.per && cands.length) ch.push(cands.shift());
    ch.forEach(function (e) { e.count++; e.last = s.d; });
    if (en < today) {   // 날짜(주말이면 일요일)가 지남 → 시트에 적을 것 (마지막 청소 = 그 주말 토요일)
      ch.forEach(function (e) { e.rc = e.count; e.rl = s.d; wr[e.row.r] = { r: e.row.r, count: e.count, last: s.d }; });
      out.newUpto = s.d;
      continue;
    }
    out.upcoming.push({ d: s.d, e: s.e, o: s.o !== s.d ? s.o : "", f: s.fix.length ? 1 : 0, p: ch.map(view), rs: ch.map(function (e) { return e.row.r; }) });
    ch.forEach(function (e) { if (!e.next) e.next = s.d; if (!shown[e.row.r]) { shown[e.row.r] = 1; nShown++; } });
    nUp++;
    if (nUp >= DUTY_MAX_UP || (nUp >= 8 && nShown >= active.length)) break;
  }
  out.writes = Object.keys(wr).map(function (r) { return wr[r]; });
  return finish();
}

// 어디까지 적었나 — 시작일을 처음 보면(새로 정함 · 바꿈) 그날 기준으로 「어제까지는 지난 일」로 둠
//   → 시작일에 지난 날짜를 넣어도 지난 회를 한꺼번에 「청소함」으로 적지 않고, 다음 청소 날부터 차례가 시작됨
function dutyUpto(start, today, save) {
  var props = PropertiesService.getScriptProperties(), o = null;
  try { o = JSON.parse(props.getProperty("DUTY_UPTO") || "null"); } catch (e) {}
  if (o && o.start === start) return String(o.upto || "");
  if (!start) return "";
  var up = start < today ? dutyAdd(today, -1) : "";
  if (save) { try { props.setProperty("DUTY_UPTO", JSON.stringify({ start: start, upto: up, at: nowKst() })); } catch (e2) {} }
  return up;
}
function buildDuty(ss, today) {
  var raw = readDutySheet(ss);
  if (!raw) return { ok: false, reason: "nosheet", today: today, upcoming: [], recent: [], rows: [], notInList: [], cands: [] };
  var roster = readRosterRaw(ss), fam = dutyFamilies(ss, roster);
  var res = dutyCompute(raw, roster, today, dutyUpto(raw.cfg.start, today, true), fam);
  if (res.writes.length) {   // 지난 청소 날 → 시트에 적기 (여럿이 동시에 열어도 한 번만 · 잠금을 못 잡으면 이번엔 계산만)
    var lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        raw = readDutySheet(ss);
        res = dutyCompute(raw, roster, today, dutyUpto(raw.cfg.start, today, true), fam);
        res.writes.forEach(function (w) {
          raw.sh.getRange(w.r, 6).setNumberFormat("@");
          raw.sh.getRange(w.r, 5, 1, 2).setValues([[w.count, w.last]]);
        });
        if (res.newUpto) PropertiesService.getScriptProperties().setProperty("DUTY_UPTO", JSON.stringify({ start: raw.cfg.start, upto: res.newUpto, at: nowKst() }));
      } catch (eW) {
      } finally { lock.releaseLock(); }
    }
  }
  delete res.writes; delete res.newUpto;
  return res;
}
// 하루가 바뀌면 다시 계산 (어제 청소한 집을 적고 다음 차례로)
function readDuty(ss) {
  var today = dutyToday();
  var v = cachedData("C_DUTY", function () { return buildDuty(ss, today); });
  if (!v || v.today !== today) { dropDataCache(["C_DUTY"]); v = cachedData("C_DUTY", function () { return buildDuty(ss, today); }); }
  return v;
}
// 보호자 · 관리자에게 보내는 부분 (순서표 상태 · 시트 줄 번호는 관리자 화면에서만)
function dutyPublic(v) {
  if (!v) return null;
  return { ok: !!v.ok, reason: v.reason || "", today: v.today, start: v.start || "", weeks: v.weeks, wk: v.wk || [2, 4], per: v.per, info: v.info || "",
           upcoming: (v.upcoming || []).map(function (u) { var o = { d: u.d, o: u.o, p: u.p }; if (u.e) o.e = u.e; if (u.s) { o.s = 1; o.m = u.m || ""; } if (u.f) o.f = 1; return o; }),
           recent: v.recent || [] };
}

// 바뀐 날 표(H:L) 읽기 · 지우기 · 붙이기
function dutyExList(raw, tz) {
  var sh = raw.sh, last = sh.getLastRow(), from = raw.hdr + 1, out = [];
  if (last < from) return out;
  var v = sh.getRange(from, 8, last - from + 1, 5).getValues();
  for (var i = 0; i < v.length; i++) out.push({ r: from + i, date: dutyYmd(v[i][0], tz), kind: String(v[i][1] || "").trim(), who: String(v[i][3] || "").trim(), memo: String(v[i][4] || "").trim(), empty: !v[i].join("").trim() });
  return out;
}
function dutyExAdd(raw, tz, rows) {
  var list = dutyExList(raw, tz), free = list.filter(function (x) { return x.empty; }).map(function (x) { return x.r; }), next = Math.max(raw.sh.getLastRow(), raw.hdr) + 1;
  rows.forEach(function (row) {
    var r = free.length ? free.shift() : next++;
    raw.sh.getRange(r, 8, 1, 5).setValues([row]);
  });
}
function dutyActor(session) { return roleName(session && session.role); }

// 관리 — 쉬기 / 쉼 취소 (date: 원래 청소 날)
function dutySetSkip(ss, session, p) {
  var raw = readDutySheet(ss);
  if (!raw || !raw.cfg.start) return { result: "error", message: "「당번」 탭에 시작일이 없어요." };
  var tz = dutyTz(ss), date = dutySatKey(dutyYmd(p.date, tz)), today = dutyToday();
  if (!date || (dutyWkEnd(date) || date) < today) return { result: "error", message: "지난 날은 바꿀 수 없어요." };
  if (!dutyIsSlot(raw.cfg, date)) return { result: "error", message: "청소 주말이 아니에요." };   // v2.33.0
  var list = dutyExList(raw, tz), mine = list.filter(function (x) { return dutySatKey(x.date) === date && /^(쉼|쉬)/.test(x.kind); });
  if (String(p.on) === "1") {
    if (!mine.length) dutyExAdd(raw, tz, [[date, "쉼", "", "", cleanText(p.memo, 40) || ("앱에서 쉼 · " + dutyActor(session))]]);
  } else {
    mine.forEach(function (x) { raw.sh.getRange(x.r, 8, 1, 5).clearContent(); });
  }
  return { result: "success" };
}
// 관리 — 두 가정 바꾸기 (da · db: 원래 청소 날 · ra · rb: 그날 당번 줄 번호)
function dutySwap(ss, session, p) {
  dropDataCache(["C_DUTY"]);
  var raw = readDutySheet(ss);
  if (!raw || !raw.cfg.start) return { result: "error", message: "「당번」 탭에 시작일이 없어요." };
  var tz = dutyTz(ss), today = dutyToday();
  var roster = readRosterRaw(ss);
  var res = dutyCompute(raw, roster, today, dutyUpto(raw.cfg.start, today, false), dutyFamilies(ss, roster));
  var da = dutySatKey(dutyYmd(p.da, tz)), db = dutySatKey(dutyYmd(p.db, tz)), ra = parseInt(p.ra, 10) || 0, rb = parseInt(p.rb, 10) || 0;
  var slotOf = function (d) { var hit = null; res.upcoming.forEach(function (u) { if (!hit && !u.s && (u.o || u.d) === d) hit = u; }); return hit; };
  var A = slotOf(da), B = slotOf(db);
  if (!A || !B || da === db) return { result: "error", message: "바꿀 날을 다시 골라 주세요 (다가오는 청소 날만 돼요)." };
  if (A.rs.indexOf(ra) === -1 || B.rs.indexOf(rb) === -1) return { result: "error", message: "그사이 순서가 바뀌었어요. 새로 불러온 뒤 다시 해 주세요." };
  var nameOf = function (r) {
    var row = null; raw.rows.forEach(function (x) { if (x.r === r) row = x; });
    var e = null; res.rows.forEach(function (x) { if (x.r === r) e = x; });
    if (!row || !e) return "";
    var same = res.rows.filter(function (x) { return x.st === "ok" && dutyNsp(x.name) === dutyNsp(e.name); }).length > 1;
    return String(row.name).trim() + (same && e.no ? "(" + e.no + ")" : "");
  };
  var na = nameOf(ra), nb = nameOf(rb);
  if (!na || !nb) return { result: "error", message: "선수를 찾지 못했어요." };
  // 두 날짜에 있던 예전 「지정」은 지우고, 그날 나머지 가정(회당 2가정 이상일 때)은 그대로 지정해 둠
  var list = dutyExList(raw, tz);
  list.forEach(function (x) { var k = dutySatKey(x.date); if ((k === da || k === db) && /^지정/.test(x.kind)) raw.sh.getRange(x.r, 8, 1, 5).clearContent(); });
  var memo = "교환 " + da + " ↔ " + db + " · " + dutyActor(session), add = [];
  add.push([da, "지정", "", nb, memo]); add.push([db, "지정", "", na, memo]);
  A.rs.forEach(function (r) { if (r !== ra) { var n = nameOf(r); if (n) add.push([da, "지정", "", n, memo]); } });
  B.rs.forEach(function (r) { if (r !== rb) { var n = nameOf(r); if (n) add.push([db, "지정", "", n, memo]); } });
  dutyExAdd(raw, tz, add);
  return { result: "success" };
}

// 🔀 v2.32.0: 관리 — 순서 · 빼기 · 가족 추가 · 시작일 · 안내 문구 한 번에 저장
//   order: [{r: 시트 줄}, {n: 이름, no: 배번} (새 가족) ...] 위에서부터 차례 순서 · out: 빼기할 시트 줄 (새 가족은 item.out) · wk: 청소 주기 (v2.34.0)
//   지금 순서표 줄이 그대로여야 저장 (그사이 누가 시트를 고쳤으면 다시 불러오게) · 청소 횟수 · 마지막 청소는 그 줄 그대로 (지난 기록 유지)
function dutySaveOrder(ss, session, p) {
  var raw = readDutySheet(ss);
  if (!raw) return { result: "error", message: "시트에 「당번」 탭이 없어요." };
  var sh = raw.sh, order;
  try { order = JSON.parse(String(p.order || "[]")); } catch (e) { return { result: "error", message: "순서를 읽지 못했어요." }; }
  if (!Array.isArray(order) || order.length > 120) return { result: "error", message: "순서를 읽지 못했어요." };
  var num = function (a, b) { return a - b; };
  var have = raw.rows.map(function (x) { return x.r; }).sort(num).join(",");
  var want = order.filter(function (o) { return o && parseInt(o.r, 10) > 0; }).map(function (o) { return parseInt(o.r, 10); }).sort(num).join(",");
  if (have !== want) return { result: "error", message: "그사이 순서표가 바뀌었어요. 새로 불러온 뒤 다시 해 주세요." };
  var roster = readRosterRaw(ss), players = roster.filter(function (x) { return /^[1-6]$/.test(String(x.grade).trim()); });
  // 새로 넣을 수 있는 건 순서표에 아직 없는 가족만 (형제가 이미 있으면 안 됨)
  var res = dutyCompute(raw, roster, dutyToday(), "", dutyFamilies(ss, roster)), allowed = {};
  res.cands.forEach(function (c) { allowed[dutyNsp(c.n) + "|" + (c.no || 0)] = true; });
  var stRaw = p.start === undefined ? null : String(p.start || "").trim(), stYmd = stRaw ? dutyYmd(stRaw, dutyTz(ss)) : "";
  if (stRaw && !stYmd) return { result: "error", message: "시작일을 다시 확인해 주세요." };
  var wkHit = null;   // v2.34.0: 청소 주기 (보낸 때만 · 고르기 목록에 있는 것만)
  if (p.wk !== undefined) {
    var wkK = dutyWkKey(p.wk);
    DUTY_WK_PRESET.forEach(function (x) { if (x.k === wkK) wkHit = x; });
    if (!wkHit) return { result: "error", message: "청소 주기를 다시 골라 주세요." };
    if (!raw.cfgRow.wk) return { result: "error", message: "시트에 「청소 주」 칸이 없어요." };
  }
  var news = [];
  for (var i = 0; i < order.length; i++) {
    var o = order[i];
    if (parseInt(o.r, 10) > 0) continue;
    var hit = null, want2 = parseInt(o.no, 10) || 0;
    players.forEach(function (x) { if (!hit && dutyNsp(x.name) === dutyNsp(o.n) && (!want2 || x.no === want2)) hit = x; });
    if (!hit) return { result: "error", message: "선수 명단에 없는 이름이 있어요: " + cleanText(o.n, 20) };
    var same = players.filter(function (x) { return dutyNsp(x.name) === dutyNsp(hit.name); }).length > 1;
    if (!allowed[dutyNsp(hit.name) + "|" + (hit.no || 0)]) return { result: "error", message: hit.name + " 가족은 이미 순서표에 있어요." };
    news.push({ i: i, p: hit, same: same, out: !!o.out });
  }
  var outRows = {}; String(p.out || "").split(",").forEach(function (x) { var r = parseInt(x, 10); if (r > 0) outRows[r] = true; });
  var stamp = Utilities.formatDate(new Date(), "Asia/Seoul", "yy.M.d") + " 앱에서 추가 · " + dutyActor(session);
  var OUTRE = /\s*(빼기|제외|빠짐)\s*/g;
  // ① 지금 줄: 순서 번호 · 빼기
  raw.rows.forEach(function (row) {
    var idx = -1;
    for (var k = 0; k < order.length; k++) if (parseInt(order[k].r, 10) === row.r) { idx = k; break; }
    if (row.order !== idx + 1) sh.getRange(row.r, 1).setValue(idx + 1);
    var isOut = /빼기|제외|빠짐/.test(row.note), wantOut = !!outRows[row.r];
    if (isOut !== wantOut) sh.getRange(row.r, 4).setValue(wantOut ? ("빼기 " + row.note).trim() : row.note.replace(OUTRE, " ").replace(/\s+/g, " ").replace(/^[\s·]+|[\s·]+$/g, ""));
  });
  // ② 새 가족: 순서표 마지막 줄 아래에
  var lastList = raw.hdr; raw.rows.forEach(function (x) { if (x.r > lastList) lastList = x.r; });
  var r0 = lastList + 1;
  news.forEach(function (nw) {
    while (String(sh.getRange(r0, 2).getValue() || "").trim()) r0++;
    sh.getRange(r0, 1, 1, 4).setValues([[nw.i + 1, nw.p.name, nw.p.no || "", (nw.out ? "빼기 " : "") + stamp]]);   // v2.35.0: 배번은 늘 적음 (같은 이름이 나중에 와도 안 헷갈리게)
    r0++;
  });
  // ③ 설정 (보낸 것만)
  if (stRaw !== null && raw.cfgRow.start) sh.getRange(raw.cfgRow.start, 3).setValue(stYmd);
  if (p.info !== undefined && raw.cfgRow.info) sh.getRange(raw.cfgRow.info, 3).setValue(cleanText(p.info, 60));
  if (wkHit) sh.getRange(raw.cfgRow.wk, 3).setValue(wkHit.t);   // v2.34.0
  return { result: "success" };
}

// ---------- 일정 ----------
// 초기 데이터 버전 — 시트가 이미 만들어진 뒤 초기 데이터를 고치면 이 숫자를 올린다.
//   일정: ID가 "S"로 시작하는 초기 일정만 새 데이터로 교체 (관리자가 직접 추가한 "E..." 일정은 그대로 둠)
//   공지: 없는 초기 공지만 추가 (관리자가 고친 공지는 덮어쓰지 않음)
var SEED_VERSION = 3;   // v3: 2026년 공식 공지방 전체 일정 (PC 내보내기)

function applySeedUpgrade(sh, propKey, seedRows, replacePrefix) {
  var props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty(propKey) || 0) >= SEED_VERSION) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (Number(props.getProperty(propKey) || 0) >= SEED_VERSION) return;
    if (typeof seedRows === "function") seedRows = seedRows();   // v2.13.0: 올릴 때만 계산
    var cols = Math.max(seedRows.length ? seedRows[0].length : 0, sh.getLastColumn());   // 뒤에 추가된 열(결과 등)까지 함께 읽고 씀
    var pad = function (r) { r = r.slice(); while (r.length < cols) r.push(""); return r; };
    var last = sh.getLastRow();
    var data = last >= 2 ? sh.getRange(2, 1, last - 1, cols).getValues() : [];
    var ids = data.map(function (r) { return String(r[0]); });
    var out;
    if (replacePrefix) {
      // 초기 데이터(ID가 prefix로 시작)는 빼고, 관리자가 추가한 행만 남긴 뒤 새 초기 데이터를 붙여 한 번에 다시 씀
      var kept = data.filter(function (r) { return String(r[0]).indexOf(replacePrefix) !== 0 && String(r[0]).trim() !== ""; })
                     .map(function (r) { return r.map(function (v, k) { return cellToText(v, k === 1 ? "date" : (k === 2 || k === 3) ? "time" : ""); }); });
      out = seedRows.map(pad).concat(kept.map(pad));
      if (last >= 2) sh.getRange(2, 1, last - 1, cols).clearContent();
      if (out.length) {
        var rng = sh.getRange(2, 1, out.length, cols);
        rng.setNumberFormat("@");
        rng.setValues(out);
      }
    } else {
      out = seedRows.filter(function (r) { return ids.indexOf(String(r[0])) === -1; }).map(pad);
      if (out.length) {
        var rng2 = sh.getRange(sh.getLastRow() + 1, 1, out.length, cols);
        rng2.setNumberFormat("@");
        rng2.setValues(out);
      }
    }
    props.setProperty(propKey, String(SEED_VERSION));
  } finally {
    lock.releaseLock();
  }
}

function getScheduleSheet(ss) {
  var existed = !!ss.getSheetByName(SCHEDULE_SHEET_NAME);
  var sh = ensureSheet(ss, SCHEDULE_SHEET_NAME, SCHEDULE_HEADERS, scheduleSeedRows);
  if (existed) applySeedUpgrade(sh, "SCHEDULE_SEED_VER", scheduleSeedRows, "S");
  else PropertiesService.getScriptProperties().setProperty("SCHEDULE_SEED_VER", String(SEED_VERSION));
  // v2.4.2: 예전에 만들어진 시트에는 "결과" 머리글이 없으므로 마지막 열에 한 번 추가
  var hc = SCHEDULE_HEADERS.length;
  if (String(sh.getRange(1, hc).getValue() || "") !== SCHEDULE_HEADERS[hc - 1]) {
    sh.getRange(1, hc, sh.getMaxRows(), 1).setNumberFormat("@");
    sh.getRange(1, hc).setValue(SCHEDULE_HEADERS[hc - 1]).setBackground("#0b2240").setFontColor("#ffffff").setFontWeight("bold");
  }
  return sh;
}

function readEvents(ss) {   // ⚡ v2.13.0: 캐시 (v2.16.0: 10분)
  return cachedData("C_EVENTS", function () { return readTable(getScheduleSheet(ss), SCHEDULE_KEYS, { date: "date", start: "time", end: "time" }); });
}

function eventToRow(ev) {
  var date = String(ev.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  var t = function (v) { v = String(v || "").trim(); return /^\d{1,2}:\d{2}$/.test(v) ? ("0" + v).slice(-5) : ""; };
  var grades = String(ev.grades || "").replace(/[^0-9,전체]/g, "");
  if (!grades) grades = "전체";
  return [
    cleanId(ev.id, 30) || ("E" + new Date().getTime().toString(36) + Math.floor(Math.random() * 1000)),
    date, t(ev.start), t(ev.end),
    cleanText(ev.type, 10) || "기타",
    cleanText(ev.title, 60),
    cleanText(ev.place, 60),
    cleanText(ev.opponent, 40),
    grades,
    cleanText(ev.target, 80),
    cleanText(ev.meet, 100),
    cleanText(ev.dress, 100),
    cleanMultiline(ev.memo, 1000),
    nowKst(),
    cleanText(ev.result, 20)   // "승 5:3" / "패 2:7" / "무" / ""
  ];
}

// 한 건 또는 여러 건 저장 (ID가 같으면 수정, 없으면 추가)
function handleSaveEvents(ss, data) {
  var sh = getScheduleSheet(ss);
  var list = Array.isArray(data.events) ? data.events : [];
  if (list.length > 100) list = list.slice(0, 100);
  var saved = 0;
  for (var i = 0; i < list.length; i++) {
    var row = eventToRow(list[i] || {});
    if (!row) continue;
    var r = findRowById(sh, row[0]);
    writeRow(sh, r === -1 ? sh.getLastRow() + 1 : r, row);
    saved++;
  }
  return json({ result: "success", saved: saved });
}

function handleDeleteEvent(ss, data) {
  var sh = getScheduleSheet(ss);
  var r = findRowById(sh, cleanId(data.id, 30));
  if (r !== -1) safeDeleteRows(sh, r, 1);
  return json({ result: "success" });
}

// ---------- 📍 구장 (v2.6.0 · v2.7.0: 별칭 · 구분 · 주차 · 편의시설 · 집합장소 · 메모, 수정은 대표님 · 개발자) ----------
// 일정의 「장소」 이름 → 주소 · 위치. 사이트 일정 상세에 지도 · 길찾기를 보여 줄 때 씀.
// - 이름(1열)이 같은 일정에 지도가 붙음 (사이트에서 「기장리틀구장 (3루측)」처럼 괄호가 붙어도 괄호 앞 이름으로 찾음)
// - 시트에서 직접 고쳐도 됨: 주소만 적어도 사이트가 주소로 위치를 찾음 (위도/경도는 비워도 됨)
var VENUE_SHEET_NAME = "구장";
var VENUE_HEADERS = ["이름", "주소", "지번주소", "위도", "경도", "카카오장소ID", "카카오장소명", "전화", "수정일시", "별칭", "구분", "주차", "편의시설", "집합장소", "메모", "즐겨찾기"];
var VENUE_KEYS    = ["name", "addr", "jibun", "lat", "lng", "kid", "kname", "phone", "updated", "aliases", "kind", "parking", "amenities", "meet", "memo", "fav"];

function getVenueSheet(ss) {
  var sh = ensureSheet(ss, VENUE_SHEET_NAME, VENUE_HEADERS, venueSeedRows);
  // v2.7.0: 예전에 만든 탭에는 별칭 ~ 메모 칸이 없으므로 머리글을 한 번 채움
  var n = VENUE_HEADERS.length;
  if (String(sh.getRange(1, n).getValue() || "") !== VENUE_HEADERS[n - 1]) {
    if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 500), n).setNumberFormat("@");
    sh.getRange(1, 1, 1, n).setValues([VENUE_HEADERS]).setBackground("#0b2240").setFontColor("#ffffff").setFontWeight("bold");
  }
  return sh;
}
function readVenues(ss) { return cachedData("C_VENUES", function () { return readTable(getVenueSheet(ss), VENUE_KEYS, {}); }); }   // ⚡ v2.13.0: 캐시 (v2.16.0: 10분)

function cleanCoord(v, min, max) {
  var n = parseFloat(v);
  return (isFinite(n) && n >= min && n <= max) ? String(Math.round(n * 1e7) / 1e7) : "";
}
// v2.7.0: 보낸 칸만 바꾸고 나머지는 그대로 (일정 수정 창에서 위치만 보내도 주차 · 메모가 지워지지 않게)
function venueToRow(v, cur) {
  var name = cleanText(v.name, 40);
  if (!name) return null;
  var has = function (k) { return Object.prototype.hasOwnProperty.call(v, k); };
  var f = function (i, k, val) { return has(k) ? val : (cur ? String(cur[i] == null ? "" : cur[i]) : ""); };
  return [name,
          f(1, "addr", cleanText(v.addr, 100)), f(2, "jibun", cleanText(v.jibun, 100)),
          f(3, "lat", cleanCoord(v.lat, 33, 39)), f(4, "lng", cleanCoord(v.lng, 124, 132)),
          f(5, "kid", cleanId(v.kid, 20)), f(6, "kname", cleanText(v.kname, 60)), f(7, "phone", cleanText(v.phone, 20)),
          nowKst(),
          f(9, "aliases", cleanText(v.aliases, 200)), f(10, "kind", cleanText(v.kind, 10)),
          f(11, "parking", cleanMultiline(v.parking, 300)), f(12, "amenities", cleanMultiline(v.amenities, 300)),
          f(13, "meet", cleanMultiline(v.meet, 300)), f(14, "memo", cleanMultiline(v.memo, 500)),
          f(15, "fav", (v.fav && String(v.fav) !== "0") ? "1" : "")];   // v2.8.0: ⭐ 즐겨쓰는 구장
}
// 이름이 같으면 수정, 없으면 추가 (oldName: 이름을 바꿀 때 예전 이름)
function handleSaveVenue(ss, data) {
  var v = data.venue || {};
  if (!cleanText(v.name, 40)) return json({ result: "error", message: "구장 이름이 없습니다." });
  var sh = getVenueSheet(ss);
  var r = -1, oldName = cleanText(v.oldName, 40);
  if (oldName) r = findRowById(sh, oldName);
  if (r === -1) r = findRowById(sh, cleanText(v.name, 40));
  var cur = r === -1 ? null : sh.getRange(r, 1, 1, VENUE_HEADERS.length).getValues()[0];
  // v2.21.0: 이미 있던 구장의 이름을 바꾸면 일정 「장소」 칸도 새 이름으로 같이 바꿈 (지난 일정 포함)
  // v2.22.0: 띄어쓰기만 바꿔도(「기장리틀구장」→「기장 리틀구장」) 바꿈 · 옛 이름 글자만이 아니라 그 구장으로 지도 연결돼 있던 일정을 모두
  //          (다른 이름 · 괄호 · 「구장/야구장」 차이로 연결된 것까지) — 그래서 이름을 바꾸기 「전」 구장 목록으로 찾아 둠
  var newName = cleanText(v.name, 40), renamed = 0;
  var before = (cur && oldName && cleanText(cur[0], 40) !== newName) ? venueListForMatch(sh, r) : null;
  writeRow(sh, r === -1 ? sh.getLastRow() + 1 : r, venueToRow(v, cur));
  if (before && before.self) {
    renamed = renameVenueInEvents(ss, before.list, before.self, newName);
    if (renamed) dropDataCache(["C_EVENTS"]);
  }
  return json({ result: "success", renamed: renamed });
}
// 구장 이름 비교용: 띄어쓰기 · 대소문자 무시 (사이트의 venueNorm 과 같음)
function venueKey(s) { return String(s || "").replace(/\s+/g, "").toLowerCase(); }
function venueBaseOf(s) { return String(s || "").replace(/\s*[\(（\[].*$/, "").trim(); }
function venueSfxOf(s) { return s.replace(/(야구장|구장|경기장|운동장)$/, ""); }
function venueNamesOf(v) { return [v && v.name].concat(String((v && v.aliases) || "").split(/[,，]/)).map(function (s) { return String(s || "").trim(); }).filter(Boolean); }
// 「구장」 탭 전체(바꾸기 전) + 지금 저장하는 구장(selfRow 행)
function venueListForMatch(sh, selfRow) {
  var last = sh.getLastRow(), list = [], self = null;
  if (last < 2) return { list: list, self: null };
  var vals = sh.getRange(2, 1, last - 1, VENUE_KEYS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i][0] || "").trim()) continue;
    var o = {};
    for (var k = 0; k < VENUE_KEYS.length; k++) o[VENUE_KEYS[k]] = String(vals[i][k] == null ? "" : vals[i][k]).trim();
    list.push(o);
    if (i + 2 === selfRow) self = o;
  }
  return { list: list, self: self };
}
// 장소 글자가 어느 구장에 「어떻게」 연결되는지 — 사이트의 venueMatch(지도 연결 규칙)와 똑같음
//   whole: 장소 전체가 그 구장 (이름 · 다른 이름 · 괄호 뺀 이름 · 끝의 구장/야구장 차이)
//   inner: 「거제 하청야구장 (하청스포츠타운)」처럼 괄호 안이 그 구장   base: 「기장리틀구장 (3루측)」처럼 괄호 앞이 그 구장
function venueMatch(full, venues) {
  full = String(full == null ? "" : full).trim();
  if (!full) return null;
  var list = venues.filter(function (v) { return v && (v.addr || (v.lat && v.lng)); });
  var keys = function (v) { return venueNamesOf(v).map(venueKey); };
  var by = function (key) { for (var i = 0; i < list.length; i++) if (keys(list[i]).indexOf(key) !== -1) return list[i]; return null; };
  var n1 = venueKey(full), n2 = venueKey(full.replace(/[\(（\)）\[\]]/g, "")), n3 = venueKey(venueBaseOf(full));
  var inner = (full.match(/[\(（]([^\)）]+)[\)）]/) || [])[1] || "", n4 = venueKey(inner);
  var v = by(n1) || by(n2);
  if (v) return { v: v, how: "whole" };
  if (n4.length >= 3) {
    v = by(n4);
    if (!v) for (var j = 0; j < list.length; j++) if (list[j].kname && venueKey(list[j].kname) === n4) { v = list[j]; break; }
    if (v) return { v: v, how: "inner" };
  }
  if (n3.length >= 3 && (v = by(n3))) return { v: v, how: "base" };
  var s2 = venueSfxOf(n2);
  if (s2.length >= 3) {
    var c = list.filter(function (x) { return keys(x).some(function (k) { return venueSfxOf(k) === s2; }); });
    if (c.length && c.every(function (x) { return (x.kid || x.addr) === (c[0].kid || c[0].addr); })) return { v: c[0], how: "whole" };
  }
  return null;
}
// 연결 방법에 맞춰 새 이름으로: whole → 새이름 · base → 새이름 + 「 (3루측)」 그대로 · inner → 괄호 안만
function placeRenamedTo(p, m, newName) {
  p = String(p == null ? "" : p).trim();
  if (m.how === "base") { var t = p.match(/^(.*?)(\s*[\(（\[].*)$/); return t ? newName + t[2] : newName; }
  if (m.how === "inner") return p.replace(/([\(（])([^\)）]+)([\)）])/, function (a, o, x, c) { return o + newName + c; });
  return newName;
}
function renameVenueInEvents(ss, venues, self, newName) {
  var sh = getScheduleSheet(ss);
  var last = sh.getLastRow();
  if (last < 2 || !newName || !self) return 0;
  var col = SCHEDULE_KEYS.indexOf("place") + 1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  var rng = sh.getRange(2, col, last - 1, 1), vals = rng.getValues(), n = 0;
  for (var i = 0; i < vals.length; i++) {
    if (!String(ids[i][0] || "").trim()) continue;
    var m = venueMatch(vals[i][0], venues);
    if (!m || m.v !== self) continue;
    var np = placeRenamedTo(vals[i][0], m, newName);
    if (np && np !== String(vals[i][0])) { vals[i][0] = np; n++; }
  }
  if (n) { rng.setNumberFormat("@"); rng.setValues(vals); }
  return n;
}
function handleDeleteVenue(ss, data) {
  var sh = getVenueSheet(ss);
  var r = findRowById(sh, cleanText(data.name, 40));
  if (r !== -1) safeDeleteRows(sh, r, 1);
  return json({ result: "success" });
}
// 처음 「구장」 탭을 만들 때 넣는 자주 쓰는 곳 (카카오맵 검색 결과 · 2026-10-11)
function venueSeedRows() {
  var t = nowKst();
  return [["학교","부산 남구 진남로18번길 11","35.137342","129.092366","7819510","대연초등학교"],["기장리틀구장","부산 기장군 일광읍 체육공원2로 50","35.300506","129.242602","1157292274","리틀야구장 소프트볼경기장"],["기장소프트구장","부산 기장군 일광읍 체육공원1로 155","35.297391","129.241676","487346844","기장현대차드림볼파크"],["기장 공원구장","부산 기장군 일광읍 청광리 산 3","35.297306","129.241010","2093559108","기장현대차드림볼파크 공원야구장"],["을숙도야구장","부산 사하구 낙동남로1233번길 34","35.111209","128.947407","25575780","을숙도리틀야구장"],["을숙도구장","부산 사하구 낙동남로1233번길 34","35.111209","128.947407","25575780","을숙도리틀야구장"],["거제 하청구장","경남 거제시 하청면 연하해안로 1604","34.958531","128.645842","14701855","하청야구장"],["거제 하청야구장","경남 거제시 하청면 연하해안로 1604","34.958531","128.645842","14701855","하청야구장"],["삼락생태공원 성인야구장A","부산 사상구 삼락동 29-48","35.165058","128.971178","24025024","삼락생태공원 성인야구장A"],["부산중학교","부산 동구 초량로40번길 29","35.122228","129.036868","7898569","부산중학교"],["부산공고","부산 남구 수영로196번길 80","35.131195","129.087586","7898891","부산공업고등학교"],["대구강변리틀1야구장","대구 북구 서변동 1506","35.908164","128.588023","24025025","강변 리틀야구장"],["김해삼성초등학교","경남 김해시 인제로51번길 42","35.233838","128.900034","12490211","김해삼성초등학교"],["동일중앙초등학교","부산 동구 구봉로 46","35.124748","129.037118","7846942","동일중앙초등학교"],["밀양 선샤인구장","경남 밀양시 단장면 관광단지로 99","35.503417","128.835455","1728364829","스포츠파크"],["밀양 선샤인 리틀A구장","경남 밀양시 단장면 관광단지로 99","35.503417","128.835455","1728364829","스포츠파크"],["밀양 선샤인 리틀B구장","경남 밀양시 단장면 관광단지로 99","35.503417","128.835455","1728364829","스포츠파크"],["거제 하청스포츠타운","경남 거제시 하청면 사환2길 80","34.958568","128.651061","27432816","하청스포츠타운"]].map(function (r) { return [r[0], r[1], "", r[2], r[3], r[4], r[5], "", t, "", "", "", "", "", "", ""]; });
}
// 편집기에서 한 번 실행하면 「구장」 탭을 만듦 (이미 있으면 그대로)
function setupVenueSheet() { var sh = getVenueSheet(SpreadsheetApp.getActiveSpreadsheet()); Logger.log("구장 탭 행 수: " + (sh.getLastRow() - 1)); }

// ---------- 공지사항 ----------
function getNoticeSheet(ss) {
  var existed = !!ss.getSheetByName(NOTICE_SHEET_NAME);
  var sh = ensureSheet(ss, NOTICE_SHEET_NAME, NOTICE_HEADERS, noticeSeedRows);
  if (existed) applySeedUpgrade(sh, "NOTICE_SEED_VER", noticeSeedRows, null);
  else PropertiesService.getScriptProperties().setProperty("NOTICE_SEED_VER", String(SEED_VERSION));
  return sh;
}

function readNotices(ss) {
  return cachedData("C_NOTICES", function () { return readTable(getNoticeSheet(ss), NOTICE_KEYS, {}); });   // ⚡ v2.13.0: 캐시 (v2.16.0: 10분) · v2.20.0: 조회수 없음
}

function handleSaveNotice(ss, data) {
  var sh = getNoticeSheet(ss);
  var n = data.notice || {};
  var title = cleanText(n.title, 80);
  if (!title) return json({ result: "error", message: "제목이 없습니다." });
  var id = cleanId(n.id, 30) || ("N" + new Date().getTime().toString(36));
  var r = findRowById(sh, id);
  var created = nowKst();
  if (r !== -1) created = cellToText(sh.getRange(r, 7).getValue()) || created;
  var row = [
    id,
    (n.pinned === true || n.pinned === "Y") ? "Y" : "N",
    cleanText(n.category, 10) || "일반",
    title,
    cleanMultiline(n.body, 5000),
    cleanText(n.author, 30),
    created,
    nowKst()
  ];
  writeRow(sh, r === -1 ? sh.getLastRow() + 1 : r, row);
  return json({ result: "success", id: id });
}

function handleDeleteNotice(ss, data) {
  var sh = getNoticeSheet(ss);
  var r = findRowById(sh, cleanId(data.id, 30));
  if (r !== -1) safeDeleteRows(sh, r, 1);
  return json({ result: "success" });
}

// ---------- 초기 데이터 (카카오톡 "대연초 공식 공지방" 2026.8.24 ~ 9.28 공지 기준) ----------
function scheduleSeedRows() {
  var s = nowKst();
  // 대연초 공식 공지방 2026년 공지 전체 (PC 내보내기 1/13~9/28 + 모바일 내보내기로 잘린 공지 보충 + 저학년·5학년 소통방)
  // 같은 일정이 바뀐 경우 가장 나중 공지 기준. 1~2월 공지의 학년은 지금(2026학년도) 학년으로 바꿔 표기.
  // 6학년 경기에 함께 가는 5학년이 있으면 대상학년에 5를 넣어 "우리 아이" 필터에서도 보이게 함.
  // [ID, 날짜, 시작, 종료, 구분, 제목, 장소, 상대, 대상학년, 대상메모, 집합/출발, 복장, 메모]
  var rows = [
    ["S0131a", "2026-01-31", "08:00", "10:30", "연습시합", "연습시합", "기장리틀구장", "양정초", "5,6", "6학년 + 5학년 김민준·오승환·류태영", "시작 1시간 전 개별집합", "아이보리", "그 외 선수는 학교훈련 (저학년은 대표님·총무님이 챙김)\n당분간 연습시합 방송 없음\n※ 새 학년 전 공지라 원문은 '5학년 전체 + 4학년 김민준·오승환·류태영' (지금 학년으로 바꿔 표기)"],
    ["S0201a", "2026-02-01", "13:00", "18:00", "연습시합", "연습시합", "기장리틀구장", "동일중앙초", "5,6", "6학년 + 5학년 김민준·오승환·류태영", "시작 1시간 전 개별집합", "빨강", "※ 새 학년 전 공지라 원문은 '5학년 전체 + 4학년 김민준·오승환·류태영' (지금 학년으로 바꿔 표기)"],
    ["S0203a", "2026-02-03", "", "", "연습시합", "연습시합 (오후, 시간 미정)", "거제 하청구장", "부천북초", "5,6", "6학년 + 5학년 김민준·오승환·류태영", "오전 수업 중 학교 출발 (2교시 후 출석인정조퇴)", "아이보리", "출석인정조퇴 학생은 이스쿨 '런업' 6시간 이수 필요\n차량지원: 조정린 3, 김수현 3, 김범서 3, 박태이 3, 이지안 3, 김서준 2, 마성민 2, 여승우 2\n※ 새 학년 전 공지라 원문은 '5학년 전체 + 4학년 김민준·오승환·류태영' (지금 학년으로 바꿔 표기)"],
    ["S0205a", "2026-02-05", "13:00", "17:00", "연습시합", "연습시합", "기장리틀구장", "안양BC", "5,6", "6학년 + 5학년 김민준·오승환·류태영", "오전 수업 중 학교 출발 (2교시 후 출석인정조퇴)", "빨강", "차량지원: 조정린 3, 김수현 2(복귀만), 박태이 3, 이지안 3, 김서준 2, 류태영 2, 이지윤 3, 김민준 3\n※ 새 학년 전 공지라 원문은 '5학년 전체 + 4학년 김민준·오승환·류태영' (지금 학년으로 바꿔 표기)"],
    ["S0207a", "2026-02-07", "08:00", "10:30", "연습시합", "6학년 연습시합", "기장리틀구장", "사상BC", "6", "6학년 전체", "시작 1시간 전 개별집합", "아이보리·빨강 번갈아 (당일 확인)", "※ 원문은 '5학년 전체' (새 학년 전 공지)"],
    ["S0207b", "2026-02-07", "11:00", "13:30", "연습시합", "저학년 연습시합", "을숙도구장", "양정초", "1,2,3,4,5", "5학년 이하", "시작 1시간 전 개별집합", "아이보리·빨강 번갈아 (당일 확인)", "※ 원문은 '4학년 및 저학년' (새 학년 전 공지)"],
    ["S0208b", "2026-02-08", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", "날씨로 시합·훈련 취소"],
    ["S0208a", "2026-02-08", "14:00", "", "연습시합", "연습시합 (취소)", "기장소프트구장", "기장드림즈", "5,6", "6학년 + 5학년 김민준·오승환·류태영", "", "", "아픈 선수가 많고 추위·강풍으로 당일 오전 시합·훈련 모두 취소 → 8·9일 휴식\n※ 새 학년 전 공지라 원문은 '5학년 전체 + 4학년 김민준·오승환·류태영' (지금 학년으로 바꿔 표기)"],
    ["S0209a", "2026-02-09", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0211a", "2026-02-11", "13:00", "17:00", "연습시합", "연습시합", "기장리틀구장", "삼성초", "5,6", "6학년 + 5학년 김민준·오승환·류태영", "2교시 후 출석인정조퇴하여 출발", "아이보리·빨강 번갈아 (당일 확인)", "그 외 선수는 학교훈련\n차량지원: 박태이 3, 마성민 3, 김서준 2, 여승우 2, 이지안 3\n※ 새 학년 전 공지라 원문은 '5학년 전체 + 4학년 김민준·오승환·류태영' (지금 학년으로 바꿔 표기)"],
    ["S0213b", "2026-02-13", "", "", "연습시합", "고학년팀 연습시합 (더블헤더)", "기장리틀구장", "감천초", "6", "6학년 전체 + 막내코치님 (15명)", "10:00 학교집합 → 11:00 기장 인근 점심 후 시합", "아이보리·빨강 번갈아 (당일 확인)", "두 팀이 따로 이동 (출발 인원 약 30명)\n차량지원: 조정린 6, 김수현 2, 마성민 2, 여승우 2, 오지환 3"],
    ["S0213a", "2026-02-13", "10:00", "", "연습시합", "저학년팀 연습시합 (더블헤더)", "기장리틀구장", "감천초", "2,3,4,5", "김민준·박도현·김승원·강도헌·남시윤·이수호·오승환·염성우·하서준·박세훈·고준서 + 김주원·정서현·최진혁 (박코치님)", "08:00 학교집합", "아이보리·빨강 번갈아 (당일 확인)", "시합 후 점심, 학교훈련\n차량지원: 박태이 3, 이수호 3, 하서준 3, 김서준 3, 김승원 3"],
    ["S0214a", "2026-02-14", "11:00", "", "연습시합", "6학년 연습시합 (더블헤더)", "을숙도야구장", "양정초", "5,6", "6학년 + 5학년 김민준", "10:00까지 개별집합", "아이보리", "시합 후 점심, 학교훈련\n처음 공지(2/4)는 11:00~18:00 VS 양정초·사파초 더블헤더 → 2/13 변경"],
    ["S0214b", "2026-02-14", "13:00", "", "연습시합", "저학년 연습시합 (더블헤더)", "을숙도야구장", "양정초", "3,4,5", "박도현·김승원·강도헌·남시윤·이수호·오승환·염성우·하서준·박세훈·고준서 + 김주원·정서현", "12:00까지 개별집합", "아이보리", ""],
    ["S0215a", "2026-02-15", "09:30", "", "훈련", "훈련", "학교", "", "전체", "", "09:00 학교집합", "", "점심 전 종료"],
    ["S0219a", "2026-02-19", "09:00", "", "연습시합", "긴급 연습시합", "기장경기장", "동일중앙초", "5,6", "6학년(김범서 제외) + 5학년 김민준·박도현", "07:00 학교집합", "아이보리", "시합 후 점심, 학교훈련\n이동: 6학년 12명 + 5학년 2명 + 막내코치님 = 15명\n차량지원: 박태이 3, 김민준 3, 마성민 3, 김도현 3, 조정린 3, 이지윤 3, 김서준 2, 오지환 3"],
    ["S0219b", "2026-02-19", "09:30", "", "훈련", "훈련 (오전)", "학교", "", "1,2,3,4,5", "연습시합 외 선수", "09:00 학교집합", "", "점심 때 종료"],
    ["S0220a", "2026-02-20", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:00 학교집합", "", "저학년 09:00~점심, 6학년 오후"],
    ["S0221a", "2026-02-21", "14:00", "", "연습시합", "연습시합", "거제 하청구장", "양산BC", "5,6", "6학년 + 5학년 김민준·박도현", "13:00까지 개별집합", "빨강", "그 외 선수는 08:30 학교집합, 09:00 훈련"],
    ["S0222a", "2026-02-22", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:00 학교집합", "", "2/20(금)과 같은 시간"],
    ["S0223a", "2026-02-23", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:00 학교집합", "", "2/20(금)과 같은 시간"],
    ["S0224a", "2026-02-24", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:00 학교집합", "", "2/20(금)과 같은 시간"],
    ["S0225a", "2026-02-25", "13:30", "", "연습시합", "연습시합", "거제 하청구장", "울산대현초", "5,6", "6학년 + 5학년 김민준·박도현", "11:00 학교집합 후 출발", "아이보리", "차량지원: 박태이 3, 강건승 5, 이지안 3, 김서준 3, 김도현 3, 마성민 3"],
    ["S0225b", "2026-02-25", "13:30", "", "훈련", "저학년 훈련", "학교", "", "1,2,3,4,5", "연습시합 외 선수", "13:00 집합", "", "우천으로 오전 → 오후로 변경"],
    ["S0226a", "2026-02-26", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0227a", "2026-02-27", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:00 학교집합", "", ""],
    ["S0228a", "2026-02-28", "11:00", "", "연습시합", "연습시합 더블헤더", "을숙도구장", "양정초 · 수영초", "5,6", "6학년 + 5학년 김민준·박도현", "10:00까지 개별집합", "빨강", "식사 있음\n그 외 선수는 08:30 학교집합, 09:00 훈련"],
    ["S0301a", "2026-03-01", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0302a", "2026-03-02", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:00 학교집합", "", ""],
    ["S0303a", "2026-03-03", "15:00", "", "연습시합", "연습시합", "기장소프트구장", "감천초", "5,6", "6학년 + 5학년 김민준·박도현·오승환", "급식 후 13:00 학교 출발", "아이보리", "오승환은 3/2 추가 합류\n그 외 선수는 학교훈련\n차량지원: 조정린 3, 박태이 3, 강건승 5, 김서준 3, 이지윤 3(출발만), 이지안 3(복귀만)"],
    ["S0307a", "2026-03-07", "08:00", "", "연습시합", "연습시합", "기장소프트구장", "양정초", "5,6", "6학년 + 5학년 김민준·박도현·오승환", "07:00까지 개별집합", "빨강", "시합 후 각자 점심, 오후 훈련\n그 외 선수는 08:30 학교집합, 09:00 훈련"],
    ["S0308a", "2026-03-08", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0310a", "2026-03-10", "14:00", "", "대회", "KSM스포츠배(위글러브) 1차전", "", "드림즈 U12", "5,6", "6학년 + 5학년 김민준·박도현·오승환", "3교시 후 학교 인근 점심 → 출발", "아이보리", "2026 KSM스포츠배(위글러브) 리틀·초·중등 야구대회\n승리 시 3/11(수) 14:00 VS 사상BC U12 (빨강) → 승리 시 3/12(목) 14:00 VS 승리팀 (아이보리)\n대회 후 학교 복귀하여 전체훈련\n결과: 공지방에 기록 없음\n차량지원: 박태이 3, 마성민 2, 여승우 2, 조정린 3, 김도현 3, 김범서 3, 이지안 3, 김수현 2, 김서준 2"],
    ["S0314a", "2026-03-14", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 08:30 / 6학년 13:30 학교집합", "", ""],
    ["S0315a", "2026-03-15", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0317a", "2026-03-17", "12:00", "", "대회", "소년체전 초등부 대표 선발전", "기장소프트구장", "수영초", "5,6", "6학년 + 5학년 김민준·박도현·오승환", "등교하지 않고 09:40 부실 집합 후 출발 (출석 인정)", "아이보리", "2026년 소년체전 초등부 대표 선발전\n시합 후 점심, 학교 복귀하여 전체훈련\n차량지원: 김수현 2, 박태이 3, 이지윤 3(출발만), 마성민 3(출발만), 조정린 3, 김서준 3, 김범서 3(복귀만), 이지안 3, 이시완 2(복귀만)\n숲 라이브 중계"],
    ["S0320a", "2026-03-20", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0321a", "2026-03-21", "08:00", "", "연습시합", "6학년 연습시합", "기장소프트구장", "감천초", "6", "6학년", "07:00까지 개별집합", "빨강", "저학년 경기와 동시 진행\n시합 후 훈련 없이 해산"],
    ["S0321b", "2026-03-21", "08:00", "", "연습시합", "저학년 연습시합", "기장리틀구장", "동일중앙초", "2,3,4,5", "저학년 (감독님·막내코치님)", "07:00까지 개별집합", "빨강", "6학년 경기와 동시 진행\n처음 공지(3/16)는 저학년만 시합 → 3/19 변경\n시합 후 훈련 없이 해산"],
    ["S0322a", "2026-03-22", "", "", "훈련", "훈련", "학교", "", "전체", "", "저학년 09:00 / 6학년 13:30 학교집합", "", ""],
    ["S0326a", "2026-03-26", "11:00", "", "대회", "흥타령기·박찬호기 예선", "", "드림즈", "5,6", "6학년 + 5학년 김민준·오승환·고준서", "09:00 출발", "아이보리", "경기 후 식사\n그 외 선수는 학교훈련\n차량지원: 박태이 3, 김수현 3, 마성민 3, 이지윤 3(출발만), 조정린 3, 김서준 3, 이지안 3, 김범서 3(출발만)"],
    ["S0327a", "2026-03-27", "13:00", "", "대회", "흥타령기·박찬호기 예선", "", "감천초", "5,6", "6학년 + 5학년 김민준·오승환·고준서", "2교시 후 10:20 출발", "아이보리부터 경기마다 번갈아 (당일 확인)", "경기 후 식사\n차량지원: 박태이 3, 김수현 3(복귀만), 조정린 3(출발만), 김서준 3, 김범서 3(복귀만), 이지안 3, 하승민 5(출발만)"],
    ["S0328a", "2026-03-28", "13:00", "", "연습시합", "5학년 연습시합", "을숙도구장", "양정초", "5,6", "5학년 + 6학년 김서준", "12:00까지 개별집합", "아이보리", "처음 공지는 5학년만 → 3/27 6학년 김서준 합류"],
    ["S0328b", "2026-03-28", "13:30", "", "훈련", "훈련", "학교", "", "2,3,4,6", "그 외 6학년 · 4·3학년", "13:30 학교집합", "", ""],
    ["S0329a", "2026-03-29", "13:00", "", "연습시합", "연습시합", "기장리틀구장", "울산대현초", "6", "6학년", "12:00까지 개별집합", "빨강", "처음 공지(3/25)는 6학년 + 김민준·오승환·고준서 → 당일 공지는 6학년\n그 외 선수는 13:30 학교집합"],
    ["S0330a", "2026-03-30", "17:00", "", "대회", "흥타령기·박찬호기 예선", "", "동일중앙초", "5,6", "6학년 + 5학년 김민준·오승환·고준서", "수업 후 14:20 출발", "아이보리부터 경기마다 번갈아 (당일 확인)", "차량지원: 박태이 3, 김수현 3, 여승우 2, 김민준 3(복귀만), 조정린 3, 김서준 3(출발만), 이지안 3(복귀만), 하승민 5(출발만), 김범서 3(복귀만), 이시완 2(출발만)"],
    ["S0331a", "2026-03-31", "13:00", "", "대회", "흥타령기·박찬호기 예선", "", "수영초", "5,6", "6학년 + 5학년 김민준·오승환·고준서", "2교시 후 10:20 출발", "아이보리부터 경기마다 번갈아 (당일 확인)", "경기 후 식사\n차량지원: 박태이 3, 김수현 3(복귀만), 여승우 2, 마성민 3(출발만), 조정린 3, 김서준 3, 이지윤(출발만), 오지환 3"],
    ["S0401c", "2026-04-01", "", "", "휴식", "휴식 (대회 참가선수 외)", "", "", "1,2,3,4,5", "대회 참가선수 외", "", "", "참가선수 외 선수는 4/1(수)~4/5(일) 휴식"],
    ["S0401a", "2026-04-01", "14:00", "", "대회", "흥타령기·박찬호기 예선 (더블헤더 1)", "", "양정초", "5,6", "6학년 + 5학년 김민준·오승환·고준서", "3교시 후 식사, 12:00 출발", "아이보리부터 경기마다 번갈아 (당일 확인)", "차량지원: 박태이 3, 김수현 3, 여승우 2, 마성민 2(복귀만), 이지윤 3, 김민준 3(복귀만), 조정린 3, 김서준 3(출발만), 김범서 2, 이지안 3(복귀만)"],
    ["S0401b", "2026-04-01", "16:00", "", "대회", "흥타령기·박찬호기 예선 (더블헤더 2)", "", "사상BC", "5,6", "6학년 + 5학년 김민준·오승환·고준서", "", "아이보리부터 경기마다 번갈아 (당일 확인)", "실제 시작 16:15"],
    ["S0402a", "2026-04-02", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", "대회 참가선수는 4/2~4/5 휴식"],
    ["S0403a", "2026-04-03", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0404a", "2026-04-04", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0405a", "2026-04-05", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0408a", "2026-04-08", "14:30", "", "연습시합", "연습시합", "기장소프트구장", "수영초", "5,6", "6학년 + 5학년 김민준", "5교시(13:30) 후 출발", "아이보리", "처음 공지는 6학년 + 민준·승환·준서 → 오승환·고준서는 학교훈련으로 변경\n그 외 선수는 학교훈련\n차량지원: 박태이 3, 조정린 3, 김도현 3, 이시완 3(출발만), 김서준 3(출발만), 이지안 3(복귀만), 강건승 3(복귀만), 여승우 2, 마성민 3(출발만)"],
    ["S0411a", "2026-04-11", "13:10", "", "대회", "영남권역 주말리그 U11", "밀양 선샤인 리틀B구장", "본리초", "4,5", "U11 (명단 공지 없음 · 보통 5학년 + 김주원)", "시작 1시간 전 개별집합", "아이보리", "제2회 영남권역 초등야구 주말리그"],
    ["S0411b", "2026-04-11", "15:00", "", "대회", "영남권역 주말리그 U12", "밀양 선샤인 리틀A구장", "본리초", "6", "U12 (명단 공지 없음)", "시작 1시간 전 개별집합", "아이보리", "제2회 영남권역 초등야구 주말리그"],
    ["S0412a", "2026-04-12", "13:30", "", "연습시합", "5학년 연습시합", "거제 하청야구장", "거제BC", "5", "5학년", "시작 1시간 전 개별집합", "빨강", ""],
    ["S0412b", "2026-04-12", "15:00", "", "연습시합", "6학년 연습시합", "거제 하청야구장", "거제BC", "6", "6학년", "시작 1시간 전 개별집합", "빨강", ""],
    ["S0415a", "2026-04-15", "15:00", "", "연습시합", "연습시합", "삼락생태공원 성인야구장A", "사상BC", "5,6", "6학년 + 5학년 김민준", "5교시(13:30) 후 출발", "아이보리", "주차: 삼락 주차장 P6\n차량지원: 박태이 3, 이시완 3(출발만), 김도현 3, 조정린 3, 마성민 3, 이지윤 3(복귀만), 김서준 3"],
    ["S0415b", "2026-04-15", "15:00", "", "행사", "학교 간담회", "학교", "", "전체", "", "", "", "연습시합과 같은 시간에 학교에서 간담회 진행"],
    ["S0416a", "2026-04-16", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0418a", "2026-04-18", "12:00", "", "연습시합", "6학년 연습시합", "을숙도야구장", "양정초", "6", "6학년", "시작 1시간 전 개별집합", "빨강", ""],
    ["S0418b", "2026-04-18", "14:00", "", "연습시합", "5학년 연습시합", "을숙도야구장", "양정초", "5", "5학년", "시작 1시간 전 개별집합", "빨강", ""],
    ["S0419a", "2026-04-19", "09:30", "", "훈련", "6학년 훈련", "학교", "", "6", "6학년", "09:00 학교집합", "", "저학년 휴식"],
    ["S0420a", "2026-04-20", "16:00", "", "연습시합", "6학년 연습시합", "기장소프트구장", "감천초", "6", "6학년", "6교시(14:20) 후 출발", "아이보리", "저학년 경기와 동시 진행 (이동 약 30명)\n차량지원: 박태이 3, 하서준 3, 조정린 3, 류태영 3, 김서준 3(출발만), 이수호 2(복귀만), 김수현 3, 김승원 3, 김민준 3, 강도헌 3, 고준서 3(복귀만), 김민준(3학년) 3(출발만), 오지환 3"],
    ["S0420b", "2026-04-20", "16:00", "", "연습시합", "저학년 연습시합", "기장리틀구장", "감천초", "2,3,4,5", "저학년 (5학년 이하)", "6교시(14:20) 후 출발", "아이보리", "6학년 경기와 동시 진행"],
    ["S0422a", "2026-04-22", "14:00", "17:00", "연습시합", "연습시합", "기장리틀구장", "양정초", "5,6", "6학년 + 5학년 김민준", "5교시(13:30) 후 출발", "빨강", "그 외 선수는 학교훈련\n차량지원: 박태이 3, 이시완 3(출발만), 조정린 3, 마성민 2(복귀만), 김서준 3(출발만), 김범서 3(복귀만), 김도현 3"],
    ["S0423a", "2026-04-23", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0425a", "2026-04-25", "13:00", "", "연습시합", "연습시합", "기장소프트구장", "양정초", "5,6", "6학년 + 5학년 김민준", "시작 1시간 전 개별집합", "아이보리", "처음 공지(을숙도 12:00 6학년 / 14:00 5학년)는 취소되고 변경\n그 외 선수는 학교훈련"],
    ["S0426a", "2026-04-26", "", "", "훈련", "6학년 학교훈련 (실내)", "학교", "", "6", "6학년", "09:20까지 집합", "", "그 외 선수는 휴식"],
    ["S0429a", "2026-04-29", "14:00", "17:00", "연습시합", "연습시합", "기장리틀구장", "수영초", "4,5", "5학년 + 4학년 김주원", "5교시(13:30) 후 출발", "빨강", "수영초 행사로 6학년 시합이 취소되고 5학년 경기로 변경\n그 외 선수는 학교훈련\n차량지원: 류태영 3, 김승원 3, 박도현 3, 이수호 4(복귀만), 박세훈 2, 오승환 3, 김주원 3(출발만), 남시윤 3"],
    ["S0430a", "2026-04-30", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0501a", "2026-05-01", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 집합", "", ""],
    ["S0502a", "2026-05-02", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 집합", "", ""],
    ["S0503a", "2026-05-03", "11:20", "", "대회", "영남리그 U11 (취소)", "밀양 선샤인 리틀B구장 (3루)", "", "4,5", "U11 (명단 공지 없음 · 보통 5학년 + 김주원)", "시작 1시간 전 개별집합", "아이보리", "5/2 저녁 취소 공지 → 학교훈련"],
    ["S0503c", "2026-05-03", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 집합", "", "영남리그 취소로 학교훈련"],
    ["S0503b", "2026-05-03", "15:00", "", "대회", "영남리그 U12 (취소)", "밀양 선샤인 리틀A구장 (1루)", "", "6", "U12", "시작 1시간 전 개별집합", "아이보리", "5/2 저녁 취소 공지 → 학교훈련"],
    ["S0504a", "2026-05-04", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 집합", "", ""],
    ["S0505a", "2026-05-05", "10:30", "13:00", "연습시합", "6학년 연습시합 (어린이날)", "기장 공원구장", "인천창영초", "5,6", "6학년 + 5학년 김민준", "09:30까지 개별집합", "아이보리", "시합 후 각자 점심 → 14:00까지 리틀구장 합류 (청백전)"],
    ["S0505b", "2026-05-05", "13:00", "18:00", "연습시합", "자체 청백전", "기장리틀구장", "", "전체", "저학년 (고학년은 14:00 합류)", "저학년 13:00까지 리틀구장 개별집합", "빨강 (저학년)", ""],
    ["S0506a", "2026-05-06", "15:00", "18:00", "연습시합", "연습시합", "기장소프트구장", "동일중앙초", "5,6", "6학년 + 5학년 김민준", "5교시(13:30) 후 출발", "빨강", "그 외 선수는 학교훈련\n차량지원: 박태이 3, 조정린 3, 김도현 3, 김서준 3(출발만), 여승우 2, 김민준 3(복귀만), 김수현 3"],
    ["S0507a", "2026-05-07", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0509a", "2026-05-09", "08:00", "10:30", "연습시합", "5학년 이하 연습시합", "기장소프트구장", "동일중앙초", "1,2,3,4,5", "5학년 이하 전원", "07:00까지 개별집합", "아이보리", "6학년은 13:00 학교집합, 13:30 훈련"],
    ["S0510a", "2026-05-10", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 학교집합", "", ""],
    ["S0511a", "2026-05-11", "15:00", "18:00", "연습시합", "연습시합", "기장소프트구장", "수영초", "5,6", "6학년 + 5학년 김민준", "6교시(14:20) 후 출발", "빨강", "그 외 선수는 학교훈련\n차량지원: 박태이 3, 김도현 3, 조정린 3, 오지환 3(출발만), 김서준 3, 여승우 2"],
    ["S0514a", "2026-05-14", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0516a", "2026-05-16", "08:00", "", "연습시합", "6학년 연습시합", "기장리틀구장", "양정초", "6", "6학년", "시작 1시간 전 개별집합", "아이보리", ""],
    ["S0516b", "2026-05-16", "09:00", "", "연습시합", "5학년 이하 연습시합", "부산중학교", "동일중앙초", "1,2,3,4,5", "5학년 이하 전원", "시작 1시간 전 개별집합", "아이보리", ""],
    ["S0517a", "2026-05-17", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 학교집합", "", ""],
    ["S0518a", "2026-05-18", "15:00", "", "연습시합", "5학년 이하 연습시합", "기장소프트구장", "수영초", "1,2,3,4,5", "5학년 이하 전원", "6교시(14:20) 후 출발", "빨강", "5/17 급변경: 월↔수 참가선수 교체 (처음엔 6학년 경기)\n그 외 선수는 학교훈련\n차량지원: 이수호 4(복귀만), 류태영 3, 김승원 3, 박도현 3, 김주원 3(출발만), 김민준(3학년) 3(출발만), 손지완 3, 박시후 3(복귀만)"],
    ["S0520a", "2026-05-20", "14:00", "", "연습시합", "연습시합 (우천 취소)", "기장리틀구장", "수영초", "5,6", "6학년 + 5학년 김민준", "5교시(13:30) 후 출발", "아이보리", "당일 오전 우천 취소"],
    ["S0523a", "2026-05-23", "10:00", "13:00", "연습시합", "연습시합", "거제 하청구장", "거제BC", "5,6", "6학년 + 5학년 김민준", "시작 1시간 전 개별집합", "아이보리", "그 외 선수는 13:00 집합, 13:30 학교훈련"],
    ["S0524a", "2026-05-24", "13:00", "16:00", "연습시합", "5학년 연습시합", "거제 하청구장", "거제BC", "5", "5학년", "시작 1시간 전 개별집합", "빨강", "처음 공지는 5학년 이하 전원 → 5/23: 4·3·2학년 휴식\n6학년은 13:00 집합, 13:30 학교훈련"],
    ["S0525a", "2026-05-25", "10:00", "13:00", "연습시합", "연습시합", "기장소프트구장", "김해삼성초", "5,6", "6학년 + 5학년 김민준", "시작 1시간 전 개별집합", "아이보리", "그 외 선수는 13:00 집합, 13:30 학교훈련"],
    ["S0527a", "2026-05-27", "14:00", "17:00", "연습시합", "연습시합 (취소)", "기장리틀구장", "양정초", "5,6", "6학년 + 5학년 김민준", "5교시(13:30) 후 출발", "빨강", "5/26 감독님 공지로 취소"],
    ["S0529a", "2026-05-29", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0530a", "2026-05-30", "09:30", "", "연습시합", "5학년 연습시합", "부산중학교", "동일중앙초", "5", "5학년", "시작 1시간 전 개별집합", "빨강", "처음 공지는 5학년 이하 전원 → 5/29: 4·3·2학년은 불참"],
    ["S0530b", "2026-05-30", "13:30", "", "연습시합", "6학년 연습시합", "부산공고", "감천초", "6", "6학년", "시작 1시간 전 개별집합", "빨강", ""],
    ["S0530c", "2026-05-30", "14:00", "", "훈련", "훈련", "학교", "", "2,3,4", "4·3·2학년", "13:30 학교집합", "", ""],
    ["S0531a", "2026-05-31", "", "", "훈련", "훈련", "학교", "", "5,6", "6·5학년", "6학년 09:00 / 5학년 13:00 학교집합", "", "6학년은 각자 점심 준비, 오후까지 훈련\n4·3·2학년 휴식\n하계훈련복 배부 (다음 날부터 착용)"],
    ["S0601a", "2026-06-01", "10:00", "", "대회", "협회장배 1차전", "", "", "5,6", "6학년 + 5학년 김민준·오승환", "07:40 학교집합, 08:00 출발", "아이보리", "경기 후 식사(12:00)\n결과: 공지방엔 없지만 다음 경기가 '1일 승리 시' 일정(12:00)으로 잡혀 승리로 보임\n처음 공지엔 6학년 중 김도현 제외\n그 외 선수는 학교훈련\n차량지원: 박태이 3, 김수현 2, 조정린 3, 김범서 2, 이지윤 3, 김서준 3"],
    ["S0603a", "2026-06-03", "09:00", "", "연습시합", "저학년 연습시합", "밀양 선샤인구장", "김해삼성초", "1,2,3,4,5", "4학년 이하 전원 + 5학년 이수호·강도헌", "", "아이보리", "6학년 휴식"],
    ["S0603b", "2026-06-03", "11:00", "", "연습시합", "5학년 연습시합", "밀양 선샤인구장", "김해삼성초", "5", "5학년 전체", "", "아이보리", ""],
    ["S0604a", "2026-06-04", "12:00", "", "대회", "협회장배 2차전", "", "", "5,6", "6학년 + 5학년 김민준·오승환", "1교시(09:30) 후 출발 (차량지원은 09:30까지)", "빨강", "6/2 경기가 취소되어 4일로 연기\n경기 후 식사(14:00), 패배 시 16:00 경기\n시합복: 6/3 '유니폼바지 + 하계훈련복'으로 바뀌었다가 다시 빨간색 유니폼으로 확정\n차량지원: 박태이 3, 마성민 2, 조정린 3, 김수현 2, 김서준 3, 김범서 3(출발만), 김민준 3"],
    ["S0605a", "2026-06-05", "10:00", "", "대회", "협회장배 (4일 승리 시)", "", "", "5,6", "6학년 + 5학년 김민준·오승환", "07:40 학교집합, 08:00 출발", "아이보리", "4일 승리 시 10:00 → 승리 시 14:30\n4일 패배 후 승리 시 12:00 (1교시 후 출발)\n처음 공지(11:00/13:00/15:30)보다 한 시간씩 당겨짐\n결과: 공지방에 기록 없음\n차량지원: 박태이 3, 김수현 2, 김서준 3, 오지환 3, 조정린 3, 김민준 3"],
    ["S0606a", "2026-06-06", "14:00", "", "훈련", "훈련", "학교", "", "전체", "", "13:30 집합", "", ""],
    ["S0607a", "2026-06-07", "14:00", "", "훈련", "훈련", "학교", "", "전체", "", "13:30 집합", "", "6학년 오전 특타훈련 08:30 집합 (각자 점심 준비)"],
    ["S0608a", "2026-06-08", "15:00", "", "연습시합", "연습시합 (취소)", "기장소프트구장", "수영초", "5,6", "6학년 + 5학년 김민준·오승환", "6교시(14:20) 후 출발", "", "6/5 취소 공지"],
    ["S0610a", "2026-06-10", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0611a", "2026-06-11", "14:00", "", "대회", "U-12 전국유소년 야구대회 출발 (울진)", "SK아파트 정문 출발", "", "6", "울진대회 참가선수", "3교시(11:10) 후 훈련 → 13:00 점심(학교 앞) → 14:00 출발", "출발 복장: 하계훈련복 + 언더티", "준비물: 개인 장비·유니폼·모자·벨트(필수), 유니폼 빨강·아이보리 + 하의 2~3벌, 언더티 여러 벌, 바람막이, 양말·속옷 넉넉히, 활동복·훈련복·잠옷, 세면도구 (작은 캐리어 가능)\n그 외 선수는 학교훈련"],
    ["S0612a", "2026-06-12", "11:00", "", "대회", "U-12 전국유소년 야구대회 1차전", "울진", "", "6", "울진대회 참가선수", "", "아이보리", "2026 U-12 전국유소년 야구대회 (6/12~6/21)\n승리 시 6/14(일) 09:30 → 6/16(화) 11:00 → 6/17(수) 09:30\n결과: 공지방에 기록 없음 (6/13 6학년 휴식·6/14 전체 휴식 공지)"],
    ["S0613a", "2026-06-13", "09:00", "", "연습시합", "5학년 연습시합", "김해삼성초등학교", "김해삼성초", "4,5", "5학년 + 4학년 김주원", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "코치님 두 분 인솔\n6학년 전체 휴식, 그 외 선수는 감독님과 학교훈련"],
    ["S0614a", "2026-06-14", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0615a", "2026-06-15", "15:00", "18:00", "연습시합", "연습시합", "기장리틀구장", "동일중앙초", "4,5", "5학년 + 4학년 김주원", "6교시(14:20) 후 출발", "유니폼바지 + 하계훈련복 상의", "차량지원: 김승원 3, 류태영 3, 박도현 3, 손지완 3, 김주원 3(출발만)"],
    ["S0617a", "2026-06-17", "14:00", "17:00", "연습시합", "연습시합", "기장리틀구장", "양정초", "4,5", "5학년 + 4학년 김주원", "5교시(13:30) 후 출발", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 학교훈련\n차량지원: 김승원 3, 류태영 3, 손지완 3, 박도현 3, 김주원 3(출발만), 김민준 3(복귀만)"],
    ["S0618a", "2026-06-18", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0619a", "2026-06-19", "", "", "훈련", "훈련", "학교", "", "전체", "", "", "", ""],
    ["S0620a", "2026-06-20", "14:00", "", "연습시합", "연습시합", "거제 하청구장 (안쪽 인조구장 두 곳 중 앞쪽)", "거제BC", "5,6", "6학년 + 5학년 김민준", "13:00까지 개별집합 (각자 점심)", "유니폼바지 + 하계훈련복 상의", "10:30 → 14:00으로 변경, 구장도 안쪽 인조구장으로 변경\n그 외 선수는 13:30 집합, 14:00 훈련"],
    ["S0621a", "2026-06-21", "09:30", "", "대회", "영남리그 U11", "", "사파BC", "4,5", "5학년 + 4학년 김주원", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 휴식"],
    ["S0621b", "2026-06-21", "11:20", "", "대회", "영남리그 U12", "", "사파BC", "6", "6학년", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 휴식"],
    ["S0623a", "2026-06-23", "", "", "훈련", "학교훈련", "학교", "", "전체", "", "", "", ""],
    ["S0624a", "2026-06-24", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0625a", "2026-06-25", "15:00", "", "연습시합", "연습시합", "기장리틀구장", "동일중앙초", "5,6", "6학년 + 5학년 김민준", "6교시(14:20) 후 출발", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 학교훈련\n차량지원: 박태이 3, 김도현 3, 조정린 3, 김서준 3(출발만), 마성민 3"],
    ["S0626a", "2026-06-26", "15:00", "", "연습시합", "연습시합", "기장리틀구장", "수영초", "4,5", "5학년 + 4학년 김주원", "5교시(13:30) 후 출발", "유니폼바지 + 하계훈련복 상의", "출발 6교시 → 5교시로 변경\n그 외 선수는 학교훈련\n차량지원: 박도현 3, 류태영 3, 김민준 3, 손지완 3, 김주원 3(출발만), 김승원 3"],
    ["S0627a", "2026-06-27", "11:40", "", "대회", "아이리그", "기장리틀구장 (3루측)", "감천초", "5,6", "6학년 + 5학년 김민준·오승환", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 13:30 집합, 14:00 훈련"],
    ["S0628a", "2026-06-28", "13:40", "", "대회", "아이리그", "기장리틀구장 (1루측)", "수영초", "5,6", "6학년 + 5학년 김민준·오승환", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 13:30 집합, 14:00 훈련"],
    ["S0629a", "2026-06-29", "15:00", "", "연습시합", "연습시합", "기장소프트구장", "양정초", "4,5", "5학년 + 4학년 김주원", "6교시(14:20) 후 출발", "", "다음 날(6/30)부터 사복 등교\n차량지원: 박도현 3, 류태영 3, 김주원 3(출발만), 김승원 3, 손지완 3, 박세훈 2(복귀만)"],
    ["S0701a", "2026-07-01", "14:00", "", "연습시합", "연습시합 (우천 취소)", "기장리틀구장", "감천초", "4,5", "5학년 + 4학년 김주원", "5교시(13:30) 후 출발", "", "당일 우천 취소"],
    ["S0702a", "2026-07-02", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0704a", "2026-07-04", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 집합", "", ""],
    ["S0705a", "2026-07-05", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:00 집합", "", ""],
    ["S0706a", "2026-07-06", "15:00", "", "연습시합", "연습시합", "기장소프트구장", "수영초", "4,5", "5학년 + 4학년 김주원", "6교시(14:20) 후 출발", "", "차량지원: 박도현 3, 김주원 3, 류태영 3, 김승원 3, 손지완 3"],
    ["S0708a", "2026-07-08", "13:00", "", "대회", "대구 동기 회장기 1차전", "대구강변리틀1야구장", "본리초", "5,6", "6학년 + 5학년 김민준·오승환", "08:30 부실 집합 후 출발", "유니폼바지 + 하계훈련복 상의", "11:00 경기장 인근 점심 → 12:00 경기장 이동\n승리 시 7/9(목) 17:00, 승리 시 7/10(금) 17:00 (5교시 후 13:30 출발)\n결과: 공지방에 기록 없음\n참가선수 외 학교훈련\n차량지원: 박태이 3, 조정린 3, 김서준 3, 오지환 2, 마성민 3, 김도현 2, 여승우 2"],
    ["S0710a", "2026-07-10", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0711a", "2026-07-11", "09:30", "", "대회", "영남리그 U12", "밀양 선샤인구장", "도산초", "6", "U12", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "참가선수 외 휴식"],
    ["S0711b", "2026-07-11", "11:20", "", "대회", "영남리그 U11", "밀양 선샤인구장", "도산초", "4,5", "U11 (명단 공지 없음 · 보통 5학년 + 김주원)", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "참가선수 외 휴식"],
    ["S0711c", "2026-07-11", "15:00", "", "대회", "영남리그 U11", "밀양 선샤인구장", "거제시공공SC", "4,5", "U11 (명단 공지 없음 · 보통 5학년 + 김주원)", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "참가선수 외 휴식"],
    ["S0712a", "2026-07-12", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0713a", "2026-07-13", "15:00", "", "연습시합", "연습시합", "기장소프트구장", "수영초", "4,5", "5학년 + 4학년 김주원", "6교시(14:20) 후 출발", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 학교훈련\n차량지원: 류태영 3, 손지완 3, 박도현 3, 김승원 4, 김주원 3"],
    ["S0717a", "2026-07-17", "15:30", "", "연습시합", "연습시합", "기장리틀구장", "감천초", "4,5", "5학년 + 4학년 김주원", "", "", "코치님·장비 픽업: 김승원 어머님"],
    ["S0718a", "2026-07-18", "11:40", "", "대회", "아이리그", "기장리틀구장", "양정초", "5,6", "6학년 + 5학년 김민준·오승환", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "시합 후 점심\n참가선수 외 13:30 집합, 14:00 훈련"],
    ["S0719a", "2026-07-19", "15:40", "", "대회", "아이리그", "기장리틀구장", "기장드림즈", "5,6", "6학년 + 5학년 김민준·오승환", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "참가선수 외 13:30 집합, 14:00 훈련"],
    ["S0720a", "2026-07-20", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0721a", "2026-07-21", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0722a", "2026-07-22", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0723a", "2026-07-23", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0724a", "2026-07-24", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0725a", "2026-07-25", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0726a", "2026-07-26", "", "", "휴식", "여름방학", "", "", "전체", "", "", "", "야구부 방학 7/20~7/26"],
    ["S0727a", "2026-07-27", "15:00", "", "훈련", "훈련 (방학 후)", "학교", "", "전체", "", "14:30 집합", "", "6학년 실내 보강훈련 12:30 집합, 13:00 시작"],
    ["S0730a", "2026-07-30", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0731a", "2026-07-31", "09:00", "", "연습시합", "6학년 연습시합", "기장소프트구장", "양정초", "6", "6학년", "07:00 학교출발", "유니폼바지 + 하계훈련복 상의", "7/30 긴급 변경: 5·6학년 시간 맞바꿈 (원래 6학년 13:00)\n차량지원: 박태이 3, 김수현 3, 조정린 3, 김범서 3, 여승우 3, 이지윤 3, 김서준 3, 마성민 2"],
    ["S0731b", "2026-07-31", "13:00", "", "연습시합", "5학년 연습시합", "기장소프트구장", "양정초", "5", "5학년", "11:00 학교출발", "유니폼바지 + 하계훈련복 상의", "원래 09:00 → 13:00으로 변경\n차량지원: 류태영 3, 손지완 3, 박세훈 2"],
    ["S0731c", "2026-07-31", "15:30", "", "연습시합", "저학년 연습시합", "삼락야구장", "양정초", "2,3,4", "4학년 이하", "13:30 학교출발", "유니폼바지 + 하계훈련복 상의", "차량지원: 최진혁 3, 이하준 3, 박시후 3, 김민준(3학년) 3(출발만), 하승후 3, 김재백 5, 이주원 3, 김주원 3"],
    ["S0801a", "2026-08-01", "", "", "훈련", "6학년 보강훈련", "학교", "", "6", "6학년", "12:30 집합", "", ""],
    ["S0802a", "2026-08-02", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0804b", "2026-08-04", "", "", "훈련", "훈련", "학교", "", "전체", "", "4·3·2학년 보강 13:30 / 그 외 15:30 집합", "", "훈련 한 시간 늦게 시작"],
    ["S0804a", "2026-08-04", "09:00", "", "연습시합", "연습시합", "기장리틀구장", "동일중앙초", "4,5", "5학년 + 4학년 김주원", "07:00 학교출발", "유니폼바지 + 하계훈련복 상의", "차량지원: 김승원 3, 류태영 3, 강도헌 3, 오승환 3"],
    ["S0805a", "2026-08-05", "", "", "훈련", "훈련", "학교", "", "전체", "", "6학년 보강 12:30 / 전체 14:30 집합", "", ""],
    ["S0806a", "2026-08-06", "09:00", "", "연습시합", "5학년 연습시합", "기장소프트구장", "동일중앙초", "4,5", "5학년 + 4학년 김주원", "07:00 학교출발", "유니폼바지 + 하계훈련복 상의", "4·3·2학년 휴식\n차량지원: 박도현 3, 오승환 3, 류태영 3, 김주원 3(출발만), 김승원 3"],
    ["S0806b", "2026-08-06", "15:00", "", "연습시합", "6학년 연습시합", "기장소프트구장", "수영초", "6", "6학년", "13:00 학교출발", "유니폼바지 + 하계훈련복 상의", "처음 공지는 6학년 + 김민준 → 8/3 변경\n차량지원: 조정린 3, 이지안 3, 하승민 5, 마성민 2(출발만), 여승우 2"],
    ["S0807a", "2026-08-07", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0808a", "2026-08-08", "08:00", "", "연습시합", "연습시합", "기장소프트구장", "양정초", "5,6", "6학년 + 5학년 김민준", "07:00까지 개별집합", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 14:30 집합, 15:00 훈련 (5학년 보강 12:30)"],
    ["S0809a", "2026-08-09", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0810a", "2026-08-10", "", "", "훈련", "훈련 (4·3·2학년 보강)", "학교", "", "전체", "", "4·3·2학년 보강 12:30 집합", "", ""],
    ["S0811a", "2026-08-11", "09:00", "", "연습시합", "연습시합", "기장소프트구장", "양정초", "5,6", "6학년 + 5학년 김민준", "07:00 학교출발", "유니폼바지 + 하계훈련복 상의", "5학년 보강훈련 12:30\n차량지원: 조정린 3, 이지윤 3(출발만), 김도현 3(복귀만), 김서준 2, 마성민 3(복귀만)"],
    ["S0812a", "2026-08-12", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0813a", "2026-08-13", "", "", "행사", "삼계탕 특식 + 훈련", "학교", "", "전체", "", "6학년 10:40 / 그 외 12:40 학교집합", "", ""],
    ["S0814a", "2026-08-14", "09:00", "", "연습시합", "연습시합", "기장소프트구장", "수영초", "5,6", "6학년 + 5학년 김민준", "07:00 학교출발", "유니폼바지 + 하계훈련복 상의", "코치님 + 6학년 14명\n차량지원: 조정린 3, 이지윤 3, 강건승 3(출발만), 김수현 3, 여승우 3(출발만), 김서준 3(복귀만), 김범서 3"],
    ["S0814b", "2026-08-14", "10:10", "", "대회", "영남리그 U11", "밀양 선샤인구장", "동일중앙초", "4,5", "5학년 + 4학년 김주원", "07:40 학교출발", "유니폼바지 + 하계훈련복 상의", "감독님 + 5학년 + 김주원 14명\n차량지원: 김승원 3, 류태영 2, 김재백 3, 김민준 2, 오승환 3, 손지완 3(출발만)"],
    ["S0815a", "2026-08-15", "15:00", "", "대회", "영남리그 U12", "밀양 선샤인구장", "창원BC", "5,6", "6학년 + 5학년 김민준", "14:00까지 개별집합", "유니폼바지 + 하계훈련복 상의", "그 외 선수는 보강 없이 전체훈련 14:30 집합"],
    ["S0816a", "2026-08-16", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0817a", "2026-08-17", "", "", "훈련", "훈련 (5학년 보강)", "학교", "", "전체", "", "5학년 보강 12:30 집합", "", ""],
    ["S0818a", "2026-08-18", "09:00", "12:00", "연습시합", "5학년 연습시합", "기장소프트구장", "동일중앙초", "5", "5학년", "07:00 학교출발", "", "새 막내코치님 첫 출근 (인솔)\n4·3·2학년 보강훈련\n차량지원: 김승원 4, 류태영 3, 김재백 3, 손지완 3"],
    ["S0819a", "2026-08-19", "", "", "훈련", "훈련 (6학년 보강)", "학교", "", "전체", "", "6학년 보강", "", "처음 공지는 전체휴식 → 8/17 변경"],
    ["S0820a", "2026-08-20", "", "", "훈련", "훈련 (5학년 보강)", "학교", "", "전체", "", "5학년 보강", "", ""],
    ["S0821a", "2026-08-21", "09:00", "12:00", "연습시합", "5학년 연습시합", "기장 공원구장", "감천초", "5", "5학년", "06:30 학교출발", "", "소프트구장 → 공원구장으로 변경 (출발 07:00 → 06:30)\n6학년 08:30 훈련, 저학년 휴식\n차량지원: 김승원 4, 류태영 3, 김재백 3, 김민준 3, 손지완 3, 고준서 3"],
    ["S0822a", "2026-08-22", "11:00", "13:00", "대회", "아이리그", "기장리틀구장", "사상BC", "5,6", "6학년 + 5학년 김민준", "10:30까지 개별집합", "", "참가선수 외 14:30 집합 훈련"],
    ["S0823a", "2026-08-23", "14:30", "", "훈련", "6학년 훈련", "학교", "", "6", "6학년", "14:30 학교집합", "", "그 외 선수는 휴식"],
    ["S0824a", "2026-08-24", "10:00", "12:00", "대회", "밀양리그", "밀양 선샤인구장", "거제BC", "5,6", "6학년 + 5학년 김민준", "07:00 학교출발", "", "차량지원: 박태이 3, 조정린 3, 김서준 2, 김범서 3, 김도현 3, 여승우 3"],
    ["S0824b", "2026-08-24", "14:30", "", "훈련", "전체훈련", "학교", "", "전체", "", "14:30 집합", "", "보강훈련 없이 전체훈련"],
    ["S0825a", "2026-08-25", "10:00", "12:00", "연습시합", "연습시합", "기장소프트구장", "드림즈", "5,6", "6학년 + 5학년 김민준", "08:00 학교출발", "", "차량지원: 조정린 3, 마성민 3(복귀만), 이지윤 3, 김서준 2(출발만), 김도현 3"],
    ["S0826a", "2026-08-26", "09:00", "", "연습시합", "저학년 연습시합", "기장리틀구장", "동일중앙초", "2,3,4", "4·3·2학년 (4학년 5명 · 3학년 5명 + 2학년)", "07:00 학교출발", "유니폼바지 + 하계훈련복 상의", "전날 긴급으로 잡힌 시합 (처음 공지는 4·3학년 → 2학년도 함께 이동)\n차량지원: 김민찬 3(출발만), 정서현 2, 이든 3, 하승후 4, 김주원 3(출발만), 최진혁 3, 김민준 3, 박시후 3(출발만)\n유튜브·숲 라이브 중계"],
    ["S0827a", "2026-08-27", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0828a", "2026-08-28", "14:30", "", "훈련", "훈련 (6학년 보강)", "학교", "", "전체", "", "6학년 보강 12:30 / 그 외 14:30 집합", "", "우천으로 6학년 15시경, 나머지 학년 17시경 일찍 종료"],
    ["S0829a", "2026-08-29", "14:30", "", "훈련", "훈련 (5학년 보강)", "학교", "", "전체", "", "5학년 보강 12:30 / 그 외 14:30 집합", "", ""],
    ["S0830b", "2026-08-30", "15:30", "", "연습시합", "저학년 연습시합", "동일중앙초등학교", "동일중앙초", "2,3,4", "4·3·2학년", "14:30까지 개별도착 (시작 1시간 전)", "", "장비·물품 챙겨주실 부모님은 13:40 학교 집합\n그 외 선수는 휴식"],
    ["S0830a", "2026-08-30", "16:50", "", "대회", "영남리그 U12 (우천 취소)", "밀양", "", "5,6", "6학년 + 5학년 김민준·오승환", "15:30까지 밀양 개별도착 (시작 1시간 30분 전)", "", "8/29 밤 우천 취소 공지 → 5·6학년 휴식"],
    ["S0831a", "2026-08-31", "14:30", "", "훈련", "훈련", "학교", "", "5,6", "6·5학년", "14:30 집합", "", "처음 공지는 4·3·2학년 보강 → 8/30: 4·3·2학년 휴식"],
    ["S0901a", "2026-09-01", "", "", "훈련", "개학 · 방과후 훈련", "학교", "", "전체", "", "방과 후 부실", "사복 등교 (반바지는 훈련복 가능)", "방과 후 부실에서 훈련복으로 갈아입고 훈련"],
    ["S0902a", "2026-09-02", "15:00", "", "연습시합", "연습시합", "기장리틀구장", "감천초", "5,6", "6학년 + 5학년 김민준·오승환", "13:30 학교출발 (5교시 후)", "", "그 외 선수는 학교훈련\n차량지원: 조정린 3, 김서준 3, 이지윤 3, 박태이 3, 여승우 3(복귀)"],
    ["S0904a", "2026-09-04", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0905a", "2026-09-05", "14:00", "", "훈련", "훈련", "학교", "", "전체", "", "13:30 집합", "", ""],
    ["S0906a", "2026-09-06", "08:00", "", "연습시합", "연습시합", "기장리틀구장", "동일중앙초", "5,6", "6학년 + 5학년 김민준·오승환", "07:00 리틀구장 개별집합", "", "숲 라이브 중계"],
    ["S0906b", "2026-09-06", "10:00", "13:30", "훈련", "학교 훈련", "학교", "", "1,2,3,4,5", "연습시합 외 선수", "09:30 집합", "", "저학년 13:30까지 훈련 (총무님 안내)"],
    ["S0907a", "2026-09-07", "09:00", "", "대회", "회장기 전국대회 1차전", "밀양", "강원 영랑초", "5,6", "6학년 + 5학년 김민준·오승환", "06:30 학교출발", "", "✅ 승리 (첫 승)\n처음 공지는 '7일(화)'였으나 실제 월요일\n그 외 선수는 학교훈련\n차량지원: 조정린 3, 김도현 3, 이지윤 3, 김범서 3, 김서준 3(복귀만), 오지환 3(출발만)\n유튜브·숲 라이브 중계"],
    ["S0909a", "2026-09-09", "16:00", "", "대회", "회장기 전국대회 2차전", "밀양", "서울 봉천초", "5,6", "6학년 + 5학년 김민준·오승환", "13:30 학교출발", "", "시작 16:30→16:00, 출발 14:00→13:30으로 변경\n4교시 후 급식 → 실내연습장 훈련 후 출발\n그 외 선수는 학교훈련\n결과: 단톡방에 기록 없음 (중계 없음)\n차량지원: 김서준 3(출발만), 여승우 3, 조정린 3, 박태이 3, 김범서 3(복귀만), 오지환 3, 김도현 3"],
    ["S0911a", "2026-09-11", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0912a", "2026-09-12", "14:00", "", "훈련", "훈련", "학교", "", "전체", "", "13:30 집합", "", ""],
    ["S0913a", "2026-09-13", "14:00", "", "연습시합", "5학년 연습시합", "거제 하청야구장 (하청스포츠타운)", "", "5", "5학년", "시작 1시간 전 개별집합", "유니폼바지 + 하계훈련복 상의", "상대팀 공지 없음\n6학년은 13:30 집합, 14:00 훈련 / 2·3·4학년 휴식"],
    ["S0918a", "2026-09-18", "", "", "휴식", "전체 휴식", "", "", "전체", "", "", "", ""],
    ["S0919a", "2026-09-19", "13:30", "", "훈련", "훈련", "학교", "", "전체", "", "13:30까지 학교 집합", "", ""],
    ["S0920a", "2026-09-20", "15:00", "", "대회", "영남리그 U12", "밀양", "울산 대현초", "5,6", "6학년 + 5학년 김민준·오승환", "시작 1시간 전 개별집합", "상의 아이보리", "참가선수 외 휴식\n숲 라이브 중계"],
    ["S0921a", "2026-09-21", "16:00", "19:00", "연습시합", "5학년 연습시합", "기장소프트구장", "감천초", "5", "5학년", "6교시(14:20) 후 출발", "상의 아이보리", "그 외 선수는 학교훈련\n독감으로 일부 선수 불참\n차량지원: 강태원 3, 손지완 3, 김재백 3, 류태영 3, 김승원 3"],
    ["S0924a", "2026-09-24", "", "", "휴식", "추석 연휴 휴식", "", "", "전체", "", "", "", ""],
    ["S0925a", "2026-09-25", "", "", "휴식", "추석 연휴 휴식", "", "", "전체", "", "", "", ""],
    ["S0926a", "2026-09-26", "", "", "휴식", "추석 연휴 휴식", "", "", "전체", "", "", "", ""],
    ["S0927a", "2026-09-27", "", "", "휴식", "추석 연휴 휴식", "", "", "전체", "", "", "", ""],
    ["S0929b", "2026-09-29", "", "16:00", "훈련", "훈련 (16:00 종료)", "학교", "", "전체", "", "", "", "관람하지 않는 선수는 16:00 훈련 후 귀가"],
    ["S0929a", "2026-09-29", "18:30", "", "행사", "야구경기 관람 (VS 키움)", "", "", "2,4,6", "6학년 13명 · 4학년 6명 · 2학년 1명 (아이 1 + 학부모 1)", "16:00 훈련 후 개별이동 (대중교통은 함께 이동 가능)", "유니폼바지 + 이너티 + 하계훈련복 상의, 풀오버(없으면 겉옷)", "티켓 40장 · 당일 아이들에게 2장씩 배부\n조금 늦게 입장해도 됨\n못 가시는 분은 개인톡으로 알려주세요"],
    ["S1003a", "2026-10-03", "13:00", "18:00", "연습시합", "연습시합", "기장리틀구장", "양정초", "5,6", "6학년 + 5학년 김민준", "시작 1시간 전 개별집합", "아이보리", ""],
    ["S1003b", "2026-10-03", "14:00", "", "훈련", "학교 훈련", "학교", "", "1,2,3,4,5", "연습시합 외 선수", "13:30 학교집합", "", ""],
    ["S1004b", "2026-10-04", "", "", "훈련", "학교 훈련", "학교", "", "1,5,6", "연습시합 외 선수", "", "", "시간 공지 없음"],
    ["S1004a", "2026-10-04", "08:00", "13:00", "연습시합", "저학년 연습시합", "기장리틀구장", "양정초", "2,3,4", "4·3·2학년", "시작 1시간 전 개별집합", "아이보리", ""],
    ["S1005a", "2026-10-05", "08:00", "10:30", "연습시합", "5학년 연습시합 (대체공휴일)", "기장리틀구장", "삼성초", "5", "5학년", "시작 1시간 전 개별집합", "빨강", ""],
    ["S1005c", "2026-10-05", "09:00", "11:00", "연습시합", "저학년 연습시합 (대체공휴일)", "감천초등학교", "", "2,3,4", "4·3·2학년", "시작 1시간 전 개별집합", "빨강", "상대팀 공지 없음"],
    ["S1005b", "2026-10-05", "10:30", "13:00", "연습시합", "6학년 연습시합 (대체공휴일)", "기장리틀구장", "삼성초", "6", "6학년", "시작 1시간 전 개별집합", "빨강", ""]
  ];
  return rows.map(function (r) { return r.concat([s]); });
}

function noticeSeedRows() {
  var s = nowKst();
  var n1 = "1\n선수반 훈련은 참관수업과 동일한 분위기로\n훈련중에는 감독님, 코치님 지시 없이는\n운동장 출입을 삼가해 주십시요.\n\n" +
    "2\n훈련중에는 부모님들간 대화를\n운동장까지 들리지 않게 주의 부탁드리며\n훈련중인 자녀의 이름을 큰소리로 부르거나\n지적하는 행동은 자제 부탁드립니다.\n\n" +
    "3\n학교 방문시 복장은 자율이며 상식에 벗어나지\n않을만큼의 복장으로 참관 부탁드립니다.\n\n" +
    "4\n부상 또는 병원진료 및 기타(가족여행등)으로\n훈련 불참시 총무님에게 미리 전달 부탁드립니다.\n\n" +
    "5\n감독님, 코치님께 학부모님 개별면담 신청시\n야구부 대표님에게 개별 신청 및 일정 조정후\n면담을 진행하시면 됩니다.\n\n" +
    "그외 궁금한 사항이 있으시면 학년별\n단톡방에서 자유롭게 소통하시면 됩니다.";
  var n2 = "1\n정해진 관람석 이외의 장소에서는\n경기 관람을 자제 부탁드립니다.\n선수 대기실, 대기타석은 경기장의 일부로\n시합중인 자녀를 코칭 및 지적, 촬영하는 행동은\n삼가해 주십시요.\n아이들이 시합에 집중할수 있도록 부모님들의\n많은 도움 부탁드립니다.\n\n" +
    "2\n응원시 상대팀에게 모욕적인 발언은 자제 부탁드리며\n고성방가에 가까운 함성을 지르거나\n경기장까지 부모님들간의 대화가 들리지\n않도록 부탁드립니다.\n\n" +
    "3\n흡연은 아이들이 보이지 않은 곳에서\n가급적 많이 태우지는 마시고 최대한 자제하며\n흡연해 주세요.";
  var n3 = "감독님, 코치님 계신 대연초 야구부 전체 공식 단톡방입니다.\n\n" +
    "훈련 및 대회일정, 감독님·코치님 지시사항 등 공지사항을 전달하는 단톡방으로 댓글 및 개인적인 글은 자제 부탁드립니다. (공감 체크는 하셔도 됩니다)\n\n" +
    "학년별 별도의 단톡방에서 문의사항 및 개인적인 의견 등 부모님들간 자유롭게 소통 부탁드립니다.\n\n" +
    "개인적인 사정(병원진료, 여행, 가족모임 등)으로 훈련 불참시 총무님께 개인톡으로 사전에 미리 전달 부탁드립니다.";
  var n4 = "연습시합에 처음 참관하시는 부모님들께서는 공지사항 숙지 부탁드리며,\n아이들이 있는 덕아웃 옆 관람석과 중앙상단의 관람석은 비워주시기 바랍니다.\n\n" +
    "대회 및 시합 참가시 학교에 모두 모여 인원점검 및 필요한 장비와 물품을 챙겨 함께 이동하는 것이 원칙입니다.\n\n많은 협조 감사드립니다.";
  var n5 = "1\n도핑방지교육 이수증 제출\n\n2\n성폭력 등 폭력 예방교육 이수증 제출\n\n각 사이트에 들어가셔서 교육 이수 및 이수증 제출 부탁드립니다.\n(안내 사진은 공식 공지방 9월 23일 게시물 참고)";
  return [
    ["N001", "Y", "필독", "대연초 야구부 공지사항", n1, "야구부", "2026-08-24 00:00", s],
    ["N002", "Y", "에티켓", "대회(연습) 경기 에티켓 (감독님 지시사항)", n2, "감독님", "2026-08-24 00:00", s],
    ["N003", "N", "안내", "공식 공지방 이용 안내", n3, "야구부", "2026-08-25 19:58", s],
    ["N004", "N", "에티켓", "연습시합 참관 안내", n4, "야구부", "2026-08-25 18:47", s],
    ["N005", "N", "안내", "도핑방지교육 · 폭력예방교육 이수증 제출", n5, "야구부", "2026-09-23 16:02", s],
    ["N006", "N", "안내", "투수코치님 후임 안내", "투수코치님 후임으로 부산고를 졸업하고 연세대에 재학 중인 분이 1월 19일(월)부터 3월 군 입대 전까지 지도하실 예정입니다.", "야구부", "2026-01-13 20:00", s],
    ["N007", "N", "안내", "출석인정조퇴 학생 런업 이수 안내", "2월 3일, 5일, 11일 2교시 마치고 출석인정조퇴하는 학생은 런업 6시간을 들어야 한다고 합니다.\n이스쿨에 런업이 있습니다.", "야구부", "2026-02-02 08:51", s],
    ["N008", "N", "안내", "학부모 학교 출입 안내", "감독님께서 당분간 대표·총무를 제외한 모든 학부모님들의 학교 출입을 금지하신다고 합니다.\n아이들 귀가를 위해 학교에 오시는 분들은 주차장에서 대기하여 데려가 주시기 바랍니다.", "감독님", "2026-02-02 20:06", s],
    ["N009", "N", "에티켓", "관람석 이용 안내", "공지방 상단의 공지사항을 다시 한번 숙지해 주시기 바랍니다.\n덕아웃 인근 관람석은 비워주시고, 방송을 제외한 부모님들께서는 홈플레이트 뒤쪽 관람석으로는 올라가지 마시기를 부탁드립니다.", "야구부", "2026-03-31 18:15", s],
    ["N010", "N", "안내", "하계훈련복 배부 및 참관 복장 안내", "1\n하계훈련복을 아이들 편으로 나눠드렸습니다. 6월 1일 훈련부터 입히시면 되며, 이너티 및 팔토시는 개인 자율입니다.\n\n2\n새로 들어온 박시후, 하승후, 이하준, 김민찬은 2주 후에 배부될 예정입니다. 그전까지는 상의는 지금 입고 있는 훈련복, 하의는 검은색 반바지 + 야구 양말로 준비해 주세요.\n\n3\n부모님들께서도 연습시합·대회 참관 시 반바지 정도는 입으셔도 되나 너무 짧거나 딱 붙는 옷, 슬리퍼, 크록스, 선글라스 등은 자제 부탁드리며, 학교 수업에 참관하시는 것과 같은 마음으로 참관해 주시면 감사하겠습니다.", "야구부", "2026-05-31 18:26", s],
    ["N011", "N", "안내", "사복 등교 안내", "6월 30일부터 사복을 입고 등교합니다.\n수업을 마치고 부실에 와서 훈련복으로 갈아입고 모자를 써야 합니다. 바지는 훈련복을 입어도 괜찮습니다.\n학부모님들께서는 아이들 복장을 꼭 챙겨주시기 바랍니다.", "야구부", "2026-06-29 19:36", s],
    ["N012", "N", "안내", "막내코치님 부임 안내", "막내코치 하실 분을 구하셔서 8월 18일부터 출근하십니다.\n첫날은 학교에서 연습시합 출발 시간에 모여 선수들을 인솔하여 가십니다.", "야구부", "2026-08-17 17:48", s],
    ["N013", "Y", "필독", "2026 차기 집행부 안내", "기존에는 학부모님들의 투표를 통해 집행부를 선출하였으나, 올해부터는 집행부 운영의 효율성과 원활한 소통을 위해 감독님께서 미리 고려해 두신 학부모님들과 협의하여 집행부를 결정하는 방식으로 진행하게 되었습니다.\n\n그 결과 대표에는 류태영 아버님, 총무에는 김승원 어머님께서 수고해 주시기로 하였습니다.\n\n차기 집행부는 한 달간의 인수인계를 거쳐 10월 1일부터 시작합니다.", "야구부", "2026-09-03 20:01", s],
    ["N014", "N", "안내", "추석 연휴 휴식 및 훈련 불참 연락", "추석 연휴인 9월 24일~27일은 전체 휴식입니다.\n\n개인적으로 훈련에 늦거나 불참하게 되면 꼭 총무님에게 말씀 부탁드립니다.", "야구부", "2026-09-08 19:24", s]
  ];
}

// ==========================================================
// 🎓 새 학년도 넘기기 (v2.9.0)
// ==========================================================
// - 1년에 한 번, 대표님 · 개발자가 관리 탭의 버튼으로 실행 (미리보기 → 확인 → 실행)
// - 실행하면: ① 스프레드시트 전체를 드라이브에 백업 복사
//            ② 선수정보: 6학년 → 「졸업생 명단」 탭으로 옮김(졸업연도 기록), 나머지 학년 +1 (감독 · 코치는 그대로)
//            ③ 비상연락망: 6학년 → 「졸업생 연락망」 탭으로 옮김(졸업연도 · 보관일 기록), 나머지 학년 +1
//            ④ 유니폼 신청: 지금 탭을 「유니폼 의류 신청정보 (학년도)」로 복사해 보관 → 비우고 새로 시작(또는 졸업생만 빼고 학년 +1)
// - 졸업생 연락망은 졸업한 해 3월 31일이 지나면 관리 탭에 「삭제」 알림 → 대표님이 눌러서 지움 (자동 삭제 안 함)
// - 졸업생 보호자 번호로는 로그인되지 않음 (연락망에서 빠지므로) — 안내 문구만 따로 보여 줌
var GRAD_ROSTER_SHEET = "졸업생 명단";
var GRAD_CONTACT_SHEET = "졸업생 연락망";
var ROSTER_GRADE_COLS = ["구분", "학년", "직책"];
var CONTACT_GRADE_COLS = ["학년", "구분"];
var ROSTER_NAME_COLS = ["이름", "선수이름", "성명", "지도자명"];
var CONTACT_NAME_COLS = ["선수이름", "이름", "선수명"];

// 학년 칸 값 → 1~6 (아니면 0). 5 · "5" · "5학년" · " 5 " 모두 5
function seasonGradeOf(v) {
  var m = String(v == null ? "" : v).trim().match(/^([1-6])\s*(학년)?$/);
  return m ? Number(m[1]) : 0;
}
function seasonIsStaff(v) { return /감독|코치|지도자/.test(String(v == null ? "" : v)); }

// 지금 날짜 기준 학년도: 3월 ~ 12월은 그 해, 1 · 2월은 지난해 (졸업은 다음 해 2월)
function seasonYears(d) {
  var y = Number(Utilities.formatDate(d, "Asia/Seoul", "yyyy")), m = Number(Utilities.formatDate(d, "Asia/Seoul", "M"));
  var season = m >= 3 ? y : y - 1;
  return { season: season, gradYear: season + 1 };
}
function seasonLast() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("SEASON_LAST") || "null"); } catch (e) { return null; }
}
// 명단 화면 제목에 쓰는 학년도 (넘기기를 했으면 다음 학년도)
function seasonCurrent() {
  var yrs = seasonYears(new Date()), last = seasonLast();
  return last && Number(last.season) + 1 > yrs.season ? Number(last.season) + 1 : yrs.season;
}

// 시트 값(머리줄 포함)에서 졸업할 줄 · 학년 올릴 줄 · 학년을 알 수 없는 줄 고르기 — 시트를 건드리지 않는 계산만
function seasonPlan(values, gradeCol, nameCol, noCol) {
  var out = { grads: [], bumps: [], odd: [], from: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var name = nameCol !== -1 ? String(row[nameCol] == null ? "" : row[nameCol]).trim() : "";
    if (!name && !row.join("").trim()) continue;   // 빈 줄
    var raw = row[gradeCol], g = seasonGradeOf(raw);
    var no = noCol !== -1 ? (parseInt(row[noCol], 10) || 0) : 0;
    if (g === 6) out.grads.push({ row: i, name: name, no: no });
    else if (g >= 1) { out.bumps.push({ row: i, to: g + 1, num: typeof raw === "number" }); out.from[g]++; }
    else if (!seasonIsStaff(raw)) out.odd.push({ row: i, name: name, grade: String(raw == null ? "" : raw).trim() });
  }
  return out;
}

function seasonSheetPlan(sh, gradeCols, nameCols) {
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  var H = values[0].map(function (h) { return String(h).trim(); });
  var gc = findColIdx(H, gradeCols);
  if (gc === -1) return { sheet: sh, values: values, H: H, error: "학년 칸을 찾을 수 없어요" };
  var plan = seasonPlan(values, gc, findColIdx(H, nameCols), findColIdx(H, ["배번", "등번호", "번호"]));
  plan.sheet = sh; plan.values = values; plan.H = H; plan.gc = gc;
  return plan;
}

function seasonUniformArchiveName(season) { return "유니폼 의류 신청정보 (" + season + ")"; }

// 미리보기 (아무것도 바꾸지 않음)
function seasonPreviewData(ss) {
  var yrs = seasonYears(new Date()), last = seasonLast();
  var R = seasonSheetPlan(getRosterSheet(ss), ROSTER_GRADE_COLS, ROSTER_NAME_COLS);
  var C = seasonSheetPlan(getContactSheet(ss), CONTACT_GRADE_COLS, CONTACT_NAME_COLS);
  var U = seasonSheetPlan(getUniformSheet(ss), CONTACT_GRADE_COLS, CONTACT_NAME_COLS);
  var brief = function (p) {
    if (!p) return null;
    if (p.error) return { error: p.error };
    return { grads: p.grads.map(function (x) { return { name: x.name, no: x.no }; }), from: p.from, bumps: p.bumps.length,
             odd: p.odd.map(function (x) { return { name: x.name, grade: x.grade }; }) };
  };
  var rNames = R && R.grads ? R.grads.map(function (x) { return x.name; }) : [];
  var cNames = C && C.grads ? C.grads.map(function (x) { return x.name; }) : [];
  var uRows = U && U.values ? U.values.slice(1).filter(function (r) { return r.join("").trim(); }).length : 0;
  return {
    result: "success", season: yrs.season, gradYear: yrs.gradYear, last: last,
    already: !!(last && Number(last.season) === yrs.season),
    roster: brief(R), contacts: brief(C),
    uniform: { rows: uRows, grads: U && U.grads ? U.grads.length : 0, archiveName: seasonUniformArchiveName(yrs.season),
               archiveExists: !!ss.getSheetByName(seasonUniformArchiveName(yrs.season)) },
    onlyRoster: rNames.filter(function (n) { return cNames.indexOf(n) === -1; }),     // 명단엔 6학년인데 연락망엔 없음
    onlyContacts: cNames.filter(function (n) { return rNames.indexOf(n) === -1; })    // 연락망엔 6학년인데 명단엔 없음
  };
}

// 보관 탭 준비: 없으면 원본 머리줄 + 추가 칸으로 만들고, 추가 칸(졸업연도 등)의 위치를 돌려줌
function seasonArchiveSheet(ss, name, srcH, extras) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, ss.getSheets().length);
    sh.getRange(1, 1, 1, srcH.length + extras.length).setValues([srcH.concat(extras)]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  var width = Math.max(1, sh.getLastColumn());
  var H = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  var cols = extras.map(function (x) {
    var c = findColIdx(H, x);
    if (c === -1 || c < srcH.length) {   // 원본 칸 수가 늘어 겹치면 맨 뒤에 새로 만듦
      c = Math.max(H.length, srcH.length);
      sh.getRange(1, c + 1).setValue(x).setFontWeight("bold");
      H[c] = x;
    }
    return c;
  });
  return { sh: sh, cols: cols };
}

// 졸업할 줄은 보관 탭으로 복사(서식 · 메모 포함) → 나머지 학년 +1 → 졸업할 줄 삭제(아래부터)
function seasonApplySheet(ss, plan, archiveName, extraVals) {
  var sh = plan.sheet, width = plan.H.length;
  if (plan.grads.length) {
    var extras = extraVals.map(function (e) { return e[0]; });
    var A = seasonArchiveSheet(ss, archiveName, plan.H, extras);
    var dest = A.sh.getLastRow() + 1;
    plan.grads.forEach(function (g, k) {
      sh.getRange(g.row + 1, 1, 1, width).copyTo(A.sh.getRange(dest + k, 1));
      A.cols.forEach(function (c, j) { A.sh.getRange(dest + k, c + 1).setNumberFormat("@").setValue(String(extraVals[j][1])); });
    });
  }
  plan.bumps.forEach(function (b) { sh.getRange(b.row + 1, plan.gc + 1).setValue(b.num ? b.to : String(b.to)); });
  plan.grads.slice().sort(function (a, b) { return b.row - a.row; }).forEach(function (g) { safeDeleteRows(sh, g.row + 1, 1); });
  return plan.grads.length;
}

function seasonRollover(ss, session, p) {
  var yrs = seasonYears(new Date()), last = seasonLast();
  if (last && Number(last.season) === yrs.season && String(p.force) !== "1") {
    return { result: "error", code: "done", message: yrs.season + "학년도는 이미 넘겼어요 (" + last.at + ")" };
  }
  var R = seasonSheetPlan(getRosterSheet(ss), ROSTER_GRADE_COLS, ROSTER_NAME_COLS);
  var C = seasonSheetPlan(getContactSheet(ss), CONTACT_GRADE_COLS, CONTACT_NAME_COLS);
  var U = seasonSheetPlan(getUniformSheet(ss), CONTACT_GRADE_COLS, CONTACT_NAME_COLS);
  if (!R || R.error) return { result: "error", message: "선수정보 시트: " + (R ? R.error : "없음") };
  if (!C || C.error) return { result: "error", message: "비상연락망 시트: " + (C ? C.error : "없음") };
  // 미리보기와 숫자가 다르면(그사이 누가 시트를 고쳤으면) 멈춤
  if (String(p.expectR) !== String(R.grads.length) || String(p.expectC) !== String(C.grads.length)) {
    return { result: "error", code: "changed", message: "미리보기 뒤에 시트가 바뀌었어요. 미리보기를 다시 열어 확인해 주세요." };
  }

  // ① 백업 (원본과 같은 폴더)
  var stamp = nowKst();
  var file = DriveApp.getFileById(ss.getId());
  var parents = file.getParents();
  var folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var backupName = ss.getName() + " — 백업 (" + yrs.season + "학년도 넘기기 전 " + stamp + ")";
  var backup = file.makeCopy(backupName, folder);

  // ② 선수정보 ③ 비상연락망
  var nR = seasonApplySheet(ss, R, GRAD_ROSTER_SHEET, [["졸업연도", yrs.gradYear]]);
  var nC = seasonApplySheet(ss, C, GRAD_CONTACT_SHEET, [["졸업연도", yrs.gradYear], ["보관일", stamp.slice(0, 10)]]);

  // ④ 유니폼 신청
  var uMsg = "";
  if (U && !U.error) {
    var aName = seasonUniformArchiveName(yrs.season);
    if (!ss.getSheetByName(aName)) {
      var copy = U.sheet.copyTo(ss);
      copy.setName(aName);
      ss.setActiveSheet(copy); ss.moveActiveSheet(ss.getSheets().length);
      uMsg = "보관 「" + aName + "」";
    } else uMsg = "보관 탭은 이미 있어서 그대로";
    if (String(p.clearUniform) === "1") {
      var last2 = U.sheet.getLastRow(), w2 = Math.max(1, U.sheet.getLastColumn());
      if (last2 >= 2) { var clr = U.sheet.getRange(2, 1, last2 - 1, w2); clr.clearContent(); clr.clearNote(); }   // 줄은 남기고 내용만 지움 (서식 · 선택 목록 유지)
      uMsg += " · 비우고 새로 시작";
    } else {
      U.bumps.forEach(function (b) { U.sheet.getRange(b.row + 1, U.gc + 1).setValue(b.num ? b.to : String(b.to)); });
      U.grads.slice().sort(function (a, b) { return b.row - a.row; }).forEach(function (g) { safeDeleteRows(U.sheet, g.row + 1, 1); });
      uMsg += " · 졸업생 " + U.grads.length + "명 빼고 학년 +1";
    }
  }

  var rec = { season: yrs.season, gradYear: yrs.gradYear, at: stamp, by: roleName(session.role),
              grads: nR, contacts: nC, backupId: backup.getId(), backupName: backupName };
  PropertiesService.getScriptProperties().setProperty("SEASON_LAST", JSON.stringify(rec));
  return { result: "success", season: yrs.season, gradYear: yrs.gradYear, grads: nR, contacts: nC,
           bumped: R.bumps.length, uniform: uMsg, backupName: backupName, backupUrl: backup.getUrl() };
}

// 졸업생 연락망: 졸업한 해 3월 31일이 지난 줄
function seasonGradContactsInfo(ss, del) {
  var sh = ss.getSheetByName(GRAD_CONTACT_SHEET);
  if (!sh || sh.getLastRow() < 2) return { total: 0, due: 0, dueAfter: "" };
  var v = sh.getDataRange().getValues(), H = v[0].map(function (h) { return String(h).trim(); });
  var yc = findColIdx(H, ["졸업연도"]);
  var today = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
  var total = 0, dueRows = [], next = "";
  for (var i = 1; i < v.length; i++) {
    if (!v[i].join("").trim()) continue;
    total++;
    var y = yc !== -1 ? parseInt(v[i][yc], 10) : 0;
    var limit = y ? (y + "-03-31") : "";
    if (limit && today > limit) dueRows.push(i + 1);
    else if (limit && (!next || limit < next)) next = limit;
  }
  if (del) dueRows.sort(function (a, b) { return b - a; }).forEach(function (r) { safeDeleteRows(sh, r, 1); });
  return { total: total - (del ? dueRows.length : 0), due: del ? 0 : dueRows.length, deleted: del ? dueRows.length : 0, dueAfter: next };
}

function seasonStatus(ss) {
  return { result: "success", season: seasonCurrent(), now: seasonYears(new Date()), last: seasonLast(), gradContacts: seasonGradContactsInfo(ss, false) };
}

// 🎓 졸업생 명단 (OB) — 화면용: 이름 · 배번 · 포지션 · 투타 · 졸업연도 · 사진 (생년월일 · 키 · 몸무게는 안 내려보냄)
function readGradRaw(ss) {   // ⚡ v2.13.0: 졸업생 시트 읽은 결과도 캐시
  return cachedData("C_GRADS", function () {
    var sh = ss.getSheetByName(GRAD_ROSTER_SHEET);
    if (!sh || sh.getLastRow() < 2) return [];
    var v = sh.getDataRange().getValues(), H = v[0].map(function (h) { return String(h).trim(); });
    var c = { no: findColIdx(H, ["배번", "등번호", "번호"]), name: findColIdx(H, ROSTER_NAME_COLS), pos: findColIdx(H, ["포지션", "역할"]),
              bt: findColIdx(H, ["투타", "투/타"]), visible: findColIdx(H, ["노출여부"]), photo: findColIdx(H, ["사진공개", "사진노출"]),
              link: findColIdx(H, ["사진링크", "드라이브사진", "사진URL"]), year: findColIdx(H, ["졸업연도"]) };
    var g = function (row, idx) { return idx !== -1 && idx < row.length ? String(row[idx] == null ? "" : row[idx]).trim() : ""; };
    var off = function (val) { val = String(val || "").toUpperCase().trim(); return val === "OFF" || val === "비공개"; };
    var out = [];
    for (var i = 1; i < v.length; i++) {
      var name = g(v[i], c.name); if (!name) continue;
      var no = parseInt(g(v[i], c.no), 10);
      out.push({ no: (!isNaN(no) && no > 0) ? no : 0, name: name, pos: g(v[i], c.pos) || "-", bt: g(v[i], c.bt) || "-",
                 gradYear: g(v[i], c.year), visible: g(v[i], c.visible).toUpperCase() !== "OFF", hidePhoto: off(g(v[i], c.photo)), photoLink: g(v[i], c.link) });
    }
    return out;
  });
}
function buildGradPayload(ss, session) {
  var role = session ? session.role : "guest";
  if (role === "guest") return [];   // 🔒 v2.25.0: 1922 일반 열람자에게는 졸업생 명단을 보내지 않음
  var canPhoto = (role === "sub" || role === "general" || role === "super" || role === "dev");
  var raw = readGradRaw(ss), out = [];
  for (var i = 0; i < raw.length; i++) {
    var r = raw[i];
    if (!r.visible && !(role === "super" || role === "dev")) continue;
    out.push({ no: r.no, name: r.name, pos: r.pos, bt: r.bt,
               gradYear: r.gradYear, visible: r.visible, hidePhoto: r.hidePhoto, photoLink: (r.hidePhoto && !canPhoto) ? "" : r.photoLink });
  }
  return out;
}

// 졸업생 보호자 번호인지 (로그인 안내용)
function isGradParentPhone(ss, digits) {
  try {
    var sh = ss.getSheetByName(GRAD_CONTACT_SHEET);
    if (!sh || sh.getLastRow() < 2) return false;
    var v = sh.getDataRange().getValues(), H = v[0].map(function (h) { return String(h).trim(); });
    var cols = [findColIdx(H, ["아버님", "아버지"]), findColIdx(H, ["어머님", "어머니"]), findColIdx(H, ["기타연락처", "기타", "추가연락처"]), findColIdx(H, ["학생연락처", "선수연락처"])];
    for (var i = 1; i < v.length; i++) for (var j = 0; j < cols.length; j++) {
      if (cols[j] === -1) continue;
      var d = String(v[i][cols[j]] || "").replace(/[^0-9]/g, "");
      if (d && d.length >= 8 && d.slice(-digits.length) === digits) return true;
    }
  } catch (e) {}
  return false;
}
// 졸업생 명단에 있는 선수인지 (최초 등록 안내용)
function isGradPlayer(ss, no, name) {
  try {
    var sh = ss.getSheetByName(GRAD_ROSTER_SHEET);
    if (!sh || sh.getLastRow() < 2) return false;
    var v = sh.getDataRange().getValues(), H = v[0];
    return findPlayerRow(v, findColIdx(H, ["배번", "등번호", "번호"]), findColIdx(H, ROSTER_NAME_COLS), no, name) !== -1;
  } catch (e) { return false; }
}

// 편집기에서 직접 돌려 보는 미리보기 (시트를 바꾸지 않음) — 실행 로그에 결과가 나옴
function testSeasonPreview() {
  var pv = seasonPreviewData(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log(JSON.stringify(pv));
}
