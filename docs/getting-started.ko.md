# 한국어 시작 가이드

harness-lab은 Claude·Codex가 프로젝트의 스펙, ADR(아키텍처 결정 기록), 골든 원칙을 읽고 실제 명령 결과로 작업을 검증하도록 돕는 로컬 CLI입니다. 프로젝트마다 규칙과 검증 명령을 조정하는 도구이며, 모든 기술 스택의 정답을 자동 생성하지는 않습니다.

## 1. 설치

Git, Node.js 22 이상, npm이 필요합니다. 아래 명령은 macOS/Linux 셸 기준입니다.

```bash
git clone https://github.com/bon-on/harness-lab.git
cd harness-lab
npm ci
npm run build
node dist/index.js --help
```

npm 배포 패키지나 전역 설치 없이 이 체크아웃에서 실행합니다. 모델 API 키도 필요하지 않습니다.

## 2. 기존 프로젝트에 적용

harness-lab 디렉터리에서 실행합니다. 대상 경로는 실제 프로젝트 경로로 바꾸세요.

```bash
PROJECT_REPO="/absolute/path/to/your-project"
node dist/index.js detect "$PROJECT_REPO" --format md
node dist/index.js init repo-kit --output "$PROJECT_REPO"
node dist/index.js audit "$PROJECT_REPO" --format text
```

기존 파일은 덮어쓰지 않고 보존 목록을 출력합니다. 이미 `AGENTS.md` 또는 `CLAUDE.md`가 있다면, 그 파일에서 `harness/workflow.md`를 읽도록 직접 연결해야 합니다.

생성 직후 유지보수 리뷰 경고가 나오는 것은 정상입니다. 파일을 만들었다고 프로젝트 검토까지 끝난 것은 아닙니다.

## 3. 프로젝트에 맞게 바꾸기

| 파일 | 작성할 내용 |
| --- | --- |
| `harness/manifest.json` | 정책 모드, 문서 경로, 승인한 기술 스택 팩 |
| `harness/rules/golden-rules.md` | 장기간 유지할 핵심 개발 원칙 |
| `harness/rules/constraints.md` | 기술·보안·운영 제약과 프로젝트 규칙 |
| `harness/specs/*.md` | 해결할 문제, 범위, 검증 가능한 완료 조건 |
| `harness/adrs/*.md` | 설계 선택의 배경·결정·영향 |
| `harness/contracts/*.md` | 작업 단위의 완료 조건과 실제 증거 경로 |
| `harness/verify.json` | 실행할 검증 명령과 소스 범위; 직접 추가 |

`suggestedPacks`는 추천이며 자동으로 정책이 되지 않습니다. 검토한 팩만 `approvedPacks`에 넣고, 관련 지침을 공통 규칙에 반영하세요. 현재 Next.js, React, Kotlin Spring, Kotlin Ktor 팩을 제공합니다. 나머지 스택은 규칙과 검증 명령을 직접 작성할 수 있습니다.

예제 스펙·ADR·계약을 실제 내용으로 수정하거나 `harness/templates/`에서 새 문서를 만드세요. 문서 ID와 서로 연결하는 frontmatter를 맞추고, 예시 보고서를 실제 검증 증거로 교체합니다.

## 4. Claude·Codex에 작업 요청

대상 프로젝트에서 에이전트를 실행하고 다음처럼 요청하세요. 전역 스킬 설치는 필수가 아닙니다.

```text
harness/specs/my-feature.md를 구현해줘.
manifest, 연결된 ADR·계약, 골든 원칙·제약부터 읽어줘.
완료 조건별 검증 방법을 정하고 구현 후 실제 검증 명령을 실행해줘.
참조 문서, 적용 팩, 제약, 검증 증거, 남은 문제를 보고해줘.
필수 검증이 실패하면 완료했다고 말하지 마.
```

두 진입 문서는 같은 `harness/workflow.md`로 연결됩니다. 판단 우선순위는 스펙 → ADR → 제약 → 골든 원칙 → 일반 맥락입니다. 구조 검사 통과만으로 실제 모델의 지침 준수가 보장되지는 않습니다.

