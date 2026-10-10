import type { Page } from "@playwright/test";

/**
 * فحص وصول آلي خفيف (بلا axe في الاعتماديات)، مشترك بين more-a11y وdaily-record-a11y: اسم مقروء لكل عنصر
 * تفاعلي، و`alt` لكل صورة، ومعرّفات فريدة، ومراجع aria موجودة، وh1 واحد، وlang/dir على <html>،
 * وأهداف لمس 24px على الأقل (WCAG 2.2 AA 2.5.8).
 */
export async function audit(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const textOf = (el: Element): string => {
      const by = el.getAttribute("aria-labelledby");
      if (by)
        return by
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      const label = el.getAttribute("aria-label");
      if (label?.trim()) return label.trim();
      const id = el.getAttribute("id");
      if (id) {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l?.textContent?.trim()) return l.textContent.trim();
      }
      const wrap = el.closest("label");
      if (wrap?.textContent?.trim()) return wrap.textContent.trim();
      const alt = Array.from(el.querySelectorAll("img[alt]"))
        .map((i) => i.getAttribute("alt"))
        .join(" ");
      return `${el.textContent ?? ""} ${alt} ${el.getAttribute("title") ?? ""}`.trim();
    };
    const html = document.documentElement;
    if (!html.lang) out.push("html بلا lang");
    if (!html.dir) out.push("html بلا dir");
    const interactive = document.querySelectorAll(
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="radio"], [role="switch"], [role="link"], summary',
    );
    for (const el of Array.from(interactive)) {
      if (el.closest("[aria-hidden='true']") || !visible(el)) continue;
      const desc = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} «${(el.outerHTML || "").slice(0, 80)}»`;
      if (!textOf(el)) out.push(`بلا اسم: ${desc}`);
      const r = (el as HTMLElement).getBoundingClientRect();
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (!inline && (r.width < 24 || r.height < 24))
        out.push(`هدف صغير ${Math.round(r.width)}×${Math.round(r.height)}: ${desc}`);
    }
    for (const img of Array.from(document.querySelectorAll("img"))) {
      if (!img.hasAttribute("alt")) out.push(`صورة بلا alt: ${img.src.slice(0, 60)}`);
    }
    const ids = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll("[id]")))
      ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) out.push(`معرّف مكرّر: ${id} ×${n}`);
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
      for (const el of Array.from(document.querySelectorAll(`[${attr}]`))) {
        for (const id of (el.getAttribute(attr) ?? "").split(/\s+/).filter(Boolean))
          if (!document.getElementById(id)) out.push(`${attr} يشير إلى غائب: ${id}`);
      }
    }
    const h1 = Array.from(document.querySelectorAll("h1")).filter(visible);
    if (h1.length !== 1) out.push(`عدد h1 = ${h1.length}`);
    return out;
  });
}
