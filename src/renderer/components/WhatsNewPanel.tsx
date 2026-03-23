import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTerminalStore } from '../store/terminal-store';

export function WhatsNewPanel() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const closeChangelog = useTerminalStore((s) => s.closeChangelog);

  useEffect(() => {
    let cancelled = false;
    window.airport.readChangelog().then((text) => {
      if (cancelled) return;
      setContent(text || 'No changelog available.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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
          onClick={closeChangelog}
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
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
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
          Back
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#cba6f7',
          fontSize: 12,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          fontWeight: 600,
        }}>
          <svg width={12} height={12} viewBox="0 0 16 16" fill="#cba6f7">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0114.25 13H8.06l-2.573 2.573A1.458 1.458 0 013 14.543V13H1.75A1.75 1.75 0 010 11.25Zm1.75-.25a.25.25 0 00-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.749.749 0 01.53-.22h6.5a.25.25 0 00.25-.25v-9.5a.25.25 0 00-.25-.25Zm7 2.25v2.5a.75.75 0 01-1.5 0v-2.5a.75.75 0 011.5 0ZM9 9a1 1 0 11-2 0 1 1 0 012 0Z"/>
          </svg>
          What's New
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px 32px',
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#6c7086',
            fontSize: 13,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}>
            Loading...
          </div>
        ) : (
          <div className="plan-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{
                    color: '#cdd6f4',
                    fontSize: 24,
                    fontWeight: 700,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    borderBottom: '1px solid #313244',
                    paddingBottom: 8,
                    marginBottom: 16,
                    marginTop: 0,
                  }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{
                    color: '#cdd6f4',
                    fontSize: 20,
                    fontWeight: 600,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    borderBottom: '1px solid #313244',
                    paddingBottom: 6,
                    marginBottom: 12,
                    marginTop: 24,
                  }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{
                    color: '#cdd6f4',
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    marginBottom: 8,
                    marginTop: 20,
                  }}>{children}</h3>
                ),
                p: ({ children }) => (
                  <p style={{
                    color: '#cdd6f4',
                    fontSize: 14,
                    lineHeight: 1.7,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    marginBottom: 12,
                    marginTop: 0,
                  }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{
                    color: '#cdd6f4',
                    fontSize: 14,
                    lineHeight: 1.7,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    paddingLeft: 24,
                    marginBottom: 12,
                    marginTop: 4,
                  }}>{children}</ul>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: 4 }}>{children}</li>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: '#f9e2af', fontWeight: 600 }}>{children}</strong>
                ),
                code: ({ className, children }) => {
                  const isBlock = className?.startsWith('language-');
                  if (isBlock) {
                    return (
                      <code style={{
                        display: 'block',
                        background: '#11111b',
                        color: '#cdd6f4',
                        padding: 16,
                        borderRadius: 6,
                        fontSize: 13,
                        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                        overflowX: 'auto',
                        lineHeight: 1.5,
                      }}>{children}</code>
                    );
                  }
                  return (
                    <code style={{
                      background: '#313244',
                      color: '#f38ba8',
                      padding: '2px 5px',
                      borderRadius: 3,
                      fontSize: 13,
                      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                    }}>{children}</code>
                  );
                },
                pre: ({ children }) => (
                  <pre style={{
                    background: '#11111b',
                    borderRadius: 6,
                    border: '1px solid #313244',
                    marginBottom: 16,
                    marginTop: 8,
                    overflow: 'hidden',
                  }}>{children}</pre>
                ),
                hr: () => (
                  <hr style={{
                    border: 'none',
                    borderTop: '1px solid #313244',
                    margin: '24px 0',
                  }} />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
