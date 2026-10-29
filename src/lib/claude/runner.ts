/**
 * 헤드리스 Claude(`claude -p`) 실행기 — **서버 전용**.
 * 클라이언트 컴포넌트에서 import 하지 말 것(자식 프로세스를 띄운다).
 *
 * `C:\Work\WatchList` 의 `backend/claude_runner.py` 패턴을 이식했다.
 * 2026-08-18 이 머신에서 CLI 로 직접 실측해 확인한 사항:
 *  - stdin 으로 프롬프트를 넘길 수 있다(argv 상한 32,767자를 피하려면 이쪽이어야 한다).
 *  - `--output-format json` 의 stdout 은 봉투다: `{ is_error, session_id, result, ... }`.
 *    실제 모델 응답은 `result` **문자열 안에** 들어 있다.
 *  - `--allowedTools Read` 로 이미지 파일을 읽게 하면 성분표가 정확히 추출된다.
 *  - 그 뒤 `~/.claude/projects/＊/{session_id}.jsonl` 에 **이미지 base64 사본이 남는다**
 *    (9.5KB 이미지 1장에 트랜스크립트가 59KB 로 불어났다). 그래서 삭제가 필수다.
 *
 * 이미지 여부와 무관하게 트랜스크립트에는 **프롬프트 전문**이 남으므로
 * `cleanupSession` 기본값은 true 다 — `RunClaudeOptions` 주석 참조.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, rm, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { serverEnv } from "@/lib/env";

/** `--output-format json` 이 내보내는 봉투에서 우리가 쓰는 필드만 */
type Envelope = {
  is_error?: boolean;
  session_id?: string;
  result?: string;
};

export type RunClaudeOptions = {
  /**
   * 자식이 쓸 수 있는 도구. 예: `["Read"]`.
   *
   * 비우면 **도구가 하나도 없이** 실행된다(`--tools ""`). 예전 주석은 그렇게 적혀 있었지만
   * 실제로는 플래그를 안 붙여 기본 도구 전체가 열렸다 — 아래 `args` 주석 참조.
   */
  allowedTools?: readonly string[];
  timeoutMs?: number;
  /**
   * 세션 트랜스크립트를 지운다. **기본값 true** (2026-08-21 사용자 결정으로 뒤집었다).
   *
   * 예전 기본값은 false 였고, 그래서 이미지·검색을 뺀 호출부 전부가 트랜스크립트를 남겼다.
   * 트랜스크립트에는 프롬프트 전문이 들어간다 — 루틴은 피부 고민 원문 + 보유 제품 전체,
   * report 는 선반 전체 성분이다. DB 에서 사용자 데이터를 지워도 이건 서버 디스크에 남고,
   * 무인 경로(warningsQueue)까지 있어 아무도 모르게 축적된다.
   * **false 로 되돌리려면 그 호출부가 왜 남겨야 하는지 근거를 함께 적을 것.**
   */
  cleanupSession?: boolean;
  /**
   * 요청이 끊기면(새로고침·탭 닫기) 자식을 죽인다 — Route Handler 의 `request.signal` 을 넘긴다.
   * 없으면 사용자가 떠난 뒤에도 결과를 버릴 호출이 끝까지 돌면서 가드를 쥐고 있었다(3라운드 m3).
   */
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * 자식 프로세스를 띄우고 stdout 전문을 받는다.
 *
 * ⚠️ `ANTHROPIC_API_KEY`·`ANTHROPIC_AUTH_TOKEN` 을 자식 환경에서 **제거한다.**
 *    키가 있으면 Claude 가 구독보다 API 키를 우선해 **별도 종량 과금**된다.
 *    "Claude API 를 쓰지 않는다"는 결정을 코드 차원에서 강제하는 장치이므로 지우지 말 것.
 */
function spawnClaude(
  args: string[],
  prompt: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;

    // shell:false 로 띄운다 — 프롬프트에 사용자 입력(제품명 등)이 들어가므로
    // 셸을 거치면 인젝션 위험이 생긴다. claude 는 .exe 라 셸 없이 실행된다.
    const child = spawn(serverEnv.claudeBin, args, {
      env,
      windowsHide: true,
      timeout: timeoutMs,
      // abort 되면 Node 가 killSignal 로 죽이고 'error'(AbortError) 를 낸다 → 아래 reject.
      signal,
      /*
       * SIGTERM 을 무시하는 자식이면 `close` 가 영영 안 와 가드가 무기한 잠긴다
       * (Node 의미론 — 리눅스 실측). 버릴 결과라 정리 기회를 줄 이유가 없다.
       */
      killSignal: "SIGKILL",
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    // 프롬프트를 다 쓰기 전에 프로세스가 죽으면 EPIPE 가 난다. 그대로 흘리면 unhandled 다.
    child.stdin.on("error", reject);

    child.on("close", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `claude 프로세스가 ${signal} 로 종료됐습니다(타임아웃 ${timeoutMs}ms 초과일 수 있음).`,
          ),
        );
        return;
      }
      if (code !== 0) {
        /*
         * 실패 사유는 stderr 가 아니라 **stdout 봉투**에 있다(3라운드 M11 실측: 로그아웃 상태 →
         * exit 1, stderr 0바이트, stdout `{"is_error":true,"result":"Not logged in · Please run /login"}`).
         * stderr 만 보면 메시지가 비어 `/api/health/ai` 의 인증 만료 판별이 영영 안 걸린다.
         */
        // 둘 다 담는다 — stderr 에는 무관한 경고(예: 작업 공간 신뢰 안내)가 섞여 있어
        // `stderr || 봉투` 로 고르면 진짜 사유가 가려진다(실측: 경고 때문에 reason 이 "error").
        const reason = [envelopeReason(stdout), stderr.trim()]
          .filter(Boolean)
          .join(" | ");
        reject(
          new Error(`claude 실행 실패(exit ${code}): ${reason.slice(0, 500)}`),
        );
        return;
      }
      resolve(stdout);
    });

    // argv 가 아니라 stdin 으로 넘긴다 — 루틴 생성 프롬프트는 보유 제품 전체를 포함해
    // 길어지는데, Windows CreateProcess 커맨드라인 상한이 32,767자다.
    child.stdin.end(prompt);
  });
}

