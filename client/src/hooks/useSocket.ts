import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// IMPORTANTE: Su mobile (Android/iOS) 'localhost' non funziona.
// Devi usare l'indirizzo IP locale del tuo computer (es: 'http://192.168.1.10:5000')
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return socket;
};
