import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/answercheck.tsx"),
  route("interimresult1", "./routes/interimresult1.tsx"), // ラウンド1の中間発表
  // route("answercheck", "./routes/answercheck.tsx"), // 解答確認（マージしてない）
  route("interimresult2", "./routes/interimresult2.tsx"), // ラウンド2の中間発表
  route("finalresult", "./routes/finalresult.tsx"), // 最終結果発表
  route("roundmasterfirst", "./routes/roundmasterfirst.tsx"),
  route("roundmemberfirst", "./routes/roundmemberfirst.tsx"),
] satisfies RouteConfig;
