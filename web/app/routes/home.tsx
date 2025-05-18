import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase";
import { Main } from "./main";

// APIレスポンスの型定義
interface WordItem {
  category: string;
  word: string;
}

interface HiraganaWordApiResponse {
  combinations: WordItem[][];
  selectedCategories: string[];
}

export default function Home() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 認証状態を確認してからリダイレクト
    const checkAuthAndRedirect = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        // セッションがない場合は匿名ログインを実行
        if (!data.session) {
          // ランダムなユーザー名を生成するAPIを呼び出す
          try {
            const response = await fetch(
              "https://hiragana-word-api.yashikota.workers.dev/random-combine",
            );
            const nameData = (await response.json()) as HiraganaWordApiResponse;

            // APIからの応答を使用してユーザー名を生成
            let username = "";
            if (
              nameData &&
              nameData.combinations &&
              nameData.combinations.length > 0
            ) {
              const words = nameData.combinations[0];
              username = words.map((item) => item.word).join("");
            } else {
              // APIからの応答がない場合はデフォルトのユーザー名を使用
              username = "ゲスト" + Math.floor(Math.random() * 10000);
            }

            // 匿名ログインとユーザー名の設定
            const { data: authData } = await supabase.auth.signInAnonymously();
            if (authData && authData.user) {
              await supabase.auth.updateUser({
                data: { full_name: username },
              });
            }
          } catch (apiError) {
            console.error("ユーザー名生成APIエラー:", apiError);
            // APIエラーの場合は通常の匿名ログインを実行
            await supabase.auth.signInAnonymously();
          }
        }

        // ルーム画面にリダイレクト
        navigate("/room");
      } catch (error) {
        console.error("認証エラー:", error);
        // エラーが発生しても最終的にはルーム画面に遷移
        navigate("/room");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthAndRedirect();
  }, [navigate]);

  // ローディング中は何も表示しない
  if (isLoading) {
    return null;
  }

  return <Main />;
}
