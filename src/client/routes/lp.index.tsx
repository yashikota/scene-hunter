import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "../screens/Landing";

export const Route = createFileRoute("/lp/")({
  component: Landing,
});
