import React from 'react';
import { Image, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type OperatorAvatarProps = {
  uri: string;
  initial: string;
  size: number;
  backgroundColor: string;
  color: string;
  fontSize: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export const OperatorAvatar: React.FC<OperatorAvatarProps> = ({
  uri,
  initial,
  size,
  backgroundColor,
  color,
  fontSize,
  style,
  textStyle,
  testID,
}) => (
  <View
    style={[
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      },
      style,
    ]}
  >
    {uri ? (
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        resizeMode="cover"
        accessibilityLabel="Profile picture"
        testID={testID}
      />
    ) : (
      <Text style={[{ color, fontSize, fontWeight: '800' }, textStyle]}>{initial}</Text>
    )}
  </View>
);
