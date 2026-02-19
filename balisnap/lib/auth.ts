import type { AuthOptions } from 'next-auth'

import GoogleProvider from 'next-auth/providers/google'
import FacebookProvider from 'next-auth/providers/facebook'
import EmailProvider from 'next-auth/providers/email'
import { PrismaAdapter } from '@next-auth/prisma-adapter'

import { prisma } from './db'
import { sendVerificationRequest } from './utils/send-verification-email/sendVerificationEmail'
import { getUserByEmail } from './utils/get-user/getUser'

export const authOptions: AuthOptions = {
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60
  },
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  debug: true,
  callbacks: {
    async signIn({ user, account }) {
      console.log('Signing in user:', user)
      console.log('Account information:', account)

      if (!account) {
        console.error('Account information is missing.')
        return false // Fail login if account info is missing
      }

      // Cek apakah pengguna sudah ada berdasarkan email
      const existingUser = await getUserByEmail(user.email)
      console.log('Existing user:', existingUser)

      // Jika pengguna tidak ada, buat pengguna baru dan hubungkan akunnya
      if (!existingUser) {
        const newUser = await prisma.user.create({
          data: {
            email: user.email,
            name: user.name || null, // Simpan nama dari OAuth
            image: user.image || null // Simpan gambar dari OAuth
          }
        })
        console.log('New user created:', newUser)

        // Hubungkan akun OAuth dengan pengguna baru
        await linkAccount(newUser.id, account)
        console.log('New account linked to user.')

        return true // Izinkan login setelah membuat pengguna baru dan menghubungkan
      }

      // Jika pengguna ada, cek apakah akun sudah terhubung
      const provider = account.provider
      const existingAccount = await getAccountByProviderId(
        existingUser.id,
        provider
      )

      if (existingAccount) {
        console.log('User logged in successfully with existing account.')
        return true // Izinkan login jika akun sudah terhubung
      } else {
        // Jika akun tidak terhubung, link akun tersebut
        await linkAccount(existingUser.id, account)
        console.log('Account linked successfully.')

        // Update gambar dan nama pengguna jika tersedia
        if (user.image || user.name) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              image: user.image || existingUser.image, // Update gambar jika baru
              name: user.name || existingUser.name // Update nama jika baru
            }
          })
          console.log('User image and/or name updated successfully.')
        }

        return true // Izinkan login setelah menghubungkan
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }

      return token
    },
    async session({ session, user }) {
      if (session && session.user) {
        session.user = user
      }

      return session
    }
  },
  pages: {
    signIn: '/auth/login',
    verifyRequest: '/auth/verify-request'
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code'
        }
      }
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID as string,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string,
      profile: (profile) => {
        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          image: profile.picture.data.url
        }
      }
    }),
    EmailProvider({
      server: {
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 465,
        secure: false,
        auth: {
          user: process.env.MAIL_USERNAME,
          pass: process.env.MAIL_PASSWORD
        }
      },
      from: `${process.env.MAIL_SENDER_NAME} <${process.env.MAIL_SENDER}>`,
      sendVerificationRequest
    })
  ]
}

const getAccountByProviderId = async (userId: string, provider: string) => {
  return await prisma.account.findFirst({
    where: {
      userId: userId,
      provider: provider
    }
  })
}

const linkAccount = async (userId: string, account: any) => {
  await prisma.account.create({
    data: {
      userId: userId,
      type: 'oauth',
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: account.refresh_token,
      access_token: account.access_token,
      expires_at: account.expires_at,
      token_type: account.token_type,
      scope: account.scope,
      id_token: account.id_token,
      session_state: account.session_state
    }
  })
}
