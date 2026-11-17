// Strings for the exercise detail extras (cues, muscle illustration, clients using the exercise).
// Gym terms stay transliterated (src/i18n/fitness-terms.ts); never translate them here.
export const exercises = {
  detail: {
    cues: 'نصايح الأداء',
    cuesHint: 'نقاط سريعة تفكّر بيها العميل وقت التمرين.',
    illustration: 'العضلات المستهدفة',
    illustrationAlt: 'رسمة العضلات المستهدفة في {name}',
    illustrationLegend: 'الغامق: العضلة الأساسية، الفاتح: العضلات المساعدة',
    illustrationSlide: 'رسمة العضلات',
    clients: 'عملاؤك اللي عندهم التمرين ده',
    clientsHint: 'العملاء اللي التمرين ده موجود في برنامجهم.',
    clientsPrograms: 'في برنامج: {programs}',
    alternativesHint: 'نفس العضلة الأساسية، الأقرب في الحركة والأداة الأول.',
  },
  names: {
    nameAr: 'الاسم بالعربي',
    nameEn: 'الاسم بالإنجليزي (اختياري)',
    nameEnHint: 'بيظهر لما تختار اللغة الإنجليزية.',
    nameEnDefault: 'سيبه فاضي للاسم الأصلي: {name}',
  },
} as const;
