#!/usr/bin/env node
/**
 * Create Application Owner Account
 * Creates a user account with admin privileges for managing the app.
 * This is YOUR account to create galleries, not a system admin.
 * 
 * Run: npm run create-admin
 * Or:  docker-compose exec server npm run create-admin
 */

const readline = require('readline');
const { Pool } = require('pg');
const argon2 = require('argon2');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('\n=== Create Your Account ===\n');
  console.log('This creates your personal account to manage galleries.\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Check if admin already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    
    if (existing.rows.length > 0) {
      const overwrite = await prompt('An account already exists. Create another? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Cancelled.');
        process.exit(0);
      }
    }
    
    // Get admin details
    const username = await prompt('Username: ');
    const email = await prompt('Email: ');
    const password = await prompt('Password (min 8 chars): ');
    
    // Validate
    if (!username || username.length < 3) {
      console.error('Error: Username must be at least 3 characters');
      process.exit(1);
    }
    if (!email || !email.includes('@')) {
      console.error('Error: Invalid email');
      process.exit(1);
    }
    if (!password || password.length < 8) {
      console.error('Error: Password must be at least 8 characters');
      process.exit(1);
    }
    
    // Hash password and create user
    const hashedPassword = await argon2.hash(password);
    
    await pool.query(
      `INSERT INTO users (username, email, password, role, status) 
       VALUES ($1, $2, $3, 'admin', 'active')`,
      [username, email, hashedPassword]
    );
    
    console.log(`\n✓ Account '${username}' created! You can now sign in.\n`);
    
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      console.error('Error: Username or email already exists');
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
