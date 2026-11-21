"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { ArrowRight, Camera, CircleAlert, ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { shrinkImage } from "@/components/studio/script/api";
import { type LiveProduct, catalog, productImage } from "@/lib/live-plan";
import type { StepProps } from "./live-studio";
import "../studio/video/video.css";
import "./steps.css";

// Same rule and wording as the detection service (demo/catalog.ts), so the message is translated once.
const ID_RULE = /^[a-zA-Z0-9_-]{1,64}$/;
const ID_MESSAGE = "รหัสต้องใช้ A–Z, a–z, 0–9, - หรือ _ ไม่เกิน 64 ตัว และห้ามใช้ none";
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_PHOTOS = 3;
const blank = { id: "", name: "", price: "", description: "", distinct: "" };

/** Hides a product photo that fails to load (also one that failed before React attached onError), so the placeholder shows. */
export const hideBroken = {
  ref: (img: HTMLImageElement | null) => { if (img?.complete && !img.naturalWidth) img.hidden = true; },
  onError: (event: { currentTarget: HTMLImageElement }) => { event.currentTarget.hidden = true; },
};
export const baht = (price: number) => "฿" + price.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** Step 1: the shop's products with 1–3 reference photos each. The detector matches the camera against these. */
export function CatalogStep({ products, reloadProducts, setPlan, next }: StepProps) {
  const { t } = useLanguage();
  const picker = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(blank);
  const [photos, setPhotos] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState("");
  const [problem, setProblem] = useState("");
  const [status, setStatus] = useState("");

  const field = (key: keyof typeof blank) => ({
    id: "ls-" + key, value: form[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: event.target.value })),
  });

  async function attach(files: File[]) {
    if (!files.length || saving) return;
    setProblem("");
    const pictures = files.filter((file) => ACCEPTED.includes(file.type));
    if (pictures.length !== files.length) setProblem("ใช้ได้เฉพาะรูป PNG JPEG หรือ WebP");
    else if (photos.length + pictures.length > MAX_PHOTOS) setProblem("เลือกภาพอ้างอิง 1–3 รูป");
    try {
      const urls = await Promise.all(pictures.slice(0, Math.max(0, MAX_PHOTOS - photos.length)).map((file) => shrinkImage(file, 1024)));
      setPhotos((current) => [...current, ...urls].slice(0, MAX_PHOTOS));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "อ่านรูปไม่ได้");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const id = form.id.trim();
    const name = form.name.trim();
    const price = Number(form.price);
    if (!ID_RULE.test(id) || id.toLowerCase() === "none") return setProblem(ID_MESSAGE);
    if (!form.price.trim() || !Number.isFinite(price) || price < 0) return setProblem("ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
    if (!photos.length) return setProblem("เลือกภาพอ้างอิง 1–3 รูป");
    setSaving(true);
    setProblem("");
    setStatus("");
    try {
      await catalog.add({ id, name, price, description: form.description.trim(), images: photos, ...(form.distinct.trim() ? { distinct: form.distinct.trim() } : {}) });
      await reloadProducts();
      setForm(blank);
      setPhotos([]);
      setStatus(t("เพิ่มสินค้าแล้ว") + " · " + name);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(product: LiveProduct) {
    if (!window.confirm(t("ลบสินค้านี้ออกจากคลัง?") + "\n" + product.name)) return;
    setRemoving(product.id);
    setProblem("");
    try {
      await catalog.remove(product.id);
      setPlan((plan) => ({ ...plan, lineup: plan.lineup.filter((item) => item.productId !== product.id) }));
      await reloadProducts();
      setStatus(t("ลบสินค้าแล้ว") + " · " + product.name);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "ลบสินค้าไม่สำเร็จ");
    } finally {
      setRemoving("");
    }
  }

  return <div className="vs ls">
    <header className="ls-head">
      <p className="ls-kicker">{t("ขั้นที่ 1 จาก 4")}</p>
      <h2>{t("คลังสินค้า")}</h2>
      <p>{t("เพิ่มสินค้าที่จะขายในไลฟ์พร้อมรูปอ้างอิง ระหว่างไลฟ์ระบบจะเทียบภาพจากกล้องกับรูปและคำอธิบายเหล่านี้ เพื่อรู้ว่าแม่ค้ากำลังถือชิ้นไหนอยู่")}</p>
    </header>

    <div className="ls-catalog">
      <section className="ls-catalog-list" aria-labelledby="ls-products-title">
        <div className="ls-list-head">
          <h3 id="ls-products-title">{t("สินค้าในคลัง")}</h3>
          <span className="vs-chip">{products.length} {t("ชิ้น")}</span>
        </div>
        {products.length === 0
          ? <div className="ls-empty">
              <span className="ls-empty-icon" aria-hidden><Camera size={26} strokeWidth={1.6} /></span>
              <h4>{t("ยังไม่มีสินค้าในคลัง")}</h4>
              <p>{t("รูปอ้างอิงคือสิ่งที่ทำให้ระบบจับสินค้าได้แบบเรียลไทม์ ยิ่งรูปชัดและคำอธิบายตรง ป้ายชื่อและราคาก็ยิ่งขึ้นตรงกับของที่ถืออยู่")}</p>
              <ul>
                <li>{t("ถ่ายสินค้าชิ้นจริง 1–3 มุม บนพื้นเรียบและแสงสว่าง")}</li>
                <li>{t("เขียนรูปลักษณ์ให้ชัด เช่น สี ทรง ฉลาก ขนาด")}</li>
                <li>{t("ถ้ามีรุ่นที่หน้าตาคล้ายกัน ให้ใส่จุดแยกรุ่น")}</li>
              </ul>
            </div>
          : <ul className="ls-products">
              {products.map((product) => <li key={product.id} className="ls-product">
                <div className="ls-product-img">
                  <Camera size={28} strokeWidth={1.5} aria-hidden />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.images[0] && <img src={productImage(product.images[0])} alt="" loading="lazy" {...hideBroken} />}
                  {product.images.length > 1 && <span className="ls-badge">{product.images.length} {t("รูป")}</span>}
                  <button type="button" className="ls-product-del" aria-label={t("ลบสินค้า") + " " + product.name} disabled={removing === product.id} onClick={() => void remove(product)}>
                    {removing === product.id ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Trash2 size={16} aria-hidden />}
                  </button>
                </div>
                <div className="ls-product-body">
                  <div className="ls-product-top"><h4>{product.name}</h4><span className="ls-price">{baht(product.price)}</span></div>
                  <span className="ls-code">CF {product.id}</span>
                  <p className="ls-desc">{product.description}</p>
                  {product.distinct && <p className="ls-distinct"><b>{t("จุดแยกรุ่น")}</b> {product.distinct}</p>}
                </div>
              </li>)}
            </ul>}
      </section>

      <form className={`vs-card ls-form ${dragging ? "is-dragging" : ""}`} aria-labelledby="ls-add-title" onSubmit={(event) => void add(event)} noValidate
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void attach(Array.from(event.dataTransfer.files)); }}>
        <fieldset disabled={saving}>
          <h3 id="ls-add-title">{t("เพิ่มสินค้า")}</h3>
          <div className="ls-grid2">
            <div className="vs-field">
              <label htmlFor="ls-id">{t("รหัส (CF)")}</label>
              <input {...field("id")} required maxLength={64} autoComplete="off" spellCheck={false} placeholder="A01" aria-describedby="ls-id-hint" />
            </div>
            <div className="vs-field">
              <label htmlFor="ls-price">{t("ราคา (บาท)")}</label>
              <input {...field("price")} required type="number" inputMode="decimal" min={0} step="any" placeholder="299" />
            </div>
          </div>
          <small className="vs-hint" id="ls-id-hint">{t("ลูกค้าพิมพ์รหัสนี้ในคอมเมนต์เพื่อสั่งซื้อ ใช้ A–Z, 0–9, - หรือ _")}</small>
          <div className="vs-field">
            <label htmlFor="ls-name">{t("ชื่อสินค้า")}</label>
            <input {...field("name")} required maxLength={120} />
          </div>
          <div className="vs-field">
            <label htmlFor="ls-description">{t("คำอธิบายรูปลักษณ์")}</label>
            <textarea {...field("description")} required maxLength={500} aria-describedby="ls-description-hint" placeholder={t("เช่น ขวดแก้วสีชา ฝาปั๊มสีทอง ฉลากครีมตัวหนังสือสีเขียว")} />
            <small className="vs-hint" id="ls-description-hint">{t("ระบบจับสินค้าใช้คำอธิบายนี้ เขียนสิ่งที่มองเห็นได้จากกล้อง")}</small>
          </div>
          <div className="vs-field">
            <label htmlFor="ls-distinct">{t("จุดแยกรุ่น (ไม่บังคับ)")}</label>
            <textarea {...field("distinct")} maxLength={300} className="ls-short" placeholder={t("เช่น รุ่นนี้ฝาสีทอง ส่วนรุ่นเล็กฝาสีเงิน")} />
          </div>

          <div className="vs-field">
            <span className="ls-field-label" id="ls-photos-label">{t("รูปอ้างอิง 1–3 รูป")}</span>
            <input type="file" ref={picker} hidden multiple accept={ACCEPTED.join(",")} aria-label={t("เลือกรูป")}
              onChange={(event) => { void attach(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            {photos.length === 0
              ? <button type="button" className="ls-drop" aria-describedby="ls-photos-label" onClick={() => picker.current?.click()}>
                  <ImagePlus size={24} strokeWidth={1.6} aria-hidden />
                  <span><strong>{t("ลากรูปมาวาง หรือเลือกรูป")}</strong><small>PNG, JPEG, WebP · {t("ย่อเหลือ 1024 px ในเบราว์เซอร์")}</small></span>
                </button>
              : <ul className="vs-photos ls-photos" aria-labelledby="ls-photos-label">
                  {photos.map((url, n) => <li key={url.slice(-32) + n}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`${t("รูป")} ${n + 1}`} />
                    <button type="button" className="vs-photo-remove" aria-label={`${t("เอารูปออก")} ${n + 1}`} onClick={() => setPhotos((current) => current.filter((_, i) => i !== n))}><X size={14} aria-hidden /></button>
                  </li>)}
                  {photos.length < MAX_PHOTOS && <li>
                    <button type="button" className="vs-photo-add" aria-label={t("เพิ่มรูป")} onClick={() => picker.current?.click()}><Plus size={22} aria-hidden /></button>
                  </li>}
                </ul>}
          </div>

          {problem && <div className="vs-notice" data-tone="error" role="alert">
            <span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(problem)}</p>
          </div>}
          <button type="submit" className="vs-btn ls-submit">
            {saving ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
            {t(saving ? "กำลังบันทึก…" : "เพิ่มเข้าคลัง")}
          </button>
          <p className="vs-hint" role="status">{status}</p>
        </fieldset>
      </form>
    </div>

    <footer className="ls-foot">
      {products.length === 0 && <p>{t("เพิ่มสินค้าอย่างน้อย 1 ชิ้นก่อน")}</p>}
      <button type="button" className="vs-go" disabled={products.length === 0} onClick={next}>
        {t("ต่อไป: เลือกสไตล์ไลฟ์")}<ArrowRight size={18} aria-hidden />
      </button>
    </footer>
  </div>;
}
