const argon2 = require('argon2');
const UserDAO = require('./../dao/UserDAO');
let userDAO;

function initialize(pool) {
  userDAO = new UserDAO(pool);
}

async function authenticateUser(email, password) {
  // Use your UserDAO to get the user by username
  let user = await userDAO.getUserByEmail(email);
  // If not found by email, try username
  if (!user) {
    user = await userDAO.getUserByUsername(email);
  }  
  // Check if the user exists and the password is correct
  if (user && await argon2.verify(user.password, password)) {
    return user;
  }

  return null;
}

async function registerUser(username, password, email) {
  // Check if the user already exists
  const userByUsername = await userDAO.getUserByUsername(username);
  const userByEmail = await userDAO.getUserByEmail(email);
  if (userByUsername !== undefined || userByEmail !== undefined) {
    let error = new Error('Username or email is already taken');
    error.fields = [
      {id: 'username'}, {id: 'email'}
    ];
    throw error;
  }
  
  // Hash the password with argon2
  const hashedPassword = await argon2.hash(password);
  console.log(hashedPassword);
  const userId = await userDAO.addUser({ 
    username,
    password: hashedPassword,
    email 
  });
  return { 
    message: 'User registered successfully', 
    userId 
  };
}

module.exports = {
  initialize,
  authenticateUser,
  registerUser,
};