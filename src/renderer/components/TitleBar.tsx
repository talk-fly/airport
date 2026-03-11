export function TitleBar() {
  return (
    <div
      className="titlebar-drag"
      style={{
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#181825',
        borderBottom: '1px solid #313244',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#7f849c',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          letterSpacing: '0.02em',
        }}
      >
        Airport
      </span>
    </div>
  );
}
