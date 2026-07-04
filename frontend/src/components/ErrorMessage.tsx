import React from 'react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorMessage({ message, onRetry, onDismiss }: ErrorMessageProps) {
  return (
    <div
      className="card border-red-500/30 bg-red-500/10 flex flex-col gap-3"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-xl flex-shrink-0" aria-hidden="true">
          ⚠️
        </span>
        <div className="flex-1">
          <h4 className="font-semibold text-red-400 text-sm mb-1">Error</h4>
          <p className="text-white/80 text-sm">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary text-sm self-end"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
