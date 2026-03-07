import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connect, createAirportApi } from './lib/ws-bridge';

const port = new URLSearchParams(window.location.search).get('wsPort');

connect(Number(port)).then(() => {
  window.airport = createAirportApi();
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
});
