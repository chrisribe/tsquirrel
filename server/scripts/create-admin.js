#!/usr/bin/env node
/**
 * Create or Reset Admin Account
 * Creates a user account with admin privileges, or resets password if exists.
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
  console.log('\n=== Create or Reset Admin Account ===\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
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
    
    // Hash password
    const hashedPassword = await argon2.hash(password);
    
    // Try to update existing user first, otherwise insert
    const result = await pool.query(
      `INSERT INTO users (username, email, password, role, status) 
       VALUES ($1, $2, $3, 'admin', 'active')
       ON CONFLICT (username) DO UPDATE SET 
         password = $3,
         email = $2,
         role = 'admin',
         status = 'active'
       RETURNING (xmax = 0) AS inserted`,
      [username, email, hashedPassword]
    );
    
    const wasInserted = result.rows[0].inserted;
    
    if (wasInserted) {
      console.log(`\n✓ Account '${username}' created!\n`);
    } else {
      console.log(`\n✓ Account '${username}' password reset!\n`);
    }
    
  } catch (err) {
    if (err.code === '23505') { // Unique violation (email)
      console.error('Error: Email already used by another account');
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
