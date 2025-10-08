import { useEffect, useRef, useState } from "react";
import { get as getProjection } from "ol/proj";
import { getCenter, getWidth, getHeight } from "ol/extent";
import { unByKey } from "ol/Observable";
import "ol/ol.css";
import { Map, View } from "ol";
import { fromLonLat } from "ol/proj";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import CountryCard from "@/components/world-cards/CountryCard";
import type { Mode as CardMode } from "@/components/world-cards/types";

type Mode =
    | "all-producers"
    | "top-producers"
    | "competitors-specialty";


const ALL_SUGAR_PRODUCERS = new Set<string>([
    "BRA", "IND", "CHN", "THA", "MEX", "USA", "FRA", "RUS", "AUS", "VNM", "IDN", "PAK", "PHL", "ZAF", "EGY"
]);

const TOP_PRODUCERS = new Set<string>(["BRA", "IND", "CHN", "THA", "MEX", "USA", "RUS"]); // exemple

const COMPETITORS_SPECIALTY = new Set<string>(["FRA", "DEU", "GBR", "NLD"]); // “concurrents sucres de spécialité”

// pins (centroïdes simples)
const PINS: Array<{ iso3: string; name: string; lon: number; lat: number }> = [
    { iso3: "USA", name: "États-Unis", lon: -98.5, lat: 39.5 },
    { iso3: "MEX", name: "Mexique", lon: -102.5, lat: 23.5 },
    { iso3: "BRA", name: "Brésil", lon: -51.9253, lat: -14.235 },
    { iso3: "FRA", name: "France", lon: 2.2137, lat: 46.2276 },
    { iso3: "RUS", name: "Russie", lon: 105.3188, lat: 61.524 },
    { iso3: "IND", name: "Inde", lon: 78.9629, lat: 20.5937 },
    { iso3: "CHN", name: "Chine", lon: 104.1954, lat: 35.8617 },
    { iso3: "THA", name: "Thaïlande", lon: 100.9925, lat: 15.870 },
    { iso3: "AUS", name: "Australie", lon: 133.7751, lat: -25.274 }
];

const COLOR_BG = "#F4F5F0";
const COLOR_COUNTRY = "#e8e8e8";
const COLOR_SELECTED = "#88b940";
const PIN_FILL = "#0D5B57";

const defaultCountryStyle = new Style({
    fill: new Fill({ color: COLOR_COUNTRY }),
});

const selectedCountryStyle = new Style({
    fill: new Fill({ color: "#88b940" }),
});

const pinStyle = new Style({
    image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: PIN_FILL }),
    }),
});

