# ผลทดสอบร้านจำลอง

ร้าน 3 ร้าน · ต้นทางที่นับแยกร้าน 28 กลุ่ม (รวมฉากว่างจำลอง) · กรณีทดสอบ 57 กรณี · คำขอ 228 ครั้ง

กรณีที่เปลี่ยนตำแหน่ง ขนาด หรือข้อความจากภาพต้นทางเดียวกันมีความสัมพันธ์กัน ควรวัดซ้ำด้วยเฟรมไลฟ์คนละช่วงก่อนใช้คะแนนเหล่านี้ตัดสินใจเปิดขายอัตโนมัติ

## เปรียบเทียบ 4 แบบบนเฟรมเดียวกัน

มีผลครบทั้ง 4 แบบบน 54/57 กรณี image ใช้ภาพล้วน ส่วน caption ส่งภาพกับข้อความที่กำกับกรณีนั้น เวลาเฉลี่ยและ p95 วัดเป็นมิลลิวินาที โดย p95 ใช้ลำดับที่ปัดขึ้น

| วิธี | อินพุต | ตอบถูก/คำขอ | SKU ถูก/เฟรมมีสินค้า | เลือก SKU/เฟรม none | พลาดเป็น none/เฟรมมีสินค้า | สลับ SKU/เฟรมมีสินค้า | Errors | เฉลี่ย ms | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| choice | image | 51/54 (94.4%) | 37/39 (94.9%) | 1/15 (6.7%) | 2/39 (5.1%) | 0/39 (0.0%) | 0 | 436 | 795 |
| choice | caption | 50/54 (92.6%) | 36/39 (92.3%) | 1/15 (6.7%) | 3/39 (7.7%) | 0/39 (0.0%) | 0 | 417 | 697 |
| reference | image | 43/54 (79.6%) | 29/39 (74.4%) | 1/15 (6.7%) | 10/39 (25.6%) | 0/39 (0.0%) | 0 | 958 | 2402 |
| reference | caption | 44/54 (81.5%) | 30/39 (76.9%) | 1/15 (6.7%) | 9/39 (23.1%) | 0/39 (0.0%) | 0 | 795 | 2260 |

## ทุกคำขอ

คอลัมน์ตอบถูก/คำขอนับ error ในตัวหาร คอลัมน์วิเคราะห์ข้อผิดพลาด SKU ใช้เฉพาะคำขอที่ได้ผลทำนาย เครื่องหมาย — หมายถึงไม่มีตัวอย่างสำหรับตัวหารนั้น

| วิธี | อินพุต | ตอบถูก/คำขอ | SKU ถูก/เฟรมมีสินค้า | เลือก SKU/เฟรม none | พลาดเป็น none/เฟรมมีสินค้า | สลับ SKU/เฟรมมีสินค้า | Errors | เฉลี่ย ms | p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| choice | image | 54/57 (94.7%) | 37/39 (94.9%) | 1/18 (5.6%) | 2/39 (5.1%) | 0/39 (0.0%) | 0 | 435 | 795 |
| choice | caption | 53/57 (93.0%) | 36/39 (92.3%) | 1/18 (5.6%) | 3/39 (7.7%) | 0/39 (0.0%) | 0 | 417 | 697 |
| reference | image | 43/57 (75.4%) | 29/39 (74.4%) | 1/15 (6.7%) | 10/39 (25.6%) | 0/39 (0.0%) | 3 | 943 | 2402 |
| reference | caption | 47/57 (82.5%) | 30/39 (76.9%) | 1/18 (5.6%) | 9/39 (23.1%) | 0/39 (0.0%) | 0 | 802 | 2260 |

## แยกตามร้าน

