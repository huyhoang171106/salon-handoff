import { date, vnd } from '../lib/format';
import type { Consultation } from '../lib/types';
import StatusBadge from './StatusBadge';

const RESULT: Record<string, { label: string; tone: string }> = {
  ACCEPTED: { label: 'Đã đồng ý', tone: 'ok' },
  DECLINED: { label: 'Không chọn', tone: 'neutral' },
  FOLLOW_UP: { label: 'Cần tư vấn thêm', tone: 'warn' },
};

/** Các lần stylist tư vấn: nhu cầu, dịch vụ đề xuất và kết quả (FR-26). */
export default function ConsultationList({ items }: { items: Consultation[] }) {
  return (
    <section id="tu-van" className="card stack" aria-labelledby="consult-title">
      <h2 id="consult-title">Tư vấn của stylist</h2>
      {items.length === 0 ? (
        <p className="muted">Chưa có buổi tư vấn nào. Khi stylist tư vấn kiểu tóc cho bạn, phương án đề xuất sẽ hiện ở đây.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Nhu cầu</th>
                <th scope="col">Dịch vụ đề xuất</th>
                <th scope="col">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">
                    {date(c.createdAt)}
                    <div className="muted small-13">{c.consultant.fullName}</div>
                  </td>
                  <td>
                    {c.needs}
                    {c.budget != null && <div className="muted small-13">Ngân sách: {vnd(c.budget)}</div>}
                  </td>
                  <td style={{ whiteSpace: 'pre-line' }}>{c.proposal}</td>
                  <td>
                    <StatusBadge status={c.result} map={RESULT} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
