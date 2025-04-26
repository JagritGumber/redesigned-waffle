import { View, XStack } from 'tamagui';
import { Dimensions } from 'react-native';
import CreateNewPollButton from '~/components/Polls/CreateNewPollButton';

const width = Dimensions.get('window').width;

export default function PollPost() {
  return (
    <View bg={'$background'} flex={1}>
      <XStack flexWrap={width > 700 ? 'wrap' : 'nowrap'}>
        <CreateNewPollButton />
      </XStack>
    </View>
  );
}
