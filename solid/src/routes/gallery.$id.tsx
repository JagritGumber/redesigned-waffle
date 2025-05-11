import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/gallery/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { postId } = Route.useParams();

  return <div>Hello "/gallery/$id"!</div>;
}
