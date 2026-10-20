import Image from "next/image";

// ProductLogik logo (public/brand/mark.svg, copied from productlogik/assets/logo.svg) beside a text
// wordmark, so it stays sharp at any size and needs no separate light/dark artwork.

/** Mark + "ProductLogik / POS". `tone`: "dark" for the dark sidebar and sign-in panel, "light" on white. */
export function BrandLockup({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <div className={["brand-lockup", tone === "light" ? "brand-light" : "", className].filter(Boolean).join(" ")}>
      <Image src="/brand/mark.svg" alt="" width={34} height={34} className="brand-lockup-mark" priority unoptimized />
      <span className="brand-wordmark">
        <strong>
          Product<b>Logik</b>
        </strong>
        <small>POS</small>
      </span>
    </div>
  );
}

/** Sidebar / sign-in header. The collapsed sidebar shows only the mark. */
export function Brand() {
  return (
    <div className="brand">
      <Image src="/brand/mark.svg" alt="ProductLogik POS" width={40} height={40} className="brand-mark-img" priority unoptimized />
      <BrandLockup />
    </div>
  );
}