/** 실패한 실행의 stdout 봉투에서 사유(`result`)를 꺼낸다. 봉투가 아니면 원문 앞부분. */
function envelopeReason(stdout: string): string {
  try {
    const envelope = JSON.parse(stdout) as Envelope;
    if (typeof envelope.result === "string") return envelope.result;
  } catch {
    // 봉투가 아니다 — 아래 원문으로.
  }
  return stdout.slice(0, 300);
}

/**
 * 세션 트랜스크립트 삭제.
 * 프로젝트 폴더명이 cwd 에서 파생돼 예측이 어려우므로 전 폴더를 훑어 같은 이름을 지운다.
 * 실패해도 본 작업을 막지 않는다(응답은 이미 받았다) — 대신 경고를 남긴다.
 *
 * `<sessionId>.jsonl` 옆의 `<sessionId>/` 디렉터리도 지운다 — 웹 도구가 큰 결과를
 * `tool-results/webfetch-*.bin` 으로 거기 쓴다(3라운드 m16: 짝 없는 고아 디렉터리 실측).
 * 세션 ID 는 `randomUUID()` 라 경로 주입 여지는 없다.
 */
async function removeSessionTranscript(sessionId: string): Promise<void> {
  const base = join(homedir(), ".claude", "projects");

  try {
    const entries = await readdir(base, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            await unlink(join(base, entry.name, `${sessionId}.jsonl`));
          } catch {
            // 그 폴더엔 없는 게 정상이다.
          }
          // force: 없으면 조용히 넘어간다.
          await rm(join(base, entry.name, sessionId), {
            recursive: true,
            force: true,
          });
        }),
    );
  } catch (error: unknown) {
    console.warn("[claude] 세션 트랜스크립트 삭제 실패:", error);
  }
}

