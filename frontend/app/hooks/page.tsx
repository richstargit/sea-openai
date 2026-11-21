import type { Metadata } from "next";
import { ProfileList } from "@/components/hooks/profile-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Hook Machine | SnapPromo",
  description: "เรียนรู้สไตล์การพูดจากคลิปที่คุณชอบ แล้วให้ AI เขียนสคริปต์สินค้าใหม่ตั้งแต่ฮุกจนจบคลิป",
};

export default function HooksPage() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex-1">
        <ProfileList />
      </main>
      <SiteFooter />
    </>
  );
}
