import { useState, useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine, placeholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { useTerminalStore } from '../store/terminal-store';

interface EditorPanelProps {
  sessionId: string;
  filePath: string;
}

export function EditorPanel({ sessionId, filePath }: EditorPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const closeEditor = useTerminalStore((s) => s.closeEditor);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    await window.airport.submitEditor(sessionId, content);
    closeEditor();
  }, [sessionId, closeEditor]);

  const handleCancel = useCallback(async () => {
    await window.airport.cancelEditor(sessionId);
    closeEditor();
  }, [sessionId, closeEditor]);

  useEffect(() => {
    let cancelled = false;

    window.airport.readEditorFile(filePath).then((text) => {
      if (cancelled || !editorRef.current) return;

      if (text === null || text === undefined) {
        setError(true);
        setLoading(false);
        return;
      }

      const submitKeymap = keymap.of([{
        key: 'Mod-Enter',
        run: () => {
          handleSubmit();
          return true;
        },
      }, {
        key: 'Escape',
        run: () => {
          handleCancel();
          return true;
        },
      }]);

      const state = EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          markdown(),
          oneDark,
          placeholder('Type your prompt here...'),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          submitKeymap,
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '14px',
            },
            '.cm-scroller': {
              fontFamily: 'Menlo, Monaco, "Courier New", monospace',
              padding: '8px 0',
            },
            '.cm-content': {
              caretColor: '#cdd6f4',
            },
            '.cm-gutters': {
              background: '#181825',
              borderRight: '1px solid #313244',
            },
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
      });

      viewRef.current = view;
      setLoading(false);

      // Auto-focus and place cursor at end
      view.focus();
      view.dispatch({
        selection: { anchor: view.state.doc.length },
      });
    });

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [filePath, handleSubmit, handleCancel]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      background: '#1e1e2e',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: '#181825',
        borderBottom: '1px solid #313244',
        flexShrink: 0,
      }}>
        <button
          onClick={handleCancel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: '1px solid #45475a',
            borderRadius: 6,
            padding: '4px 10px',
            cursor: 'pointer',
            color: '#cdd6f4',
            fontSize: 12,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#313244';
            e.currentTarget.style.borderColor = '#585b70';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.borderColor = '#45475a';
          }}
        >
          <svg width={12} height={12} viewBox="0 0 16 16" fill="#cdd6f4">
            <path d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.751.751 0 011.042.018.751.751 0 01.018 1.042L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06Z"/>
          </svg>
          Back to Terminal
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#a6e3a1',
          fontSize: 12,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontWeight: 600,
        }}>
          <svg width={12} height={12} viewBox="0 0 16 16" fill="#a6e3a1">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25Zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25ZM3.5 9.75a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75Zm.75-5.25a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5Z"/>
          </svg>
          Editor
        </div>

        <div style={{ flex: 1 }} />

        <span style={{
          fontSize: 11,
          color: '#6c7086',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
          {navigator.userAgent.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to submit &middot; Esc to cancel
        </span>

        <button
          onClick={handleSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#a6e3a1',
            border: 'none',
            borderRadius: 6,
            padding: '5px 14px',
            cursor: 'pointer',
            color: '#1e1e2e',
            fontSize: 12,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontWeight: 600,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.85';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          Submit
        </button>
      </div>

      {/* Editor area */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#6c7086',
            fontSize: 13,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}>
            Loading editor...
          </div>
        ) : error ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#f38ba8',
            fontSize: 13,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}>
            Could not read file.
          </div>
        ) : null}
        <div
          ref={editorRef}
          style={{
            height: '100%',
            display: loading || error ? 'none' : 'block',
          }}
        />
      </div>
    </div>
  );
}
