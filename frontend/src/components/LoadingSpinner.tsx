import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
};

export default function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div
        className={`${sizeClasses[size]} border-white/20 border-t-stellar-primary rounded-full animate-spin`}
        style={{ borderTopColor: '#3E63DD' }}
        role="status"
        aria-label="Loading"
      />
      {message && (
        <p className="text-white/60 text-sm animate-pulse">{message}</p>
      )}
    </div>
  );
}
