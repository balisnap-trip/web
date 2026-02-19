import { prisma } from '@/lib/db'

export const getUserByEmail = async (email?: string | null) => {
  if (!email) return null
  const user = await prisma.user.findUnique({
    where: { email: email }
  })

  return user
}
