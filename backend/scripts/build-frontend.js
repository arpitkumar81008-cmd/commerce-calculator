// Builds the frontend and copies the static output into backend/public,
// so the backend can serve the whole app (UI + API) from a single port.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..', '..', 'frontend');
const frontendDist = path.join(frontendDir, 'dist');
const publicDir = path.join(__dirname, '..', 'public');

console.log('Building frontend...');
execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });
execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });

console.log('Copying frontend build into backend/public...');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.cpSync(frontendDist, publicDir, { recursive: true });

console.log('Done. Run "npm start" to serve the full app from this backend.');
