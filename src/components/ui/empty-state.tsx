import React from 'react';
import { Button } from './button';
import { Plus } from 'lucide-react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  icon, 
  title, 
  description, 
  action,
  className = ''
}) => (
  <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
    <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
    <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
    {action && (
      <Button 
        onClick={action.onClick} 
        className="bg-cyan-600 hover:bg-cyan-700"
      >
        {action.icon || <Plus className="w-4 h-4 mr-2" />}
        {action.label}
      </Button>
    )}
  </div>
);
