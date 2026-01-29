import { json } from "./util";
import { fetchAllFacilities } from "./crawler";

/**
 * /api/data
 *
 * 반환 구조 (기존 프론트 완전 호환):
 * {
 *   facilities: {
 *     [rid]: { title }
 *   },
 *   availability: {
 *     [rid]: {
 *       [date]: [{ timeContent, resveId }]
 *     }
 *   },
 *   updated_at
 * }
 */
export async function handleData(_req, env) {
  const db = env.yongin_tennis_db;

  /* =========================
     1️⃣ availability_cache 조회
     ========================= */

  const { results } = await db.prepare(`
    SELECT rid, date, slots_json, updated_at
    FROM availability_cache
  `).all();

  if (!results || results.length === 0) {
    return json({
      facilities: {},
      availability: {},
      updated_at: null
    });
  }

  const availability = {};
  let latestUpdatedAt = null;

  for (const row of results) {
    const { rid, date, slots_json, updated_at } = row;

    let slots = [];
    try {
      slots = JSON.parse(slots_json);
    } catch {
      slots = [];
    }

    availability[rid] ??= {};
    availability[rid][date] = slots;

    if (!latestUpdatedAt || updated_at > latestUpdatedAt) {
      latestUpdatedAt = updated_at;
    }
  }

  /* =========================
     2️⃣ 시설 정보 복구 (중요)
     ========================= */

  // crawler에서 시설 목록 1회 조회
  const { facilities: crawledFacilities } = await fetchAllFacilities({
    concurrency: 4
  });

  const facilities = {};

  for (const rid of Object.keys(availability)) {
    if (crawledFacilities?.[rid]) {
      facilities[rid] = {
        title: crawledFacilities[rid].title
      };
    } else {
      // 혹시 누락돼도 프론트 깨지지 않게
      facilities[rid] = {
        title: `시설 ${rid}`
      };
    }
  }

  /* =========================
     3️⃣ 기존 프론트 호환 응답
     ========================= */

  return json({
    facilities,
    availability,
    updated_at: latestUpdatedAt
  });
}
