import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const server = createServer((req, res) => {
  // Respond to Render's health checks
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

const port = process.env.PORT || 8080;

server.listen(port, () => {
  console.log(`WebSocket server started on port ${port}`);
});

console.log('WebSocket server started on port 8080');

wss.on('connection', function connection(ws) {
  console.log('A new client connected');

  ws.on('message', function message(data) {
    console.log('received: %s', data);

    // Broadcast the message to all other clients
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.send('Welcome to the shared session!');
});
