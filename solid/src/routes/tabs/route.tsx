import { createFileRoute, Link, Outlet } from "@tanstack/solid-router";
import { Image, MagicWand, StackSimple, Sparkle } from "phosphor-solid";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/tabs")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <div class="mb-16">
        <Outlet />
      </div>
      <footer class="flex fixed w-full bottom-0 justify-between gap-2 p-2 bg-background">
        <Link to="/tabs/one" class="w-full" replace>
          <Button class="w-full" variant={"outline"}>
            <StackSimple weight="bold" />
          </Button>
        </Link>
        <Link to="/tabs/two" class="w-full" replace>
          <Button class="w-full" variant={"outline"}>
            <MagicWand weight="bold" />
          </Button>
        </Link>
        <Link to="/tabs/three" class="w-full" replace>
          <Button class="w-full" variant={"outline"}>
            <Image weight="bold" />
          </Button>
        </Link>
        <Link to="/tabs/flow" class="w-full" replace>
          <Button class="w-full" variant={"outline"}>
            <Sparkle weight="bold" />
          </Button>
        </Link>
      </footer>
    </>
  );
}
