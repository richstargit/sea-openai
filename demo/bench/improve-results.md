| วิธี | ถูก | ขึ้นสินค้าผิดตัว | ตอบ none ทั้งที่มีสินค้า | rerank กี่เฟรม | เวลาเฉลี่ย | ช้าสุด |
|---|---:|---:|---:|---:|---:|---:|
| base | 54/57 | 1 | 2 | 0 | 468 ms | 907 ms |
| contrast | 54/57 | 0 | 3 | 0 | 496 ms | 907 ms |
| rerank | 52/57 | 1 | 4 | 12 | 576 ms | 1749 ms |
| contrast+rerank | 52/57 | 1 | 4 | 10 | 580 ms | 1588 ms |

เฟรมที่พลาด:
- base · electronics/battery-pack-holdout-dim-blur (dim-blur) เฉลย battery-pack → none
- base · electronics/iphone4-room (live-photo) เฉลย none → iphone-x
- base · fashion/live-jersey-handover (live-photo) เฉลย incas-stripe → none
- contrast · electronics/battery-pack-holdout (source) เฉลย battery-pack → none
- contrast · electronics/battery-pack-holdout-dim-blur (dim-blur) เฉลย battery-pack → none
- contrast · fashion/live-jersey-handover (live-photo) เฉลย incas-stripe → none
- rerank · electronics/battery-pack-holdout (source) เฉลย battery-pack → none (stage1 battery-pack)
- rerank · electronics/iphone4-room (live-photo) เฉลย none → iphone-x (stage1 iphone-x)
- rerank · fashion/gingham-view3 (source) เฉลย gingham → none (stage1 gingham)
- rerank · fashion/previous-item-speech (stale-speech) เฉลย gingham → none (stage1 gingham)
- rerank · fashion/two-products-crop (manual-crop) เฉลย gingham → none (stage1 gingham)
- contrast+rerank · electronics/battery-pack-holdout (source) เฉลย battery-pack → none (stage1 none)
- contrast+rerank · electronics/iphone4-room (live-photo) เฉลย none → iphone-x (stage1 none)
- contrast+rerank · fashion/gingham-view3 (source) เฉลย gingham → none (stage1 gingham)
- contrast+rerank · fashion/live-jersey-handover (live-photo) เฉลย incas-stripe → none
- contrast+rerank · fashion/previous-item-speech (stale-speech) เฉลย gingham → none (stage1 gingham)
