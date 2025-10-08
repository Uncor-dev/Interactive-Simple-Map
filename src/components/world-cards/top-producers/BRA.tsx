import type { CardProps } from "../types";

export default function BRA({ iso3, name }: CardProps) {
  return (
    <div className="grid gap-2 text-sm">
      <p className="text-gray-600">ISO-3 : {iso3}</p>
      <div className="p-2 bg-gray-50 rounded border">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">Statut</div>
        <div className="text-sm font-semibold">Top producteur mondial</div>
      </div>
      <p>Focus canne, exportateur majeur, etc.</p>
      <a className="text-xs underline" href="https://exemple/bresil" target="_blank" rel="noreferrer">En savoir plus</a>
    </div>
  );
}
