import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { CreateRoom } from "../screens/Top";

export const Route = createFileRoute("/new")({
  component: NewRoute,
});

/**
 * 部屋を作るときの名前の入力。トップと URL を分けておくと、ブラウザの「戻る」でトップへ戻れる
 * （同じ URL のままだと、トップの前のページ（紹介のページなど）まで戻ってしまう）。
 */
function NewRoute() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <CreateRoom
      // 作った後に「戻る」で名前の入力に戻らないよう、/new を部屋の URL で置き換える
      onCreated={(c) => void navigate({ to: "/r/$code", params: { code: c }, replace: true })}
      onBack={() => (canGoBack ? router.history.back() : void navigate({ to: "/", replace: true }))}
    />
  );
}
