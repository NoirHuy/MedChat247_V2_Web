export const SPECIALTIES = [
  { id: 'health_consultation', name: { vi: 'Chẩn đoán sàng lọc ban đầu', en: 'Health Consultation' } },
  { id: 'nutrition_consultation', name: { vi: 'Tư vấn dinh dưỡng', en: 'Nutrition Consultation' } },
  { id: 'general', name: { vi: 'Đa khoa', en: 'General Medicine' } },
  { id: 'dermatology', name: { vi: 'Da liễu', en: 'Dermatology' } },
  { id: 'nutrition', name: { vi: 'Dinh dưỡng', en: 'Nutrition' } },
]

export function getSpecialty(id) {
  return SPECIALTIES.find((s) => s.id === id) ?? SPECIALTIES[0]
}
