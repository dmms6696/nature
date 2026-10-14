# 「동백꽃」 자연물 탐구

중학교 1학년 45분 수업용 ZEP 연동 개인·모둠 학습 웹앱입니다. 학생 이름을 다시 입력하지 않고 ZEP 닉네임을 표시하며, 최초 1회 개인 코드로 학생 명단과 연결합니다.

## 포함된 기능

- 네 자연물 두 문항 작성·수정, 0/4~4/4 진행률, 서버 저장 성공 확인, 기기 임시 작성 보존
- 운영 학생은 ZEP 해당 오브젝트에서 연 자연물 하나만 작성합니다. 현황에서는 완료 여부만 확인하며 주소·API를 바꿔 다른 자연물을 작성할 수 없습니다.
- 교사 인증, 수업·명단 관리, 제출 현황 5초 갱신, 학생 응답 조회, 탐구 마감·재개
- Fisher–Yates 균등 편성, 제외 학생 설정, 이동·기록 담당자 수정, 저장·확정·공개 분리
- 본인 모둠만 응답 비교, 담당자 단일 공동 결론 제출, 버전 충돌 검사
- 공동 결론 비교·복사·전체 화면 발표·인쇄, CSV/JSON 내보내기, 초기화·삭제
- 15명 가상 학생과 응답 60개의 독립 로컬 테스트 모드
- ZEP Normal App 코드, Firebase Function, Firestore 규칙, 운영 안내

## 기술 구성

React 19, TypeScript, Vite, Tailwind CSS 4, Express, Firebase Authentication, Cloud Firestore, Cloud Functions (2세대), Firebase Hosting.

운영 저장은 Firestore이며 로컬은 `.local/database.json`에 원자적 파일 교체로 저장합니다. 두 데이터베이스는 연결되지 않습니다. 로컬 API는 `127.0.0.1`에서만 실행됩니다. Cloud Function은 `local:false`를 고정하며 가상 학생 선택과 개발 로그인을 허용하지 않습니다.

15명 규모의 간편한 운영을 위해 수업 한 건과 학생·응답·모둠·결론을 `sessions/{id}` 문서 하나에 묶고 트랜잭션으로 갱신합니다. 질문당 1,500자, 최대 45명, 800KB 서버 상한을 적용합니다. 응답은 내부 학생 ID × 자연물 ID로 갱신되어 중복 행을 만들지 않습니다. 대규모 확장에는 하위 컬렉션 분리가 필요합니다. 자세한 설계는 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고하세요.

## 로컬 실행 — Firebase 계정 없이 사용 가능

Node.js **22**를 설치하세요. 개발 검증 호스트가 Node 24인 경우에도 Firebase 운영 런타임은 22입니다. 터미널에서 이 폴더로 이동한 뒤 순서대로 실행합니다.

```sh
npm ci
npm --prefix functions ci
npm run seed
npm run dev
```

Windows PowerShell에서 실행 정책 오류가 나면 `npm` 대신 `npm.cmd`를 사용하세요.

1. `http://127.0.0.1:5173`를 엽니다.
2. 상단 가상 학생 선택으로 개인 화면을 확인합니다.
3. `/teacher`에서 **로컬 테스트 교사 로그인**을 누릅니다.
4. `동백꽃 · 1학년 자연 탐구 (가상 데이터)` 수업을 선택합니다.
5. 이미 60개 가상 응답이 있으므로 마감 → 편성 → 공개 → 모둠 활동 시작으로 전체 흐름을 확인합니다.
6. 새 빈 수업도 만들어 명단과 첫 제출을 시험할 수 있습니다.

seed는 기존 `demo` 수업을 덮어쓰지 않습니다. 다시 만들려면 교사 화면에서 demo를 완전히 삭제한 다음 재실행합니다. seed 실행 중에는 로컬 API를 중지하세요. 파일 저장은 단일 프로세스용입니다.

## 검증 명령

```sh
npm test
npm run build
```

자동 테스트는 실제 HTTP API와 임시 파일 데이터베이스를 사용합니다. 동시 제출, 수정·재시도, 토큰, 권한, 모둠·단계·내보내기 등을 검증합니다. 실제 ZEP와 Firebase 연결 검증은 별도이며 [TEST_REPORT.md](TEST_REPORT.md)에 수행 범위를 기록합니다.

## Firebase 설치 및 배포

