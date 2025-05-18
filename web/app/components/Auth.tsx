import type { User } from "@supabase/supabase-js";
import { CopyIcon, LinkIcon, LogOutIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

interface AuthPanelProps {
  onAuthSuccess?: () => void;
}

export default function AuthPanel({ onAuthSuccess }: AuthPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 初期状態のセッション確認
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setUser(data.session.user);
        // 認証成功時にコールバックを呼び出す
        if (onAuthSuccess) {
          onAuthSuccess();
        }
      }
    };

    checkSession();

    // セッション変化を監視
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setUser(session.user);
          // 認証成功時にコールバックを呼び出す
          if (onAuthSuccess) {
            onAuthSuccess();
          }
          // セッション情報はSupabaseがCookieとして自動的に管理
        } else {
          setUser(null);
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    // 既にログインしていたらログアウト
    const { data: current } = await supabase.auth.getSession();
    if (current.session) {
      await supabase.auth.signOut();
      setUser(null);
    }
    // 匿名ログイン
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      setError(error.message);
    } else {
      setUser(data.user);
      // 認証成功時にコールバックを呼び出す
      if (onAuthSuccess) {
        onAuthSuccess();
      }
    }
    setLoading(false);
  };

  const handleOAuthLogin = async (provider: "google" | "discord") => {
    setLoading(true);
    setError(null);

    // ユーザーが既に匿名ログインしている場合は、OAuth IDを連携
    if (user?.app_metadata?.provider === "anonymous") {
      const { error } = await supabase.auth.linkIdentity({ provider });
      if (error) {
        setError(error.message);
      } else {
        // 更新されたセッション情報を取得
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setUser(data.session.user);
          // 認証成功時にコールバックを呼び出す
          if (onAuthSuccess) {
            onAuthSuccess();
          }
        }
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
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-2 items-center justify-center">
      {user ? (
        <>
          {/* ユーザープロフィール情報 */}
          <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 w-full max-w-md">
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-16 w-16 border-2 border-primary/10">
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
              <div>
                <h2 className="text-lg font-medium">
                  {user.user_metadata?.full_name || user.email || "ユーザー"}
                </h2>
                <p className="text-sm text-gray-500">{user.email || user.id}</p>
                {user.app_metadata?.provider && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <span>via {user.app_metadata.provider}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 匿名ユーザーの場合、アカウント連携オプションを表示 */}
            {(user.app_metadata?.provider === "anonymous" ||
              (user.id &&
                (!user.identities || user.identities.length === 0))) && (
              <div className="mt-4 w-full">
                <p className="text-sm text-gray-600 mb-2">
                  アカウントをリンクして永続的なアクセスを確保:
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleOAuthLogin("google")}
                    disabled={loading}
                    className="bg-[#4285F4] hover:bg-[#357ae8] w-full flex items-center"
                    size="sm"
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Googleアカウントと連携
                  </Button>
                  <Button
                    onClick={() => handleOAuthLogin("discord")}
                    disabled={loading}
                    className="bg-[#5865F2] hover:bg-[#4752c4] w-full flex items-center"
                    size="sm"
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Discordアカウントと連携
                  </Button>
                </div>
              </div>
            )}

            <Button
              className="mt-4 w-full flex items-center justify-center"
              variant="destructive"
              onClick={handleLogout}
              disabled={loading}
            >
              <LogOutIcon className="h-4 w-4 mr-2" />
              ログアウト
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 items-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 w-full max-w-md">
          <h2 className="text-lg font-medium mb-2">アカウントにログイン</h2>
          <Button onClick={handleLogin} disabled={loading} className="w-full">
            匿名でログイン
          </Button>
          <div className="relative w-full my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">または</span>
            </div>
          </div>
          <Button
            onClick={() => handleOAuthLogin("google")}
            disabled={loading}
            className="w-full bg-[#4285F4] hover:bg-[#357ae8]"
          >
            Googleでログイン
          </Button>
          <Button
            onClick={() => handleOAuthLogin("discord")}
            disabled={loading}
            className="w-full bg-[#5865F2] hover:bg-[#4752c4]"
          >
            Discordでログイン
          </Button>
        </div>
      )}
      {error && <div className="text-red-500 mt-2">{error}</div>}
    </div>
  );
}
