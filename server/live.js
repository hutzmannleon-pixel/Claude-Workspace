// Live-Aktualisierung per Server-Sent Events.
// Die Clients bekommen nur „es hat sich etwas geändert“ und laden ihre eigenen Daten neu –
// über den Kanal selbst fließen keine personenbezogenen Daten.
const clients = new Set();
let version = 0, timer = null;

export const live = {
  attach(res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\nevent: change\ndata: ${version}\n\n`);
    clients.add(res);
    res.on('close', () => clients.delete(res));
  },
  bump() {
    version++;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      for (const c of clients) c.write(`event: change\ndata: ${version}\n\n`);
    }, 40);
  }
};

setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000).unref();
