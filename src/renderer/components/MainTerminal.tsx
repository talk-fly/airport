import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { SearchAddon } from '@xterm/addon-search';
import { terminalTheme } from '../lib/theme';
import { serializeShadowBuffer } from '../lib/terminal-factory';
import { BidiOverlay } from '../lib/bidi-overlay';
import { TerminalSearchBar } from './TerminalSearchBar';
import '@xterm/xterm/css/xterm.css';

interface MainTerminalProps {
  sessionId: string;
  onDimensions: (cols: number, rows: number) => void;
}

export function MainTerminal({ sessionId, onDimensions }: MainTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const handleResize = useCallback(() => {
    if (fitRef.current && termRef.current) {
      fitRef.current.fit();
      onDimensions(termRef.current.cols, termRef.current.rows);
    }
  }, [onDimensions]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: terminalTheme,
      allowProposedApi: true,
      scrollback: 5000,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
    });

    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(serializeAddon);
    term.loadAddon(searchAddon);
    searchRef.current = searchAddon;

    term.open(containerRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available, fall back to canvas renderer
    }

    // Let Ctrl+Tab bubble to the window handler
    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === 'Tab') return false;
      // Let Cmd+F / Cmd+G / Cmd+Shift+G bubble for terminal search
      const isMod = navigator.userAgent.includes('Windows') ? e.ctrlKey : e.metaKey;
      if (isMod && (e.key === 'f' || e.key === 'g')) return false;
      // On Windows, let Ctrl+<key> shortcuts bubble to window handler
      if (navigator.userAgent.includes('Windows') && e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (['t', 'w', 'j', 'k', '[', ']', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
          return false;
        }
      }
      // Cmd+Enter → newline (same as Enter)
      if (e.metaKey && e.key === 'Enter' && e.type === 'keydown') {
        window.airport.pty.write(sessionId, '\r');
        return false;
      }
      return true;
    });

    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    // Restore buffer from shadow terminal
    const savedBuffer = serializeShadowBuffer(sessionId);
    if (savedBuffer) {
      term.write(savedBuffer);
    }

    // BiDi overlay for RTL (Hebrew/Arabic) rendering
    const bidiOverlay = new BidiOverlay(term, containerRef.current);

    onDimensions(term.cols, term.rows);
    term.focus();

    // Forward input to PTY
    const dataDisposable = term.onData((data) => {
      window.airport.pty.write(sessionId, data);
    });

    // Receive PTY output
    const unsubData = window.airport.pty.onData(({ sessionId: sid, data }) => {
      if (sid === sessionId) {
        term.write(data);
      }
    });

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      bidiOverlay.dispose();
      dataDisposable.dispose();
      unsubData();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [sessionId]);

  // Cmd+F to toggle search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = navigator.userAgent.includes('Windows') ? e.ctrlKey : e.metaKey;
      if (isMod && e.key === 'f') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {showSearch && (
        <TerminalSearchBar
          searchAddon={searchRef.current}
          onClose={() => {
            setShowSearch(false);
            termRef.current?.focus();
          }}
        />
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          padding: '4px',
        }}
      />
    </div>
  );
}
