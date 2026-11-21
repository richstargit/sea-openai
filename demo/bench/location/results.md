# การตรวจตำแหน่งสินค้า

ให้ระบบทราบรหัสสินค้าและรูปอ้างอิงก่อนหาตำแหน่งในเฟรม ใช้ร้านและภาพสาธิตที่แยกจาก catalog จริง ประเมินเป็นคู่สินค้า/เฟรม ทั้งภาพที่มีเป้าหมายและภาพที่ไม่มี

กำหนดกรอบด้วยตาใน [เฉลย](annotations.json) บน [ภาพตาราง](annotation-grid.png) ก่อนเรียกโมเดล เลือกตัวอย่างแบบเจาะจงหลากกรณี โดยผู้ประเมินหนึ่งคน อ้างอิงแกน x จากซ้ายและ y จากบน IoU คือพื้นที่ส่วนซ้อนทับหารด้วยพื้นที่รวมของกรอบเฉลยและกรอบทำนาย

โมเดล gpt-4.1-mini

| Metric | Result |
| --- | ---: |
| Target/frame pairs | 12 |
| API errors | 0 |
| Successful requests scored (present / absent) | 8 / 4 |
| Mean IoU on present targets (missing box = 0) | 0.280 |
| IoU ≥ 0.50 on present targets | 2/8 |
| Present target with no box | 0/8 |
| Absent target with a false box | 3/4 |
| Average / max position request (ms) | 1186 / 1509 |
| Average when target absent, including errors (ms) | 1181 |

| Shop | Frame | Target | Ground truth | Predicted | IoU | ms |
| --- | --- | --- | --- | --- | ---: | ---: |
| kitchen | counter-blender-holdout-small-left | counter-blender | present | box | 0.292 | 1136 |
| kitchen | cooktop-holdout-occluded-right | cooktop | present | box | 0.346 | 1042 |
| fashion | two-products | gingham | present | box | 0.342 | 1199 |
| fashion | two-products | buffalo | present | box | 0.000 | 1053 |
| fashion | live-jersey-show | incas-stripe | present | box | 0.550 | 1484 |
| fashion | live-jersey-handover | incas-stripe | present | box | 0.178 | 1311 |
| fashion | dot-dress-view4-occluded-right | dot-dress | present | box | 0.515 | 1184 |
| electronics | battery-pack-holdout-dim-blur | battery-pack | present | box | 0.018 | 1100 |
| electronics | iphone4-stage | iphone-13-pro | absent | none | — | 877 |
| kitchen | empty-with-speech | counter-blender | absent | box | — | 1202 |
| fashion | outside-plaid-dress | gingham | absent | box | — | 1509 |
| kitchen | shallow-pan-holdout | wok | absent | box | — | 1135 |

[เปรียบเทียบกรอบบนภาพทุกกรณี](gallery.html) · [คำตอบและเวลารายคำขอ](observations.json)

จาก demo/ ให้รัน `node --import tsx bench/location/report.ts` เพื่อสร้างรายงานจากผลที่บันทึกไว้
