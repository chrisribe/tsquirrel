const fs = require('fs');
const path = require('path');

const checkPageExists = (req, res, next) => {
  const pageName = req.path === '/' ? 'index-page' : req.path.substring(1) + '-page';
  const filePath = path.join(__dirname, '..', 'views', `${pageName}.ejs`);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return next(); // If the file doesn't exist, move to the next middleware
    }
    //res.render(page); // If the file exists, render the page
    res.render('layout-main', { 
      pageName: pageName,
      pageData: {}, // Provide a default empty object
    });  
  });
};

module.exports = checkPageExists;