import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ConnectPatreonButtonProps {
  groupId: string;
  onConnected: () => void;
  isConnected: boolean;
}

function ConnectPatreonButton({
  groupId,
  onConnected,
  isConnected,
}: ConnectPatreonButtonProps) {
  const initiatePatreonAuth = useCallback(() => {
    const patreonAuthUrl = "https://www.patreon.com/oauth2/authorize";
    const clientId = import.meta.env.VITE_ONE_CLIENT_ID;
    const redirectUri = `http://127.0.0.1:8787/api/v1/group/connect/patreon/callback`;
    const scope = "identity";
    const state = groupId;

    const authUrl = `${patreonAuthUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scope)}&state=${state}`;

    window.open(authUrl, "patreonAuth", "width=600,height=800"); // Open in a popup
  }, [groupId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data === "patreon_connected"
      ) {
        onConnected(); // Notify parent to refresh
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [onConnected]);

  if (isConnected) {
    return <span className="text-green-500">Patreon Connected</span>;
  }

  return (
    <Button onClick={initiatePatreonAuth} size="sm">
      Connect Patreon
    </Button>
  );
}

export default ConnectPatreonButton;
