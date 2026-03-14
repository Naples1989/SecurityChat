import React, { useState, useEffect, useRef } from 'react';
import { Search, Menu, Send, Paperclip, Smile, MoreVertical, LogOut, UserPlus, X, ArrowLeft, Clock, ShieldCheck, Check, CheckCheck, Users, Lock, Shield, Phone, Video as VideoIcon, PhoneOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { usePushNotifications } from '../hooks/usePushNotifications';
import api from '../api/axios';
import { encryptMessage, decryptMessage } from '../utils/crypto';
import CallModal from '../components/CallModal';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { Capacitor } from '@capacitor/core';

interface Message {
  id: string;
  text: string;
  isEncrypted?: boolean;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'FILE';
  senderId: string;
  chatId: string;
  createdAt: string;
  isRead: boolean;
  expiresAt?: string;
  sender: {
    name: string;
    avatarUrl?: string;
  };
}

interface Chat {
  id: string;
  type: 'PRIVATE' | 'GROUP' | 'CHANNEL' | 'SECRET';
  name?: string;
  members: any[];
  messages: Message[];
}

interface UserSearchResult {
  id: string;
  name: string;
  username?: string;
  phone: string;
  avatarUrl?: string;
}

const ChatPage = () => {
  const { user, logout, getPrivateKey } = useAuth();
  const socket = useSocket();
  usePushNotifications(user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingSecretChat, setIsCreatingSecretChat] = useState(false);
  const [isSettingPasscode, setIsCreatingPasscode] = useState(false);
  const [isSettingPrivacy, setIsSettingPrivacy] = useState(false);
  const [isSetting2FA, setIsSetting2FA] = useState(false);
  const [new2FAPassword, setNew2FAPassword] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [selfDestructTimer, setSelfDestructTimer] = useState<number | null>(null); // seconds
  const [activeCall, setActiveCall] = useState<{ type: 'voice' | 'video', recipient: any, incomingSignal?: any } | null>(null);
  const [showIncomingCall, setShowIncomingCall] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [selectedUsersForGroup, setSelectedUsersForGroup] = useState<UserSearchResult[]>([]);
  const [groupName, setGroupName] = useState('');
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: string }>({}); // chatId -> userName
  const [mobileView, setMobileView] = useState<'chats' | 'chat'>('chats');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    const togglePrivacyScreen = async () => {
      if (Capacitor.isNativePlatform()) {
        const shouldEnable = !user?.allowScreenshots || selectedChat?.type === 'SECRET';
        if (shouldEnable) {
          await PrivacyScreen.enable();
        } else {
          await PrivacyScreen.disable();
        }
      }
    };
    togglePrivacyScreen();
  }, [user?.allowScreenshots, selectedChat]);

  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    try {
      const response = await api.get('/chat');
      setChats(response.data);
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  };

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
      
      if (socket) {
        socket.emit('join_chat', selectedChat.id);
      }
    }
  }, [selectedChat, socket]);

  const fetchMessages = async (chatId: string) => {
    try {
      const response = await api.get(`/chat/${chatId}/messages`);
      const fetchedMessages = response.data;
      
      // Mark messages as read on the server
      await api.post(`/chat/${chatId}/read`);
      
      // Decrypt messages if they are from a secret chat
      const chat = chats.find(c => c.id === chatId) || selectedChat;
      if (chat?.type === 'SECRET') {
        const privateKey = getPrivateKey();
        if (privateKey) {
          const decrypted = await Promise.all(fetchedMessages.map(async (msg: Message) => {
            if (msg.text && msg.isEncrypted) {
              try {
                return { ...msg, text: await decryptMessage(msg.text, privateKey) };
              } catch (e) {
                return { ...msg, text: '[Errore Decrittografia]' };
              }
            }
            return msg;
          }));
          setMessages(decrypted);
          return;
        }
      }
      setMessages(fetchedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  useEffect(() => {
    if (socket) {
      socket.on('receive_message', async (newMessage: Message) => {
        let processedMessage = newMessage;
        
        // Decrypt if it's a secret chat
        const chat = chats.find(c => c.id === newMessage.chatId) || selectedChat;
        if (chat?.type === 'SECRET' && newMessage.text && newMessage.isEncrypted) {
          const privateKey = getPrivateKey();
          if (privateKey) {
            try {
              processedMessage = { ...newMessage, text: await decryptMessage(newMessage.text, privateKey) };
            } catch (e) {
              processedMessage = { ...newMessage, text: '[Errore Decrittografia]' };
            }
          }
        }

        if (selectedChat && newMessage.chatId === selectedChat.id) {
          setMessages((prev) => [...prev, processedMessage]);
        }
        
        // Update last message in chat list
        setChats((prevChats) => 
          prevChats.map((c) => 
            c.id === newMessage.chatId 
              ? { ...c, messages: [processedMessage] }
              : c
          )
        );
      });

      socket.on('messages_deleted', () => {
        if (selectedChat) {
          fetchMessages(selectedChat.id);
        }
        fetchChats();
      });

      socket.on('user_typing', ({ chatId, userName }) => {
        setTypingUsers(prev => ({ ...prev, [chatId]: userName }));
      });

      socket.on('user_stop_typing', ({ chatId }) => {
        setTypingUsers(prev => {
          const newState = { ...prev };
          delete newState[chatId];
          return newState;
        });
      });

      socket.on('incoming_call', (data) => {
        const { signal, from, name, type } = data;
        setActiveCall({ type, recipient: { id: from, name }, incomingSignal: signal });
        setShowIncomingCall(true);
      });
    }

    return () => {
      if (socket) {
        socket.off('receive_message');
        socket.off('messages_deleted');
        socket.off('user_typing');
        socket.off('user_stop_typing');
        socket.off('incoming_call');
      }
    };
  }, [socket, selectedChat]);

  const startCall = (type: 'voice' | 'video') => {
    if (!selectedChat || selectedChat.type !== 'PRIVATE') return;
    const otherMember = selectedChat.members.find(m => m.userId !== user?.id);
    if (!otherMember) return;

    setActiveCall({ type, recipient: { id: otherMember.userId, name: otherMember.user.name } });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    
    if (!socket || !selectedChat || !user) return;

    // Send typing event
    socket.emit('typing', { chatId: selectedChat.id, userName: user.name });

    // Clear existing timeout
    if (typingTimeoutRef.current[selectedChat.id]) {
      clearTimeout(typingTimeoutRef.current[selectedChat.id]);
    }

    // Set timeout to stop typing after 3 seconds of inactivity
    typingTimeoutRef.current[selectedChat.id] = setTimeout(() => {
      socket.emit('stop_typing', { chatId: selectedChat.id });
    }, 3000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Search logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const response = await api.get(`/user/search?query=${searchQuery}`);
          setSearchResults(response.data);
        } catch (error) {
          console.error('Search error:', error);
        }
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedChat || !socket || !user) return;

    let textToSend = message;
    let isEncrypted = false;

    if (selectedChat.type === 'SECRET') {
      const otherMember = selectedChat.members.find(m => m.userId !== user.id);
      if (otherMember?.user.publicKey) {
        textToSend = await encryptMessage(message, otherMember.user.publicKey);
        isEncrypted = true;
      }
    }

    const messageData = {
      chatId: selectedChat.id,
      senderId: user.id,
      text: textToSend,
      isEncrypted,
      selfDestructTimer: selfDestructTimer,
    };

    socket.emit('send_message', messageData);
    setMessage('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat || !socket || !user) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const response = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { url, type } = response.data;
      const messageData = {
        chatId: selectedChat.id,
        senderId: user.id,
        mediaUrl: url,
        mediaType: type,
        text: '', // Empty text for media-only messages
        selfDestructTimer: selfDestructTimer,
      };

      socket.emit('send_message', messageData);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartChat = async (targetUserId: string) => {
    try {
      const response = await api.post('/chat', { contactId: targetUserId });
      const newChat = response.data;
      if (!chats.find(c => c.id === newChat.id)) {
        setChats(prev => [newChat, ...prev]);
      }
      setSelectedChat(newChat);
      setSearchQuery('');
    } catch (error) {
      console.error('Error starting chat:', error);
    }
  };

  const handleStartSecretChat = async (targetUserId: string) => {
    try {
      const response = await api.post('/chat', { type: 'SECRET', contactId: targetUserId });
      const newChat = response.data;
      if (!chats.find(c => c.id === newChat.id)) {
        setChats(prev => [newChat, ...prev]);
      }
      setSelectedChat(newChat);
      setIsCreatingSecretChat(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Error starting secret chat:', error);
    }
  };

  const getChatName = (chat: Chat) => {
    if (chat.type === 'PRIVATE' || chat.type === 'SECRET') {
      const otherMember = chat.members.find((m: any) => m.userId !== user?.id);
      return otherMember?.user.name || 'Sconosciuto';
    }
    return chat.name || 'Gruppo';
  };

  const getOtherMember = (chat: Chat) => {
    return chat.members.find((m: any) => m.userId !== user?.id)?.user;
  };

  const getStatusText = (chat: Chat) => {
    const otherUser = getOtherMember(chat);
    if (!otherUser) return '';

    if (typingUsers[chat.id]) {
      return 'sta scrivendo...';
    }

    if (otherUser.showOnlineStatus) {
      return 'online';
    }

    if (otherUser.showLastSeen && otherUser.lastSeen) {
      const date = new Date(otherUser.lastSeen);
      return `ultimo accesso ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    return 'di recente';
  };

  const handleChatSelect = (chat: Chat) => {
    setSelectedChat(chat);
    setMobileView('chat');
  };

  const handleBackToChats = () => {
    setMobileView('chats');
  };

  const handleStartGroup = async () => {
    if (!groupName.trim() || selectedUsersForGroup.length === 0) return;
    
    try {
      const response = await api.post('/chat', { 
        type: 'GROUP', 
        name: groupName, 
        memberIds: selectedUsersForGroup.map(u => u.id) 
      });
      const newChat = response.data;
      setChats(prev => [newChat, ...prev]);
      setSelectedChat(newChat);
      setIsCreatingGroup(false);
      setGroupName('');
      setSelectedUsersForGroup([]);
    } catch (error) {
      console.error('Error creating group:', error);
    }
  };

  const toggleUserForGroup = (u: UserSearchResult) => {
    setSelectedUsersForGroup(prev => 
      prev.find(user => user.id === u.id)
        ? prev.filter(user => user.id !== u.id)
        : [...prev, u]
    );
  };

  const handleSetPasscode = () => {
    if (newPasscode.length === 4) {
      localStorage.setItem('app_passcode', newPasscode);
      setIsCreatingPasscode(false);
      setNewPasscode('');
      alert('Codice di blocco impostato con successo!');
    }
  };

  const handleUpdatePrivacy = async (settings: any) => {
    try {
      await api.post('/user/privacy', settings);
      alert('Impostazioni aggiornate!');
      // In a real app, we would update the user context
    } catch (error) {
      console.error('Error updating privacy:', error);
    }
  };

  return (
    <div className="flex h-screen bg-white text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className={`w-full md:w-80 border-r border-slate-200 flex flex-col bg-telegram-sidebar ${
        mobileView === 'chat' && selectedChat ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Sidebar Header */}
        <div className="p-4 flex items-center gap-4">
          <div className="relative">
            <Menu 
              className="text-slate-500 cursor-pointer" 
              onClick={() => setShowMenu(!showMenu)} 
            />
            {showMenu && (
              <div className="absolute top-10 left-0 w-56 bg-white shadow-lg rounded-lg border border-slate-200 py-2 z-50">
                <button 
                  onClick={() => {
                    setIsCreatingSecretChat(true);
                    setShowMenu(false);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 text-sm"
                >
                  <Lock className="w-4 h-4 text-green-500" />
                  Nuova Chat Segreta
                </button>
                <button 
                  onClick={() => {
                    setIsCreatingGroup(true);
                    setShowMenu(false);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 text-sm"
                >
                  <Users className="w-4 h-4 text-telegram-blue" />
                  Nuovo Gruppo
                </button>
                <div className="h-[1px] bg-slate-100 my-1"></div>
                <button 
                  onClick={() => {
                    setIsSettingPrivacy(true);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 text-sm"
                >
                  <ShieldCheck className="w-4 h-4 text-telegram-blue" />
                  Privacy e Sicurezza
                </button>
                <button 
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 text-red-500 text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  Esci
                </button>
              </div>
            )}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca utenti..." 
              className="w-full bg-white border border-transparent focus:border-telegram-blue rounded-full py-1.5 pl-10 pr-10 text-sm outline-none transition-all"
            />
            {searchQuery && (
              <X 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 cursor-pointer" 
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>
        </div>

        {/* Search Results, Group Creation, Passcode, Privacy, 2FA or Chat List */}
        <div className="flex-1 overflow-y-auto">
          {isSetting2FA ? (
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-4">
                <ArrowLeft className="cursor-pointer" onClick={() => setIsSetting2FA(false)} />
                <h2 className="font-bold">Verifica in due passaggi</h2>
              </div>
              <ShieldCheck className="w-16 h-16 mx-auto text-telegram-blue mb-2" />
              <p className="text-sm text-slate-500 text-center">
                Crea una password aggiuntiva che ti verrà chiesta quando accedi su un nuovo dispositivo.
              </p>
              <input 
                type="password" 
                placeholder="Nuova password 2FA" 
                value={new2FAPassword}
                onChange={(e) => setNew2FAPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 outline-none focus:border-telegram-blue"
              />
              <button 
                onClick={async () => {
                  await handleUpdatePrivacy({ twoFactorPassword: new2FAPassword, twoFactorEnabled: true });
                  setIsSetting2FA(false);
                  setNew2FAPassword('');
                }}
                disabled={!new2FAPassword}
                className="bg-telegram-blue text-white py-2 rounded-xl font-semibold disabled:opacity-50 hover:bg-telegram-darkBlue transition-colors mt-4"
              >
                IMPOSTA PASSWORD
              </button>
              {user?.twoFactorEnabled && (
                <button 
                  onClick={async () => {
                    await handleUpdatePrivacy({ twoFactorEnabled: false });
                    setIsSetting2FA(false);
                  }}
                  className="text-red-500 text-sm mt-2 hover:underline"
                >
                  Disattiva verifica in due passaggi
                </button>
              )}
            </div>
          ) : isSettingPrivacy ? (
            <div className="p-4 flex flex-col gap-6">
              <div className="flex items-center gap-2 mb-2">
                <ArrowLeft className="cursor-pointer" onClick={() => setIsSettingPrivacy(false)} />
                <h2 className="font-bold">Privacy e Sicurezza</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Stato Online</span>
                    <input 
                      type="checkbox" 
                      defaultChecked={user?.showOnlineStatus}
                      onChange={(e) => handleUpdatePrivacy({ showOnlineStatus: e.target.checked })}
                      className="rounded-full text-telegram-blue focus:ring-telegram-blue"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Se disattivato, gli altri non vedranno quando sei online.</p>
                </div>

                <div className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Ultimo Accesso</span>
                    <input 
                      type="checkbox" 
                      defaultChecked={user?.showLastSeen}
                      onChange={(e) => handleUpdatePrivacy({ showLastSeen: e.target.checked })}
                      className="rounded-full text-telegram-blue focus:ring-telegram-blue"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Se disattivato, gli altri non vedranno l'ora del tuo ultimo accesso.</p>
                </div>

                <div className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Consenti Screenshot</span>
                    <input 
                      type="checkbox" 
                      defaultChecked={user?.allowScreenshots}
                      onChange={(e) => handleUpdatePrivacy({ allowScreenshots: e.target.checked })}
                      className="rounded-full text-telegram-blue focus:ring-telegram-blue"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Se disattivato, non sarà possibile fare screenshot dell'app (solo su Android/iOS).</p>
                </div>

                <div 
                  className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:bg-slate-50"
                  onClick={() => {
                    setIsSettingPrivacy(false);
                    setIsCreatingPasscode(true);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-telegram-blue" />
                    <span className="text-sm font-medium">Codice di Blocco</span>
                  </div>
                  <span className="text-xs text-slate-400">{localStorage.getItem('app_passcode') ? 'Attivo' : 'Disattivato'}</span>
                </div>

                <div 
                  className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm cursor-pointer hover:bg-slate-50"
                  onClick={() => {
                    setIsSettingPrivacy(false);
                    setIsSetting2FA(true);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-telegram-blue" />
                    <span className="text-sm font-medium">Verifica in due passaggi</span>
                  </div>
                  <span className="text-xs text-slate-400">{user?.twoFactorEnabled ? 'Attiva' : 'Disattivata'}</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-100">
                <h3 className="text-sm font-bold text-red-600 mb-1">Elimina il mio account se inattivo per</h3>
                <select 
                  defaultValue={user?.accountSelfDestructMonths || 6}
                  onChange={(e) => handleUpdatePrivacy({ accountSelfDestructMonths: parseInt(e.target.value) })}
                  className="w-full bg-transparent text-sm text-red-500 outline-none"
                >
                  <option value={1}>1 mese</option>
                  <option value={3}>3 mesi</option>
                  <option value={6}>6 mesi</option>
                  <option value={12}>1 anno</option>
                </select>
              </div>
            </div>
          ) : isSettingPasscode ? (
            <div className="p-4 flex flex-col gap-4 text-center">
              <div className="flex items-center gap-2 mb-4">
                <ArrowLeft className="cursor-pointer" onClick={() => setIsCreatingPasscode(false)} />
                <h2 className="font-bold">Codice di Blocco</h2>
              </div>
              <Shield className="w-16 h-16 mx-auto text-telegram-blue mb-2" />
              <p className="text-sm text-slate-500">Imposta un codice a 4 cifre per proteggere l'accesso all'app.</p>
              <input 
                type="password" 
                maxLength={4}
                placeholder="****" 
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white border border-slate-200 rounded-xl py-3 text-center text-2xl tracking-[1em] outline-none focus:border-telegram-blue"
              />
              <button 
                onClick={handleSetPasscode}
                disabled={newPasscode.length !== 4}
                className="bg-telegram-blue text-white py-2 rounded-xl font-semibold disabled:opacity-50 hover:bg-telegram-darkBlue transition-colors mt-4"
              >
                SALVA CODICE
              </button>
              <button 
                onClick={() => {
                  localStorage.removeItem('app_passcode');
                  setIsCreatingPasscode(false);
                  setNewPasscode('');
                  alert('Codice di blocco rimosso');
                }}
                className="text-red-500 text-sm mt-2 hover:underline"
              >
                Rimuovi codice attuale
              </button>
            </div>
          ) : isCreatingGroup ? (
            // ... (keeping existing group creation logic)
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <ArrowLeft className="cursor-pointer" onClick={() => setIsCreatingGroup(false)} />
                <h2 className="font-bold">Nuovo Gruppo</h2>
              </div>
              <input 
                type="text" 
                placeholder="Nome del gruppo" 
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 px-4 outline-none focus:border-telegram-blue"
              />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Aggiungi membri..." 
                  className="w-full bg-white border border-slate-200 rounded-full py-1.5 pl-10 pr-4 text-sm outline-none focus:border-telegram-blue"
                />
              </div>
              
              {selectedUsersForGroup.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsersForGroup.map(u => (
                    <div key={u.id} className="bg-telegram-blue/10 text-telegram-blue px-2 py-1 rounded-full text-xs flex items-center gap-1">
                      {u.name}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => toggleUserForGroup(u)} />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {searchResults.map(u => (
                  <div 
                    key={u.id} 
                    onClick={() => toggleUserForGroup(u)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUsersForGroup.find(user => user.id === u.id) ? 'bg-telegram-blue/10' : 'hover:bg-white'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-telegram-blue flex items-center justify-center text-white font-semibold">
                      {u.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm">{u.name}</h3>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={!!selectedUsersForGroup.find(user => user.id === u.id)}
                      onChange={() => {}} // Controlled by parent div
                      className="rounded border-slate-300 text-telegram-blue focus:ring-telegram-blue"
                    />
                  </div>
                ))}
              </div>

              <button 
                onClick={handleStartGroup}
                disabled={!groupName.trim() || selectedUsersForGroup.length === 0}
                className="bg-telegram-blue text-white py-2 rounded-xl font-semibold disabled:opacity-50 hover:bg-telegram-darkBlue transition-colors mt-auto"
              >
                CREA GRUPPO
              </button>
            </div>
          ) : searchQuery.length >= 2 ? (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">
                  {isCreatingSecretChat ? 'Nuova Chat Segreta' : 'Risultati ricerca'}
                </p>
                {isCreatingSecretChat && (
                  <X className="w-4 h-4 cursor-pointer text-slate-400" onClick={() => setIsCreatingSecretChat(false)} />
                )}
              </div>
              {searchResults.map((u) => (
                <div 
                  key={u.id} 
                  onClick={() => isCreatingSecretChat ? handleStartSecretChat(u.id) : handleStartChat(u.id)}
                  className="flex items-center gap-3 p-3 hover:bg-white rounded-lg cursor-pointer transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-telegram-blue flex items-center justify-center text-white font-semibold">
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate flex items-center gap-1">
                      {isCreatingSecretChat && <Lock className="w-3 h-3 text-green-500" />}
                      {u.name}
                    </h3>
                    <p className="text-sm text-slate-500 truncate">{u.username || u.phone}</p>
                  </div>
                  {isCreatingSecretChat ? <Lock className="w-5 h-5 text-green-500" /> : <UserPlus className="w-5 h-5 text-telegram-blue" />}
                </div>
              ))}
              {isSearching && searchResults.length === 0 && (
                <p className="text-center text-slate-500 mt-4 text-sm">Nessun utente trovato</p>
              )}
            </div>
          ) : (
            <>
              {chats.map((chat) => (
                <div 
                  key={chat.id} 
                  onClick={() => handleChatSelect(chat)}
                  className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                    selectedChat?.id === chat.id ? 'bg-telegram-blue text-white' : 'hover:bg-white'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold ${
                    selectedChat?.id === chat.id ? 'bg-white text-telegram-blue' : 'bg-telegram-blue text-white'
                  }`}>
                    {getChatName(chat).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h3 className="font-semibold truncate flex items-center gap-1">
                        {chat.type === 'SECRET' && <Lock className="w-3 h-3 text-green-500" />}
                        {getChatName(chat)}
                      </h3>
                      <span className={`text-xs ${selectedChat?.id === chat.id ? 'text-blue-100' : 'text-slate-500'}`}>
                        {chat.messages[0] ? new Date(chat.messages[0].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className={`text-sm truncate ${selectedChat?.id === chat.id ? 'text-blue-500' : 'text-slate-500'}`}>
                      {typingUsers[chat.id] ? (
                        <span className="italic">Sta scrivendo...</span>
                      ) : (
                        chat.messages[0]?.text || 'Nessun messaggio'
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {chats.length === 0 && (
                <div className="flex flex-col items-center justify-center mt-20 px-6 text-center">
                  <p className="text-slate-500 text-sm mb-4">Nessuna chat attiva</p>
                  <p className="text-xs text-slate-400">Cerca un utente per iniziare una conversazione</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Chat Window */}
      <div className={`flex-1 flex flex-col bg-white ${
        mobileView === 'chats' ? 'hidden md:flex' : 'flex'
      }`}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <ArrowLeft 
                  className="w-6 h-6 text-slate-500 md:hidden cursor-pointer" 
                  onClick={handleBackToChats}
                />
                <div className="w-10 h-10 rounded-full bg-telegram-blue flex items-center justify-center text-white font-semibold">
                  {selectedChat.type === 'SECRET' ? <Lock className="w-5 h-5" /> : getChatName(selectedChat).charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-sm flex items-center gap-1">
                    {selectedChat.type === 'SECRET' && <Lock className="w-3 h-3 text-green-500" />}
                    {getChatName(selectedChat)}
                  </h3>
                  <p className={`text-xs ${typingUsers[selectedChat.id] ? 'animate-pulse italic' : ''} text-telegram-blue`}>
                    {getStatusText(selectedChat)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-slate-500">
                <Phone className="w-5 h-5 cursor-pointer hover:text-telegram-blue" onClick={() => startCall('voice')} />
                <VideoIcon className="w-5 h-5 cursor-pointer hover:text-telegram-blue" onClick={() => startCall('video')} />
                <Search className="w-5 h-5 cursor-pointer" />
                <MoreVertical className="w-5 h-5 cursor-pointer" />
              </div>
            </div>

            {/* Messages Area */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 bg-[#E7EBF0] ${
              (!user?.allowScreenshots || selectedChat?.type === 'SECRET') ? 'select-none' : ''
            }`}>
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${msg.senderId === user?.id ? 'items-end' : 'items-start'}`}
                >
                  <div className={`rounded-2xl p-3 max-w-[70%] shadow-sm ${
                    msg.senderId === user?.id 
                      ? 'bg-[#EEFFDE] rounded-tr-none' 
                      : 'bg-white rounded-tl-none'
                  }`}>
                    {msg.mediaUrl && (
                      <div className="mb-2">
                        {msg.mediaType === 'IMAGE' ? (
                          <img 
                            src={msg.mediaUrl} 
                            alt="Media" 
                            className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity" 
                            onClick={() => window.open(msg.mediaUrl, '_blank')}
                          />
                        ) : (
                          <a 
                            href={msg.mediaUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-telegram-blue hover:underline"
                          >
                            <Paperclip className="w-4 h-4" />
                            <span className="text-sm truncate">Allegato</span>
                          </a>
                        )}
                      </div>
                    )}
                    {msg.text && <p className="text-sm">{msg.text}</p>}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {msg.expiresAt && (
                        <Clock className="w-3 h-3 text-orange-400 mr-1" />
                      )}
                      <span className="text-[10px] text-slate-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.senderId === user?.id && (
                        msg.isRead ? (
                          <CheckCheck className="w-3 h-3 text-telegram-blue" />
                        ) : (
                          <Check className="w-3 h-3 text-slate-400" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200 flex flex-col gap-2">
              {selfDestructTimer && (
                <div className="flex items-center gap-2 text-xs text-orange-500 font-medium px-2">
                  <Clock className="w-3 h-3" />
                  Autodistruzione tra {selfDestructTimer} secondi
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setSelfDestructTimer(null)} />
                </div>
              )}
              <div className="flex items-center gap-4">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
                <div className="relative">
                  <Clock 
                    className={`w-5 h-5 cursor-pointer ${selfDestructTimer ? 'text-orange-500' : 'text-slate-400'}`}
                    onClick={() => setShowTimerMenu(!showTimerMenu)}
                  />
                  {showTimerMenu && (
                    <div className="absolute bottom-10 left-0 bg-white shadow-xl rounded-lg border border-slate-200 py-2 w-32 z-50">
                      {[5, 10, 30, 60].map(seconds => (
                        <button
                          key={seconds}
                          type="button"
                          onClick={() => {
                            setSelfDestructTimer(seconds);
                            setShowTimerMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                        >
                          {seconds} secondi
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setSelfDestructTimer(null);
                          setShowTimerMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 text-red-500"
                      >
                        Disattiva
                      </button>
                    </div>
                  )}
                </div>
                <Paperclip 
                  className={`text-slate-400 cursor-pointer ${isUploading ? 'animate-pulse' : ''}`} 
                  onClick={() => fileInputRef.current?.click()}
                />
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={message}
                    onChange={handleTyping}
                    placeholder="Scrivi un messaggio..." 
                    className="w-full bg-slate-100 border-none rounded-xl py-2 px-4 text-sm outline-none"
                  />
                  <Smile className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer w-5 h-5" />
                </div>
                <button 
                  type="submit"
                  className="bg-telegram-blue p-2 rounded-full cursor-pointer hover:bg-telegram-darkBlue transition-colors"
                >
                  <Send className="text-white w-5 h-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#E7EBF0]">
            <p className="bg-black/20 text-white px-4 py-1 rounded-full text-sm">Seleziona una chat per iniziare a messaggiare</p>
          </div>
        )}
      </div>

      {/* Call Overlays */}
      {activeCall && !showIncomingCall && (
        <CallModal
          socket={socket!}
          user={user}
          recipient={activeCall.recipient}
          type={activeCall.type}
          onClose={() => setActiveCall(null)}
        />
      )}

      {showIncomingCall && activeCall && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 rounded-full bg-telegram-blue mx-auto flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg">
              {activeCall.recipient.name.charAt(0)}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{activeCall.recipient.name}</h2>
            <p className="text-slate-500 mb-8 mt-1">
              Chiamata {activeCall.type === 'video' ? 'video' : 'vocale'} in arrivo...
            </p>
            <div className="flex justify-center gap-6">
              <button
                onClick={() => {
                  setActiveCall(null);
                  setShowIncomingCall(false);
                  socket?.emit('end_call', { to: activeCall.recipient.id });
                }}
                className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <button
                onClick={() => setShowIncomingCall(false)}
                className="p-4 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors shadow-lg animate-bounce"
              >
                <Phone className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && !showIncomingCall && activeCall.incomingSignal && (
        <CallModal
          socket={socket!}
          user={user}
          recipient={activeCall.recipient}
          type={activeCall.type}
          incomingSignal={activeCall.incomingSignal}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  );
};

export default ChatPage;
