import { useMemo, useState, type ReactNode } from "react";

type Screen = "dashboard" | "quote" | "inventory" | "customers";
type IconName =
  | "grid"
  | "file"
  | "box"
  | "users"
  | "chart"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "car"
  | "arrowUp"
  | "alert"
  | "check"
  | "clock"
  | "eye"
  | "download"
  | "message"
  | "edit"
  | "chevron"
  | "arrowLeft"
  | "trash"
  | "filter"
  | "more"
  | "phone"
  | "mail"
  | "map"
  | "receipt"
  | "x"
  | "sparkles"
  | "wrench";

const iconPaths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
  box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 16 4-5 4 3 5-7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.38.72.7 1 .3.26.7.4 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.8.6Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  car: <><path d="m5 17-2-2V9l2-1 2-4h10l2 4 2 1v6l-2 2H5Z" /><path d="M5 8h14M7 13h.01M17 13h.01M7 17v2M17 17v2" /></>,
  arrowUp: <><path d="m18 15-6-6-6 6" /><path d="M12 9v10" /></>,
  alert: <><path d="M10.3 3.8 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>,
  message: <><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2-5.2A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8 10c1 3 3 5 6 6" /></>,
  edit: <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  arrowLeft: <path d="m15 18-6-6 6-6" />,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5" /></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.12.9.34 1.8.65 2.65a2 2 0 0 1-.45 2.1L8 9.7a16 16 0 0 0 6 6l1.25-1.25a2 2 0 0 1 2.1-.45c.85.31 1.74.53 2.65.65a2 2 0 0 1 2 2.25Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  map: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
  receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  sparkles: <><path d="m12 3-1 4-4 1 4 1 1 4 1-4 4-1-4-1ZM5 14l-.7 2.3L2 17l2.3.7L5 20l.7-2.3L8 17l-2.3-.7Z" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5-5L7.5 3.5 10 6 6 10 3.5 7.5 1.3 9.7a4 4 0 0 0 5 5L16.5 4.5Z" />,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function Button({ children, variant = "secondary", icon, onClick, className = "" }: { children: ReactNode; variant?: "primary" | "secondary" | "success" | "ghost" | "danger"; icon?: IconName; onClick?: () => void; className?: string }) {
  return <button className={`button button-${variant} ${className}`} onClick={onClick}>{icon && <Icon name={icon} size={16} />}<span>{children}</span></button>;
}

