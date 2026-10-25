interface Props {
  status: string;
  map: Record<string, { label: string; tone: string }>;
}

/** Nhãn trạng thái dùng bảng ánh xạ trong lib/format. */
export default function StatusBadge({ status, map }: Props) {
  const s = map[status] ?? { label: status, tone: 'neutral' };
  return <span className={`badge ${s.tone}`}>{s.label}</span>;
}
