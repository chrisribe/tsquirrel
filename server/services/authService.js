const argon2 = require('argon2');
const UserDAO = require('./../dao/UserDAO');
let userDAO;

function initialize(pool) {
  userDAO = new UserDAO(pool);
}

async function authenticateUser(username, password) {
  // Use your UserDAO to get the user by username
  const user = await userDAO.getUserByUsername(username);

  // Check if the user exists and the password is correct
  if (user && await argon2.verify(user.password, password)) {
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
  
  // Hash the password with argon2
  const hashedPassword = await argon2.hash(password);
  
    // Add the new user to the database
  await userDAO.addUser({ 
    username,
    password: hashedPassword,
    email 
  });
  return { message: 'User registered successfully' };
}

module.exports = {
  initialize,
  authenticateUser,
  registerUser,
};