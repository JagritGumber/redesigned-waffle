import {
  Outlet,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/solid-router";

export const Route = createRootRouteWithContext()({
  loader: async (ctx) => {
    const path = ctx.location.pathname;
    if (path === "/account") {
      return;
    }

    const accountRedirect = () => {
      throw redirect({ to: "/account", replace: true });
    };

    if (!import.meta.env.VITE_BACKEND_URL) {
      accountRedirect();
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/auth/me`, {
        credentials: "include",
      });
      if (!response.ok) {
        accountRedirect();
      }
    } catch {
      accountRedirect();
    }

    if (path === "/") {
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
