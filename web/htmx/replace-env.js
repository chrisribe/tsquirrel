// web/replace-env.js
const fs = require('fs');
const path = require('path');

const filePaths = [
  path.join(__dirname, 'index.html'),
];
const envVars = [
  {placeholder: '%%PUBLIC_API_URL%%', value: process.env.PUBLIC_API_URL},
];

filePaths.forEach((filePath) => {
  console.log('Replacing environment variables in:', filePath);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading index.html:', err);
      return;
    }

    envVars.forEach((envVar) => {
      data = data.replace(new RegExp(envVar.placeholder, 'g'), envVar.value);
    });

    fs.writeFile(filePath, data, 'utf8', (err) => {
      if (err) {
        console.error('Error writing index.html:', err);
      } else {
        console.log('Environment variables replaced successfully.');
      }
    });
  });
});
