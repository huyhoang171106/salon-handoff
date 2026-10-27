import { EntityManager } from 'typeorm';

/** Ghế cắt đang dùng được (không hỏng/bảo trì, BR-14) và chưa có khách ngồi (FR-24). */
export async function freeChairs(m: EntityManager): Promise<string[]> {
  const rows: { code: string }[] = await m.query(
    `SELECT e.code FROM equipment e
      WHERE e.kind = 'GHE' AND e.status = 'IN_USE'
        AND NOT EXISTS (SELECT 1 FROM service_sessions s WHERE s.chair = e.code AND s.status IN ('OPEN', 'IN_SERVICE'))
      ORDER BY e.code`,
  );
  return rows.map((r) => r.code);
}