/**
 * 프롬프트를 실행하고 **모델 응답 문자열**을 반환한다(봉투는 벗겨서 준다).
 * JSON 파싱은 호출부에서 `parseJsonObject` 로 한 번 더 한다.
 */
export async function runClaude(
  prompt: string,
  options: RunClaudeOptions = {},
): Promise<string> {
  const {
    allowedTools = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cleanupSession = true,
    signal,
  } = options;

  /*
   * ⛔ `--allowedTools` 만으로는 도구가 제한되지 않는다 (2026-08-18 실측).
   *
   * 그건 **권한 허용 목록**일 뿐이라, `~/.claude/settings.json` 이
   * `defaultMode: "bypassPermissions"` 면 권한 검사 자체를 건너뛰어 무력해진다.
   * 게다가 예전 코드는 목록이 비면 플래그를 **아예 안 붙여서** 자식이 기본 도구
   * 전체(Bash·Write·Edit…)를 물려받았다 — 사진 없이 제품을 등록하는 가장 흔한 경로가
   * 여기 해당했고, 프롬프트에는 사용자가 입력한 제품명이 그대로 들어간다.
   *
   * 실측:
   *   플래그 없음                        → `echo` 가 그대로 실행됨
   *   `--strict-mcp-config --tools ""`   → 도구 스키마 0개. 거부가 아니라 **부재**다.
   *
   * 그래서 항상 `--tools` 로 **집합 자체를 좁히고**(빈 배열이면 `""` = 전부 끔),
   * `--strict-mcp-config` 로 부모의 MCP 서버가 자식에 새지 않게 한다
   * (이 세션에는 MCP 도구가 100개 넘게 붙어 있고, 없으면 그쪽으로 우회된다).
   * `--allowedTools` 도 함께 남긴다 — 권한 모드가 엄격해져도 미리 승인돼 있어야
   * 헤드리스에서 프롬프트 없이 진행된다.
   *
   * ⚠️ `--bare` 는 쓰지 말 것. 인증이 API 키 전용으로 바뀌어 구독 강제 정책과 충돌한다.
   */
  // 세션 ID 를 **사전 생성**해 넘긴다 (2026-08-20 실측: 봉투의 session_id 가 지정값과 일치).
  // 봉투를 받아야만 ID 를 아는 구조면 타임아웃·spawn 실패·파싱 실패 경로에서
  // 트랜스크립트(제품 사진 base64 사본)를 지울 방법이 없다.
  const sessionId = randomUUID();
  const args = [
    "-p",
    "--output-format",
    "json",
    "--strict-mcp-config",
    "--session-id",
    sessionId,
    "--tools",
    allowedTools.join(","),
  ];
  if (allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }

  let envelope: Envelope | undefined;
  try {
    const stdout = await spawnClaude(args, prompt, timeoutMs, signal);

    try {
      envelope = JSON.parse(stdout) as Envelope;
    } catch {
      throw new Error(
        `claude 응답 봉투를 JSON 으로 읽지 못했습니다: ${stdout.slice(0, 300)}`,
      );
    }

    if (envelope.is_error) {
      throw new Error(
        `claude 응답 오류: ${JSON.stringify(envelope).slice(0, 500)}`,
      );
    }

    const result = (envelope.result ?? "").trim();
    if (!result) throw new Error("claude 응답이 비어 있습니다.");

    return result;
  } finally {
    // finally 라서 성공·실패 **모든 경로**(타임아웃 signal·exit≠0·봉투 파싱 실패 포함)에서
    // 지운다 — 실패한 호출도 이미지 사본은 남기기 때문이다.
    if (cleanupSession) {
      await removeSessionTranscript(sessionId);
      // CLI 가 지정값과 다른 ID 로 저장하는 회귀에 대비해 봉투 쪽도 지운다.
      if (envelope?.session_id && envelope.session_id !== sessionId) {
        await removeSessionTranscript(envelope.session_id);
      }
    }
  }
}
