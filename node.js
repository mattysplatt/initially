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
