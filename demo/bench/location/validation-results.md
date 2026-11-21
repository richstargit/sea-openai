# การตรวจตำแหน่งสินค้า

ให้ระบบทราบรหัสสินค้าและรูปอ้างอิงก่อนหาตำแหน่งในเฟรม ใช้ร้านและภาพสาธิตที่แยกจาก catalog จริง ประเมินเป็นคู่สินค้า/เฟรม ทั้งภาพที่มีเป้าหมายและภาพที่ไม่มี

กำหนดกรอบด้วยตาใน [เฉลย](validation.json) บน [ภาพตาราง](validation-grid.png) ก่อนเรียกโมเดล เลือกตัวอย่างแบบเจาะจงหลากกรณี โดยผู้ประเมินหนึ่งคน อ้างอิงแกน x จากซ้ายและ y จากบน IoU คือพื้นที่ส่วนซ้อนทับหารด้วยพื้นที่รวมของกรอบเฉลยและกรอบทำนาย

โมเดล gpt-5.4

| Metric | Result |
| --- | ---: |
| Target/frame pairs | 6 |
| API errors | 0 |
| Successful requests scored (present / absent) | 4 / 2 |
| Mean IoU on present targets (missing box = 0) | 0.611 |
| IoU ≥ 0.50 on present targets | 3/4 |
| Present target with no box | 1/4 |
| Absent target with a false box | 0/2 |
| Average / max position request (ms) | 3532 / 6810 |
| Average when target absent, including errors (ms) | 1969 |

| Shop | Frame | Target | Ground truth | Predicted | IoU | ms |
| --- | --- | --- | --- | --- | ---: | ---: |
| fashion | leaf-maxi-view3 | leaf-maxi | present | box | 0.912 | 6810 |
| fashion | tartan-view4-small-left | tartan | present | box | 0.850 | 2567 |
| kitchen | mug-rack-holdout-dim-blur | mug-rack | present | box | 0.683 | 4340 |
| electronics | wall-charger-holdout | wall-charger | present | none | 0.000 | 3538 |
| kitchen | wire-whisk-holdout | hand-blender | absent | none | — | 1897 |
| fashion | live-unrelated-worn | dot-dress | absent | none | — | 2041 |

[เปรียบเทียบกรอบบนภาพทุกกรณี](review.html) · [คำตอบและเวลารายคำขอ](validation-observations.json)

จาก demo/ ให้รัน `node --import tsx bench/location/report.ts --validation` เพื่อสร้างรายงานจากผลที่บันทึกไว้
