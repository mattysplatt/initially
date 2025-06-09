// server.mjs
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World!\n');
});

// starts a simple http server locally on port 3000
server.listen(3000, '127.0.0.1', () => {
  console.log('Listening on 127.0.0.1:3000');
});

// run with `node server.mjs`
const fs = require('fs');
const data = fs.readFileSync('initials_db.js', 'utf8');
const answerRegex = /answer:\s*"([^"]+)"/g;
const answers = {};
let match;
while ((match = answerRegex.exec(data)) !== null) {
  const name = match[1];
  answers[name] = (answers[name] || 0) + 1;
}
for (const [name, count] of Object.entries(answers)) {
  if (count > 1) {
    console.log(`Duplicate: ${name} (${count} times)`);
  }
}
