import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { usePathname } from "expo-router"
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
          ai="center"
          jc="space-around"
        >
          <TabTrigger name="index" href="/" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}> {/* Added padding */}
              <TabBarIcon name="users" color={pathname === '/' ? theme.color.get() : theme.color10.get()} /> {/* Groups Icon */}
            </Button>
          </TabTrigger>
          <TabTrigger name="two" href="/two" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}> {/* Added padding */}
              <TabBarIcon name="shopping-cart" color={pathname === '/two' ? theme.color.get() : theme.color10.get()} /> {/* Marketplace Icon */}
            </Button>
          </TabTrigger>
          <TabTrigger name="three" href="/three" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}> {/* Added padding */}
              <TabBarIcon name="magic" color={pathname === '/three' ? theme.color.get() : theme.color10.get()} /> {/* Generate Icon */}
            </Button>
          </TabTrigger>
          <TabTrigger name="four" href="/four" asChild>
            <Button flex={1} ai="center" jc="center" bg="transparent" padding={2}> {/* Added padding */}
              <TabBarIcon name="bar-chart" color={pathname === '/four' ? theme.color.get() : theme.color10.get()} /> {/* Poll Icon */}
            </Button>
          </TabTrigger>
        </XStack>
      </TabList>
    </Tabs>
  );
}
