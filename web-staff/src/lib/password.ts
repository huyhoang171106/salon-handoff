/** Quy tắc mật khẩu giống backend: ≥ 6 ký tự, có cả chữ và số. */
export const PASSWORD_HINT = 'Tối thiểu 6 ký tự, có cả chữ và số.';

export function passwordError(pw: string): string | null {
  if (pw.length < 6) return 'Mật khẩu tối thiểu 6 ký tự';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Mật khẩu phải có cả chữ và số';
  return null;
}
