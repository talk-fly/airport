import { useState, useRef, useEffect } from 'react';

interface WorktreePromptProps {
  onSubmit: (taskDescription: string) => void;
  onCancel: () => void;
  error?: string;
  loading?: boolean;
}

export function WorktreePrompt({ onSubmit, onCancel, error, loading }: WorktreePromptProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim() && !loading) {
      e.preventDefault();
      onSubmit(value.trim());
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#181825',
          borderRadius: 12,
          padding: '24px 28px',
          width: 420,
          border: '1px solid #313244',
        }}
      >
        <div style={{ color: '#cdd6f4', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          New Worktree
        </div>
        <div style={{ color: '#a6adc8', fontSize: 12, marginBottom: 12 }}>
          What do you want to work on?
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="fix the login timeout bug"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: '#313244',
            border: '1px solid #45475a',
            borderRadius: 8,
            color: '#cdd6f4',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            opacity: loading ? 0.6 : 1,
          }}
        />
        {error && (
          <div style={{ color: '#f38ba8', fontSize: 12, marginTop: 8 }}>
            {error}
          </div>
        )}
        <div style={{ color: '#585b70', fontSize: 11, marginTop: 10 }}>
          Branch will be created from <span style={{ color: '#a6adc8' }}>staging</span> &middot; Press Enter to create, Esc to cancel
        </div>
      </div>
    </div>
  );
}
