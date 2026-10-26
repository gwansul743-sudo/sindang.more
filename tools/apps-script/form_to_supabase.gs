/**
 * 구글폼 응답 → Supabase (sindang.more 지도의 '시민 인터뷰 주민')
 *
 * 붙이는 곳: 응답 스프레드시트 '다산로44길(신당오길) 상인 설문(응답)' → 확장 프로그램 → Apps Script
 * 스크립트 속성(⚙ 프로젝트 설정 → 스크립트 속성)에 직접 넣는 것 — 저장소·채팅에 적지 말 것:
 *   SUPABASE_URL  https://xxxx.supabase.co   (.env 의 VITE_SUPABASE_URL 과 같은 값)
 *   SUPABASE_KEY  Supabase → Project Settings → API Keys → Secret key (sb_secret_… 또는 옛 service_role)
 *   AUTO_PUBLISH  true(기본) = 들어오자마자 지도에 뜸 / false = 관리자가 Supabase 에서 characters.status 를 approved 로 바꿔야 뜸
 * 트리거(⏰ 트리거 → 트리거 추가): 함수 onFormSubmit · 이벤트 소스 '스프레드시트에서' · 유형 '양식 제출 시'
 *
 * 하는 일: 새 응답 한 줄에서 **공개 지도에 써도 되는 열만** 골라(아래 KEEP) interviews 에 넣고, characters 한 줄(status approved)을 붙인다.
 *   대본은 앱이 이 답으로 만든다(src/features/villagers/formScript.ts — 규칙을 고치면 이미 들어온 응답도 새 규칙으로 다시 그려진다).
 *   상호(SQ3)·연락처·상인회·재개발·건물·임대료·추천 가게(문17) 등은 보내지 않는다 — interviews 는 공개 읽기 표라서.
 * 지도에서 내리기: Supabase → Table Editor → characters → 그 줄의 status 를 hidden 으로. 몇 초 안에 전시 화면에서 사라진다.
 * 놓친 줄 다시 보내기: 함수 목록에서 sendMissing 실행(이미 보낸 줄은 건너뛴다).
 */

/* 보낼 열(열 이름이 이 중 하나로 시작하거나 맞으면). 같은 문항이 폼 수정으로 두 벌이어도 둘 다 보낸다 — 앱이 값이 있는 뒤쪽을 쓴다 */
var KEEP = [/^Timestamp$/, /^타임스탬프$/, /^SQ1\./, /^SQ2\./, /^문1\./, /^문8\./, /^문8-1\./, /^문9\./, /^문9-1\./, /^문11-1\./, /^문30\./, /동의하시는지/];
/* 파트 A 에서도 빼는 문장(개인 입장이 공개 지도에 드러남) */
var DROP = /상인회|재개발|건물 소유|주인이 여럿/;

function props_() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('SUPABASE_URL') || '').replace(/\/+$/, ''), key = p.getProperty('SUPABASE_KEY') || '';
  if (!url || !key) throw new Error('스크립트 속성 SUPABASE_URL · SUPABASE_KEY 를 먼저 넣어 주세요');
  return { url: url, key: key, auto: (p.getProperty('AUTO_PUBLISH') || 'true') !== 'false', store: p };
}
function headers_(key) {   /* 새 키(sb_secret_…)는 apikey 머리말만, 옛 JWT(service_role)는 Authorization 도 */
  var h = { apikey: key, Prefer: 'return=representation' };
  if (key.indexOf('sb_') !== 0) h.Authorization = 'Bearer ' + key;
  return h;
}
function post_(cfg, table, body) {
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + table, { method: 'post', contentType: 'application/json', headers: headers_(cfg.key), payload: JSON.stringify(body), muteHttpExceptions: true });
  var code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) throw new Error(table + ' 저장 실패 ' + code + ': ' + text);
  return JSON.parse(text)[0];
}
function cell_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX") : String(v == null ? '' : v).trim(); }

/* 시트의 한 줄 → 공개해도 되는 [열 이름, 값] 목록 */
function pairsOf_(sheet, row) {
  var lastCol = sheet.getLastColumn();
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0], vals = sheet.getRange(row, 1, 1, lastCol).getValues()[0], out = [];
  for (var i = 0; i < head.length; i++) {
    var h = String(head[i]).trim(), v = cell_(vals[i]);
    if (!h || !v) continue;
    if (!KEEP.some(function (re) { return re.test(h); })) continue;
    if (/동의하시는지/.test(h) && DROP.test(h)) continue;
    out.push([h, v]);
  }
  return out;
}

