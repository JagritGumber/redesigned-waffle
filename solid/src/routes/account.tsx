import { createFileRoute } from "@tanstack/solid-router";
import { createSignal, onMount, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";

type AuthMode = "login" | "register";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
});

function AccountRoute() {
  const [mode, setMode] = createSignal<AuthMode>("login");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [name, setName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [currentUser, setCurrentUser] = createSignal<{ email: string; name?: string | null } | null>(
    null,
  );

  const loadSession = async () => {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/auth/me`, {
      credentials: "include",
    });
    if (!response.ok) {
      setCurrentUser(null);
      return;
    }
    const data = await response.json();
    setCurrentUser(data.user);
  };

  onMount(() => {
    void loadSession();
  });

  const submit = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/auth/${mode()}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email(),
          password: password(),
          ...(mode() === "register" ? { name: name() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Authentication failed.");
      }
      setCurrentUser(data.user);
      toast.success(mode() === "register" ? "Account created" : "Signed in");
    } catch (error: any) {
      toast.error(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setCurrentUser(null);
    toast.success("Signed out");
  };

  return (
    <main class="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <h1 class="text-2xl font-semibold">Account</h1>

      <Show when={currentUser()} fallback={
        <>
          <div class="flex gap-2">
            <Button
              class="flex-1"
              variant={mode() === "login" ? "default" : "outline"}
              onClick={() => setMode("login")}
            >
              Sign in
            </Button>
            <Button
              class="flex-1"
              variant={mode() === "register" ? "default" : "outline"}
              onClick={() => setMode("register")}
            >
              Register
            </Button>
          </div>

          <Show when={mode() === "register"}>
            <TextField>
              <TextFieldLabel>Name</TextFieldLabel>
              <TextFieldInput value={name()} onInput={(event) => setName(event.currentTarget.value)} />
            </TextField>
          </Show>

          <TextField>
            <TextFieldLabel>Email</TextFieldLabel>
            <TextFieldInput
              type="email"
              value={email()}
              onInput={(event) => setEmail(event.currentTarget.value)}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Password</TextFieldLabel>
            <TextFieldInput
              type="password"
              value={password()}
              onInput={(event) => setPassword(event.currentTarget.value)}
            />
          </TextField>

          <Button onClick={submit} disabled={loading()}>
            {loading() ? "Working..." : mode() === "login" ? "Sign in" : "Create account"}
          </Button>
        </>
      }>
        {(user) => (
          <section class="rounded border border-border bg-card p-4">
            <p class="font-medium">{user().name || user().email}</p>
            <p class="text-sm text-muted-foreground">{user().email}</p>
            <Button class="mt-4" variant="outline" onClick={logout}>
              Sign out
            </Button>
          </section>
        )}
      </Show>
    </main>
  );
}
