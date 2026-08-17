import React from 'react';
import { useConfirmContext } from './ConfirmContext';

interface ConfirmButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  confirmTitle?: string;
  confirmMessage?: string;
  onConfirm?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  // If true, no confirmation is shown (e.g. for purely visual/safe buttons if we decide to skip some)
  noConfirm?: boolean;
}

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({ 
  children, 
  onClick, 
  onConfirm,
  confirmTitle = "Confirm Action", 
  confirmMessage = "Are you sure you want to perform this action? This will update the site data.",
  noConfirm = false,
  ...props 
}) => {
  const { confirm } = useConfirmContext();

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // If noConfirm is true, skip confirmation
    if (noConfirm) {
      onClick?.(e);
      onConfirm?.(e);
      return;
    }

    // Default message if not provided
    const message = confirmMessage || "Are you sure you want to perform this action?";
    
    if (await confirm(confirmTitle, message)) {
      onClick?.(e);
      onConfirm?.(e);
    }
  };

  return (
    <button {...props} onClick={handleClick}>
      {children}
    </button>
  );
};
