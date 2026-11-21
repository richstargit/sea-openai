# การตรวจตำแหน่งสินค้า

ให้ระบบทราบรหัสสินค้าและรูปอ้างอิงก่อนหาตำแหน่งในเฟรม ใช้ร้านและภาพสาธิตที่แยกจาก catalog จริง ประเมินเป็นคู่สินค้า/เฟรม ทั้งภาพที่มีเป้าหมายและภาพที่ไม่มี

กำหนดกรอบด้วยตาใน [เฉลย](annotations.json) บน [ภาพตาราง](annotation-grid.png) ก่อนเรียกโมเดล เลือกตัวอย่างแบบเจาะจงหลากกรณี โดยผู้ประเมินหนึ่งคน อ้างอิงแกน x จากซ้ายและ y จากบน IoU คือพื้นที่ส่วนซ้อนทับหารด้วยพื้นที่รวมของกรอบเฉลยและกรอบทำนาย

โมเดล gpt-5.4

| Metric | Result |
| --- | ---: |
| Target/frame pairs | 12 |
| API errors | 0 |
| Successful requests scored (present / absent) | 8 / 4 |
| Mean IoU on present targets (missing box = 0) | 0.493 |
| IoU ≥ 0.50 on present targets | 5/8 |
| Present target with no box | 3/8 |
| Absent target with a false box | 0/4 |
| Average / max position request (ms) | 2833 / 4876 |
| Average when target absent, including errors (ms) | 1554 |

| Shop | Frame | Target | Ground truth | Predicted | IoU | ms |
| --- | --- | --- | --- | --- | ---: | ---: |
| kitchen | counter-blender-holdout-small-left | counter-blender | present | box | 0.796 | 4876 |
| kitchen | cooktop-holdout-occluded-right | cooktop | present | box | 0.913 | 3694 |
| fashion | two-products | gingham | present | box | 0.680 | 2877 |
| fashion | two-products | buffalo | present | none | 0.000 | 3583 |
| fashion | live-jersey-show | incas-stripe | present | box | 0.867 | 3085 |
| fashion | live-jersey-handover | incas-stripe | present | none | 0.000 | 3431 |
| fashion | dot-dress-view4-occluded-right | dot-dress | present | box | 0.684 | 3775 |
| electronics | battery-pack-holdout-dim-blur | battery-pack | present | none | 0.000 | 2455 |
| electronics | iphone4-stage | iphone-13-pro | absent | none | — | 2068 |
| kitchen | empty-with-speech | counter-blender | absent | none | — | 18 |
| fashion | outside-plaid-dress | gingham | absent | none | — | 1878 |
| kitchen | shallow-pan-holdout | wok | absent | none | — | 2252 |

[เปรียบเทียบกรอบบนภาพทุกกรณี](production-gallery.html) · [คำตอบและเวลารายคำขอ](production-results.json)

จาก demo/ ให้รัน `node --import tsx bench/location/report.ts --production` เพื่อสร้างรายงานจากผลที่บันทึกไว้
