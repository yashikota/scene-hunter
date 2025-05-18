import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";

import { createContext, useState } from "react";
import type { Route } from "./+types/root";
import "./app.css";

// 認証画面の表示状態を管理するコンテキスト
export const AuthVisibilityContext = createContext({
  showAuth: false,
  setShowAuth: (show: boolean) => {},
});

export const meta = () => {
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
};

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <AuthVisibilityContext.Provider value={{ showAuth, setShowAuth }}>
      <Outlet />
    </AuthVisibilityContext.Provider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
