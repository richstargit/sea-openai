# เปรียบเทียบโมเดลตีกรอบสินค้า

กำหนด SKU เป้าหมายจากเฉลยให้ทุกรุ่น ใช้ภาพ เฉลย รูปอ้างอิง พรอมป์ ขนาดภาพ 512 px และ reasoning low ชุดเดียวกัน เรียก Responses หนึ่งครั้งต่อคู่สินค้าและเฟรมต่อรุ่น ยกเว้นภาพสีล้วนที่ตรวจในเครื่อง สลับลำดับโมเดลตามเฟรมและรันพร้อมกันสูงสุดสองงาน

กรอบผ่านเมื่อ IoU ≥ 0.50 คะแนน IoU เฉลี่ยรวมกรณีที่ขาดกรอบเป็นศูนย์ เวลาระบุตำแหน่งรวมการเตรียมรูป การรับผล และการรอคำขอที่ผิดพลาด ข้ามภาพสีล้วนที่ประมวลผลในเครื่อง เวลาจำแนก SKU วัดแยกในรายงาน Decisions

| ชุด | โมเดล | กรอบผ่าน / มีเป้าหมาย | IoU เฉลี่ย | กรอบผิด / ไม่มีเป้าหมาย | เวลาเฉลี่ย (ms) | มัธยฐาน (ms) | สูงสุด (ms) | ข้อผิดพลาด |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| รวม | gpt-5.4 | 8/12 | 0.507 | 0/6 | 4390 | 3887 | 7430 | 0 |
| รวม | gpt-6-luna | 7/12 | 0.585 | 0/6 | 6466 | 6102 | 15152 | 0 |
| รวม | gpt-6.2-sol | 10/12 | 0.768 | 0/6 | 3039 | 2714 | 8643 | 0 |
| รวม | gpt-6.2-astra | 11/12 | 0.831 | 0/6 | 7006 | 3987 | 58105 | 0 |
| ชุดแรก | gpt-5.4 | 4/8 | 0.387 | 0/4 | 4634 | 4396 | 7430 | 0 |
| ชุดแรก | gpt-6-luna | 3/8 | 0.461 | 0/4 | 7309 | 7013 | 15152 | 0 |
| ชุดแรก | gpt-6.2-sol | 6/8 | 0.712 | 0/4 | 3247 | 2487 | 8643 | 0 |
| ชุดแรก | gpt-6.2-astra | 7/8 | 0.805 | 0/4 | 3708 | 3984 | 4193 | 0 |
| ชุดภาพใหม่ | gpt-5.4 | 4/4 | 0.747 | 0/2 | 3941 | 3776 | 6904 | 0 |
| ชุดภาพใหม่ | gpt-6-luna | 4/4 | 0.833 | 0/2 | 4921 | 5712 | 7097 | 0 |
| ชุดภาพใหม่ | gpt-6.2-sol | 4/4 | 0.880 | 0/2 | 2656 | 2756 | 3272 | 0 |
| ชุดภาพใหม่ | gpt-6.2-astra | 4/4 | 0.883 | 0/2 | 13052 | 4208 | 58105 | 0 |

## ผลกรอบบนแต่ละเฟรม

ตัวเลขเป็น IoU ของกรอบที่โมเดลให้ เทียบกับกรอบเฉลยของสินค้าในภาพนั้น

| เฟรม | เป้าหมาย | gpt-5.4 | gpt-6-luna | gpt-6.2-sol | gpt-6.2-astra |
|---|---|---:|---:|---:|---:|
| [counter-blender-holdout-small-left](../frames/kitchen/counter-blender-holdout-small-left.jpg) | counter-blender | ขาดกรอบ | 0.228 | 0.908 | 0.947 |
| [cooktop-holdout-occluded-right](../frames/kitchen/cooktop-holdout-occluded-right.jpg) | cooktop | 0.934 | 0.492 | 0.939 | 0.928 |
| [two-products](../frames/fashion/two-products.jpg) | gingham | 0.667 | 0.693 | 0.973 | 0.969 |
| [two-products](../frames/fashion/two-products.jpg) | buffalo | ขาดกรอบ | ขาดกรอบ | 0.936 | 0.941 |
| [live-jersey-show](../frames/fashion/live-jersey-show.jpg) | incas-stripe | 0.833 | 0.868 | 0.970 | 0.947 |
| [live-jersey-handover](../frames/fashion/live-jersey-handover.jpg) | incas-stripe | ขาดกรอบ | 0.488 | ขาดกรอบ | 0.743 |
| [dot-dress-view4-occluded-right](../frames/fashion/dot-dress-view4-occluded-right.jpg) | dot-dress | 0.663 | 0.921 | 0.971 | 0.962 |
| [battery-pack-holdout-dim-blur](../frames/electronics/battery-pack-holdout-dim-blur.jpg) | battery-pack | ขาดกรอบ | ขาดกรอบ | ขาดกรอบ | ขาดกรอบ |
| [iphone4-stage](../frames/electronics/iphone4-stage.jpg) | iphone-13-pro | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก |
| [empty-with-speech](../frames/kitchen/empty-with-speech.jpg) | counter-blender | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก |
| [outside-plaid-dress](../frames/fashion/outside-plaid-dress.jpg) | gingham | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก |
| [shallow-pan-holdout](../frames/kitchen/shallow-pan-holdout.jpg) | wok | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก |
| [leaf-maxi-view3](../frames/fashion/leaf-maxi-view3.jpg) | leaf-maxi | 0.857 | 0.982 | 0.981 | 0.995 |
| [tartan-view4-small-left](../frames/fashion/tartan-view4-small-left.jpg) | tartan | 0.602 | 0.754 | 0.934 | 0.928 |
| [mug-rack-holdout-dim-blur](../frames/kitchen/mug-rack-holdout-dim-blur.jpg) | mug-rack | 0.905 | 0.622 | 0.634 | 0.633 |
| [wall-charger-holdout](../frames/electronics/wall-charger-holdout.jpg) | wall-charger | 0.624 | 0.972 | 0.971 | 0.976 |
| [wire-whisk-holdout](../frames/kitchen/wire-whisk-holdout.jpg) | hand-blender | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก |
| [live-unrelated-worn](../frames/fashion/live-unrelated-worn.jpg) | dot-dress | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก | เว้นกรอบถูก |

สามร้านจำลอง มีเสื้อผ้า เครื่องครัว และอิเล็กทรอนิกส์ สองกรณีในชุดแรกใช้เฟรมเสื้อสองตัวร่วมกันโดยระบุคนละเป้าหมาย ชุดภาพใหม่ใช้คนละภาพต้นทางกับชุดแรก ทั้งสองชุดมีขนาดเล็กและใช้วัดตำแหน่งเมื่อทราบ SKU แล้ว

[ผลรายเฟรม](model-comparison.jsonl) · [เฉลยชุดแรก](annotations.json) · [เฉลยชุดภาพใหม่](validation.json)

อ่านผลล่าสุดที่บันทึกไว้จาก demo ด้วย `node --import tsx bench/location/compare-models.ts --report-only` เอา `--report-only` ออกเพื่อทดสอบผ่าน API โดยใช้ผลสำเร็จเดิมซ้ำเมื่อโค้ดตัวตีกรอบ ภาพ และโจทย์ตรงกัน
