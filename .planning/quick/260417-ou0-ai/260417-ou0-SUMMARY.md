---
phase: quick-260417-ou0
plan: 01
subsystem: frontend/chat-ui
tags: [bugfix, ux, scroll, streaming]
requires: []
provides:
  - "조건부 auto-scroll with 사용자 의도 감지 (Slack/YouTube 패턴)"
affects:
  - frontend/src/components/chat/chat-container.tsx
tech_stack:
  added: []
  patterns:
    - "입력 이벤트(wheel/touchmove/keydown) 기반 사용자 의도 감지 — scroll 이벤트의 프로그램/사용자 모호성 회피"
key_files:
  created: []
  modified:
    - path: frontend/src/components/chat/chat-container.tsx
      lines: "117-180 (기존 117-142 교체 + 확장)"
      commit: 770ef82
decisions:
  - "scroll 이벤트가 아닌 wheel/touchmove/keydown으로 사용자 의도 감지 → 프로그램적 scrollTop 변경으로 인한 self-reset 루프 차단"
  - "하단 근접 threshold 50px → 80px: 스트리밍 중 scrollHeight 급변으로 인한 경계 깜빡임 완화"
  - "scroll 이벤트는 '하단 복귀 감지' 전용으로 남김 — 프로그램적 스크롤이 트리거해도 이미 true → no-op으로 루프 없음"
metrics:
  duration_minutes: 3
  tasks_completed: 1
  tasks_total: 2
  files_modified: 1
  completed_date: "2026-04-17"
requirements_completed:
  - QUICK-260417-OU0-01
---

# Phase quick-260417-ou0 Plan 01: 스트리밍 중 스크롤 존중 Summary

AI 스트리밍 중 사용자가 위로 스크롤할 때 auto-scroll이 강제로 하단으로 끌고 내려오던 버그를 입력 이벤트 기반 의도 감지로 수정.

## 변경한 파일

| 파일 | 라인 범위 | 커밋 |
| ---- | --------- | ---- |
| `frontend/src/components/chat/chat-container.tsx` | 기존 `useEffect` 블록 (117-142) → 확장 (117-180), `useEffect([messages])` 블록은 그대로 아래로 이동 | `770ef82` |

변경 델타: +47 / -4 라인

## 근본 원인

기존 구현의 단일 `onScroll` 핸들러가 프로그램적 `viewport.scrollTop = viewport.scrollHeight` 호출에도 발동해서 다음 루프를 형성했다.

1. 사용자가 위로 스크롤 → `stickToBottomRef = false`
2. 새 스트리밍 청크 도착 → `useEffect([messages])`가 `stickToBottomRef`를 `false`로 읽고 건너뜀 (여기까진 정상)
3. 그러나 이전 프레임에 여전히 sticky였던 경우, 프로그램적 `scrollTop = scrollHeight` 실행 → scroll 이벤트 발동 → `distanceFromBottom < 50`이 true → `stickToBottomRef = true`로 재설정 → 사용자가 위로 올렸다는 의도가 즉시 덮어씌워짐
4. 또한 50px threshold는 스트리밍 중 `scrollHeight`가 청크마다 늘어나면서 경계를 자주 넘나들어 민감하게 반응

## 최종 `useEffect` 코드

```typescript
// 사용자 의도 감지: wheel/touch/keyboard로 위로 스크롤하면 auto-scroll 해제.
// scroll 이벤트가 아닌 입력 이벤트를 사용하는 이유:
// scroll 이벤트는 프로그램적 scrollTop 변경(아래 effect)에도 발동되어
// stickToBottom 플래그가 self-reset되는 루프가 생긴다. 입력 이벤트는
// 사용자의 실제 동작만 포착하므로 이 루프를 끊어준다.
useEffect(() => {
  const viewport = scrollRef.current?.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  );
  if (!viewport) return;

  function isAwayFromBottom(el: HTMLElement) {
    // 80px threshold: 스트리밍 중 새 청크로 scrollHeight가 급변해도
    // 사용자가 "충분히 위로" 올라간 케이스만 감지 (기존 50px은 너무 민감).
    return el.scrollHeight - el.scrollTop - el.clientHeight > 80;
  }

  // 사용자 제스처: 위로 스크롤 의도 감지 → sticky 해제
  function onUserScroll() {
    if (isAwayFromBottom(viewport!)) {
      stickToBottomRef.current = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    // PageUp/ArrowUp/Home: 위로 이동 의도
    if (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "Home") {
      // rAF로 한 프레임 지연 — 키가 적용된 후의 scrollTop을 읽기 위함
      requestAnimationFrame(() => {
        if (isAwayFromBottom(viewport!)) {
          stickToBottomRef.current = false;
        }
      });
    }
  }

  // 하단 복귀 감지: 사용자(또는 프로그램)가 하단 근처에 도달하면 sticky 재활성화.
  // 프로그램적 스크롤이 이를 트리거해도 이미 true → no-op이라 루프 없음.
  function onScroll() {
    const el = viewport!;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      stickToBottomRef.current = true;
    }
  }

  viewport.addEventListener("wheel", onUserScroll, { passive: true });
  viewport.addEventListener("touchmove", onUserScroll, { passive: true });
  viewport.addEventListener("keydown", onKey);
  viewport.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    viewport.removeEventListener("wheel", onUserScroll);
    viewport.removeEventListener("touchmove", onUserScroll);
    viewport.removeEventListener("keydown", onKey);
    viewport.removeEventListener("scroll", onScroll);
  };
}, []);

// 새 메시지/스트리밍 시 하단 스크롤 — 사용자가 위로 스크롤한 상태면 건너뜀.
useEffect(() => {
  if (!stickToBottomRef.current) return;
  const viewport = scrollRef.current?.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  );
  if (viewport) {
    viewport.scrollTop = viewport.scrollHeight;
  }
}, [messages]);
```

