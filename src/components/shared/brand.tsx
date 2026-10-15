import Image from "next/image";

// Brand lockup: the CarShop logo (white, for the dark sidebar / sign-in panel) with "POS SYSTEM"
// under it. The collapsed sidebar shows only the round car mark. Source art: carshop_logo/.
export function Brand() {
  return (
    <div className="brand">
      <Image src="/brand/mark.png" alt="CarShop.Pk" width={36} height={36} className="brand-mark-img" priority />
      <div className="brand-lockup">
        <Image src="/brand/logo-white.png" alt="CarShop Auto Accessories" width={160} height={44} priority />
        <small>POS SYSTEM</small>
      </div>
    </div>
  );
}
