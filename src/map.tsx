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
import Icon from "ol/style/Icon";

type Mode =
    | "all-producers"
    | "top-producers"
    | "competitors-specialty";


const ALL_SUGAR_PRODUCERS = new Set<string>([
    "BRA", "IND", "CHN", "THA", "MEX", "USA", "FRA", "RUS", "AUS", "VNM", "IDN", "PAK", "PHL", "ZAF", "EGY"
]);

const TOP_PRODUCERS = new Set<string>(["BRA", "IND", "CHN", "THA", "MEX", "USA", "RUS"]);

const COMPETITORS_SPECIALTY = new Set<string>(["FRA", "DEU", "GBR", "NLD"]);

// pins (centroïdes simples)
const PINS: Array<{ iso3: string; name: string; lon: number; lat: number }> = [
    { iso3: "USA", name: "États-Unis", lon: -98.5, lat: 39.5 },
    { iso3: "MEX", name: "Mexique", lon: -102.5, lat: 23.5 },
    { iso3: "BRA", name: "Brésil", lon: -51.9253, lat: -14.235 },
    { iso3: "FRA", name: "France", lon: 2.2137, lat: 46.2276 },
    { iso3: "RUS", name: "Russie", lon: 105.3188, lat: 61.524 },
    { iso3: "IND", name: "Inde", lon: 78.9629, lat: 20.5937 },
    { iso3: "CHN", name: "Chine", lon: 104.1954, lat: 35.8617 },
    { iso3: "THA", name: "Thaïlande", lon: 100.9925, lat: 15.87 },
    { iso3: "AUS", name: "Australie", lon: 133.7751, lat: -25.274 },
];

const COLOR_BG = "#F4F5F0";
const COLOR_COUNTRY = "#e8e8e8";
const COLOR_SELECTED = "#88b940";
const PIN_FILL = "#0D5B57";
const PIN_DOT = "#0A3F3C";

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

const PIN_SCALE_NORMAL = 0.7;
const PIN_SCALE_HOVER = 1;
const PIN_TWEEN_MS = 180;

const PIN_SVG = encodeURIComponent(
    `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 32c0 0 10-11 10-18a10 10 0 1 0-20 0c0 7 10 18 10 18z" fill="${PIN_FILL}"/>
        <circle cx="12" cy="14" r="5" fill="${PIN_DOT}"/>
    </svg>`
);

function makePinIconStyle(scale = PIN_SCALE_NORMAL) {
    return new Style({
        image: new Icon({
            src: `data:image/svg+xml;charset=utf-8,${PIN_SVG}`,
            scale,
            anchor: [0.5, 1],
            anchorXUnits: "fraction",
            anchorYUnits: "fraction",
        }),
    });
}

function animatePinScale(pin: Feature<Point>, to: number, duration = PIN_TWEEN_MS) {
    const currentStyle = pin.getStyle() as Style | null;
    const currentImage = currentStyle?.getImage() as Icon | undefined;
    const from =
        currentImage && typeof currentImage.getScale === "function"
            ? (currentImage.getScale() as number)
            : PIN_SCALE_NORMAL;

    const prev = pin.get("_animId") as number | undefined;
    if (prev) cancelAnimationFrame(prev);

    const start = performance.now();
    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

    const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const s = from + (to - from) * easeOutCubic(t);
        pin.setStyle(makePinIconStyle(s));

        if (t < 1) {
            const id = requestAnimationFrame(step);
            pin.set("_animId", id);
        } else {
            pin.set("_animId", undefined);
        }
    };

    const id = requestAnimationFrame(step);
    pin.set("_animId", id);
}

