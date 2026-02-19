'use server'

import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function createAdminUser() {
  try {
    // Check if admin already exists
    const existing = await prisma.user.findUnique({
      where: { email: 'admin@balisnaptrip.com' },
    })

    if (existing) {
      return { success: true, message: 'Admin user already exists' }
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10)

    const admin = await prisma.user.create({
      data: {
        email: 'admin@balisnaptrip.com',
        name: 'Admin',
        password: hashedPassword,
        role: 'ADMIN',
        emailVerified: new Date(),
      },
    })

    return {
      success: true,
      message: 'Admin user created successfully',
      user: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    }
  } catch (error) {
    console.error('Error creating admin user:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create admin user',
    }
  }
}
