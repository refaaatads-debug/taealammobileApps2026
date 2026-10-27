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
    case 'remote-audio-starting':
      // A remote user can join before the SDK has received and started playing audio.
      return 'connecting';
    case 'remote-audio-playing':
      return 'connected';
    case 'remote-left':
    case 'remote-audio-interrupted':
      return 'disconnected';
    case 'error':
      return 'failed';
  }
}
