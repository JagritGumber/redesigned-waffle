import {
  Outlet,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/solid-router";

export const Route = createRootRouteWithContext()({
  loader: (ctx) => {
    if (ctx.location.pathname === "/") {
      throw redirect({ to: "/tabs/one", replace: true });
    }
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
    </>
  );
}
