# harness-lab

**한국어** · [English](README.en.md)

**Claude Code가 읽고, 따르고, 검증할 수 있는 프로젝트별 작업 절차를 만들고, Codex도 같은 규칙을 따르게 합니다.**

harness-lab은 저장소에 기능 스펙, 아키텍처 결정 기록(ADR), 골든 룰, 독립 코드 리뷰어, 검증 증거를 추가하는 로컬 TypeScript CLI입니다. Claude Code를 주 에이전트로, Codex를 같은 저장소 workflow를 따르는 호환 에이전트로 지원합니다. 결정은 Git에 남기고, 완료 조건은 명시하고, 하네스를 정기적으로 점검해 지침을 작고 쓸모 있게 유지합니다.

![harness-lab init이 추가하는 파일과 에이전트 작업 흐름](docs/images/harness-structure.ko.svg)

[한국어 시작 가이드](docs/getting-started.ko.md) · [명령어 레퍼런스(영문)](docs/commands.md) · [기여 안내(영문)](CONTRIBUTING.md)

> 초기 단계의 도구입니다. 로컬 CLI 동작은 테스트했지만, 실제 Claude·Codex가 지침을 얼마나 지키는지는 아직 측정하지 않았습니다. 모델 API 키는 필요 없습니다. 이 도구가 에이전트의 모든 명령을 가로채지는 않습니다.

## 적용하면 달라지는 점

| 하네스 없이 | harness-lab 적용 후 |
| --- | --- |
| 세션마다 프로젝트 규칙과 금지 사항을 다시 설명합니다. | `CLAUDE.md`가 `harness/workflow.md`와 `harness/project.md`를 import해서 세션 시작부터 규칙이 로드됩니다. |
| 무엇을 만들지가 대화 속에만 있습니다. | 기능 스펙의 Scope로 작업할 스펙을 고르고, 완료 조건마다 검증 방법을 연결합니다. |
| "완료했습니다"가 테스트를 실제로 돌렸는지와 무관합니다. | `verify`가 실제 명령의 종료 코드, 소스 해시, 로그 해시를 남기고, `check-evidence`는 오래되거나 실행 후 소스가 바뀐 증거를 거부합니다. |
| 코드를 쓴 맥락에서 그대로 자기 리뷰를 합니다. | 읽기 전용 `code-reviewer` 에이전트가 스펙·ADR 기준으로 독립 리뷰합니다. Critical·High 지적은 고친 뒤 다시 리뷰받습니다. |
| 설계 결정의 이유가 대화 기록과 함께 사라집니다. | ADR에 대안과 결과를 남기고 Git으로 이력을 보존합니다. |
| 운영 스크립트나 실서비스 호출을 테스트처럼 돌릴 수 있습니다. | `constraints.md`와 `project.md`에 금지 명령과 안전 경계를 적어 두면 구현과 리뷰 양쪽에서 확인합니다. |
| Claude와 Codex에 지침을 따로 관리합니다. | `CLAUDE.md`와 `AGENTS.md`가 같은 workflow를 공유합니다. |
| 지침이 점점 늘어나고, 템플릿 개선은 손으로 옮겨야 합니다. | audit이 30일 점검 기록을 확인하고, `update`가 수정하지 않은 관리 파일만 갱신합니다. 백업과 rollback도 지원합니다. |

**실제 적용에서 나온 결과.** 기존 개인 프로젝트 두 곳(Node 서비스와 Python 도구)에 적용했을 때, 스펙의 빈 완료 조건을 테스트로 채우는 과정에서 다음을 발견했습니다.

- 상태 조회 명령이 인자를 빠뜨려 `ReferenceError`로 실패하던 버그
- 단위 테스트 하나가 가짜 대신 실제 운영 CLI를 호출하던 문제

독립 리뷰에서는 오류가 연달아 날 때 진단 코드가 사이클을 100초 넘게 늘릴 수 있다는 점이 지적되어, 반영 전에 고쳤습니다. 이 사례는 도구가 작업을 어떻게 드러내는지 보여 줄 뿐, 효과를 측정한 벤치마크는 아닙니다.

**어디서 시작하나요?**

| 상황 | 시작 명령 |
| --- | --- |
| 하네스가 없는 프로젝트 | `harness-lab init --dry-run` → `harness-lab init` |
| 직접 만들었거나 harness-apply로 만든 하네스가 있는 프로젝트 | `harness-lab adopt` → `harness-lab adopt --apply` |
| 이미 harness-lab으로 초기화한 프로젝트 | `harness-lab update` → `harness-lab update --apply` |

