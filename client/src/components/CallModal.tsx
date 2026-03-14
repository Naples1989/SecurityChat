import React, { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface CallModalProps {
  socket: Socket;
  user: any;
  recipient: any;
  type: 'voice' | 'video';
  incomingSignal?: any;
  onClose: () => void;
}

const CallModal: React.FC<CallModalProps> = ({ socket, user, recipient, type, incomingSignal, onClose }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'voice');
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Peer.Instance | null>(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }

        if (incomingSignal) {
          answerCall(currentStream);
        } else {
          callUser(currentStream);
        }
      });

    socket.on('call_accepted', (signal) => {
      setCallAccepted(true);
      connectionRef.current?.signal(signal);
    });

    socket.on('call_ended', () => {
      endCall();
    });

    return () => {
      socket.off('call_accepted');
      socket.off('call_ended');
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const callUser = (currentStream: MediaStream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: currentStream,
    });

    peer.on('signal', (data) => {
      socket.emit('call_user', {
        userToCall: recipient.id,
        signalData: data,
        from: user.id,
        name: user.name,
        type: type,
      });
    });

    peer.on('stream', (currentRemoteStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentRemoteStream;
      }
    });

    connectionRef.current = peer;
  };

  const answerCall = (currentStream: MediaStream) => {
    setCallAccepted(true);
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: currentStream,
    });

    peer.on('signal', (data) => {
      socket.emit('answer_call', { signal: data, to: recipient.id });
    });

    peer.on('stream', (currentRemoteStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = currentRemoteStream;
      }
    });

    peer.signal(incomingSignal);
    connectionRef.current = peer;
  };

  const endCall = () => {
    socket.emit('end_call', { to: recipient.id });
    stream?.getTracks().forEach(track => track.stop());
    onClose();
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream && type === 'video') {
      stream.getVideoTracks()[0].enabled = isVideoOff;
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col aspect-video">
        
        {/* Video Streams */}
        <div className="flex-1 relative bg-slate-800">
          {/* Remote Video */}
          <video
            playsInline
            ref={userVideo}
            autoPlay
            className="w-full h-full object-cover"
          />
          
          {/* Local Video (Picture-in-Picture) */}
          <div className="absolute bottom-4 right-4 w-1/4 aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700 shadow-lg">
            <video
              playsInline
              muted
              ref={myVideo}
              autoPlay
              className="w-full h-full object-cover"
            />
          </div>

          {/* Recipient Info (Overlay) */}
          {!callAccepted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-900/50">
              <div className="w-24 h-24 rounded-full bg-telegram-blue flex items-center justify-center text-3xl font-bold mb-4 animate-pulse">
                {recipient.name.charAt(0)}
              </div>
              <h2 className="text-xl font-bold">{recipient.name}</h2>
              <p className="text-slate-300 mt-2">Chiamata in corso...</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-6 flex items-center justify-center gap-6 bg-slate-900">
          <button
            onClick={toggleMute}
            className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
          >
            {isMuted ? <MicOff /> : <Mic />}
          </button>

          {type === 'video' && (
            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full transition-colors ${isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
            >
              {isVideoOff ? <VideoOff /> : <Video />}
            </button>
          )}

          <button
            onClick={endCall}
            className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            <PhoneOff />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallModal;
