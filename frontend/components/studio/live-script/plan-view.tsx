"use client";

import { useLanguage } from "@/components/language-provider";
import type { Playbook } from "./api";

type Item = { text: string; sub?: string; chip?: string };
type Group = { key: string; title: string; items: Item[] };

// Thai titles for the groups the playbook is expected to hold. Any other group is still shown, under its own name.
const TITLE: Record<string, string> = {
  openingHooks: "ฮุกเปิดไลฟ์", hooks: "ฮุกเปิดไลฟ์", opening: "ฮุกเปิดไลฟ์",
  rehooks: "ประโยคดึงคนที่เพิ่งเข้ามา",
  pitches: "บทแนะนำสินค้า", pitch: "บทแนะนำสินค้า", features: "จุดเด่นของสินค้า", demo: "สาธิต",
  price: "ราคา", offer: "ข้อเสนอ", offers: "ข้อเสนอ",
  chatPrompts: "ชวนคุยในแชต", chat: "ชวนคุยในแชต", engagement: "ชวนคุยในแชต",
  objections: "ตอบข้อสงสัย", transitions: "ช่วงเชื่อม", closing: "ปิดไลฟ์", close: "ปิดไลฟ์",
};
// Data that is not lines to say.
const SKIP = new Set(["cues", "meta", "warnings", "sources", "facts", "research", "id"]);
const PER_GROUP = 14;

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const asRecord = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** One entry of a group, in whichever of the usual shapes it comes: a string, a text, a question and answer, or a list of lines. */
function itemsFrom(entry: unknown): Item[] {
  if (isText(entry)) return [{ text: entry.trim() }];
  const record = asRecord(entry);
  if (!record) return [];
  if (isText(record.question) && isText(record.answer)) {
    const sub = [record.answer, record.ifUnknown].filter(isText).join(" ");
    return [{ text: record.question.trim(), sub }];
  }
  if (Array.isArray(record.lines)) {
    const label = isText(record.label) ? record.label : undefined;
    return record.lines.flatMap((line) => itemsFrom(line)).map((item, n) => (n === 0 && label ? { ...item, chip: label } : item));
  }
  for (const key of ["text", "line", "say", "hook", "reply"]) {
    const value = record[key];
    if (isText(value)) return [{ text: value.trim(), chip: isText(record.grade) ? record.grade : undefined, sub: isText(record.note) ? record.note : undefined }];
  }
  return [];
}

/** Walk the playbook one level deep and collect every group of lines it holds. */
export function collectGroups(playbook: Playbook): Group[] {
  const groups: Group[] = [];
  const add = (key: string, title: string, entries: unknown) => {
    const items = (Array.isArray(entries) ? entries : [entries]).flatMap(itemsFrom).slice(0, PER_GROUP);
    if (items.length > 0) groups.push({ key, title, items });
  };
  for (const [key, value] of Object.entries(playbook)) {
    if (SKIP.has(key)) continue;
    const inner = asRecord(value);
    if (inner) {
      for (const [innerKey, innerValue] of Object.entries(inner)) {
        if (!SKIP.has(innerKey)) add(`${key}.${innerKey}`, TITLE[innerKey] ?? TITLE[key] ?? innerKey, innerValue);
      }
    } else {
      add(key, TITLE[key] ?? key, value);
    }
  }
  return groups;
}

/**
 * Everything the playbook holds, one group per kind of line. The shape of the playbook is not fixed by the contract,
 * so every field is checked before it is drawn: a field that is missing or renamed only costs its own group.
 */
export function PlanView({ playbook, warnings }: { playbook: Playbook; warnings: string[] }) {
  const { t } = useLanguage();
  const groups = collectGroups(playbook);
  if (groups.length === 0 && warnings.length === 0) return <p className="vs-hint">{t("ยังไม่มีบทให้ดู")}</p>;

  return <div className="ls-plan">
    {groups.map((group) => <section className="ls-group" key={group.key}>
      <h3>{t(group.title)}</h3>
      <ul className="ls-lines-list">
        {group.items.map((item, n) => <li key={`${n}-${item.text}`}>
          <p>{item.text}</p>
          {item.chip && <span className="vs-chip">{item.chip}</span>}
          {item.sub && <p className="ls-quiet">{item.sub}</p>}
        </li>)}
      </ul>
    </section>)}
    {warnings.length > 0 && <section className="ls-group">
      <h3>{t("ข้อสังเกตจากระบบ")}</h3>
      <ul className="ls-lines-list ls-quiet">{warnings.map((w, n) => <li key={`${n}-${w}`}><p>{t(w)}</p></li>)}</ul>
    </section>}
  </div>;
}