1. Firebase Console에서 학교 운영용 새 프로젝트를 만듭니다. 실제 학생 자료를 공개 저장소에 올리지 않습니다.
2. Authentication → 로그인 방법 → **이메일/비밀번호**를 활성화하고 교사 계정을 만듭니다. 사용자 탭에서 교사의 **UID**를 복사합니다. GitHub 계정과 Firebase 교사 로그인은 별개입니다.
3. Firestore 데이터베이스를 만들고 가능하면 서울 `asia-northeast3`를 선택합니다. 규칙은 프로젝트의 `firestore.rules`로 배포하여 클라이언트 직접 접근을 모두 막습니다.
4. Cloud Functions 배포에는 **Blaze 요금제와 결제 연결**이 필요합니다. 소규모 수업도 무조건 무료라고 보장할 수 없습니다. 예산 알림을 설정하세요. 예산 알림은 자동 과금 중단 장치가 아닙니다. 기본 `maxInstances:2`, `minInstances:0`을 사용합니다. [Firebase 공식 시작 안내](https://firebase.google.com/docs/functions/get-started), [런타임 안내](https://firebase.google.com/docs/functions/manage-functions).
5. 프로젝트 설정 → 웹 앱 추가에서 Firebase 공개 설정을 얻습니다. `.env.example`을 복사해 루트 `.env.local`로 만들고 네 `VITE_FIREBASE_*` 항목을 채웁니다. 이 설정은 공개 식별 정보이며 관리자 비밀키가 아닙니다.
6. `functions/.env.example`을 `functions/.env.YOUR_PROJECT_ID`로 복사합니다. `TEACHER_UIDS`에 교사 UID를 쉼표로 나열하고 `PUBLIC_ORIGIN=https://YOUR_PROJECT_ID.web.app`를 설정합니다. 끝에 `/`를 붙이지 않습니다.
7. 아래 명령으로 CLI를 설치·로그인하고 프로젝트를 선택합니다. 이미 제공된 설정 파일을 덮어쓰는 `firebase init`은 필요하지 않습니다.

```sh
npm install -g firebase-tools
firebase login
firebase use --add
firebase functions:secrets:set ZEP_BRIDGE_SECRET
```

8. ZEP 연결 비밀은 임의의 **32자 이상** 문자열로 만듭니다. 비밀 입력 프롬프트에 입력하고 같은 값을 교사만 볼 수 있는 ZEP 스크립트 설정에 넣습니다. 비밀은 GitHub, Vite 환경변수, 위젯 HTML, 학생 URL에 넣지 않습니다.
9. 다시 빌드하고 배포합니다.

```sh
npm run build
firebase deploy --only firestore:rules,functions,hosting
```

10. Firestore TTL 설정에서 `auth`, `launches`, `entries`, `limits` 컬렉션 그룹의 `expireOn` 필드를 TTL로 지정합니다. 만료 접근은 서버가 즉시 차단하며 실제 삭제는 TTL 지연 후 이루어집니다. TTL 비용도 과금에 포함될 수 있습니다.
11. Hosting URL의 `/teacher`에서 Firebase 교사 계정으로 로그인합니다. 수업 생성·명단 등록 후 ZEP 설정을 마칩니다.
12. 교사와 학생 테스트 계정으로 최소 두 학생의 제출·타인 접근 차단·모둠 공개를 실제 배포 환경에서 재검증합니다. Firebase Emulator 테스트를 원하면 `firebase emulators:start --only firestore,functions,hosting,auth`를 사용할 수 있지만 교사 UID·환경 설정을 별도로 맞춰야 합니다. 이 명령의 성공을 자동 테스트 결과로 간주하지 않습니다.

## ZEP 설치 및 수업 운영

- 설치: [ZEP_SETUP.md](ZEP_SETUP.md)
- 45분 운영: [TEACHER_GUIDE.md](TEACHER_GUIDE.md)
- 인증 한계·개인정보: [SECURITY_NOTES.md](SECURITY_NOTES.md)
- API와 모델: [ARCHITECTURE.md](ARCHITECTURE.md)

## 프로젝트 구조

```text
src/                   학생·교사 React 화면, 공개 질문, API 클라이언트
functions/src/         인증·권한·수업 API, 트랜잭션 저장소, 교사 예시 답안
zep/main.js            공식 API를 사용하는 ZEP Normal App
scripts/seed.ts        로컬 가상 수업 생성
tests/                 도메인·HTTP 통합 자동 테스트
firestore.rules        클라이언트 직접 접근 차단
firebase.json          Hosting → Function 프록시, 보안 헤더
.env.example           공개 Firebase 웹 설정 예시
functions/.env.example 운영 교사 UID·주소 설정 예시
```

공개 질문은 `src/content.ts`, 교사 예시 답안은 `functions/src/content.ts`, 오브젝트 키는 `zep/main.js`의 `CONFIG.keys`에서 수정합니다. 운영 Firebase 설정을 루트에 완료하기 전에는 배포하지 마세요. 이 저장소 자체는 학생 정보를 담지 않습니다.
