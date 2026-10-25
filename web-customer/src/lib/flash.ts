/** Thông báo hiển thị một lần (sau đăng ký / đổi mật khẩu), lưu tạm trong sessionStorage. */
export type Flash = 'welcome' | 'password-changed';
const KEY = 'salon_flash';

export function setFlash(f: Flash) {
  try {
    sessionStorage.setItem(KEY, f);
  } catch {
    /* ignore */
  }
}

export function takeFlash(): Flash | null {
  try {
    const v = sessionStorage.getItem(KEY) as Flash | null;
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
