import { m } from "../paraglide/messages";
import { Card } from "../ui/Card";

/** 高さを決めた写真の枠。幅いっぱいに写真を切り抜いて収め、dim で薄くする（無効な写真）。写真が無ければ空の枠。 */
export function Thumb({
  url,
  alt,
  height,
  dim = false,
}: {
  url?: string;
  alt: string;
  height: number;
  dim?: boolean;
}) {
  return (
    <div
      style={{
        height,
        width: "100%",
        background: "var(--color-bg)",
        border: "var(--border)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: dim ? 0.4 : 1,
      }}
    >
      {url && (
        <img src={url} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );
}

/** お題の写真。幅いっぱいに大きく出し、左上に「お題」の印を重ねる（見比べやすいように）。 */
export function TopicCard({ url }: { url?: string }) {
  return (
    <Card raised style={{ position: "relative", padding: 8 }}>
      <Thumb url={url} alt={m.topic_photo()} height={180} />
      <span className="sh-badge" style={{ position: "absolute", top: 16, left: 16 }}>
        {m.topic_label()}
      </span>
    </Card>
  );
}

/** 写真が来るまでの待ちの表示。 */
export function Collecting({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="sh-sub"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 800,
      }}
    >
      <span
        className="sh-pulse"
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "var(--color-timer)",
          border: "var(--border)",
        }}
      />
      {text}
    </div>
  );
}
