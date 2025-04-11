import React, { useCallback, useEffect } from 'react';
import { Button, Text } from 'tamagui';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

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
        const backendAuthUrlEndpoint = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group/connect/patreon/${groupId}`; // Replace with your backend URL
        try {
            const response = await fetch(backendAuthUrlEndpoint);
            const data = await response.json();
            if (response.ok && data.authUrl) {
                const redirectUri = `${Constants.expoConfig?.scheme}://patreon/callback`;
                await WebBrowser.openAuthSessionAsync(data.authUrl, redirectUri);
                onConnected()
            } else {
                console.error('Failed to get Patreon auth URL:', data);
                // Handle error
            }
        } catch (error) {
            console.error('Error fetching Patreon auth URL:', error);
            // Handle error
        }
    }, [groupId]);

    useEffect(() => {
        const handleDeepLink = (event: { url: string | null }) => {
            if (event.url) {
                const url = new URL(event.url);
                if (url.host === 'patreon' && url.pathname === '/callback') {
                    WebBrowser.dismissAuthSession();
                    if (url.searchParams.get('success') === 'true') {
                        console.log('Patreon connected via callback.');
                        onConnected();
                    } else if (url.searchParams.get('error')) {
                        console.error('Patreon connection error:', url.searchParams.get('error'));
                        // Handle the error (e.g., show an error message)
                    }
                }
            }
        };

        const subscription = Linking.addEventListener('url', handleDeepLink);

        // Check for initial URL in case the app was opened via the deep link
        Linking.getInitialURL().then((url) => {
            if (url) {
                handleDeepLink({ url });
            }
        });

        return () => {
            subscription.remove();
        };
    }, [onConnected]);

    if (isConnected) {
        return <Text className="text-green-500">Patreon Connected</Text>;
    }

    return (
        <Button onPress={initiatePatreonAuth} size={"sm"}>
            Connect Patreon
        </Button>
    );
}

export default ConnectPatreonButton;