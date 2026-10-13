# 구조와 API

## 데이터 흐름

```text
ZEP Normal App → POST /api/zep/launch (공유 비밀 헤더)
  → 90초 일회용 fragment 토큰 → 웹앱 POST /api/redeem (+ 최초 개인 코드)
  → HttpOnly 학생 세션 → 본인 API / 본인 모둠 API
교사 Firebase Auth → Bearer ID 토큰 → UID 허용 목록 + 수업 소유자 API
API → Firestore 트랜잭션 또는 로컬 단일 프로세스 파일 저장
```

학생에게 Firestore 읽기 권한을 주지 않습니다. 교사 예시 답안은 `functions/src/content.ts`에서만 import하며 서버 교사 응답에서만 반환합니다.

## Firestore 모델

- `sessions/{id}`: owner, title, phase, createdAt, updatedAt, students[], responses{}, groups[], groupsPublished, groupResults{}, audit[]
- `students`: 수업 내부 배열. id, name, codeHash, zepId, bindingVersion, lastActiveAt, excluded
- `responses[studentId][item]`: q1, q2, nickname, zepId, firstSubmittedAt, updatedAt, submitted, version, requestId
- `groups`: id, number, members[] (내부 학생 ID), recorder
- `groupResults[groupId]`: q1, q2, submittedBy, firstSubmittedAt, updatedAt, version, requestId
- `launches/{sha256}`: sessionId, name, zepId, route, expiresAt, used, attempts, expireOn
- `auth/{sha256}`: role, uid, sessionId, studentId, bindingVersion, expiresAt, expireOn
- `entries/{sha256}`: sessionId, studentId, bindingVersion, route (자연물 하나/현황/모둠), expiresAt, expireOn. 신원 쿠키와 함께 요청하는 탭별 입장 권한입니다.
- `limits/{sha256}`: count, expiresAt, expireOn

실명은 표시용이며 관계는 내부 ID를 사용합니다. 로컬 데이터베이스는 동일 키를 JSON으로 저장합니다. 한 수업 문서에 묶은 이유는 15명 규모에서 마감·편성·결론과 응답 변경을 같은 트랜잭션으로 검증하기 위해서입니다. 30명과 답변당 1,500자에서도 800KB 상한을 넘으면 저장을 거부하며 무조건 성공으로 처리하지 않습니다. 제출 크기가 커지는 대규모 서비스에는 응답 하위 컬렉션과 권한 상태 트랜잭션을 분리해야 합니다.

## 단계

PREPARING → INDIVIDUAL_OPEN → INDIVIDUAL_CLOSED → GROUP_OPEN → COMPLETED.

공개 전 INDIVIDUAL_CLOSED → INDIVIDUAL_OPEN 재개 가능. 공개 후에는 재편성 초기화를 통해 INDIVIDUAL_CLOSED로 되돌리고 공동 결론을 제거한 뒤 재개합니다. COMPLETED는 읽기 전용이며 교사 초기화·삭제만 별도로 가능합니다.

## 주요 API

| 경로 | 허용 대상 | 동작 |
|---|---|---|
| GET /api/config | 공개 | 로컬 여부만 |
| POST /api/zep/launch | ZEP 연결 비밀 | 토큰 발급 |
| POST /api/redeem | 유효 토큰 | 코드·플레이어 연결·쿠키 발급 |
| GET /api/student | 학생 | 본인 정보·응답만 |
| POST /api/student/responses/:item | 학생, 개인 진행 | 본인 답변 갱신 |
| POST /api/student/heartbeat | 학생 | 최근 활동 시각 |
| GET /api/student/group | 학생, 공개·모둠 진행/종료 | 본인 모둠·응답·결론 |
| POST /api/student/group/result | 기록 담당자, 모둠 진행 | 공동 결론 갱신 |
| GET/POST /api/teacher/sessions | 허용 교사 | 소유 수업 목록·생성 |
| GET /api/teacher/sessions/:sid | 소유 교사 | 전체 명단·응답·예시 답안 |
| POST /api/teacher/sessions/:sid/:operation | 소유 교사 | 명단·단계·편성·공개·연결 등 |
| GET /api/teacher/sessions/:sid/export | 소유 교사 | CSV |
| DELETE /api/teacher/sessions/:sid | 소유 교사, 수업 ID 확인 | 수업 완전 삭제 |

학생 변경 API에서 요청 본문의 학생/수업/모둠 ID를 권한으로 믿지 않습니다. 편성 수정과 공개는 `revision=updatedAt`을 검사해 오래된 교사 화면에서 확정하는 오류를 막습니다. 학생 응답은 `version`, `requestId`를 전달합니다.

학생 API는 `X-Zep-Entry`의 해시로 탭별 입장 권한을 읽고 신원 쿠키와 같은 학생·수업·연결 버전인지 확인합니다. 다른 자연물 API와 모둠 API는 해당 입장 범위가 아니면 차단합니다. 현황 범위는 답변 원문 없이 완료 자연물 목록만 반환합니다. 여러 탭은 각자 ZEP에서 발급된 범위를 유지합니다.

## 비용·동시성

15명 동시 저장은 파일 DB 통합 테스트를 제공합니다. Firestore에서는 한 수업 문서에 요청이 몰리면 재시도와 지연이 발생할 수 있습니다. 서버 실패는 클라이언트 재시도로 복구하며 실제 15명 부하·운영 Firestore 지연은 배포 후 추가 검증 대상입니다. 현황은 5초 폴링, 최근 활동은 60초 heartbeat입니다. Firestore 실시간 listener를 열지 않아 학생별 DB 권한을 부여하지 않아도 됩니다.
