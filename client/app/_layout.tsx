// _layout.tsx
import React, { useEffect } from 'react';
import { PortalProvider, TamaguiProvider } from 'tamagui';
import { SplashScreen, Stack } from 'expo-router';
import { useFonts } from 'expo-font';

import config from '../tamagui.config';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const queryClient = new QueryClient();

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <PortalProvider shouldAddRootHost>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            {/* Add this line to hide the header for the model details screen */}
            <Stack.Screen name="models/[id]" />
            <Stack.Screen name="gallery/[id]" />
            <Stack.Screen name="post/templates/[id]" />
            <Stack.Screen name="marketplace" />
          </Stack>
        </QueryClientProvider>
      </PortalProvider>
    </TamaguiProvider>
  );
}
