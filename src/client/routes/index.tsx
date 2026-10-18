import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Top } from "../screens/Top";

export const Route = createFileRoute("/")({
  component: TopRoute,
});

function TopRoute() {
  const navigate = useNavigate();
  return <Top onEntered={(c) => void navigate({ to: "/r/$code", params: { code: c } })} />;
}
