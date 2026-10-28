type TrackLike = {
  kind?: string;
  readyState?: string;
};

export function getSessionMediaPlaybackPlan(tracks: TrackLike[]) {
  const liveTracks = tracks.filter((track) => track.readyState !== 'ended');
  const hasLiveAudio = liveTracks.some((track) => track.kind === 'audio');
  const hasLiveVideo = liveTracks.some((track) => track.kind === 'video');

  return {
    hasLiveAudio,
    hasLiveVideo,
    needsWebAudioSink: hasLiveAudio,
  };
}
