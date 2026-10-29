/**
 * 외부 제품 이미지 가져오기 — **서버 전용**.
 *
 * 후보 검색(`/api/ai/search`)이 화해 CDN 의 썸네일 주소를 준다. 그 주소를 DB 에 그대로
 * 넣지 않고 **한 번 받아 data URL 로 바꿔 저장한다**(사용자 결정 2026-08-19):
 *  - 직접 찍은 사진과 **같은 모양**이 되어 화면 코드가 갈라지지 않는다.
 *  - 화해가 URL 을 바꾸거나 핫링크를 막아도 이미 담은 제품은 깨지지 않는다.
 *  - **긴 변 256px JPEG 로 줄여 저장한다**(3라운드 M14). 원본 그대로 넣었더니 720px 222KB 한 장이
 *    `GET /api/products` 응답의 98% 였다 — 홈·스캔·루틴이 포커스마다 다시 받는 목록이다.
 *
 * ⛔ **SSRF 를 막는 것이 이 파일의 핵심 책임이다.**
 * 여기 들어오는 URL 은 **LLM 이 만들어 클라이언트를 거쳐 온 값**이다. 그대로 fetch 하면
 * 서버가 임의 주소로 요청하게 되고, 클라우드 메타데이터(169.254.169.254)나 사내망처럼
 * 서버만 닿을 수 있는 곳을 긁어 오는 통로가 된다. 호스트를 화이트리스트로 못 박는다.
 */

import sharp from "sharp";

import { execute } from "@/lib/db/pool";

/**
 * 허용 호스트. 실측(2026-08-19)에서 후보 검색이 주는 이미지가 전부 이 호스트였다.
 * 다른 출처가 생기면 **여기에 추가하기 전에 실제로 열리는지 확인**할 것 —
 * 화해 상세 페이지(`/goods/{id}`)는 403 이지만 이 CDN 은 Referer 없이도 200 이었다.
 */
const ALLOWED_IMAGE_HOSTS = new Set(["img.hwahae.co.kr"]);

/** 받을 원본의 상한. 저장은 축소본이라 넉넉히 두되 무한정 받지는 않는다. */
const MAX_IMAGE_BYTES = 2_000_000;

/** 저장 규격 — 클라이언트 `resizeToThumbnail` 과 같은 긴 변 256px. 카드 썸네일에 충분하다. */
const THUMBNAIL_SIDE = 256;
const JPEG_QUALITY = 80;

/** 이미지를 받는 데 오래 매달리지 않는다 — 등록 흐름 한가운데라 사용자가 기다린다. */
const FETCH_TIMEOUT_MS = 8_000;

/** 화이트리스트에 있는 https 주소인가. */
export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    // URL 로 파싱조차 안 되면 당연히 거부한다.
    return false;
  }
}

/**
 * 허용된 이미지 주소를 받아 data URL 로 바꾼다.
 *
 * 실패하면 **`null` 을 돌려준다 — 예외를 던지지 않는다.** 썸네일은 부가 정보라
 * 이것 때문에 제품 등록 전체가 실패하면 안 된다(사진 없이 담기면 아이콘으로 대체된다).
 */
export async function fetchImageAsDataUrl(
  value: string,
): Promise<string | null> {
  if (!isAllowedImageUrl(value)) return null;

  try {
    const response = await fetch(value, {
      // 리다이렉트를 따라가면 화이트리스트 밖으로 나갈 수 있다.
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    // content-type 을 믿기만 하면 안 되지만, 최소한 이미지가 아니라고 말하면 거른다.
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      return null;
    }

    // 디코딩이 곧 검증이다 — 이미지가 아닌 바이트면 sharp 가 던져 아래 catch 로 간다.
    return await toThumbnailDataUrl(buffer);
  } catch {
    // 타임아웃·네트워크 실패·리다이렉트·디코딩 실패 모두 여기로 온다. 썸네일 없이 진행한다.
    return null;
  }
}

/**
 * 이미 저장된 data URL 을 같은 규격으로 줄인다 — M14 이전에 원본 크기로 들어간 행용.
 * 실패하면 `null`(예외를 던지지 않는다).
 */
export async function shrinkDataUrl(dataUrl: string): Promise<string | null> {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return null;

  try {
    return await toThumbnailDataUrl(
      Buffer.from(dataUrl.slice(comma + 1), "base64"),
    );
  } catch {
    return null;
  }
}

/** 긴 변 256px JPEG data URL. 작은 원본은 키우지 않는다. */
async function toThumbnailDataUrl(input: Buffer): Promise<string> {
  const output = await sharp(input)
    .autoOrient()
    .resize(THUMBNAIL_SIDE, THUMBNAIL_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    // JPEG 에는 투명도가 없다 — 그냥 두면 투명 PNG 의 배경이 검게 나온다.
    .flatten({ background: "white" })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return `data:image/jpeg;base64,${output.toString("base64")}`;
}

/** 이보다 큰 공유 이미지는 M14 이전에 원본 크기로 저장된 것이다(축소본은 20KB 안팎). */
const LARGE_IMAGE_CHARS = 100_000;

/**
 * 축소를 시도한 제품 id — 동시 조회가 같은 행을 겹쳐 줄이지 않고, 실패 행도 반복하지 않는다.
 * dev HMR 에 초기화돼도 다시 한 번 시도할 뿐이라 globalThis 에 두지 않는다.
 */
const shrinkAttempted = new Set<string>();

/**
 * 목록 응답에 실린 큰 공유 이미지를 **백그라운드로** 줄여 저장한다(3라운드 M14 — 기존 행 정리).
 * 응답은 기다리지 않는다: 이번 응답은 큰 그대로, 다음 조회부터 작다.
 * 카탈로그 이미지를 내보내는 모든 목록(내 선반·인기·성분별)이 부른다 — 한 경로에서만 부르면
 * 그 사용자의 선반에 없는 행은 영영 크게 남았다(검증 실측: 성분별 응답 234KB 중 228KB 가 한 장).
 */
export function shrinkLargeImages(
  products: readonly { id: string; image?: string }[],
): void {
  for (const { id, image } of products) {
    if (
      !image ||
      image.length <= LARGE_IMAGE_CHARS ||
      shrinkAttempted.has(id)
    ) {
      continue;
    }
    shrinkAttempted.add(id);

    void shrinkDataUrl(image)
      .then(async (small) => {
        if (!small) throw new Error("디코딩 실패");
        await execute(`UPDATE products SET image = ? WHERE id = ?`, [
          small,
          id,
        ]);
      })
      .catch((error: unknown) => {
        console.warn(`[images] 이미지 축소 실패(${id}):`, error);
      });
  }
}
