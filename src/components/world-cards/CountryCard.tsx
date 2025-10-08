import { Suspense } from "react";
import { Registry } from "./registry";
import type { Mode, CardProps } from "./types";

function DefaultCard({ iso3, name }: CardProps) {
    return (
        <div className="text-sm text-gray-700 space-y-2">
            <p className="text-gray-600">ISO-3 : {iso3}</p>
            <p>Aucune carte personnalisée pour ce pays dans cette catégorie.</p>
        </div>
    );
}

export default function CountryCard({
    mode,
    iso3,
    name,
}: { mode: Mode } & CardProps) {
    const MapForMode = Registry[mode];
    const Specific = MapForMode?.[iso3];

    return (
        <Suspense fallback={<div className="text-sm text-gray-500">Chargement…</div>}>
            {Specific ? (
                <Specific iso3={iso3} name={name} />
            ) : (
                <DefaultCard iso3={iso3} name={name} />
            )}
        </Suspense>
    );
}
