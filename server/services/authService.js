const UserDAO = require('./../dao/UserDAO');
let userDAO;

function initialize(pool) {
  userDAO = new UserDAO(pool);
}

async function authenticateUser(username, password) {
  // Use your UserDAO to get the user by username
  const user = await userDAO.getUserByUsername(username);

  // Check if the user exists and the password is correct
  if (user && user.password === password) {
    return user;
  }

  return null;
}

module.exports = {
  initialize,
  authenticateUser
};