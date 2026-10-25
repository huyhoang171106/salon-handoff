/** Quy tắc mật khẩu (khớp backend): tối thiểu 6 ký tự, có cả chữ và số. */
export const PASSWORD_HINT = 'Tối thiểu 6 ký tự, gồm cả chữ và số.';

export function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 6, label: 'Ít nhất 6 ký tự' },
    { ok: /[A-Za-z]/.test(pw), label: 'Có chữ cái (a–z)' },
    { ok: /\d/.test(pw), label: 'Có chữ số' },
  ];
}

/** Trả về thông báo lỗi, hoặc null nếu hợp lệ. */
export function validatePassword(pw: string): string | null {
  if (!pw) return 'Vui lòng nhập mật khẩu.';
  return passwordChecks(pw).every((c) => c.ok) ? null : `Mật khẩu chưa hợp lệ. ${PASSWORD_HINT}`;
}
