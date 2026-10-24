import Link from "next/link";
import type { Industry } from "@/lib/admin-category-data";
import { iconFor } from "@/lib/category-icons";

/** The industry asked for, else the one most organizations use (so the page opens on real data). */
export const pickIndustry = (industries: Industry[], id: string | undefined) =>
  industries.find((i) => i.id === id) ?? [...industries].sort((a, b) => b.organizations - a.organizations || a.sortOrder - b.sortOrder)[0];

/** Side list of industries for the Catalog pages (?industry=…). */
export function IndustryList({ industries, currentId, basePath }: { industries: Industry[]; currentId: string; basePath: string }) {
  return (
    <nav className="card industry-list" aria-label="Industries">
      <div className="industry-list-head">INDUSTRIES</div>
      {industries.map((i) => {
        const Icon = iconFor(i.icon);
        const active = i.id === currentId;
        return (
          <Link key={i.id} href={`${basePath}?industry=${i.id}`} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} title={i.name}>
            <Icon size={15} />
            <span>
              <strong>{i.name}</strong>
              <small>
                {i.categories} categories{i.organizations ? ` · ${i.organizations} ${i.organizations === 1 ? "org" : "orgs"}` : ""}
                {i.isActive ? "" : " · closed"}
              </small>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
