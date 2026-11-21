// Motion menus handed to /agent/live/understand: the model may only pick ids from these lists.
// Accent ids are textless overlay presets (backend/public/overlay/graphics); main ids are LiveCut event types
// the control room already builds, plus presets that need only { name, price, code, text }.

export const VFX_ACCENTS: [id: string, description: string][] = [
  ["fireworks", "พลุ · big celebration, sold out fast, huge deal, goal reached"],
  ["heart-burst-pop", "หัวใจลอย · love it, cute or lovely product, thanks to viewers"],
  ["heart-burst", "หัวใจลอยนุ่ม · soft cute or gentle mood, skincare"],
  ["reaction-burst-stars", "ดาวลอย · wow, premium or best-seller, praise"],
  ["reaction-burst-mix", "รีแอคชันรวม · lively crowd energy, giveaway, many reactions"],
  ["sparkle-doodle-burst", "ประกายวิบวับ · shiny, glowing, premium or beauty product reveal"],
  ["edge-glow", "ขอบจอเรืองแสง · hype, excitement, price reveal"],
  ["vignette-pulse", "ขอบมืดเต้น · tension, suspense before a reveal"],
  ["vignette-pulse-deep", "ขอบมืดเข้ม · urgency, last chance, almost sold out"],
  ["flash-cut", "แฟลชตัด · sudden punch, big number or price drop"],
  ["flash-cut-accent", "แฟลชสีแบรนด์ · deal announcement, new arrival"],
  ["frame-border-pop", "กรอบทั้งจอสีสด · fun promo, flash sale, giveaway"],
  ["frame-border-live", "กรอบไลฟ์สด · call to order, we are live, join now"],
  ["stripe-sweep-pop", "แถบสีกวาด · energetic transition into a new deal or product"],
];

export const COMBO_MAIN: [id: string, description: string][] = [
  ["price_pop", "เด้งราคา · host states a price"],
  ["price_drop", "ขีดฆ่าราคา · price cut, was X now Y, discount"],
  ["free_badge", "ป้ายของแถม · free shipping, free gift, bonus"],
  ["low_stock", "ป้ายเหลือน้อย · few left, almost sold out"],
  ["product_card", "การ์ดสินค้า · introducing or showing a product"],
  ["poll", "โพล · asks the audience to vote or choose"],
  ["cf-keycaps-pop", "ปุ่มพิมพ์ CF · how to order, type CF code in chat (data.code)"],
  ["free-ship-truck-pop", "รถส่งฟรี · free shipping highlight (data.text)"],
  ["flash-countdown-pop", "นับถอยหลังแฟลชเซล · flash sale, today only, limited time"],
  ["telop-pop-deal", "เทลอปตัวใหญ่ · big deal headline (data.text)"],
  ["stamp-word-hot", "ตราประทับมาแรง · best seller, hot item (data.text)"],
];
