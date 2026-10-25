import { date, vnd } from '../lib/format';
import type { InvoiceSummary } from '../lib/types';

/** Lịch sử sử dụng dịch vụ (hóa đơn đã thanh toán). */
export default function HistoryTable({ invoices }: { invoices: InvoiceSummary[] | null }) {
  return (
    <section id="lich-su" className="card stack split__main" aria-labelledby="history-title">
      <h2 id="history-title">Lịch sử sử dụng dịch vụ</h2>
      {invoices === null ? (
        <p className="muted">Đang tải…</p>
      ) : invoices.length === 0 ? (
        <p className="muted">Chưa có lần sử dụng dịch vụ nào được thanh toán. Sau mỗi lần làm tóc, hóa đơn sẽ hiện ở đây.</p>
      ) : (
        <div className="table-wrap">
          <table className="table history-table">
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Dịch vụ</th>
                <th scope="col">Stylist</th>
                <th scope="col" className="num">
                  Thanh toán
                </th>
                <th scope="col" className="num">
                  Hóa đơn
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">{i.paidAt ? date(i.paidAt) : '—'}</td>
                  <td>{i.items.map((x) => (x.quantity > 1 ? `${x.description} ×${x.quantity}` : x.description)).join(', ')}</td>
                  <td>{i.stylists.join(', ') || '—'}</td>
                  <td className="num strong">{vnd(i.total)}</td>
                  <td className="num">{i.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">Hóa đơn lưu giá tại thời điểm thanh toán — không thay đổi khi bảng giá mới được cập nhật.</p>
    </section>
  );
}
