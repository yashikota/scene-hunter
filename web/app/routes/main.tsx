import { useCallback, useContext, useEffect } from "react";
import { useNavigate } from "react-router";
import AuthPanel from "../components/Auth";
import { supabase } from "../lib/supabase";
import { AuthVisibilityContext } from "../root";

export function Main() {
  const { showAuth, setShowAuth } = useContext(AuthVisibilityContext);
  const navigate = useNavigate();

  // 認証成功時のコールバック
  const handleAuthSuccess = useCallback(() => {
    // 認証画面を非表示にする
    setShowAuth(false);
    // ルーム画面に遷移
    navigate("/room");
  }, [setShowAuth, navigate]);

  // 認証状態を確認し、未ログインの場合のみ認証画面を表示
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // セッションがない場合は認証画面を表示
        setShowAuth(true);
      } else {
        // セッションがある場合は認証画面を非表示
        setShowAuth(false);
      }
    };

    checkAuth();
  }, [setShowAuth]);

  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="container mx-auto">
        {showAuth && (
          <div className="mt-8 flex justify-center">
            <AuthPanel onAuthSuccess={handleAuthSuccess} />
          </div>
        )}
      </div>
    </main>
  );
}
