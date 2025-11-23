import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { heatmapStyles } from '../theme/style';

interface HeatmapProps {
    isVisible: boolean;
}

export const Heatmap: React.FC<HeatmapProps> = ({ isVisible }) => {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: isVisible ? 1 : 0,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, [isVisible]);

    return (
        <Animated.View
            pointerEvents="none" // allows map touches to pass through
            style={[heatmapStyles.overlay, { opacity }]}
        />
    );
};