export default function WorldSugarMap() {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<Mode>("top-producers");
    const [countryLayer, setCountryLayer] = useState<VectorLayer<VectorSource> | null>(null);
    const [selected, setSelected] = useState<{ name: string; iso3: string } | null>(null);
    const [pinsLayer, setPinsLayer] = useState<VectorLayer<VectorSource> | null>(null);
    const mapRef = useRef<Map | null>(null);
    const modeRef = useRef<Mode>(mode);
    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    const styleFunction = (feature: any) => {
        const iso3 = (feature.get("ISO_A3") || feature.get("iso_a3") || "").toUpperCase();
        const set =
            mode === "all-producers"
                ? ALL_SUGAR_PRODUCERS
                : mode === "top-producers"
                    ? TOP_PRODUCERS
                    : COMPETITORS_SPECIALTY;
        return set.has(iso3) ? selectedCountryStyle : defaultCountryStyle;
    };

    useEffect(() => {
        if (!mapDivRef.current) return;

        // ==== SOURCES ====
        const countriesSource = new VectorSource({
            url: "/world_countries.geojson",
            format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
            wrapX: true,
            attributions: "© Natural Earth",
        });

        countriesSource.on("addfeature", (e: any) => {
            const f = e.feature;
            const iso3 = (f.get("ISO_A3") || f.get("iso_a3") || "").toUpperCase();
            if (iso3 === "ATA") countriesSource.removeFeature(f);
        });

        const bordersSource = new VectorSource({
            url: "/world_borders.geojson",
            format: new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
            wrapX: true,
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
                stroke: new Stroke({ color: "#F4F5F0", width: 1.6, lineCap: "round", lineJoin: "round" }),
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
            c[0] - w2, c[1] - h2, c[0] + w2, c[1] + h2,
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
        mapRef.current = map;

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
                const f = map.forEachFeatureAtPixel(evt.pixel, (feat, layer) => (layer === countries ? feat : null));
                if (f) {
                    const iso3 = (f.get("ISO_A3") || f.get("iso_a3") || "").toUpperCase();
                    const admin = f.get("ADMIN") || f.get("name") || "Pays";
                    const set =
                        modeRef.current === "all-producers"
                            ? ALL_SUGAR_PRODUCERS
                            : modeRef.current === "top-producers"
                                ? TOP_PRODUCERS
                                : COMPETITORS_SPECIALTY;
                    setSelected(set.has(iso3) ? { iso3, name: admin } : null);
                } else {
                    setSelected(null);
                }
            }
        });

        // HOVER: grossir le pin du pays (sélectionné) avec animation
        let lastHoveredIso3: string | null = null;
        let currentScaledPin: Feature<Point> | null = null;

        const resetHoveredPin = (immediate = false) => {
            if (!currentScaledPin) return;
            if (immediate) {
                const prev = currentScaledPin.get("_animId") as number | undefined;
                if (prev) cancelAnimationFrame(prev);
                currentScaledPin.set("_animId", undefined);
                currentScaledPin.setStyle(makePinIconStyle(PIN_SCALE_NORMAL));
            } else {
                animatePinScale(currentScaledPin, PIN_SCALE_NORMAL, 120);
            }
            currentScaledPin = null;
            lastHoveredIso3 = null;
        };

        const moveKey = map.on("pointermove", (evt) => {
            if (evt.dragging) return;

            const feat = map.forEachFeatureAtPixel(
                evt.pixel,
                (f, layer) => (layer === countries ? f : null),
                { hitTolerance: 4 }
            );

            if (!feat) {
                resetHoveredPin(false);
                return;
            }

            const iso3 = (feat.get("ISO_A3") || feat.get("iso_a3") || "").toUpperCase();
            const set =
                modeRef.current === "all-producers"
                    ? ALL_SUGAR_PRODUCERS
                    : modeRef.current === "top-producers"
                        ? TOP_PRODUCERS
                        : COMPETITORS_SPECIALTY;

            if (!set.has(iso3)) {
                resetHoveredPin(false);
                return;
            }

            if (iso3 !== lastHoveredIso3) {
                if (currentScaledPin) resetHoveredPin(false);

                const match = pins.getSource()
                    ?.getFeatures()
                    .find((p) => (p.get("iso3") || "").toUpperCase() === iso3) as Feature<Point> | undefined;

                if (match) {
                    animatePinScale(match, PIN_SCALE_HOVER);
                    currentScaledPin = match;
                    lastHoveredIso3 = iso3;
                } else {
                    resetHoveredPin(false);
                }
            }
        });

        // reset à la sortie du canvas
        const viewportEl = map.getViewport();
        const onMouseLeave = () => resetHoveredPin(false);
        viewportEl.addEventListener("mouseleave", onMouseLeave);

        setCountryLayer(countries);
        setPinsLayer(pins);

        // CLEANUP
        return () => {
            viewportEl.removeEventListener("mouseleave", onMouseLeave);
            unByKey(clickKey);
            unByKey(moveKey);
            resetHoveredPin(true);
            map.setTarget(undefined);
            mapRef.current = null;
        };
    }, []);

    // reset des pins au changement de mode
    useEffect(() => {
        if (!pinsLayer) return;
        pinsLayer.getSource()?.getFeatures().forEach((p) => {
            const prev = p.get("_animId") as number | undefined;
            if (prev) cancelAnimationFrame(prev);
            p.set("_animId", undefined);
            p.setStyle(makePinIconStyle(PIN_SCALE_NORMAL));
        });
    }, [mode, pinsLayer]);

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
            {/* popup */}
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
