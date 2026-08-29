// Nhãn mức độ nguy cơ dùng trong bảng hội thoại & modal chi tiết.
export function UrgencyBadge({ urgency }) {
  if (urgency === 'emergency') {
    return <span className="urgency-tag tag-red">Khẩn cấp (Đỏ)</span>
  } else if (urgency === 'warning') {
    return <span className="urgency-tag tag-yellow">Cần theo dõi (Vàng)</span>
  }
  return <span className="urgency-tag tag-green">Bình thường (Xanh)</span>
}
