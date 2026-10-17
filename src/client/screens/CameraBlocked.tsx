import type { CameraError } from '../photo/camera';
import { m } from '../paraglide/messages';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';

/** カメラを使えないときの案内。許可や接続を直してから「もう一度」で起動し直す。 */
export function CameraBlocked({ reason, onRetry }: { reason: CameraError; onRetry(): void }) {
  return (
    <Screen>
      <Card
        raised
        role="alert"
        style={{
          margin: 'auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          textAlign: 'center',
        }}
      >
        <h1 className="sh-display" style={{ fontSize: 22 }}>
          {m.camera_blocked_title()}
        </h1>
        <p className="sh-pre" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
          {reason === 'denied' ? m.camera_denied_body() : m.camera_unavailable_body()}
        </p>
      </Card>
      <Button variant="primary" onClick={onRetry}>
        {m.camera_retry()}
      </Button>
    </Screen>
  );
}
