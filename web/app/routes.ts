import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/finalresult.tsx"),
    route("roundmasterfirst", "./routes/roundmasterfirst.tsx"),
    route("roundmemberfirst", "./routes/roundmemberfirst.tsx"),
    route("roundmastersecond", "./routes/roundmastersecond.tsx"),
    route("roundmembersecond", "./routes/roundmembersecond.tsx"),
] satisfies RouteConfig;
