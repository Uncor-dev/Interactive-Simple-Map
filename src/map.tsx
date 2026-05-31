import { Map, View } from "ol";
import GeoJSON from "ol/format/GeoJSON";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import "ol/ol.css";
import { fromLonLat, transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import Fill from "ol/style/Fill";
import Stroke from "ol/style/Stroke";
import Style from "ol/style/Style";
import { useEffect, useRef, useState } from "react";

export default function MapComponent(): JSX.Element {
  const mapDomRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  const textureLayerRef = useRef<TileLayer | null>(null);
  const reunionLayerRef = useRef<VectorLayer | null>(null);
  const soleLayerRef = useRef<VectorLayer | null>(null);
  const communesLayerRef = useRef<VectorLayer | null>(null);
  const intercoLayerRef = useRef<VectorLayer | null>(null);
  const batiLayerRef = useRef<VectorLayer | null>(null);

  const [selectedZone, setSelectedZone] = useState<
    "commune" | "interco" | "reunion"
  >("reunion");

  const MIN_ZOOM = 9.5;
  const MAX_ZOOM = 18;
  const PRECISE_STEP = 0.2;
  const LARGE_ZOOM = 16.5;

  useEffect(() => {
    if (!mapDomRef.current) return;

    const reunionExtent = transformExtent(
      [54.5, -22.0, 56.5, -20.5],
      "EPSG:4326",
      "EPSG:3857",
    );

    // Filtre blanc réintroduit sur La Réunion (au-dessus du hillshade, en-dessous des autres vecteurs)
    // Ajuste l'alpha si le filtre est trop/peu visible.
    const reunionStyle = new Style({
      stroke: new Stroke({ color: "rgba(45,95,82,0.6)", width: 0.8 }),
      fill: new Fill({ color: "rgba(245,245,245,0.50)" }), // <--- filtre blanc qui atténue le relief
    });

    const communesStyle = new Style({
      stroke: new Stroke({ color: "rgba(45,95,82,0.7)", width: 0.7 }),
      fill: new Fill({ color: "rgba(0,0,0,0)" }),
    });

    const intercoStyle = communesStyle; // même style que communes

    // Sole cannière : couleur nette (opaque) au-dessus du filtre blanc
    const soleCanniereStyle = new Style({
      fill: new Fill({ color: "#009a73" }),
      stroke: new Stroke({ color: "rgba(0,0,0,0.12)", width: 0.5 }),
    });

    const batiStyle = new Style({
      fill: new Fill({ color: "#d95f02" }),
      stroke: new Stroke({ color: "rgba(0,0,0,0.15)", width: 0.5 }),
    });

    // Hillshade (relief gris) en dessous — opacité réglée pour être visible mais atténérée par le filtre blanc
    const textureLayer = new TileLayer({
      source: new XYZ({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
        crossOrigin: "anonymous",
      }),
      opacity: 0.6,
      zIndex: 0,
    });
    textureLayerRef.current = textureLayer;

    const reunionLayer = new VectorLayer({
      source: new VectorSource({
        url: "/all-reunion.geojson",
        format: new GeoJSON({
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      }),
      style: reunionStyle,
      zIndex: 10,
    });
    reunionLayerRef.current = reunionLayer;

    const soleLayer = new VectorLayer({
      source: new VectorSource({
        url: "/sole-canniere.geojson",
        format: new GeoJSON({
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      }),
      style: soleCanniereStyle,
      zIndex: 20,
    });
    soleLayerRef.current = soleLayer;

    const batiLayer = new VectorLayer({
      source: new VectorSource({
        url: "/bati.geojson",
        format: new GeoJSON({
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      }),
      style: batiStyle,
      zIndex: 25,
    });
    batiLayerRef.current = batiLayer;

    const communesLayer = new VectorLayer({
      source: new VectorSource({
        url: "/communes.geojson",
        format: new GeoJSON({
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      }),
      style: communesStyle,
      zIndex: 30,
    });
    communesLayerRef.current = communesLayer;

    const intercoLayer = new VectorLayer({
      source: new VectorSource({
        url: "/interco.geojson",
        format: new GeoJSON({
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      }),
      style: intercoStyle,
      zIndex: 30,
    });
    intercoLayerRef.current = intercoLayer;

    const layers = [
      textureLayer,
      reunionLayer,
      soleLayer,
      batiLayer,
      communesLayer,
      intercoLayer,
    ];

    const isMobile = window.innerWidth < 640;

    const view = new View({
      center: fromLonLat([55.5364, -21.1151]),
      zoom: isMobile ? 9.5 : 10,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      extent: reunionExtent,
    });

    const map = new Map({
      target: mapDomRef.current!,
      layers,
      view,
      controls: [],
    });

    mapRef.current = map;

    // Masquer communes / interco par défaut
    communesLayer.setVisible(false);
    intercoLayer.setVisible(false);

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  // Toggle visibility sans recréer la map
  useEffect(() => {
    const communes = communesLayerRef.current;
    const interco = intercoLayerRef.current;
    if (!communes || !interco) return;

    if (selectedZone === "reunion") {
      communes.setVisible(false);
      interco.setVisible(false);
    } else if (selectedZone === "commune") {
      communes.setVisible(true);
      interco.setVisible(false);
    } else {
      communes.setVisible(false);
      interco.setVisible(true);
    }
  }, [selectedZone]);

  const getView = () => mapRef.current?.getView() ?? null;

  const animateZoomTo = (z: number) => {
    const v = getView();
    if (!v) return;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    v.animate({ zoom: clamped, duration: 300 });
  };

  const preciseZoomIn = () => {
    const v = getView();
    if (!v) return;
    const cur = v.getZoom() ?? 10;
    animateZoomTo(cur + PRECISE_STEP);
  };

  const preciseZoomOut = () => {
    const v = getView();
    if (!v) return;
    const cur = v.getZoom() ?? 10;
    animateZoomTo(cur - PRECISE_STEP);
  };

  const largeZoomIn = () => animateZoomTo(LARGE_ZOOM);

  const resetView = () => {
    const v = getView();
    if (!v) return;
    const isMobile = window.innerWidth < 640;
    const defaultZoom = isMobile ? 9.5 : 10;
    v.animate({
      center: fromLonLat([55.5364, -21.1151]),
      zoom: defaultZoom,
      duration: 400,
    });
  };

  return (
    <div style={{ width: "100%", height: "700px", position: "relative" }}>
      {/* Contrôle minimal pour changer la délimitation */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 1000,
          background: "white",
          padding: "8px",
          borderRadius: 8,
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Changer la sélection
        </div>

        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
          <input
            type="radio"
            name="zone"
            value="reunion"
            checked={selectedZone === "reunion"}
            onChange={() => setSelectedZone("reunion")}
            style={{ marginRight: 8 }}
          />
          Toute La Réunion
        </label>

        <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
          <input
            type="radio"
            name="zone"
            value="interco"
            checked={selectedZone === "interco"}
            onChange={() => setSelectedZone("interco")}
            style={{ marginRight: 8 }}
          />
          Intercommunalités
        </label>

        <label style={{ display: "block", fontSize: 13 }}>
          <input
            type="radio"
            name="zone"
            value="commune"
            checked={selectedZone === "commune"}
            onChange={() => setSelectedZone("commune")}
            style={{ marginRight: 8 }}
          />
          Communes
        </label>
      </div>

      {/* Panneau de zoom */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            background: "white",
            padding: 6,
            borderRadius: 8,
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <button
            onClick={preciseZoomIn}
            title="Zoom précis +"
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: "none",
              background: "#ffffff",
              cursor: "pointer",
              fontSize: 18,
              marginBottom: 6,
            }}
          >
            +
          </button>

          <button
            onClick={preciseZoomOut}
            title="Zoom précis -"
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: "none",
              background: "#ffffff",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            −
          </button>
        </div>

        <div
          style={{
            background: "white",
            padding: 6,
            borderRadius: 8,
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={largeZoomIn}
            title="Zoom beaucoup (fixe)"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "none",
              background: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ++
          </button>

          <button
            onClick={resetView}
            title="Réinitialiser la vue"
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              border: "none",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            R
          </button>
        </div>
      </div>

      {/* Conteneur carte : fond vert très clair pour la mer */}
      <div
        ref={mapDomRef}
        style={{ width: "100%", height: "100%", backgroundColor: "#e6f9e6" }}
      />
    </div>
  );
}
