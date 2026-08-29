import bcrypt from 'bcryptjs'

// Single source of truth for password hashing cost across signup,
// password change and password reset flows.
const BCRYPT_ROUNDS = 10

export async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS)
  return bcrypt.hash(plainPassword, salt)
}

export async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword ?? '', passwordHash ?? '')
}
