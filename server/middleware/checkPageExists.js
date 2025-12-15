// Check Page Exists Middleware
// Auto-renders [pagename]-page.ejs for matching URLs

const fs = require('fs');
const path = require('path');

module.exports = (req, res, next) => {
  const pageName = req.path === '/' ? 'index-page' : req.path.substring(1) + '-page';
  const filePath = path.join(__dirname, '..', 'views', `${pageName}.ejs`);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return next();
    }
    res.render('layout-main', { 
      template: pageName,
      pageData: {}
    });  
  });
};
