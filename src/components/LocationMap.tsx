import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import type { MarketVendor } from "../domain";

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface MapBounds {
  extend: (position: LatLngLiteral) => void;
}

interface MapCircle {
  getBounds: () => MapBounds | null;
}

interface MapsApi {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => {
    fitBounds: (bounds: MapBounds, padding?: number) => void;
  };
  Geocoder: new () => {
    geocode: (request: { address: string }) => Promise<{
      results: Array<{ geometry: { location: { lat: () => number; lng: () => number } } }>;
    }>;
  };
  Circle: new (options: Record<string, unknown>) => MapCircle;
  Marker: new (options: Record<string, unknown>) => unknown;
  LatLngBounds: new () => MapBounds;
}

declare global {
  interface Window {
    google?: { maps: MapsApi };
  }
}

interface LocationMapProps {
  location: string;
  radiusKm: number;
  vendors?: MarketVendor[];
  className?: string;
}

let mapsLoader: Promise<MapsApi> | undefined;
const noVendors: MarketVendor[] = [];

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise<MapsApi>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-lilly-maps]");
    const script = existingScript ?? document.createElement("script");
    const handleLoad = () =>
      window.google?.maps
        ? resolve(window.google.maps)
        : reject(new Error("Google Maps did not load."));

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps could not be loaded.")), {
      once: true,
    });
    if (!existingScript) {
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
      script.async = true;
      script.dataset.lillyMaps = "true";
      document.head.appendChild(script);
    }
  });
  return mapsLoader;
}

async function geocodeAddress(maps: MapsApi, address: string): Promise<LatLngLiteral> {
  const { results } = await new maps.Geocoder().geocode({ address });
  const location = results[0]?.geometry.location;
  if (!location) throw new Error(`Google Maps could not find “${address}”.`);
  return { lat: location.lat(), lng: location.lng() };
}

export function LocationMap({
  location,
  radiusKm,
  vendors = noVendors,
  className = "",
}: LocationMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [apiKey, setApiKey] = useState<string | undefined>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || undefined,
  );
  const query = location.trim();

  useEffect(() => {
    if (apiKey) return;
    let cancelled = false;
    fetch("/api/maps-key")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no key"))))
      .then((data: { key?: string }) => {
        if (!cancelled && data.key) setApiKey(data.key);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !query || !mapElement.current) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setError(undefined);
        const maps = await loadGoogleMaps(apiKey);
        const center = await geocodeAddress(maps, query);
        if (cancelled || !mapElement.current) return;

        const map = new maps.Map(mapElement.current, {
          center,
          zoom: 11,
          mapTypeControl: false,
          fullscreenControl: true,
          streetViewControl: false,
        });
        const circle = new maps.Circle({
          map,
          center,
          radius: Math.max(radiusKm, 1) * 1_000,
          fillColor: "#3f8d62",
          fillOpacity: 0.12,
          strokeColor: "#286a54",
          strokeOpacity: 0.72,
          strokeWeight: 2,
        });
        new maps.Marker({ map, position: center, title: query, label: "E" });

        const bounds = circle.getBounds() ?? new maps.LatLngBounds();
        const vendorPositions = await Promise.all(
          vendors.map(async (vendor) => {
            if (typeof vendor.latitude === "number" && typeof vendor.longitude === "number") {
              return { lat: vendor.latitude, lng: vendor.longitude };
            }
            return vendor.address
              ? geocodeAddress(maps, vendor.address).catch(() => undefined)
              : undefined;
          }),
        );
        if (cancelled) return;
        vendorPositions.forEach((position, index) => {
          if (!position) return;
          bounds.extend(position);
          new maps.Marker({
            map,
            position,
            title: vendors[index]?.name,
            label: String(index + 1),
          });
        });
        map.fitBounds(bounds, 42);
      } catch (mapError) {
        if (!cancelled) {
          setError(
            mapError instanceof Error ? mapError.message : "Google Maps could not be loaded.",
          );
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiKey, query, radiusKm, vendors]);

  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  return (
    <div className={`location-map ${className}`.trim()}>
      <div
        className="location-map__canvas"
        ref={mapElement}
        aria-label={`Map of ${query || "event area"}`}
      >
        {!query && (
          <div className="location-map__placeholder">
            <MapPin size={28} />
            <strong>Add a city or venue address</strong>
            <span>The event location and search radius will appear here.</span>
          </div>
        )}
        {query && !apiKey && (
          <div className="location-map__placeholder">
            <MapPin size={28} />
            <strong>Google Maps key not configured</strong>
            <span>Add GOOGLE_API_KEY on the server to enable the live radius map.</span>
            <a href={mapsSearchUrl} target="_blank" rel="noreferrer">
              Open location in Google Maps <ExternalLink size={14} />
            </a>
          </div>
        )}
        {error && (
          <div className="location-map__placeholder location-map__placeholder--error" role="alert">
            <MapPin size={28} />
            <strong>Map unavailable</strong>
            <span>{error}</span>
          </div>
        )}
      </div>
      {query && (
        <div className="location-map__caption">
          <span>
            <MapPin size={14} /> {query}
          </span>
          <strong>{Math.max(radiusKm, 1)} km search radius</strong>
        </div>
      )}
    </div>
  );
}
