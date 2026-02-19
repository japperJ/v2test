import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';

interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeofenceMapProps {
  initialPolygon?: GeoJSONPolygon | null;
  onPolygonChange: (polygon: GeoJSONPolygon | null) => void;
}

export function GeofenceMap({ initialPolygon, onPolygonChange }: GeofenceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map centered on world view
    const map = L.map(mapRef.current).setView([20, 0], 2);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    // FeatureGroup to store drawn items
    const drawnItems = new L.FeatureGroup();
    drawnItemsRef.current = drawnItems;
    map.addLayer(drawnItems);

    // Load initial polygon if present
    if (initialPolygon) {
      try {
        const layer = L.geoJSON(initialPolygon as GeoJSON.GeoJsonObject);
        layer.eachLayer((l) => drawnItems.addLayer(l));
        map.fitBounds(drawnItems.getBounds());
      } catch (e) {
        console.warn('Failed to load initial polygon:', e);
      }
    }

    // Draw controls
    const drawControl = new (L as unknown as { Control: { Draw: new (opts: unknown) => L.Control } }).Control.Draw({
      edit: { featureGroup: drawnItems },
      draw: {
        polygon: true,
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
    });
    map.addControl(drawControl);

    // On draw created
    map.on(L.Draw.Event.CREATED, (e: unknown) => {
      const event = e as { layer: L.Layer };
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      const geoJson = drawnItems.toGeoJSON();
      const feature = (geoJson as GeoJSON.FeatureCollection).features[0];
      if (feature?.geometry?.type === 'Polygon') {
        onPolygonChange(feature.geometry as GeoJSONPolygon);
      }
    });

    // On draw edited
    map.on(L.Draw.Event.EDITED, () => {
      const geoJson = drawnItems.toGeoJSON();
      const feature = (geoJson as GeoJSON.FeatureCollection).features[0];
      if (feature?.geometry?.type === 'Polygon') {
        onPolygonChange(feature.geometry as GeoJSONPolygon);
      } else {
        onPolygonChange(null);
      }
    });

    // On draw deleted
    map.on(L.Draw.Event.DELETED, () => {
      onPolygonChange(null);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      drawnItemsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div ref={mapRef} style={{ height: '400px', width: '100%' }} className="rounded border border-gray-300 z-0" />
      <p className="text-xs text-gray-500 mt-1">
        Use the draw tool (polygon icon) on the left to draw a geofence boundary. Click the trash icon to clear.
      </p>
    </div>
  );
}
