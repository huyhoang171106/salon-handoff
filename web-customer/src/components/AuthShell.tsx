import { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  perks?: string[];
  children: ReactNode;
}

const DEFAULT_PERKS = ['Xem lịch hẹn sắp tới, đổi hoặc hủy trực tuyến.', 'Lịch sử dịch vụ và hóa đơn ở một nơi.', 'Ưu đãi lần đầu cho thành viên mới.'];

/** Khung chung cho các trang tài khoản (đăng nhập, đăng ký, quên/đổi mật khẩu). */
export default function AuthShell({ eyebrow, title, lead, perks = DEFAULT_PERKS, children }: Props) {
  return (
    <div className="container page auth">
      <div className="auth__intro stack gap-12">
        <div className="label">{eyebrow}</div>
        <h1>{title}</h1>
        <div className="muted lead">{lead}</div>
        {perks.length > 0 && (
          <ul className="auth__perks muted">
            {perks.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="sheet auth__card">{children}</div>
    </div>
  );
}
