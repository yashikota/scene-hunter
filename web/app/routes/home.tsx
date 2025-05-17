import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Main } from "./main";

export function meta() {
  return [
    { title: "Scene Hunter" },
    {
      name: "description",
      content:
        "ゲームマスターが撮影した写真からAIが特徴を抽出し、ハンターはその文章のヒントだけを頼りに同じ場所を見つけて写真を撮る。写真の一致率によってスコアが決まり、最も高いスコアを出したハンターが勝利するゲーム",
    },

    {
      property: "og:title",
      content: "Scene Hunter",
    },
    {
      property: "og:description",
      content:
        "ゲームマスターが撮影した写真からAIが特徴を抽出し、ハンターはその文章のヒントだけを頼りに同じ場所を見つけて写真を撮る。写真の一致率によってスコアが決まり、最も高いスコアを出したハンターが勝利するゲーム",
    },
    {
      property: "og:site_name",
      content: "Scene Hunter",
    },
    {
      property: "og:url",
      content: "https://scene-hunter.yashikota.com",
    },
    {
      property: "og:image",
      content: "https://scene-hunter.yashikota.com/logo.png",
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      property: "twitter:card",
      content: "summary",
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/room");
  }, [navigate]);

  return <Main />;
}
