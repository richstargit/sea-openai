// Selling formats the video director knows (backend/src/services/video/sale-formats.ts), with Thai labels.
export const saleFormatOptions = [
  ["showcase", "แนะนำสินค้า"], ["promotion", "โปรลดราคา"], ["flash_sale", "แฟลชเซลล์"], ["new_launch", "สินค้าใหม่"],
  ["bundle", "เซ็ตคุ้ม / 1 แถม 1"], ["before_after", "ก่อน–หลัง"], ["how_to", "วิธีใช้ / สาธิต"], ["comparison", "เปรียบเทียบ"],
  ["review", "รีวิวลูกค้า"], ["unboxing", "แกะกล่อง"], ["ingredients", "ส่วนผสม / สเปก"], ["seasonal", "เทศกาล / ของขวัญ"],
  ["live_teaser", "โปรโมตไลฟ์"], ["restock", "ของกลับมาแล้ว"], ["voucher", "โค้ดส่วนลด / ส่งฟรี"], ["ugc", "คลิปแนวป้ายยา (UGC)"],
] as const;
export type SaleFormat = (typeof saleFormatOptions)[number][0];
