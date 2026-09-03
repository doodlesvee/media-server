import type { MediaItemDetail, PhotoMetadata, VideoMetadata } from "@/lib/mediaItemApi";

function formatCoords(gps: { latitude: number; longitude: number }): string {
  return `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
}

export function TechnicalInfoPanel({ item }: { item: MediaItemDetail }) {
  if (item.itemType === "folder") return null;

  const rows: [string, string][] = [];

  if (item.itemType === "video") {
    const meta = (item.extraMetadata ?? {}) as VideoMetadata;
    if (meta.width && meta.height) rows.push(["Resolution", `${meta.width}×${meta.height}`]);
    if (meta.codec) rows.push(["Codec", meta.codec]);
    if (meta.containerFormat) rows.push(["Container", meta.containerFormat]);
  } else {
    const meta = (item.extraMetadata ?? {}) as PhotoMetadata;
    if (meta.cameraModel) rows.push(["Camera", meta.cameraModel]);
    if (meta.gps) rows.push(["Location", formatCoords(meta.gps)]);
    if (item.takenAt) rows.push(["Taken", new Date(item.takenAt).toLocaleString()]);
  }

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
