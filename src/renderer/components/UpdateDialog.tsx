import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UpdateCheckResult } from '../../shared/types';

interface UpdateDialogProps {
  onClose: () => void;
}

type Status = 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error';

export function UpdateDialog({ onClose }: UpdateDialogProps) {
  const [status, setStatus] = useState<Status>('checking');
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.airport.checkForUpdates().then((r) => {
      setResult(r);
      setStatus(r.available ? 'available' : 'up-to-date');
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
      setStatus('error');
    });
  }, []);

  const handleInstall = async () => {
    if (!result?.downloadUrl) return;
    setStatus('downloading');
    try {
      await window.airport.installUpdate(result.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setStatus('error');
    }
  };

  return (
    <div
      onClick={onClose}
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
          width: 480,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #313244',
        }}
      >
        {status === 'checking' && (
          <div style={{ color: '#cdd6f4', fontSize: 14, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', textAlign: 'center', padding: '20px 0' }}>
            Checking for updates…
          </div>
        )}

        {status === 'up-to-date' && (
          <>
            <div style={{ color: '#a6e3a1', fontSize: 14, fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginBottom: 8 }}>
              You're up to date
            </div>
            <div style={{ color: '#a6adc8', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginBottom: 20 }}>
              Airport v{result?.currentVersion} is the latest version.
            </div>
            <button onClick={onClose} style={buttonStyle('#313244', '#cdd6f4')}>
              OK
            </button>
          </>
        )}

        {status === 'available' && result && (
          <>
            <div style={{ color: '#cdd6f4', fontSize: 14, fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginBottom: 4 }}>
              Update Available
            </div>
            <div style={{ color: '#a6adc8', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginBottom: 16 }}>
              v{result.currentVersion} → v{result.latestVersion}
            </div>
            {result.changelog && (
              <div style={{
                flex: 1,
                overflow: 'auto',
                marginBottom: 16,
                padding: '12px 16px',
                background: '#11111b',
                borderRadius: 8,
                border: '1px solid #313244',
              }}>
                <div className="plan-markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ children }) => (
                        <h2 style={{ color: '#cdd6f4', fontSize: 16, fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginTop: 0, marginBottom: 8 }}>{children}</h2>
                      ),
                      ul: ({ children }) => (
                        <ul style={{ color: '#cdd6f4', fontSize: 13, lineHeight: 1.7, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', paddingLeft: 20, margin: '4px 0' }}>{children}</ul>
                      ),
                      li: ({ children }) => (
                        <li style={{ marginBottom: 2 }}>{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong style={{ color: '#f9e2af', fontWeight: 600 }}>{children}</strong>
                      ),
                      p: ({ children }) => (
                        <p style={{ color: '#cdd6f4', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', margin: '4px 0' }}>{children}</p>
                      ),
                    }}
                  >
                    {result.changelog}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={buttonStyle('#313244', '#cdd6f4')}>
                Later
              </button>
              <button
                onClick={handleInstall}
                disabled={!result.downloadUrl}
                style={buttonStyle('#cba6f7', '#11111b')}
              >
                Update Now
              </button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <div style={{ color: '#cdd6f4', fontSize: 14, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', textAlign: 'center', padding: '20px 0' }}>
            Downloading and installing update…
          </div>
        )}

        {status === 'error' && (
          <>
            <div style={{ color: '#f38ba8', fontSize: 14, fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginBottom: 8 }}>
              Update Error
            </div>
            <div style={{ color: '#a6adc8', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', marginBottom: 20 }}>
              {error}
            </div>
            <button onClick={onClose} style={buttonStyle('#313244', '#cdd6f4')}>
              OK
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function buttonStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 16px',
    background: bg,
    color,
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    cursor: 'pointer',
  };
}
