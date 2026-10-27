/** SĐT di động VN. Chuỗi toàn số 0 là hồ sơ "khách vãng lai" nội bộ nên không được nhập. */
export const PHONE_RE = /^(?!0+$)0\d{9,10}$/;
export const PHONE_MSG = 'Số điện thoại không hợp lệ';

/** SĐT dành riêng cho hồ sơ khách vãng lai dùng chung (Customer.isAnonymous). */
export const ANON_PHONE = '0000000000';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
export const PASSWORD_MSG = 'Mật khẩu tối thiểu 6 ký tự, có cả chữ và số';
