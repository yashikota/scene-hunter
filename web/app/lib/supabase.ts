import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Cookieを使用するように設定
    // これにより、JWTトークンはlocalStorageではなくHttpOnly Cookieに保存される
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "supabase.auth.token",
    storage: {
      getItem: (key) => {
        // SSRの場合はCookieが取得できないので、nullを返す
        if (typeof document === "undefined") {
          return null;
        }

        // Cookieからアイテムを取得
        const value = document.cookie
          .split("; ")
          .find((row) => row.startsWith(`${key}=`))
          ?.split("=")[1];

        if (value) {
          try {
            return JSON.parse(decodeURIComponent(value));
          } catch (e) {
            return value;
          }
        }
        return null;
      },
      setItem: (key, value) => {
        // SSRの場合は何もしない
        if (typeof document === "undefined") {
          return;
        }

        // 30日間有効なCookieを設定
        const maxAge = 30 * 24 * 60 * 60;
        const encodedValue = encodeURIComponent(
          typeof value === "object" ? JSON.stringify(value) : value,
        );
        document.cookie = `${key}=${encodedValue}; max-age=${maxAge}; path=/; SameSite=Lax; secure`;
      },
      removeItem: (key) => {
        // SSRの場合は何もしない
        if (typeof document === "undefined") {
          return;
        }

        // Cookieを削除
        document.cookie = `${key}=; max-age=0; path=/; SameSite=Lax; secure`;
      },
    },
  },
});
