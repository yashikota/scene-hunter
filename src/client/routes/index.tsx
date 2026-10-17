import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Top } from '../screens/Top';

/** ?code= は 6 桁の数字のときだけ使う。それ以外は無いものとして扱う。 */
export function parseCodeParam(value: unknown): string | undefined {
  const s = typeof value === 'number' ? String(value).padStart(6, '0') : value;
  return typeof s === 'string' && /^\d{6}$/.test(s) ? s : undefined;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { code?: string } => {
    const code = parseCodeParam(search.code);
    return code ? { code } : {};
  },
  component: TopRoute,
});

function TopRoute() {
  const navigate = useNavigate();
  const { code } = Route.useSearch();
  return <Top initialCode={code} onEntered={(c) => void navigate({ to: '/r/$code', params: { code: c } })} />;
}
