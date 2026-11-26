// ~70 s cut for Reels / TikTok / Status. Same engine, trimmed clips (from/to in source seconds).
export const SCENES = [
  {
    type: 'text', bars: 2, music: 'intro',
    beats: [
      { at: 0.0, lines: ['مدرب شخصي؟ 💪'], style: 'big' },
      { at: 1.6, lines: ['ورق', 'واتساب', 'إكسيل', 'نوتس', 'آلة حاسبة'], style: 'chaos' },
    ],
    caption: 'لسه بتلف بين الورق والواتساب والإكسيل؟',
  },
  {
    type: 'text', bars: 1, music: 'build',
    beats: [{ at: 0, lines: ['كل ده…', 'في تطبيق واحد'], style: 'stack' }],
    caption: 'كل شغلك في تطبيق واحد',
  },
  { type: 'logo', bars: 2, music: 'drop', caption: 'كوتش — مساعدك الشخصي كمدرب' },
  {
    type: 'phone', clip: 'program', from: 8, to: 19, bars: 4, music: 'drop', n: '01', title: 'برنامج تمرين في ثانية', sub: 'على مقاس العميل وإصابته',
    captions: ['اختار المستوى والإصابة… والبرنامج يطلع لوحده'],
    pills: [{ text: 'يراعي الإصابات', icon: '🩹' }, { text: 'سيتات كل عضلة', icon: '📊' }],
  },
  {
    type: 'phone', clip: 'library', from: 9, to: 18, bars: 3, music: 'drop', n: '02', title: '+1000 تمرين', sub: 'بأسماء الجيم اللي بنقولها',
    captions: ['1082 تمرين بالصور ونصايح الأداء'],
    pills: [{ text: 'بنش برس · سكوات · ديدليفت', icon: '🏋️' }],
  },
  {
    type: 'phone', clip: 'diet', from: 2, to: 15, bars: 4, music: 'drop', n: '03', title: 'دايت أسبوع أوتوماتيك', sub: 'تنشيف · تضخيم · بالجرام',
    captions: ['دايت أسبوع كامل من أكل مصري بالجرام — وكل وجبة ليها بدائل'],
    pills: [{ text: 'بدائل لكل وجبة', icon: '🔄' }, { text: 'رمضان و IF', icon: '🌙' }],
  },
  { type: 'pdf', bars: 3, music: 'drop', caption: 'ملف PDF باسمك ولوجو بتاعك… تبعته واتساب' },
  {
    type: 'viewer', clip: 'viewer', from: 0, to: 13, bars: 4, music: 'drop', n: '04', title: 'صفحة خاصة لكل عميل', sub: 'من أي موبايل',
    captions: ['العميل يشوف تمرينه وأكله ويبعتلك متابعته — مشفّرة بالكامل'],
    pills: [{ text: 'متابعة أسبوعية', icon: '📬' }],
  },
  {
    type: 'phone', clip: 'assistant', from: 1, to: 12, bars: 3, music: 'drop', n: '05', title: 'مساعد ذكاء اصطناعي', sub: 'بالعامية',
    captions: ['«احجز لسارة بكرة 8 الصبح» — ومينفذش غير بموافقتك'],
    pills: [{ text: 'مجاني بـ Groq', icon: '🤖' }],
  },
  {
    type: 'stats', bars: 3, music: 'break',
    items: [
      { value: 1082, label: 'تمرين' },
      { value: 342, label: 'وصفة' },
      { value: 315, label: 'صنف أكل' },
      { value: 0, label: 'جنيه اشتراك شهري' },
    ],
    caption: 'شغال من غير نت — وبياناتك على موبايلك انت',
  },
  { type: 'cta', bars: 5, music: 'drop', caption: 'اطلب كود التفعيل دلوقتي' },
];
