export type AgoraConnectionEvent =
  | 'joined-channel'
  | 'remote-joined'
  | 'remote-audio-starting'
  | 'remote-audio-playing'
  | 'remote-audio-interrupted'
  | 'remote-left'
  | 'error';
export type AgoraPeerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';

export function mapAgoraConnectionEvent(event: AgoraConnectionEvent): AgoraPeerConnectionState {
  switch (event) {
    case 'joined-channel':
      // Joining the local channel does not prove that the other participant is present.
      return 'connecting';
    case 'remote-joined':
      // Presence comes from the join event. A muted teacher publishes no audio but is present.
      return 'connected';
    case 'remote-audio-starting':
    case 'remote-audio-playing':
      return 'connected';
    case 'remote-left':
      return 'disconnected';
    case 'remote-audio-interrupted':
      // Stopped/Frozen audio (mute, weak network) is not a disconnect. Presence is join/leave only.
      return 'connected';
    case 'error':
      return 'failed';
  }
}

// After our own link (re)connects, keep 'connected' if the other participant is still present.
export function stateAfterOwnLinkConnected(remotePresent: boolean): AgoraPeerConnectionState {
  return remotePresent ? 'connected' : mapAgoraConnectionEvent('joined-channel');
}
