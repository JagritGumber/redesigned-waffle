import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { usePathname } from 'expo-router';
import { useTheme, View, Button, XStack } from 'tamagui'; // Import XStack
import { TabBarIcon } from '../../components/TabBarIcon'; // Assuming this is still used

export default function TabLayout() {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <XStack // Changed View to XStack
          bg={theme.background.get()} // backgroundColor
          h={60} // height
          btw={1} // borderTopWidth
          borderColor={theme.borderColor.get()} // borderColor
          px={'$2'}
          gap={'$2'}
          ai="center"
          jc="space-around">
          <TabTrigger name="index" href="/" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}>
              {' '}
              <TabBarIcon
                name="shopping-cart"
                color={pathname === '/' ? theme.color.get() : theme.color10.get()}
              />{' '}
            </Button>
          </TabTrigger>
          <TabTrigger name="three" href="/three" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}>
              {' '}
              <TabBarIcon
                name="magic"
                color={pathname === '/three' ? theme.color.get() : theme.color10.get()}
              />{' '}
            </Button>
          </TabTrigger>
          <TabTrigger name="four" href="/four" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}>
              {' '}
              <TabBarIcon
                name="image"
                color={pathname === '/four' ? theme.color.get() : theme.color10.get()}
              />{' '}
            </Button>
          </TabTrigger>
        </XStack>
      </TabList>
    </Tabs>
  );
}
