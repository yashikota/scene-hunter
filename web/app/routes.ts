import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("roundmasterfirst", "./routes/roundmasterfirst.tsx"),
    route("roundmemberfirst", "./routes/roundmemberfirst.tsx"),
] satisfies RouteConfig;
