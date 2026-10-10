import { describe, expect, it } from "vitest";
import { DEVELOPER_CONTACTS, DEVELOPER_NAME } from "./developer";
import { guestAllowed } from "./offline/guest";

const by = (k: string) => DEVELOPER_CONTACTS.find((c) => c.key === k)!;

describe("عن المطور", () => {
  it("البيانات كما زوّد بها صاحب التطبيق حرفياً", () => {
    expect(DEVELOPER_NAME).toBe("م. إدريس الزوقري");
    expect(by("phone").value).toBe("776343551");
    expect(by("email").value).toBe("zoqriidris@gmail.com");
    expect(by("whatsapp").value).toBe("@rzleelzr");
    expect(by("facebook").value).toBe("إدريس الزوقري");
    expect(by("telegram").value).toBe("@rzleelzr");
    expect(by("address").value).toBe("اليمن _ إب _ جوبلة");
  });
  it("الروابط مشتقة من البيانات فقط", () => {
    expect(by("phone").href).toBe("tel:+967776343551");
    expect(by("email").href).toBe("mailto:zoqriidris@gmail.com");
    expect(by("whatsapp").href).toBe("https://wa.me/967776343551");
    expect(by("telegram").href).toBe("https://t.me/rzleelzr");
    expect(decodeURIComponent(by("facebook").href!)).toBe(
      "https://www.facebook.com/search/top?q=إدريس الزوقري",
    );
    expect(by("address").href).toBeNull();
  });
  it("متاح للضيف دون حساب ولا اتصال", () => {
    expect(guestAllowed("/about")).toBe(true);
  });
});
