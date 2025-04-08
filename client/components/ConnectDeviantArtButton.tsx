import React, { useCallback } from "react";
import { Linking } from 'react-native';
import { Button, Text } from 'tamagui';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

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
        const deviantartAuthUrl = "https://www.deviantart.com/oauth2/authorize";
        const clientId = Constants.expoConfig?.extra?.VITE_TWO_CLIENT_ID as string; // Example for Expo
        const redirectUri = "your-app-scheme://deviantart/callback"; // Replace with your actual deep link
        const responseType = "code";
        const scope = "user";
        const state = groupId;

        const authUrl = `${deviantartAuthUrl}?response_type=${responseType}&client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
        )}&scope=${encodeURIComponent(scope)}&state=${state}`;

        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

        if (result?.type === 'success' && result?.params?.code) {
            console.log('DeviantArt authorization code:', result.params.code);
            onConnected(); // Trigger onConnected after backend processes the code
        } else {
            console.log('DeviantArt authorization failed or was cancelled.');
        }
    }, [groupId, onConnected]);

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