# การตรวจตำแหน่งสินค้า

ให้ระบบทราบรหัสสินค้าและรูปอ้างอิงก่อนหาตำแหน่งในเฟรม ใช้ร้านและภาพสาธิตที่แยกจาก catalog จริง ประเมินเป็นคู่สินค้า/เฟรม ทั้งภาพที่มีเป้าหมายและภาพที่ไม่มี

กำหนดกรอบด้วยตาใน [เฉลย](annotations.json) บน [ภาพตาราง](annotation-grid.png) ก่อนเรียกโมเดล เลือกตัวอย่างแบบเจาะจงหลากกรณี โดยผู้ประเมินหนึ่งคน อ้างอิงแกน x จากซ้ายและ y จากบน IoU คือพื้นที่ส่วนซ้อนทับหารด้วยพื้นที่รวมของกรอบเฉลยและกรอบทำนาย

โมเดล gpt-5.4

| Metric | Result |
| --- | ---: |
| Target/frame pairs | 12 |
| API errors | 0 |
| Successful requests scored (present / absent) | 8 / 4 |
| Mean IoU on present targets (missing box = 0) | 0.537 |
| IoU ≥ 0.50 on present targets | 5/8 |
| Present target with no box | 2/8 |
| Absent target with a false box | 0/4 |
| Average / max position request (ms) | 3121 / 5106 |
| Average when target absent, including errors (ms) | 1998 |

| Shop | Frame | Target | Ground truth | Predicted | IoU | ms |
| --- | --- | --- | --- | --- | ---: | ---: |
| kitchen | counter-blender-holdout-small-left | counter-blender | present | box | 0.604 | 3454 |
| kitchen | cooktop-holdout-occluded-right | cooktop | present | box | 0.900 | 5106 |
| fashion | two-products | gingham | present | box | 0.880 | 3884 |
| fashion | two-products | buffalo | present | none | 0.000 | 3947 |
| fashion | live-jersey-show | incas-stripe | present | box | 0.794 | 3939 |
| fashion | live-jersey-handover | incas-stripe | present | box | 0.410 | 4452 |
| fashion | dot-dress-view4-occluded-right | dot-dress | present | box | 0.709 | 2784 |
| electronics | battery-pack-holdout-dim-blur | battery-pack | present | none | 0.000 | 1891 |
| electronics | iphone4-stage | iphone-13-pro | absent | none | — | 2334 |
| kitchen | empty-with-speech | counter-blender | absent | none | — | 1387 |
| fashion | outside-plaid-dress | gingham | absent | none | — | 1894 |
| kitchen | shallow-pan-holdout | wok | absent | none | — | 2376 |

[เปรียบเทียบกรอบบนภาพทุกกรณี](candidate-gallery.html) · [คำตอบและเวลารายคำขอ](candidate-results.json)

จาก demo/ ให้รัน `node --import tsx bench/location/report.ts --candidate` เพื่อสร้างรายงานจากผลที่บันทึกไว้