export default function WorldSugarMap() {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<Mode>("top-producers");
    const [countryLayer, setCountryLayer] = useState<VectorLayer<VectorSource> | null>(null);
    const [selected, setSelected] = useState<{ name: string; iso3: string } | null>(null);

    const styleFunction = (feature: any) => {
        const iso3 = (feature.get("ISO_A3") || feature.get("iso_a3") || "").toUpperCase();
        const set = mode === "all-producers" ? ALL_SUGAR_PRODUCERS
            : mode === "top-producers" ? TOP_PRODUCERS
                : COMPETITORS_SPECIALTY;
        return set.has(iso3) ? selectedCountryStyle : defaultCountryStyle;
    };

    useEffect(() => {
        if (!mapDivRef.current) return;

        // ==== SOURCES ====
        const countriesSource = new VectorSource({
            url: "/world_countries.geojson",
            format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
            wrapX: true, // ✅ pas de répétition
            attributions: "© Natural Earth",
        });

        countriesSource.on("addfeature", (e: any) => {
            const f = e.feature;
            const iso3 = (f.get("ISO_A3") || f.get("iso_a3") || "").toUpperCase();
            if (iso3 === "ATA") {
                countriesSource.removeFeature(f);
            }
        });

        const bordersSource = new VectorSource({
            url: "/world_borders.geojson",
            format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
            wrapX: true, // ✅
        });

        const pinSource = new VectorSource({ wrapX: false });
        PINS.forEach((p) => {
            const f = new Feature({
                geometry: new Point(fromLonLat([p.lon, p.lat])),
                name: p.name,
                iso3: p.iso3,
            });
            f.setStyle(pinStyle);
            pinSource.addFeature(f);
        });

        countriesSource.on("featuresloadend", () =>
            console.log("✓ countries loaded:", countriesSource.getFeatures().length)
        );
        countriesSource.on("featuresloaderror", (e) => console.error("✗ countries load error", e));
        bordersSource.on("featuresloadend", () =>
            console.log("✓ borders loaded:", bordersSource.getFeatures().length)
        );
        bordersSource.on("featuresloaderror", (e) => console.error("✗ borders load error", e));

        // ==== LAYERS ====
        const countries = new VectorLayer({
            source: countriesSource,
            style: styleFunction,
            renderBuffer: 512,
        });
        countries.setZIndex(5);

        const borders = new VectorLayer({
            source: bordersSource,
            style: new Style({
                stroke: new Stroke({ color: "#F4F5F0", width: 1.2, lineCap: "round", lineJoin: "round" }),
            }),
            renderBuffer: 512,
        });
        borders.setZIndex(10);

        const pins = new VectorLayer({ source: pinSource });
        pins.setZIndex(20);

        // ===== MAP & VIEW =====
        const worldExtent = getProjection("EPSG:3857")!.getExtent();
        const f = 1.08;
        const c = getCenter(worldExtent);
        const w2 = (getWidth(worldExtent) * f) / 2;
        const h2 = (getHeight(worldExtent) * f) / 2;
        const paddedExtent: [number, number, number, number] = [
            c[0] - w2, c[1] - h2, c[0] + w2, c[1] + h2
        ];

        const map = new Map({
            target: mapDivRef.current!,
            layers: [countries, borders, pins],
            view: new View({
                center: fromLonLat([2.2137, 46.2276]),
                zoom: 1.0,
                minZoom: 0.5,
                maxZoom: 5,
                extent: paddedExtent,
                constrainOnlyCenter: false,
                multiWorld: false,
                enableRotation: false,
            }),
            controls: [],
        });

        const fitOnce = () => {
            const feats = countriesSource.getFeatures();
            if (feats.length) {
                map.getView().fit(countriesSource.getExtent(), {
                    padding: [10, 10, 10, 10],
                    maxZoom: 1,
                    duration: 300,
                });
                countriesSource.un("featuresloadend", fitOnce as any);
            }
        };
        countriesSource.on("featuresloadend", fitOnce as any);

        // ===== CLICK (pins → pays) =====
        const clickKey = map.on("singleclick", (evt) => {
            let handled = false;

            const pin = map.forEachFeatureAtPixel(evt.pixel, (f, layer) => (layer === pins ? f : null));
            if (pin) {
                const iso3 = (pin.get("iso3") || "").toUpperCase();
                const name = pin.get("name") || "";
                setSelected({ iso3, name });
                handled = true;
            }

            if (!handled) {
                const f = map.forEachFeatureAtPixel(evt.pixel, (feat, layer) =>
                    layer === countries ? feat : null
                );
                if (f) {
                    const iso3 = (f.get("ISO_A3") || f.get("iso_a3") || "").toUpperCase();
                    const admin = f.get("ADMIN") || f.get("name") || "Pays";
                    const set =
                        mode === "all-producers"
                            ? ALL_SUGAR_PRODUCERS
                            : mode === "top-producers"
                                ? TOP_PRODUCERS
                                : COMPETITORS_SPECIALTY;

                    if (set.has(iso3)) {
                        setSelected({ iso3, name: admin });
                    } else {
                        setSelected(null);
                    }
                } else {
                    setSelected(null);
                }
            }
        });

        setCountryLayer(countries);

        // ===== CLEANUP (unique) =====
        return () => {
            unByKey(clickKey);
            map.setTarget(undefined);
        };
    }, []);

    useEffect(() => {
        if (!countryLayer) return;
        countryLayer.setStyle(styleFunction);
        countryLayer.changed();
        if (selected) {
            const set = mode === "all-producers" ? ALL_SUGAR_PRODUCERS
                : mode === "top-producers" ? TOP_PRODUCERS
                    : COMPETITORS_SPECIALTY;
            if (!set.has(selected.iso3)) {
                setSelected(null);
            }
        }
    }, [mode]);

    return (
        <div className="relative w-full h-screen" style={{ background: COLOR_BG }}>
            <div ref={mapDivRef} className="absolute inset-0" />
            {/* panneau radio */}
            <div className="absolute left-4 top-4 bg-white shadow-lg rounded-sm z-10 w-64 p-4">
                <h3 className="font-semibold mb-2">Changer la sélection :</h3>
                <div className="grid gap-2 text-sm font-light">
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="mode"
                            value="all-producers"
                            checked={mode === "all-producers"}
                            onChange={() => setMode("all-producers")}
                        />
                        <span>Pays producteurs de sucre de canne et de betterave</span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="mode"
                            value="top-producers"
                            checked={mode === "top-producers"}
                            onChange={() => setMode("top-producers")}
                        />
                        <span>Principaux producteurs de sucre au monde</span>
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="mode"
                            value="competitors-specialty"
                            checked={mode === "competitors-specialty"}
                            onChange={() => setMode("competitors-specialty")}
                        />
                        <span>Principaux concurrents des sucres de spécialité</span>
                    </label>
                </div>
            </div>

            {/* légende */}
            <div className="absolute left-4 bottom-4 bg-white shadow-lg rounded-sm z-10 p-4 w-72">
                <h4 className="font-semibold mb-2">Légende</h4>
                <ul className="text-xs font-light grid gap-2">
                    <li className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded" style={{ background: COLOR_SELECTED }} />
                        <span>Pays sélectionnés</span>
                    </li>
                    <li className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full" style={{ background: PIN_FILL }} />
                        <span>Cliquer pour plus d’informations</span>
                    </li>
                </ul>
            </div>

            {selected && (
                <div className="absolute inset-0 z-30 pointer-events-none">
                    <div className="absolute top-4 right-4 pointer-events-auto">
                        <div className="bg-white/95 backdrop-blur shadow-xl rounded-md p-4 w-80 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-start justify-between mb-2">
                                <h5 className="font-semibold">{selected.name}</h5>
                                <button
                                    className="text-gray-500 hover:text-gray-800"
                                    onClick={() => setSelected(null)}
                                >
                                    ✕
                                </button>
                            </div>

                            <CountryCard mode={mode as CardMode} iso3={selected.iso3} name={selected.name} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
