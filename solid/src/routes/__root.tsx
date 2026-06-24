import {
  Outlet,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/solid-router";

let sessionCheckedAt = 0;
const SESSION_CHECK_TTL_MS = 30_000;

export const clearSessionGuardCache = () => {
  sessionCheckedAt = 0;
};

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

    if (Date.now() - sessionCheckedAt < SESSION_CHECK_TTL_MS) {
      if (path === "/") {
        throw redirect({ to: "/tabs/one", replace: true });
      }
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/auth/me`, {
        credentials: "include",
      });
      if (!response.ok) {
        accountRedirect();
      }
      sessionCheckedAt = Date.now();
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
