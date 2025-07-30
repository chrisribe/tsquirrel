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
  
  // Always hash the password even if user doesn't exist
  // This prevents timing attacks that could reveal valid usernames
  if (!user) {
    // Hash a dummy password to maintain consistent timing
    await argon2.hash('dummy-password-to-maintain-timing');
    return null;
  }
  
  // Check if the password is correct
  if (await argon2.verify(user.password, password)) {
    return user;
  }

  return null;
}

async function registerUser(username, password, email) {
  // Check if the user already exists
  const userByUsername = await userDAO.getUserByUsername(username);
  const userByEmail = await userDAO.getUserByEmail(email);
  
  if (userByUsername !== undefined || userByEmail !== undefined) {
    // Generic error - don't reveal which specific field is taken
    let error = new Error('Registration failed. An account with these credentials may already exist.');
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