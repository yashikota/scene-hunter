import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Top } from '../screens/Top';

/** ?code= は 6 桁の数字のときだけ使う。それ以外は無いものとして扱う。 */
export function parseCodeParam(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{6}$/.test(value) ? value : undefined;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { code?: string } => {
    // code を必ず返す（親の検索文字列の生の値が残らないように、無効なら undefined で上書きする）
    return { code: parseCodeParam(search.code) };
  },
  component: TopRoute,
});

function TopRoute() {
  const navigate = useNavigate();
  const { code } = Route.useSearch();
  return <Top initialCode={code} onEntered={(c) => void navigate({ to: '/r/$code', params: { code: c } })} />;
}
