import { createFileRoute } from "@tanstack/react-router";
import { isLocale } from "../../shared/locales";
import { Landing, LandingIn } from "../screens/Landing";

export const Route = createFileRoute("/lp/$lang")({
  component: LpIn,
});

/** 対応していない言語の URL は、言語を決めない /lp と同じに出す。 */
function LpIn() {
  const { lang } = Route.useParams();
  return isLocale(lang) ? <LandingIn lang={lang} /> : <Landing />;
}
