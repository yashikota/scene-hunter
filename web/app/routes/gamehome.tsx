import type { User } from "@supabase/supabase-js";
import { LogOutIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { supabase } from "../lib/supabase";

export default function GameHome() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 認証状態の確認
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setUser(data.session.user);
      }
    };

    checkAuth();

    // セッション変化を監視
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Pacifico フォント読み込み
  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Pacifico&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const handleOAuthLogin = async (provider: "google" | "discord") => {
    setLoading(true);
    setError(null);

    // ユーザーが既に匿名ログインしている場合は、OAuth IDを連携
    if (user?.app_metadata?.provider === "anonymous") {
      const { error } = await supabase.auth.linkIdentity({ provider });
      if (error) {
        setError(error.message);
      }
    } else {
      // 通常のOAuthログイン
      const { error } = await supabase.auth.signInWithOAuth({ provider });
      if (error) setError(error.message);
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-blue-100 p-4">
      {/* 左下カメラ画像 */}
      <img
        src="/icon.png"
        alt="camera icon"
        className="absolute bottom-4 left-4 w-20 h-20 object-contain"
      />

      {/* ユーザー情報 */}
      <div className="absolute top-4 right-4">
        {/* ユーザー情報表示 - ログインしている場合のみ */}
        {user && (
          <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={
                  user.user_metadata?.avatar_url ||
                  `https://api.dicebear.com/9.x/icons/svg?seed=${user.id}`
                }
                alt={user.email || user.id}
              />
              <AvatarFallback>
                {user.email?.[0]?.toUpperCase() ||
                  user.id?.[0]?.toUpperCase() ||
                  "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm">
              {user.user_metadata?.full_name || user.email || "ユーザー"}
            </span>
            <div className="flex items-center gap-1 text-xs">
              {user.app_metadata?.provider === "google" && (
                <span className="bg-[#4285F4] text-white px-1 rounded">
                  Google
                </span>
              )}
              {user.app_metadata?.provider === "discord" && (
                <span className="bg-[#5865F2] text-white px-1 rounded">
                  Discord
                </span>
              )}
              {(!user.app_metadata?.provider ||
                user.app_metadata?.provider === "anonymous") && (
                <span className="bg-gray-500 text-white px-1 rounded">
                  匿名
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-8 w-8 p-0"
            >
              <LogOutIcon className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 未ログインの場合はログインボタンを表示しない */}
      </div>

      <Card className="w-full max-w-md shadow-xl border border-gray-300 bg-white">
        <CardContent className="flex flex-col items-center gap-6 py-10">
          <h1
            className="text-4xl text-gray-800"
            style={{ fontFamily: '"Pacifico", cursive' }}
          >
            Scene Hunter
          </h1>

          <Button
            className="w-64 text-lg bg-[#EEEEEE] text-black hover:bg-gray-300"
            onClick={() => navigate("/create")}
          >
            ルーム作成
          </Button>

          <Button
            className="w-64 text-lg bg-[#EEEEEE] text-black hover:bg-gray-300"
            onClick={() => navigate("/join")}
          >
            ルーム参加
          </Button>

          <Button
            className="w-64 text-lg bg-[#EEEEEE] text-black hover:bg-gray-300"
            onClick={() => navigate("/how-to-play")}
          >
            ゲームの遊び方
          </Button>

          {/* ログインボタンまたはアカウント連携ボタン */}
          <div className="relative w-full my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">
                {user?.app_metadata?.provider === "anonymous"
                  ? "アカウント連携"
                  : "ログイン"}
              </span>
            </div>
          </div>
          <div className="flex gap-4">
            {/* ログインしていない場合は両方のボタンを表示 */}
            {!user && (
              <>
                <Button
                  onClick={() => handleOAuthLogin("google")}
                  disabled={loading}
                  className="bg-[#4285F4] hover:bg-[#357ae8]"
                >
                  Googleでログイン
                </Button>
                <Button
                  onClick={() => handleOAuthLogin("discord")}
                  disabled={loading}
                  className="bg-[#5865F2] hover:bg-[#4752c4]"
                >
                  Discordでログイン
                </Button>
              </>
            )}

            {/* 匿名ユーザーの場合は両方の連携ボタンを表示 */}
            {user &&
              (!user.app_metadata?.provider ||
                user.app_metadata?.provider === "anonymous") && (
                <>
                  <Button
                    onClick={() => handleOAuthLogin("google")}
                    disabled={loading}
                    className="bg-[#4285F4] hover:bg-[#357ae8]"
                  >
                    Googleと連携
                  </Button>
                  <Button
                    onClick={() => handleOAuthLogin("discord")}
                    disabled={loading}
                    className="bg-[#5865F2] hover:bg-[#4752c4]"
                  >
                    Discordと連携
                  </Button>
                </>
              )}

            {/* Googleでログイン済みの場合はDiscordのみ表示 */}
            {user && user.app_metadata?.provider === "google" && (
              <Button
                onClick={() => handleOAuthLogin("discord")}
                disabled={loading}
                className="bg-[#5865F2] hover:bg-[#4752c4]"
              >
                Discordも連携
              </Button>
            )}

            {/* Discordでログイン済みの場合はGoogleのみ表示 */}
            {user && user.app_metadata?.provider === "discord" && (
              <Button
                onClick={() => handleOAuthLogin("google")}
                disabled={loading}
                className="bg-[#4285F4] hover:bg-[#357ae8]"
              >
                Googleも連携
              </Button>
            )}

            {/* デバッグ情報 - 開発時のみ表示 */}
            {process.env.NODE_ENV === "development" && user && (
              <div className="text-xs text-gray-500 mt-2 w-full">
                <div>Provider: {user.app_metadata?.provider || "未設定"}</div>
                <div>User ID: {user.id}</div>
              </div>
            )}
          </div>

          {error && <div className="text-red-500 mt-2 text-sm">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