어느 경우든 이어서 `harness-lab doctor`가 다음 할 일을 알려 줍니다. `adopt`는 아직 릴리스에 없으니 [설치](#설치)의 미배포 안내를 참고하세요.

## 설치

요구 사항: Node.js 22 이상, npm. 아래 명령은 POSIX 셸(macOS/Linux) 기준입니다.

빌드된 **v0.2.0** 릴리스를 설치합니다. 소스 체크아웃이나 빌드는 필요 없습니다.

```bash
npm install --global 'https://github.com/bon-on/harness-lab/releases/download/v0.2.0/bon-on-harness-lab-0.2.0.tgz'
harness-lab --version
harness-lab --help
```

패키지는 **npm 레지스트리가 아니라** GitHub Releases로 배포합니다. `npx @bon-on/harness-lab`만으로는 설치되지 않습니다. 프로젝트 로컬 설치나 기여 환경 구성은 [설치와 업데이트(영문)](docs/installation-updates.md)를 참고하세요.

> **미배포 변경 사항.** v0.2.0은 workflow를 import하지 않고 링크만 하는 `CLAUDE.md`를 만들며, 아래에서 설명하는 `harness/project.md`, `adopt` 명령, `code-reviewer` 에이전트, `harness-review` 스킬, Scope 기반 스펙 선택이 들어 있지 않습니다. 다음 릴리스 전까지는 소스 체크아웃에서 사용하세요. [이 저장소 개발과 검증](#이-저장소-개발과-검증)처럼 빌드한 뒤, 새 프로젝트에서 `node <checkout>/bin/harness-lab.mjs init`을 실행합니다. v0.2.0으로 이미 초기화한 프로젝트는 `init`이 기존 파일을 유지하므로, 대신 `update`로 미리 본 뒤 `update --apply`를 실행하세요.

## 프로젝트에 적용하기

기존 프로젝트 디렉터리에서 실행합니다.

```bash
harness-lab init --dry-run
harness-lab init
harness-lab doctor
harness-lab audit . --format text
```

초기화는 없는 파일만 만들고 **기존 파일은 보존합니다**. 프로젝트에 이미 `AGENTS.md`나 `CLAUDE.md`가 있다면 `harness/workflow.md` 참조를 직접 추가하세요. `CLAUDE.md`에는 Claude Code가 자동으로 불러오도록 `@harness/workflow.md` import를 넣습니다. 건너뛴 지침은 자동으로 병합되지 않습니다. 디렉터리를 옮기지 않고 `init`이나 `doctor`에 프로젝트 경로를 넘겨도 됩니다.

새 kit에서 점검(maintenance review)이 대기 상태로 나오는 것은 정상입니다. 파일 생성은 프로젝트 점검을 끝낸 것이 아닙니다. 생성된 스펙과 보고서는 예시일 뿐, 애플리케이션이 동작한다는 증거가 아닙니다.

실제 작업 전에 할 일:

1. `harness/rules/golden-rules.md`와 `constraints.md`를 프로젝트에 맞게 고칩니다.
2. `harness/manifest.json`의 `suggestedPacks`를 검토합니다. 승인한 ID는 `approvedPacks`로 옮기고 그 지침을 규칙에 반영합니다. 추천은 자동으로 정책이 되지 않습니다.
3. 생성된 스펙, ADR, 계약을 고치거나 `harness/templates/`로 새로 만듭니다. ID와 상호 링크를 맞추고 예시 증거를 교체합니다.
4. 프로젝트의 실제 검증 명령으로 `harness/verify.json`을 만듭니다(아래 참고).
5. 에이전트 진입 파일, 하네스 정책, `.harness-lab/state.json`을 커밋합니다. `out/`, `.harness-lab/backups/`, `.harness-lab/lock`은 프로젝트 `.gitignore`에 추가합니다.

내장 추천은 Next.js, React, Kotlin Spring, Kotlin Ktor를 다룹니다. Python/FastAPI와 의존성 없는 Node ESM/테스트 러너도 감지하지만 정책 팩을 자동으로 추천하지는 않습니다. 다른 스택은 제약과 검증을 직접 작성하면 됩니다.

## 안전하게 업데이트하기

CLI 업그레이드와 프로젝트 템플릿 업데이트는 별개입니다. 원하는 버전의 릴리스 tarball을 설치하면 실행 파일만 바뀌고 프로젝트 파일은 그대로입니다. 그다음 대상 프로젝트에서 실행합니다.

```bash
harness-lab update              # 읽기 전용 미리보기
harness-lab update --apply      # 적용 가능한 변경을 반영하고 로컬 백업 저장
harness-lab rollback <transaction-id>          # 읽기 전용 미리보기
harness-lab rollback <transaction-id> --apply  # 적용 후 바뀐 것이 없으면 복원
```

업데이트는 관리하지 않는 기존 파일과 로컬 수정·삭제를 보존합니다. 도구가 만들었거나 명시적으로 편입(adopt)한 파일만 추적합니다. 프로젝트 고유 지침은 `harness/project.md`(와 규칙, 스펙, ADR)에 두세요. 그래야 도구가 관리하는 진입점, workflow, 템플릿, 리뷰어가 템플릿과 같은 상태로 유지되어 업데이트할 수 있습니다.

하네스를 직접 작성했거나 harness-apply로 적용한 프로젝트는 아직 추적되지 않습니다. 명시적으로 편입하세요.

```bash
harness-lab adopt              # 읽기 전용 미리보기: 파일별로 adopted, create, unmanaged 표시
harness-lab adopt --apply      # 템플릿과 같은 파일을 추적하고, 없는 파일은 생성
```

`adopt`는 기존 파일을 수정하지 않으며 샘플 스펙·ADR·계약·보고서를 추가하지 않습니다. 템플릿과 다른 파일은 관리 대상에서 빠집니다. 그 안의 프로젝트 고유 내용을 `harness/project.md`로 옮기고 템플릿 내용으로 되돌린 뒤 `adopt`를 다시 실행하세요. 편입도 업데이트처럼 rollback할 수 있습니다. 자세한 내용은 [업데이트 소유권, 백업, 복구(영문)](docs/installation-updates.md)를 참고하세요.

## Claude Code에서 사용하기

대상 프로젝트를 Claude Code로 엽니다. `CLAUDE.md`가 `@harness/workflow.md`와 `@harness/project.md`를 import하므로 공용 workflow와 프로젝트 고유 지침이 세션 시작 시 자동으로 로드됩니다. `.claude/agents/code-reviewer.md`는 독립 리뷰어를 추가합니다. 전역 스킬 설치는 필요 없습니다.

요청 예시:

```text
harness/specs/my-feature.md를 구현해줘.
manifest, 연결된 ADR·계약, 공용 규칙부터 읽어줘.
완료 조건별 검증 방법을 정하고 구현 후 실제 검증을 실행해줘.
참조 문서, 적용 팩, 제약, 증거, 남은 문제를 보고해줘.
필수 검증이 실패하면 완료했다고 말하지 마.
```

판단 우선순위는 **기능 스펙 → 관련 ADR → 제약 → 골든 룰 → 일반 맥락**입니다. 결정이 충돌하면 조용히 덮어쓰지 말고 드러내야 합니다. 에이전트는 Scope가 요청을 포함하는 스펙을 고르고, `maintained` 스펙은 회귀 기준으로 계속 사용합니다. 도입용 [harness-apply 스킬](skills/harness-apply/SKILL.md)과 [레퍼런스](skills/harness-apply/references/repo-kit.md)가 선택 사항으로 포함되어 있습니다.

## 요구사항에서 멀티에이전트 개발까지

정책 설정만이 아니라 구현까지 원할 때는 선택 사항인 [harness-develop 스킬](skills/harness-develop/SKILL.md)을 사용합니다. 요구사항을 분석하고, 완료 조건마다 검증 방법을 연결하고, 독립 작업을 파일 소유권을 나눠 배정하고, 코디네이터가 최종 결과를 통합·검증하도록 요구합니다.

```text
harness-develop로 이 프로젝트에 <요구사항>을 구현해줘.
먼저 프로젝트 하네스를 읽고, 독립 작업은 가능한 에이전트에 나눠줘.
완료 조건 충족 현황과 통합 검증 증거를 보고해줘.
```

소유권 규칙과 검증된 범위는 [workflow와 도입 경험(영문)](docs/multi-agent-development.md)을 참고하세요.

스킬은 호스트에 있는 에이전트 도구를 사용합니다. 스스로 에이전트를 띄우거나 새 서비스를 요구하지 않습니다. 위임할 수 없거나 작업이 강하게 얽혀 있으면 단일 에이전트로 진행하는 이유를 밝힙니다. Git이 없는 프로젝트는 명시적인 쓰기 소유권과 필요 시 격리된 복사본을 사용하며, worktree를 전제하지 않습니다.

CLI 패키지에는 스킬 파일이 포함되어 있지만, CLI를 설치하거나 업그레이드해도 에이전트 호스트에 스킬이 설치되지는 않습니다. 설치 없이 써 보려면 도구 체크아웃의 `SKILL.md`를 읽으라고 에이전트에 요청하세요. Claude Code에 설치하려면 스킬 디렉터리를 `~/.claude/skills/`(모든 프로젝트) 또는 `.claude/skills/`(한 프로젝트)에 복사하고, Codex는 Codex 스킬 디렉터리를 사용합니다. 여러 에이전트가 공유할 때는 관리하는 버전을 하나로 유지하세요. `harness-apply`는 도입, `harness-develop`은 구현, `harness-review`는 독립 리뷰를 담당합니다. 어느 것도 운영 환경 작업 권한을 주지 않습니다.

## 변경 사항 독립 리뷰

`init`은 Opus로 동작하는 읽기 전용 Claude 리뷰어 `.claude/agents/code-reviewer.md`를 만듭니다. [harness-review 스킬](skills/harness-review/SKILL.md)의 절차대로 관련 스펙·ADR·규칙을 읽고, 변경 파일 전체와 호출부·테스트를 확인한 뒤, 검증된 지적 사항을 Critical~Low 등급으로 보고합니다. 각 지적에는 파일:줄, 실패 시나리오, 수정 제안이 붙고, 완료 조건 충족표와 판정이 함께 나옵니다. Codex나 다른 호스트에서는 별도 에이전트에서 스킬을 실행하세요.

공용 workflow와 harness-develop은 구현 완료를 선언하기 전에 이 리뷰를 필수로 요구합니다. Critical·High 지적은 고친 뒤 다시 리뷰받거나 근거를 남겨야 합니다. 직접 요청할 수도 있습니다.

```text
code-reviewer 에이전트로 작업 트리 변경을 harness/specs/my-feature.md 기준으로 리뷰해줘.
```

에이전트 파일은 스킬에서 생성됩니다. `update`는 수정하지 않은 생성본은 새 버전으로 바꾸고, 직접 만들었거나 수정한 파일은 보존합니다. `.claude`나 `.claude/agents`가 심볼릭 링크이면 이 파일만 건너뜁니다. Bash 권한이 있으므로 읽기 전용 동작은 도구 제한이 아니라 지침 준수에 달려 있습니다.

## Codex 호환

Codex는 `AGENTS.md`를 읽고, 이 파일은 같은 `harness/workflow.md`를 가리킵니다. 규칙, 스펙, 검증 명령은 공유하며 다음만 다릅니다.

- Codex에는 import 문법이 없어서 `AGENTS.md`는 workflow를 import하지 않고 참조만 합니다.
- Codex는 `.claude/agents/`를 읽지 않습니다. 필수 리뷰는 별도 Codex 에이전트에서 [harness-review 스킬](skills/harness-review/SKILL.md)을 실행하세요.
- 스킬을 이름으로 쓰려면 Codex의 스킬 디렉터리에 설치하세요.

## 실제 명령으로 검증하기

**대상 프로젝트**에 다음 파일을 만들고, 명령과 입력은 실제로 있는 파일에 맞게 고칩니다.

```json
{
  "command": ["npm", "test"],
  "inputs": ["src", "test", "harness", "package.json", "package-lock.json"],
  "timeoutMs": 120000
}
```

`harness/verify.json`으로 저장하고, 대상 프로젝트에서 실행합니다.

```bash
harness-lab verify
harness-lab check-evidence out/evidence/latest/checks.json .
harness-lab audit . --format text
```

명령은 대상 저장소에서 실행됩니다. 기본적으로 `verify`는 대상 프로젝트의 `harness/verify.json`을 사용하고 결과를 그 프로젝트의 `out/evidence/latest`에 씁니다. config와 `--output` 경로를 명시하면 현재 셸의 작업 디렉터리 기준으로 해석합니다. `verify`는 종료 코드, 시각, 소스 해시, stdout/stderr 해시를 기록하고, 명령 오류·시간 초과·실행 중 소스 변경이 있으면 실패합니다. `check-evidence`는 7일 넘은 증거, 누락된 로그, 해시 불일치도 거부합니다.

audit이 증거 묶음을 검사하게 하려면 관련 계약의 `evidence_files`에 `out/evidence/latest/checks.json`을 추가하세요. 일반 Markdown 보고서는 존재 여부만 확인합니다. 프로젝트 `.gitignore`에 `out/`을 추가하세요. 이 저장소는 이미 로컬 출력을 무시합니다.

신뢰하는 검증 설정만 실행하세요. 명령은 셸 없이 사용자 권한으로 실행됩니다. 비밀값과 생성된 출력은 `inputs`에서 빼고, 로그는 공유 전에 확인하세요. 시간 제한은 직접 실행한 프로세스에만 적용되고 하위 프로세스 전체에는 적용되지 않습니다. 해시는 서명이 아니며, 종료 코드 0이 요청을 의미 있게 검증했다는 뜻은 아닙니다.

## 하네스를 작게 유지하기

**30일**마다, 그리고 같은 실패가 반복되거나 스택이 바뀌면 점검합니다.

- 중복된 지침을 합치고 에이전트 진입점은 짧게 유지합니다.
- 오래된 스펙과 ADR을 검토하되 결정 이력은 보존합니다.
- 쓰지 않는 팩 지침은 이유를 남기고 제거합니다.
- 지침 크기를 비교하고, 반복되는 실패에는 회귀 검사를 추가합니다.
- 변경 후 검증과 audit을 실행합니다.

실제로 점검한 뒤 `harness/maintenance.json`의 `reviewedAt`에 ISO 시각을, `summary`에 내용을 기록합니다. 새 kit은 일부러 비워 둡니다. 기록이 없거나 잘못됐거나 30일이 지나면 audit이 경고합니다.

| 정책 모드 | audit 동작 |
| --- | --- |
| `warn-block-critical` (기본값) | 경고는 보고만 하고, critical은 실패 처리 |
| `strict-block` | 경고와 critical 모두 실패 처리 |
| `advisory` | 보고만 하고 차단하지 않음 |

manifest가 없거나 형식이 잘못되면 모든 모드에서 실패합니다. audit은 실행할 때만 동작하며 CLI가 스케줄러를 설치하지는 않습니다. 이 저장소에는 [CI와 주간 audit](.github/workflows/ci.yml)이 있으니, 다른 저장소는 자체 테스트 명령과 증거 범위에 맞게 조정하세요.

## 저장소 구성

| 경로 | 용도 |
| --- | --- |
| `src/` | CLI, 스택 감지, 정적 audit, 명령 실행 증거 |
| `test/` | 격리된 임시 프로젝트로 돌리는 CLI 회귀 테스트 |
| `harness/` | 이 프로젝트의 스펙, ADR, 규칙, 검증 설정 |
| `skills/` | `harness-apply`, `harness-develop`, `harness-review` 스킬 |
| `.claude/` | 생성된 `code-reviewer` 에이전트와 로컬 개발용 `skills` 링크 |
| `examples/repo-kit/` | 예시 프로젝트 산출물(보고서는 예시용) |
| `examples/detect/` | 스택 감지 fixture |
| `docs/` | 사용법, 명령어 레퍼런스, 구성 다이어그램 |

## 이 저장소 개발과 검증

```bash
git clone https://github.com/bon-on/harness-lab.git
cd harness-lab
npm ci
npm test
node dist/index.js verify . harness/verify.json --output out/evidence/latest
node dist/index.js check-evidence out/evidence/latest/checks.json .
node dist/index.js audit . --format text
```

`verify`가 `npm test`를 직접 실행하므로, `npm test`는 빠르게 테스트만 돌릴 때 씁니다. 새로 clone한 저장소에는 실행 증거가 없으니 audit 전에 검증부터 실행하세요.

이전부터 있던 `run`, `maturity`, `report` 명령은 **mock 평가**용으로 남아 있습니다. 실제 에이전트를 실행하지 않으며, maturity에는 자기 신고 증거가 포함됩니다. [명령어 레퍼런스(영문)](docs/commands.md)를 참고하세요.

## 라이선스

[MIT](LICENSE).