| ร้าน | วิธี | อินพุต | ตอบถูก/คำขอ | SKU ถูก/เฟรมมีสินค้า | เลือก SKU/เฟรม none | พลาดเป็น none/เฟรมมีสินค้า | สลับ SKU/เฟรมมีสินค้า | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| electronics | choice | image | 18/20 (90.0%) | 12/13 (92.3%) | 1/7 (14.3%) | 1/13 (7.7%) | 0/13 (0.0%) | 0 |
| electronics | choice | caption | 17/20 (85.0%) | 11/13 (84.6%) | 1/7 (14.3%) | 2/13 (15.4%) | 0/13 (0.0%) | 0 |
| electronics | reference | image | 14/20 (70.0%) | 9/13 (69.2%) | 1/6 (16.7%) | 4/13 (30.8%) | 0/13 (0.0%) | 1 |
| electronics | reference | caption | 15/20 (75.0%) | 9/13 (69.2%) | 1/7 (14.3%) | 4/13 (30.8%) | 0/13 (0.0%) | 0 |
| fashion | choice | image | 22/23 (95.7%) | 16/17 (94.1%) | 0/6 (0.0%) | 1/17 (5.9%) | 0/17 (0.0%) | 0 |
| fashion | choice | caption | 22/23 (95.7%) | 16/17 (94.1%) | 0/6 (0.0%) | 1/17 (5.9%) | 0/17 (0.0%) | 0 |
| fashion | reference | image | 18/23 (78.3%) | 13/17 (76.5%) | 0/5 (0.0%) | 4/17 (23.5%) | 0/17 (0.0%) | 1 |
| fashion | reference | caption | 22/23 (95.7%) | 16/17 (94.1%) | 0/6 (0.0%) | 1/17 (5.9%) | 0/17 (0.0%) | 0 |
| kitchen | choice | image | 14/14 (100.0%) | 9/9 (100.0%) | 0/5 (0.0%) | 0/9 (0.0%) | 0/9 (0.0%) | 0 |
| kitchen | choice | caption | 14/14 (100.0%) | 9/9 (100.0%) | 0/5 (0.0%) | 0/9 (0.0%) | 0/9 (0.0%) | 0 |
| kitchen | reference | image | 11/14 (78.6%) | 7/9 (77.8%) | 0/4 (0.0%) | 2/9 (22.2%) | 0/9 (0.0%) | 1 |
| kitchen | reference | caption | 10/14 (71.4%) | 5/9 (55.6%) | 0/5 (0.0%) | 4/9 (44.4%) | 0/9 (0.0%) | 0 |

## แยกตามสภาพภาพและข้อความ

| สภาพภาพและข้อความ | วิธี | อินพุต | ตอบถูก/คำขอ | SKU ถูก/เฟรมมีสินค้า | เลือก SKU/เฟรม none | พลาดเป็น none/เฟรมมีสินค้า | สลับ SKU/เฟรมมีสินค้า | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dim-blur | choice | image | 4/5 (80.0%) | 3/4 (75.0%) | 0/1 (0.0%) | 1/4 (25.0%) | 0/4 (0.0%) | 0 |
| dim-blur | choice | caption | 4/5 (80.0%) | 3/4 (75.0%) | 0/1 (0.0%) | 1/4 (25.0%) | 0/4 (0.0%) | 0 |
| dim-blur | reference | image | 3/5 (60.0%) | 2/4 (50.0%) | 0/1 (0.0%) | 2/4 (50.0%) | 0/4 (0.0%) | 0 |
| dim-blur | reference | caption | 3/5 (60.0%) | 2/4 (50.0%) | 0/1 (0.0%) | 2/4 (50.0%) | 0/4 (0.0%) | 0 |
| empty | choice | image | 3/3 (100.0%) | — | 0/3 (0.0%) | — | — | 0 |
| empty | choice | caption | 3/3 (100.0%) | — | 0/3 (0.0%) | — | — | 0 |
| empty | reference | image | 0/3 (0.0%) | — | — | — | — | 3 |
| empty | reference | caption | 3/3 (100.0%) | — | 0/3 (0.0%) | — | — | 0 |
| live-photo | choice | image | 3/5 (60.0%) | 1/2 (50.0%) | 1/3 (33.3%) | 1/2 (50.0%) | 0/2 (0.0%) | 0 |
| live-photo | choice | caption | 4/5 (80.0%) | 2/2 (100.0%) | 1/3 (33.3%) | 0/2 (0.0%) | 0/2 (0.0%) | 0 |
| live-photo | reference | image | 3/5 (60.0%) | 1/2 (50.0%) | 1/3 (33.3%) | 1/2 (50.0%) | 0/2 (0.0%) | 0 |
| live-photo | reference | caption | 4/5 (80.0%) | 2/2 (100.0%) | 1/3 (33.3%) | 0/2 (0.0%) | 0/2 (0.0%) | 0 |
| manual-crop | choice | image | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |
| manual-crop | choice | caption | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |
| manual-crop | reference | image | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |
| manual-crop | reference | caption | 2/3 (66.7%) | 2/3 (66.7%) | — | 1/3 (33.3%) | 0/3 (0.0%) | 0 |
| occluded-right | choice | image | 7/7 (100.0%) | 5/5 (100.0%) | 0/2 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0 |
| occluded-right | choice | caption | 6/7 (85.7%) | 4/5 (80.0%) | 0/2 (0.0%) | 1/5 (20.0%) | 0/5 (0.0%) | 0 |
| occluded-right | reference | image | 7/7 (100.0%) | 5/5 (100.0%) | 0/2 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0 |
| occluded-right | reference | caption | 6/7 (85.7%) | 4/5 (80.0%) | 0/2 (0.0%) | 1/5 (20.0%) | 0/5 (0.0%) | 0 |
| small-left | choice | image | 8/8 (100.0%) | 5/5 (100.0%) | 0/3 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0 |
| small-left | choice | caption | 8/8 (100.0%) | 5/5 (100.0%) | 0/3 (0.0%) | 0/5 (0.0%) | 0/5 (0.0%) | 0 |
| small-left | reference | image | 7/8 (87.5%) | 4/5 (80.0%) | 0/3 (0.0%) | 1/5 (20.0%) | 0/5 (0.0%) | 0 |
| small-left | reference | caption | 7/8 (87.5%) | 4/5 (80.0%) | 0/3 (0.0%) | 1/5 (20.0%) | 0/5 (0.0%) | 0 |
| source | choice | image | 20/20 (100.0%) | 14/14 (100.0%) | 0/6 (0.0%) | 0/14 (0.0%) | 0/14 (0.0%) | 0 |
| source | choice | caption | 20/20 (100.0%) | 14/14 (100.0%) | 0/6 (0.0%) | 0/14 (0.0%) | 0/14 (0.0%) | 0 |
| source | reference | image | 16/20 (80.0%) | 10/14 (71.4%) | 0/6 (0.0%) | 4/14 (28.6%) | 0/14 (0.0%) | 0 |
| source | reference | caption | 18/20 (90.0%) | 12/14 (85.7%) | 0/6 (0.0%) | 2/14 (14.3%) | 0/14 (0.0%) | 0 |
| stale-speech | choice | image | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |
| stale-speech | choice | caption | 2/3 (66.7%) | 2/3 (66.7%) | — | 1/3 (33.3%) | 0/3 (0.0%) | 0 |
| stale-speech | reference | image | 2/3 (66.7%) | 2/3 (66.7%) | — | 1/3 (33.3%) | 0/3 (0.0%) | 0 |
| stale-speech | reference | caption | 1/3 (33.3%) | 1/3 (33.3%) | — | 2/3 (66.7%) | 0/3 (0.0%) | 0 |
| two-products | choice | image | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |
| two-products | choice | caption | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |
| two-products | reference | image | 2/3 (66.7%) | 2/3 (66.7%) | — | 1/3 (33.3%) | 0/3 (0.0%) | 0 |
| two-products | reference | caption | 3/3 (100.0%) | 3/3 (100.0%) | — | 0/3 (0.0%) | 0/3 (0.0%) | 0 |

