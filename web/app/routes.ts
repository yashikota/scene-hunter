import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // ゲームホーム
  route("room", "./routes/gamehome.tsx"),

  // ルーム作成
  route("create", "./routes/makeroom.tsx"),

  // ルーム参加
  route("join", "./routes/joinroom.tsx"),

  // ルール説明
  route("how-to-play", "./routes/ruleexplain.tsx"),

  // ゲーム内のホーム
  route("gameroom", "./routes/gameroom.tsx"),

  //ラウンドの表示
  route("rounddisplay", "./routes/rounddisplay.tsx"),

  route("answercheck", "./routes/answercheck.tsx"), // 解答確認（マージしてない）
  route("interimresult1", "./routes/interimresult1.tsx"), // ラウンド1の中間発表
  route("interimresult2", "./routes/interimresult2.tsx"), // ラウンド2の中間発表
  route("finalresult", "./routes/finalresult.tsx"), // 最終結果発表
  route("roundmasterfirst", "./routes/roundmasterfirst.tsx"),
  route("roundmemberfirst", "./routes/roundmemberfirst.tsx"),
  route("roundmastersecond", "./routes/roundmastersecond.tsx"),
  route("roundmembersecond", "./routes/roundmembersecond.tsx"),
] satisfies RouteConfig;