function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick?: () => void }) {
  return <button className="icon-button" aria-label={label} title={label} onClick={onClick}><Icon name={icon} size={16} /></button>;
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "amber" | "red" | "purple" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Field({ label, value, icon, wide = false }: { label?: string; value: string; icon?: IconName; wide?: boolean }) {
  return <label className={`field ${wide ? "field-wide" : ""}`}>{label && <span className="field-label">{label}</span>}<span className="field-control">{icon && <Icon name={icon} size={16} />}<input value={value} readOnly /><Icon name="chevron" size={14} /></span></label>;
}

const navItems: { id: Screen; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Overview", icon: "grid" },
  { id: "quote", label: "Quotes & POS", icon: "file" },
  { id: "inventory", label: "Inventory", icon: "box" },
  { id: "customers", label: "Customers", icon: "users" },
];

function Sidebar({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><span>A</span></div><div><strong>APEX</strong><small>AUTO ACCESSORIES</small></div></div>
    <div className="store-card"><span className="store-overline">CURRENT LOCATION</span><div className="store-name"><span>Downtown Store</span><Icon name="chevron" size={14} /></div><span className="store-id">Store #001 · Austin, TX</span></div>
    <nav className="nav"><span className="nav-label">WORKSPACE</span>{navItems.map((item) => <button key={item.id} className={`nav-item ${active === item.id ? "active" : ""}`} onClick={() => onNavigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "inventory" && <span className="nav-count">4</span>}</button>)}
      <span className="nav-label nav-label-gap">INSIGHTS</span><button className="nav-item"><Icon name="chart" /><span>Reports</span></button><button className="nav-item"><Icon name="settings" /><span>Settings</span></button>
    </nav>
    <div className="sidebar-foot"><div className="help-card"><div className="help-icon"><Icon name="sparkles" size={16} /></div><strong>Need a hand?</strong><span>Visit the Apex support center.</span><button>Get support <Icon name="chevron" size={13} /></button></div><div className="version">ApexOS v2.4.0</div></div>
  </aside>;
}

function Topbar() {
  return <header className="topbar"><div className="global-search"><Icon name="search" size={18} /><span>Search inventory, quotes, or customers...</span><kbd>⌘ K</kbd></div><div className="top-actions"><button className="notification"><Icon name="bell" /><span className="notification-dot">4</span></button><div className="profile"><div className="avatar">MV</div><div><strong>Marcus Vance</strong><span>Store Administrator</span></div><Icon name="chevron" size={14} /></div></div></header>;
}

const quotes = [
  ["Q-1048", "Metro Porsche Dealership", "2024 Porsche 911 GT3", "$1,850.00", "Sent"],
  ["Q-1047", "Daniel Kim", "2022 BMW M4 Competition", "$2,420.00", "Paid"],
  ["Q-1046", "Atlas Fleet Services", "2024 Ford F-150 Lightning", "$649.50", "Draft"],
  ["Q-1045", "Sarah Mitchell", "2023 Tesla Model Y", "$1,125.00", "Invoiced"],
  ["Q-1044", "Velocity Motors", "2021 Mercedes-AMG G63", "$3,280.00", "Paid"],
];

const restocks = [
  { sku: "WF-CER-2040", name: "Suntek Carbon 20% 40in Roll", category: "Window Film", stock: "2 rolls left", min: 5 },
  { sku: "AUD-FOC-165", name: "Focal Access 6.5in Component Kit", category: "Car Audio", stock: "1 kit left", min: 3 },
  { sku: "PPF-XPL-600", name: "XPEL Ultimate Plus 60in Roll", category: "PPF Film", stock: "2 rolls left", min: 4 },
  { sku: "LED-OSR-H11", name: "Osram LEDriving H11 Pair", category: "Lighting", stock: "3 sets left", min: 6 },
];

function Dashboard() {
  return <div className="page">
    <div className="page-heading"><div><span className="eyebrow">TUESDAY, MAY 14</span><h1>Good morning, Marcus</h1><p>Here’s what’s happening across your store today.</p></div><div className="heading-actions"><Button icon="plus">Add Inventory Item</Button><Button variant="primary" icon="car">Create New Quote</Button></div></div>
    <div className="kpi-grid">
      <Kpi icon="chart" label="Gross Revenue" value="$48,250" detail="This month" trend="+14.2%" tone="blue" />
      <Kpi icon="file" label="Active Quotes Pipeline" value="16" detail="$21,400 pending value" foot="5 awaiting response" tone="purple" />
      <Kpi icon="alert" label="Low Stock Alerts" value="4" detail="Items below threshold" foot="Requires attention" tone="red" />
      <Kpi icon="check" label="Orders Fulfilled" value="42" detail="Completed this month" trend="+8.4%" tone="green" />
    </div>
    <div className="dashboard-grid">
      <section className="card table-card">
        <div className="card-header"><div><h2>Recent Quotes & Invoices</h2><p>Track your latest customer activity.</p></div><Button variant="ghost">View all <Icon name="chevron" size={14} /></Button></div>
        <div className="table-wrap"><table><thead><tr><th>QUOTE</th><th>CUSTOMER / VEHICLE</th><th>TOTAL</th><th>STATUS</th><th></th></tr></thead><tbody>{quotes.map((q) => <tr key={q[0]}><td><span className="mono strong">{q[0]}</span></td><td><div className="primary-cell"><strong>{q[1]}</strong><span><Icon name="car" size={13} />{q[2]}</span></div></td><td className="amount">{q[3]}</td><td><Badge tone={q[4] === "Paid" ? "green" : q[4] === "Sent" ? "blue" : q[4] === "Invoiced" ? "amber" : "neutral"}><span className="status-dot" />{q[4]}</Badge></td><td><div className="row-actions"><IconButton icon="eye" label="View" /><IconButton icon="download" label="Download PDF" /><IconButton icon="message" label="Share to WhatsApp" /></div></td></tr>)}</tbody></table></div>
        <div className="table-footer"><span>Showing 5 of 24 recent documents</span><div><button disabled><Icon name="arrowLeft" size={14} /></button><button><Icon name="chevron" size={14} /></button></div></div>
      </section>
      <section className="card alerts-card"><div className="card-header"><div className="header-with-icon"><span className="header-icon danger"><Icon name="alert" size={18} /></span><div><h2>Urgent Restock</h2><p>4 items need your attention</p></div></div><button className="more-button"><Icon name="more" /></button></div>
        <div className="restock-list">{restocks.map((item) => <div className="restock-item" key={item.sku}><div className="restock-top"><div><span className="mono sku">{item.sku}</span><strong>{item.name}</strong></div><Badge tone="red">{item.stock}</Badge></div><div className="restock-bottom"><Badge>{item.category}</Badge><span>Min: {item.min}</span><Button variant="ghost" icon="edit">Adjust stock</Button></div></div>)}</div>
        <button className="alert-footer">View inventory alerts <Icon name="chevron" size={14} /></button>
      </section>
    </div>
  </div>;
}

function Kpi({ icon, label, value, detail, trend, foot, tone }: { icon: IconName; label: string; value: string; detail: string; trend?: string; foot?: string; tone: string }) {
  return <div className="card kpi"><div className={`kpi-icon tone-${tone}`}><Icon name={icon} /></div><div className="kpi-label">{label}</div><div className="kpi-value-row"><strong>{value}</strong>{trend && <span className="trend"><Icon name="arrowUp" size={12} />{trend}</span>}</div><div className="kpi-detail">{detail}</div>{foot && <div className={`kpi-foot foot-${tone}`}><span className="status-dot" />{foot}</div>}</div>;
}

const catalog = [
  { sku: "WF-NANO-3540", name: "Apex Nano Ceramic 35% · 40in", cat: "Window Film", price: "$280.00", stock: "12 in stock", fit: "Universal Fit" },
  { sku: "AUD-F150-B&O", name: "F-150 B&O Speaker Upgrade Kit", cat: "Audio Upgrade", price: "$420.00", stock: "6 in stock", fit: "Perfect Fit" },
  { sku: "LED-F150-SIL", name: "F-150 Lightning Illuminated Sills", cat: "Exterior", price: "$185.00", stock: "9 in stock", fit: "Perfect Fit" },
];

function QuoteBuilder() {
  const [items, setItems] = useState([
    { sku: "WF-NANO-3540", name: "Apex Nano Ceramic 35% · 40in", qty: 1, price: 280 },
    { sku: "AUD-F150-B&O", name: "F-150 B&O Speaker Upgrade Kit", qty: 1, price: 350 },
  ]);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return <div className="page quote-page">
    <div className="quote-toolbar"><div className="quote-title"><IconButton icon="arrowLeft" label="Back" /><div><div className="quote-title-line"><h1>Quote #Q-1042</h1><Badge>Draft</Badge></div><p>Created May 14, 2025 · Last saved just now</p></div></div><div className="heading-actions"><Button>Save Draft</Button><Button icon="download">Download PDF</Button><Button variant="success" icon="message">Share to WhatsApp</Button><Button variant="primary" icon="check">Mark as Paid</Button></div></div>
    <section className="card selector-card"><div className="selector-head"><div><span className="step-number">1</span><h2>Customer & vehicle</h2></div><span>Choose a customer, then select the vehicle for fitment matching.</span></div><div className="selector-grid"><Field label="CUSTOMER ACCOUNT" value="Downtown Ford Fleet · Dealership" icon="users" wide /><Field label="YEAR" value="2024" /><Field label="MAKE" value="Ford" /><Field label="MODEL" value="F-150 Lightning" /></div><div className="fitment-banner"><div className="fitment-icon"><Icon name="car" /></div><div><strong>Vehicle selected: 2024 Ford F-150 Lightning</strong><span>14 catalog accessories are confirmed compatible with this vehicle</span></div><Badge tone="blue"><Icon name="sparkles" size={12} /> Magic Fit active</Badge></div></section>
    <div className="quote-workspace">
      <div className="quote-main">
        <section className="card accessory-card"><div className="card-header"><div><h2>Compatible accessories</h2><p>Add products matched to the selected vehicle.</p></div><label className="toggle-label"><input type="checkbox" defaultChecked /><span className="toggle" /><span>Compatible parts only</span></label></div><div className="picker-search"><Icon name="search" size={17} /><input placeholder="Search compatible parts by name or SKU..." /><button><Icon name="filter" size={16} /> Filters</button></div><div className="catalog-list">{catalog.map((item) => <div className="catalog-row" key={item.sku}><div className="product-thumbnail"><Icon name={item.cat === "Audio Upgrade" ? "settings" : item.cat === "Exterior" ? "car" : "box"} /></div><div className="catalog-info"><span className="mono">{item.sku}</span><strong>{item.name}</strong><div><Badge tone="purple">{item.cat}</Badge><Badge tone={item.fit === "Perfect Fit" ? "blue" : "green"}>{item.fit}</Badge></div></div><div className="catalog-meta"><strong>{item.price}</strong><span className="in-stock"><span className="status-dot" />{item.stock}</span></div><Button icon="plus" onClick={() => !items.some((i) => i.sku === item.sku) && setItems([...items, { sku: item.sku, name: item.name, qty: 1, price: Number(item.price.replace(/[$,]/g, "")) }])}>Add</Button></div>)}</div></section>
        <section className="card line-items-card"><div className="card-header"><div><h2>Quote line items</h2><p>{items.length} products added to this quote</p></div><Badge tone="blue">{items.length} items</Badge></div><div className="line-items"><div className="line-head"><span>ITEM</span><span>QTY</span><span>UNIT PRICE</span><span>TOTAL</span><span /></div>{items.map((item) => <div className="line-row" key={item.sku}><div><span className="drag">⠿</span><div><strong>{item.name}</strong><span className="mono">{item.sku}</span></div></div><div className="stepper"><button onClick={() => setItems(items.map((i) => i.sku === item.sku ? { ...i, qty: Math.max(1, i.qty - 1) } : i))}>−</button><span>{item.qty}</span><button onClick={() => setItems(items.map((i) => i.sku === item.sku ? { ...i, qty: i.qty + 1 } : i))}>+</button></div><span>${item.price.toFixed(2)}</span><strong>${(item.price * item.qty).toFixed(2)}</strong><IconButton icon="trash" label="Remove" onClick={() => setItems(items.filter((i) => i.sku !== item.sku))} /></div>)}</div><button className="labor-button"><span><Icon name="wrench" /></span><div><strong>Add optional fitting / labor service</strong><small>Installation, fitting fees, or custom shop labor</small></div><Icon name="plus" /></button></section>
      </div>
      <aside className="card summary-card"><div className="summary-head"><div><span className="step-number">2</span><h2>Order summary</h2></div><Badge tone="blue">USD</Badge></div><div className="summary-customer"><div className="avatar avatar-blue">DF</div><div><strong>Downtown Ford Fleet</strong><span>Dealership Account · +1 512 555 0184</span></div></div><div className="summary-lines"><div><span>Items subtotal</span><strong>${subtotal.toFixed(2)}</strong></div><div className="discount-row"><span>Discount</span><div><button>%</button><input value="30.00" readOnly /></div></div><div><span>Tax <Badge>8.25%</Badge></span><strong>${((subtotal - 30) * .0825).toFixed(2)}</strong></div></div><div className="grand-total"><div><span>Grand total</span><small>Tax included</small></div><strong>${((subtotal - 30) * 1.0825).toFixed(2)}</strong></div><Field label="PAYMENT METHOD" value="Card Terminal" /><label className="notes-field"><span className="field-label">INTERNAL NOTES</span><textarea defaultValue="Fleet pricing approved by Marcus. Schedule installation with service manager." /></label><div className="disclaimer"><strong>Quote disclaimer</strong><p>Pricing is valid for 14 days. Parts remain subject to availability until payment is received.</p><button>Edit disclaimer</button></div><Button variant="primary" icon="check" className="full-button">Finalize & create invoice</Button></aside>
    </div>
  </div>;
}

const inventory = [
  { sku: "WF-IR-7040", name: "Suntek CIR 70% · 40in Roll", cat: "Window Film", fit: "Universal Fit", cost: 140, sell: 280, stock: 18, min: 5 },
  { sku: "PPF-XPL-600", name: "XPEL Ultimate Plus · 60in Roll", cat: "PPF", fit: "Universal Fit", cost: 715, sell: 1190, stock: 2, min: 4 },
  { sku: "AUD-F150-B&O", name: "F-150 B&O Speaker Upgrade Kit", cat: "Car Audio", fit: "8 Models", cost: 225, sell: 420, stock: 6, min: 3 },
  { sku: "WR-3M-SAT-BLK", name: "3M 2080 Satin Black · 60in Roll", cat: "Vinyl Wrap", fit: "Universal Fit", cost: 490, sell: 820, stock: 7, min: 3 },
  { sku: "LED-F150-SIL", name: "F-150 Lightning Illuminated Sills", cat: "Accessories", fit: "3 Models", cost: 92, sell: 185, stock: 9, min: 4 },
  { sku: "AUD-FOC-165", name: "Focal Access 6.5in Component Kit", cat: "Car Audio", fit: "Universal Fit", cost: 165, sell: 299, stock: 1, min: 3 },
  { sku: "CHEM-GYE-500", name: "Gyeon Prep Surface Cleaner · 500ml", cat: "Chemicals", fit: "Universal Fit", cost: 12, sell: 24, stock: 32, min: 10 },
];

function Inventory() {
  const [modal, setModal] = useState(false);
  const [category, setCategory] = useState("All Items");
  const filtered = category === "All Items" ? inventory : inventory.filter((i) => i.cat === category);
  return <div className="page"><div className="page-heading inventory-heading"><div><span className="eyebrow">CATALOG MANAGEMENT</span><h1>Inventory & Fitment</h1><p>Manage products, stock levels, margins, and vehicle compatibility.</p></div><div className="heading-actions"><Button icon="download">Export CSV</Button><Button variant="primary" icon="plus" onClick={() => setModal(true)}>Add New Part</Button></div></div>
    <section className="card filter-card"><div className="inventory-search"><Icon name="search" /><input placeholder="Filter by SKU, part name, or category..." /></div><div className="category-pills">{["All Items", "Window Film", "Vinyl Wrap", "PPF", "Car Audio", "Accessories", "Chemicals"].map((c) => <button key={c} className={category === c ? "active" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div><Button icon="filter">All fitment types</Button></section>
    <section className="card inventory-table-card"><div className="inventory-summary"><div><h2>All inventory</h2><Badge>{filtered.length} products</Badge></div><span>Last synced 2 minutes ago</span></div><div className="table-wrap"><table className="inventory-table"><thead><tr><th>PRODUCT</th><th>FITMENT TYPE</th><th>COST</th><th>SELLING PRICE</th><th>MARGIN</th><th>ON HAND</th><th></th></tr></thead><tbody>{filtered.map((item) => { const margin = Math.round((1 - item.cost / item.sell) * 100); const low = item.stock <= item.min; return <tr key={item.sku}><td><div className="inventory-product"><div className="mini-product"><Icon name={item.cat === "Car Audio" ? "settings" : item.cat === "Accessories" ? "car" : "box"} /></div><div><strong>{item.name}</strong><span><span className="mono">{item.sku}</span><Badge>{item.cat}</Badge></span></div></div></td><td><Badge tone={item.fit === "Universal Fit" ? "green" : "blue"}>{item.fit === "Universal Fit" ? <Icon name="check" size={12} /> : <Icon name="car" size={12} />}{item.fit === "Universal Fit" ? item.fit : `Vehicle Specific (${item.fit})`}</Badge></td><td>${item.cost.toFixed(2)}</td><td className="amount">${item.sell.toFixed(2)}</td><td><Badge tone={margin >= 50 ? "green" : "amber"}>{margin.toFixed(1)}% Margin</Badge></td><td><Badge tone={low ? "red" : "green"}>{low && <Icon name="alert" size={12} />}{item.stock} {low ? `· Min ${item.min}` : "in stock"}</Badge></td><td><IconButton icon="more" label="Product actions" /></td></tr>; })}</tbody></table></div><div className="table-footer"><span>Showing {filtered.length} of 128 products</span><div className="pagination"><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>16</button><button><Icon name="chevron" size={14} /></button></div></div></section>
    {modal && <PartModal onClose={() => setModal(false)} />}
  </div>;
}

function PartModal({ onClose }: { onClose: () => void }) {
  const [specific, setSpecific] = useState(false);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><span className="header-icon blue"><Icon name="box" /></span><div><h2>Add inventory part</h2><p>Create a product and configure vehicle fitment.</p></div></div><IconButton icon="x" label="Close" onClick={onClose} /></div><div className="modal-body"><div className="form-grid"><label><span>SKU / PART CODE</span><input defaultValue="WF-" /></label><label><span>CATEGORY</span><div className="select-like">Window Film <Icon name="chevron" size={14} /></div></label><label className="span-two"><span>PRODUCT NAME</span><input placeholder="e.g. Suntek Carbon 20% · 40in Roll" /></label><label><span>COST PRICE</span><div className="money-input"><span>$</span><input placeholder="0.00" /></div></label><label><span>SELLING PRICE</span><div className="money-input"><span>$</span><input placeholder="0.00" /></div></label><label><span>STARTING STOCK</span><input defaultValue="0" /></label><label><span>LOW STOCK ALERT</span><input defaultValue="5" /></label></div><div className="compatibility"><div><h3>Compatibility mode</h3><p>Choose how this product should match to vehicles.</p></div><div className="radio-cards"><button className={!specific ? "selected" : ""} onClick={() => setSpecific(false)}><span className="radio-dot" /><div className="choice-icon universal"><Icon name="check" /></div><strong>Universal Fit</strong><p>Applies to all vehicles. Ideal for film rolls and generic accessories.</p></button><button className={specific ? "selected" : ""} onClick={() => setSpecific(true)}><span className="radio-dot" /><div className="choice-icon vehicle"><Icon name="car" /></div><strong>Vehicle Specific</strong><p>Link this product to specific Year, Make, and Model records.</p></button></div>{specific && <div className="vehicle-multi"><span>COMPATIBLE VEHICLES</span><div><Badge tone="blue">2024 Ford F-150 <button>×</button></Badge><span>Search Year, Make & Model...</span></div></div>}</div></div><div className="modal-footer"><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon="plus" onClick={onClose}>Add Inventory Part</Button></div></section></div>;
}

const customers = [
  { initials: "MP", name: "Metro Porsche Dealership", type: "Dealership", contact: "Elena Ruiz", phone: "+1 512 555 0129", email: "elena@metroporsche.com", docs: 18, balance: "$4,240.00", tone: "blue" },
  { initials: "AF", name: "Atlas Fleet Services", type: "Fleet Account", contact: "Jordan Blake", phone: "+1 512 555 0184", email: "jordan@atlasfleet.co", docs: 12, balance: "$1,890.50", tone: "purple" },
  { initials: "VM", name: "Velocity Motors", type: "Dealership", contact: "Andre Silva", phone: "+1 737 555 0118", email: "andre@velocitymotors.com", docs: 26, balance: "$0.00", tone: "green" },
  { initials: "DK", name: "Daniel Kim", type: "Retail Customer", contact: "Daniel Kim", phone: "+1 512 555 0167", email: "daniel.kim@email.com", docs: 4, balance: "$0.00", tone: "amber" },
  { initials: "LP", name: "Lone Star Performance", type: "Trade Account", contact: "Mia Thompson", phone: "+1 512 555 0194", email: "mia@lonestarperf.com", docs: 9, balance: "$820.00", tone: "red" },
];

function Customers() {
  const [selected, setSelected] = useState<(typeof customers)[number] | null>(customers[0]);
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">B2B CRM</span><h1>Customer Directory</h1><p>Manage business accounts, contacts, vehicles, and quote history.</p></div><Button variant="primary" icon="plus">Register Customer</Button></div>
    <div className="customer-stats"><div><span className="customer-stat-icon blue"><Icon name="users" /></span><div><strong>284</strong><span>Total customers</span></div></div><div><span className="customer-stat-icon green"><Icon name="chart" /></span><div><strong>42</strong><span>B2B accounts</span></div></div><div><span className="customer-stat-icon amber"><Icon name="receipt" /></span><div><strong>$6,950.50</strong><span>Outstanding balance</span></div></div></div>
    <section className="card customer-card"><div className="customer-filters"><div className="inventory-search"><Icon name="search" /><input placeholder="Search company, contact, phone, or email..." /></div><div className="category-pills"><button className="active">All customers</button><button>Dealerships</button><button>Fleet</button><button>Retail</button></div><Button icon="filter">More filters</Button></div><div className="table-wrap"><table className="customer-table"><thead><tr><th>CUSTOMER / COMPANY</th><th>PRIMARY CONTACT</th><th>WHATSAPP</th><th>ACTIVITY</th><th>OUTSTANDING</th><th></th></tr></thead><tbody>{customers.map((c) => <tr key={c.name} onClick={() => setSelected(c)}><td><div className="customer-name"><span className={`customer-avatar customer-${c.tone}`}>{c.initials}</span><div><strong>{c.name}</strong><Badge tone={c.type === "Dealership" ? "blue" : c.type === "Fleet Account" ? "purple" : "neutral"}>{c.type}</Badge></div></div></td><td><div className="contact-cell"><strong>{c.contact}</strong><span>{c.email}</span></div></td><td><button className="whatsapp-link"><Icon name="message" size={15} />{c.phone}</button></td><td><strong>{c.docs}</strong> quotes / invoices</td><td className={c.balance === "$0.00" ? "settled" : "balance"}>{c.balance === "$0.00" ? <Badge tone="green">Settled</Badge> : c.balance}</td><td><Icon name="chevron" size={16} /></td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing 5 of 284 customers</span><div className="pagination"><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>57</button></div></div></section>
    {selected && <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />}
  </div>;
}

function CustomerDrawer({ customer, onClose }: { customer: (typeof customers)[number]; onClose: () => void }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}><div className="drawer-top"><span>Customer profile</span><IconButton icon="x" label="Close" onClick={onClose} /></div><div className="customer-hero"><div className={`customer-avatar large customer-${customer.tone}`}>{customer.initials}</div><h2>{customer.name}</h2><div><Badge tone="blue">{customer.type}</Badge><Badge tone="green"><span className="status-dot" /> Active account</Badge></div><Button variant="success" icon="message" className="full-button">Message on WhatsApp</Button></div><div className="drawer-section"><div className="section-title"><h3>Account details</h3><button>Edit</button></div><div className="details-list"><div><Icon name="users" /><span>Primary contact</span><strong>{customer.contact}</strong></div><div><Icon name="phone" /><span>Phone</span><strong>{customer.phone}</strong></div><div><Icon name="mail" /><span>Email</span><strong>{customer.email}</strong></div><div><Icon name="map" /><span>Billing address</span><strong>415 Congress Ave, Austin, TX 78701</strong></div><div><Icon name="receipt" /><span>Tax / VAT ID</span><strong className="mono">TX-74-8291046</strong></div></div></div><div className="drawer-section history-section"><div className="section-title"><h3>Purchase & quote history</h3><button>View all</button></div><div className="timeline"><History status="Paid" id="INV-2094" vehicle="2024 Porsche 911 GT3" amount="$1,850.00" date="May 12, 2025" /><History status="Sent" id="Q-1031" vehicle="2023 Porsche Cayenne" amount="$2,240.00" date="Apr 28, 2025" /><History status="Paid" id="INV-2048" vehicle="2022 Porsche Taycan" amount="$975.00" date="Apr 06, 2025" /></div></div></aside></div>;
}

function History({ status, id, vehicle, amount, date }: { status: string; id: string; vehicle: string; amount: string; date: string }) {
  return <div className="history-item"><span className={`timeline-dot ${status === "Paid" ? "paid" : ""}`} /><div className="history-card"><div><span className="mono">{id}</span><Badge tone={status === "Paid" ? "green" : "blue"}>{status}</Badge></div><strong>{vehicle}</strong><div><span>{date}</span><strong>{amount}</strong></div><button><Icon name="eye" size={13} /> View document</button></div></div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const title = useMemo(() => navItems.find((item) => item.id === screen)?.label, [screen]);
  return <div className="app-shell"><Sidebar active={screen} onNavigate={setScreen} /><div className="main-shell"><Topbar /><main aria-label={title}>{screen === "dashboard" && <Dashboard />}{screen === "quote" && <QuoteBuilder />}{screen === "inventory" && <Inventory />}{screen === "customers" && <Customers />}</main></div></div>;
}
