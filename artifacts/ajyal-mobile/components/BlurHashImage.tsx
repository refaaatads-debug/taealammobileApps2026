import { Image as ExpoImage } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

const AJYAL_LOADING_BLURHASH = "LA5*EVY~Myfnm{kCWBa#RPayofj[";

type BlurHashImageProps = {
  uri: string;
  style: StyleProp<ImageStyle>;
  contentFit?: "cover" | "contain";
  blurhash?: string;
};

export function BlurHashImage({
  uri,
  style,
  contentFit = "cover",
  blurhash = AJYAL_LOADING_BLURHASH,
}: BlurHashImageProps) {
  return (
    <ExpoImage
      source={{ uri }}
      placeholder={blurhash}
      contentFit={contentFit}
      placeholderContentFit={contentFit}
      transition={180}
      style={style}
    />
  );
}