# ZEP 설치 안내

## 공식 API 검증 (2026-10-13)

아래 공식 문서를 기준으로 코드를 작성했습니다. 실제 ZEP 스페이스에 설치하여 실행한 결과는 별도 검증 항목입니다.

- [ScriptPlayer Field](https://docs-kr.zep.us/zep-script-api/zepscriptapi/scriptplayer/field): `player.name`은 닉네임, `player.id`는 플레이어 ID입니다. **이 ID의 기기 간 안정성과 신원 보증을 가정하지 않습니다.**
- [ScriptPlayer Methods](https://docs-kr.zep.us/zep-script-api/zepscriptapi/scriptplayer/methods): `openWebLink(url, popup)`, `showEmbed(url, align, width, height, hasBackdrop)`.
- [ScriptApp Events](https://docs-kr.zep.us/zep-script-api/zepscriptapi/scriptapp/event-listeners): `App.onTriggerObject.Add(function(player, layerID, x, y, key){})`는 F 상호작용 이벤트입니다.
- [ScriptApp Methods](https://docs-kr.zep.us/zep-script-api/zepscriptapi/scriptapp/methods): `App.httpPostJson(url, headers, body, function(res){})`의 응답은 문자열이므로 `JSON.parse`합니다. `httpPost`는 폼 방식이어서 JSON API와 혼용하지 않습니다.
- [개발 가이드](https://docs-kr.zep.us/creator/dev-guide): Normal App은 특정 맵에 적용합니다. **동일 코드의 Normal App을 중앙 광장 포함 다섯 맵에 각각 적용**하는 구성을 사용합니다. 설치 한 번으로 모든 맵 이벤트를 받는다고 가정하지 않습니다.

## 1. Firebase 배포와 수업 준비

README에 따라 운영 웹앱을 배포합니다. `/teacher`에서 수업과 실명 명단을 만듭니다. 동명이인은 같은 이름으로 입력해도 됩니다. 발급된 **내부 학생 ID와 개인 코드**를 구분해 각각 전달합니다. 코드 원문은 첫 발급 화면에만 표시됩니다. 분실하면 교사 화면에서 재발급합니다.

## 2. 앱 설정

`zep/main.js`를 복사하여 ZEP Script 앱 소스에 넣습니다. `CONFIG`에서 다음 네 항목을 채웁니다.

1. `apiUrl`: `https://YOUR_PROJECT_ID.web.app/api/zep/launch`
2. `sessionId`: 교사 대시보드에 표시한 수업 ID
3. `bridgeSecret`: Firebase Secret Manager에 설정한 동일한 비밀 문자열
4. `useEmbed`: **false** 권장. 새 탭이 표준 운영 경로입니다.

공개 저장소에 수정한 비밀 포함 파일을 커밋하지 마세요. 학생 위젯에 비밀키를 넣지 마세요. 앱 소스를 다른 사용자에게 공개하지 말고 교사 운영용으로 보관합니다. 스크립트 비밀이 안전하게 보호된다는 별도 플랫폼 보증은 확인되지 않았으므로 회전 가능한 연결 키로 다룹니다.

## 3. Script 등록·배포

ZEP Script 개발 가이드의 앱 배포 화면에서 코드를 등록하고 앱 유형을 **Normal App**으로 선택합니다. 새 버전을 배포한 뒤 관리자 권한으로 각 맵의 **설정 → 맵 설정 → 노말 앱 추가**에서 연결합니다. UI 명칭은 ZEP 버전에 따라 달라질 수 있습니다. 공통 코드를 사용하되 다섯 맵 모두 적용되어 있는지 확인합니다.

## 4. 맵 에디터 오브젝트

맵 에디터에서 제출·확인 오브젝트의 상호작용을 **ZEP Script와 상호작용**으로 설정합니다. 공식 이벤트 문서의 오브젝트 타입은 `INTERACTION_WITH_ZEPSCRIPTS (21)`입니다. 일반 URL 링크 오브젝트로 만들면 서버 토큰 발급이 동작하지 않습니다.

| 맵 | 오브젝트 키 | 실행 화면 |
|---|---|---|
| 감자밭 | submit_potato | 감자 |
| 산속 나무터 | submit_branch | 삭정이 |
| 동백꽃 언덕 | submit_flower | 동백꽃 |
| 닭싸움 마당 | submit_rooster | 두 수탉 |
| 중앙 광장 | check_progress | 나의 완료 현황 |
| 중앙 광장 | open_group | 나의 모둠 활동 |

키 철자와 `CONFIG.keys`가 같아야 합니다. 여러 맵에 같은 키를 사용해도 해당 화면으로 연결됩니다. 실제 탐구 단서는 교사가 감자 바구니, 삭정이·지게, 노란 동백꽃, 수탉·장독 등 장면 오브젝트에 작성합니다. 이 프로젝트는 ZEP 맵을 자동 제작하거나 작품 전체 텍스트를 배포하지 않습니다.

## 5. 학생 연결 확인

1. 교사가 개인 탐구를 시작합니다.
2. 학생은 ZEP 닉네임을 등록한 실명과 정확히 맞춥니다.
3. 제출 오브젝트에서 F키를 누릅니다.
4. ZEP 서버 스크립트가 연결 키와 이름·플레이어 ID를 API로 보냅니다.
5. 서버가 90초 일회용 토큰을 만들고 URL **fragment**에 넣어 반환합니다. 실명·응답·연결 키는 URL에 없습니다.
6. 최초 연결 때만 개별 확인 코드를 입력합니다. 이름 입력란은 없습니다.
7. 이후 같은 ID·이름으로 다시 열면 코드를 생략하고 기존 응답을 확인합니다.
8. 닉네임 변경, 새 기기에서 ID 변경, 동명이인 오연결은 교사 명단의 **연결 초기화·코드 재발급**으로 해결합니다. 이때 이전 학생 웹 세션은 무효화됩니다.

## 6. 임베드와 브라우저 제한

API는 임베드 기능을 제공하지만, 외부 페이지 CSP·iframe·서드파티 쿠키 정책으로 인증 유지가 실패할 수 있습니다. 기본은 새 탭이며 쿠키는 HttpOnly/Secure/SameSite=Lax입니다. `showEmbed`를 켜도 쿠키 정책을 약화하지 않습니다. 새 창 선택 시 **새 토큰**을 발급해 이전 임베드가 사용한 토큰을 재사용하지 않습니다. 팝업 차단이면 브라우저에서 ZEP의 팝업을 허용하거나 교사가 새 탭 운영을 확인하세요.

## 7. 실제 수업 전 체크

- 최소 두 실제 ZEP 플레이어로 서로 다른 응답을 저장하고 재접속합니다.
- 동명이인에게 서로 다른 코드가 연결되는지 확인합니다.
- 이름이 빈 경우, 명단 밖 이름, 변경된 닉네임이 차단되는지 확인합니다.
- 토큰을 다시 열거나 90초 후 열었을 때 재발급 안내가 나오는지 확인합니다.
- 개인 탐구 중 타인 응답이 보이지 않는지 확인합니다.
- 공개 전 모둠 접근 차단 → 공개와 활동 시작 후 본인 모둠만 표시되는지 확인합니다.
- 다른 모둠 ID를 API에 넣었을 때 403인지 확인합니다.
- 학교 PC·태블릿 브라우저에서 팝업·쿠키·한글 입력을 확인합니다.

ZEP 공식 문서에서 외부 서버가 독립 검증할 수 있는 사용자 서명 토큰은 확인하지 못했습니다. 스크립트가 읽은 ID와 닉네임을 ZEP 공인 신원 인증으로 표현하지 않습니다.