## 변경 요약

1. 단일 `onScroll` 한 개 → `onUserScroll`(wheel/touchmove) + `onKey`(keyboard) + `onScroll`(하단 복귀 전용) 세 개로 분리
2. 사용자 의도 판정 threshold: 50px → 80px (스트리밍 변동성 완화)
3. `stickToBottomRef` 변경 로직:
   - 사용자 제스처 + 하단에서 80px+ 벗어남 → `false`
   - scroll 이벤트에서 하단 근처 복귀 → `true`
   - 그 외는 변경 없음 (프로그램적 스크롤은 flag를 바꾸지 않음)
4. `useEffect([messages])` 블록은 그대로 유지 — 이미 올바름
5. `handleSubmit` 내 `stickToBottomRef.current = true` (신규 메시지 송신 시 sticky 재활성화) 그대로 유지

## 제약 준수 확인

- ✅ 신규 `useRef` 추가 없음 — 기존 `stickToBottomRef`만 재사용
- ✅ 신규 import 없음
- ✅ `scrollIntoView()` 도입 없음 — `scrollTop = scrollHeight` 패턴 유지
- ✅ `behavior: "smooth"` 도입 없음
- ✅ `handleSubmit`의 라인 203(현재는 237) `stickToBottomRef.current = true` 건드리지 않음

## 자동 검증 결과

| 검증 | 결과 |
| --- | --- |
| `cd frontend && npx tsc --noEmit` | ✅ 통과 (exit 0, 출력 없음) |
| 신규 `useRef` 추가 없음 | ✅ 확인 |
| 신규 import 없음 | ✅ 확인 |

## 시나리오 결과 (사용자 검증 대기)

Task 2는 `checkpoint:human-verify`로 사용자가 로컬 dev 서버(`npm run dev -- -p 3001`)에서 직접 확인한다.

| 시나리오 | 설명 | 결과 |
| ------- | ---- | ---- |
| A | 긴 응답 스트리밍 중 위로 스크롤 → 위에 머무름 | pending human verification |
| B | 위로 갔다가 하단 복귀 → auto-scroll 재개 | pending human verification |
| C | 위로 스크롤한 상태에서 신규 메시지 송신 → 하단 이동 | pending human verification |
| D | PageUp/↑ 키보드로 위로 → auto-scroll 해제 | pending human verification |
| E | 모바일 에뮬레이션 스와이프 → 위에 머무름 | pending human verification |
| F | 기존 UX 회귀 없음 (하단에 있을 때는 따라감) | pending human verification |

## 배포 관련

- CLAUDE.md 규정: push는 사용자 명시 요청 시에만.
- 이 변경은 Vercel 자동 배포 대상이므로 push = 프로덕션 배포.
- Task 2 사용자 검증 통과 후에만 push 진행.

## 남은 후속 아이디어 (이번 스코프 아님)

1. **"새 메시지 ↓" 플로팅 버튼**: 사용자가 위로 스크롤했을 때 "새로운 내용이 있습니다" 배지 + 클릭 시 하단 이동. Slack/Discord/ChatGPT 공통 패턴. 본 수정이 안정화된 후 별도 플랜으로.
2. **스크롤 위치 복원**: 다른 대화로 전환 후 돌아올 때 마지막 스크롤 위치 유지. 현재는 key remount로 초기화됨.
3. **키보드 포커스 UX**: 현재 viewport의 keydown은 포커스가 viewport에 있을 때만 동작. 실제 유저가 키보드 스크롤을 쓰려면 `tabIndex`가 viewport에 필요할 수 있음 — 실사용 데이터 확인 후 결정.

## Deviations from Plan

None — 플랜의 교체 코드를 문자 그대로 적용했음. Rule 1-3 해당 사항 없음.

## Self-Check: PASSED

- ✅ File exists: `frontend/src/components/chat/chat-container.tsx` (modified)
- ✅ File exists: `.planning/quick/260417-ou0-ai/260417-ou0-SUMMARY.md` (this file, being written)
- ✅ Commit exists: `770ef82` (verified via `git log --oneline -3`)
- ✅ Type check: `npx tsc --noEmit` passed (exit 0)
- ✅ No destructive git operations performed
- ✅ No push performed (CLAUDE.md compliance)
