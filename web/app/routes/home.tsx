import { useEffect } from "react";
import { useNavigate } from "react-router"; // React Router v7
import type { Route } from "./+types/home";
import { Main } from "./main";

export function meta() {
  return [
    { title: "New React Router App" },
    { name: "description", content: "Welcome to React Router!" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.cloudflare.env.VALUE_FROM_CLOUDFLARE };
}

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/room");
  }, [navigate]);

  return <Main />; // 画面は即座に切り替わるので、実際には表示されない
}
//export default function Home() {
  //return <Main />;
//}