function send_(sheet, row) {
  var cfg = props_(), pairs = pairsOf_(sheet, row);
  if (pairs.length < 2) return 'empty';
  /* 이미 보낸 줄인지: 줄 번호 + 타임스탬프로 기억한다(시험 줄을 지운 자리에 새 응답이 들어와도 건너뛰지 않게) */
  var ts = (pairs.filter(function (p) { return /^(Timestamp|타임스탬프)$/.test(p[0]); })[0] || [, ''])[1];
  var sentKey = 'sent:' + sheet.getSheetId() + ':' + row + ':' + ts;
  if (cfg.store.getProperty(sentKey)) return 'skip';
  var interview = post_(cfg, 'interviews', { source: 'form', answers: { v: 1, row: row, pairs: pairs } });
  var sq2 = (pairs.filter(function (p) { return /^SQ2\./.test(p[0]); }).pop() || [, ''])[1];
  post_(cfg, 'characters', { nickname: (sq2 || '설문') + ' 사장님', interview_id: interview.id, status: cfg.auto ? 'approved' : 'pending' });
  cfg.store.setProperty(sentKey, interview.id);
  return 'ok';
}

/* 트리거: 양식 제출 시 */
function onFormSubmit(e) {
  var sheet = e.range.getSheet(), row = e.range.getRow();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);   /* 거의 동시에 두 건이 와도 한 줄씩 */
  try { Logger.log('row ' + row + ': ' + send_(sheet, row)); } finally { lock.releaseLock(); }
}

/* 손으로 실행: 응답 시트에서 아직 안 보낸 줄을 모두 보낸다(트리거를 늦게 달았거나 실패했을 때) */
function sendMissing() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets().filter(function (s) { return s.getFormUrl(); })[0] || SpreadsheetApp.getActiveSheet();
  for (var r = 2; r <= sheet.getLastRow(); r++) { try { Logger.log('row ' + r + ': ' + send_(sheet, r)); } catch (err) { Logger.log('row ' + r + ' 실패: ' + err); } }
}

/* 손으로 실행: 연결 확인(아무것도 쓰지 않음) */
function checkConnection() {
  var cfg = props_();
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/characters?select=id&limit=1', { headers: headers_(cfg.key), muteHttpExceptions: true });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

/* 손으로 실행: 시험 응답 한 줄을 시트 맨 아래에 넣고 바로 보낸다(폼 제출 없이 지도까지 확인). 시험이 끝나면 그 줄을 지우고 Supabase 에서 hidden 으로 */
function addTestRow() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets().filter(function (s) { return s.getFormUrl(); })[0] || SpreadsheetApp.getActiveSheet();
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var want = [
    [/^Timestamp$|^타임스탬프$/, new Date()],
    [/^SQ1\./, '12'], [/^SQ2\./, '한식·분식·일반 음식점'], [/^SQ3\./, '(시험) 오길분식'],
    [/\[낮 시간대에는 즐길 거리가 부족하다\]$/, '매우 그렇다'],
    [/\[우리 골목까지는 방문객의 발길이 잘 닿지 않는다\]$/, '매우 그렇다'],
    [/\[신당은 지금 변화의 과도기에 있다\]$/, '그렇다'],
    [/^문1\./, 'SNS·유튜브, 지인 소개'], [/^문8\./, '있다'], [/^문8-1\./, '옛날식 떡볶이를 연탄불에 데워요'],
    [/^문9\./, '있다'], [/^문9-1\./, '어머니가 하시던 가게를 제가 물려받았어요'],
    [/^문11-1\./, '40~50대'], [/^문30\./, '그렇다']
  ];
  var row = head.map(function () { return ''; });
  want.forEach(function (w) { for (var i = 0; i < head.length; i++) if (w[0].test(String(head[i]).trim())) { row[i] = w[1]; break; } });
  sheet.appendRow(row);
  var r = sheet.getLastRow();
  Logger.log('row ' + r + ': ' + send_(sheet, r));
}
