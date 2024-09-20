const bcrypt = require('bcrypt');
const UserDAO = require('./../dao/UserDAO');
let userDAO;

function initialize(pool) {
  userDAO = new UserDAO(pool);
}

async function authenticateUser(username, password) {
  // Use your UserDAO to get the user by username
  const user = await userDAO.getUserByUsername(username);

  // Check if the user exists and the password is correct
  if (user && await bcrypt.compare(password, user.password)) {
    return user;
  }

  return null;
}

async function registerUser(username, password, email) {
  // Check if the user already exists
  const existingUser = await userDAO.getUserByUsername(username);
  if (existingUser) {
    throw new Error('User already exists');
  }
  // Hash the password with a salt
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Add the new user to the database
  await userDAO.addUser({ username, hashedPassword, email });
  return { message: 'User registered successfully' };
}

module.exports = {
  initialize,
  authenticateUser,
  registerUser,
};