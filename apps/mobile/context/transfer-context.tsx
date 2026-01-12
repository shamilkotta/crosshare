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

interface TransferContextType {
  activeSession: TransferSession | null;
  startSession: (session: TransferSession) => void;
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

  const startSession = useCallback((session: TransferSession) => {
    setActiveSession(session);
  }, []);

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
        startSession,
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