### 요구사항에서 멀티에이전트 개발까지

[개발 스킬](../skills/harness-develop/SKILL.md)을 읽도록 요청하거나 실행 환경의 스킬 디렉터리에 설치한 뒤 다음처럼 요청하세요.

```text
harness-develop로 다음 요구사항을 구현해줘: <요구사항>
프로젝트 하네스를 읽고, 완료 조건별 검증 방법과 의존성을 정해줘.
독립적인 작업은 멀티에이전트에 나누고 통합 후 실제 검증까지 수행해줘.
```

코디네이터가 요구사항 분석과 통합 검증을 담당하고, 워커마다 쓰기 가능한 파일을 구분합니다. 에이전트 도구가 없거나 작업을 나누기 어려우면 이유를 밝히고 같은 검증 절차를 단일 에이전트로 수행합니다. Git이 없는 프로젝트도 사용할 수 있습니다. 스킬은 호스트가 제공하는 에이전트 도구를 사용하며 별도 서버를 설치하지 않습니다.

## 5. 실제 명령 검증

대상 프로젝트에 `harness/verify.json`을 만듭니다. 명령과 입력 목록은 **실제로 존재하는 프로젝트 파일**에 맞게 바꾸세요.

```json
{
  "command": ["npm", "test"],
  "inputs": ["src", "test", "harness", "package.json", "package-lock.json"],
  "timeoutMs": 120000
}
```

harness-lab 디렉터리에서 실행합니다.

```bash
node dist/index.js verify "$PROJECT_REPO" "$PROJECT_REPO/harness/verify.json" \
  --output "$PROJECT_REPO/out/evidence/latest"
node dist/index.js check-evidence "$PROJECT_REPO/out/evidence/latest/checks.json" "$PROJECT_REPO"
node dist/index.js audit "$PROJECT_REPO" --format text
```

검증 명령은 대상 프로젝트에서 실행됩니다. 실행 실패·타임아웃·실행 중 소스 변경은 실패 처리하며, 증거 재검사는 로그 손상·소스 불일치·7일 초과 증거도 탐지합니다. 계약의 `evidence_files`에 `out/evidence/latest/checks.json`을 넣으면 audit도 실행 증거를 확인합니다. 일반 Markdown 보고서는 존재 여부만 확인합니다.

`inputs`에 비밀값, 의존성, 빌드 산출물, 증거 디렉터리를 넣지 마세요. 검증 설정은 사용자 권한으로 명령을 실행하므로 신뢰할 수 있는 설정만 사용하고 로그를 공유하기 전에 내용을 확인하세요. 대상 프로젝트의 `.gitignore`에 `out/`을 추가하세요. 0 종료 코드는 테스트 자체가 충분하다는 보장은 아닙니다.

## 6. 주기적으로 가볍게 유지

30일마다, 반복 실패나 스택 변경 이후에 중복 지침·오래된 결정·사용하지 않는 팩·문서 크기를 검토하세요. 결정 이력은 보존하고 반복 실패에는 회귀 검증을 추가합니다. 검토와 검증을 마친 뒤 `harness/maintenance.json`의 `reviewedAt`에 ISO 시각, `summary`에 실제 검토 내용을 기록합니다.

기본 `warn-block-critical`은 심각한 문제만 실패 처리합니다. `strict-block`은 경고도 실패 처리하고, `advisory`는 문제를 보고만 합니다. 잘못된 manifest는 어느 모드든 실패합니다.

CLI가 자동 스케줄러를 설치하지는 않습니다. 이 저장소의 [GitHub Actions](../.github/workflows/ci.yml)는 테스트와 감사를 주기적으로 실행하므로 대상 프로젝트에 맞게 응용할 수 있습니다.

## 더 보기

- [전체 README](../README.md)
- [명령어와 문제 해결](commands.md)
- [기여 가이드](../CONTRIBUTING.md)
- [선택적 harness-apply 스킬](../skills/harness-apply/SKILL.md)

`run`, `maturity`, `report`는 기존 mock 평가 기능입니다. 실제 Claude·Codex 실행 성능을 측정한 결과와 구분하세요.
