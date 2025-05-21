import { CopyIcon, LinkIcon, LogOutIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext"; // Import useAuth
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

export default function AuthPanel() {
  const {
    user,
    jwt,
    setSession,
    clearSession,
    isLoading: isAuthLoading, // Renaming to avoid conflict with local loading
    setIsLoading: setIsAuthLoading,
  } = useAuth();
  const [loading, setLoading] = useState(false); // Local loading for UI operations
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsAuthLoading(true); // Indicate that we are now checking the session

    // Initial session check
    const checkSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Error getting session:", sessionError);
        clearSession(); // Clear session in context
      } else if (data.session) {
        setSession(data.session.access_token, data.session.user);
      } else {
        clearSession(); // No session, ensure context is cleared
      }
      setIsAuthLoading(false);
    };

    checkSession();

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (_event === "INITIAL_SESSION") {
          // Handled by checkSession, but good to be explicit
          if (session) {
            setSession(session.access_token, session.user);
          } else {
            clearSession();
          }
        } else if (_event === "SIGNED_IN" || _event === "TOKEN_REFRESHED") {
          if (session) {
            setSession(session.access_token, session.user);
          } else {
            // This case should ideally not happen for SIGNED_IN/TOKEN_REFRESHED
            // but if it does, clear the session.
            console.warn(`Auth event ${_event} without session data.`);
            clearSession();
          }
        } else if (_event === "SIGNED_OUT") {
          clearSession();
        }
        // No need to call setIsAuthLoading(false) here for every event,
        // as the initial loading is the primary concern for the UI.
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [setSession, clearSession, setIsAuthLoading]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // Sign out if there's an existing session (might be anonymous or otherwise)
      // This simplifies logic by ensuring a clean slate before anonymous login.
      const { data: current } = await supabase.auth.getSession();
      if (current.session) {
        await supabase.auth.signOut(); // This will trigger SIGNED_OUT, clearing context
      }

      // Anonymous login
      const { data, error: signInError } =
        await supabase.auth.signInAnonymously();
      if (signInError) {
        setError(signInError.message);
        clearSession(); // Ensure context is cleared on error
      } else if (data.session) {
        // onAuthStateChange will handle setting the session in context
        // setSession(data.session.access_token, data.user); // Redundant due to listener
      } else {
        // Should not happen if signInAnonymously is successful and returns a user/session
        setError("Anonymous login did not return a session.");
        clearSession();
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred during login.");
      clearSession();
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: "google" | "discord") => {
    setLoading(true);
    setError(null);
    try {
      // Check if the current user is anonymous
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (currentUser?.app_metadata?.provider === "anonymous") {
        // Link identity if user is anonymous
        const { error: linkError } = await supabase.auth.linkIdentity({ provider });
        if (linkError) {
          setError(linkError.message);
        }
        // onAuthStateChange will handle session update if linking is successful
        // and triggers a user update or token refresh.
      } else {
        // Standard OAuth sign-in
        const { error: signInError } = await supabase.auth.signInWithOAuth({
          provider,
        });
        if (signInError) {
          setError(signInError.message);
        }
        // onAuthStateChange will handle setting the session in context after redirect
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred during OAuth login.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
      }
      // onAuthStateChange will call clearSession()
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred during logout.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (jwt) navigator.clipboard.writeText(jwt);
  };

  // Show a loading indicator while the auth state is being determined
  if (isAuthLoading) {
    return (
      <div className="flex flex-col gap-2 items-center justify-center p-4">
        <p>セッション情報を読み込み中...</p>
      </div>
    );
  }

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
                    <span>via {user.app_metadata?.provider}</span>
                  </div>
                )}
              </div>
            </div>

            {jwt && (
              <div className="w-full mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    アクセストークン (デバッグ用 公開禁止)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={handleCopy}
                  >
                    <CopyIcon className="h-3.5 w-3.5 mr-1" />
                    <span className="text-xs">コピー</span>
                  </Button>
                </div>
                <div className="text-xs break-all bg-gray-50 p-2 rounded border border-gray-200 max-h-16 overflow-y-auto">
                  {jwt}
                </div>
              </div>
            )}

            {/* 匿名ユーザーの場合、アカウント連携オプションを表示 */}
            {/* Also check if identities exist and if the current provider is the only one */}
            {(user.app_metadata?.provider === "anonymous" ||
              (user.identities && user.identities.length > 0 && user.identities.every(id => id.provider === user.app_metadata?.provider) && user.identities.length === 1 && user.app_metadata?.provider === 'anonymous') || // Checks if only anonymous identity exists
              (user.id && (!user.identities || user.identities.length === 0))) && ( // Fallback for older or direct anonymous users
              <div className="mt-4 w-full">
                <p className="text-sm text-gray-600 mb-2">
                  アカウントをリンクして永続的なアクセスを確保:
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => handleOAuthLogin("google")}
                    disabled={loading || isAuthLoading}
                    className="bg-[#4285F4] hover:bg-[#357ae8] w-full flex items-center"
                    size="sm"
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Googleアカウントと連携
                  </Button>
                  <Button
                    onClick={() => handleOAuthLogin("discord")}
                    disabled={loading || isAuthLoading}
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
              disabled={loading || isAuthLoading}
            >
              <LogOutIcon className="h-4 w-4 mr-2" />
              ログアウト
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 items-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 w-full max-w-md">
          <h2 className="text-lg font-medium mb-2">アカウントにログイン</h2>
          <Button
            onClick={handleLogin}
            disabled={loading || isAuthLoading}
            className="w-full"
          >
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
            disabled={loading || isAuthLoading}
            className="w-full bg-[#4285F4] hover:bg-[#357ae8]"
          >
            Googleでログイン
          </Button>
          <Button
            onClick={() => handleOAuthLogin("discord")}
            disabled={loading || isAuthLoading}
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
