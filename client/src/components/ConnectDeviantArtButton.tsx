import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ConnectDeviantArtButtonProps {
  groupId: string;
  onConnected: () => void;
  isConnected: boolean;
}

function ConnectDeviantArtButton({
  groupId,
  onConnected,
  isConnected,
}: ConnectDeviantArtButtonProps) {
  const initiateDeviantArtAuth = useCallback(() => {
    const deviantartAuthUrl = "https://www.deviantart.com/oauth2/authorize";
    const clientId = import.meta.env.VITE_TWO_CLIENT_ID;
    const redirectUri = `http://127.0.0.1:8787/api/v1/group/connect/deviantart/callback`;
    const responseType = "code";
    const scope = "user";
    const state = groupId;

    const authUrl = `${deviantartAuthUrl}?response_type=${responseType}&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=${encodeURIComponent(scope)}&state=${state}`;

    window.open(authUrl, "deviantartAuth", "width=600,height=800"); // Open in a popup
  }, [groupId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data === "deviantart_connected"
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
    return <span className="text-green-500">DeviantArt Connected</span>;
  }

  return (
    <Button onClick={initiateDeviantArtAuth} size="sm">
      Connect DeviantArt
    </Button>
  );
}

export default ConnectDeviantArtButton;
