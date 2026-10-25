import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { todayVN } from '../../lib/format';
import { PASSWORD_HINT, passwordError } from '../../lib/password';
import { addDays, errMsg } from '../../lib/util';
import { useServices } from '../../lib/data';
import type { Employee, Position } from '../../lib/types';
import { CredentialBox } from '../../components/CredentialsDialog';
import { PasswordInput } from '../../components/PasswordInput';
import { ErrorAlert, Field, PageHead } from '../../components/ui';

const POSITIONS: { v: Position; l: string }[] = [
  { v: 'RECEPTIONIST', l: 'Lễ tân' },
  { v: 'STYLIST', l: 'Stylist' },
  { v: 'ASSISTANT', l: 'Thợ phụ' },
  { v: 'OWNER', l: 'Quản lý' },
];
const WEEKDAYS = [{ v: 1, l: 'T2' }, { v: 2, l: 'T3' }, { v: 3, l: 'T4' }, { v: 4, l: 'T5' }, { v: 5, l: 'T6' }, { v: 6, l: 'T7' }, { v: 0, l: 'CN' }];

interface Result {
  emp: Employee;
  creds: { username: string; password: string } | null;
  shifts: number | null;
  warnings: string[];
}

/** Thêm nhân viên & tạo tài khoản (2 bước). */
export function NewEmployeePage() {
  const services = useServices(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ fullName: '', phone: '', position: 'STYLIST' as Position, level: '', bio: '', publicProfile: true, skillIds: [] as number[] });
  const [shiftOn, setShiftOn] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [makeAccount, setMakeAccount] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const craft = f.position === 'STYLIST' || f.position === 'ASSISTANT';
  const cats = [...new Set((services.data ?? []).map((s) => s.category))];

  function next(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.fullName.trim()) return setError('Nhập họ tên');
    if (f.phone && !/^0\d{9,10}$/.test(f.phone.trim())) return setError('Số điện thoại không hợp lệ');
    if (shiftOn && !weekdays.length) return setError('Chọn ít nhất một thứ cho ca mặc định');
    if (shiftOn && end <= start) return setError('Giờ kết thúc ca phải sau giờ bắt đầu');
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (makeAccount && username && !/^[A-Za-z0-9._-]{3,40}$/.test(username)) return setError('Tên đăng nhập 3–40 ký tự, không dấu, không khoảng trắng');
    if (makeAccount && password) {
      const pe = passwordError(password);
      if (pe) return setError(pe);
    }
    setBusy(true);
    let emp: Employee;
    try {
      emp = await api<Employee>('/employees', {
        body: { fullName: f.fullName.trim(), phone: f.phone.trim() || undefined, position: f.position, level: f.level || undefined, bio: f.bio || undefined, publicProfile: f.publicProfile, skillIds: craft ? f.skillIds : [] },
      });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
      return;
    }
    const warnings: string[] = [];
    let creds: Result['creds'] = null;
    if (makeAccount) {
      try {
        const r = await api<{ account: { username: string }; temporaryPassword: string }>('/accounts', { body: { employeeId: emp.id, username: username || undefined, password: password || undefined } });
        creds = { username: r.account.username, password: r.temporaryPassword };
      } catch (err) {
        warnings.push(`Đã thêm nhân viên nhưng chưa tạo được tài khoản: ${errMsg(err)}. Tạo lại ở trang Tài khoản nhân viên.`);
      }
    }
    let shifts: number | null = null;
    if (shiftOn) {
      try {
        const from = todayVN();
        const r = await api<{ created: number }>('/shifts/bulk', { body: { employeeIds: [emp.id], from, to: addDays(from, 27), weekdays, startTime: start, endTime: end } });
        shifts = r.created;
      } catch (err) {
        warnings.push(`Chưa tạo được ca mặc định: ${errMsg(err)}`);
      }
    }
    setResult({ emp, creds, shifts, warnings });
    setBusy(false);
  }

  if (result) {
    return (
      <div className="page stack narrow-page">
        <PageHead eyebrow="Hoàn tất" title={`Đã thêm ${result.emp.fullName}`} sub={`Mã nhân viên ${result.emp.code}`} />
        {result.warnings.map((w) => <div key={w} className="alert warn">{w}</div>)}
        {result.creds && (
          <section className="card stack" aria-label="Thông tin đăng nhập">
            <h2 className="section-title">Thông tin đăng nhập</h2>
            <CredentialBox username={result.creds.username} password={result.creds.password} />
            <div className="alert warn" role="note">Chỉ hiển thị một lần, nhân viên phải đổi ở lần đăng nhập đầu.</div>
            <div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(`Tên đăng nhập: ${result.creds!.username}\nMật khẩu tạm: ${result.creds!.password}`).catch(() => undefined)}>
                Sao chép
              </button>
            </div>
          </section>
        )}
        {result.shifts !== null && <div className="alert ok">Đã tạo {result.shifts} ca trong 4 tuần tới.</div>}
        <div className="row">
          <Link className="btn btn-gold" to="/nhan-vien">Về danh sách nhân viên</Link>
          <Link className="btn btn-outline" to="/tai-khoan">Tài khoản nhân viên</Link>
          <Link className="btn btn-outline" to="/ca-lam">Xem ca làm</Link>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>Thêm người khác</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page stack narrow-page">
      <PageHead eyebrow={<Link to="/nhan-vien">‹ Nhân viên</Link>} title="Thêm nhân viên & tạo tài khoản" />
      <ol className="stepper" aria-label="Các bước">
        <li aria-current={step === 1 ? 'step' : undefined} className={step > 1 ? 'done' : ''}><span>1</span> Hồ sơ</li>
        <li aria-current={step === 2 ? 'step' : undefined}><span>2</span> Tài khoản</li>
      </ol>

      {step === 1 && (
        <form className="card stack" onSubmit={next} noValidate>
          <div className="form-grid">
            <Field label="Họ tên"><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus /></Field>
            <Field label="Số điện thoại"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="09…" /></Field>
            <Field label="Chức danh">
              <select className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value as Position })}>
                {POSITIONS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </Field>
            <Field label="Cấp bậc"><input className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} placeholder="VD: SENIOR STYLIST" /></Field>
          </div>
          <Field label="Giới thiệu"><textarea className="input" rows={2} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={f.publicProfile} onChange={(e) => setF({ ...f, publicProfile: e.target.checked })} /><span>Hiển thị trên website khách hàng</span></label>
          {craft && (
            <fieldset className="plain-fieldset">
              <legend className="lbl">Chuyên môn ({f.skillIds.length} dịch vụ)</legend>
              {cats.map((c) => (
                <div key={c} className="stack" style={{ gap: 6, marginTop: 8 }}>
                  <span className="eyebrow">{c}</span>
                  <div className="check-grid">
                    {(services.data ?? []).filter((s) => s.category === c).map((s) => (
                      <label key={s.id} className="check">
                        <input type="checkbox" checked={f.skillIds.includes(s.id)} onChange={(e) => setF({ ...f, skillIds: e.target.checked ? [...f.skillIds, s.id] : f.skillIds.filter((x) => x !== s.id) })} />
                        <span className="small">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          )}
          <fieldset className="plain-fieldset subpanel stack">
            <legend className="sr-only">Ca mặc định</legend>
            <label className="check"><input type="checkbox" checked={shiftOn} onChange={(e) => setShiftOn(e.target.checked)} /><span>Tạo ca mặc định cho 4 tuần tới (không bắt buộc)</span></label>
            {shiftOn && (
              <>
                <div className="row" style={{ gap: 6 }} role="group" aria-label="Các thứ trong tuần">
                  {WEEKDAYS.map((w) => (
                    <button key={w.v} type="button" className="pick pick-day" aria-pressed={weekdays.includes(w.v)} onClick={() => setWeekdays(weekdays.includes(w.v) ? weekdays.filter((x) => x !== w.v) : [...weekdays, w.v])}>{w.l}</button>
                  ))}
                </div>
                <div className="form-grid">
                  <Field label="Giờ bắt đầu"><input className="input" type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                  <Field label="Giờ kết thúc"><input className="input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
                </div>
              </>
            )}
          </fieldset>
          <ErrorAlert error={error} />
          <div className="row"><button type="submit" className="btn btn-gold">Tiếp tục: tài khoản ›</button><Link className="btn btn-ghost" to="/nhan-vien">Hủy</Link></div>
        </form>
      )}

      {step === 2 && (
        <form className="card stack" onSubmit={submit} noValidate>
          <p className="muted small" style={{ margin: 0 }}>
            {f.fullName} · {POSITIONS.find((p) => p.v === f.position)?.l}{craft ? ` · ${f.skillIds.length} chuyên môn` : ''}{shiftOn ? ` · ca ${start}–${end}` : ''}
          </p>
          <label className="check"><input type="checkbox" checked={makeAccount} onChange={(e) => setMakeAccount(e.target.checked)} /><span>Tạo tài khoản đăng nhập</span></label>
          {makeAccount && (
            <>
              <Field label="Tên đăng nhập" hint="Để trống = dùng mã nhân viên được cấp sau khi lưu (VD: ST-005)">
                <input className="input mono" value={username} onChange={(e) => setUsername(e.target.value.trim())} placeholder="Mã nhân viên" />
              </Field>
              <PasswordInput label="Mật khẩu (để trống = hệ thống tạo mật khẩu tạm)" value={password} onChange={setPassword} autoComplete="new-password" hint={PASSWORD_HINT} />
              <p className="muted small" style={{ margin: 0 }}>Dù đặt sẵn mật khẩu, nhân viên vẫn phải đổi mật khẩu ở lần đăng nhập đầu.</p>
            </>
          )}
          <ErrorAlert error={error} />
          <div className="row">
            <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>‹ Quay lại</button>
            <button type="submit" className="btn btn-gold" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu nhân viên'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
