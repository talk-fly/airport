import { useEffect, useRef, useCallback, useState } from 'react';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalSearchBarProps {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

const searchDecorations = {
  matchBackground: '#b4befe44',
  matchBorder: '#b4befe',
  matchOverviewRuler: '#b4befe',
  activeMatchBackground: '#f9e2afaa',
  activeMatchBorder: '#f9e2af',
  activeMatchOverviewRuler: '#f9e2af',
};

export function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState<{ resultIndex: number; resultCount: number } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!searchAddon) return;
    const disposable = searchAddon.onDidChangeResults((e) => {
      setMatchCount(e);
    });
    return () => disposable.dispose();
  }, [searchAddon]);

  const findNext = useCallback(() => {
    if (searchAddon && query) {
      searchAddon.findNext(query, { incremental: false, decorations: searchDecorations });
    }
  }, [searchAddon, query]);

  const findPrevious = useCallback(() => {
    if (searchAddon && query) {
      searchAddon.findPrevious(query, { decorations: searchDecorations });
    }
  }, [searchAddon, query]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (searchAddon && val) {
      searchAddon.findNext(val, { incremental: true, decorations: searchDecorations });
    } else if (searchAddon) {
      searchAddon.clearDecorations();
      setMatchCount(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      searchAddon?.clearDecorations();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrevious();
      } else {
        findNext();
      }
    }
  };

  // Expose findNext/findPrevious for external keyboard shortcuts (Cmd+G)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = navigator.userAgent.includes('Windows') ? e.ctrlKey : e.metaKey;
      if (isMod && e.key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          findPrevious();
        } else {
          findNext();
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [findNext, findPrevious]);

  const matchLabel =
    matchCount && matchCount.resultCount > 0
      ? `${matchCount.resultIndex + 1} of ${matchCount.resultCount}`
      : query
        ? 'No results'
        : '';

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 20,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        background: '#1e1e2e',
        border: '1px solid #313244',
        borderTop: 'none',
        borderRadius: '0 0 6px 6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Find…"
        style={{
          background: '#181825',
          color: '#cdd6f4',
          border: '1px solid #313244',
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: 13,
          width: 200,
          outline: 'none',
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
        }}
      />
      <span
        style={{
          color: '#6c7086',
          fontSize: 11,
          minWidth: 60,
          textAlign: 'center',
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
        }}
      >
        {matchLabel}
      </span>
      <button onClick={findPrevious} title="Previous (Shift+Enter)" style={btnStyle}>
        ▲
      </button>
      <button onClick={findNext} title="Next (Enter)" style={btnStyle}>
        ▼
      </button>
      <button
        onClick={() => { searchAddon?.clearDecorations(); onClose(); }}
        title="Close (Esc)"
        style={btnStyle}
      >
        ✕
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6c7086',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 6px',
  borderRadius: 3,
  lineHeight: 1,
};
