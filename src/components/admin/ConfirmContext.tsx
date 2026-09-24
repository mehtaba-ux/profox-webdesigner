import React, { createContext, useContext, ReactNode } from 'react';
import { useConfirm, ConfirmState } from './useConfirm';
import { ConfirmDialog } from './ConfirmDialog';

interface ConfirmContextType {
  confirm: (title: string, message: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm();

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirmContext() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirmContext must be used within a ConfirmProvider');
  }
  return context;
}
