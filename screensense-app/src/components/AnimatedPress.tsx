import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

interface Props extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** How far to scale down on press (default 0.95) */
  scale?: number;
}

/**
 * Wraps any content in a smooth spring press-scale animation.
 * Drop-in replacement for TouchableOpacity on any tappable element.
 */
export function AnimatedPress({ children, style, scale = 0.95, ...props }: Props) {
  const anim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(anim, { toValue: scale, useNativeDriver: true, tension: 400, friction: 12 }).start();

  const onPressOut = () =>
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }).start();

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} {...props}>
      <Animated.View style={[style, { transform: [{ scale: anim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
