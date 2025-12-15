const argon2 = require('argon2');
const UserDAO = require('../dao/UserDAO');

let userDAO;

function initialize(pool) {
  userDAO = new UserDAO(pool);
}

async function authenticateUser(email, password) {
  // Try email first, then username
  let user = await userDAO.getUserByEmail(email);
  if (!user) {
    user = await userDAO.getUserByUsername(email);
  }  
  
  // Constant-time comparison to prevent timing attacks
  if (!user) {
    await argon2.hash('dummy-password-to-maintain-timing');
    return null;
  }
  
  // Check user status - block inactive users
  if (user.status !== 'active') {
    return null;
  }
  
  if (await argon2.verify(user.password, password)) {
    return user;
  }

  return null;
}

async function createUser(username, password, email) {
  const hashedPassword = await argon2.hash(password);
  return userDAO.addUser({ username, password: hashedPassword, email });
}

async function updateUser(id, { username, password, email }) {
  const hashedPassword = password ? await argon2.hash(password) : undefined;
  return userDAO.updateUser({ id, username, password: hashedPassword, email });
}

async function registerUser(username, password, email) {
  const userByUsername = await userDAO.getUserByUsername(username);
  const userByEmail = await userDAO.getUserByEmail(email);
  
  if (userByUsername || userByEmail) {
    throw new Error('Registration failed. An account with these credentials may already exist.');
  }
  
  const userId = await createUser(username, password, email);
  
  return { 
    message: 'User registered successfully', 
    userId 
  };
}

module.exports = {
  initialize,
  authenticateUser,
  registerUser,
  createUser,
  updateUser,
};
