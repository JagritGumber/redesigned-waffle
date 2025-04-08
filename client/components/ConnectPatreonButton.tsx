import { useCallback } from "react";
import { Button, Text } from 'tamagui'; // Assuming direct import
import * as WebBrowser from 'expo-web-browser'; // Another option for web-based auth flows
import Constants from 'expo-constants';

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
    const initiatePatreonAuth = useCallback(async () => {
        const patreonAuthUrl = "https://www.patreon.com/oauth2/authorize";
        const clientId = Constants.expoConfig?.extra?.VITE_ONE_CLIENT_ID as string; // Example for Expo
        const redirectUri = "your-app-scheme://patreon/callback"; // Replace with your actual deep link or universal link
        const scope = "identity";
        const state = groupId;

        const authUrl = `${patreonAuthUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
        )}&scope=${encodeURIComponent(scope)}&state=${state}`;

        // Open the authorization URL in the browser
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (result?.type === 'success' && result?.params?.code) {
            // Handle the authorization code here (send to your backend)
            console.log('Patreon authorization code:', result.params.code);
            // After successful backend processing, you would typically update the state
            // and then call onConnected. For this simplified button, we'll just log.
            onConnected(); // You'll need to trigger this based on the backend flow
        } else {
            console.log('Patreon authorization failed or was cancelled.');
        }
    }, [groupId, onConnected]);

    if (isConnected) {
        return <Text color="$color.green500">Patreon Connected</Text>; // Using Tamagui's theme color
    }

    return (
        <Button onPress={initiatePatreonAuth} size="sm">
            Connect Patreon
        </Button>
    );
}

export default ConnectPatreonButton;