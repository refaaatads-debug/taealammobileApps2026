type RemoteTrack = {
  id?: string;
  kind?: string;
  readyState?: string;
};

type TrackContainer = {
  getTracks?: () => RemoteTrack[];
};

function sameTrack(left: RemoteTrack | undefined, right: RemoteTrack | undefined): boolean {
  if (!left || !right) return false;
  return left === right || Boolean(left.id && right.id && String(left.id) === String(right.id));
}

/**
 * Merge a remote stream/track event while keeping the newest video track first.
 *
 * Android react-native-webrtc's RTCView renders only the first video track in
 * a MediaStream. A desktop teacher can add a screen-share video transceiver
 * beside the camera transceiver, so the newly-arrived track must be promoted
 * for RTCView to render the screen instead of continuing to render the camera.
 */
export function mergeRemoteSessionTracks(
  currentTracks: RemoteTrack[],
  incomingStream?: TrackContainer | null,
  incomingTrack?: RemoteTrack | null,
): RemoteTrack[] {
  const incomingTracks = [
    ...(incomingStream?.getTracks?.() ?? []),
    ...(incomingTrack ? [incomingTrack] : []),
  ].filter(Boolean);
  const nextTracks = [...currentTracks];

  for (const track of incomingTracks) {
    const existingIndex = nextTracks.findIndex((existing) => sameTrack(existing, track));
    if (existingIndex === -1) {
      nextTracks.push(track);
    } else if (nextTracks[existingIndex] !== track && nextTracks[existingIndex]?.readyState === 'ended') {
      // react-native-webrtc can wrap the same native track id again after a
      // stop/start cycle. Keep the fresh wrapper so the renderer can attach.
      nextTracks[existingIndex] = track;
    }
  }

  const preferredVideo = incomingTrack?.kind === 'video'
    ? nextTracks.find((track) => sameTrack(track, incomingTrack))
    : undefined;
  if (!preferredVideo) return nextTracks;

  const audioTracks = nextTracks.filter((track) => track.kind !== 'video');
  const videoTracks = nextTracks.filter((track) => track.kind === 'video' && !sameTrack(track, preferredVideo));
  return [...audioTracks, preferredVideo, ...videoTracks];
}

export function removeRemoteSessionTrack(
  currentTracks: RemoteTrack[],
  removedTrack: RemoteTrack,
): RemoteTrack[] {
  return currentTracks.filter((track) => !sameTrack(track, removedTrack));
}