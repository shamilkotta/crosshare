import React, { createContext, useContext, useState, useCallback } from 'react';

export type TransferStatus = 'transferring' | 'completed' | 'error';

export interface FileTransfer {
  id: string;
  name: string;
  size: number; // in bytes
  transferred: number; // in bytes
  status: TransferStatus;
}

export interface UserTransfer {
  id: string;
  name: string;
  deviceName: string;
  files: FileTransfer[];
  status: TransferStatus;
}

export interface TransferSession {
  id: string;
  users: UserTransfer[];
  status: TransferStatus;
}

export interface TransferRequest {
  id: string;
  senderName: string;
  senderDeviceName: string;
  files: { id: string; name: string; size: number }[];
}

interface TransferContextType {
  activeSession: TransferSession | null;
  pendingRequest: TransferRequest | null;
  startSession: (session: TransferSession) => void;
  receiveRequest: (request: TransferRequest) => void;
  respondToRequest: (accept: boolean) => void;
  updateFileProgress: (
    userId: string,
    fileId: string,
    transferred: number
  ) => void;
  cancelSession: () => void;
  completeSession: () => void;
}

const TransferContext = createContext<TransferContextType | undefined>(
  undefined
);

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [activeSession, setActiveSession] = useState<TransferSession | null>(
    null
  );
  const [pendingRequest, setPendingRequest] = useState<TransferRequest | null>(
    null
  );

  const startSession = useCallback((session: TransferSession) => {
    setActiveSession(session);
    setPendingRequest(null);
  }, []);

  const receiveRequest = useCallback((request: TransferRequest) => {
    setPendingRequest(request);
  }, []);

  const respondToRequest = useCallback(
    (accept: boolean) => {
      if (accept && pendingRequest) {
        // In a real app, this would trigger the backend to start receiving
        // For now, we'll just mock starting a session if we were to implement that logic here
        // startSession(...)
      }
      setPendingRequest(null);
    },
    [pendingRequest]
  );

  const updateFileProgress = useCallback(
    (userId: string, fileId: string, transferred: number) => {
      setActiveSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          users: prev.users.map((user) => {
            if (user.id !== userId) return user;
            return {
              ...user,
              files: user.files.map((file) => {
                if (file.id !== fileId) return file;
                const status =
                  transferred >= file.size ? 'completed' : 'transferring';
                return { ...file, transferred, status };
              }),
            };
          }),
        };
      });
    },
    []
  );

  const cancelSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  const completeSession = useCallback(() => {
    // We might want to keep it visible for a bit or just clear it
    setActiveSession(null);
  }, []);

  return (
    <TransferContext.Provider
      value={{
        activeSession,
        pendingRequest,
        startSession,
        receiveRequest,
        respondToRequest,
        updateFileProgress,
        cancelSession,
        completeSession,
      }}
    >
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfer() {
  const context = useContext(TransferContext);
  if (context === undefined) {
    throw new Error('useTransfer must be used within a TransferProvider');
  }
  return context;
}
