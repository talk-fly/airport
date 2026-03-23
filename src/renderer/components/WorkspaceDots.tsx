import { useState, useRef, useEffect } from 'react';
import { useTerminalStore } from '../store/terminal-store';

export function WorkspaceDots() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, renameWorkspace, setWorkspaceFolder } = useTerminalStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const handleSetFolder = async () => {
    const folder = await window.airport.pickFolder();
    if (folder) {
      setWorkspaceFolder(activeWorkspaceId, folder);
    }
  };

  const handleClearFolder = () => {
    setWorkspaceFolder(activeWorkspaceId, undefined);
  };

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && activeWorkspace) {
      renameWorkspace(activeWorkspaceId, trimmed);
    }
    setEditing(false);
  };

  const startEditing = () => {
    if (activeWorkspace) {
      setDraft(activeWorkspace.name);
      setEditing(true);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '10px 8px 4px',
      gap: 4,
      flexShrink: 0,
    }}>
      {/* Dot indicators */}
      <div style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            style={{
              width: ws.id === activeWorkspaceId ? 8 : 6,
              height: ws.id === activeWorkspaceId ? 8 : 6,
              borderRadius: '50%',
              background: ws.id === activeWorkspaceId ? '#cdd6f4' : '#585b70',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              opacity: ws.id === activeWorkspaceId ? 1 : 0.6,
            }}
          />
        ))}
      </div>

      {/* Workspace name */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#cdd6f4',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            background: '#313244',
            border: '1px solid #585b70',
            borderRadius: 3,
            outline: 'none',
            padding: '1px 6px',
            textAlign: 'center',
            width: 120,
          }}
        />
      ) : (
        <span
          onDoubleClick={startEditing}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#6c7086',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            cursor: 'default',
            userSelect: 'none',
          }}
        >
          {activeWorkspace?.name || 'Workspace'}
        </span>
      )}

      {/* Folder indicator */}
      {activeWorkspace?.folderPath ? (
        <span
          onClick={handleSetFolder}
          onContextMenu={(e) => { e.preventDefault(); handleClearFolder(); }}
          style={{
            fontSize: 10,
            color: '#585b70',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            cursor: 'pointer',
            userSelect: 'none',
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${activeWorkspace.folderPath}\nClick to change, right-click to clear`}
        >
          {activeWorkspace.folderPath.split('/').pop()}
        </span>
      ) : (
        <span
          onClick={handleSetFolder}
          style={{
            fontSize: 10,
            color: '#45475a',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title="Set workspace folder"
        >
          + folder
        </span>
      )}
    </div>
  );
}
