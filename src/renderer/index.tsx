import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connect, createAirportApi } from './lib/ws-bridge';

const params = new URLSearchParams(window.location.search);
const wsPort = params.get('wsPort');
const port = wsPort ? Number(wsPort) : Number(window.location.port);

connect(port).then(() => {
  window.airport = createAirportApi();
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
});
