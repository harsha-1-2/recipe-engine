import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'recipe-to-cart-dev-secret-change-in-prod';
const JWT_EXPIRES = '30d';

// Simple SHA-256 + salt password hashing (no bcrypt dependency needed)
function hashPassword(password: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  // stored format: "salt:hash"
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return hashPassword(password, salt) === hash;
}

function makeHash(password: string): string {
  const salt = generateSalt();
  return `${salt}:${hashPassword(password, salt)}`;
}

export function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}

export async function registerUser(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');

  const passwordHash = makeHash(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name || null },
    select: { id: true, email: true, name: true, dietTypePref: true, budget: true, familySize: true, defaultPriceTier: true }
  });
  const token = signToken(user.id, user.email);
  return { user, token };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true, dietTypePref: true, budget: true, familySize: true, defaultPriceTier: true }
  });
  if (!user) throw new Error('Invalid email or password');
  if (!verifyPassword(password, user.passwordHash)) throw new Error('Invalid email or password');

  const { passwordHash: _, ...safeUser } = user;
  const token = signToken(user.id, user.email);
  return { user: safeUser, token };
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, dietTypePref: true, budget: true,
      familySize: true, defaultPriceTier: true, createdAt: true,
      ingredientPrefs: { include: { ingredient: { select: { id: true, canonicalName: true, category: true } } } },
      brandPrefs: true,
    }
  });
  if (!user) throw new Error('User not found');
  return user;
}

export async function updateUserProfile(userId: string, data: {
  name?: string; budget?: number; familySize?: number;
  dietTypePref?: string; defaultPriceTier?: string;
}) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.budget !== undefined ? { budget: data.budget } : {}),
      ...(data.familySize !== undefined ? { familySize: data.familySize } : {}),
      ...(data.dietTypePref ? { dietTypePref: data.dietTypePref as any } : {}),
      ...(data.defaultPriceTier ? { defaultPriceTier: data.defaultPriceTier as any } : {}),
    },
    select: { id: true, email: true, name: true, dietTypePref: true, budget: true, familySize: true, defaultPriceTier: true }
  });
  return updated;
}