## การยกสินค้าให้กล้องดู

คำนวณจากกรณีที่ระบุเฉลย held_up และได้รับคำตอบ ค่าแถวไม่มีตัวอย่างจะแสดง —

| วิธี | อินพุต | ทายว่ายกถูก/ยกจริง | ทายว่าไม่ยกถูก/ไม่ได้ยกจริง | ทายว่ายกผิด/ไม่ได้ยกจริง |
| --- | --- | --- | --- | --- |
| choice | image | 3/3 (100.0%) | 53/53 (100.0%) | 0/53 (0.0%) |
| choice | caption | 3/3 (100.0%) | 53/53 (100.0%) | 0/53 (0.0%) |
| reference | image | 3/3 (100.0%) | 50/50 (100.0%) | 0/50 (0.0%) |
| reference | caption | 3/3 (100.0%) | 53/53 (100.0%) | 0/53 (0.0%) |

## ผลของข้อความประกอบ

เทียบคำทำนายเป็นคู่ภายในวิธีเดียวกัน เฉพาะคู่ที่ได้คำตอบทั้งสองครั้ง

| วิธี | สภาพ | คู่ | คำตอบเปลี่ยน | ผิด → ถูก | ถูก → ผิด | ผิด → ผิดตัวอื่น |
| --- | --- | --- | --- | --- | --- | --- |
| choice | รวม | 57 | 3 | 1 | 2 | 0 |
| choice | dim-blur | 5 | 0 | 0 | 0 | 0 |
| choice | empty | 3 | 0 | 0 | 0 | 0 |
| choice | live-photo | 5 | 1 | 1 | 0 | 0 |
| choice | manual-crop | 3 | 0 | 0 | 0 | 0 |
| choice | occluded-right | 7 | 1 | 0 | 1 | 0 |
| choice | small-left | 8 | 0 | 0 | 0 | 0 |
| choice | source | 20 | 0 | 0 | 0 | 0 |
| choice | stale-speech | 3 | 1 | 0 | 1 | 0 |
| choice | two-products | 3 | 0 | 0 | 0 | 0 |
| reference | รวม | 54 | 11 | 6 | 5 | 0 |
| reference | dim-blur | 5 | 0 | 0 | 0 | 0 |
| reference | empty | 0 | 0 | 0 | 0 | 0 |
| reference | live-photo | 5 | 1 | 1 | 0 | 0 |
| reference | manual-crop | 3 | 1 | 0 | 1 | 0 |
| reference | occluded-right | 7 | 1 | 0 | 1 | 0 |
| reference | small-left | 8 | 0 | 0 | 0 | 0 |
| reference | source | 20 | 4 | 3 | 1 | 0 |
| reference | stale-speech | 3 | 3 | 1 | 2 | 0 |
| reference | two-products | 3 | 1 | 1 | 0 | 0 |

