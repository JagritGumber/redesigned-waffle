import React, { useCallback, useEffect } from 'react';
import { Button, Text } from 'tamagui';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Linking } from 'react-native';

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
    const initiateDeviantArtAuth = useCallback(async () => {
        const backendAuthUrlEndpoint = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group/connect/deviantart/${groupId}`; // Replace with your backend URL
        try {
            const response = await fetch(backendAuthUrlEndpoint, { credentials: 'include' });
            const data = await response.json();
            if (response.ok && data.authUrl) {
                const redirectUri = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/v1/group/connect/deviantart/callback`;
                await WebBrowser.openAuthSessionAsync(data.authUrl, redirectUri);
                // The result of the auth session is handled by the useEffect hook listening for the deep link
                onConnected()
            } else {
                console.error('Failed to get DeviantArt auth URL:', data);
                // Handle error
            }
        } catch (error) {
            console.error('Error fetching DeviantArt auth URL:', error);
            // Handle error
        }
    }, [groupId]);

    useEffect(() => {
        const handleDeepLink = (event: { url: string | null }) => {
            if (event.url) {
                const url = new URL(event.url);
                if (url.host === 'deviantart' && url.pathname === '/callback') {
                    WebBrowser.dismissAuthSession();
                    if (url.searchParams.get('success') === 'true') {
                        console.log('DeviantArt connected via callback.');
                        onConnected();
                    } else if (url.searchParams.get('error')) {
                        console.error('DeviantArt connection error:', url.searchParams.get('error'));
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
        return <Text color="$color.green500">DeviantArt Connected</Text>;
    }

    return (
      
        <Button onPress={initiateDeviantArtAuth} size="sm">
            Connect DeviantArt
        </Button>
    );
}

export default ConnectDeviantArtButton;
