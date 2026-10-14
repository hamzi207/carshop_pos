import { getShopSession } from "@/lib/auth";

// Sidebar "current location" card, showing the signed-in user's shop.
export async function StoreCard() {
  const { tenant } = await getShopSession();
  return (
    <div className="store-card">
      <span className="store-overline">CURRENT SHOP</span>
      <div className="store-name">
        <span>{tenant.name}</span>
      </div>
      <span className="store-id">{tenant.slug}</span>
    </div>
  );
}

export function StoreCardSkeleton() {
  return (
    <div className="store-card" aria-hidden="true">
      <span className="store-overline">CURRENT SHOP</span>
      <div className="store-name">
        <span style={{ opacity: 0.4 }}>Loading…</span>
      </div>
      <span className="store-id">&nbsp;</span>
    </div>
  );
}