| ร้าน/กรณี | สภาพ | วิธี | เฉลย | ภาพ | ภาพ+ข้อความ | ข้อความ |
| --- | --- | --- | --- | --- | --- | --- |
| electronics/previous-item-speech | stale-speech | reference | airpods | airpods | none | ตัวเมื่อกี้เป็นชุดหัวชาร์จ iPhone พร้อมสายค่ะ |
| electronics/two-products | two-products | reference | airpods | none | airpods | ดูตัวใหญ่ด้านขวาล่างนะคะ |
| electronics/wall-charger-holdout-occluded-right | occluded-right | choice | wall-charger | wall-charger | none | รุ่นนี้มีสายแยกให้ในชุดนะคะ |
| fashion/gingham-view3 | source | reference | gingham | none | gingham | อันนี้พับแขนได้นะคะ |
| fashion/live-jersey-handover | live-photo | choice | incas-stripe | none | incas-stripe | ชิ้นนี้ยังพับอยู่ค่ะ |
| fashion/live-jersey-handover | live-photo | reference | incas-stripe | none | incas-stripe | ชิ้นนี้ยังพับอยู่ค่ะ |
| fashion/previous-item-speech | stale-speech | choice | gingham | gingham | none | ตัวเมื่อกี้เป็นเชิ้ตตารางแดงดำค่ะ |
| fashion/previous-item-speech | stale-speech | reference | gingham | none | gingham | ตัวเมื่อกี้เป็นเชิ้ตตารางแดงดำค่ะ |
| fashion/tropical-view3 | source | reference | tropical | none | tropical | ตัวนี้ใส่ไปทะเลได้นะคะ |
| fashion/two-products-crop | manual-crop | reference | gingham | gingham | none | ดูตัวใหญ่ด้านขวาล่างนะคะ |
| kitchen/cooktop-holdout | source | reference | cooktop | cooktop | none | ปุ่มปรับจะเรียงอยู่ตรงขอบด้านหน้านะคะ |
| kitchen/cooktop-holdout-occluded-right | occluded-right | reference | cooktop | cooktop | none | ปุ่มปรับจะเรียงอยู่ตรงขอบด้านหน้านะคะ |
| kitchen/mug-rack-holdout | source | reference | mug-rack | none | mug-rack | เดี๋ยวลองแขวนให้ดูว่าวางของได้กี่ชิ้นค่ะ |
| kitchen/previous-item-speech | stale-speech | reference | counter-blender | counter-blender | none | ตัวเมื่อกี้เป็นเตาไฟฟ้าหน้าเรียบค่ะ |

## ตัวอย่างที่ตอบผิดด้วยความมั่นใจสูง

เรียงตามค่า confidence ภายในวิธีเดียวกัน สูงสุดวิธีละ 5 คำขอ กรณี Reference ตอบ none จะไม่มีค่า confidence

| วิธี | อินพุต | ร้าน/กรณี | สภาพ | เฉลย | ทำนาย | ความมั่นใจ |
| --- | --- | --- | --- | --- | --- | --- |
| choice | image | fashion/live-jersey-handover | live-photo | incas-stripe | none | 54.0% |
| choice | caption | electronics/battery-pack-holdout-dim-blur | dim-blur | battery-pack | none | 47.0% |
| choice | caption | electronics/wall-charger-holdout-occluded-right | occluded-right | wall-charger | none | 47.0% |
| choice | caption | electronics/iphone4-room | live-photo | none | iphone-x | 42.0% |
| choice | image | electronics/iphone4-room | live-photo | none | iphone-x | 41.0% |
| reference | caption | electronics/iphone4-stage | live-photo | none | iphone-x | 98.0% |
| reference | image | electronics/iphone4-stage | live-photo | none | iphone-x | 58.0% |

## คำขอที่ไม่ได้คำทำนาย

| ร้าน/กรณี | สภาพ | วิธี | อินพุต | ข้อความ |
| --- | --- | --- | --- | --- |
| electronics/empty-with-speech | empty | reference | image | โมเดลปฏิเสธการประเมิน กรุณาลองเฟรมอื่นหรือปรับข้อความประกอบ |
| fashion/empty-with-speech | empty | reference | image | โมเดลปฏิเสธการประเมิน กรุณาลองเฟรมอื่นหรือปรับข้อความประกอบ |
| kitchen/empty-with-speech | empty | reference | image | โมเดลปฏิเสธการประเมิน กรุณาลองเฟรมอื่นหรือปรับข้อความประกอบ |

