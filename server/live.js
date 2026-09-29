// Live-Aktualisierung per Server-Sent Events.
// Die Clients bekommen nur „es hat sich etwas geändert“ und laden ihre eigenen Daten neu –
// über den Kanal selbst fließen keine personenbezogenen Daten.
const clients = new Set();
const perIp = new Map();
const MAX_TOTAL = 5000, MAX_PER_IP = 30;
let version = 0, timer = null;

export const live = {
  canAttach(ip) { return clients.size < MAX_TOTAL && (perIp.get(ip) || 0) < MAX_PER_IP; },
  attach(res, ip = '') {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\nevent: change\ndata: ${version}\n\n`);
    clients.add(res);
    res.on('close', () => {
      clients.delete(res);
      const n = (perIp.get(ip) || 1) - 1;
      if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
    });
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
